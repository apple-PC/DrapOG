/**
 * @file        System/Boot/gui.js
 * @module      drapog/boot/gui
 * @summary     GUI 模式引导（高清 + 内嵌应用）
 * @version     1.1.0
 */

import { WindowManager } from '../../src/drapog.wm.js';
import { VFS } from '../../src/drapog.vfs.js';
import { DrapSYS } from '../../src/drapog.sys.js';
import { drapAppBridge } from '../../src/drapog.launcher.js';
import { AppRegistry } from '../../src/drapog.registry.js';

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

export async function startGUI(opts = {}) {
  // 加载主题文件（规范：System/Themes/<id>.json），合并进 WM 的 wm.T
  let themeConfigs = {};
  try {
    for (const t of ['macos', 'windows']) {
      const r = await fetch(new URL('../Themes/' + t + '.json', import.meta.url), { cache: 'no-store' });
      if (r.ok) themeConfigs[t] = await r.json();
    }
  } catch (e) { /* 用 WM 内置默认 */ }
  // 屏幕初始化（DPR 高清）
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

  const wm = new WindowManager(screen, { theme: opts.theme, themeConfigs });
  await wm.loadPrefs();   // 应用已保存的主题/软键盘偏好（IndexedDB，刷新后恢复）再建窗口

  return new Promise(async (resolve) => {
    // 应用注册表（L4：整合 draplang 工具 + 制定 .app 格式）
    const registry = new AppRegistry();
    wm.vfs = vfs;
    wm.registry = registry;

    // DrapLang 自举应用（Finder / Terminal / TextEdit / 关于本机 / 应用 现已全部用 DrapLang 改写，见 System/Apps/*.app；
    //   手绘图标由各自包内 icon.json 提供，下方图标加载循环会异步 fetch 并设置 iconSpec）
    registry.addDrap('finder',   { name: 'Finder',        type: 'gui',
      file: '../Apps/Finder.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '文件管理器（DrapLang 自举版）', category: 'system' });
    registry.addDrap('terminal', { name: 'Terminal',      type: 'gui',
      file: '../Apps/Terminal.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '终端（DrapLang 自举版，win_shell_exec 调宿主命令）', category: 'system' });
    registry.addDrap('edit',     { name: 'TextEdit',      type: 'gui',
      file: '../Apps/TextEdit.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '文本编辑器（DrapLang 自举版）', category: 'productivity' });
    registry.addDrap('about',    { name: '关于本机',      type: 'gui',
      file: '../Apps/About.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '关于本机（DrapLang 自举版）', category: 'system' });
    registry.addDrap('appmgr',   { name: '应用',          type: 'gui',
      file: '../Apps/AppMgr.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '应用管理（DrapLang 自举版，网格枚举并启动应用）', category: 'system' });
    // DrapLang 应用（内存模式用 import.meta.url 从 .app 包拉源码；挂载真实磁盘时被 scan 覆盖）
    // 演示/调色板类应用（GuiDemo/Paint）已移除，只保留实用应用。
    registry.addDrap('hello',    { name: 'Hello',        icon: 'H',  type: 'cli',
      file: '../Apps/Hello.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: 'DrapLang CLI 示例', category: 'tools' });
    // L5：DrapLang 计算器（GUI 应用，import 复用 calcutil.drapp 模块 —— 演示「app 调用 drapp」）
    registry.addDrap('calc',     { name: 'Calc 计算器',  icon: 'C', type: 'gui',
      file: '../Apps/Calc.app/main.drapp', baseUrl: import.meta.url, modules: ['calcutil'],
      version: '1.0', author: 'DrapOG', description: 'DrapLang 计算器（win_gui + import calcutil）', category: 'utilities' });
    // L5：进制转换器（GUI 应用，import 复用 baseconv.drapp 模块 —— app 调用 drapp）
    registry.addDrap('conv',     { name: 'Conv 进制转换', icon: '2', type: 'gui',
      file: '../Apps/Conv.app/main.drapp', baseUrl: import.meta.url, modules: ['baseconv'],
      version: '1.0', author: 'DrapOG', description: '十进制转二/八/十六进制（win_gui + import baseconv）', category: 'utilities' });
    // L6：DrapLang 文档编辑器（办公级第一块拼图；多行文本编辑 + 打开/保存任意路径）
    //     用 DrapLang 自举的「真编辑器」，作为所有 drapp 的范例；也演示 win_mono 等宽字体 + 输入框预填。
    registry.addDrap('docedit',  { name: 'DocEdit 文档', icon: 'D', type: 'gui',
      file: '../Apps/DocEdit.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: 'DrapLang 文档编辑器（多行编辑/打开/保存）', category: 'productivity' });
    // L7·D：把设置 / 废纸篓 / 此电脑从 JS 宿主应用改写为 DrapLang 自举应用
    registry.addDrap('settings', { name: '设置',         icon: 'S',  type: 'gui',
      file: '../Apps/Settings.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '系统设置（主题切换 / 软键盘）', category: 'system' });
    registry.addDrap('trash',    { name: '废纸篓',       icon: 'T',  type: 'gui',
      file: '../Apps/Trash.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '废纸篓（还原 / 清空）', category: 'system' });
    registry.addDrap('thispc',   { name: '此电脑',       icon: 'P',  type: 'gui',
      file: '../Apps/ThisPC.app/main.drapp', baseUrl: import.meta.url,
      version: '1.0', author: 'DrapOG', description: '此电脑（卷与目录 / 打开 Finder）', category: 'system' });
    // 挂载真实磁盘时，扫描 VFS 的 System/Apps/*.app 包（扩展发现，含各包 icon.json 手绘图标）
    registry.scan(vfs, 'System/Apps').catch(() => {});

    // 内存模式下，.app 包的手绘图标（icon.json）与启动并发预取；挂载模式由 registry.scan 读取。
    // 关键：await 全部就绪后再启动窗口与渲染循环，确保首帧即显示手绘图标，不再退回字母/emoji。
    await Promise.all(registry.all().map(async (rec) => {
      if (!rec || !rec.file || !rec.baseUrl) return;
      try {
        const iconUrl = new URL(rec.file.replace(/[^/]+$/, '') + 'icon.json', rec.baseUrl).href;
        const r = await fetch(iconUrl);
        if (r.ok) { const spec = await r.json(); if (spec) rec.iconSpec = spec; }
      } catch (e) { console.warn('icon.json 预取失败（退回字母）', rec.id, e.message); }
    }));

    wm.registerApp('__drapapp__', drapAppBridge);   // DrapLang GUI 应用的宿主桥接（所有 .app 经此渲染）

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

    function onContextMenu(e) {
      e.preventDefault();
      const p = pos(e);
      wm.onContextMenu(p.x, p.y);
      screen.style.cursor = wm.getCursor(p.x, p.y);
    }

    screen.addEventListener('mousedown', onMouseDown);
    screen.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('keydown',   onKeyDown);
    window.addEventListener('paste',     onPaste);
    window.addEventListener('resize',    onResize);

    // 启动 Finder（Terminal 从 Dock 启动，避免调试期多开窗口）
    wm.launchApp({ id: 'finder', letter: 'F', title: 'Finder' });

  // 自举验证：自动启动一个用 DrapLang 编写的 GUI 应用（证明 GUI 能由 DrapLang 自举）
  registry.launch('calc', { wm, vfs }).catch(err => console.warn('DrapLang 示例加载失败（可忽略）', err));

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
        screen.removeEventListener('contextmenu', onContextMenu);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup',   onMouseUp);
        window.removeEventListener('keydown',   onKeyDown);
        window.removeEventListener('paste',     onPaste);
        window.removeEventListener('resize',    onResize);
      },
    });
  });
}
