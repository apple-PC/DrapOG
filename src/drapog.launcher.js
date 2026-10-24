/**
 * @file        drapog.launcher.js
 * @module      drapog/launcher
 * @summary     DrapLang 应用启动器（DOM 无关，供 registry / gui / cmd 复用）
 * @version     1.0.0
 * @description 把 DrapLang 程序的「编译 → 建 VM/sys → 跑事件循环 / 跑 CLI」逻辑从 gui.js 抽出，
 *              作为统一启动层。GUI 型交给 WM（drapAppBridge 重放绘制/注入事件），CLI 型直接跑并把
 *              输出收敛到 io.print。与窗口管理器、宿主桥接解耦，使 cmd（终端）也能启动 .app。
 */

import { DrapCC } from './drapcc.js';
import { VM } from './drapog.vm.js';
import { DrapSYS } from './drapog.sys.js';
import { makeLineWriter } from './drapog.stream.js';
import { drawGlyph, isGlyph } from './drapog.glyphs.js';

// 颜色数组 → CSS rgb 串
function _rgb(c) {
  return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
}

/* ============================================================
   DrapLang GUI 应用的宿主桥接
   —— DrapLang 程序在 VM 里跑事件循环（win_get_event），通过 win_* 工具绘制 / 收事件；
      本桥接负责：创建真实 WM 窗口、重放 drawOps、绘制声明式控件、把真实鼠标/键盘事件注入 VM。
   ============================================================ */
export const drapAppBridge = {
  // 重放该窗口的绘制指令（坐标已是内容区局部坐标，wm 已 translate）
  render(ctx, win, wm) {
    const sys = win.__sys;
    if (!sys) return;
    const st = sys.drapWins.get(win.id);
    if (!st) return;
    if (st.title) win.title = st.title;   // DrapLang 改了标题则同步
    // 1) drapp 自绘（背景 / 图形 / 文字）
    for (const op of st.drawOps) {
      if (op.op === 'text') {
        ctx.fillStyle = _rgb(op.color);
        const stylePrefix = (op.italic ? 'italic ' : '') + (op.bold ? '600 ' : '');
        ctx.font = stylePrefix + op.font + 'px ' + (op.mono
          ? 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
          : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(op.text, op.x, op.y);
        if (op.underline) {
          const tw = ctx.measureText(op.text).width;
          ctx.fillRect(op.x, op.y + op.font + 1, tw, Math.max(1, op.font / 14));
        }
      } else if (op.op === 'fill') {
        ctx.fillStyle = _rgb(op.color);
        ctx.fillRect(op.x, op.y, op.w, op.h);
      } else if (op.op === 'stroke') {
        ctx.strokeStyle = _rgb(op.color);
        ctx.lineWidth = 1;
        ctx.strokeRect(op.x, op.y, op.w, op.h);
      } else if (op.op === 'icon') {
        // 应用手绘图标（macOS squircle）；无规格时 drawAppIcon 退回字母渲染
        if (wm && typeof wm.drawAppIcon === 'function') wm.drawAppIcon(op.id, op.x, op.y, op.size);
      } else if (op.op === 'glyph') {
        // 手绘图标（文件/文件夹/动作等），颜色随当前绘制色（语义图标内部固定配色）
        drawGlyph(ctx, op.name, op.x, op.y, op.size, { color: _rgb(st.style.color) });
      }
    }
    // 2) 声明式控件（标准样式，宿主自动绘制）
    for (const c of st.controls) {
      if (c.type === 'button') {
        if (isGlyph(c.id)) {
          // 手绘图标按钮：macOS 风格图标型（无蓝底），颜色取主题前景色
          const fg = (wm && wm.T && wm.T.palette) ? _rgb(Array.isArray(wm.T.palette) ? wm.T.palette[1] : wm.T.palette.fg) : '#e8e8ed';
          const s = Math.min(c.w, c.h) - 6;
          drawGlyph(ctx, c.id, c.x + (c.w - s) / 2, c.y + (c.h - s) / 2, s, { color: fg });
        } else {
          ctx.fillStyle = 'rgba(10,132,255,0.95)';
          wm.roundRect(c.x, c.y, c.w, c.h, 6); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '13px -apple-system, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(c.id, c.x + c.w / 2, c.y + c.h / 2);
        }
      } else if (c.type === 'label') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(c.text, c.x, c.y);
      } else if (c.type === 'input') {
        const focused = win.__focusId === c.id;
        ctx.fillStyle = focused ? '#1c1c22' : '#15151a';
        wm.roundRect(c.x, c.y, c.w, c.h, 5); ctx.fill();
        ctx.strokeStyle = focused ? 'rgba(10,132,255,0.9)' : 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        wm.roundRect(c.x, c.y, c.w, c.h, 5); ctx.stroke();
        const val = st.inputs.get(c.id) || '';
        ctx.fillStyle = val ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(val || '输入...', c.x + 6, c.y + c.h / 2);
        if (focused && val) {
          const tw = ctx.measureText(val).width;
          ctx.fillStyle = '#fff';
          ctx.fillRect(c.x + 6 + tw, c.y + 4, 1.5, c.h - 8);
        }
      }
    }
  },
  onMouseDown(lx, ly, win, wm) {
    const sys = win.__sys;
    if (!sys) return;
    const hit = sys.hitControl(win.id, Math.round(lx), Math.round(ly));
    if (hit && hit.type === 'button') {
      sys.injectWinEvent(win.id, 'click ' + hit.id);
    } else if (hit && hit.type === 'input') {
      win.__focusId = hit.id;
      sys.injectWinEvent(win.id, 'click ' + hit.id);   // 通知 drapp 聚焦
    } else {
      win.__focusId = null;
      sys.injectWinEvent(win.id, 'click ' + Math.round(lx) + ' ' + Math.round(ly));
    }
  },
  onKeyDown(e, win, wm) {
    const sys = win.__sys;
    if (!sys) return true;
    const focusId = win.__focusId;
    if (focusId) {
      const st = sys.drapWins.get(win.id);
      let val = st.inputs.get(focusId) || '';
      if (e.key === 'Backspace') val = val.slice(0, -1);
      else if (e.key === 'Enter') { /* 保持值，drapp 自行读取 */ }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) val += e.key;
      else return true;   // 方向键等忽略
      sys.setInputValue(win.id, focusId, val);
      sys.injectWinEvent(win.id, 'input ' + focusId + ' ' + val);
      return true;
    }
    sys.injectWinEvent(win.id, 'key ' + e.key);
    return true;
  },
};

// 启动一个「已编译」的 DrapLang GUI 程序（program = {instructions, strings}）：建 VM+sys → 跑事件循环
// openPath：可选初始打开路径（openFinderAt 透传），写入窗口状态 __openPath 供 win_get_open_path 读取
// appId：真实应用 id（注册表 id），用于窗口归属 / 菜单栏命名；默认 '__drapapp__'
export function launchDrapAppProgram(wm, vfs, program, registry = null, openPath = null, appId = '__drapapp__') {
  const vm = new VM();
  vm.load(program);
  const sys = new DrapSYS({
    vm,
    vfs,
    out: () => {},
    onWinCreate: ({ title, w, h }) => {
      const win = wm.createWindow({ title, w, h, appId });
      win.__sys = sys;
      const st = sys.drapWins.get(win.id);
      if (st) st.__openPath = openPath || '';
      return win.id;
    },
    onWinClose: (winId) => { wm.closeWindow(winId); },
      getTheme: () => (wm && wm.T && wm.T.palette) ? wm.T.palette : null,
      onSetTheme: (name) => { if (wm && typeof wm.setTheme === 'function') wm.setTheme(name); if (wm && typeof wm.savePrefs === 'function') wm.savePrefs(); },
      onOpenFinder: (path) => { if (wm && typeof wm.openFinderAt === 'function') wm.openFinderAt(path); },
      onSetSoftKeyboard: (on) => { if (wm) wm.softKeyboard.open = !!on; if (wm && typeof wm.savePrefs === 'function') wm.savePrefs(); },
      onGetThemeName: () => (wm && wm.theme) || 'macos',
      onGetSoftKeyboard: () => !!(wm && wm.softKeyboard && wm.softKeyboard.open),
      registry,
      wm,
      openPath,
  });
  vm.sys = sys;
  // 跑 VM：内部事件循环会在 win_get_event 处阻塞，由真实事件唤醒
  vm.run().catch(err => console.error('DrapLang 应用运行错误', err));
  return sys;
}

// 启动一个 DrapLang 编写的 GUI 应用：编译源 → 建 VM+sys → 跑事件循环
// opts.modules: { name: source } —— 供 app 内的 `import "name"` 文件级模块解析
// opts.registry: AppRegistry 实例（供 win_app_* 系统调用枚举/启动应用）
export function launchDrapApp(wm, vfs, source, opts = {}) {
  let program;
  try {
    program = new DrapCC(source, { modules: opts.modules || null }).compile();
  } catch (err) {
    console.error('DrapLang 应用编译失败', err);
    return null;
  }
  return launchDrapAppProgram(wm, vfs, program, opts.registry || null, opts.openPath || null, opts.appId || '__drapapp__');
}

// 从 URL 拉取 DrapLang 源码并启动（dock / 注册表 启动 gui 型 .app 用）
export function launchDrapAppUrl(wm, vfs, url) {
  fetch(url)
    .then(r => r.text())
    .then(src => launchDrapApp(wm, vfs, src))
    .catch(err => console.warn('drapp 加载失败（可忽略）', err));
}

// 运行一个「已编译」的 DrapLang CLI 程序：建 VM+sys（无窗口）→ 跑完，输出收敛到 io.print
// argv：命令行参数数组（argv[0] 为程序名），注入 sys.argv 供应用读取
// 返回 main 的返回值作为退出码（0 成功；运行异常返回 1）
export async function runDrapCliProgram(vfs, io, program, argv = []) {
  const vm = new VM();
  vm.load(program);
  const w = makeLineWriter(l => { if (io && io.print) io.print(l); });
  vm.onOutput = w.feed;
  const sys = new DrapSYS({
    vm,
    vfs,
    out: s => { for (const l of String(s).split('\n')) if (io && io.print) io.print(l); },
    onRead: io && typeof io.readLine === 'function' ? () => io.readLine() : null,
  });
  sys.argv = argv.map(String);
  vm.sys = sys;
  try {
    await vm.run();
    w.flush();
    return vm.regs[0] | 0;   // main 返回值即退出码
  } catch (err) {
    if (io && io.print) io.print('运行错误: ' + err.message);
    return 1;
  }
}

// 运行一个 DrapLang 编写的 CLI 应用：编译源 → 建 VM+sys（无窗口）→ 跑完，输出收敛到 io.print
// 适用于 .app 的 type:'cli' 入口（只用 term_print / term_read / fs_*，不调 GUI）。
// opts.modules: { name: source } —— 供 app 内的 `import "name"` 文件级模块解析
// opts.argv: 命令行参数数组
export async function runDrapCli(vfs, io, source, opts = {}) {
  let program;
  try {
    program = new DrapCC(source, { modules: opts.modules || null }).compile();
  } catch (err) {
    if (io && io.print) io.print('编译失败: ' + err.message);
    return 1;
  }
  return runDrapCliProgram(vfs, io, program, opts.argv || []);
}
