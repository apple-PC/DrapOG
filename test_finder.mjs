// 验证 Finder（文件管理器）增强 + WM 软键盘：
//   - 新建文件夹 / 文本（命名输入，模拟键盘逐字符）—— 在初始 /Users/guest
//   - 上一级按钮（cwd 回到上级）
//   - 系统目录(/System)进入需权限弹窗，允许后才进入
//   - 系统目录内禁止删除（保护）
//   - WM 软键盘：打开后点击按键 → 注入合成按键给焦点窗口
//
// 说明：Finder 内部 state 为闭包私有；这里通过「录制 render 的 fillText」
// 捕获地址栏路径（y≈52 行）与错误文本，真实断言 cwd / 权限 / 保护行为。
import { VFS } from './drapog.vfs.js';
import { WindowManager } from './drapog.wm.js';
import { createFinderApp } from './drapog.apps.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}
const tick = () => new Promise(r => setTimeout(r, 0));

const vfs = new VFS();
const finder = createFinderApp({ vfs });
const win = { id: 1, w: 400, h: 300, TITLEBAR_H: 34 };
const fakeWm = { roundRect() {}, bringToFront() {}, closeWindow() {} };
finder.create(win, fakeWm);
await tick();

// 录制 ctx：捕获所有 fillText(text, x, y)
function renderCapture() {
  const texts = [];
  const noop = () => {};
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'fillText') return (txt, x, y) => texts.push({ txt: String(txt), x, y });
      if (p === 'measureText') return () => ({ width: 0 });
      if (p === 'canvas') return { width: 400, height: 300 };
      return noop;
    },
    set() { return true; },
  });
  finder.render(ctx, win, fakeWm);
  return texts;
}
function readCwd() {
  return (renderCapture().filter(t => t.y >= 50 && t.y <= 54 && t.txt.startsWith('/'))[0] || {}).txt || null;
}
function hasText(sub) {
  return renderCapture().some(t => t.txt.includes(sub));
}

console.log('== A. 新建文件夹（命名输入逐字符，初始 /Users/guest） ==');
assert(readCwd() === '/Users/guest', '初始 cwd = /Users/guest');
await finder.onMouseDown(63, 19, win, fakeWm);   // newFolder
await finder.onKeyDown({ key: 'M' }, win, fakeWm);
await finder.onKeyDown({ key: 'y' }, win, fakeWm);
await finder.onKeyDown({ key: 'Enter' }, win, fakeWm);
await tick();
assert(await vfs.exists('/Users/guest/My') === true, '新建文件夹 /Users/guest/My 已创建');

console.log('== B. 新建文本（命名输入逐字符） ==');
await finder.onMouseDown(101, 19, win, fakeWm);  // newFile
for (const ch of ['a', '.', 't', 'x', 't']) await finder.onKeyDown({ key: ch }, win, fakeWm);
await finder.onKeyDown({ key: 'Enter' }, win, fakeWm);
await tick();
assert(await vfs.exists('/Users/guest/a.txt') === true, '新建文本 /Users/guest/a.txt 已创建');

console.log('== C. 「上一级」按钮 ==');
await finder.onMouseDown(25, 19, win, fakeWm); await tick();   // parent
assert(readCwd() === '/Users', '点「上一级」后 cwd = /Users');
await finder.onMouseDown(25, 19, win, fakeWm); await tick();   // parent
assert(readCwd() === '/', '再点「上一级」后 cwd = /');

console.log('== D. 系统目录进入需权限（cwd = /） ==');
// 根目录 dirs 排序: Applications, Library, System, Users → System 索引 2
await finder.onDoubleClick(10, 64 + 2 * 28 + 14, win, fakeWm); await tick();
assert(readCwd() === '/', '双击 /System 被权限拦截，cwd 仍为 /');
// 点击「允许」按钮（弹窗内）中心
await finder.onMouseDown(138, 187, win, fakeWm); await tick();
assert(readCwd() === '/System', '点「允许」后 cwd = /System（已授权进入）');

console.log('== E. 系统目录内禁止删除（保护） ==');
// 选中第 0 行（BIOS）再点删除
await finder.onMouseDown(10, 64 + 0 * 28 + 14, win, fakeWm); await tick();
await finder.onMouseDown(177, 19, win, fakeWm); await tick();  // delete
assert(hasText('系统目录受保护'), '在 /System 内删除被拒，提示「系统目录受保护」');

console.log('== F. WM 软键盘注入合成按键 ==');
global.window = { SCR_W: 800, SCR_H: 600 };
const fakeCanvas = {
  width: 800, height: 600,
  getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
};
const wm = new WindowManager(fakeCanvas);
let lastKey = null;
wm.registerApp('t', { onKeyDown: (e) => { lastKey = e.key; return true; } });
wm.launchApp({ id: 't', letter: 'T', title: 'T' });
wm.softKeyboard.open = true;
const { rects } = wm.softKeyRects(800, 600);
const k0 = rects[0];
wm.onMouseDown(k0.x + k0.w / 2, k0.y + k0.h / 2);
assert(lastKey === '1', "点击软键盘 '1' → 注入合成按键 key='1' 到焦点窗口");

console.log('');
if (failures === 0) console.log('Finder / WM 软键盘验证全部通过 ✓');
else console.log(failures + ' 项失败 ✗');
process.exit(failures === 0 ? 0 : 1);
