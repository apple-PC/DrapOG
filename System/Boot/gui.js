/**
 * @file        System/Boot/gui.js
 * @module      drapog/boot/gui
 * @summary     GUI 模式引导（高清 + 内嵌应用）
 * @version     0.5.0
 */

import { WindowManager } from '../../drapog.wm.js';
import { VFS } from '../../drapog.vfs.js';
import { DrapShell } from '../../drapog.shell.js';
import { VM } from '../../drapog.vm.js';
import { DrapCC } from '../../drapcc.js';
import { createFinderApp, createTerminalApp, createAppManagerApp } from '../../drapog.apps.js';
import { DrapSYS } from '../../drapog.sys.js';

// 是否移动端（与 BIOS 菜单同一判据）
function isMobileDevice() {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch (e) {}
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const small = Math.min(window.innerWidth, window.innerHeight) < 820;
  return touch && small;
}

const screen = document.getElementById('screen');

/* ============================================================
   DrapLang GUI 应用的宿主桥接
   —— DrapLang 程序在 VM 里跑事件循环（win_get_event），
      通过 win_* 工具绘制 / 收事件；本桥接负责：
      1) 创建真实 WM 窗口（appId='__drapapp__'）
      2) 把 VM 的绘制指令（drawOps）重放到真实 canvas
      3) 把真实鼠标 / 键盘事件注入 VM 的事件队列
   ============================================================ */

// 颜色数组 → CSS rgb 串
function _rgb(c) {
  return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
}

const drapAppBridge = {
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
        ctx.font = op.font + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(op.text, op.x, op.y);
      } else if (op.op === 'fill') {
        ctx.fillStyle = _rgb(op.color);
        ctx.fillRect(op.x, op.y, op.w, op.h);
      } else if (op.op === 'stroke') {
        ctx.strokeStyle = _rgb(op.color);
        ctx.lineWidth = 1;
        ctx.strokeRect(op.x, op.y, op.w, op.h);
      }
    }
    // 2) 声明式控件（标准样式，宿主自动绘制）
    for (const c of st.controls) {
      if (c.type === 'button') {
        ctx.fillStyle = 'rgba(10,132,255,0.95)';
        wm.roundRect(c.x, c.y, c.w, c.h, 6); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.id, c.x + c.w / 2, c.y + c.h / 2);
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

// 启动一个 DrapLang 编写的 GUI 应用：编译源 → 建 VM+sys → 跑事件循环
function launchDrapApp(wm, vfs, source) {
  let program;
  try {
    program = new DrapCC(source).compile();
  } catch (err) {
    console.error('DrapLang 应用编译失败', err);
    return null;
  }
  const vm = new VM();
  vm.load(program);
  const sys = new DrapSYS({
    vm,
    vfs,
    out: () => {},
    onWinCreate: ({ title, w, h }) => {
      const win = wm.createWindow({ title, w, h, appId: '__drapapp__' });
      win.__sys = sys;
      return win.id;
    },
    onWinClose: (winId) => { wm.closeWindow(winId); },
  });
  vm.sys = sys;
  // 跑 VM：内部事件循环会在 win_get_event 处阻塞，由真实事件唤醒
  vm.run().catch(err => console.error('DrapLang 应用运行错误', err));
  return sys;
}

// 从 URL 拉取 DrapLang 源码并启动（dock 启动 drapp 用）
function launchDrapAppUrl(wm, url, vfs) {
  fetch(url)
    .then(r => r.text())
    .then(src => launchDrapApp(wm, vfs, src))
    .catch(err => console.warn('drapp 加载失败（可忽略）', err));
}

export function startGUI(opts = {}) {
  return new Promise(resolve => {
    // DPR 高清
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    screen.width  = Math.round(cssW * dpr);
    screen.height = Math.round(cssH * dpr);
    screen.style.width  = cssW + 'px';
    screen.style.height = cssH + 'px';
    window.SCR_W = cssW;
    window.SCR_H = cssH;

    const ctx = screen.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // VFS：优先用外部传的，否则新建
    const vfs = opts.vfs || new VFS();

    const wm = new WindowManager(screen);
    wm.registerApp('finder',   createFinderApp({ vfs }));
    wm.registerApp('terminal', createTerminalApp({ vfs, DrapShell, VM, DrapCC, DrapSYS }));
    wm.registerApp('__drapapp__', drapAppBridge);   // DrapLang GUI 应用的宿主桥接

    // Paint：用 DrapLang 编写的调色板 drapp，从 dock 启动（自建 VM 窗口）
    wm.registerApp('paint', {
      launch: (wm2) => launchDrapAppUrl(wm2, new URL('../app_paint.drap', import.meta.url), vfs),
    });
    // 应用管理助手：host 侧应用，网格列出可用应用并启动
    wm.registerApp('appmgr', createAppManagerApp({ vfs, launchDrapAppUrl }));

    // 移动端（无实体键盘）默认打开软键盘，方便输入
    if (isMobileDevice()) wm.softKeyboard.open = true;

    /* -------- 事件 -------- */
    let lastDown = { t: 0, x: 0, y: 0 };

    function pos(e) {
      const r = screen.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onMouseDown(e) {
      const p = pos(e);
      const now = Date.now();
      const isDouble = now - lastDown.t < 350
                    && Math.abs(p.x - lastDown.x) < 4
                    && Math.abs(p.y - lastDown.y) < 4;

      if (isDouble) {
        const w = wm.hitTest(p.x, p.y);
        if (w && wm.hitContent(w, p.x, p.y)) {
          const app = wm.getApp(w.appId);
          if (app && app.onDoubleClick) {
            try { app.onDoubleClick(p.x - w.x, p.y - w.y - w.TITLEBAR_H, w, wm); }
            catch (err) { console.error(err); }
          }
        }
        lastDown.t = 0;
      } else {
        lastDown = { t: now, x: p.x, y: p.y };
        wm.onMouseDown(p.x, p.y);
      }
      screen.style.cursor = wm.getCursor(p.x, p.y);
    }

    function onMouseMove(e) {
      const p = pos(e);
      wm.onMouseMove(p.x, p.y);
      screen.style.cursor = wm.getCursor(p.x, p.y);
    }

    function onMouseUp(e) {
      const p = pos(e);
      wm.onMouseUp(p.x, p.y);
      screen.style.cursor = wm.getCursor(p.x, p.y);
    }

    function onKeyDown(e) { wm.onKeyDown(e); }

    function onPaste(e) {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text) return;
      const w = wm.windows.find(w => w.id === wm.focusedId);
      if (!w) return;
      const app = wm.getApp(w.appId);
      if (app && app.onPaste) {
        e.preventDefault();
        try { app.onPaste(text, w, wm); } catch (err) { console.error(err); }
      }
    }

    function onResize() {
      const d2 = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      screen.width  = Math.round(w * d2);
      screen.height = Math.round(h * d2);
      screen.style.width  = w + 'px';
      screen.style.height = h + 'px';
      window.SCR_W = w;
      window.SCR_H = h;
      ctx.setTransform(d2, 0, 0, d2, 0, 0);
    }

    screen.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('keydown',   onKeyDown);
    window.addEventListener('paste',     onPaste);
    window.addEventListener('resize',    onResize);

    // 启动 Finder + Terminal 各一个
    wm.launchApp({ id: 'finder',   letter: 'F', title: 'Finder' });
    wm.launchApp({ id: 'terminal', letter: '>', title: 'Terminal' });

    // 自举验证：自动启动一个用 DrapLang 编写的 GUI 应用（证明 GUI 能由 DrapLang 自举）
    (async () => {
      try {
        const url = new URL('../app_gui.drap', import.meta.url);
        const src = await (await fetch(url)).text();
        launchDrapApp(wm, vfs, src);
      } catch (err) {
        console.warn('DrapLang 示例加载失败（可忽略）', err);
      }
    })();

    let running = true;
    function loop() {
      if (!running) return;
      wm.render();
      requestAnimationFrame(loop);
    }
    loop();

    resolve({
      shutdown() {
        running = false;
        screen.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup',   onMouseUp);
        window.removeEventListener('keydown',   onKeyDown);
        window.removeEventListener('paste',     onPaste);
        window.removeEventListener('resize',    onResize);
      },
    });
  });
}