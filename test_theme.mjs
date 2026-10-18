// test_theme.mjs —— 验证主题系统：统一图标(appIcon) + normalizeTheme +
//   WM 两套主题布局（工作区/控件位置/任务栏）+ shell「gui <theme>」传参
import assert from 'assert';

// 浏览器环境 mock（WM 只用 canvas.getContext + window.SCR_W/H；布局方法不真正渲染）
globalThis.window = { SCR_W: 1000, SCR_H: 700 };
const ctxMock = new Proxy({}, {
  get(t, p) { if (p in t) return t[p]; return () => ({ width: 10 }); },
  set(t, p, v) { t[p] = v; return true; },
});
const canvasMock = { getContext: () => ctxMock };

const { WindowManager, normalizeTheme } = await import('./drapog.wm.js');
const { appIcon } = await import('./drapog.registry.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); pass++; } else { console.log('  ✗ ' + m); fail++; } }

console.log('== appIcon 统一图标（前两字母，首大写次小写）==');
ok(appIcon('finder') === 'Fi', 'finder→Fi');
ok(appIcon('guidemo') === 'Gu', 'guidemo→Gu');
ok(appIcon('calc') === 'Ca' && appIcon('conv') === 'Co', 'calc→Ca / conv→Co');
ok(appIcon('appmgr') === 'Ap' && appIcon('settings') === 'Se', 'appmgr→Ap / settings→Se');
ok(appIcon('A') === 'A', '单字母→A');

console.log('== normalizeTheme ==');
ok(normalizeTheme('windows') === 'windows' && normalizeTheme('win') === 'windows', 'windows/win→windows');
ok(normalizeTheme('macos') === 'macos' && normalizeTheme(undefined) === 'macos' && normalizeTheme('x') === 'macos', '其余→macos');

console.log('== WM macOS 主题 ==');
const mac = new WindowManager(canvasMock, { theme: 'macos' });
ok(mac.theme === 'macos', 'theme=macos');
{
  const wa = mac.workArea();
  ok(wa.top === 28 && wa.bottom === 60 + 8 * 2, '工作区：顶 28（菜单栏）/ 底 76（dock）');
  const p = mac.btnPositions({ x: 100, y: 100, w: 400, TITLEBAR_H: 34 });
  ok(p.close.x === 120 && p.close.x < p.maximize.x, '控件在左上（close 最左）');
}
ok(!mac.apps.some(a => a.id === 'guidemo' || a.id === 'paint'), 'dock 无 guidemo/paint（演示已删）');
ok(mac.apps.every(a => /^[A-Z][a-z]$/.test(a.letter)), 'dock 图标均为前两字母 monogram');
ok(mac.apps.find(a => a.id === 'calc').letter === 'Ca' && mac.apps.find(a => a.id === 'conv').letter === 'Co', 'calc→Ca / conv→Co');

console.log('== WM Windows 主题 ==');
const win = new WindowManager(canvasMock, { theme: 'windows' });
ok(win.theme === 'windows', 'theme=windows');
{
  const wa = win.workArea();
  ok(wa.top === 0 && wa.bottom === 48, '工作区：顶 0（无菜单栏）/ 底 48（任务栏）');
  const p = win.btnPositions({ x: 100, y: 50, w: 400, TITLEBAR_H: 34 });
  ok(p.close.x === 480 && p.close.x > p.maximize.x, '控件在右上（close 最右）');
  const L = win.taskbarLayout();
  ok(L.ty === 700 - 48 && L.start.x === 8 && L.apps.length === win.apps.length, '任务栏：start 在左 + 全部应用图标');
}

console.log('== shell「gui <theme>」传参 ==');
const { DrapShell } = await import('./drapog.shell.js');
let guiTheme = 'UNSET';
const io = {
  vfs: null, registry: null, wm: null,
  print() {}, clear() {}, exit() {}, readLine: async () => '',
  switchToGUI: (t) => { guiTheme = t; }, getDemoSource: () => '',
};
const shell = new DrapShell(io);
await shell.execute('gui windows');
ok(guiTheme === 'windows', 'gui windows → switchToGUI("windows")');
await shell.execute('gui');
ok(guiTheme === undefined, 'gui（无参）→ switchToGUI(undefined)（默认 macos）');

console.log('');
if (fail === 0) console.log('主题/图标验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
