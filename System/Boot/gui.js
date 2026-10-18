/**
 * @file        System/Boot/gui.js
 * @module      drapog/boot/gui
 * @summary     GUI 模式引导（高清 + 内嵌应用）
 * @version     1.1.0
 */

import { WindowManager } from '../../drapog.wm.js';
import { VFS } from '../../drapog.vfs.js';
import { DrapShell } from '../../drapog.shell.js';
import {
  createFinderApp, createTerminalApp, createAppManagerApp,
  createEditApp, createSettingsApp, createAboutApp,
} from '../../drapog.apps.js';
import { DrapSYS } from '../../drapog.sys.js';
import { drapAppBridge } from '../../drapog.launcher.js';
import { AppRegistry } from '../../drapog.registry.js';

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

    // 应用注册表（L4：整合 draplang 工具 + 制定 .app 格式）
    const registry = new AppRegistry();
    wm.vfs = vfs;
    wm.registry = registry;

    registry.addHost('finder',   { name: 'Finder',       icon: '📁', title: 'Finder' });
    registry.addHost('terminal', { name: 'Terminal',     icon: '>',  title: 'Terminal' });
    registry.addHost('edit',     { name: 'TextEdit',     icon: 'T',  title: 'TextEdit' });
    registry.addHost('settings', { name: '设置',         icon: '⚙',  title: '设置' });
    registry.addHost('about',    { name: '关于本机',     icon: 'W',  title: '关于本机' });
    registry.addHost('appmgr',   { name: '应用',         icon: '◆',  title: '应用' });
    // DrapLang 应用（内存模式下用 import.meta.url 从 .app 包拉源码；挂载真实磁盘时被 .app 包覆盖）
    // .app/main.drapp 是唯一真源（System/app_gui.drapp / app_paint.drapp 保留仅供旧测试）
    registry.addDrap('guidemo', { name: 'DrapApp 示例', icon: '◆', type: 'gui',
      file: '../Apps/GuiDemo.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: 'DrapLang GUI 示例', category: 'demo' });
    registry.addDrap('paint',    { name: 'Paint',        icon: '🎨', type: 'gui',
      file: '../Apps/Paint.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: 'DrapLang 调色板', category: 'graphics' });
    registry.addDrap('hello',    { name: 'Hello',        icon: 'H',  type: 'cli',
      file: '../Apps/Hello.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: 'DrapLang CLI 示例', category: 'tools' });
    // L5：DrapLang 计算器（GUI 应用，import 复用 calcutil.drapp 模块 —— 演示「app 调用 drapp」）
    registry.addDrap('calc',     { name: 'Calc 计算器',  icon: '🧮', type: 'gui',
      file: '../Apps/Calc.app/main.drapp', baseUrl: import.meta.url, modules: ['calcutil'],
      version: '1.0', author: 'DrapOG', description: 'DrapLang 计算器（win_gui + import calcutil）', category: 'utilities' });
    // 挂载真实磁盘时，扫描 VFS 的 System/Apps/*.app 包（扩展发现）
    registry.scan(vfs, 'System/Apps').catch(() => {});

    wm.registerApp('finder',   createFinderApp({ vfs }));
    wm.registerApp('terminal', createTerminalApp({ vfs, DrapShell, registry }));
    wm.registerApp('__drapapp__', drapAppBridge);   // DrapLang GUI 应用的宿主桥接
    wm.registerApp('edit',     createEditApp({ vfs }));
    wm.registerApp('settings', createSettingsApp());
    wm.registerApp('about',    createAboutApp());

    // 应用管理助手：从注册表读取所有应用网格展示并启动
    wm.registerApp('appmgr', createAppManagerApp({ registry, vfs }));

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
    registry.launch('guidemo', { wm, vfs }).catch(err => console.warn('DrapLang 示例加载失败（可忽略）', err));

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
