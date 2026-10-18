// test_bios.mjs —— 验证 BIOS Setup：纯设置逻辑 + showSetup 交互（mock 浏览器环境）
// 覆盖：normalize/clamp、load/save 往返、损坏回退、mode 循环、timeout 调整；
//       showSetup：调整值→F10 保存写 CMOS、Esc 丢弃、恢复默认。
import assert from 'assert';

// ---- 浏览器环境 mock（必须在 import setup.js 之前就位）----
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
};
const ctxMock = new Proxy({}, {
  get(t, p) { if (p in t) return t[p]; return () => ({ width: 10 }); },
  set(t, p, v) { t[p] = v; return true; },
});
const screenMock = { width: 800, height: 600, getContext: () => ctxMock, style: {} };
let keyHandler = null;
globalThis.window = {
  innerWidth: 800, innerHeight: 600,
  matchMedia: () => ({ matches: false }),
  addEventListener: (type, h) => { if (type === 'keydown') keyHandler = h; },
  removeEventListener: (type) => { if (type === 'keydown') keyHandler = null; },
};
globalThis.document = { getElementById: () => screenMock };

const { DEFAULT_SETTINGS, normalizeSettings, loadBiosSettings, saveBiosSettings,
        cycleBootMode, adjustTimeout, showSetup } = await import('./System/BIOS/setup.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); pass++; } else { console.log('  ✗ ' + m); fail++; } }
const tick = () => new Promise(r => setTimeout(r, 0));
function key(k) { if (keyHandler) keyHandler({ key: k, preventDefault() {} }); }

console.log('== 1. 纯逻辑（normalize / 边界）==');
ok(JSON.stringify(normalizeSettings(null)) === JSON.stringify({ bootMode: 'auto', timeout: 5 }), '默认 auto/5');
ok(normalizeSettings({ bootMode: 'gui', timeout: 99 }).timeout === 30, 'timeout 上限截到 30');
{
  const n = normalizeSettings({ bootMode: 'xxx', timeout: -3 });
  ok(n.bootMode === 'auto' && n.timeout === 0, '非法 bootMode→auto；负 timeout→0');
}
ok(cycleBootMode('auto') === 'cmd' && cycleBootMode('cmd') === 'gui' && cycleBootMode('gui') === 'auto', 'cycleBootMode 正向 auto→cmd→gui→auto');
ok(cycleBootMode('auto', -1) === 'gui', 'cycleBootMode 反向 gui');
ok(adjustTimeout(5, 1) === 6 && adjustTimeout(0, -1) === 0 && adjustTimeout(30, 1) === 30, 'adjustTimeout 边界');

console.log('== 2. load / save 往返 ==');
store.clear();
ok(loadBiosSettings().bootMode === 'auto', '空 CMOS → 默认');
const saved = saveBiosSettings({ bootMode: 'gui', timeout: 12 });
ok(saved.bootMode === 'gui' && saved.timeout === 12, 'save 返回规范化结果');
ok(loadBiosSettings().bootMode === 'gui' && loadBiosSettings().timeout === 12, 'reload 读回 gui/12');
store.set('drapog.bios.cmos', '{bad json');
ok(loadBiosSettings().bootMode === 'auto', '损坏 JSON → 回退默认');

console.log('== 3. showSetup：调整 + F10 保存 ==');
store.clear();
const p = showSetup();
await tick();
ok(!!keyHandler, 'showSetup 注册了 keydown');
key('ArrowDown');                              // → 菜单倒计时行
key('ArrowRight'); key('ArrowRight');          // timeout 5→7
key('ArrowUp');                                // → 回启动模式行(index 0)
key('ArrowRight');                             // bootMode auto→cmd
key('F10');                                    // 保存并退出
const res = await p;
ok(res && res.bootMode === 'cmd' && res.timeout === 7, 'F10 保存 bootMode=cmd/timeout=7');
ok(!keyHandler, '退出后注销 keydown');
ok(store.has('drapog.bios.cmos') && JSON.parse(store.get('drapog.bios.cmos')).bootMode === 'cmd', 'CMOS 已写入 cmd');

console.log('== 4. showSetup：Esc 不保存 ==');
store.clear();
const p2 = showSetup();
await tick();
key('ArrowRight');     // bootMode auto→cmd（仅工作副本）
key('Escape');         // 不保存退出
const res2 = await p2;
ok(res2 === null, 'Esc 返回 null（丢弃改动）');
ok(!store.has('drapog.bios.cmos'), 'CMOS 未被写入');

console.log('== 5. showSetup：恢复默认 ==');
saveBiosSettings({ bootMode: 'gui', timeout: 20 });
const p3 = showSetup();
await tick();
key('ArrowDown'); key('ArrowDown');   // → 恢复默认行(index 2)
key('Enter');                          // 触发恢复默认（工作副本回 auto/5，未写 CMOS）
ok(loadBiosSettings().bootMode === 'gui', '恢复默认未直接写 CMOS');
key('F10');                            // 保存
const res3 = await p3;
ok(res3.bootMode === 'auto' && res3.timeout === 5, '恢复默认后保存 → auto/5');

console.log('');
if (fail === 0) console.log('BIOS Setup 验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
