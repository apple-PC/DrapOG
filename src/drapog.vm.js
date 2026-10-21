/**
 * @file        drapog.vm.js
 * @module      drapog/vm
 * @summary     DrapVM 虚拟机（支持系统调用）
 * @version     0.8.0
 */

import { unpack } from './drapog.dbyte.js';

/* ==================== 标准库内建函数表（BUILTIN id → 实现） ==================== */
/* 传参 ABI 与 SYSCALL 一致：r1..r3 + r6 + r7（args[0..4]）。
   返回数值直接进 r0；返回字符串则 pushStr 后返回堆指针。 */
const BUILTIN_TABLE = {
  // —— core（自动导入，始终可用）——
  10: (a, vm) => { const n = parseInt(vm._getStr(a[0]), 10); return isNaN(n) ? 0 : n; }, // atoi
  11: (a, vm) => vm.pushStr(String(Math.trunc(a[0]))),                                 // itoa
  // —— math（需 import math）——
  100: (a) => Math.abs(a[0]),
  101: (a) => Math.min(a[0], a[1]),
  102: (a) => Math.max(a[0], a[1]),
  103: (a) => Math.sqrt(a[0]),
  104: (a) => Math.pow(a[0], a[1]),
  105: (a) => Math.floor(a[0]),
  106: (a) => Math.ceil(a[0]),
  107: (a) => Math.round(a[0]),
  108: () => Math.floor(Math.random() * 32768),
  109: (a) => { const [x, lo, hi] = a; return x < lo ? lo : (x > hi ? hi : x); }, // clamp
  110: (a) => Math.sin(a[0]),
  111: (a) => Math.cos(a[0]),
  112: (a) => Math.log(a[0]),
  113: (a) => Math.exp(a[0]),
  // —— str（需 import str）——
  200: (a, vm) => vm.pushStr(vm._getStr(a[0]).toUpperCase()),
  201: (a, vm) => vm.pushStr(vm._getStr(a[0]).toLowerCase()),
  202: (a, vm) => vm.pushStr(vm._getStr(a[0]).trim()),
  203: (a, vm) => (vm._getStr(a[0]).includes(vm._getStr(a[1])) ? 1 : 0),            // contains
  204: (a, vm) => vm._getStr(a[0]).indexOf(vm._getStr(a[1])),                        // indexOf（未命中 -1）
  205: (a, vm) => (vm._getStr(a[0]).startsWith(vm._getStr(a[1])) ? 1 : 0),
  206: (a, vm) => (vm._getStr(a[0]).endsWith(vm._getStr(a[1])) ? 1 : 0),
  207: (a, vm) => vm.pushStr(vm._getStr(a[0]).repeat(Math.max(0, a[1]))),            // repeat
  208: (a, vm) => vm.pushStr(vm._getStr(a[0]).split(vm._getStr(a[1])).join(vm._getStr(a[2]))), // replace（全部匹配）
  209: (a, vm) => {                                                              // join(arr, sep)
    const arr = vm.heap[a[0]];
    const sep = vm._getStr(a[1]);
    if (!arr || arr.__type !== 'arr') return vm.pushStr('');
    const parts = arr.items.map((it) => {
      const o = vm.heap[it];
      return (o && o.__type === 'str') ? o.value : String(it);
    });
    return vm.pushStr(parts.join(sep));
  },
  210: (a, vm) => {                                                              // charAt(s, i)
    const s = vm._getStr(a[0]);
    const i = a[1];
    return vm.pushStr((i >= 0 && i < s.length) ? s[i] : '');
  },
};

export class VM {
  constructor(program, onOutput) {
    this.instructions = [];
    this.strings = [];
    this.labels = {};
    this.entryPC = undefined;
    this.onOutput = onOutput || (() => {});
    this.sys = null;   // DrapSYS 实例（由外部挂载）
    this.maxSteps = 1000000;  // P0-4：1e6 步内掐死无 syscall 的死循环；长驻交互程序（如 Shell）在 _doSyscall 处重置预算，永不撞线

    // 调试支持（M2）：断点（按指令下标 pc）+ 暂停态 + 停止原因
    this.breakpoints = new Set();
    this.paused = false;
    this._skipBpPc = null;    // 恢复时跳过当前 pc 断点一次
    this._stopReason = null;  // 'breakpoint' | 'step' | null
    this._stopPc = null;

    if (program) this.load(program);
  }

  load(program) {
    this.instructions = program.instructions || [];
    this.strings = program.strings || [];
    this.entryPC = program.entry;
    this._rebuildLabels();
    this._reset();
  }

  loadFromBytes(bytes) {
    const { instructions, strings, entry } = unpack(bytes);
    this.instructions = instructions;
    this.strings = strings;
    this.entryPC = entry;
    this._rebuildLabels();
    this._reset();
  }

  _rebuildLabels() {
    this.labels = {};
    for (let i = 0; i < this.instructions.length; i++) {
      const ins = this.instructions[i];
      if (ins.op === 'LABEL') this.labels[ins.args[0]] = i;
    }
  }

  _reset() {
    this.regs = new Array(8).fill(0);
    this.regs[5] = 0x10000;
    this.regs[4] = 0;
    this.stack = new Array(0x10000).fill(0);
    // 堆 0 号预留空字符串哨兵
    this.heap = [{ __type: 'str', value: '' }];
    this.pc = 0;
    this.halted = false;
    this.out = '';
    this.steps = 0;
    this.curLine = 0;        // 当前执行指令对应的源码行（运行期错误诊断）
    this.callStack = [];     // 调用栈（运行期错误诊断）：[{fn, line}]
    // 调试态复位（每次 load 都清空断点，避免换程序后残留旧 pc 断点）
    this.breakpoints = new Set();
    this.paused = false;
    this._skipBpPc = null;
    this._stopReason = null;
    this._stopPc = null;
  }

  /* ---------- 堆对象访问（供 DrapSYS 使用） ---------- */
  readStr(ptr) {
    const obj = this.heap[ptr];
    if (!obj || obj.__type !== 'str') return '';
    return obj.value;
  }

  pushStr(s) {
    const ptr = this.heap.length;
    this.heap.push({ __type: 'str', value: String(s) });
    return ptr;
  }

  _label(name) {
    if (typeof name === 'string' && name.startsWith('@')) {
      return parseInt(name.slice(1), 10);
    }
    const t = this.labels[name];
    if (t === undefined) throw new Error('VM: 未定义标签 ' + name);
    return t;
  }

  read(addr) {
    if (addr < 0 || addr >= 0x10000) throw new Error('栈地址越界: ' + addr);
    return this.stack[addr];
  }

  write(addr, v) {
    if (addr < 0 || addr >= 0x10000) throw new Error('栈地址越界: ' + addr);
    this.stack[addr] = v;
  }

  R(name) { return parseInt(name.slice(1), 10); }
  getR(name) { return this.regs[this.R(name)]; }
  setR(name, v) { this.regs[this.R(name)] = v; }

  opnd(x) {
    if (typeof x === 'string' && /^r\d+$/.test(x)) return this.regs[this.R(x)];
    return parseInt(x, 10);
  }

  _getStr(p) {
    const obj = this.heap[p];
    if (!obj || obj.__type !== 'str') return '';
    return obj.value;
  }

  // 入口初始化（同步，不执行指令）：定位 main、压虚拟返回地址、建栈底帧。
  // 必须是同步的——GUI 宿主以「不 await 的 vm.run()」启动，依赖入口初始化在首个 await 前同步完成
  // （首个 win_create 在事件循环首个 win_get_event 之前），从而先把窗口建好。
  start() {
    if (this.entryPC !== undefined) this.pc = this.entryPC;
    else if (this.labels['main'] !== undefined) this.pc = this.labels['main'];
    else throw new Error('VM: 未找到 main');

    // 给 main 压一个虚拟返回地址（-1）
    this.regs[5]--;
    if (this.regs[5] < 0) throw new Error('VM: 栈溢出（进入 main）');
    this.write(this.regs[5], -1);

    // 运行期错误诊断：栈底帧 + 行号跟踪
    this.callStack = [{ fn: 'main', line: 0 }];
    this.curLine = 0;
  }

  async run() {
    this.start();
    await this._continue();
  }

  // 执行循环（带断点/暂停检查）。run() 与 resume() 共用；无断点时行为与旧 run() 完全一致。
  async _continue() {
    this.paused = false;
    while (!this.halted && this.pc < this.instructions.length) {
      if (this.paused) return;   // 被外部暂停（如 step）
      if (++this.steps > this.maxSteps) throw this._augment(new Error('VM: 步数超限'));
      const ins = this.instructions[this.pc];
      if (ins.line) this.curLine = ins.line;   // 跟踪当前源码行
      if (ins.op === 'LABEL') { this.pc++; continue; }

      // 断点：到达断点 pc 时暂停（恢复时跳过当前 pc 一次，避免立即重触发）
      if (this.breakpoints.has(this.pc)) {
        if (this._skipBpPc === this.pc) this._skipBpPc = null;
        else { this.paused = true; this._stopReason = 'breakpoint'; this._stopPc = this.pc; return; }
      }

      if (ins.op === 'SYSCALL') {
        try { await this._doSyscall(ins); }
        catch (e) { throw this._augment(e); }
        continue;
      }

      try { this.execute(ins); }
      catch (e) { throw this._augment(e); }
    }
  }

  // 从当前暂停点继续运行，直到下一断点或停机（跳过当前 pc 断点一次）
  async resume() {
    this._skipBpPc = this.pc;
    await this._continue();
  }

  // 单步：执行一条「真实」指令（跳过 LABEL），随后暂停。step-into 语义（CALL 进入被调函数）。
  async step() {
    if (this.halted) return;
    this.paused = false;
    while (this.pc < this.instructions.length) {
      const ins = this.instructions[this.pc];
      if (ins.line) this.curLine = ins.line;
      if (ins.op === 'LABEL') { this.pc++; continue; }
      if (this.halted) return;
      if (ins.op === 'SYSCALL') { await this._doSyscall(ins); break; }
      try { this.execute(ins); }
      catch (e) { throw this._augment(e); }
      break;
    }
    this.paused = true;
    this._stopReason = 'step';
  }

  setBreakpoint(pc) { this.breakpoints.add(pc); }
  clearBreakpoint(pc) { this.breakpoints.delete(pc); }
  clearBreakpoints() { this.breakpoints.clear(); }

  // 调试快照（返回值拷贝，供调试器 inspect，不暴露内部可变引用）
  snapshot() {
    return {
      pc: this.pc,
      regs: this.regs.slice(),
      curLine: this.curLine,
      halted: this.halted,
      paused: this.paused,
      stopReason: this._stopReason,
      stopPc: this._stopPc,
      callStack: this.callStack.map(f => ({ ...f })),
      breakpoints: [...this.breakpoints],
    };
  }

  // 把运行期错误包装为带「源码行 + 简调用栈」的诊断信息
  _augment(err) {
    if (err && err.__diag) return err;   // 已是诊断错误，避免重复包装
    const msg = (err && err.message) ? err.message : String(err);
    const line = this.curLine ? (' 行 ' + this.curLine) : '';
    let stack = '';
    if (this.callStack && this.callStack.length) {
      const frames = this.callStack.map((f, i) => '    #' + i + ' ' + f.fn + (f.line ? ' (行 ' + f.line + ')' : ''));
      stack = '\n调用栈:\n' + frames.join('\n');
    }
    const wrapped = new Error(msg + line + stack);
    wrapped.__diag = true;
    return wrapped;
  }

  async _doSyscall(ins) {
    if (!this.sys) throw new Error('VM: 未挂载系统调用层（DrapSYS）');
    const num = parseInt(ins.args[0], 10);
    // SYSCALL 传参约定：r1..r3 + r6 + r7（第 5 参数走 r7；r4=FP / r5=SP 全程避开）
    const args = [this.regs[1], this.regs[2], this.regs[3], this.regs[6], this.regs[7]];
    const r = await this.sys.dispatch(num, args);
    this.regs[0] = typeof r === 'number' ? r : 0;
    this.steps = 0;   // P0-4：每次系统调用（yield 点）重置步数预算，长驻交互程序（B7 Shell）永不撞线
    this.pc++;
  }

  _doBuiltin(id) {
    const fn = BUILTIN_TABLE[id];
    if (!fn) throw new Error('VM: 未知内建函数 id ' + id);
    const args = [this.regs[1], this.regs[2], this.regs[3], this.regs[6], this.regs[7]];
    const r = fn(args, this);
    this.regs[0] = (r === undefined || r === null) ? 0 : r;
  }

  execute(ins) {
    const { op, args } = ins;
    switch (op) {
      case 'LABEL': this.pc++; return;
      case 'LI':   this.setR(args[0], parseInt(args[1], 10)); this.pc++; return;
      case 'MOV':  this.setR(args[0], this.getR(args[1])); this.pc++; return;

      case 'ADD':  this.setR(args[0], this.opnd(args[1]) + this.opnd(args[2])); this.pc++; return;
      case 'SUB':  this.setR(args[0], this.opnd(args[1]) - this.opnd(args[2])); this.pc++; return;
      case 'MUL':  this.setR(args[0], Math.imul(this.opnd(args[1]), this.opnd(args[2]))); this.pc++; return;
      case 'DIV': {
        const b = this.opnd(args[2]);
        if (b === 0) throw new Error('VM: 除以零');
        this.setR(args[0], Math.trunc(this.opnd(args[1]) / b)); this.pc++; return;
      }
      case 'MOD': {
        const b = this.opnd(args[2]);
        if (b === 0) throw new Error('VM: 模零');
        this.setR(args[0], this.opnd(args[1]) % b); this.pc++; return;
      }

      case 'LT': this.setR(args[0], this.opnd(args[1]) <  this.opnd(args[2]) ? 1 : 0); this.pc++; return;
      case 'LE': this.setR(args[0], this.opnd(args[1]) <= this.opnd(args[2]) ? 1 : 0); this.pc++; return;
      case 'GT': this.setR(args[0], this.opnd(args[1]) >  this.opnd(args[2]) ? 1 : 0); this.pc++; return;
      case 'GE': this.setR(args[0], this.opnd(args[1]) >= this.opnd(args[2]) ? 1 : 0); this.pc++; return;
      case 'EQ': this.setR(args[0], this.opnd(args[1]) === this.opnd(args[2]) ? 1 : 0); this.pc++; return;
      case 'NE': this.setR(args[0], this.opnd(args[1]) !== this.opnd(args[2]) ? 1 : 0); this.pc++; return;

      case 'JMP': this.pc = this._label(args[0]); return;
      case 'JZ':  this.pc = this.regs[0] === 0 ? this._label(args[0]) : this.pc + 1; return;
      case 'JNZ': this.pc = this.regs[0] !== 0 ? this._label(args[0]) : this.pc + 1; return;

      case 'PUSH': {
        this.regs[5]--;
        if (this.regs[5] < 0) throw new Error('VM: 栈溢出（PUSH）');
        this.write(this.regs[5], this.getR(args[0]));
        this.pc++; return;
      }
      case 'POP': {
        this.setR(args[0], this.read(this.regs[5]));
        this.regs[5]++;
        this.pc++; return;
      }

      case 'CALL': {
        this.regs[5]--;
        if (this.regs[5] < 0) throw new Error('VM: 栈溢出（CALL）');
        this.write(this.regs[5], this.pc + 1);
        this.callStack.push({ fn: args[0], line: this.curLine });   // 运行期诊断：入栈
        this.pc = this._label(args[0]);
        return;
      }
      case 'RET': {
        const ret = this.read(this.regs[5]);
        this.regs[5]++;
        if (ret === -1) { this.halted = true; return; }
        if (this.callStack.length > 1) this.callStack.pop();         // 运行期诊断：出栈（保留 main 底帧）
        this.pc = ret;
        return;
      }

      case 'ENTER': {
        this.regs[5]--;
        if (this.regs[5] < 0) throw new Error('VM: 栈溢出（ENTER）');
        this.write(this.regs[5], this.regs[4]);
        this.regs[4] = this.regs[5];
        this.pc++; return;
      }
      case 'LEAVE': {
        this.regs[5] = this.regs[4];
        this.regs[4] = this.read(this.regs[5]);
        this.regs[5]++;
        this.pc++; return;
      }
      case 'ALLOC': {
        this.regs[5] -= parseInt(args[0], 10);
        if (this.regs[5] < 0) throw new Error('VM: 栈溢出（ALLOC）');
        this.pc++; return;
      }
      case 'ADDSP': {
        this.regs[5] += parseInt(args[0], 10);
        this.pc++; return;
      }

      case 'LOADL': {
        this.setR(args[1], this.read(this.regs[4] + parseInt(args[0], 10)));
        this.pc++; return;
      }
      case 'STOREL': {
        this.write(this.regs[4] + parseInt(args[0], 10), this.getR(args[1]));
        this.pc++; return;
      }

      case 'STR': {
        const idx = parseInt(args[0], 10);
        const s = this.strings[idx] || '';
        const ptr = this.heap.length;
        this.heap.push({ __type: 'str', value: s });
        this.setR(args[1], ptr);
        this.pc++; return;
      }
      case 'STRCAT': {
        const p1 = this.getR(args[0]);
        const p2 = this.getR(args[1]);
        const s1 = this._getStr(p1);
        const s2 = this._getStr(p2);
        const ptr = this.heap.length;
        this.heap.push({ __type: 'str', value: s1 + s2 });
        this.setR(args[0], ptr);
        this.pc++; return;
      }
      case 'STRLEN': {
        const s = this._getStr(this.getR(args[0]));
        this.setR(args[0], s.length);
        this.pc++; return;
      }
      case 'LEN': {
        // 运行期分发：字符串→长度，数组→元素数（不依赖编译期类型，规避数组元素字符串误判）
        const o = this.heap[this.getR(args[0])];
        let len = 0;
        if (o && o.__type === 'str') len = o.value.length;
        else if (o && o.__type === 'arr') len = o.items.length;
        this.setR(args[0], len);
        this.pc++; return;
      }
      case 'STREQ': {
        const s1 = this._getStr(this.getR(args[0]));
        const s2 = this._getStr(this.getR(args[1]));
        this.setR(args[0], s1 === s2 ? 1 : 0);
        this.pc++; return;
      }
      case 'STRGET': {
        // STRGET dst, src, idx —— dst = src[idx] 的码点（i32）
        const s = this._getStr(this.getR(args[1]));
        const i = this.opnd(args[2]);
        if (i < 0 || i >= s.length) throw new Error('VM: 字符串索引越界 ' + i + '/' + s.length);
        this.setR(args[0], s.charCodeAt(i));
        this.pc++; return;
      }
      case 'STRSUB': {
        // STRSUB src, start, len, dst —— dst = src[start:start+len]（len<0 表示到末尾）
        const s = this._getStr(this.getR(args[0]));
        const start = this.opnd(args[1]);
        const len = this.opnd(args[2]);
        const end = len >= 0 ? start + len : undefined;
        const ptr = this.heap.length;
        this.heap.push({ __type: 'str', value: s.slice(start, end) });
        this.setR(args[3], ptr);
        this.pc++; return;
      }
      case 'STRSPLIT': {
        // STRSPLIT src, delim, dst —— dst = array<stringptr>，按单字符 delim 切分（保留空 token）
        const s = this._getStr(this.getR(args[0]));
        const delim = String.fromCharCode(this.opnd(args[1]));
        const items = [];
        for (const p of s.split(delim)) {
          const ptr = this.heap.length;
          this.heap.push({ __type: 'str', value: p });
          items.push(ptr);
        }
        const arrPtr = this.heap.length;
        this.heap.push({ __type: 'arr', items });
        this.setR(args[2], arrPtr);
        this.pc++; return;
      }
      case 'PRINTSTR': {
        this.out += this._getStr(this.getR(args[0]));
        this.onOutput(this.out);
        this.pc++; return;
      }

      case 'PRINT': {
        this.out += this.strings[parseInt(args[0], 10)] || '';
        this.onOutput(this.out);
        this.pc++; return;
      }
      case 'PRINTINT': {
        this.out += String(this.getR(args[0]));
        this.onOutput(this.out);
        this.pc++; return;
      }
      case 'PRINTLN': {
        this.out += '\n';
        this.onOutput(this.out);
        this.pc++; return;
      }

      case 'NEWARR': {
        const n = this.opnd(args[0]);
        const ptr = this.heap.length;
        this.heap.push({ __type: 'arr', items: new Array(n).fill(0) });
        this.setR(args[1], ptr);
        this.pc++; return;
      }
      case 'ARRGET': {
        const arr = this.heap[this.getR(args[0])];
        if (!arr || arr.__type !== 'arr') throw new Error('VM: 不是数组');
        const i = this.opnd(args[1]);
        if (i < 0 || i >= arr.items.length) throw new Error('VM: 数组越界 ' + i + '/' + arr.items.length);
        this.setR(args[2], arr.items[i]);
        this.pc++; return;
      }
      case 'ARRSET': {
        const arr = this.heap[this.getR(args[0])];
        if (!arr || arr.__type !== 'arr') throw new Error('VM: 不是数组');
        const i = this.opnd(args[1]);
        if (i < 0 || i >= arr.items.length) throw new Error('VM: 数组越界 ' + i + '/' + arr.items.length);
        arr.items[i] = this.getR(args[2]);
        this.pc++; return;
      }
      case 'ARRLEN': {
        const arr = this.heap[this.getR(args[0])];
        if (!arr || arr.__type !== 'arr') throw new Error('VM: 不是数组');
        this.setR(args[0], arr.items.length);
        this.pc++; return;
      }
      case 'ARRPUSH': {
        const arr = this.heap[this.getR(args[0])];
        if (!arr || arr.__type !== 'arr') throw new Error('VM: 不是数组');
        arr.items.push(this.getR(args[1]));
        this.pc++; return;
      }

      case 'NEWOBJ': {
        const n = parseInt(args[0], 10);
        const ptr = this.heap.length;
        this.heap.push({ __type: 'obj', fields: new Array(n).fill(0) });
        this.setR(args[1], ptr);
        this.pc++; return;
      }
      case 'FLDGET': {
        const obj = this.heap[this.getR(args[0])];
        if (!obj || obj.__type !== 'obj') throw new Error('VM: 不是对象');
        this.setR(args[2], obj.fields[parseInt(args[1], 10)]);
        this.pc++; return;
      }
      case 'FLDSET': {
        const obj = this.heap[this.getR(args[0])];
        if (!obj || obj.__type !== 'obj') throw new Error('VM: 不是对象');
        obj.fields[parseInt(args[1], 10)] = this.getR(args[2]);
        this.pc++; return;
      }

      case 'HLT': this.halted = true; return;

      case 'BUILTIN': { this._doBuiltin(parseInt(args[0], 10)); this.pc++; return; }

      default: throw new Error('VM: 未知指令 ' + op);
    }
  }
}