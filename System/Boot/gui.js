/**
 * @file        System/Boot/gui.js
 * @module      drapog/boot/gui
 * @summary     GUI 模式引导（高清 + 内嵌应用）
 * @version     0.3.0
 */

import { WindowManager } from '../../drapog.wm.js';
import { VFS } from '../../drapog.vfs.js';
import { DrapShell } from '../../drapog.shell.js';
import { VM } from '../../drapog.vm.js';
import { DrapCC } from '../../drapcc.js';
import { createFinderApp, createTerminalApp } from '../../drapog.apps.js';
import { DrapSYS } from '../../drapog.sys.js';

const screen = document.getElementById('screen');

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