/**
 * @file        drapog.shell.js
 * @module      drapog/shell
 * @summary     DrapShell 命令行
 * @version     0.5.0
 */

import { idbSet, idbGet, idbDelete } from './drapog.idb.js';

const IDB_KEY = 'rootHandle';

export class DrapShell {
  constructor(io) {
    this.io = io;
    this.vfs = io.vfs;
    this.cwd = '/Users/guest';
  }

  async execute(line) {
    const t = line.trim();
    if (!t) return;
    const parts = this._split(t);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':    return this._cmdHelp();
      case 'clear':   return this.io.clear();
      case 'echo':    return this.io.print(args.join(' '));
      case 'run':     return this.io.runDemo();
      case 'exit':    return this.io.exit();
      case 'gui':     return this.io.switchToGUI();
      case 'save':    return await this._cmdSave(args);
      case 'load':    return await this._cmdLoad(args);
      case 'dump':    return await this._cmdDump(args);
      case 'asm':     return await this._cmdAsm(args);
      case 'dis':     return await this._cmdDis(args);
      case 'cc':      return await this._cmdCC(args);

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
      '    run               运行内置演示程序',
      '    cc <in> [-o <out>]  编译 .drap → .dbyte',
      '    save <path>       编译内置 demo 保存为 .dbyte',
      '    load <path>       加载并运行 .dbyte',
      '    dump <path>       以十六进制显示 .dbyte',
      '    asm <in> [-o <out>]  汇编 .dasm → .dbyte',
      '    dis <in> [-o <out>]  反汇编 .dbyte → .dasm',
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
    if (!input) return this.io.print('cc: 用法 cc <in.drap> [-o <out.dbyte>]');
    const inAbs = this.vfs.normalize(this.cwd, input);
    const outAbs = output
      ? this.vfs.normalize(this.cwd, output)
      : inAbs.replace(/\.drap$/, '.dbyte');
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
      let lastLen = 0;
      let pending = '';
      vm.onOutput = partial => {
        const fresh = partial.slice(lastLen);
        lastLen = partial.length;
        if (!fresh) return;
        pending += fresh;
        const parts = pending.split('\n');
        pending = parts.pop();
        for (const l of parts) this.io.print(l);
      };
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
      if (pending) this.io.print(pending);
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
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; continue; }
      if (!inQuote && /\s/.test(c)) {
        if (cur) { out.push(cur); cur = ''; }
        continue;
      }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }
}