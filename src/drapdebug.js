/**
 * @file        drapdebug.js
 * @module      drapog/drapdebug
 * @summary     DrapLang 调试器核心（工程化-M3）
 * @description 基于 M1（编译期 debug 信息：源码/函数符号/局部变量槽位）+ M2（VM 单步/断点）：
 *   行级断点、运行/继续/单步、源码上下文、寄存器/调用栈/局部变量检查。
 *   本文件是「无界面」核心，CLI（tools/drapdebug.mjs）与未来 GUI 调试器共用。
 */
import { DrapCC } from './drapcc.js';
import { VM } from './drapog.vm.js';

export class DrapDebugger {
  constructor(source, opts = {}) {
    this.program = new DrapCC(source, {
      debug: true,
      modules: opts.modules || null,
      resolveModule: opts.resolveModule || null,
    }).compile();

    this.vm = new VM();
    this.vm.load(this.program);

    this.sourceLines = (this.program.debug && this.program.debug.source ? this.program.debug.source : '').split('\n');

    // 源码行 → VM pc 列表（该行所有真实指令的 pc；VM pc 含 LABEL 下标）
    this.lineToPcs = {};
    this.program.instructions.forEach((ins, i) => {
      if (ins.op === 'LABEL') return;
      const ln = ins.line;
      (this.lineToPcs[ln] = this.lineToPcs[ln] || []).push(i);
    });

    // 函数名 → 局部变量 [{name, offset, type}]
    this.fnLocals = {};
    if (this.program.debug && this.program.debug.functions) {
      for (const f of this.program.debug.functions) this.fnLocals[f.name] = f.locals || [];
    }

    this.breakLines = new Set();
    this.status = 'loaded';   // loaded → paused → (running) → halted；供 run/cont/step 状态门控
  }

  // 根据 VM 实际状态同步调试器状态（在每次执行控制后调用）
  _syncStatus() {
    if (this.vm.halted) this.status = 'halted';
    else if (this.vm.paused) this.status = 'paused';
    else this.status = 'running';
  }

  /* ---------------- 断点（按源码行） ---------------- */
  // 行断点只落在该行「首个真实指令 pc」，避免整行每条指令都停（否则 cont 跨过一个 pc 又被同行下一个 pc 拦住）
  setBreakpointLine(line) {
    line = Number(line);
    if (!Number.isFinite(line) || !this.lineToPcs[line]) return false;
    this.breakLines.add(line);
    const firstPc = Math.min(...this.lineToPcs[line]);
    this.vm.setBreakpoint(firstPc);
    return true;
  }
  clearBreakpointLine(line) {
    line = Number(line);
    this.breakLines.delete(line);
    if (this.lineToPcs[line]) for (const pc of this.lineToPcs[line]) this.vm.clearBreakpoint(pc);
  }
  clearBreakpoints() { this.breakLines.clear(); this.vm.clearBreakpoints(); }
  listBreakpoints() { return [...this.breakLines].sort((a, b) => a - b); }

  /* ---------------- 执行控制 ---------------- */
  start() { this.vm.start(); this.status = 'loaded'; }
  // 首次运行：从入口开始跑到下一断点 / 停机
  async run() {
    if (this.status === 'loaded') this.vm.start();
    await this.vm._continue();
    this._syncStatus();
    return this.vm._stopReason;
  }
  // 从断点继续：跳过当前 pc 断点一次，跑到下一断点 / 停机
  async cont() {
    if (this.status !== 'paused') return this.status;
    await this.vm.resume();
    this._syncStatus();
    return this.vm._stopReason;
  }
  // 单步（step-into）：执行一条真实指令后暂停
  async step() {
    if (this.status === 'loaded') this.vm.start();
    await this.vm.step();
    this._syncStatus();
    return this.vm._stopReason;
  }

  /* ---------------- 检查 ---------------- */
  getState() { return this.vm.snapshot(); }

  currentFunction() {
    const cs = this.vm.callStack;
    return cs && cs.length ? cs[cs.length - 1].fn : null;
  }

  registers() { return this.vm.regs.slice(); }

  // 读取当前栈帧（FP）的局部变量名 → 值
  inspectLocals() {
    const fn = this.currentFunction();
    const locals = (fn && this.fnLocals[fn]) || [];
    const fp = this.vm.regs[4];
    const out = {};
    for (const loc of locals) {
      const addr = fp + loc.offset;
      const raw = this.vm.read(addr);
      out[loc.name] = this._valueToString(raw, loc.type);
    }
    return out;
  }

  _valueToString(v, type) {
    const isStr = type && type.kind === 'prim' && type.name === 'str';
    const isPtr = typeof v === 'number' && v > 0;
    if (isStr && isPtr && this.vm.heap[v] && this.vm.heap[v].__type === 'str') return this.vm.heap[v].value;
    if (isPtr && this.vm.heap[v] && this.vm.heap[v].__type === 'str') return this.vm.heap[v].value;
    return v;
  }

  // 源码上下文：以 center 行（默认当前 curLine）为中心，带当前行箭头与断点标记
  listSource(center, ctx = 3) {
    if (center === undefined) center = this.vm.curLine;
    center = Number(center);
    const from = Math.max(1, center - ctx);
    const to = Math.min(this.sourceLines.length, center + ctx);
    const lines = [];
    for (let i = from; i <= to; i++) {
      const marker = (i === center) ? '→' : ' ';
      const bp = this.breakLines.has(i) ? '●' : ' ';
      lines.push(bp + ' ' + marker + ' ' + String(i).padStart(3) + ': ' + (this.sourceLines[i - 1] || ''));
    }
    return lines.join('\n');
  }

  statusLine() {
    const s = this.vm.snapshot();
    let loc = 'fn=' + this.currentFunction();
    return 'pc=' + s.pc + ' line=' + s.curLine +
      (s.paused ? ' (paused:' + s.stopReason + ')' : '') +
      (s.halted ? ' (halted)' : '') + ' ' + loc;
  }

  // 单条 print 表达式：支持 `r0`..`r7` 寄存器与局部变量名
  print(token) {
    if (/^r[0-7]$/.test(token)) {
      const idx = parseInt(token.slice(1), 10);
      return token + ' = ' + this._valueToString(this.vm.regs[idx], { kind: 'prim', name: 'i32' });
    }
    const locals = this.inspectLocals();
    if (token in locals) return token + ' = ' + JSON.stringify(locals[token]);
    return '未定义符号: ' + token;
  }
}
