/**
 * @file        drapog.sys.js
 * @module      drapog/sys
 * @summary     DrapSYS 系统调用分发器
 * @version     0.1.0
 */

export class DrapSYS {
  /**
   * @param {Object} opts
   * @param {import('./drapog.vm.js').VM} opts.vm  虚拟机实例
   * @param {Object} opts.vfs                      虚拟文件系统
   * @param {Function} opts.out                    输出回调
   */
  constructor({ vm, vfs, out }) {
    this.vm = vm;
    this.vfs = vfs;
    this.out = out || (() => {});

    this.table = {
      0x10: this.fs_read.bind(this),
      0x11: this.fs_write.bind(this),
      0x12: this.fs_exists.bind(this),
      0x13: this.fs_ls.bind(this),
      0x14: this.fs_mkdir.bind(this),
      0x15: this.fs_rm.bind(this),
      0x30: this.term_print.bind(this),
      0x50: this.time_now.bind(this),
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

  /* ---------- 终端 ---------- */
  term_print(ptr) {
    const s = this.vm.readStr(ptr);
    this.out(s);
    return 0;
  }

  /* ---------- 时间 ---------- */
  time_now() {
    return Math.floor(Date.now() / 1000);   // 秒级时间戳
  }
}