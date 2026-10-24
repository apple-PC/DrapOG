/**
 * @file        drapog.wm.js
 * @module      drapog/wm
 * @summary     窗口管理器（支持应用内容）
 * @version     0.7.0
 */

import { idbGet, idbSet } from './drapog.idb.js';
import { appIcon } from './drapog.registry.js';
import { drawAppleLogo } from './drapog.icon.js';
import { BUILTIN_ICONS } from './drapog.icons.js';

/** 规范化主题标识：'windows'/'win' → windows，其余 → macos */
export function normalizeTheme(t) {
  return (t === 'windows' || t === 'win') ? 'windows' : 'macos';
}

/** 主题外观配置：窗口控件位置/样式、顶部菜单栏 vs 无、底部 dock vs 任务栏、壁纸渐变 */
const THEMES = {
  macos:   { controlsSide: 'left',  controls: 'circles', topBar: 'menubar', bottomBar: 'dock',
             wall: ['#1b2a4a', '#3a1c4a', '#0d0d12'],
             palette: { bg: [38,38,42], fg: [232,232,237], accent: [10,132,255], toolbar: [46,46,50], sel: [10,132,255] } },
  windows: { controlsSide: 'right', controls: 'squares', topBar: 'none',    bottomBar: 'taskbar',
             wall: ['#0a3d91', '#0f6cbd', '#04122b'],
             palette: { bg: [32,32,36], fg: [232,232,237], accent: [15,108,189], toolbar: [40,40,46], sel: [15,108,189] } },
};

// 主题语义色板展平为固定顺序数组，供 drapp 经 win_theme(slot) 读取
function paletteArray(theme) {
  const p = (theme && theme.palette) || { bg: [0,0,0], fg: [255,255,255], accent: [10,132,255], toolbar: [40,40,40], sel: [10,132,255] };
  return [p.bg, p.fg, p.accent, p.toolbar, p.sel];
}

// 应用标题兜底表（仅当注册表尚未登记该 id 时使用；正常情况一律以 registry.name 为准）
const TITLES = {
  finder: 'Finder', terminal: 'Terminal', hello: 'Hello', calc: 'Calc',
  conv: 'Conv', docedit: 'DocEdit', appmgr: '应用', edit: 'TextEdit', settings: '设置', about: '关于本机',
  trash: '废纸篓', thispc: '此电脑',
};

export class WindowManager {
  constructor(canvas, opts = {}) {
    this.theme = normalizeTheme(opts.theme);
    this.themeConfigs = opts.themeConfigs || {};   // 来自 System/Themes/<id>.json
    this.T = Object.assign({}, THEMES[this.theme], this.themeConfigs[this.theme] || {});
    this.T.palette = paletteArray(this.T);
    this.TASKBAR_H = this.T.taskbarH || 48;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.windows = [];
    this.nextId = 1;
    this.zOrder = [];
    this.focusedId = null;
    this.dragState = null;
    this.hoverDesktopIconId = null;     // 悬停的桌面图标（高亮反馈）
    this.selectedDesktopIconId = null;  // 选中的桌面图标（仿真实 OS）
    this._lastDeskClick = null;        // 桌面图标双击判定

    this.MENU_BAR_H = 28;
    this.DOCK_H = 60;
    this.DOCK_MARGIN = 8;
    this.DOCK_ICON = 44;

    // 窗口缩放：边缘/角落热区宽度与最小尺寸
    this.RESIZE_EDGE = 6;
    this.RESIZE_MIN_W = 280;
    this.RESIZE_MIN_H = 160;

    // 软键盘（移动端调用实体键盘用）
    this.softKeyboard = { open: false };

    // dock/桌面 应用顺序（图标统一为 id 前两字母；guidemo/paint 演示应用已移除）
    this.apps = ['finder', 'terminal', 'hello', 'calc', 'conv', 'docedit', 'appmgr', 'edit', 'settings', 'about', 'trash', 'thispc']
      .map(id => ({ id, letter: appIcon(id), title: TITLES[id] || id }));

    this._appImpls = new Map();   // appId -> 实现
  }

  W() { return window.SCR_W; }
  H() { return window.SCR_H; }

  registerApp(id, impl) { this._appImpls.set(id, impl); }

  getApp(id) { return this._appImpls.get(id); }

  // 解析窗口的渲染/事件处理器：优先取真实 appId 的内建实现（host 应用）；
  // 若该窗口是 DrapLang 自举应用（带 __sys，其窗口 appId 为真实 id，但宿主桥接只注册在
  // '__drapapp__'），回退到统一宿主桥接，保证内容区渲染与鼠标/键盘/右键路由生效。
  appHandler(win) {
    const a = this.getApp(win.appId);
    if (a) return a;
    if (win && win.__sys) return this.getApp('__drapapp__');
    return null;
  }

  // 运行时切换主题（如 shell 里 `gui windows`）：更新配置，下一帧 render 即生效
  setTheme(theme) {
    this.theme = normalizeTheme(theme);
    this.T = Object.assign({}, THEMES[this.theme], this.themeConfigs[this.theme] || {});
    this.T.palette = paletteArray(this.T);
    this.TASKBAR_H = this.T.taskbarH || 48;
  }
  // 偏好持久化（IndexedDB，不依赖文件夹挂载；刷新后也能恢复）
  async savePrefs() {
    try {
      await idbSet('prefs', {
        theme: this.theme,
        softKeyboard: !!(this.softKeyboard && this.softKeyboard.open),
      });
    } catch (e) { /* 无 IndexedDB 环境忽略 */ }
  }
  async loadPrefs() {
    try {
      const p = await idbGet('prefs');
      if (p && typeof p === 'object') {
        if (p.theme) this.setTheme(p.theme);
        if (this.softKeyboard && typeof p.softKeyboard === 'boolean') this.softKeyboard.open = p.softKeyboard;
      }
    } catch (e) { /* 无 IndexedDB 环境忽略 */ }
  }

  createWindow(opts) {
    const id = this.nextId++;
    const win = {
      id,
      x: opts.x ?? 100,
      y: opts.y ?? 100,
      w: opts.w ?? 400,
      h: opts.h ?? 300,
      title: opts.title ?? 'Untitled',
      appId: opts.appId ?? null,
      TITLEBAR_H: 34,
      minimized: false,
      maximized: false,
      prevRect: null,
      needRedraw: true,
      __openPath: opts.openPath || null,   // 初始导航路径（如 ThisPC 双击在 Finder 打开）
    };
    this.windows.push(win);
    this.zOrder.push(id);
    this.focusedId = id;

    const app = this.getApp(win.appId);
    if (app && app.create) {
      try { app.create(win, this); } catch (e) { console.error('app.create', e); }
    }
    return win;
  }

  closeWindow(id) {
    this.windows = this.windows.filter(w => w.id !== id);
    this.zOrder = this.zOrder.filter(i => i !== id);
    if (this.focusedId === id) this.focusedId = this.zOrder[this.zOrder.length - 1] ?? null;
    if (this.dragState && this.dragState.id === id) this.dragState = null;
  }

  minimizeWindow(id) {
    const w = this.windows.find(w => w.id === id);
    if (!w) return;
    w.minimized = true;
    this.zOrder = this.zOrder.filter(i => i !== id);
    if (this.focusedId === id) this.focusedId = this.zOrder[this.zOrder.length - 1] ?? null;
  }

  restoreWindow(id) {
    const w = this.windows.find(w => w.id === id);
    if (!w) return;
    w.minimized = false;
    this.zOrder = this.zOrder.filter(i => i !== id);
    this.zOrder.push(id);
    this.focusedId = id;
  }

  toggleMaximize(id) {
    const w = this.windows.find(w => w.id === id);
    if (!w) return;
    if (w.maximized) {
      if (w.prevRect) {
        w.x = w.prevRect.x;
        w.y = w.prevRect.y;
        w.w = w.prevRect.w;
        w.h = w.prevRect.h;
      }
      w.maximized = false;
    } else {
      w.prevRect = { x: w.x, y: w.y, w: w.w, h: w.h };
      const wa = this.workArea();
      w.x = 0;
      w.y = wa.top;
      w.w = this.W();
      w.h = this.H() - wa.top - wa.bottom;
      w.maximized = true;
    }
  }

  bringToFront(id) {
    this.zOrder = this.zOrder.filter(i => i !== id);
    this.zOrder.push(id);
    this.focusedId = id;
  }

  visibleWindows() {
    const list = [];
    for (let i = this.zOrder.length - 1; i >= 0; i--) {
      const w = this.windows.find(w => w.id === this.zOrder[i]);
      if (w) list.push(w);
    }
    return list;
  }

  minimizedWindows() {
    return this.windows.filter(w => w.minimized);
  }

  hitTest(x, y) {
    for (const w of this.visibleWindows()) {
      if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return w;
    }
    return null;
  }

  // 可用工作区（顶部菜单栏 / 底部 dock 或任务栏之外）
  workArea() {
    const top = this.T.topBar === 'menubar' ? this.MENU_BAR_H : 0;
    const bottom = this.T.bottomBar === 'dock' ? (this.DOCK_H + this.DOCK_MARGIN * 2) : this.TASKBAR_H;
    return { top, bottom };
  }

  btnPositions(w) {
    const cy = w.y + w.TITLEBAR_H / 2;
    if (this.T.controlsSide === 'right') {
      const cx = w.x + w.w - 20;   // Windows：关放在最右
      return {
        close:    { x: cx,      y: cy, r: 6 },
        minimize: { x: cx - 26, y: cy, r: 6 },
        maximize: { x: cx - 52, y: cy, r: 6 },
      };
    }
    const cx = w.x + 20;
    return {
      close:    { x: cx,      y: cy, r: 6 },
      minimize: { x: cx + 20, y: cy, r: 6 },
      maximize: { x: cx + 40, y: cy, r: 6 },
    };
  }

  hitButton(w, x, y) {
    const p = this.btnPositions(w);
    for (const k of ['close', 'minimize', 'maximize']) {
      const b = p[k];
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 3) * (b.r + 3)) return k;
    }
    return null;
  }

  hitTitleBar(w, x, y) {
    return y >= w.y && y < w.y + w.TITLEBAR_H && x >= w.x && x < w.x + w.w;
  }

  hitContent(w, x, y) {
    return x >= w.x && x < w.x + w.w
        && y >= w.y + w.TITLEBAR_H && y < w.y + w.h;
  }

  // 窗口边缘/角落缩放热区：返回 'n'/'s'/'e'/'w'/'ne'/'nw'/'se'/'sw' 或 null
  hitResize(w, x, y) {
    if (w.maximized) return null;
    const E = this.RESIZE_EDGE;
    const west  = x >= w.x && x < w.x + E;
    const east  = x >= w.x + w.w - E && x < w.x + w.w;
    const north = y >= w.y && y < w.y + E;
    const south = y >= w.y + w.h - E && y < w.y + w.h;
    if (!west && !east && !north && !south) return null;
    return (north ? 'n' : south ? 's' : '') + (west ? 'w' : east ? 'e' : '');
  }

  // 按方向应用缩放（以按下时的几何为基准，拖动期间实时计算）
  applyResize(w, x, y) {
    const d = this.dragState;
    if (w.maximized) return;
    d.moved = true;
    const minW = this.RESIZE_MIN_W, minH = this.RESIZE_MIN_H;
    const W = this.W(), H = this.H();
    const wa = this.workArea();
    const o = d.orig, dir = d.dir;
    let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
    if (dir.includes('e')) {
      const right = Math.min(Math.max(o.x + o.w + (x - d.sx), o.x + minW), W);
      nw = right - o.x;
    }
    if (dir.includes('s')) {
      const bottom = Math.min(Math.max(o.y + o.h + (y - d.sy), o.y + minH), H);
      nh = bottom - o.y;
    }
    if (dir.includes('w')) {
      const left = Math.min(Math.max(o.x + (x - d.sx), 0), o.x + o.w - minW);
      nx = left; nw = o.x + o.w - left;
    }
    if (dir.includes('n')) {
      const top = Math.min(Math.max(o.y + (y - d.sy), wa.top), o.y + o.h - minH);
      ny = top; nh = o.y + o.h - top;
    }
    w.x = Math.round(nx); w.y = Math.round(ny);
    w.w = Math.round(nw); w.h = Math.round(nh);
    w.needRedraw = true;
  }

  dockLayout() {
    const icons = this.apps;
    const minis = this.minimizedWindows();
    const n = icons.length + (minis.length > 0 ? 1 : 0) + minis.length;
    const spacing = 8;
    const innerW = n * this.DOCK_ICON + (n - 1) * spacing;
    const dockW = innerW + 16;
    const dockH = this.DOCK_H;
    const dockX = (this.W() - dockW) / 2;
    const dockY = this.H() - dockH - this.DOCK_MARGIN;
    return { dockX, dockY, dockW, dockH, spacing, icons, minis };
  }

  hitDock(x, y) {
    const L = this.dockLayout();
    if (y < L.dockY || y > L.dockY + L.dockH) return null;
    if (x < L.dockX || x > L.dockX + L.dockW) return null;
    const iconY = L.dockY + (L.dockH - this.DOCK_ICON) / 2;
    const items = [];
    let idx = 0;
    for (const app of L.icons) {
      items.push({ type: 'app', app, x: L.dockX + 8 + idx * (this.DOCK_ICON + L.spacing), y: iconY });
      idx++;
    }
    if (L.minis.length > 0) idx++;
    for (const w of L.minis) {
      items.push({ type: 'mini', win: w, x: L.dockX + 8 + idx * (this.DOCK_ICON + L.spacing), y: iconY });
      idx++;
    }
    for (const it of items) {
      if (x >= it.x && x < it.x + this.DOCK_ICON && y >= it.y && y < it.y + this.DOCK_ICON) return it;
    }
    return null;
  }

  onMouseDown(x, y) {
    // 锁屏 / 关机覆盖层优先
    if (this.locked) { this.unlock(); return; }
    if (this.shutdown) { this.powerOn(); return; }

    // 点击非桌面图标处时清除桌面图标选中态（点空白桌面也会取消选中）
    this.selectedDesktopIconId = null;

    // 主菜单打开：命中项则执行；点击另一个菜单栏标签则切换；否则关闭并吞掉本次点击
    if (this.menu) {
      if (this.T.topBar === 'menubar' && y < this.MENU_BAR_H) {
        const lbl = this.hitMenuBarLabel(x);
        if (lbl) { this.openBarMenu(lbl); return; }
      }
      this.runMenuAction(this.hitMenu(x, y));
      return;
    }

    // 右键菜单打开：命中项则执行，否则关闭
    if (this.ctxMenu) { this.runContextAction(this.hitContextMenu(x, y)); return; }

    // macOS：Apple 标志开主菜单；app 名 / 文件/编辑/... 菜单栏标签点击打开下拉
    if (this.T.topBar === 'menubar' && y < this.MENU_BAR_H) {
      if (this.hitAppleLogo(x, y)) { this.toggleMenu('apple'); return; }
      const lbl = this.hitMenuBarLabel(x);
      if (lbl) { this.openBarMenu(lbl); return; }
      if (this.hitMenuBar(x, y)) this.toggleSoftKeyboard();  // 右侧键盘按钮
      return;   // 菜单栏区域不穿透到下方窗口
    }

    // 软键盘（覆盖层）：优先处理按键点击
    if (this.softKeyboard.open) {
      const k = this.hitSoftKeyboard(x, y);
      if (k) { this._pressKey(k); return; }
    }

    // 底部栏：macOS dock / Windows 任务栏
    if (this.T.bottomBar === 'dock') {
      const hitD = this.hitDock(x, y);
      if (hitD) {
        if (hitD.type === 'app') this.launchApp(hitD.app);
        else if (hitD.type === 'mini') this.restoreWindow(hitD.win.id);
        return;
      }
    } else {
      const hitT = this.hitTaskbar(x, y);
      if (hitT) {
        if (hitT.type === 'start') this.toggleMenu('start');   // Start 开主菜单（不再直接开 AppMgr）
        else if (hitT.type === 'app') this.launchApp(hitT.app);
        else if (hitT.type === 'mini') this.restoreWindow(hitT.win.id);
        return;
      }
    }

    const w = this.hitTest(x, y);
    if (!w) {
      const di = this.hitDesktopIcon(x, y);
      if (di) {
        // 单击选中、双击启动（仿真实 OS 桌面交互）；单击只选中不启动
        const now = Date.now();
        if (this._lastDeskClick && this._lastDeskClick.id === di.id && now - this._lastDeskClick.t < 350) {
          this.selectedDesktopIconId = di.id;
          this.launchApp(di);
          this._lastDeskClick = null;
        } else {
          this.selectedDesktopIconId = di.id;
          this._lastDeskClick = { id: di.id, t: now };
        }
        return;
      }
      return;
    }
    this.bringToFront(w.id);

    const btn = this.hitButton(w, x, y);
    if (btn === 'close')    { this.closeWindow(w.id); return; }
    if (btn === 'minimize') { this.minimizeWindow(w.id); return; }
    if (btn === 'maximize') { this.toggleMaximize(w.id); return; }

    const dir = this.hitResize(w, x, y);
    if (dir) {
      this.dragState = { id: w.id, mode: 'resize', dir, sx: x, sy: y, orig: { x: w.x, y: w.y, w: w.w, h: w.h }, moved: false };
      return;
    }

    if (this.hitTitleBar(w, x, y)) {
      this.dragState = { id: w.id, mode: 'move', offsetX: x - w.x, offsetY: y - w.y, moved: false };
      return;
    }

    if (this.hitContent(w, x, y)) {
      const app = this.appHandler(w);
      if (app && app.onMouseDown) {
        const lx = x - w.x;
        const ly = y - w.y - w.TITLEBAR_H;
        try { app.onMouseDown(lx, ly, w, this); } catch (e) { console.error(e); }
      }
    }
  }

  onMouseMove(x, y) {
    // 无拖拽时更新桌面图标悬停高亮（持续帧渲染会自动刷新）
    if (!this.dragState) {
      const di = this.hitDesktopIcon(x, y);
      const id = di ? di.id : null;
      if (id !== this.hoverDesktopIconId) this.hoverDesktopIconId = id;
      return;
    }
    const w = this.windows.find(w => w.id === this.dragState.id);
    if (!w) { this.dragState = null; return; }
    if (this.dragState.mode === 'resize') { this.applyResize(w, x, y); return; }
    if (w.maximized) return;
    this.dragState.moved = true;
    w.x = x - this.dragState.offsetX;
    w.y = y - this.dragState.offsetY;
    if (w.y < this.workArea().top) w.y = this.workArea().top;
    if (w.x < 0) w.x = 0;
    if (w.x + w.w > this.W()) w.x = this.W() - w.w;
  }

  onMouseUp(x, y) {
    if (this.dragState && !this.dragState.moved && this.dragState.mode === 'move') {
      const w = this.windows.find(w => w.id === this.dragState.id);
      if (w && this.hitTitleBar(w, x, y) && !this.hitButton(w, x, y)) {
        const now = Date.now();
        if (this._lastClick && this._lastClick.id === w.id && now - this._lastClick.t < 350) {
          this.toggleMaximize(w.id);
          this._lastClick = null;
        } else {
          this._lastClick = { id: w.id, t: now };
        }
      }
    } else if (this.dragState && this.dragState.moved && this.dragState.mode === 'move') {
      const w = this.windows.find(w => w.id === this.dragState.id);
      if (w) this.snapWindow(w, x, y);
    }
    this.dragState = null;
  }

  onKeyDown(e) {
    if (this.locked) { this.unlock(); return; }
    if (this.shutdown) { this.powerOn(); return; }
    if (this.menu && e.key === 'Escape') { this.closeMenu(); return; }
    if (this.ctxMenu && e.key === 'Escape') { this.closeContextMenu(); return; }
    if (!this.focusedId) return;
    const w = this.windows.find(w => w.id === this.focusedId);
    if (!w || w.minimized) return;
    const app = this.appHandler(w);
    if (app && app.onKeyDown) {
      try {
        const handled = app.onKeyDown(e, w, this);
        if (handled) e.preventDefault();
      } catch (err) { console.error(err); }
    }
  }

  getCursor(x, y) {
    if (this.dragState) return 'grabbing';
    if (this.locked || this.shutdown) return 'pointer';
    if (this.menu && this.hitMenu(x, y)) return 'pointer';
    if (this.T.topBar === 'menubar' && y < this.MENU_BAR_H && (this.hitAppleLogo(x, y) || this.hitMenuBar(x, y) || this.hitMenuBarLabel(x))) return 'pointer';
    if (this.softKeyboard.open && this.hitSoftKeyboard(x, y)) return 'pointer';
    if (this.T.bottomBar === 'dock') { if (this.hitDock(x, y)) return 'pointer'; }
    else { if (this.hitTaskbar(x, y)) return 'pointer'; }
    const w = this.hitTest(x, y);
    if (!w) return this.hitDesktopIcon(x, y) ? 'pointer' : 'default';
    if (this.hitButton(w, x, y)) return 'pointer';
    const rdir = this.hitResize(w, x, y);
    if (rdir) {
      if (rdir === 'n' || rdir === 's') return 'ns-resize';
      if (rdir === 'e' || rdir === 'w') return 'ew-resize';
      if (rdir === 'ne' || rdir === 'sw') return 'nesw-resize';
      return 'nwse-resize';
    }
    if (this.hitTitleBar(w, x, y)) return 'grab';
    if (this.hitContent(w, x, y)) {
      const app = this.appHandler(w);
      if (app && app.getCursor) {
        const lx = x - w.x, ly = y - w.y - w.TITLEBAR_H;
        return app.getCursor(lx, ly, w, this) || 'default';
      }
    }
    return 'default';
  }

  /* ==================== 软键盘 ==================== */

  toggleSoftKeyboard() { this.softKeyboard.open = !this.softKeyboard.open; }

  // 菜单栏右侧的键盘切换按钮（位于 WiFi 图标与日期之间）
  kbButtonRect(W) { return { x: W - 210, y: 4, w: 36, h: this.MENU_BAR_H - 8 }; }
  hitMenuBar(x, y) {
    const W = this.W();
    const r = this.kbButtonRect(W);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // 软键盘布局（每行按键；w 为相对宽度，默认 1）
  softKeys() {
    return [
      [ { label:'1',key:'1' },{ label:'2',key:'2' },{ label:'3',key:'3' },{ label:'4',key:'4' },
        { label:'5',key:'5' },{ label:'6',key:'6' },{ label:'7',key:'7' },{ label:'8',key:'8' },
        { label:'9',key:'9' },{ label:'0',key:'0' },{ label:'-',key:'-' },{ label:'=',key:'=' } ],
      [ { label:'q',key:'q' },{ label:'w',key:'w' },{ label:'e',key:'e' },{ label:'r',key:'r' },
        { label:'t',key:'t' },{ label:'y',key:'y' },{ label:'u',key:'u' },{ label:'i',key:'i' },
        { label:'o',key:'o' },{ label:'p',key:'p' },{ label:'[',key:'[' },{ label:']',key:']' } ],
      [ { label:'a',key:'a' },{ label:'s',key:'s' },{ label:'d',key:'d' },{ label:'f',key:'f' },
        { label:'g',key:'g' },{ label:'h',key:'h' },{ label:'j',key:'j' },{ label:'k',key:'k' },
        { label:'l',key:'l' },{ label:';',key:';' },{ label:'\'',key:'\'' } ],
      [ { label:'z',key:'z' },{ label:'x',key:'x' },{ label:'c',key:'c' },{ label:'v',key:'v' },
        { label:'b',key:'b' },{ label:'n',key:'n' },{ label:'m',key:'m' },{ label:',',key:',' },
        { label:'.',key:'.' },{ label:'/',key:'/' } ],
      [ { label:'空格',key:' ', w:3 },{ label:'⌫',key:'Backspace' },{ label:'↵',key:'Enter' } ],
    ];
  }

  // 计算软键盘每个按键的屏幕矩形（渲染与命中共用，保证一致）
  softKeyRects(W, H) {
    const kb = this.softKeys();
    const pad = 6, keyH = 40, gap = 5;
    const rowsN = kb.length;
    const panelH = rowsN * (keyH + gap) + pad * 2;
    const y0 = H - this.DOCK_H - this.DOCK_MARGIN * 2 - 12 - panelH;
    const x0 = 10, panelW = W - 20;
    const rects = [];
    for (let r = 0; r < rowsN; r++) {
      const row = kb[r];
      let totalW = 0;
      for (const k of row) totalW += (k.w || 1);
      const kw = (panelW - pad * 2 - gap * (row.length - 1)) / totalW;
      let cx = x0 + pad;
      const ry = y0 + pad + r * (keyH + gap);
      for (const k of row) {
        const w = kw * (k.w || 1);
        rects.push({ x: cx, y: ry, w, h: keyH, key: k.key, label: k.label });
        cx += w + gap;
      }
    }
    return { rects, x0, y0, panelW, panelH };
  }

  hitSoftKeyboard(x, y) {
    const W = this.W(), H = this.H();
    const { rects } = this.softKeyRects(W, H);
    for (const r of rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // 把软键盘按键注入为合成按键事件，路由给当前焦点窗口（与真实键盘同一路径）
  _pressKey(k) {
    const synth = { key: k.key, preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false };
    this.onKeyDown(synth);
  }

  renderSoftKeyboard(W, H) {
    if (!this.softKeyboard.open) return;
    const { rects, x0, y0, panelW, panelH } = this.softKeyRects(W, H);
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(18,18,24,0.97)';
    this.roundRect(x0, y0, panelW, panelH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    this.roundRect(x0, y0, panelW, panelH, 12);
    ctx.stroke();
    for (const r of rects) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      this.roundRect(r.x, r.y, r.w, r.h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      this.roundRect(r.x, r.y, r.w, r.h, 6);
      ctx.stroke();
      ctx.fillStyle = r.key === ' ' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.92)';
      ctx.font = '15px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.label === ' ' ? '空格' : r.label, r.x + r.w / 2, r.y + r.h / 2);
    }
    ctx.restore();
  }

  launchApp(app) {
    const impl = this.getApp(app.id);
    if (impl && typeof impl.launch === 'function') { impl.launch(this); return; }
    // 无 WM 实现但注册表里有（DrapLang 应用：gui 交 WM、cli 跑终端）→ 统一经注册表启动
    if (!impl && this.registry && this.registry.get(app.id)) {
      this.registry.launch(app.id, { wm: this, vfs: this.vfs || null, openPath: app.openPath || null })
        .catch(e => console.error('应用启动失败', app.id, e));
      return;
    }

    const existing = this.windows.find(w => w.appId === app.id && w.minimized);
    if (existing) { this.restoreWindow(existing.id); return; }
    const offset = (this.windows.length % 5) * 24;
    this.createWindow({
      x: 120 + offset,
      y: 80 + offset,
      w: 620,
      h: 420,
      title: app.title,
      appId: app.id,
    });
  }

  // 在 Finder 里打开指定路径（ThisPC 双击用）：Finder 已改为 DrapLang 自举，统一经注册表启动并透传 openPath
  openFinderAt(path) {
    if (this.registry) {
      this.registry.launch('finder', { wm: this, vfs: this.vfs || null, openPath: path })
        .catch(e => console.error('Finder 启动失败', e));
    }
  }

  /* ==================== 渲染 ==================== */

  render() {
    const W = this.W(), H = this.H();
    this.renderWallpaper(W, H);
    this.renderDesktopIcons(W, H);
    for (const id of this.zOrder) {
      const w = this.windows.find(w => w.id === id);
      if (w && !w.minimized) this.renderWindow(w);
    }
    if (this.T.topBar === 'menubar') this.renderMenuBar(W);
    if (this.T.bottomBar === 'dock') this.renderDock(W, H);
    else this.renderTaskbar(W, H);
    this.renderSoftKeyboard(W, H);
    if (this.menu) this.renderMenu();
    if (this.ctxMenu) this.renderContextMenu();
    if (this.locked) this.renderLock();
    if (this.shutdown) this.renderShutdown();
  }

  /* ---------- 桌面图标（点击启动应用） ---------- */
  bottomBarH() { return this.T.bottomBar === 'dock' ? (this.DOCK_H + this.DOCK_MARGIN * 2) : this.TASKBAR_H; }

  desktopIconLayout(W, H) {
    const tile = 60, gap = 12, x0 = 18;
    const y0 = (this.T.topBar === 'menubar' ? this.MENU_BAR_H : 0) + 16;
    const avail = H - y0 - this.bottomBarH() - 16;
    const perCol = Math.max(1, Math.floor(avail / (tile + gap + 20)));
    const cells = [];
    for (let i = 0; i < this.apps.length; i++) {
      const a = this.apps[i];
      const col = Math.floor(i / perCol), row = i % perCol;
      const x = x0 + col * (tile + gap);
      const y = y0 + row * (tile + gap + 20);
      cells.push({ x, y, tile, letter: a.letter, title: this.appMeta(a.id).name, id: a.id });
    }
    return { cells };
  }

  // 选取应用显示图标：registry 里若配了 emoji（含非 ASCII）则优先用；否则退回 monogram 字母
  appGlyph(id, letter) {
    const rec = this.registry && this.registry.apps.get(id);
    const icon = rec && rec.icon;
    if (icon && /[^\x00-\x7F]/.test(icon)) return icon;     // 含非 ASCII（emoji / ◆ 等）→ 用原图标
    return letter || (icon ? icon[0] : '?');                 // 否则用两字母 monogram
  }

  // 应用元数据：名称/字母统一从注册表取（单一真相源），硬 TITLES 仅兜底 —— 改名自动同步到桌面/Dock/菜单栏
  appMeta(id) {
    const rec = this.registry && this.registry.apps.get(id);
    const name = (rec && rec.name) || TITLES[id] || id;
    const letter = (rec && rec.icon && rec.icon.length === 1) ? rec.icon : appIcon(id);
    return { name, letter };
  }

  /* ---------- 手绘应用图标（macOS 风格） ----------
     图标规格来源：.app 包内 icon.json（挂载模式经 registry.scan 读取；内存模式 gui.js 异步 fetch）
     或 host 应用注册时的内联 iconSpec。格式：
       { "bg": ["#顶色", "#底色"],            // 1~2 个颜色，垂直渐变
         "fg": [ 图形指令... ] }              // 0–100 归一化坐标
     图形指令：{t:'r',x,y,w,h,rad,c} 圆角矩形 | {t:'c',cx,cy,r,c} 圆 | {t:'l',x1,y1,x2,y2,w,c} 线段
              | {t:'p',pts:[[x,y]...],c,close} 多边形 | {t:'t',s,x,y,size,c,bold} 文字 */
  iconSpecOf(id) {
    const rec = this.registry && this.registry.apps && this.registry.apps.get(id);
    // 优先用注册表记录的 iconSpec（挂载磁盘时由 scan 从 icon.json 读取）；
    // 内存/ Pages 模式无磁盘时回退到内建图标表，保证永远渲染手绘 macOS 图标（零网络依赖）。
    return (rec && rec.iconSpec) || (BUILTIN_ICONS[id] || null);
  }

  // 在 (x, y, size) 画 macOS 风格 squircle 图标；有规格返回 true，无规格返回 false（调用方退回旧渲染）
  drawAppIcon(id, x, y, size, dim = false) {
    const spec = this.iconSpecOf(id);
    if (!spec || !Array.isArray(spec.fg)) return false;
    const ctx = this.ctx;
    const bg = Array.isArray(spec.bg) ? spec.bg : [spec.bg || '#9a9aa0', spec.bg || '#6d6d74'];
    const rad = Math.max(4, Math.round(size * 0.225));      // macOS squircle 圆角比例
    if (dim) ctx.globalAlpha = 0.55;
    // 底板：垂直渐变 + 细描边
    const g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, bg[0]);
    g.addColorStop(1, bg[bg.length - 1]);
    ctx.fillStyle = g;
    this.roundRect(x, y, size, size, rad); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    this.roundRect(x + 0.5, y + 0.5, size - 1, size - 1, rad); ctx.stroke();
    // 顶部玻璃高光
    const hl = ctx.createLinearGradient(x, y, x, y + size * 0.55);
    hl.addColorStop(0, 'rgba(255,255,255,0.30)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + size - rad, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + rad);
    ctx.lineTo(x + size, y + size * 0.55);
    ctx.lineTo(x, y + size * 0.55);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.fill();
    // 图形指令（裁剪到 squircle 内，坐标 0–100 → size）
    const k = size / 100;
    ctx.save();
    this.roundRect(x, y, size, size, rad); ctx.clip();
    for (const s of spec.fg) {
      const c = s.c || '#fff';
      if (s.t === 'r') {
        ctx.fillStyle = c;
        this.roundRect(x + s.x * k, y + s.y * k, s.w * k, s.h * k, (s.rad || 0) * k); ctx.fill();
      } else if (s.t === 'c') {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + s.cx * k, y + s.cy * k, Math.max(0.5, s.r * k), 0, Math.PI * 2);
        ctx.fill();
      } else if (s.t === 'l') {
        ctx.strokeStyle = c;
        ctx.lineWidth = Math.max(1, (s.w || 5) * k);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + s.x1 * k, y + s.y1 * k);
        ctx.lineTo(x + s.x2 * k, y + s.y2 * k);
        ctx.stroke();
      } else if (s.t === 'p') {
        ctx.fillStyle = c;
        ctx.beginPath();
        (s.pts || []).forEach((p, i) => i === 0
          ? ctx.moveTo(x + p[0] * k, y + p[1] * k)
          : ctx.lineTo(x + p[0] * k, y + p[1] * k));
        if (s.close !== false) ctx.closePath();
        ctx.fill();
      } else if (s.t === 't') {
        ctx.fillStyle = c;
        ctx.font = (s.bold ? '600 ' : '') + Math.round((s.size || 30) * k) + 'px -apple-system, "PingFang SC", "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.s, x + s.x * k, y + s.y * k);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
  }

  renderDesktopIcons(W, H) {
    const ctx = this.ctx;
    const { cells } = this.desktopIconLayout(W, H);
    for (const c of cells) {
      // 选中 / 悬停高亮（仿真实 OS：半透明高亮框 + 边框，对标 CSPS .s-icon.selected）
      const sel = c.id === this.selectedDesktopIconId;
      const hov = c.id === this.hoverDesktopIconId && !sel;
      if (sel || hov) {
        const bx = c.x - 6, by = c.y - 6, bw = c.tile + 12, bh = c.tile + 22;
        const sc = this.T.palette[4];  // 主题强调色 sel（macOS 蓝 / Windows 蓝）
        ctx.fillStyle = sel ? `rgba(${sc[0]}, ${sc[1]}, ${sc[2]}, 0.30)` : 'rgba(255, 255, 255, 0.10)';
        this.roundRect(bx, by, bw, bh, 8); ctx.fill();
        if (sel) {
          ctx.strokeStyle = `rgba(${sc[0]}, ${sc[1]}, ${sc[2]}, 0.65)`;
          ctx.lineWidth = 1;
          this.roundRect(bx, by, bw, bh, 8); ctx.stroke();
        }
      }
      if (!this.drawAppIcon(c.id, c.x, c.y, c.tile)) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        this.roundRect(c.x, c.y, c.tile, c.tile, 12); ctx.fill();
        const glyph = this.appGlyph(c.id, c.letter);
        const isEmoji = /[^\x00-\x7F]/.test(glyph);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = (isEmoji ? '30px' : '26px') + ' -apple-system, "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(glyph, c.x + c.tile / 2, c.y + c.tile / 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(c.title.slice(0, 6), c.x + c.tile / 2, c.y + c.tile + 4);
    }
  }

  hitDesktopIcon(x, y) {
    const { cells } = this.desktopIconLayout(this.W(), this.H());
    for (const c of cells) {
      if (x >= c.x && x <= c.x + c.tile && y >= c.y && y <= c.y + c.tile) {
        return { id: c.id, letter: c.letter, title: c.title };
      }
    }
    return null;
  }

  // 拖拽落点吸附：左/右边缘 → 半屏；顶部 → 最大化
  snapWindow(w, x, y) {
    if (w.maximized) return;
    const wa = this.workArea();
    const zone = 12;
    const W = this.W(), H = this.H();
    if (w.x <= zone) {
      w.x = 0; w.y = wa.top; w.w = Math.floor(W / 2); w.h = H - wa.top - wa.bottom; w.prevRect = null;
    } else if (w.x + w.w >= W - zone) {
      w.x = Math.floor(W / 2); w.y = wa.top; w.w = W - Math.floor(W / 2); w.h = H - wa.top - wa.bottom; w.prevRect = null;
    } else if (w.y <= wa.top + zone) {
      this.toggleMaximize(w.id);
    }
  }

  renderWallpaper(W, H) {
    const ctx = this.ctx;
    const [c0, c1, c2] = this.T.wall;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c0);
    g.addColorStop(0.45, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  renderWindow(w) {
    const ctx = this.ctx;
    const R = 10;
    const focused = this.focusedId === w.id;

    // 阴影
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = focused ? 28 : 16;
    ctx.shadowOffsetY = focused ? 8 : 4;
    ctx.fillStyle = 'rgba(38, 38, 42, 0.98)';
    this.roundRect(w.x, w.y, w.w, w.h, R);
    ctx.fill();
    ctx.restore();

    // 边框（1px 实边 + 顶部内高光，增强玻璃质感与景深）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    this.roundRect(w.x, w.y, w.w, w.h, R);
    ctx.stroke();

    // 标题栏底（细竖向渐变，比纯平色更有真实景深，对标 CSPS 窗口标题栏）
    ctx.save();
    ctx.beginPath();
    this.roundRect(w.x, w.y, w.w, w.TITLEBAR_H + R, R);
    ctx.clip();
    const tg = ctx.createLinearGradient(0, w.y, 0, w.y + w.TITLEBAR_H);
    if (focused) { tg.addColorStop(0, 'rgba(76, 76, 84, 0.99)'); tg.addColorStop(1, 'rgba(50, 50, 58, 0.99)'); }
    else         { tg.addColorStop(0, 'rgba(60, 60, 68, 0.98)'); tg.addColorStop(1, 'rgba(42, 42, 48, 0.98)'); }
    ctx.fillStyle = tg;
    ctx.fillRect(w.x, w.y, w.w, w.TITLEBAR_H);
    // 顶边内高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(w.x + R, w.y + 0.5, w.w - 2 * R, 1);
    ctx.restore();

    // 标题栏底部分隔线
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y + w.TITLEBAR_H);
    ctx.lineTo(w.x + w.w, w.y + w.TITLEBAR_H);
    ctx.stroke();

    // 内容区（裁剪后交给 app 渲染）
    const app = this.appHandler(w);
    if (app && app.render) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x, w.y + w.TITLEBAR_H, w.w, w.h - w.TITLEBAR_H);
      ctx.clip();
      ctx.translate(w.x, w.y + w.TITLEBAR_H);
      try { app.render(ctx, w, this); } catch (e) { console.error(e); }
      ctx.restore();
    }

    // 标题文字
    ctx.fillStyle = focused ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.55)';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(w.title, w.x + w.w / 2, w.y + w.TITLEBAR_H / 2);

    // 窗口控件（主题：macOS 三色圆点 / Windows 方形按钮）
    const p = this.btnPositions(w);
    const alpha = focused ? 1 : 0.6;
    ctx.globalAlpha = alpha;
    if (this.T.controls === 'circles') {
      this.drawCircle(p.close.x, p.close.y, p.close.r, '#ff5f57');
      this.drawCircle(p.minimize.x, p.minimize.y, p.minimize.r, '#febc2e');
      this.drawCircle(p.maximize.x, p.maximize.y, p.maximize.r, '#28c840');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      { const cx = p.close.x, cy = p.close.y, r = 3;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
        ctx.stroke(); }
      { const cx = p.minimize.x, cy = p.minimize.y, r = 3;
        ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); }
      { const cx = p.maximize.x, cy = p.maximize.y, r = 3.2; const s = r * 0.7;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx - r + s, cy - r);
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx - r, cy - r + s);
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx - r + s * 0.55, cy - r + s * 0.55);
        ctx.moveTo(cx + r, cy + r); ctx.lineTo(cx + r - s, cy + r);
        ctx.moveTo(cx + r, cy + r); ctx.lineTo(cx + r, cy + r - s);
        ctx.moveTo(cx + r, cy + r); ctx.lineTo(cx + r - s * 0.55, cy + r - s * 0.55);
        ctx.stroke(); }
    } else {
      const bs = 22;   // Windows 方形按钮命中/绘制边长（< 26 间距，避免重叠）
      this.drawSquareBtn(p.minimize.x, p.minimize.y, bs, focused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
      this.drawSquareBtn(p.maximize.x, p.maximize.y, bs, focused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
      this.drawSquareBtn(p.close.x, p.close.y, bs, 'rgba(232,17,35,0.9)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      { const cx = p.minimize.x, cy = p.minimize.y;
        ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.stroke(); }
      { const cx = p.maximize.x, cy = p.maximize.y, r = 4; ctx.strokeRect(cx - r, cy - r, r * 2, r * 2); }
      { const cx = p.close.x, cy = p.close.y, r = 4;
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); }
    }
  }

  drawCircle(cx, cy, r, fill) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // Windows 风方形窗口按钮（以 cx,cy 为中心）
  drawSquareBtn(cx, cy, size, fill) {
    const ctx = this.ctx;
    const x = cx - size / 2, y = cy - size / 2;
    ctx.beginPath();
    this.roundRect(x, y, size, size, 4);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /* ---------- Windows 任务栏（底部） ---------- */
  taskbarLayout() {
    const H = this.H();
    const ty = H - this.TASKBAR_H;
    const cy = ty + this.TASKBAR_H / 2;
    const start = { x: 8, y: cy - 16, w: 36, h: 32 };
    const apps = [];
    let ix = 48;
    for (const app of this.apps) { apps.push({ app, x: ix, y: cy - 16, w: 32, h: 32 }); ix += 36; }
    const minis = [];
    let mx = ix + 8;
    for (const w of this.minimizedWindows()) { minis.push({ win: w, x: mx, y: cy - 14, w: 92, h: 28 }); mx += 96; }
    return { ty, cy, start, apps, minis };
  }

  renderTaskbar(W) {
    const ctx = this.ctx;
    const L = this.taskbarLayout();
    const { ty, cy } = L;
    ctx.fillStyle = 'rgba(18, 18, 22, 0.94)';
    ctx.fillRect(0, ty, W, this.TASKBAR_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();

    // Start 按钮（四格蓝方块）
    const sx = L.start.x + 8, q = 5, gap = 2.5, sy = cy - (q * 2 + gap) / 2;
    ctx.fillStyle = '#4fc1ff';
    ctx.fillRect(sx, sy, q, q);
    ctx.fillRect(sx + q + gap, sy, q, q);
    ctx.fillRect(sx, sy + q + gap, q, q);
    ctx.fillRect(sx + q + gap, sy + q + gap, q, q);

    // 应用图标
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const it of L.apps) {
      const s = Math.min(it.w, it.h), ix = it.x + (it.w - s) / 2, iy = it.y + (it.h - s) / 2;
      if (!this.drawAppIcon(it.app.id, ix, iy, s)) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        this.roundRect(it.x, it.y, it.w, it.h, 6); ctx.fill();
        const glyph = this.appGlyph(it.app.id, it.app.letter);
        const isEmoji = /[^\x00-\x7F]/.test(glyph);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = (isEmoji ? '20px' : '600 12px') + ' -apple-system, "Apple Color Emoji", "Segoe UI", sans-serif';
        ctx.fillText(glyph, it.x + it.w / 2, cy + 1);
      }
    }
    // 最小化窗口
    for (const it of L.minis) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      this.roundRect(it.x, it.y, it.w, it.h, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(it.win.title).slice(0, 12), it.x + 8, cy);
      ctx.textAlign = 'center';
    }
    // 时钟（右）
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '13px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(hh + ':' + mm, W - 14, cy);
    ctx.textAlign = 'left';
  }

  hitTaskbar(x, y) {
    const L = this.taskbarLayout();
    if (y < L.ty) return null;
    if (x >= L.start.x && x < L.start.x + L.start.w && y >= L.start.y && y < L.start.y + L.start.h) return { type: 'start' };
    for (const it of L.apps) {
      if (x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h) return { type: 'app', app: it.app };
    }
    for (const it of L.minis) {
      if (x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h) return { type: 'mini', win: it.win };
    }
    return null;
  }

  /* ---------- 主菜单（macOS Apple 菜单 / Windows 开始菜单）+ 电源/锁屏 ---------- */
  hitAppleLogo(x, y) { return x >= 8 && x < 34 && y >= 4 && y < this.MENU_BAR_H - 4; }
  toggleMenu(kind) { this.menu = (this.menu && this.menu.kind === kind) ? null : { kind }; }
  closeMenu() { this.menu = null; }

  appleMenuLayout() {
    const items = [
      { label: '关于本机', action: 'about' },
      { label: '系统设置...', action: 'settings' },
      { label: '强制退出...', action: 'forcequit' },
      { sep: true },
      { label: '锁定屏幕', action: 'lock' },
      { label: '重新启动...', action: 'restart' },
      { label: '关机...', action: 'shutdown' },
    ];
    const w = 220, rowH = 26, pad = 8;
    let h = pad * 2;
    for (const it of items) h += it.sep ? 12 : rowH;
    return { x: 6, y: this.MENU_BAR_H, w, h, items, rowH, pad };
  }

  /* ---------- 菜单栏标签命中（app 名 / 文件/编辑/显示/前往/窗口/帮助） ---------- */
  menuBarLabels(W) {
    const L = this.menuBarLayout(W);
    const ctx = this.ctx;
    const labels = [];
    ctx.font = '600 13.5px -apple-system, sans-serif';
    const aw = ctx.measureText(L.appName).width + 18;
    labels.push({ label: 'app', x: L.appNameX, w: aw });
    ctx.font = '13.5px -apple-system, sans-serif';
    let mx = L.appNameX + aw + 6;
    for (const m of L.menus) {
      const w = ctx.measureText(m).width + 22;
      labels.push({ label: m, x: mx, w });
      mx += w;
    }
    return labels;
  }
  hitMenuBarLabel(x) {
    if (!this._mbLabels) return null;
    for (const l of this._mbLabels) { if (x >= l.x && x < l.x + l.w) return l.label; }
    return null;
  }

  /* ---------- 下拉菜单项（文件/编辑/显示/前往/窗口/帮助/app） ---------- */
  barMenuItems(name) {
    const focusWin = this.focusedId ? this.windows.find(w => w.id === this.focusedId) : null;
    const an = focusWin ? this.appMeta(focusWin.appId).name : '应用';
    switch (name) {
      case 'app': return [
        { label: '关于本机', action: 'about' },
        { sep: true },
        { label: '隐藏“' + an + '”', action: 'hideapp' },
        { label: '退出“' + an + '”', action: 'quitapp' },
      ];
      case '文件': return [
        { label: '新建窗口', action: 'newwin' },
        { label: '打开…', action: 'open' },
        { sep: true },
        { label: '关闭窗口', action: 'closewin' },
        { label: '保存', action: 'save' },
        { sep: true },
        { label: '打印…', action: 'print' },
      ];
      case '编辑': return [
        { label: '撤销', action: 'undo' },
        { label: '重做', action: 'redo' },
        { sep: true },
        { label: '剪切', action: 'cut' },
        { label: '复制', action: 'copy' },
        { label: '粘贴', action: 'paste' },
        { label: '全选', action: 'selectall' },
      ];
      case '显示': return [
        { label: '进入全屏幕', action: 'fullscreen' },
        { sep: true },
        { label: (this.theme === 'macos' ? '切换到 Windows 主题' : '切换到 macOS 主题'), action: 'toggletheme' },
        { label: '隐藏其他窗口', action: 'hideothers' },
        { label: '全部显示', action: 'showall' },
      ];
      case '前往': return [
        { label: '访达', action: 'goto:finder' },
        { label: '应用程序', action: 'goto:/Applications' },
        { label: '桌面', action: 'goto:/Users/guest/Desktop' },
        { label: '文稿', action: 'goto:/Users/guest/Documents' },
        { label: '下载', action: 'goto:/Users/guest/Downloads' },
        { sep: true },
        { label: '此电脑', action: 'goto:thispc' },
      ];
      case '窗口': return [
        { label: '最小化', action: 'minimize' },
        { label: '关闭窗口', action: 'closewin' },
        { sep: true },
        { label: '全部置于顶层', action: 'frontall' },
        { sep: true },
        { label: '强制退出…', action: 'forcequit' },
      ];
      case '帮助': return [
        { label: 'DrapOG 帮助', action: 'help' },
        { label: '关于本机', action: 'about' },
      ];
      default: return [];
    }
  }

  barMenuLayout(name, items) {
    const W = this.W();
    const labels = this._mbLabels || this.menuBarLabels(W);
    let x = 40;
    const lbl = labels.find(l => l.label === name);
    if (lbl) x = lbl.x;
    const w = 220, rowH = 26, pad = 8;
    let h = pad * 2;
    for (const it of items) h += it.sep ? 12 : rowH;
    return { x, y: this.MENU_BAR_H, w, h, items, rowH, pad };
  }
  openBarMenu(name) {
    let items = (name === 'forcequit') ? this.windowListItems() : this.barMenuItems(name);
    this.menu = Object.assign({ kind: 'bar', name }, this.barMenuLayout(name, items));
  }

  // 强制退出：列出当前打开的窗口，点击可强制关闭（处理无响应程序）
  windowListItems() {
    const items = [];
    if (this.windows.length === 0) { items.push({ label: '无运行中的窗口', action: '__none' }); return items; }
    for (const w of this.windows) {
      const an = w.appId ? this.appMeta(w.appId).name : '窗口';
      items.push({ label: (w.title || '窗口') + '  —  ' + an, action: 'kill:' + w.id });
    }
    return items;
  }
  startMenuLayout() {
    const H = this.H();
    const cols = 4, iconS = 44, gap = 10, pad = 14;
    const rows = Math.ceil(this.apps.length / cols);
    const gridH = rows * (iconS + 22) + (rows - 1) * gap;
    const powerH = 42;
    const power = [
      { label: '锁定', action: 'lock' },
      { label: '注销', action: 'logout' },
      { label: '重启', action: 'restart' },
      { label: '关机', action: 'shutdown' },
    ];
    const w = 340;
    const h = pad + 32 + gridH + 14 + powerH + pad;
    return { x: 6, y: H - this.TASKBAR_H - h - 6, w, h, cols, iconS, gap, pad, power, powerH };
  }
  hitMenu(x, y) {
    if (!this.menu) return null;
    if (this.menu.kind === 'apple') {
      const L = this.appleMenuLayout();
      if (x < L.x || x > L.x + L.w || y < L.y || y > L.y + L.h) return null;
      let iy = L.y + L.pad;
      for (const it of L.items) {
        const h = it.sep ? 12 : L.rowH;
        if (!it.sep && y >= iy && y < iy + h) return it.action;
        iy += h;
      }
      return null;
    }
    if (this.menu.kind === 'bar') {
      const L = this.menu;
      if (x < L.x || x > L.x + L.w || y < L.y || y > L.y + L.h) return null;
      let iy = L.y + L.pad;
      for (const it of L.items) {
        const h = it.sep ? 12 : L.rowH;
        if (!it.sep && y >= iy && y < iy + h) return it.action;
        iy += h;
      }
      return null;
    }
    const L = this.startMenuLayout();
    if (x < L.x || x > L.x + L.w || y < L.y || y > L.y + L.h) return null;
    const py = L.y + L.h - L.pad - L.powerH;
    if (y >= py) {
      const cw = (L.w - L.pad * 2) / L.power.length;
      const idx = Math.floor((x - L.x - L.pad) / cw);
      return (idx >= 0 && idx < L.power.length) ? L.power[idx].action : null;
    }
    const gx = L.x + L.pad, gy = L.y + L.pad + 32;
    const cellW = L.iconS + L.gap, cellH = L.iconS + 22 + L.gap;
    for (let i = 0; i < this.apps.length; i++) {
      const c = i % L.cols, r = Math.floor(i / L.cols);
      const ax = gx + c * cellW, ay = gy + r * cellH;
      if (x >= ax && x < ax + L.iconS && y >= ay && y < ay + L.iconS + 22) return { launch: this.apps[i].id };
    }
    return null;
  }
  runMenuAction(a) {
    if (!a) { this.closeMenu(); return; }
    // 强制退出：打开窗口列表菜单（不直接关闭）
    if (a === 'forcequit') { this.openBarMenu('forcequit'); return; }
    this.closeMenu();
    if (typeof a === 'object' && a.launch) {
      const app = this.apps.find(x => x.id === a.launch);
      this.launchApp(app || { id: a.launch, letter: appIcon(a.launch), title: a.launch });
      return;
    }
    if (typeof a === 'string' && a.startsWith('kill:')) { const id = parseInt(a.slice(5)); this.closeWindow(id); return; }
    if (a === '__none') return;
    const focusWin = this.focusedId ? this.windows.find(w => w.id === this.focusedId) : null;
    const dispatch = (act) => {
      if (!focusWin) return false;
      const app = this.getApp(focusWin.appId);
      if (app && typeof app.onMenuAction === 'function') { try { return app.onMenuAction(act, focusWin, this); } catch (e) { return false; } }
      // DrapLang 应用（窗口带 __sys）：把动作以 'menu <act>' 事件注入其 VM，由 drapp 的 on_menu 处理
      if (focusWin.__sys && typeof focusWin.__sys.injectWinEvent === 'function') {
        focusWin.__sys.injectWinEvent(focusWin.id, 'menu ' + act);
        return true;
      }
      return false;
    };
    switch (a) {
      case 'about': this.launchApp({ id: 'about', letter: 'Ab', title: '关于本机' }); break;
      case 'settings': this.launchApp({ id: 'settings', letter: 'Se', title: '设置' }); break;
      case 'lock': this.locked = true; this._loggedOut = false; break;
      case 'logout': this.locked = true; this._loggedOut = true; break;
      case 'restart': if (typeof location !== 'undefined') location.reload(); break;
      case 'shutdown': this.shutdown = true; break;
      // 文件
      case 'newwin': this.launchApp({ id: 'finder', letter: 'Fi', title: 'Finder' }); break;
      case 'open': this.launchApp({ id: 'finder', letter: 'Fi', title: 'Finder' }); break;
      case 'closewin': if (focusWin) this.closeWindow(focusWin.id); break;
      case 'save': dispatch('save'); break;
      case 'print': this.launchApp({ id: 'about', letter: 'Ab', title: '关于本机' }); break; // 占位：暂以关于本机替代打印对话框
      // 编辑
      case 'undo': dispatch('undo'); break;
      case 'redo': dispatch('redo'); break;
      case 'cut': dispatch('cut'); break;
      case 'copy': dispatch('copy'); break;
      case 'paste': dispatch('paste'); break;
      case 'selectall': dispatch('selectall'); break;
      // 显示
      case 'fullscreen': if (focusWin) this.toggleMaximize(focusWin.id); break;
      case 'toggletheme':
        this.setTheme(this.theme === 'macos' ? 'windows' : 'macos');
        this.savePrefs();
        break;
      case 'hideapp': if (focusWin) this.minimizeWindow(focusWin.id); break;
      case 'hideothers':
        for (const w of this.windows) { if (w !== focusWin && !w.minimized) this.minimizeWindow(w.id); }
        break;
      case 'showall':
        for (const w of this.windows) { if (w.minimized) this.restoreWindow(w.id); }
        break;
      // 前往
      case 'goto:finder': this.launchApp({ id: 'finder', letter: 'Fi', title: 'Finder' }); break;
      case 'goto:thispc': this.launchApp({ id: 'thispc', letter: 'P', title: '此电脑' }); break;
      case 'goto:/Applications': this.launchApp({ id: 'finder', letter: 'Fi', title: 'Finder', openPath: '/Applications' }); break;
      case 'goto:/Users/guest/Desktop': this.launchApp({ id: 'finder', letter: 'Fi', title: 'Finder', openPath: '/Users/guest/Desktop' }); break;
      case 'goto:/Users/guest/Documents': this.launchApp({ id: 'finder', letter: 'Fi', title: 'Finder', openPath: '/Users/guest/Documents' }); break;
      case 'goto:/Users/guest/Downloads': this.launchApp({ id: 'finder', letter: 'Fi', title: 'Finder', openPath: '/Users/guest/Downloads' }); break;
      // 窗口
      case 'minimize': if (focusWin) this.minimizeWindow(focusWin.id); break;
      case 'frontall': this.zOrder = this.windows.map(w => w.id); break;
      // 帮助
      case 'help': this.launchApp({ id: 'about', letter: 'Ab', title: '关于本机' }); break;
      // app 菜单
      case 'quitapp': if (focusWin) this.closeWindow(focusWin.id); break;
    }
  }
  unlock() { this.locked = false; this._loggedOut = false; }
  powerOn() { if (typeof location !== 'undefined') location.reload(); }

  /* ---------- 右键上下文菜单 ---------- */
  onContextMenu(x, y) {
    if (this.locked || this.shutdown || this.menu || this.ctxMenu) return;
    if (this.T.topBar === 'menubar' && y < this.MENU_BAR_H) return;
    const bottom = this.T.bottomBar === 'dock' ? (this.DOCK_H + this.DOCK_MARGIN * 2) : this.TASKBAR_H;
    if (y > this.H() - bottom) return;
    const w = this.hitTest(x, y);
    if (w) {
      const app = this.appHandler(w);
      const items = (app && app.contextMenu) ? app.contextMenu(x - w.x, y - w.y - w.TITLEBAR_H, w, this) : [{ label: '刷新', action: 'refresh' }];
      if (items && items.length) this.openContextMenu(x, y, items, null);
    } else {
      this.openContextMenu(x, y, [
        { label: '新建文件夹', action: 'newfolder' },
        { label: '新建文本', action: 'newfile' },
        { sep: true },
        { label: '刷新桌面', action: 'refresh' },
        { label: '个性化...', action: 'settings' },
      ], '/Users/guest/Desktop');
    }
  }
  openContextMenu(x, y, items, target) { this.ctxMenu = { x, y, items, target: target || null }; }
  closeContextMenu() { this.ctxMenu = null; }
  contextMenuLayout() {
    const items = this.ctxMenu.items;
    const rowH = 26, pad = 6, w = 176;
    let h = pad * 2;
    for (const it of items) h += it.sep ? 9 : rowH;
    const W = this.W(), H = this.H();
    let x = this.ctxMenu.x, y = this.ctxMenu.y;
    if (x + w > W - 4) x = W - w - 4;
    if (y + h > H - 4) y = H - h - 4;
    return { x, y, w, h, items, rowH, pad };
  }
  hitContextMenu(x, y) {
    if (!this.ctxMenu) return null;
    const L = this.contextMenuLayout();
    if (x < L.x || x > L.x + L.w || y < L.y || y > L.y + L.h) return null;
    let iy = L.y + L.pad;
    for (const it of L.items) {
      const h = it.sep ? 9 : L.rowH;
      if (!it.sep && y >= iy && y < iy + h) return it.action;
      iy += h;
    }
    return null;
  }
  async _uniqueName(dir, base) {
    const vfs = this.vfs;
    const norm = p => vfs.normalize(dir, p);
    if (!vfs || !(await vfs.exists(norm(base)))) return base;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let i = 2;
    while (await vfs.exists(norm(stem + ' ' + i + ext))) i++;
    return stem + ' ' + i + ext;
  }
  async runContextAction(a) {
    const target = this.ctxMenu ? this.ctxMenu.target : null;
    this.closeContextMenu();
    if (!a) return;
    if (typeof a === 'function') { a(this); return; }   // 应用自定义动作（如 Finder 右键）
    if (a === 'newfolder' || a === 'newfile') {
      const vfs = this.vfs; if (!vfs) return;
      const dir = target || '/Users/guest/Desktop';
      const base = a === 'newfolder' ? '新建文件夹' : '未命名.txt';
      const name = await this._uniqueName(dir, base);
      if (a === 'newfolder') await vfs.mkdir(vfs.normalize(dir, name));
      else await vfs.write(vfs.normalize(dir, name), '');
    } else if (a === 'settings') {
      this.launchApp({ id: 'settings', letter: 'Se', title: '设置' });
    }
    // 'refresh' 由各窗口自行处理；桌面无需操作
  }
  renderContextMenu() {
    const ctx = this.ctx;
    const L = this.contextMenuLayout();
    ctx.fillStyle = 'rgba(40,40,46,0.98)'; this.roundRect(L.x, L.y, L.w, L.h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; this.roundRect(L.x, L.y, L.w, L.h, 8); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let iy = L.y + L.pad;
    for (const it of L.items) {
      const h = it.sep ? 9 : L.rowH;
      if (it.sep) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(L.x + 6, iy + 4.5); ctx.lineTo(L.x + L.w - 6, iy + 4.5); ctx.stroke(); }
      else { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '13px -apple-system, sans-serif'; ctx.fillText(it.label, L.x + 14, iy + h / 2); }
      iy += h;
    }
  }

  renderMenu() {
    const ctx = this.ctx;
    if (this.menu.kind === 'apple') {
      const L = this.appleMenuLayout();
      ctx.fillStyle = 'rgba(30,30,36,0.98)'; this.roundRect(L.x, L.y, L.w, L.h, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; this.roundRect(L.x, L.y, L.w, L.h, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let iy = L.y + L.pad;
      for (const it of L.items) {
        const h = it.sep ? 12 : L.rowH;
        if (it.sep) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(L.x + 8, iy + 6); ctx.lineTo(L.x + L.w - 8, iy + 6); ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '14px -apple-system, sans-serif'; ctx.fillText(it.label, L.x + 14, iy + h / 2); }
        iy += h;
      }
    } else if (this.menu.kind === 'bar') {
      const L = this.menu;
      ctx.fillStyle = 'rgba(30,30,36,0.98)'; this.roundRect(L.x, L.y, L.w, L.h, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; this.roundRect(L.x, L.y, L.w, L.h, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let iy = L.y + L.pad;
      for (const it of L.items) {
        const h = it.sep ? 12 : L.rowH;
        if (it.sep) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(L.x + 8, iy + 6); ctx.lineTo(L.x + L.w - 8, iy + 6); ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '14px -apple-system, sans-serif'; ctx.fillText(it.label, L.x + 14, iy + h / 2); }
        iy += h;
      }
    } else {
      const L = this.startMenuLayout();
      ctx.fillStyle = 'rgba(24,24,30,0.98)'; this.roundRect(L.x, L.y, L.w, L.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; this.roundRect(L.x, L.y, L.w, L.h, 10); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '600 14px "Segoe UI", sans-serif';
      ctx.fillText('应用', L.x + L.pad, L.y + L.pad + 16);
      const gx = L.x + L.pad, gy = L.y + L.pad + 32;
      const cellW = L.iconS + L.gap, cellH = L.iconS + 22 + L.gap;
      ctx.textAlign = 'center';
      for (let i = 0; i < this.apps.length; i++) {
        const c = i % L.cols, r = Math.floor(i / L.cols);
        const ax = gx + c * cellW, ay = gy + r * cellH;
        if (!this.drawAppIcon(this.apps[i].id, ax, ay, L.iconS)) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; this.roundRect(ax, ay, L.iconS, L.iconS, 8); ctx.fill();
          const glyph = this.appGlyph(this.apps[i].id, this.apps[i].letter);
          const isEmoji = /[^\x00-\x7F]/.test(glyph);
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.font = (isEmoji ? '28px' : '600 14px') + ' -apple-system, "Apple Color Emoji", sans-serif';
          ctx.fillText(glyph, ax + L.iconS / 2, ay + L.iconS / 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '11px sans-serif';
        ctx.fillText(String(this.apps[i].title).slice(0, 6), ax + L.iconS / 2, ay + L.iconS + 14);
      }
      const py = L.y + L.h - L.pad - L.powerH;
      const cw = (L.w - L.pad * 2) / L.power.length;
      for (let i = 0; i < L.power.length; i++) {
        const bx = L.x + L.pad + i * cw;
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; this.roundRect(bx + 3, py + 4, cw - 6, L.powerH - 8, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '13px sans-serif';
        ctx.fillText(L.power[i].label, bx + cw / 2, py + L.powerH / 2);
      }
      ctx.textAlign = 'left';
    }
  }
  renderLock() {
    const ctx = this.ctx, W = this.W(), H = this.H();
    ctx.fillStyle = 'rgba(0,0,0,0.93)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e0e0e0'; ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.fillText(this._loggedOut ? '已退出登录' : '已锁定', W / 2, H / 2 - 20);
    ctx.fillStyle = '#888'; ctx.font = '14px -apple-system, sans-serif';
    ctx.fillText(this._loggedOut ? '点击任意处以 guest 重新登录' : '点击任意处解锁', W / 2, H / 2 + 16);
    ctx.textAlign = 'left';
  }
  renderShutdown() {
    const ctx = this.ctx, W = this.W(), H = this.H();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555'; ctx.font = '16px -apple-system, sans-serif';
    ctx.fillText('已关机', W / 2, H / 2 - 30);
    const bw = 90, bh = 34, bx = W / 2 - bw / 2, by = H / 2 + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; this.roundRect(bx, by, bw, bh, 8); ctx.fill();
    ctx.fillStyle = '#e0e0e0'; ctx.font = '14px sans-serif';
    ctx.fillText('⏻ 开机', W / 2, by + bh / 2);
    ctx.textAlign = 'left';
  }

  // macOS 风格菜单栏布局：左 = Apple 标志 + 焦点应用名（加粗）+ 应用菜单；右 = 状态区
  menuBarLayout(W) {
    const focusWin = this.focusedId ? this.windows.find(w => w.id === this.focusedId) : null;
    const appName = (focusWin && focusWin.appId) ? this.appMeta(focusWin.appId).name : '访达';
    return {
      menus: ['文件', '编辑', '显示', '前往', '窗口', '帮助'],
      appName,
      appNameX: 40,
    };
  }

  renderMenuBar(W) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(15, 15, 20, 0.45)';
    ctx.fillRect(0, 0, W, this.MENU_BAR_H);

    const L = this.menuBarLayout(W);
    const cy = this.MENU_BAR_H / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // 菜单栏标签几何（用于命中检测 + 高亮当前打开的菜单）
    this._mbLabels = this.menuBarLabels(W);
    const openName = (this.menu && this.menu.kind === 'bar') ? this.menu.name : null;

    // Apple 标志（手绘路径，点击弹主菜单）
    if (this.menu && this.menu.kind === 'apple') { ctx.fillStyle = 'rgba(255,255,255,0.25)'; this.roundRect(8, 4, 26, this.MENU_BAR_H - 8, 6); ctx.fill(); }
    drawAppleLogo(ctx, 21, cy, 17);

    // 焦点应用名（加粗；无焦点窗口时显示访达）—— 白色，覆盖菜单栏深色底
    const anX = L.appNameX;
    if (openName === 'app') { ctx.fillStyle = 'rgba(255,255,255,0.22)'; this.roundRect(anX - 6, 3, ctx.measureText(L.appName).width + 18, this.MENU_BAR_H - 6, 6); ctx.fill(); }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.font = '600 13.5px -apple-system, sans-serif';
    ctx.fillText(L.appName, anX, cy + 0.5);

    // 应用菜单项（文件 编辑 显示 前往 窗口 帮助）
    ctx.font = '13.5px -apple-system, sans-serif';
    let mx = anX + ctx.measureText(L.appName).width + 24;
    for (const m of L.menus) {
      const w = ctx.measureText(m).width + 22;
      if (openName === m) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; this.roundRect(mx - 6, 3, w, this.MENU_BAR_H - 6, 6); ctx.fill(); }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(m, mx, cy + 0.5);
      mx += w;
    }

    const now = new Date();
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.textAlign = 'right';
    ctx.fillText(hh + ':' + mm, W - 14, cy + 0.5);
    ctx.fillText((now.getMonth() + 1) + '月' + now.getDate() + '日 ' + week, W - 66, cy + 0.5);
    ctx.textAlign = 'left';

    // 软键盘切换按钮（移动端用它调出实体键盘）
    const kb = this.kbButtonRect(W);
    ctx.fillStyle = this.softKeyboard.open ? 'rgba(10,132,255,0.5)' : 'rgba(255,255,255,0.16)';
    this.roundRect(kb.x, kb.y, kb.w, kb.h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⌨', kb.x + kb.w / 2, kb.y + kb.h / 2 + 0.5);
    ctx.textAlign = 'left';

    // WiFi 图标
    this.drawWifiIcon(W - 226, cy, 8);
    // 电池（示意电量 80%）
    this.drawBattery(W - 247, cy, 22, 0.8, '80%');
  }

  // WiFi 状态图标（两段弧 + 圆点，朝上展开）
  drawWifiIcon(cx, cy, r) {
    const ctx = this.ctx;
    const base = cy + r * 0.75;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    for (const rr of [r, r * 0.58]) {
      ctx.beginPath();
      ctx.arc(cx, base, rr, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(cx, base - 1.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 电池图标：rightX 为电池右缘，level 为电量比例（<0.2 变红），label 为百分比文字
  drawBattery(rightX, cy, w, level, label) {
    const ctx = this.ctx;
    const h = 11, y = cy - h / 2, x = rightX - w;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    this.roundRect(x, y, w, h, 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(rightX + 1.5, y + 3, 2, h - 6);
    ctx.fillStyle = level > 0.2 ? 'rgba(255,255,255,0.92)' : '#ff5f57';
    this.roundRect(x + 2, y + 2, Math.max(1, (w - 4) * level), h - 4, 2);
    ctx.fill();
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, x - 6, cy + 0.5);
      ctx.textAlign = 'left';
    }
  }

  renderDock(W, H) {
    const ctx = this.ctx;
    const L = this.dockLayout();
    const { dockX, dockY, dockW, dockH } = L;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    this.roundRect(dockX, dockY, dockW, dockH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    this.roundRect(dockX, dockY, dockW, dockH, 16);
    ctx.stroke();
    // 顶部内高光（玻璃质感）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(dockX + 12, dockY + 1, dockW - 24, 1);

    const iconY = dockY + (dockH - this.DOCK_ICON) / 2;
    let idx = 0;
    const drawIcon = (x, appId, letter, dim) => {
      if (this.drawAppIcon(appId, x, iconY, this.DOCK_ICON, dim)) return;
      const isEmoji = /[^\x00-\x7F]/.test(letter);
      const g = ctx.createLinearGradient(x, iconY, x, iconY + this.DOCK_ICON);
      if (dim) {
        g.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
      } else {
        g.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0.16)');
      }
      ctx.fillStyle = g;
      this.roundRect(x, iconY, this.DOCK_ICON, this.DOCK_ICON, 10);
      ctx.fill();
      ctx.fillStyle = dim ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.92)';
      ctx.font = (isEmoji ? '22px' : '20px') + ' -apple-system, "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x + this.DOCK_ICON / 2, iconY + this.DOCK_ICON / 2);
    };

    for (const app of L.icons) {
      const x = dockX + 8 + idx * (this.DOCK_ICON + L.spacing);
      drawIcon(x, app.id, this.appGlyph(app.id, app.letter), false);
      // 焦点标记
      const isRunning = this.windows.some(w => w.appId === app.id && !w.minimized);
      if (isRunning) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(x + this.DOCK_ICON / 2, dockY + dockH - 6, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      idx++;
    }
    if (L.minis.length > 0) {
      const x = dockX + 8 + idx * (this.DOCK_ICON + L.spacing);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(x - L.spacing / 2, dockY + 10);
      ctx.lineTo(x - L.spacing / 2, dockY + dockH - 10);
      ctx.stroke();
      idx++;
    }
    for (const w of L.minis) {
      const x = dockX + 8 + idx * (this.DOCK_ICON + L.spacing);
      drawIcon(x, w.appId, this.appGlyph(w.appId, '?'), true);
      idx++;
    }
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}