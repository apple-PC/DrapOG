/**
 * @file        drapog.sys.js
 * @module      drapog/sys
 * @summary     DrapSYS 系统调用分发器
 * @version     0.4.0
 */

export class DrapSYS {
  /**
   * @param {Object} opts
   * @param {import('./drapog.vm.js').VM} opts.vm  虚拟机实例
   * @param {Object} opts.vfs                      虚拟文件系统
   * @param {Function} opts.out                    输出回调
   */
  constructor({ vm, vfs, out, onRead, onWinCreate, onWinClose, onCwd, onExit, onClear, onSwitchGUI, hostExec }) {
    this.vm = vm;
    this.vfs = vfs;
    this.out = out || (() => {});
    this.onRead = onRead || null;            // 异步读入一行（B7 term_read 宿主注入）
    this.cwd = '/Users/guest';               // 当前工作目录（fs_chdir 维护）
    // 宿主回调钩子（由宿主 DrapShell 挂载，供 DrapLang 上层调用底层工具）
    this.onCwd = onCwd || null;          // term_setcwd(str)  → 同步宿主提示符用的 cwd
    this.onExit = onExit || null;         // term_exit()       → 退出 Shell（关窗口 / 回菜单）
    this.onClear = onClear || null;       // term_clear()      → 清屏
    this.onSwitchGUI = onSwitchGUI || null;  // term_gui()      → 切到 GUI
    this.hostExec = hostExec || null;     // term_hostcmd(line)→ 委托宿主执行宿主专属命令

    // GUI 自举底层工具（DrapLang 经此创建窗口 / 绘制 / 响应输入）
    this.onWinCreate = onWinCreate || null;   // (opts) => realWinId  宿主创建真实 WM 窗口
    this.onWinClose = onWinClose || null;     // (winId) => void      宿主关闭真实 WM 窗口
    this.drapWins = new Map(); // winId -> { queue, resolver, drawOps, style, title, dirty }
    this.curWinId = null;      // 当前绘制 / 输入目标窗口

    this.table = {
      0x10: this.fs_read.bind(this),
      0x11: this.fs_write.bind(this),
      0x12: this.fs_exists.bind(this),
      0x13: this.fs_ls.bind(this),
      0x14: this.fs_mkdir.bind(this),
      0x15: this.fs_rm.bind(this),
      0x30: this.term_print.bind(this),
      0x31: this.term_read.bind(this),
      0x16: this.fs_chdir.bind(this),
      0x50: this.time_now.bind(this),
      0x17: this.fs_realpath.bind(this),
      0x32: this.term_clear.bind(this),
      0x33: this.term_exit.bind(this),
      0x34: this.term_gui.bind(this),
      0x35: this.term_hostcmd.bind(this),
      0x36: this.term_setcwd.bind(this),
      // 窗口 / 绘制 / 输入（GUI 自举底层工具）
      0x40: this.win_create.bind(this),
      0x41: this.win_close.bind(this),
      0x42: this.win_set_title.bind(this),
      0x4b: this.win_focus.bind(this),
      0x43: this.win_text.bind(this),
      0x44: this.win_fill_rect.bind(this),
      0x45: this.win_stroke_rect.bind(this),
      0x46: this.win_set_color.bind(this),
      0x47: this.win_set_font.bind(this),
      0x48: this.win_get_event.bind(this),
      0x49: this.win_invalidate.bind(this),
      0x4a: this.win_atoi.bind(this),
      0x4c: this.itoa.bind(this),
    };
  }

  async dispatch(num, args) {
    const fn = this.table[num];
    if (!fn) throw new Error('未知系统调用: 0x' + num.toString(16));
    return await fn(...args);
  }

  /* ---------- 文件 ---------- */
  async fs_read(ptr) {
    const path = this.vm.readStr(ptr);
    const content = await this.vfs.read(path);
    if (content === null) return 0;
    return this.vm.pushStr(content);
  }

  async fs_write(ptr_path, ptr_content) {
    const path = this.vm.readStr(ptr_path);
    const content = this.vm.readStr(ptr_content);
    const ok = await this.vfs.write(path, content);
    return ok ? 1 : 0;
  }

  async fs_exists(ptr) {
    const path = this.vm.readStr(ptr);
    const r = await this.vfs.exists(path);
    return r ? 1 : 0;
  }

  async fs_ls(ptr) {
    const path = this.vm.readStr(ptr);
    const items = await this.vfs.ls(path);
    if (!items) return 0;
    const text = items
      .map(it => it.name + (it.type === 'dir' ? '/' : ''))
      .join('\n');
    return this.vm.pushStr(text);
  }

  async fs_mkdir(ptr) {
    const path = this.vm.readStr(ptr);
    const ok = await this.vfs.mkdir(path);
    return ok ? 1 : 0;
  }

  async fs_rm(ptr) {
    const path = this.vm.readStr(ptr);
    const ok = await this.vfs.rm(path);
    return ok ? 1 : 0;
  }

  fs_chdir(ptr) {
    const path = this.vm.readStr(ptr);
    const abs = this.vfs.normalize(this.cwd, path);
    this.cwd = abs;
    return this.vm.pushStr(abs);
  }

  // 路径归一化工具：把 (base, path) 解析为绝对路径，供上层命令复用（~ / .. / . 全由 VFS.normalize 处理）
  fs_realpath(basePtr, pathPtr) {
    const base = this.vm.readStr(basePtr);
    const path = this.vm.readStr(pathPtr);
    return this.vm.pushStr(this.vfs.normalize(base, path));
  }

  /* ---------- 终端 ---------- */
  // P0-2：统一走 vm.out，与编译器内置 term_print 同一条路径，避免双路分叉
  term_print(ptr) {
    const s = this.vm.readStr(ptr);
    this.vm.out += s;
    this.vm.onOutput(this.vm.out);
    return 0;
  }

  async term_read() {
    if (typeof this.onRead !== 'function') return this.vm.pushStr('');
    const line = await this.onRead();
    return this.vm.pushStr(typeof line === 'string' ? line : '');
  }

  /* ---------- 终端控制（上层经此调用宿主能力） ---------- */
  // 清屏
  term_clear() {
    if (typeof this.onClear === 'function') this.onClear();
    return 0;
  }

  // 退出 Shell：仅置标志，待 VM 自然停机后由宿主收尾（避免运行中撕毁 UI）
  term_exit() {
    this.terminated = true;
    return 0;
  }

  // 切换到 GUI
  term_gui() {
    if (typeof this.onSwitchGUI === 'function') this.onSwitchGUI();
    return 0;
  }

  // 把一行交给宿主执行（宿主专属命令：mount / cc / load / save ...）
  async term_hostcmd(ptr) {
    const line = this.vm.readStr(ptr);
    if (typeof this.hostExec === 'function') await this.hostExec(line);
    return 0;
  }

  // 同步工作目录给宿主（供提示符显示）
  term_setcwd(ptr) {
    const cwd = this.vm.readStr(ptr);
    this.cwd = cwd;
    if (typeof this.onCwd === 'function') this.onCwd(cwd);
    return 0;
  }

  /* ---------- 时间 ---------- */
  time_now() {
    return Math.floor(Date.now() / 1000);   // 秒级时间戳
  }

  /* ---------- 窗口 / 绘制 / 输入（GUI 自举底层工具） ----------
     设计：DrapLang GUI 程序 = 跑在 VM 里的事件循环
       while (true) {
         e = win_get_event()              // 阻塞等事件（与 term_read 同续体机制）
         if e == "paint" { ...绘制（win_fill_rect / win_text）... }
         else if substr(e,0,5)=="click" { ... }
         else if e == "close" { return 0 }
       }
     宿主（WM 桥接层）负责：创建真实窗口、把绘制指令重放到 canvas、
     把真实鼠标/键盘事件注入事件队列。
  ------------------------------------------------------------ */

  // 创建窗口：宿主提供一个真实 WM 窗口，返回其 id（同时设为当前窗口）
  win_create(titlePtr, w, h) {
    const title = this.vm.readStr(titlePtr);
    if (typeof this.onWinCreate !== 'function') return 0;
    const id = this.onWinCreate({ title, w, h });
    if (!id) return 0;
    this.drapWins.set(id, {
      queue: [],
      resolver: null,
      drawOps: [],
      style: { color: [255, 255, 255], font: 14 },
      title,
      dirty: true,
    });
    this.curWinId = id;
    this._pushEvent(id, 'paint');   // 首帧
    return id;
  }

  win_close(winId) {
    this._pushEvent(winId, 'close');
    if (typeof this.onWinClose === 'function') this.onWinClose(winId);
    return 0;
  }

  win_set_title(winId, titlePtr) {
    const st = this.drapWins.get(winId);
    if (st) st.title = this.vm.readStr(titlePtr);
    return 0;
  }

  win_focus(winId) {
    this.curWinId = winId;
    return 0;
  }

  _cur() { return this.drapWins.get(this.curWinId); }

  win_text(x, y, strPtr) {
    const st = this._cur();
    if (!st) return 0;
    st.drawOps.push({ op: 'text', x, y, text: this.vm.readStr(strPtr), color: st.style.color.slice(), font: st.style.font });
    return 0;
  }

  win_fill_rect(x, y, w, h) {
    const st = this._cur();
    if (!st) return 0;
    st.drawOps.push({ op: 'fill', x, y, w, h, color: st.style.color.slice() });
    return 0;
  }

  win_stroke_rect(x, y, w, h) {
    const st = this._cur();
    if (!st) return 0;
    st.drawOps.push({ op: 'stroke', x, y, w, h, color: st.style.color.slice() });
    return 0;
  }

  win_set_color(r, g, b) {
    const st = this._cur();
    if (!st) return 0;
    st.style.color = [r & 255, g & 255, b & 255];
    return 0;
  }

  win_set_font(size) {
    const st = this._cur();
    if (!st) return 0;
    st.style.font = size;
    return 0;
  }

  // 取下一个事件：队列非空立即返回；否则阻塞等待（续体，与 term_read 同机制）
  win_get_event() {
    const st = this._cur();
    if (!st) return this.vm.pushStr('');
    if (st.queue.length > 0) {
      const ev = st.queue.shift();
      if (ev === 'paint') st.drawOps = [];
      return this.vm.pushStr(ev);
    }
    return new Promise(resolve => {
      st.resolver = (ev) => {
        st.resolver = null;
        if (ev === 'paint') st.drawOps = [];
        resolve(this.vm.pushStr(ev));
      };
    });
  }

  // 请求重绘：push 一个 paint 事件（若 VM 阻塞则唤醒）
  win_invalidate(winId) {
    this._pushEvent(winId, 'paint');
    return 0;
  }

  // 字符串 → 整数（GUI 事件坐标解析）
  win_atoi(strPtr) {
    const n = parseInt(this.vm.readStr(strPtr), 10);
    return isNaN(n) ? 0 : n;
  }

  // 整数 → 字符串（便于在 GUI / 终端里显示数字，如 mode 计数）
  itoa(n) {
    return this.vm.pushStr(String(Math.trunc(n)));
  }

  // 事件注入（宿主桥接调用）：把真实输入事件送进窗口队列
  _pushEvent(winId, ev) {
    const st = this.drapWins.get(winId);
    if (!st) return;
    if (st.resolver) {
      const r = st.resolver;
      st.resolver = null;
      r(ev);
    } else {
      st.queue.push(ev);
    }
  }

  // 宿主桥接：注入真实输入事件（点击 / 按键 / 关闭）
  injectWinEvent(winId, ev) {
    this._pushEvent(winId, ev);
  }
}