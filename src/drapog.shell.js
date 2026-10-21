/**
 * @file        drapog.shell.js
 * @module      drapog/shell
 * @summary     DrapShell 命令行（宿主层）
 * @version     0.9.0
 * @description 自举后：本类只做「宿主」，运行 System/shell.drap（DrapLang REPL）。
 *               REPL 经 term_read 拉行、经 syscall 调底层工具；宿主专属命令
 *               （mount/cc/load/save/asm/dis/dump/run…）经 term_hostcmd 委托回本类的
 *               executeLegacy。若 shell.drap 缺失/编译失败，自动回退到 JS 版 executeLegacy。
 */

import { idbSet, idbGet, idbDelete } from './drapog.idb.js';
import { makeLineWriter } from './drapog.stream.js';

const IDB_KEY = 'rootHandle';

export class DrapShell {
  constructor(io) {
    this.io = io;
    this.vfs = io.vfs;
    this.cwd = '/Users/guest';
    this.registry = io.registry || null;   // 应用注册表（L3/L4 统一启动）
    // REPL 自举状态（务必初始化，否则首次 execute 读 inputWaiters 会崩）
    this.replStarted = false;
    this.legacyMode = false;
    this.inputQueue = [];
    this.inputWaiters = [];
  }

  /* ============================================================
     自举入口：跑 DrapLang REPL（宿主职责）
     ============================================================ */
  async execute(line) {
    if (!this.replStarted) {
      try {
        await this._ensureRepl();
      } catch (e) {
        this.replStarted = true;          // 不再重试，避免每次回车都重读 shell.drap
        this.legacyMode = true;
        if (this.io.print) this.io.print('DrapLang Shell 不可用，回退兼容模式：' + e.message);
      }
    }
    if (this.legacyMode) return this.executeLegacy(line);
    // 把这一行喂给 VM REPL 的 term_read 队列
    if (this.inputWaiters.length > 0) {
      const w = this.inputWaiters.shift();
      w(line);
    } else {
      this.inputQueue.push(line);
    }
  }

  // 启动 DrapLang Shell（脱离式：vm.run 在后台跑，exit 才自然停机）
  async _ensureRepl() {
    if (this.replStarted) return;
    this.replStarted = true;
    let src = await this.vfs.read('/System/shell.drapp');
    if (src === null) {
      // 未挂载（内存模式）：从项目服务端 fetch 源码，免 mount 即可跑 DrapLang Shell
      try {
        const r = await fetch(new URL('../System/shell.drapp', import.meta.url), { cache: 'no-store' });
        if (r.ok) src = await r.text();
      } catch (e) { /* 忽略，落入下方抛错 */ }
    }
    if (src === null) throw new Error('缺少 /System/shell.drapp');
    const { DrapCC } = await import('./drapcc.js');
    const { VM } = await import('./drapog.vm.js');
    const { DrapSYS } = await import('./drapog.sys.js');
    const program = new DrapCC(src).compile();
    const vm = new VM();
    vm.load(program);
    const w = makeLineWriter(l => { if (this.io.print) this.io.print(l); });
    vm.onOutput = w.feed;
    const sys = new DrapSYS({
      vm, vfs: this.vfs,
      out: s => { for (const l of String(s).split('\n')) if (this.io.print) this.io.print(l); },
      onRead: () => this._readLine(),
    });
    sys.onCwd = c => { this.cwd = c; };
    sys.onExit = () => { this._exited = true; };
    sys.onClear = () => { if (this.io.clear) this.io.clear(); };
    sys.onSwitchGUI = () => { if (this.io.switchToGUI) this.io.switchToGUI(); };
    sys.hostExec = ln => this.executeLegacy(ln);   // 宿主专属命令委托回 JS 工具
    vm.sys = sys;
    this.sys = sys;
    this.vm = vm;
    this._replDone = vm.run()
      .then(() => {
        w.flush();
        if (sys.terminated && this.io.exit) this.io.exit();   // 自然停机后由宿主收尾
      })
      .catch(err => {
        if (this.io.print) this.io.print('Shell 运行错误：' + err.message);
        this.legacyMode = true;
      });
  }

  // term_read 的宿主实现：从输入队列/等待者取一行
  _readLine() {
    if (this.inputQueue.length > 0) return Promise.resolve(this.inputQueue.shift());
    return new Promise(res => this.inputWaiters.push(res));
  }

  // 统一演示运行（run 命令）：编译并跑一段 demo 源，输出经 io.print
  async _runDemo() {
    const src = this.io.getDemoSource ? this.io.getDemoSource() : null;
    if (!src) { if (this.io.print) this.io.print('run: 无演示源'); return; }
    if (this.io.print) this.io.print('编译 demo.drap...');
    try {
      const { DrapCC } = await import('./drapcc.js');
      const { VM } = await import('./drapog.vm.js');
      const { DrapSYS } = await import('./drapog.sys.js');
      const program = new DrapCC(src).compile();
      if (this.io.print) this.io.print('编译完成，' + program.instructions.length + ' 条指令');
      if (this.io.print) this.io.print('---');
      const w = makeLineWriter(l => { if (this.io.print) this.io.print(l); });
      const vm = new VM();
      vm.load(program);
      vm.onOutput = w.feed;
      const sys = new DrapSYS({
        vm, vfs: this.vfs,
        out: s => { for (const l of String(s).split('\n')) if (this.io.print) this.io.print(l); },
      });
      vm.sys = sys;
      await vm.run();
      w.flush();
      if (this.io.print) this.io.print('---');
    } catch (err) {
      if (this.io.print) this.io.print('编译/执行错误：' + err.message);
    }
  }

  /* run 命令：从注册表启动应用（L3/L4 统一启动）。无 registry 时回退演示 */
  async _cmdRun(args) {
    if (!this.registry) return this._runDemo();
    const name = args[0];
    if (!name) {
      const ids = this.registry.all().filter(a => a.id !== 'appmgr').map(a => a.id);
      if (this.io.print) this.io.print('run: 用法 run <app> [参数...]');
      if (this.io.print) this.io.print('可用: ' + ids.join(' '));
      return;
    }
    const app = this.registry.get(name);
    const argv = [name, ...args.slice(1)];   // argv[0] = 程序名
    const r = await this.registry.launch(name, { wm: (this.io && this.io.wm) || null, io: this.io, argv });
    if (r.error) { if (this.io.print) this.io.print(r.error); return; }
    // CLI 应用自己产出输出，不重复提示；仅 GUI/host 提示已启动
    if (app && app.type !== 'cli' && this.io.print) this.io.print('已启动 ' + name);
  }

  /* ============================================================
     应用管理（L4：.app 包的安装 / 卸载 / 打包 / 浏览）
     ============================================================ */

  /* 列出所有已注册应用（不含 AppMgr 自身） */
  _cmdApps() {
    if (!this.registry) return this.io.print('注册表未就绪');
    const list = this.registry.all().filter(a => a.id !== 'appmgr');
    if (!list.length) return this.io.print('（无已注册应用）');
    this.io.print('ID'.padEnd(12) + '名称'.padEnd(18) + '类型'.padEnd(6) + '版本');
    for (const a of list) {
      this.io.print(
        String(a.id).padEnd(12) +
        String(a.name || '').padEnd(18) +
        String(a.type).padEnd(6) +
        (a.version || '-')
      );
    }
  }

  /* 显示一个应用的完整元数据 */
  _cmdInfo(args) {
    if (!this.registry) return this.io.print('注册表未就绪');
    const id = args[0];
    if (!id) return this.io.print('info: 用法 info <id>');
    const a = this.registry.get(id);
    if (!a) return this.io.print('info: 未知应用 ' + id);
    const rows = [
      ['id', a.id], ['name', a.name], ['type', a.type],
      ['version', a.version || '-'], ['icon', a.icon || '-'],
      ['author', a.author || '-'], ['category', a.category || '-'],
      ['description', a.description || '-'], ['minVersion', a.minVersion || '-'],
      ['permissions', (a.permissions && a.permissions.length) ? a.permissions.join(', ') : '(none)'],
    ];
    for (const [k, v] of rows) this.io.print(k.padEnd(12) + ': ' + v);
  }

  /* 递归复制目录树（install 用）：源在 VFS，目标写入 VFS */
  async _copyTree(srcDir, destDir) {
    const items = await this.vfs.ls(srcDir);
    if (!items) return;
    for (const it of items) {
      const s = srcDir + '/' + it.name;
      const d = destDir + '/' + it.name;
      if (it.type === 'dir') {
        await this._copyTree(s, d);
      } else if (it.name.endsWith('.dbyte')) {
        const bytes = await this.vfs.readBytes(s);
        if (bytes && bytes.length) await this.vfs.writeBytes(d, bytes);
      } else {
        const text = await this.vfs.read(s);
        if (text !== null) await this.vfs.write(d, text);
      }
    }
  }

  /* 递归删除目录树（uninstall 用）：VFS.rm 拒绝非空目录，故先删子项 */
  async _rmTree(dir) {
    const items = await this.vfs.ls(dir);
    if (items) {
      for (const it of items) {
        const p = dir + '/' + it.name;
        if (it.type === 'dir') await this._rmTree(p);
        else await this.vfs.rm(p);
      }
    }
    await this.vfs.rm(dir);
  }

  /* 安装一个 .app 目录到 System/Apps/<id>.app，并让其被注册表发现 */
  async _cmdInstall(args) {
    if (!args[0]) return this.io.print('install: 用法 install <src.app目录>');
    if (!this.registry) return this.io.print('注册表未就绪');
    const srcDir = this.vfs.normalize(this.cwd, args[0]);
    if (!srcDir.endsWith('.app')) return this.io.print('install: 源必须是 *.app 目录');
    if (!await this.vfs.exists(srcDir)) return this.io.print('install: 无此目录 ' + srcDir);
    if (!await this.vfs.isDir(srcDir)) return this.io.print('install: 不是目录 ' + srcDir);
    const infoRaw = await this.vfs.read(srcDir + '/Info.json');
    if (infoRaw === null) return this.io.print('install: 缺少 Info.json');
    let info;
    try { info = JSON.parse(infoRaw); }
    catch (e) { return this.io.print('install: Info.json 解析失败: ' + e.message); }
    if (!info.id) return this.io.print('install: Info.json 缺 id');
    const destDir = 'System/Apps/' + info.id + '.app';
    await this._copyTree(srcDir, destDir);
    await this.registry.scan(this.vfs, 'System/Apps');
    this.io.print('已安装: ' + destDir);
  }

  /* 卸载应用：删除 System/Apps/<id>.app 并从注册表注销 */
  async _cmdUninstall(args) {
    if (!args[0]) return this.io.print('uninstall: 用法 uninstall <id>');
    if (!this.registry) return this.io.print('注册表未就绪');
    const id = args[0];
    const dir = 'System/Apps/' + id + '.app';
    if (!await this.vfs.exists(dir)) return this.io.print('uninstall: 无此应用 ' + id);
    await this._rmTree(dir);
    this.registry.unregister(id);
    this.io.print('已卸载: ' + id);
  }

  /* 打包：把单个 .drapp 源文件封装成 System/Apps/<name>.app/{Info.json,main.drapp} */
  async _cmdPack(args) {
    if (!this.registry) return this.io.print('注册表未就绪');
    let gui = false, input = null, name = null;
    for (const a of args) {
      if (a === '-g' || a === '-gui' || a === '--gui') gui = true;
      else if (!input) input = a;
      else if (!name) name = a;
    }
    if (!input) return this.io.print('pack: 用法 pack <in.drapp> [name] [-gui]');
    const inAbs = this.vfs.normalize(this.cwd, input);
    const src = await this.vfs.read(inAbs);
    if (src === null || src === undefined) return this.io.print('pack: 无法读取 ' + inAbs);
    const base = name || inAbs.split('/').pop().replace(/\.(drap|drapp)$/i, '');
    const appDir = 'System/Apps/' + base + '.app';
    const info = {
      id: base, name: base, type: gui ? 'gui' : 'cli', entry: 'main.drapp',
      version: '1.0', icon: gui ? '◆' : '>',
      author: 'pack', description: '由 pack 命令打包', category: gui ? 'demo' : 'tools',
    };
    const okInfo = await this.vfs.write(appDir + '/Info.json', JSON.stringify(info, null, 2));
    const okMain = await this.vfs.write(appDir + '/main.drapp', src);
    if (!okInfo || !okMain) return this.io.print('pack: 写入失败 ' + appDir);
    await this.registry.scan(this.vfs, 'System/Apps');
    this.io.print('已打包: ' + appDir + ' (type=' + info.type + ')');
  }

  /* ============================================================
     兼容模式 / 宿主专属命令（REPL 经 term_hostcmd 委托到这里）
     ============================================================ */
  async executeLegacy(line) {
    const t = line.trim();
    if (!t) return;
    const parts = this._split(t);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':    return this._cmdHelp();
      case 'clear':   return this.io.clear();
      case 'echo':    return this.io.print(args.join(' '));
      case 'run':     return await this._cmdRun(args);
      case 'exit':    return this.io.exit();
      case 'gui':     return this.io.switchToGUI(args[0]);
      case 'save':    return await this._cmdSave(args);
      case 'load':    return await this._cmdLoad(args);
      case 'dump':    return await this._cmdDump(args);
      case 'asm':     return await this._cmdAsm(args);
      case 'dis':     return await this._cmdDis(args);
      case 'cc':      return await this._cmdCC(args);

      case 'apps':      return this._cmdApps();
      case 'info':      return this._cmdInfo(args);
      case 'install':   return await this._cmdInstall(args);
      case 'uninstall': return await this._cmdUninstall(args);
      case 'pack':      return await this._cmdPack(args);

      case 'pwd':     return this.io.print(this.cwd);
      case 'ls':      return await this._cmdLs(args);
      case 'cd':      return await this._cmdCd(args);
      case 'mkdir':   return await this._cmdMkdir(args);
      case 'touch':   return await this._cmdTouch(args);
      case 'cat':     return await this._cmdCat(args);
      case 'rm':      return await this._cmdRm(args);

      case 'mount':   return await this._cmdMount();
      case 'remount': return await this._cmdRemount();
      case 'umount':  return await this._cmdUmount();
      case 'df':      return this._cmdDf();

      default:
        this.io.print('未知命令: ' + cmd);
        this.io.print('输入 help 查看可用命令。');
    }
  }

  async tryRestore() {
    if (this.vfs.mode === 'fsaccess') return;
    if (typeof window.showDirectoryPicker !== 'function') return;

    let handle;
    try {
      handle = await idbGet(IDB_KEY);
    } catch (e) {
      return;
    }
    if (!handle) return;

    let perm = 'prompt';
    try {
      perm = await handle.queryPermission({ mode: 'readwrite' });
    } catch (e) {
      return;
    }

    if (perm === 'granted') {
      try {
        await this.vfs.mount(handle);
        this.cwd = '/Users/guest';
        this.io.print('已自动挂载: ' + handle.name + '（真实磁盘）');
      } catch (e) {
        this.io.print('自动挂载失败: ' + e.message);
      }
      return;
    }

    if (perm === 'prompt') {
      this.io.print('检测到上次挂载的文件夹 "' + handle.name + '"，需要重新授权。');
      this.io.print('输入 remount 恢复。');
      return;
    }

    try { await idbDelete(IDB_KEY); } catch (e) {}
  }

  _cmdHelp() {
    const lines = [
      'DrapShell v0.5 可用命令：',
      '',
      '  系统',
      '    help              显示此帮助',
      '    clear             清屏',
      '    echo <text>       输出文本',
      '    exit              退出',
      '    gui [macos|windows]  进入图形界面（可指定主题，默认 macos）',
      '',
      '  文件',
      '    pwd               打印当前目录',
      '    ls [path]         列目录',
      '    cd <path>         切换目录',
      '    mkdir <path>      新建目录',
      '    touch <path>      新建空文件',
      '    cat <path>        查看文件内容',
      '    rm <path>         删除文件或空目录',
      '',
      '  编译/执行',
      '    run <app>         从注册表启动应用',
      '    cc <in> [-o <out>]  编译 .drapp → .dbyte',
      '    save <path>       编译内置 demo 保存为 .dbyte',
      '    load <path>       加载并运行 .dbyte',
      '    dump <path>       以十六进制显示 .dbyte',
      '    asm <in> [-o <out>]  汇编 .dasm → .dbyte',
      '    dis <in> [-o <out>]  反汇编 .dbyte → .dasm',
      '',
      '  应用管理（.app 包）',
      '    apps              列出所有已注册应用',
      '    info <id>         查看应用元数据',
      '    pack <in.drapp> [name] [-gui]  打包成 .app',
      '    install <src.app> 安装 .app 到 System/Apps',
      '    uninstall <id>    卸载应用',
      '',
      '  磁盘',
      '    mount             挂载真实文件夹（首次）',
      '    remount           恢复上次挂载（权限丢失后）',
      '    umount            卸载，回到内存文件系统',
      '    df                显示当前文件系统',
    ];
    for (const l of lines) this.io.print(l);
  }

  async _cmdMount() {
    if (typeof window.showDirectoryPicker !== 'function') {
      return this.io.print('mount: 当前浏览器不支持 File System Access API');
    }
    this.io.print('请在弹出的对话框中选择 DrapOG 根目录（包含 System/ 的那一层）...');
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await this.vfs.mount(handle);
      try { await idbSet(IDB_KEY, handle); } catch (e) {}
      this.cwd = '/Users/guest';
      this.io.print('已挂载: ' + handle.name);
      this.io.print('文件系统模式: 真实磁盘（读写）');
      this.io.print('下次刷新会自动恢复。');
    } catch (e) {
      if (e.name === 'AbortError') return this.io.print('已取消');
      this.io.print('mount 失败: ' + e.message);
    }
  }

  async _cmdRemount() {
    let handle;
    try {
      handle = await idbGet(IDB_KEY);
    } catch (e) {
      return this.io.print('remount: 无法读取 IndexedDB');
    }
    if (!handle) return this.io.print('remount: 没有保存的文件夹');

    let perm;
    try {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    } catch (e) {
      return this.io.print('remount: 请求权限失败: ' + e.message);
    }
    if (perm !== 'granted') return this.io.print('remount: 权限被拒绝');

    try {
      await this.vfs.mount(handle);
      this.cwd = '/Users/guest';
      this.io.print('已恢复挂载: ' + handle.name);
    } catch (e) {
      this.io.print('remount 失败: ' + e.message);
    }
  }

  async _cmdUmount() {
    if (this.vfs.mode === 'memory') return this.io.print('当前未挂载');
    this.vfs.unmount();
    this.cwd = '/Users/guest';
    try { await idbDelete(IDB_KEY); } catch (e) {}
    this.io.print('已卸载，回到内存文件系统');
  }

  _cmdDf() {
    this.io.print('文件系统: ' + (this.vfs.mode === 'fsaccess' ? 'FSAccess（真实磁盘）' : 'Memory（内存）'));
    if (this.vfs.rootHandle) this.io.print('挂载点:   ' + this.vfs.rootHandle.name);
  }

  async _cmdLs(args) {
    const target = args[0] || '.';
    const abs = this.vfs.normalize(this.cwd, target);
    if (!await this.vfs.exists(abs)) return this.io.print('ls: ' + target + ': 无此文件或目录');
    if (!await this.vfs.isDir(abs)) {
      return this.io.print(abs.split('/').pop());
    }
    const items = await this.vfs.ls(abs);
    if (!items) return this.io.print('ls: 无法读取目录');
    for (const it of items) this.io.print('  ' + it.name + (it.type === 'dir' ? '/' : ''));
  }

  async _cmdCd(args) {
    const target = args[0];
    if (!target || target === '~') { this.cwd = '/Users/guest'; return; }
    const abs = this.vfs.normalize(this.cwd, target);
    if (!await this.vfs.exists(abs)) return this.io.print('cd: ' + target + ': 无此目录');
    if (!await this.vfs.isDir(abs)) return this.io.print('cd: ' + target + ': 不是目录');
    this.cwd = abs;
  }

  async _cmdMkdir(args) {
    if (!args[0]) return this.io.print('mkdir: 缺少操作数');
    const abs = this.vfs.normalize(this.cwd, args[0]);
    const ok = await this.vfs.mkdir(abs);
    if (!ok) this.io.print('mkdir: 无法创建 "' + args[0] + '"');
  }

  async _cmdTouch(args) {
    if (!args[0]) return this.io.print('touch: 缺少操作数');
    const abs = this.vfs.normalize(this.cwd, args[0]);
    const ok = await this.vfs.touch(abs);
    if (!ok) this.io.print('touch: 无法创建 "' + args[0] + '"');
  }

  async _cmdCat(args) {
    if (!args[0]) return this.io.print('cat: 缺少操作数');
    const abs = this.vfs.normalize(this.cwd, args[0]);
    if (!await this.vfs.exists(abs)) return this.io.print('cat: ' + args[0] + ': 无此文件');
    if (await this.vfs.isDir(abs)) return this.io.print('cat: ' + args[0] + ': 是一个目录');
    const content = await this.vfs.read(abs);
    if (content === null) return this.io.print('cat: 读取失败');
    const text = content.endsWith('\n') ? content.slice(0, -1) : content;
    for (const l of text.split('\n')) this.io.print(l);
  }

  async _cmdRm(args) {
    if (!args[0]) return this.io.print('rm: 缺少操作数');
    const abs = this.vfs.normalize(this.cwd, args[0]);
    if (!await this.vfs.exists(abs)) return this.io.print('rm: ' + args[0] + ': 无此文件或目录');
    if (await this.vfs.isDir(abs)) {
      const items = await this.vfs.ls(abs);
      if (items && items.length > 0) return this.io.print('rm: ' + args[0] + ': 目录非空');
    }
    const ok = await this.vfs.rm(abs);
    if (!ok) this.io.print('rm: 无法删除 "' + args[0] + '"');
  }

  async _cmdCC(args) {
    let input = null, output = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-o') { output = args[++i]; }
      else if (!input) input = args[i];
    }
    if (!input) return this.io.print('cc: 用法 cc <in.drapp> [-o <out.dbyte>]');
    const inAbs = this.vfs.normalize(this.cwd, input);
    const outAbs = output
      ? this.vfs.normalize(this.cwd, output)
      : inAbs.replace(/\.(drap|drapp)$/i, '.dbyte');
    try {
      const src = await this.vfs.read(inAbs);
      if (src === null || src === undefined) {
        return this.io.print('cc: 无法读取 ' + inAbs);
      }
      const { DrapCC } = await import('./drapcc.js');
      const { pack } = await import('./drapog.dbyte.js');
      const program = new DrapCC(src).compile();
      const bytes = pack(program);
      const ok = await this.vfs.writeBytes(outAbs, bytes);
      if (!ok) return this.io.print('cc: 写入失败 ' + outAbs);
      this.io.print('编译: ' + inAbs);
      this.io.print('输出: ' + outAbs + ' (' + bytes.length + ' 字节, ' + program.instructions.length + ' 条指令)');
    } catch (e) {
      this.io.print('cc: ' + e.message);
    }
  }

  async _cmdSave(args) {
    if (!args[0]) return this.io.print('save: 用法 save <path>');
    try {
      const { pack } = await import('./drapog.dbyte.js');
      const { DrapCC } = await import('./drapcc.js');
      const src = this.io.getDemoSource();
      const program = new DrapCC(src).compile();
      const bytes = pack(program);
      const abs = this.vfs.normalize(this.cwd, this._expandTilde(args[0]));
      const ok = await this.vfs.writeBytes(abs, bytes);
      if (!ok) return this.io.print('save: 写入失败');
      this.io.print('已保存: ' + abs + ' (' + bytes.length + ' 字节)');
    } catch (e) {
      this.io.print('save: ' + e.message);
    }
  }

  async _cmdLoad(args) {
    if (!args[0]) return this.io.print('load: 用法 load <path.dbyte>');
    const abs = this.vfs.normalize(this.cwd, args[0]);
        try {
      const bytes = await this.vfs.readBytes(abs);
      if (!bytes || bytes.length === 0) {
        return this.io.print('load: 无法读取: ' + abs);
      }
      const { VM } = await import('./drapog.vm.js');
      const { DrapSYS } = await import('./drapog.sys.js');
      const vm = new VM();
      vm.loadFromBytes(bytes);
      const w = makeLineWriter(l => this.io.print(l));
      vm.onOutput = w.feed;
      const sys = new DrapSYS({
        vm,
        vfs: this.vfs,
        out: s => {
          const ls = String(s).split('\n');
          for (const l of ls) this.io.print(l);
        },
      });
      vm.sys = sys;
      await vm.run();
      w.flush();
    } catch (e) {
      this.io.print('load: ' + e.message);
    }
  }

  async _cmdDump(args) {
    if (!args[0]) return this.io.print('dump: 用法 dump <path.dbyte>');
    const abs = this.vfs.normalize(this.cwd, this._expandTilde(args[0]));
    try {
      const bytes = await this.vfs.readBytes(abs);
      if (!bytes || bytes.length === 0) {
        return this.io.print('dump: 无法读取: ' + abs);
      }
      const { hexdump } = await import('./drapog.dbyte.js');
      for (const l of hexdump(bytes).split('\n')) this.io.print(l);
    } catch (e) {
      this.io.print('dump: ' + e.message);
    }
  }

  async _cmdAsm(args) {
    let input = null, output = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-o') { output = args[++i]; }
      else if (!input) input = args[i];
    }
    if (!input) return this.io.print('asm: 用法 asm <in.dasm> [-o <out.dbyte>]');
    const inAbs = this.vfs.normalize(this.cwd, this._expandTilde(input));
    const outAbs = output
      ? this.vfs.normalize(this.cwd, this._expandTilde(output))
      : inAbs.replace(/\.dasm$/, '.dbyte');
    try {
      const { assemble } = await import('./drapas.js');
      const src = await this.vfs.read(inAbs);
      if (!src) return this.io.print('asm: 无法读取 ' + inAbs);
      const bytes = assemble(src);
      const ok = await this.vfs.writeBytes(outAbs, bytes);
      if (!ok) return this.io.print('asm: 写入失败 ' + outAbs);
      this.io.print('已汇编: ' + outAbs + ' (' + bytes.length + ' 字节)');
    } catch (e) {
      this.io.print('asm: ' + e.message);
    }
  }

  async _cmdDis(args) {
    let input = null, output = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-o') { output = args[++i]; }
      else if (!input) input = args[i];
    }
    if (!input) return this.io.print('dis: 用法 dis <in.dbyte> [-o <out.dasm>]');
    const inAbs = this.vfs.normalize(this.cwd, this._expandTilde(input));
    try {
      const { disassemble } = await import('./drapdis.js');
      const bytes = await this.vfs.readBytes(inAbs);
      if (!bytes || bytes.length === 0) {
        return this.io.print('dis: 无法读取 ' + inAbs);
      }
      const text = disassemble(bytes, inAbs);
      if (output) {
        const outAbs = this.vfs.normalize(this.cwd, this._expandTilde(output));
        const ok = await this.vfs.write(outAbs, text);
        if (!ok) return this.io.print('dis: 写入失败 ' + outAbs);
        this.io.print('已反汇编: ' + outAbs + ' (' + text.length + ' 字符)');
      } else {
        for (const l of text.split('\n')) this.io.print(l);
      }
    } catch (e) {
      this.io.print('dis: ' + e.message);
    }
  }

  _expandTilde(p) {
    if (p === '~') return '/Users/guest';
    if (p.startsWith('~/')) return '/Users/guest/' + p.slice(2);
    return p;
  }

  _split(line) {
    const out = [];
    let cur = '';
    let inQuote = false;
    let quoteChar = '';
    let i = 0;
    const n = line.length;
    const flush = () => { if (cur) { out.push(cur); cur = ''; } };
    while (i < n) {
      const c = line[i];
      if (inQuote && c === '\\') {
        const nx = line[i + 1];
        if (nx === quoteChar || nx === '\\') { cur += nx; i += 2; continue; }
        cur += c; i++; continue;          // 其它反斜杠原样保留
      }
      if (!inQuote) {
        if (c === '"' || c === "'") { flush(); inQuote = true; quoteChar = c; i++; continue; }
        if (/\s/.test(c)) { flush(); i++; continue; }   // 未引号空白：折叠，不产生空 token
      } else if (c === quoteChar) {
        out.push(cur); cur = '';            // 闭引号：保留引号内内容（含空 token，如 echo ""）
        inQuote = false; quoteChar = ''; i++; continue;
      }
      cur += c; i++;
    }
    flush();                                // 末尾 token（引号产生的空 token 已在闭引号处保留）
    return out;
  }
}