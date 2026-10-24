// 验证 DrapLang 自举版 Finder（System/Apps/Finder.app/main.drapp）的核心行为：
//   - 首帧绘制
//   - 新建文件夹 / 新建文本（命名态逐字符输入）
//   - 上级目录
//   - 根目录列表含 /System；进入 /System 需权限弹窗，允许后进入
//   - 系统目录内禁止删除（保护）
//   - openPath 透传：启动时打开指定路径并预览其中文本
// 另保留 WM 软键盘注入合成按键的断言（与 Finder 实现无关）。
import assert from 'assert';
import { readFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { VFS } from '../src/drapog.vfs.js';
import { launchDrapAppProgram } from '../src/drapog.launcher.js';
import { WindowManager } from '../src/drapog.wm.js';

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
const tick = () => new Promise(r => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 10; i++) await tick(); }

function compile(app) {
  const src = readFileSync('System/Apps/' + app + '.app/main.drapp', 'utf8');
  return new DrapCC(src).compile();
}

// 桩 WM：只实现 Finder 启动所需的钩子
function makeWM() {
  let id = 1; let lastWin = null;
  return {
    T: { palette: [[38,38,42],[232,232,237],[10,132,255],[46,46,50],[10,132,255]] },
    softKeyboard: { open: false },
    theme: 'macos',
    createWindow(opts) { lastWin = { id: id++, title: opts.title, w: opts.w, h: opts.h, __sys: null }; return lastWin; },
    closeWindow() {},
    getWin() { return lastWin; },
    setTheme(name) { this.theme = name; },
    openFinderAt(p) { this._lastFinder = p; },
  };
}

// 在首帧绘制文本里找某行 y 坐标（用于定位列表项）；点击需落在行中心（文字 y + 10）
function rowYOf(st, prefix) {
  const ts = st.drawOps.filter(o => o.op === 'text' && typeof o.text === 'string' && o.text.startsWith(prefix));
  return ts.length ? ts[0].y : -1;
}
function texts(st) { return st.drawOps.filter(o => o.op === 'text').map(o => o.text); }

async function testFinder() {
  const vfs = new VFS();
  await vfs.mkdir('/Users/guest');
  await vfs.mkdir('/System');
  await vfs.write('/System/BIOS', 'BIOS v1');
  await vfs.write('/Users/guest/readme.txt', 'hello');
  const wm = makeWM();

  // 统一用列表视图做确定性断言：点击「列表」按钮切换
  const toList = async (sys, win) => { sys.injectWinEvent(win.id, 'click viewList'); await settle(); };
  // 内容区选中第 i 行（列表视图行 y = TOOLBAR_H+8+i*30，文字在 +8；点 x=220 落在内容区且落在行内）
  const selectRow = (sys, win, y) => sys.injectWinEvent(win.id, 'click 220 ' + (y + 10));

  // A. 新建文件夹 My / 新建文本 a.txt（cwd=/Users/guest）
  let sys = launchDrapAppProgram(wm, vfs, compile('Finder'));
  let win = wm.getWin(); let st = sys.drapWins.get(win.id);
  await settle();
  ok(st.drawOps.length > 0, 'Finder 首帧已绘制');
  await toList(sys, win);
  sys.injectWinEvent(win.id, 'click newfolder'); await settle();
  for (const ch of ['M','y']) { sys.injectWinEvent(win.id, 'key ' + ch); await settle(); }
  sys.injectWinEvent(win.id, 'key Enter'); await settle();
  ok((await vfs.exists('/Users/guest/My')) === true, '新建文件夹 /Users/guest/My 已创建');
  sys.injectWinEvent(win.id, 'click newfile'); await settle();
  for (const ch of ['a','.','t','x','t']) { sys.injectWinEvent(win.id, 'key ' + ch); await settle(); }
  sys.injectWinEvent(win.id, 'key Enter'); await settle();
  ok((await vfs.exists('/Users/guest/a.txt')) === true, '新建文本 /Users/guest/a.txt 已创建');

  // B. 以 openPath="/" 启动（sysAccess 仍为 0）→ /System 需权限；允许后进入；系统目录内禁止删除
  sys = launchDrapAppProgram(wm, vfs, compile('Finder'), null, '/');
  win = wm.getWin(); st = sys.drapWins.get(win.id);
  await settle();
  await toList(sys, win);
  const sysRowY = rowYOf(st, 'System');
  ok(sysRowY >= 0, '根目录列表含 /System');
  if (sysRowY >= 0) {
    selectRow(sys, win, sysRowY); await settle();
    sys.injectWinEvent(win.id, 'click open'); await settle();
    ok(texts(st).some(x => x === '需要权限'), '点击 /System「打开」弹出权限弹窗（显示「需要权限」）');
    sys.injectWinEvent(win.id, 'click 允许'); await settle();
    const biosY = rowYOf(st, 'BIOS');
    ok(biosY >= 0, '允许后进入 /System，列表含 BIOS');
    if (biosY >= 0) {
      selectRow(sys, win, biosY); await settle();
      sys.injectWinEvent(win.id, 'click trash'); await settle();
      ok(texts(st).some(x => x.includes('系统目录受保护')), '在 /System 内删除被拒，提示「系统目录受保护」');
    }
  }

  // C. openPath 透传 + 文件预览（cwd=/Users/guest，列表视图选中 readme.txt → 打开进入预览）
  sys = launchDrapAppProgram(wm, vfs, compile('Finder'), null, '/Users/guest');
  win = wm.getWin(); st = sys.drapWins.get(win.id);
  await settle();
  await toList(sys, win);
  const readmeY = rowYOf(st, 'readme.txt');
  ok(readmeY >= 0, 'openPath=/Users/guest 启动后列表含 readme.txt');
  if (readmeY >= 0) {
    selectRow(sys, win, readmeY); await settle();
    sys.injectWinEvent(win.id, 'click open'); await settle();
    ok(texts(st).some(x => x === 'readme.txt'), '打开文本文件进入预览视图（标题显示 readme.txt）');
  }

  // D. 双击直接打开（内容区 dblclick 透传）：在列表视图双击 readme.txt 行，应直接进入预览
  sys = launchDrapAppProgram(wm, vfs, compile('Finder'), null, '/Users/guest');
  win = wm.getWin(); st = sys.drapWins.get(win.id);
  await settle();
  await toList(sys, win);
  const dblY = rowYOf(st, 'readme.txt');
  ok(dblY >= 0, 'D: 列表含 readme.txt');
  if (dblY >= 0) {
    sys.injectWinEvent(win.id, 'dblclick 220 ' + (dblY + 10)); await settle();
    ok(texts(st).some(x => x === 'readme.txt'), 'D: 双击文本文件直接进入预览视图（标题显示 readme.txt）');
  }
}

async function testSoftKeyboard() {
  global.window = { SCR_W: 800, SCR_H: 600 };
  const fakeCanvas = { width: 800, height: 600, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) };
  const wm = new WindowManager(fakeCanvas);
  let lastKey = null;
  wm.registerApp('t', { onKeyDown: (e) => { lastKey = e.key; return true; } });
  wm.launchApp({ id: 't', letter: 'T', title: 'T' });
  wm.softKeyboard.open = true;
  const { rects } = wm.softKeyRects(800, 600);
  const k0 = rects[0];
  wm.onMouseDown(k0.x + k0.w / 2, k0.y + k0.h / 2);
  ok(lastKey === '1', "点击软键盘 '1' → 注入合成按键 key='1' 到焦点窗口");
}

console.log('== Finder（DrapLang 自举版）行为验证 + WM 软键盘 ==');
try {
  await testFinder();
  await testSoftKeyboard();
} catch (e) {
  fail++; console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 6).join('\n'));
}
console.log('');
if (fail === 0) console.log('Finder 行为验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
