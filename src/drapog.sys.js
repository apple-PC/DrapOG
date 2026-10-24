/**
 * @file        drapog.sys.js
 * @module      drapog/sys
 * @summary     DrapSYS 系统调用分发器
 * @version     0.6.0
 */

import { moveToTrash } from './drapog.vfs.js';

export class DrapSYS {
  /**
   * @param {Object} opts
   * @param {import('./drapog.vm.js').VM} opts.vm  虚拟机实例
   * @param {Object} opts.vfs                      虚拟文件系统
   * @param {Function} opts.out                    输出回调
   */
  constructor({ vm, vfs, out, onRead, onWinCreate, onWinClose, onCwd, onExit, onClear, onSwitchGUI, hostExec, getTheme, onSetTheme, onOpenFinder, onSetSoftKeyboard, onGetThemeName, onGetSoftKeyboard, registry, wm, shell, openPath, audio }) {
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
    // 宿主桥接钩子（GUI 型 drapp 调用宿主能力用）
    this.getTheme = getTheme || null;         // () => [ [r,g,b]×5 ]  当前主题语义色板（bg/fg/accent/toolbar/sel）
    this.onSetTheme = onSetTheme || null;     // (name) => void       切换主题（wm.setTheme）
    this.onOpenFinder = onOpenFinder || null; // (path) => void        在 Finder 打开路径（wm.openFinderAt）
    this.onSetSoftKeyboard = onSetSoftKeyboard || null; // (on) => void  切换软键盘（wm.softKeyboard.open）
    this.onGetThemeName = onGetThemeName || null;     // () => 'macos'|'windows'  读取当前主题名
    this.onGetSoftKeyboard = onGetSoftKeyboard || null; // () => bool  读取软键盘状态
    // 应用注册表 / 窗口管理器（DrapLang 经此枚举并启动应用、绘制应用图标）
    this.registry = registry || null;     // AppRegistry 实例（app_list / app_launch 用）
    this.wm = wm || null;                 // WindowManager 实例（app_icon 用）
    this.audio = audio || null;           // 宿主音频引擎（媒体类应用：播放/频谱/提示音）
    this.shell = shell || null;           // 预留：宿主 shell 实例
    this._appShell = null;                // win_shell_exec 懒创建的 DrapShell
    this._shellBuf = [];                  // 宿主命令捕获输出缓冲
    this._shellCwd = '/Users/guest';      // win_shell_exec 持久工作目录
    this.drapWins = new Map(); // winId -> { queue, resolver, drawOps, style, title, dirty }
    this.curWinId = null;      // 当前绘制 / 输入目标窗口
    this._openPath = openPath || ''; // 本应用启动时透传的初始打开路径（win_get_open_path 读取）

    this.argv = [];            // 命令行参数（argv[0] = 程序名），由启动器注入

    this.table = {
      0x10: this.fs_read.bind(this),
      0x11: this.fs_write.bind(this),
      0x12: this.fs_exists.bind(this),
      0x13: this.fs_ls.bind(this),
      0x14: this.fs_mkdir.bind(this),
      0x15: this.fs_rm.bind(this),
      0x18: this.fs_append.bind(this),
      0x19: this.fs_copy.bind(this),
      0x1a: this.fs_move.bind(this),
      0x1b: this.fs_size.bind(this),
      0x1c: this.fs_isdir.bind(this),
      0x30: this.term_print.bind(this),
      0x31: this.term_read.bind(this),
      0x16: this.fs_chdir.bind(this),
      0x50: this.time_now.bind(this),
      0x54: this.time_sleep.bind(this),
      0x55: this.time_format.bind(this),
      0x95: this.time_parts.bind(this),
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
      0x56: this.win_mono.bind(this),   // 注：0x50 已分给 time_now，此处移开避免冲突
      0x4d: this.win_w.bind(this),
      0x4e: this.win_h.bind(this),
      0x4f: this.win_button.bind(this),
      0x51: this.win_label.bind(this),
      0x52: this.win_input_get.bind(this),
      0x53: this.win_input.bind(this),
      0x70: this.win_set_input.bind(this),
      0x57: this.win_theme.bind(this),         // 主题语义色：slot 0=bg 1=fg 2=accent 3=toolbar 4=sel
      0x58: this.win_set_theme.bind(this),     // 切换系统主题（macos/windows）
      0x59: this.win_open_finder.bind(this),   // 在 Finder 打开路径
      0x5a: this.win_set_softkeyboard.bind(this), // 切换移动端软键盘
      0x5b: this.win_get_theme.bind(this),        // 读取当前主题（0=macos 1=windows）
      0x5c: this.win_get_softkeyboard.bind(this), // 读取软键盘状态（0=关 1=开）
      0x5f: this.win_set_style.bind(this),         // 设置后续 win_text 的样式（bold, italic, underline：0/1）
      // 应用注册表 / 宿主桥接（DrapLang 经此枚举/启动应用、执行命令、绘制图标、移入废纸篓）
      0x80: this.win_app_list.bind(this),         // 枚举已注册应用（每行 id|name|category）
      0x81: this.win_app_launch.bind(this),       // 启动应用（id）
      0x82: this.win_shell_exec.bind(this),       // 执行宿主命令（返回捕获的输出文本）
      0x83: this.win_app_icon.bind(this),         // 绘制应用图标（id, x, y, size）
      0x84: this.win_glyph.bind(this),            // 绘制手绘图标（name, x, y, size）
      0x85: this.win_trash.bind(this),            // 把路径移入废纸篓（path）
      0x86: this.win_get_open_path.bind(this),     // 读取本窗口透传的初始打开路径（openFinderAt 用）
      // 矢量绘图 / 帧驱动 / 音频（媒体类 DrapLang 应用）
      0x87: this.win_line.bind(this),              // 直线
      0x88: this.win_circle.bind(this),            // 圆（填充/描边）
      0x89: this.win_arc.bind(this),               // 圆弧（角度制）
      0x8a: this.win_rrect.bind(this),             // 圆角矩形（填充）
      0x8b: this.win_alpha.bind(this),             // 透明度
      0x8c: this.win_set_line.bind(this),          // 线宽
      0x8d: this.win_tick.bind(this),              // 逐帧重绘间隔
      0x8e: this.win_millis.bind(this),            // 毫秒时间戳
      0x8f: this.win_audio.bind(this),             // 音频播放控制
      0x90: this.win_audio_open.bind(this),        // 选择并加载音视频文件
      0x91: this.win_audio_seek.bind(this),        // 音频跳转
      0x92: this.win_audio_state.bind(this),       // 音频状态
      0x93: this.win_audio_band.bind(this),        // 频谱分量
      0x94: this.win_audio_beep.bind(this),        // 提示音
      0x96: this.win_textc.bind(this),             // 居中文本
      0x60: this.args_count.bind(this),
      0x61: this.args_get.bind(this),
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

  // 追加内容到文件（不存在则创建）
  async fs_append(ptr_path, ptr_content) {
    const path = this.vm.readStr(ptr_path);
    const content = this.vm.readStr(ptr_content);
    const existing = await this.vfs.read(path);
    const base = existing === null ? '' : existing;
    const ok = await this.vfs.write(path, base + content);
    return ok ? 1 : 0;
  }

  // 复制文件（src 不存在返回 0）
  async fs_copy(ptr_src, ptr_dst) {
    const src = this.vm.readStr(ptr_src);
    const dst = this.vm.readStr(ptr_dst);
    const content = await this.vfs.read(src);
    if (content === null) return 0;
    const ok = await this.vfs.write(dst, content);
    return ok ? 1 : 0;
  }

  // 移动 / 重命名文件
  async fs_move(ptr_src, ptr_dst) {
    const src = this.vm.readStr(ptr_src);
    const dst = this.vm.readStr(ptr_dst);
    const content = await this.vfs.read(src);
    if (content === null) return 0;
    const ok = await this.vfs.write(dst, content);
    if (!ok) return 0;
    await this.vfs.rm(src);
    return 1;
  }

  // 文件大小（字节；不存在返回 -1）
  async fs_size(ptr) {
    const path = this.vm.readStr(ptr);
    const content = await this.vfs.read(path);
    if (content === null) return -1;
    return content.length;
  }

  // 是否为目录（是返回 1，否则 0）
  async fs_isdir(ptr) {
    const path = this.vm.readStr(ptr);
    const items = await this.vfs.ls(path);
    return Array.isArray(items) ? 1 : 0;
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

  // 休眠指定毫秒（异步让出，不阻塞 VM 步数预算）
  async time_sleep(ms) {
    const t = Math.max(0, Math.trunc(ms));
    await new Promise(resolve => setTimeout(resolve, t));
    return 0;
  }

  // 把秒级时间戳格式化为 "YYYY-MM-DD HH:MM:SS"（ts==0 用当前时间）
  time_format(ts) {
    let s = Math.trunc(ts);
    if (!s) s = Math.floor(Date.now() / 1000);
    const d = new Date(s * 1000);
    const p = (n) => String(n).padStart(2, '0');
    const out = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
                ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    return this.vm.pushStr(out);
  }

  // 时间分量：time_parts(ts, utc) → "Y|M|D|h|m|s|wday"（utc 非 0 用 UTC 分量）
  // DrapLang 侧无日期 API，世界时钟 / 数字表盘经此拆分，避免字符串解析。
  time_parts(ts, utc) {
    let sec = Math.trunc(ts);
    if (!sec) sec = Math.floor(Date.now() / 1000);
    const d = new Date(sec * 1000);
    const u = (utc != 0);
    const Y = u ? d.getUTCFullYear() : d.getFullYear();
    const M = (u ? d.getUTCMonth() : d.getMonth()) + 1;
    const D = u ? d.getUTCDate() : d.getDate();
    const h = u ? d.getUTCHours() : d.getHours();
    const m = u ? d.getUTCMinutes() : d.getMinutes();
    const s = u ? d.getUTCSeconds() : d.getSeconds();
    const wd = u ? d.getUTCDay() : d.getDay();
    return this.vm.pushStr(Y + '|' + M + '|' + D + '|' + h + '|' + m + '|' + s + '|' + wd);
  }

  /* ---------- 进程参数（CLI 工具读取命令行） ---------- */  args_count() {
    return this.argv.length;
  }

  // 取第 i 个参数（字符串）；越界返回空串
  args_get(i) {
    const idx = Math.trunc(i);
    return this.vm.pushStr(idx >= 0 && idx < this.argv.length ? this.argv[idx] : '');
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
      controls: [],        // 声明式控件：每帧 paint 时重置，由 drapp 填充
      inputs: new Map(),   // 输入框持久值：id -> string（跨帧保留用户输入）
      style: { color: [255, 255, 255], font: 14, mono: false, bold: false, italic: false, underline: false, alpha: 100, lineW: 1 },
      title, w, h,
      dirty: true,
      tickMs: 0,       // win_tick(ms)：>0 时宿主按该间隔注入 paint（逐帧动画）
      lastTick: 0,
      tickBusy: false,
    });
    this.curWinId = id;
    const st0 = this.drapWins.get(id);
    if (st0) st0.__openPath = this._openPath || '';
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
    st.drawOps.push({ op: 'text', x, y, text: this.vm.readStr(strPtr), color: st.style.color.slice(), font: st.style.font, mono: !!st.style.mono, bold: !!st.style.bold, italic: !!st.style.italic, underline: !!st.style.underline, alpha: st.style.alpha });
    return 0;
  }

  // 居中文本：以 cx 为水平中心绘制（宿主用 measureText 精确居中；中文/数字混排不再靠字宽估算）
  win_textc(cx, y, strPtr) {
    const st = this._cur(); if (!st) return 0;
    st.drawOps.push({ op: 'textc', x: cx, y, text: this.vm.readStr(strPtr), color: st.style.color.slice(), font: st.style.font, mono: !!st.style.mono, bold: !!st.style.bold, italic: !!st.style.italic, underline: !!st.style.underline, alpha: st.style.alpha });
    return 0;
  }

  win_fill_rect(x, y, w, h) {
    const st = this._cur();
    if (!st) return 0;
    st.drawOps.push({ op: 'fill', x, y, w, h, color: st.style.color.slice(), alpha: st.style.alpha });
    return 0;
  }

  win_stroke_rect(x, y, w, h) {
    const st = this._cur();
    if (!st) return 0;
    st.drawOps.push({ op: 'stroke', x, y, w, h, color: st.style.color.slice(), lineW: st.style.lineW, alpha: st.style.alpha });
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

  // 设置后续 win_text 的样式：bold / italic / underline（0=关，非 0=开）
  win_set_style(bold, italic, underline) {
    const st = this._cur();
    if (!st) return 0;
    st.style.bold = (bold != 0);
    st.style.italic = (italic != 0);
    st.style.underline = (underline != 0);
    return 0;
  }

  // 切换等宽字体（编辑器光标精确定位）：on 非 0 → 等宽
  win_mono(on) {
    const st = this._cur();
    if (!st) return 0;
    st.style.mono = (on != 0);
    return 0;
  }

  // 预设输入框内容（drapp 主动写，如预填文件路径）
  win_set_input(idPtr, valPtr) {
    const st = this._cur();
    if (!st) return 0;
    st.inputs.set(this.vm.readStr(idPtr), this.vm.readStr(valPtr));
    return 0;
  }

  // 主题语义色：slot 0=背景 1=前景 2=强调 3=工具栏 4=选中，设置当前绘制色（双主题内容级适配用）
  win_theme(slot) {
    const st = this._cur();
    if (!st) return 0;
    let c = [255, 255, 255];
    if (typeof this.getTheme === 'function') {
      const pal = this.getTheme();
      if (Array.isArray(pal)) c = pal[slot & 7] || c;
    }
    st.style.color = [c[0] & 255, c[1] & 255, c[2] & 255];
    return 0;
  }

  // 切换系统主题（drapp 版「设置」调用；宿主钩子转 wm.setTheme）
  win_set_theme(namePtr) {
    if (typeof this.onSetTheme === 'function') this.onSetTheme(this.vm.readStr(namePtr));
    return 0;
  }

  // 在 Finder 打开路径（drapp 版「此电脑」双击调用）
  win_open_finder(pathPtr) {
    if (typeof this.onOpenFinder === 'function') this.onOpenFinder(this.vm.readStr(pathPtr));
    return 0;
  }

  // 切换移动端软键盘（drapp 版「设置」调用）
  win_set_softkeyboard(on) {
    if (typeof this.onSetSoftKeyboard === 'function') this.onSetSoftKeyboard(on != 0);
    return 0;
  }
  // 读取当前主题：返回 0=macos 1=windows（设置 App 启动高亮用）
  win_get_theme() {
    const name = (typeof this.onGetThemeName === 'function') ? this.onGetThemeName() : 'macos';
    return name === 'windows' ? 1 : 0;
  }
  // 读取软键盘状态：返回 0=关 1=开（设置 App 启动显示用）
  win_get_softkeyboard() {
    return (typeof this.onGetSoftKeyboard === 'function' && this.onGetSoftKeyboard()) ? 1 : 0;
  }
  // 读取本窗口透传的初始打开路径（openFinderAt 启动时设置；默认空串 → 用应用内默认 cwd）
  win_get_open_path() {
    const st = this._cur();
    return this.vm.pushStr((st && st.__openPath) || '');
  }

  /* ---------- 应用注册表 / 宿主桥接 ----------
     DrapLang 应用经此枚举并启动其它应用、绘制应用图标、执行宿主命令、把文件移入废纸篓，
     从而把 Finder / Terminal / AppMgr / TextEdit / About 等从 JS 宿主改写为 DrapLang 自举。
  ------------------------------------------------------------ */

  // 枚举已注册应用：返回每行 "id|name|category"，以 \n 分隔；无注册表返回空串
  win_app_list() {
    const list = this.registry ? this.registry.all() : [];
    const text = list
      .map(a => a.id + '|' + (a.name || a.id) + '|' + (a.category || ''))
      .join('\n');
    return this.vm.pushStr(text);
  }

  // 启动一个应用（id）；成功返回 1，否则 0
  async win_app_launch(idPtr) {
    const id = this.vm.readStr(idPtr);
    if (!this.registry) return 0;
    try {
      const r = await this.registry.launch(id, { wm: this.wm, vfs: this.vfs });
      return (r && r.ok) ? 1 : 0;
    } catch (e) { return 0; }
  }

  // 执行一条宿主命令（ls/cd/cat/echo/run...），返回捕获到的输出文本（\n 连接）
  async win_shell_exec(linePtr) {
    const line = this.vm.readStr(linePtr);
    if (!this._appShell) {
      const { DrapShell } = await import('./drapog.shell.js');
      this._appShell = new DrapShell({
        vfs: this.vfs,
        registry: this.registry,
        wm: this.wm,
        print: (s) => { this._shellBuf.push(String(s)); },
        clear: () => { this._shellBuf = []; },
        exit: () => {},
        switchToGUI: () => {},
      });
      this._appShell.cwd = this._shellCwd;
    }
    this._shellBuf = [];
    try { await this._appShell.executeLegacy(line); }
    catch (e) { this._shellBuf.push('错误: ' + e.message); }
    this._shellCwd = this._appShell.cwd;
    return this.vm.pushStr(this._shellBuf.join('\n'));
  }

  // 绘制一个应用的图标（手绘 squircle）。注意：DrapLang 桥接应用经 drapAppBridge.render
  // 事后重放 drawOps，若直接画到 wm.ctx 会被随后重放的「格子底色 fill」覆盖而消失；
  // 因此这里入队一个 icon 指令，由桥接渲染时按正确 z 序（底色→图标→文字）重放。
  // 返回 1（已入队）；id 无图标规格时 drawAppIcon 仍会退回字母渲染。
  win_app_icon(idPtr, x, y, size) {
    const st = this._cur();
    if (!st) return 0;
    st.drawOps.push({ op: 'icon', id: this.vm.readStr(idPtr), x, y, size });
    return 1;
  }

  // 绘制手绘图标（文件/文件夹/动作等）：入队 'glyph' drawOp，由宿主桥接重放时按 z 序绘制
  win_glyph(namePtr, x, y, size) {
    const st = this._cur();
    if (!st) return 0;
    st.drawOps.push({ op: 'glyph', name: this.vm.readStr(namePtr), x, y, size });
    return 1;
  }

  /* ---------- 矢量绘图（直线 / 圆 / 弧 / 圆角矩形） ----------
     与 fill / stroke / text 一致，指令入队到 drawOps，由宿主桥接按 z 序重放。
     这样 DrapLang 应用不需要原生 canvas 能力，也能画出波形 / 圆环 / 粒子等媒体图形。
  ------------------------------------------------------------ */

  win_line(x1, y1, x2, y2) {
    const st = this._cur(); if (!st) return 0;
    st.drawOps.push({ op: 'line', x1, y1, x2, y2, color: st.style.color.slice(), lineW: st.style.lineW, alpha: st.style.alpha });
    return 0;
  }

  // mode：0=填充，非 0=描边
  win_circle(cx, cy, r, mode) {
    const st = this._cur(); if (!st) return 0;
    if (r <= 0) return 0;
    st.drawOps.push({ op: 'circle', cx, cy, r, fill: (mode == 0), color: st.style.color.slice(), lineW: st.style.lineW, alpha: st.style.alpha });
    return 0;
  }

  // 圆弧（描边），角度制：0=右侧，顺时针（屏幕坐标 y 向下）
  win_arc(cx, cy, r, a0, a1) {
    const st = this._cur(); if (!st) return 0;
    if (r <= 0) return 0;
    st.drawOps.push({ op: 'arc', cx, cy, r, a0, a1, color: st.style.color.slice(), lineW: st.style.lineW, alpha: st.style.alpha });
    return 0;
  }

  win_rrect(x, y, w, h, rad) {
    const st = this._cur(); if (!st) return 0;
    st.drawOps.push({ op: 'rrect', x, y, w, h, rad, color: st.style.color.slice(), alpha: st.style.alpha });
    return 0;
  }

  // 透明度（0..100），影响之后入队的绘制指令
  win_alpha(a) {
    const st = this._cur(); if (!st) return 0;
    let v = Math.trunc(a);
    if (v < 0) v = 0; if (v > 100) v = 100;
    st.style.alpha = v;
    return 0;
  }

  // 线宽（>=1）
  win_set_line(w) {
    const st = this._cur(); if (!st) return 0;
    let v = Math.trunc(w);
    if (v < 1) v = 1;
    st.style.lineW = v;
    return 0;
  }

  /* ---------- 帧驱动 ----------
     DrapLang 侧没有定时器，win_tick(ms) 让宿主桥接按间隔注入 paint 事件，
     on_paint 每帧重新计算状态并重绘（宿主每帧重放 drawOps），即可做动画。
  ------------------------------------------------------------ */
  win_tick(ms) {
    const st = this._cur(); if (!st) return 0;
    let v = Math.trunc(ms);
    if (v < 0) v = 0;
    st.tickMs = v;
    st.lastTick = 0;
    st.tickBusy = false;
    return 0;
  }

  // 毫秒时间戳（帧内计时 / 秒表 / 动画相位）
  win_millis() {
    return Date.now();
  }

  /* ---------- 音频（宿主音频引擎，浏览器环境可用；无引擎时全部安全退化） ---------- */
  // cmd：0=播放 1=暂停 2=停止 3=麦克风开 4=麦克风关 5=系统音频开
  win_audio(cmd) {
    const a = this.audio;
    if (!a) return 0;
    try {
      switch (Math.trunc(cmd)) {
        case 0: a.play(); return 1;
        case 1: a.pause(); return 1;
        case 2: a.stop(); return 1;
        case 3: a.micOn(); return 1;
        case 4: a.micOff(); return 1;
        case 5: a.systemOn(); return 1;
        default: return 0;
      }
    } catch (e) { return 0; }
  }

  // 弹出宿主文件选择框，加载音视频文件；返回文件名（取消返回空串）
  async win_audio_open() {
    const a = this.audio;
    if (!a || typeof a.open !== 'function') return this.vm.pushStr('');
    try {
      const name = await a.open();
      return this.vm.pushStr(name || '');
    } catch (e) { return this.vm.pushStr(''); }
  }

  // 跳转：permille 0..1000（千分比，DrapLang 侧无小数也不失精度）
  win_audio_seek(permille) {
    if (!this.audio || typeof this.audio.seek !== 'function') return 0;
    try { this.audio.seek(permille); return 1; } catch (e) { return 0; }
  }

  // 状态："playing|posMs|lenMs|name"（无音频时 "0|0|0|"）
  win_audio_state() {
    if (!this.audio || typeof this.audio.state !== 'function') return this.vm.pushStr('0|0|0|');
    try { return this.vm.pushStr(this.audio.state()); } catch (e) { return this.vm.pushStr('0|0|0|'); }
  }

  // 频谱第 i 个分量（共 n 个），返回 0..100
  win_audio_band(i, n) {
    if (!this.audio || typeof this.audio.band !== 'function') return 0;
    try { return this.audio.band(i, n); } catch (e) { return 0; }
  }

  // 提示音（计时结束 / 节拍）：频率 Hz + 时长 ms
  win_audio_beep(freq, ms) {
    if (!this.audio || typeof this.audio.beep !== 'function') return 0;
    try { this.audio.beep(freq, ms); return 1; } catch (e) { return 0; }
  }

  // 把路径移入废纸篓（经 VFS 共享底层工具）；成功返回 1，否则 0
  async win_trash(pathPtr) {    const path = this.vm.readStr(pathPtr);
    try { return (await moveToTrash(this.vfs, path)) ? 1 : 0; }
    catch (e) { return 0; }
  }

  // 取下一个事件：队列非空立即返回；否则阻塞等待（续体，与 term_read 同机制）
  win_get_event() {
    const st = this._cur();
    if (!st) return this.vm.pushStr('');
    // 本轮事件已被取走：解除 tick 占用标记，宿主可安排下一帧（避免 tick 堆积）
    st.tickBusy = false;
    if (st.queue.length > 0) {
      const ev = st.queue.shift();
      if (ev === 'paint') { st.drawOps = []; st.controls = []; }
      return this.vm.pushStr(ev);
    }
    return new Promise(resolve => {
      st.resolver = (ev) => {
        st.resolver = null;
        if (ev === 'paint') { st.drawOps = []; st.controls = []; }
        resolve(this.vm.pushStr(ev));
      };
    });
  }

  // 请求重绘：push 一个 paint 事件（若 VM 阻塞则唤醒）
  win_invalidate(winId) {
    this._pushEvent(winId, 'paint');
    return 0;
  }

  /* ---------- GUI 控件框架（win_gui）：声明式控件 ----------
     drapp 在 paint 分支里调用 win_button/win_label/win_input 声明控件；
     宿主（drapAppBridge）自动布局、绘制与命中，并把命中事件以
     'click <id>' / 'input <id> <val>' 注入，drapp 不再手绘矩形、不手算坐标。
  ------------------------------------------------------------ */

  // 窗口尺寸（drapp 自适应布局，替代硬编码宽高）
  win_w() { const st = this._cur(); return st ? st.w : 0; }
  win_h() { const st = this._cur(); return st ? st.h : 0; }

  // 声明一个按钮：id 同时作为显示文字（命中事件为 'click <id>'）
  win_button(idPtr, x, y, w, h) {
    const st = this._cur(); if (!st) return 0;
    st.controls.push({ id: this.vm.readStr(idPtr), type: 'button', x, y, w, h });
    return 0;
  }

  // 声明一个静态标签（不可交互）
  win_label(x, y, textPtr) {
    const st = this._cur(); if (!st) return 0;
    st.controls.push({ type: 'label', x, y, text: this.vm.readStr(textPtr) });
    return 0;
  }

  // 声明一个输入框：id 标识；值由宿主键盘/软键盘维护（跨帧保留）
  win_input(idPtr, x, y, w, h) {
    const st = this._cur(); if (!st) return 0;
    const id = this.vm.readStr(idPtr);
    if (!st.inputs.has(id)) st.inputs.set(id, '');
    st.controls.push({ id, type: 'input', x, y, w, h });
    return 0;
  }

  // 读取输入框当前值（str）
  win_input_get(idPtr) {
    const st = this._cur(); if (!st) return 0;
    const id = this.vm.readStr(idPtr);
    return this.vm.pushStr(st.inputs.get(id) || '');
  }

  // 宿主桥接：命中测试控件（返回控件对象或 null）
  hitControl(winId, x, y) {
    const st = this.drapWins.get(winId);
    if (!st) return null;
    for (let i = st.controls.length - 1; i >= 0; i--) {
      const c = st.controls[i];
      if (!c.id) continue;                 // label 无交互
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c;
    }
    return null;
  }

  // 宿主桥接：写入输入框当前值（宿主在键盘事件中调用）
  setInputValue(winId, id, val) {
    const st = this.drapWins.get(winId);
    if (st) st.inputs.set(id, val);
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