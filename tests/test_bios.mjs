// test_bios.mjs —— 验证 BIOS 设置：纯逻辑 + 项目文件持久化 + 两级菜单交互
// 存储改为「项目文件」System/Settings/bios.json（经 VFS），不再是 localStorage。
// showSetup(vfs) 用 MemoryBackend VFS 充当「项目磁盘」，驱动按键后核对落盘内容。
import { VFS } from '../src/drapog.vfs.js';

// ---- 浏览器环境 mock（import setup.js 前就位；navigator 只读，不赋值）----
const ctxMock = new Proxy({}, {
  get(t, p) { if (p in t) return t[p]; return () => ({ width: 10 }); },
  set(t, p, v) { t[p] = v; return true; },
});
const screenMock = { width: 820, height: 600, getContext: () => ctxMock, style: {} };
let keyHandler = null;
globalThis.window = {
  innerWidth: 820, innerHeight: 600,
  matchMedia: () => ({ matches: false }),
  addEventListener: (type, h) => { if (type === 'keydown') keyHandler = h; },
  removeEventListener: (type) => { if (type === 'keydown') keyHandler = null; },
};
globalThis.document = { getElementById: () => screenMock };

const S = await import('../System/BIOS/settings.js');
const { showSetup } = await import('../System/BIOS/setup.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); pass++; } else { console.log('  ✗ ' + m); fail++; } }
const tick = () => new Promise(r => setTimeout(r, 0));
function key(k) { if (keyHandler) keyHandler({ key: k, preventDefault() {} }); }
async function seed(obj) {
  const vfs = new VFS();
  await vfs.write(S.SETTINGS_PATH, JSON.stringify(obj));
  return vfs;
}
async function readFile(vfs) { return JSON.parse(await vfs.read(S.SETTINGS_PATH)); }

console.log('== 1. 纯逻辑 ==');
ok(JSON.stringify(S.normalizeSettings(null)) === JSON.stringify(S.DEFAULT_SETTINGS), '默认设置');
ok(S.normalizeSettings({ bootMode: 'gui', timeout: 99 }).timeout === 30, 'timeout 上限 30');
ok(S.normalizeSettings({ bootMode: 'x', timeout: -1 }).bootMode === 'auto', '非法 bootMode→auto');
ok(S.normalizeSettings({ quickPOST: 'yes' }).quickPOST === true, '非布尔 quickPOST→默认 true');
ok(S.cycleBootMode('auto') === 'cmd' && S.cycleBootMode('gui', -1) === 'cmd', 'cycleBootMode 正/反');
ok(S.adjustTimeout(0, -1) === 0 && S.adjustTimeout(30, 1) === 30, 'adjustTimeout 边界');
ok(S.toggle(true) === false && S.toggle(false) === true, 'toggle');

console.log('== 2. 项目文件 load/save 往返 ==');
{
  const vfs = await seed({ bootMode: 'gui', timeout: 12, quickPOST: false, bootLogo: false, secureBoot: true });
  const loaded = await S.loadSettings(vfs);
  ok(loaded.bootMode === 'gui' && loaded.timeout === 12 && loaded.secureBoot === true, '从项目文件读回');
  const saved = await S.saveSettings(vfs, { bootMode: 'cmd', timeout: 0, quickPOST: true, bootLogo: true, secureBoot: false });
  ok(saved.bootMode === 'cmd' && saved.timeout === 0, 'save 返回规范化');
  const reloaded = await readFile(vfs);
  ok(reloaded.bootMode === 'cmd' && reloaded.timeout === 0 && reloaded.quickPOST === true, 'save 落盘可再读');
  // 缺失文件 → 默认
  const empty = new VFS();
  ok((await S.loadSettings(empty)).bootMode === 'auto', '缺文件→默认');
  // 损坏 JSON → 默认
  const bad = new VFS(); await bad.write(S.SETTINGS_PATH, '{oops');
  ok((await S.loadSettings(bad)).bootMode === 'auto', '损坏 JSON→默认');
}

console.log('== 3. 两级菜单：进子菜单调整 + Esc 返回 + F10 保存到项目文件 ==');
{
  const vfs = await seed({ bootMode: 'auto', timeout: 5, quickPOST: true, bootLogo: true, secureBoot: false });
  const p = showSetup(vfs);
  await tick();
  ok(!!keyHandler, 'showSetup 注册 keydown');
  key('Enter');                 // 进入「启动设置」子菜单
  key('ArrowRight');            // 启动模式 auto→cmd
  key('ArrowDown');             // → 菜单倒计时
  key('ArrowRight'); key('ArrowRight'); key('ArrowRight'); // 5→8
  key('Escape');                // Esc 返回主菜单
  key('ArrowDown');             // → 高级设置(index1)
  key('Enter');                 // 进入高级
  key('ArrowRight');            // 快速自检 true→false
  key('Escape');                // 返回主菜单
  key('F10');                   // 保存并退出
  const res = await p;
  ok(res && res.bootMode === 'cmd' && res.timeout === 8 && res.quickPOST === false, 'F10 保存 bootMode=cmd/timeout=8/quickPOST=false');
  const f = await readFile(vfs);
  ok(f.bootMode === 'cmd' && f.timeout === 8 && f.quickPOST === false && f.bootLogo === true && f.secureBoot === false, '项目文件已更新（其余保持）');
}

console.log('== 4. 主菜单 Esc = 不保存退出（丢弃改动）==');
{
  const vfs = await seed({ bootMode: 'auto', timeout: 5, quickPOST: true, bootLogo: true, secureBoot: false });
  const p = showSetup(vfs);
  await tick();
  key('Enter');          // 进启动设置
  key('ArrowRight');     // auto→cmd（仅工作副本）
  key('Escape');         // 回主菜单
  key('Escape');         // 主菜单 Esc = 不保存退出
  const res = await p;
  ok(res === null, '主菜单 Esc 返回 null');
  const f = await readFile(vfs);
  ok(f.bootMode === 'auto', '项目文件未被改动（仍 auto）');
}

console.log('== 5. 恢复默认设置 ==');
{
  const vfs = await seed({ bootMode: 'gui', timeout: 20, quickPOST: false, bootLogo: false, secureBoot: true });
  const p = showSetup(vfs);
  await tick();
  for (let i = 0; i < 6; i++) key('ArrowDown');  // → 恢复默认(index 6)
  key('Enter');                                   // 触发恢复默认（工作副本）
  key('F10');                                     // 保存
  const res = await p;
  ok(JSON.stringify(res) === JSON.stringify(S.DEFAULT_SETTINGS), '恢复默认后保存 = 出厂默认');
  const f = await readFile(vfs);
  ok(f.bootMode === 'auto' && f.timeout === 5 && f.secureBoot === false, '项目文件重置为默认');
}

console.log('');
if (fail === 0) console.log('BIOS 设置（项目文件 + 两级菜单）验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
