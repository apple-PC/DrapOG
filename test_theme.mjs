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

console.log('== 主菜单：macOS Apple 菜单 ==');
{
  mac.toggleMenu('apple');
  ok(mac.menu && mac.menu.kind === 'apple', '点 Apple 标志 → 打开 apple 菜单');
  const L = mac.appleMenuLayout();
  // 逐项命中（行高 26，含一个 sep=12）
  const rows = [['关于本机', 'about'], ['系统设置...', 'settings'], ['锁定屏幕', 'lock'], ['重新启动...', 'restart'], ['关机...', 'shutdown']];
  let iy = L.y + L.pad;
  for (const it of L.items) {
    const h = it.sep ? 12 : L.rowH;
    if (!it.sep) {
      const hit = mac.hitMenu(L.x + 20, iy + h / 2);
      const exp = rows.find(r => r[0] === it.label);
      ok(hit === exp[1], 'Apple 菜单「' + it.label + '」→ ' + exp[1]);
    }
    iy += h;
  }
  mac.toggleMenu('apple');
  ok(mac.menu === null, '再点 Apple 标志 → 关闭菜单');
  // 电源动作
  mac.runMenuAction('lock'); ok(mac.locked === true && mac._loggedOut === false, '锁定屏幕 → locked');
  mac.unlock(); ok(mac.locked === false, 'unlock 解锁');
  mac.runMenuAction('logout'); ok(mac.locked === true && mac._loggedOut === true, '注销 → locked + 已退出登录');
  mac.unlock();
  mac.runMenuAction('shutdown'); ok(mac.shutdown === true, '关机 → shutdown 覆盖层');
}

console.log('== 主菜单：Windows 开始菜单 ==');
{
  win.toggleMenu('start');
  ok(win.menu && win.menu.kind === 'start', '点 Start → 打开开始菜单');
  const L = win.startMenuLayout();
  // 电源行（底部）
  const cw = (L.w - L.pad * 2) / L.power.length;
  const py = L.y + L.h - L.pad - L.powerH + L.powerH / 2;
  ok(win.hitMenu(L.x + L.pad + cw * 0 + 2, py) === 'lock', '开始菜单电源：锁定');
  ok(win.hitMenu(L.x + L.pad + cw * 1 + 2, py) === 'logout', '开始菜单电源：注销');
  ok(win.hitMenu(L.x + L.pad + cw * 2 + 2, py) === 'restart', '开始菜单电源：重启');
  ok(win.hitMenu(L.x + L.pad + cw * 3 + 2, py) === 'shutdown', '开始菜单电源：关机');
  // 应用网格第一个 → 启动该 app
  const g0 = win.hitMenu(L.x + L.pad + 10, L.y + L.pad + 32 + 10);
  ok(g0 && g0.launch === win.apps[0].id, '开始菜单网格首项 → launch ' + win.apps[0].id);
  // Start 不再直接开 AppMgr（由 onMouseDown 逻辑保证；这里验证布局不含 appmgr 特判）
  ok(win.hitMenu(L.x - 5, L.y - 5) === null, '菜单外点击 → null（关闭）');
}

console.log('');
if (fail === 0) console.log('主题/图标/主菜单验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
