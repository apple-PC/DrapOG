/**
 * @file        drapog.vm.js
 * @module      drapog/vm
 * @summary     DrapVM 虚拟机（支持系统调用）
 * @version     0.4.0
 */

import { unpack } from './drapog.dbyte.js';

export class VM {
  constructor(program, onOutput) {
    this.instructions = [];
    this.strings = [];
    this.labels = {};
    this.entryPC = undefined;
    this.onOutput = onOutput || (() => {});
    this.sys = null;   // DrapSYS 实例（由外部挂载）
    this.maxSteps = 100000000;

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

  async run() {
    if (this.entryPC !== undefined) this.pc = this.entryPC;
    else if (this.labels['main'] !== undefined) this.pc = this.labels['main'];
    else throw new Error('VM: 未找到 main');

    // 给 main 压一个虚拟返回地址（-1）
    this.regs[5]--;
    if (this.regs[5] < 0) throw new Error('VM: 栈溢出（进入 main）');
    this.write(this.regs[5], -1);

    while (!this.halted && this.pc < this.instructions.length) {
      if (++this.steps > this.maxSteps) throw new Error('VM: 步数超限');
      const ins = this.instructions[this.pc];
      if (ins.op === 'LABEL') { this.pc++; continue; }

      if (ins.op === 'SYSCALL') {
        await this._doSyscall(ins);
        continue;
      }

      this.execute(ins);
    }
  }

  async _doSyscall(ins) {
    if (!this.sys) throw new Error('VM: 未挂载系统调用层（DrapSYS）');
    const num = parseInt(ins.args[0], 10);
    const args = [this.regs[1], this.regs[2], this.regs[3]];
    const r = await this.sys.dispatch(num, args);
    this.regs[0] = typeof r === 'number' ? r : 0;
    this.pc++;
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
        this.pc = this._label(args[0]);
        return;
      }
      case 'RET': {
        const ret = this.read(this.regs[5]);
        this.regs[5]++;
        if (ret === -1) { this.halted = true; return; }
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
      case 'STREQ': {
        const s1 = this._getStr(this.getR(args[0]));
        const s2 = this._getStr(this.getR(args[1]));
        this.setR(args[0], s1 === s2 ? 1 : 0);
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

      default: throw new Error('VM: 未知指令 ' + op);
    }
  }
}