/**
 * @file        src/drapopt.js
 * @module      drapog/opt
 * @summary     DrapLang 字节码优化器（工程化-M5）
 * @description 纯 IR 变换（不改 VM、不改变程序可观察行为）：
 *   1) 常量折叠：全局常量传播，对操作数均为编译期常量的纯算术/比较指令就地折叠为 LI。
 *   2) 死代码消除：移除「在首次被读取前即被覆盖」的 LI（安全前向扫描，遇 CALL/SYSCALL/RET/HLT 保守保留）。
 * 设计原则：宁可少优化，绝不改变语义。所有变换后都经测试验证「运行输出与未优化版一致」。
 */
import { OPCODE } from './drapog.dbyte.js';

// 可折叠的纯二元运算（常量求值）。DIV/MOD 在除数为 0 时返回 null → 不折叠（保留运行期语义/错误）。
// 与 VM 执行语义一致：ADD/SUB 普通算术，MUL 用 Math.imul（溢出语义），比较返回 0/1。
function fold(op, a, b) {
  switch (op) {
    case 'ADD': return a + b;
    case 'SUB': return a - b;
    case 'MUL': return Math.imul(a, b);
    case 'DIV': return b === 0 ? null : Math.trunc(a / b);
    case 'MOD': return b === 0 ? null : a - Math.trunc(a / b) * b;
    case 'LT':  return a < b ? 1 : 0;
    case 'LE':  return a <= b ? 1 : 0;
    case 'GT':  return a > b ? 1 : 0;
    case 'GE':  return a >= b ? 1 : 0;
    case 'EQ':  return a === b ? 1 : 0;
    case 'NE':  return a !== b ? 1 : 0;
    default: return null;
  }
}

// 指令读/写集合（保守：可能读即视为读，避免误删活代码）
function readsReg(op, args) {
  // CALL/SYSCALL/RET/HLT/PRINT* 保守视为读写全部 r0..r7
  if (['CALL', 'SYSCALL', 'RET', 'HLT', 'PRINT', 'PRINTINT', 'PRINTSTR', 'PRINTLN', 'ARRPUSH', 'TERM_PRINT'].includes(op)) {
    return new Set(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
  }
  const s = new Set();
  const add = (x) => { if (typeof x === 'string' && /^r\d+$/.test(x)) s.add(x); };
  switch (op) {
    case 'MOV': add(args[1]); break;
    case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD':
    case 'LT': case 'LE': case 'GT': case 'GE': case 'EQ': case 'NE':
      add(args[1]); add(args[2]); break;
    case 'JZ': case 'JNZ': add(args[0]); break;
    case 'PUSH': add(args[0]); break;
    case 'STOREL': add(args[1]); break; // 写入内存的值寄存器
    case 'STR': case 'STRCAT': case 'STREQ': case 'ARRGET': case 'NEWARR':
    case 'NEWOBJ': case 'FLDGET': case 'FLDSET': case 'STRGET': case 'STRSUB': case 'STRSPLIT':
    case 'LEN':
      for (const a of args) add(a); break;
    default: break; // LI/LOADL/POP/ENTER/LEAVE/ALLOC/JMP/LABEL/ADDSP 等不读通用寄存器或被上面覆盖
  }
  return s;
}

function writesReg(op, args) {
  const s = new Set();
  const add = (x) => { if (typeof x === 'string' && /^r\d+$/.test(x)) s.add(x); };
  switch (op) {
    case 'LI': case 'POP': case 'MOV': add(args[0]); break;
    case 'LOADL': add(args[1]); break; // LOADL offset, rX → 写 rX(args[1])
    case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD':
    case 'LT': case 'LE': case 'GT': case 'GE': case 'EQ': case 'NE': add(args[0]); break;
    case 'ARRGET': case 'NEWARR': case 'NEWOBJ': case 'FLDGET': case 'STRGET': case 'STRSUB':
    case 'STRSPLIT': case 'LEN': case 'STRCAT': case 'STREQ': add(args[0]); break;
    default: break;
  }
  return s;
}

// 第一遍：常量折叠（栈感知的全局常量传播）
// 编译器用栈式求值（LI r0,c; PUSH r0; ...; POP r0; ALU），故除寄存器外还要跟踪「常量栈」。
// 安全约束：遇到 CALL/SYSCALL 时寄存器与常量栈全部清空（保守），因为它们可能经 ABI 改写栈/寄存器。
export function foldConstants(program) {
  const out = [];
  const known = {};        // rX → 常量值 | undefined(未知)
  const constStack = [];    // 与运行时操作数栈平行的常量栈；元素为常量值或 null(未知)
  const isReg = (x) => typeof x === 'string' && /^r\d+$/.test(x);

  const resetAll = () => { for (let i = 0; i < 8; i++) known['r' + i] = undefined; constStack.length = 0; };

  const pushVal = (v) => { constStack.push(v === undefined ? null : v); };
  const popVal = () => (constStack.length ? constStack.pop() : null);

  for (const ins of program.instructions) {
    if (ins.op === 'LABEL') { out.push(ins); continue; }

    if (ins.op === 'LI') {
      const reg = ins.args[0];
      known[reg] = parseInt(ins.args[1], 10);
      out.push(ins);
      continue;
    }
    if (ins.op === 'MOV') {
      const dst = ins.args[0], src = ins.args[1];
      known[dst] = isReg(src) && known[src] !== undefined ? known[src] : undefined;
      out.push(ins);
      continue;
    }
    if (ins.op === 'PUSH') {
      const src = ins.args[0];
      pushVal(isReg(src) ? known[src] : undefined);
      out.push(ins);
      continue;
    }
    if (ins.op === 'POP') {
      const dst = ins.args[0];
      const v = popVal();
      known[dst] = v === null ? undefined : v;
      out.push(ins);
      continue;
    }
    if (['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'LT', 'LE', 'GT', 'GE', 'EQ', 'NE'].includes(ins.op)) {
      const dst = ins.args[0], a = ins.args[1], b = ins.args[2];
      const av = isReg(a) ? known[a] : undefined;
      const bv = isReg(b) ? known[b] : undefined;
      if (av !== undefined && bv !== undefined) {
        const r = fold(ins.op, av, bv);
        if (r !== null && Number.isFinite(r)) {
          out.push({ op: 'LI', args: [dst, String(r)], line: ins.line, col: ins.col });
          known[dst] = r;
          continue;
        }
      }
      if (isReg(dst)) known[dst] = undefined;
      out.push(ins);
      continue;
    }
    if (ins.op === 'CALL' || ins.op === 'SYSCALL') {
      resetAll(); // 保守：调用可能经 ABI 改写栈与寄存器
      out.push(ins);
      continue;
    }
    // 其它指令：写寄存器者使其未知；无副作用读取不影响 known / constStack
    for (const w of writesReg(ins.op, ins.args)) known[w] = undefined;
    out.push(ins);
  }

  return { ...program, instructions: out };
}

// 第二遍：死代码消除（移除「在首次被读取前即被覆盖」的 LI）。安全前向扫描。
export function eliminateDeadLoads(program) {
  const ins = program.instructions;
  const keep = new Array(ins.length).fill(true);

  for (let i = 0; i < ins.length; i++) {
    if (ins[i].op !== 'LI' || !keep[i]) continue;
    const reg = ins[i].args[0];
    let live = false;
    for (let j = i + 1; j < ins.length; j++) {
      if (ins[j].op === 'LABEL') continue;
      const reads = readsReg(ins[j].op, ins[j].args);
      if (reads.has(reg)) { live = true; break; }
      const writes = writesReg(ins[j].op, ins[j].args);
      if (writes.has(reg)) { live = false; break; } // 在被读前即被覆盖 → 死
      // 若该指令既不读也不写 reg，继续向后看
    }
    if (!live) keep[i] = false;
  }

  const out = ins.filter((_, i) => keep[i]);
  return { ...program, instructions: out };
}

// 组合优化：折叠 → 消除 → 再消除（消除后可能产生新的连续可折叠/死 LI）
export function optimize(program) {
  let p = foldConstants(program);
  p = eliminateDeadLoads(p);
  p = eliminateDeadLoads(p); // 二次扫描捕捉折叠后暴露的死 LI
  return p;
}

// 统计：供测试/CLI 报告
export function stats(program) {
  const byOp = {};
  for (const ins of program.instructions) byOp[ins.op] = (byOp[ins.op] || 0) + 1;
  return { count: program.instructions.length, byOp };
}
