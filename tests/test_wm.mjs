// 验证窗口管理器新能力：
//   1) 窗口边缘/角落拖拽缩放（8 方向 + 最小尺寸钳制 + 菜单栏/屏幕边界钳制）
//   2) 缩放热区光标反馈
//   3) 标题栏拖动 + 边缘吸附回归（mode='move' 不受影响）
//   4) macOS 风格菜单栏（软键盘按钮新位置 + 渲染不崩）
import { WindowManager } from '../src/drapog.wm.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}

// ---- mock canvas / 2d context ----
function makeCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return () => undefined;
    },
    set() { return true; },
  });
}
const canvas = { getContext: () => makeCtx(), width: 1280, height: 800 };
globalThis.window = globalThis;
globalThis.SCR_W = 1280;
globalThis.SCR_H = 800;

const wm = new WindowManager(canvas, { theme: 'macos' });
const wa = wm.workArea();   // top=28, bottom=76

function newWin(x, y, w, h) {
  return wm.createWindow({ x, y, w, h, title: 'T', appId: null });
}
function drag(mx1, my1, mx2, my2) {
  wm.onMouseDown(mx1, my1);
  wm.onMouseMove(mx2, my2);
  wm.onMouseUp(mx2, my2);
}

console.log('== 1. 东缘（右缘）缩放 ==');
{
  const w = newWin(100, 100, 400, 300);
  wm.onMouseDown(498, 250);                       // 右缘热区 [494,500)
  assert(wm.dragState && wm.dragState.mode === 'resize' && wm.dragState.dir === 'e', '右缘按下 → resize/e 状态');
  wm.onMouseMove(598, 250);
  wm.onMouseUp(598, 250);
  assert(w.w === 500 && w.x === 100 && w.y === 100 && w.h === 300, '向右拖 100px → w=500，其余不变');
}

console.log('== 2. 西缘（左缘）缩放：右缘固定 ==');
{
  const w = newWin(100, 100, 400, 300);
  drag(102, 250, 52, 250);                         // 按住点 102，位移 -50
  assert(w.x === 50 && w.w === 450, '左缘左拖 50px → x=50, w=450（右缘 500 固定）');
}

console.log('== 3. 南东角缩放 ==');
{
  const w = newWin(100, 100, 400, 300);
  drag(498, 398, 598, 498);
  assert(w.w === 500 && w.h === 400, '右下角斜拖 → w=500, h=400');
}

console.log('== 4. 最小尺寸钳制（280×160） ==');
{
  const w = newWin(100, 100, 400, 300);
  drag(498, 250, 100, 250);
  assert(w.w === wm.RESIZE_MIN_W && w.x === 100, '右缘猛向左拖 → 钳到最小宽 280');
  const w2 = newWin(100, 100, 400, 300);
  drag(300, 398, 300, 100);
  assert(w2.h === wm.RESIZE_MIN_H && w2.y === 100, '下缘猛向上拖 → 钳到最小高 160');
}

console.log('== 5. 北缘缩放：不越过菜单栏 ==');
{
  const w = newWin(100, 40, 400, 300);
  drag(300, 42, 300, 10);
  assert(w.y === wa.top, '上缘上拖 → y 钳在菜单栏底 ' + wa.top);
  assert(w.y + w.h === 340, '下缘固定（40+300=340）');
}

console.log('== 6. 缩放不越过屏幕边界 ==');
{
  const w = newWin(1000, 100, 400, 300);
  drag(1398, 250, 1600, 250);
  assert(w.x + w.w === wm.W(), '右缘拖出屏幕 → 右缘钳在屏宽');
}

console.log('== 7. 最大化窗口不可缩放 ==');
{
  const w = newWin(100, 100, 400, 300);
  wm.toggleMaximize(w.id);
  assert(wm.hitResize(w, w.x + w.w - 2, 200) === null, '最大化后 hitResize 返回 null');
}

console.log('== 8. 缩放光标 ==');
{
  const w = newWin(100, 100, 400, 300);
  assert(wm.getCursor(498, 250) === 'ew-resize', '右缘 → ew-resize');
  assert(wm.getCursor(300, 398) === 'ns-resize', '下缘 → ns-resize');
  assert(wm.getCursor(498, 398) === 'nwse-resize', '右下角 → nwse-resize');
  assert(wm.getCursor(102, 42 + 60) === 'nwse-resize', '左上角 → nwse-resize');
  assert(wm.getCursor(300, 250) === 'default', '窗口中心 → default（不误报）');
}

console.log('== 9. 标题栏拖动 + 吸附回归（mode=move） ==');
{
  const w = newWin(200, 100, 400, 300);
  drag(300, 110, 5, 120);          // 拖到左缘 → 吸附半屏
  assert(w.x === 0 && w.w === Math.floor(1280 / 2), '拖到左缘 → 吸附左半屏（x=0, w=640）');
  const w2 = newWin(200, 100, 400, 300);
  wm.onMouseDown(300, 110);
  wm.onMouseMove(320, 115);
  wm.onMouseUp(320, 115);
  assert(w2.x === 220 && w2.y === 105, '普通拖动仍生效（mode=move）');
}

console.log('== 10. macOS 菜单栏 ==');
{
  const kb = wm.kbButtonRect(1280);
  assert(kb.x === 1280 - 210 && kb.w === 36, '软键盘按钮移到状态区（x=W-210, w=36）');
  assert(wm.hitMenuBar(1280 - 192, 14) === true, '命中软键盘按钮（点击切软键盘仍可用）');
  assert(wm.hitMenuBar(300, 14) === false, '菜单项区域不触发软键盘');
  const L = wm.menuBarLayout(1280);
  assert(L.appName === '访达' && L.menus.length === 6, '无焦点窗口 → 应用名「访达」+ 6 个菜单项');
  let ok = true;
  try { wm.render(); } catch (e) { ok = false; console.log('    render 异常: ' + e.message); }
  assert(ok, '完整 render()（壁纸/窗口/菜单栏/dock/状态区）无异常');
  // 焦点窗口 → 应用名跟随
  const w = newWin(100, 100, 400, 300);
  w.appId = 'finder';
  assert(wm.menuBarLayout(1280).appName === 'Finder', '焦点窗口 appId=finder → 应用名「Finder」');
}

console.log('');
if (failures === 0) console.log('窗口缩放 + macOS 菜单栏验证全部通过 ✓');
else console.log(failures + ' 项失败 ✗');
process.exit(failures === 0 ? 0 : 1);
