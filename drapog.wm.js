/**
 * @file        drapog.wm.js
 * @module      drapog/wm
 * @summary     窗口管理器（支持应用内容）
 * @version     0.6.0
 */

export class WindowManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.windows = [];
    this.nextId = 1;
    this.zOrder = [];
    this.focusedId = null;
    this.dragState = null;

    this.MENU_BAR_H = 28;
    this.DOCK_H = 60;
    this.DOCK_MARGIN = 8;
    this.DOCK_ICON = 44;

    // 软键盘（移动端调用实体键盘用）
    this.softKeyboard = { open: false };

    this.apps = [
      { id: 'finder',   letter: 'F', title: 'Finder' },
      { id: 'terminal', letter: '>', title: 'Terminal' },
      { id: 'guidemo',  letter: '◆', title: 'DrapApp 示例' },
      { id: 'paint',    letter: '🎨', title: 'Paint' },
      { id: 'hello',    letter: 'H', title: 'Hello' },
      { id: 'appmgr',   letter: '◆', title: '应用' },
      { id: 'edit',     letter: 'T', title: 'TextEdit' },
      { id: 'settings', letter: '⚙', title: 'Settings' },
      { id: 'about',    letter: 'W', title: '关于本机' },
    ];

    this._appImpls = new Map();   // appId -> 实现
  }

  W() { return window.SCR_W; }
  H() { return window.SCR_H; }

  registerApp(id, impl) { this._appImpls.set(id, impl); }

  getApp(id) { return this._appImpls.get(id); }

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
      w.x = 0;
      w.y = this.MENU_BAR_H;
      w.w = this.W();
      w.h = this.H() - this.MENU_BAR_H - this.DOCK_H - this.DOCK_MARGIN * 2;
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

  btnPositions(w) {
    const cy = w.y + w.TITLEBAR_H / 2;
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
    // 菜单栏（顶部）：键盘切换按钮命中区
    if (y < this.MENU_BAR_H) {
      if (this.hitMenuBar(x, y)) this.toggleSoftKeyboard();
      return;   // 菜单栏区域不穿透到下方窗口
    }

    // 软键盘（覆盖层）：优先处理按键点击
    if (this.softKeyboard.open) {
      const k = this.hitSoftKeyboard(x, y);
      if (k) { this._pressKey(k); return; }
    }

    const hitD = this.hitDock(x, y);
    if (hitD) {
      if (hitD.type === 'app') this.launchApp(hitD.app);
      else if (hitD.type === 'mini') this.restoreWindow(hitD.win.id);
      return;
    }

    const w = this.hitTest(x, y);
    if (!w) return;
    this.bringToFront(w.id);

    const btn = this.hitButton(w, x, y);
    if (btn === 'close')    { this.closeWindow(w.id); return; }
    if (btn === 'minimize') { this.minimizeWindow(w.id); return; }
    if (btn === 'maximize') { this.toggleMaximize(w.id); return; }

    if (this.hitTitleBar(w, x, y)) {
      this.dragState = { id: w.id, offsetX: x - w.x, offsetY: y - w.y, moved: false };
      return;
    }

    if (this.hitContent(w, x, y)) {
      const app = this.getApp(w.appId);
      if (app && app.onMouseDown) {
        const lx = x - w.x;
        const ly = y - w.y - w.TITLEBAR_H;
        try { app.onMouseDown(lx, ly, w, this); } catch (e) { console.error(e); }
      }
    }
  }

  onMouseMove(x, y) {
    if (!this.dragState) return;
    const w = this.windows.find(w => w.id === this.dragState.id);
    if (!w) { this.dragState = null; return; }
    if (w.maximized) return;
    this.dragState.moved = true;
    w.x = x - this.dragState.offsetX;
    w.y = y - this.dragState.offsetY;
    if (w.y < this.MENU_BAR_H) w.y = this.MENU_BAR_H;
    if (w.x < 0) w.x = 0;
    if (w.x + w.w > this.W()) w.x = this.W() - w.w;
  }

  onMouseUp(x, y) {
    if (this.dragState && !this.dragState.moved) {
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
    }
    this.dragState = null;
  }

  onKeyDown(e) {
    if (!this.focusedId) return;
    const w = this.windows.find(w => w.id === this.focusedId);
    if (!w || w.minimized) return;
    const app = this.getApp(w.appId);
    if (app && app.onKeyDown) {
      try {
        const handled = app.onKeyDown(e, w, this);
        if (handled) e.preventDefault();
      } catch (err) { console.error(err); }
    }
  }

  getCursor(x, y) {
    if (this.dragState) return 'grabbing';
    if (y < this.MENU_BAR_H && this.hitMenuBar(x, y)) return 'pointer';
    if (this.softKeyboard.open && this.hitSoftKeyboard(x, y)) return 'pointer';
    const hitD = this.hitDock(x, y);
    if (hitD) return 'pointer';
    const w = this.hitTest(x, y);
    if (!w) return 'default';
    if (this.hitButton(w, x, y)) return 'pointer';
    if (this.hitTitleBar(w, x, y)) return 'grab';
    if (this.hitContent(w, x, y)) {
      const app = this.getApp(w.appId);
      if (app && app.getCursor) {
        const lx = x - w.x, ly = y - w.y - w.TITLEBAR_H;
        return app.getCursor(lx, ly, w, this) || 'default';
      }
    }
    return 'default';
  }

  /* ==================== 软键盘 ==================== */

  toggleSoftKeyboard() { this.softKeyboard.open = !this.softKeyboard.open; }

  // 菜单栏右侧的键盘切换按钮
  kbButtonRect(W) { return { x: W - 92, y: 4, w: 40, h: this.MENU_BAR_H - 8 }; }
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
    // 若应用实现了 launch（如 DrapLang 应用需自建 VM 窗口），优先调用
    const impl = this.getApp(app.id);
    if (impl && typeof impl.launch === 'function') { impl.launch(this); return; }
    // 无 WM 实现但注册表里有（DrapLang 应用：gui 交 WM、cli 跑终端）→ 统一经注册表启动
    if (!impl && this.registry && this.registry.get(app.id)) {
      this.registry.launch(app.id, { wm: this, vfs: this.vfs || null })
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

  /* ==================== 渲染 ==================== */

  render() {
    const W = this.W(), H = this.H();
    this.renderWallpaper(W, H);
    for (const id of this.zOrder) {
      const w = this.windows.find(w => w.id === id);
      if (w && !w.minimized) this.renderWindow(w);
    }
    this.renderMenuBar(W);
    this.renderDock(W, H);
    this.renderSoftKeyboard(W, H);
  }

  renderWallpaper(W, H) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2a4a');
    g.addColorStop(0.45, '#3a1c4a');
    g.addColorStop(1, '#0d0d12');
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

    // 边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 0.5;
    this.roundRect(w.x, w.y, w.w, w.h, R);
    ctx.stroke();

    // 标题栏底
    ctx.save();
    ctx.beginPath();
    this.roundRect(w.x, w.y, w.w, w.TITLEBAR_H + R, R);
    ctx.clip();
    ctx.fillStyle = focused ? 'rgba(58, 58, 64, 0.98)' : 'rgba(46, 46, 50, 0.98)';
    ctx.fillRect(w.x, w.y, w.w, w.TITLEBAR_H);
    ctx.restore();

    // 标题栏底部分隔线
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y + w.TITLEBAR_H);
    ctx.lineTo(w.x + w.w, w.y + w.TITLEBAR_H);
    ctx.stroke();

    // 内容区（裁剪后交给 app 渲染）
    const app = this.getApp(w.appId);
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

    // 三色按钮
    const p = this.btnPositions(w);
    const alpha = focused ? 1 : 0.6;
    ctx.globalAlpha = alpha;
    this.drawCircle(p.close.x, p.close.y, p.close.r, '#ff5f57');
    this.drawCircle(p.minimize.x, p.minimize.y, p.minimize.r, '#febc2e');
    this.drawCircle(p.maximize.x, p.maximize.y, p.maximize.r, '#28c840');
    ctx.globalAlpha = 1;

    // 按钮符号
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    // ×
    {
      const cx = p.close.x, cy = p.close.y, r = 3;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    }
    // ─
    {
      const cx = p.minimize.x, cy = p.minimize.y, r = 3;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.stroke();
    }
    // ⤢ 两对角箭头
    {
      const cx = p.maximize.x, cy = p.maximize.y, r = 3.2;
      const s = r * 0.7;
      // 左上
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx - r + s, cy - r);
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx - r, cy - r + s);
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx - r + s * 0.55, cy - r + s * 0.55);
      ctx.stroke();
      // 右下
      ctx.beginPath();
      ctx.moveTo(cx + r, cy + r);
      ctx.lineTo(cx + r - s, cy + r);
      ctx.moveTo(cx + r, cy + r);
      ctx.lineTo(cx + r, cy + r - s);
      ctx.moveTo(cx + r, cy + r);
      ctx.lineTo(cx + r - s * 0.55, cy + r - s * 0.55);
      ctx.stroke();
    }
  }

  drawCircle(cx, cy, r, fill) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  renderMenuBar(W) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, this.MENU_BAR_H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '14px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('◆  DrapOG', 14, this.MENU_BAR_H / 2);

    // 显示当前焦点应用名
    if (this.focusedId) {
      const w = this.windows.find(w => w.id === this.focusedId);
      if (w) {
        const app = this.apps.find(a => a.id === w.appId);
        if (app) {
          ctx.font = '600 13px -apple-system, sans-serif';
          ctx.fillText(app.title, 130, this.MENU_BAR_H / 2);
        }
      }
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    ctx.font = '14px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(hh + ':' + mm, W - 14, this.MENU_BAR_H / 2);

    // 软键盘切换按钮（移动端用它调出实体键盘）
    const kb = this.kbButtonRect(W);
    ctx.fillStyle = this.softKeyboard.open ? 'rgba(10,132,255,0.45)' : 'rgba(255,255,255,0.14)';
    this.roundRect(kb.x, kb.y, kb.w, kb.h, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '15px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⌨', kb.x + kb.w / 2, kb.y + kb.h / 2);
  }

  renderDock(W, H) {
    const ctx = this.ctx;
    const L = this.dockLayout();
    const { dockX, dockY, dockW, dockH } = L;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    this.roundRect(dockX, dockY, dockW, dockH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 0.5;
    this.roundRect(dockX, dockY, dockW, dockH, 16);
    ctx.stroke();

    const iconY = dockY + (dockH - this.DOCK_ICON) / 2;
    let idx = 0;
    const drawIcon = (x, letter, dim) => {
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
      ctx.font = '20px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x + this.DOCK_ICON / 2, iconY + this.DOCK_ICON / 2);

      // 焦点小圆点
      const runningWin = this.windows.find(w => w.appId === letter);
      // 用 app.id 更准，这里不深究
    };

    for (const app of L.icons) {
      const x = dockX + 8 + idx * (this.DOCK_ICON + L.spacing);
      drawIcon(x, app.letter, false);
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
      drawIcon(x, (w.title[0] || '?').toUpperCase(), true);
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