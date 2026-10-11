/**
 * @file        drapog.dbyte.js
 * @module      drapog/dbyte
 * @summary     DBYTE 可执行文件格式
 * @version     0.4.0
 */

export const MAGIC = 0x50415244;
export const VERSION = 0x0102;
export const HEADER_SIZE = 24;
export const INSTR_SIZE = 8;

export const OPCODE = {
  LABEL: 0,
  LI: 1, MOV: 2,
  ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOD: 7,
  LT: 8, LE: 9, GT: 10, GE: 11, EQ: 12, NE: 13,
  JMP: 14, JZ: 15, JNZ: 16,
  PUSH: 17, POP: 18,
  CALL: 19, RET: 20,
  ENTER: 21, LEAVE: 22, ALLOC: 23,
  LOADL: 24, STOREL: 25,
  STR: 26, STRCAT: 27, STRLEN: 28, STREQ: 29, PRINTSTR: 30,
  PRINT: 31, PRINTINT: 32, PRINTLN: 33,
  NEWARR: 34, ARRGET: 35, ARRSET: 36, ARRLEN: 37, ARRPUSH: 38,
  NEWOBJ: 39, FLDGET: 40, FLDSET: 41,
  HLT: 42,
  ADDSP: 43,
  SYSCALL: 44,
  STRGET: 45,
  STRSUB: 46,
  STRSPLIT: 47,
};

export const OPNAME = {};
for (const [k, v] of Object.entries(OPCODE)) OPNAME[v] = k;

export const ARG_SPEC = {
  LABEL: [],
  LI:    ['r', 'i'],
  MOV:   ['r', 'r'],
  ADD:   ['r', 'r', 'r'],
  SUB:   ['r', 'r', 'r'],
  MUL:   ['r', 'r', 'r'],
  DIV:   ['r', 'r', 'r'],
  MOD:   ['r', 'r', 'r'],
  LT:    ['r', 'r', 'r'],
  LE:    ['r', 'r', 'r'],
  GT:    ['r', 'r', 'r'],
  GE:    ['r', 'r', 'r'],
  EQ:    ['r', 'r', 'r'],
  NE:    ['r', 'r', 'r'],
  JMP:   ['l'],
  JZ:    ['l'],
  JNZ:   ['l'],
  PUSH:  ['r'],
  POP:   ['r'],
  CALL:  ['l'],
  RET:   [],
  ENTER: [],
  LEAVE: [],
  ALLOC: ['i'],
  LOADL: ['i', 'r'],
  STOREL:['i', 'r'],
  STR:   ['s', 'r'],
  STRCAT:['r', 'r'],
  STRLEN:['r'],
  STREQ: ['r', 'r'],
  PRINTSTR: ['r'],
  PRINT: ['s'],
  PRINTINT: ['r'],
  PRINTLN: [],
  NEWARR:['i', 'r'],
  ARRGET:['r', 'r', 'r'],
  ARRSET:['r', 'i', 'r'],
  ARRLEN:['r'],
  ARRPUSH:['r', 'r'],
  NEWOBJ:['i', 'r'],
  FLDGET:['r', 'i', 'r'],
  FLDSET:['r', 'i', 'r'],
  HLT:   [],
  ADDSP: ['i'],
  SYSCALL: ['i'],
  STRGET: ['r', 'r', 'r'],
  STRSUB: ['r', 'r', 'r'],
  STRSPLIT: ['r', 'r', 'r'],
};

export function pack(program) {
  const { instructions, strings } = program;

  const labelToIndex = new Map();
  const flat = [];
  for (const ins of instructions) {
    if (ins.op === 'LABEL') labelToIndex.set(ins.args[0], flat.length);
    else flat.push(ins);
  }
  const entry = labelToIndex.get('main') ?? 0;

  const instrBytes = new Uint8Array(flat.length * INSTR_SIZE);
  for (let i = 0; i < flat.length; i++) {
    const ins = flat[i];
    const base = i * INSTR_SIZE;
    const op = OPCODE[ins.op];
    if (op === undefined) throw new Error('未知指令: ' + ins.op);
    instrBytes[base] = op;
    const spec = ARG_SPEC[ins.op];
    for (let a = 0; a < spec.length; a++) {
      const v = encodeArg(spec[a], ins.args[a], labelToIndex);
      instrBytes[base + 1 + a * 2]     = v & 0xFF;
      instrBytes[base + 1 + a * 2 + 1] = (v >> 8) & 0xFF;
    }
  }

  const strChunks = [];
  for (const s of strings) {
    const utf8 = new TextEncoder().encode(s);
    if (utf8.length > 65535) throw new Error('字符串过长');
    strChunks.push([utf8.length & 0xFF, (utf8.length >> 8) & 0xFF, ...utf8]);
  }
  const strArr = new Uint8Array([].concat(...strChunks));

  const total = HEADER_SIZE + instrBytes.length + strArr.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);

  dv.setUint32(0, MAGIC, true);
  dv.setUint16(4, VERSION, true);
  dv.setUint16(6, 0, true);
  dv.setUint32(8, entry, true);
  dv.setUint32(12, flat.length, true);
  dv.setUint32(16, strings.length, true);
  dv.setUint32(20, 0, true);

  out.set(instrBytes, HEADER_SIZE);
  out.set(strArr, HEADER_SIZE + instrBytes.length);

  const h1 = fnv1a(out, 0, 20);
  const h2 = fnv1a(out, 24, total - 24, h1);
  dv.setUint32(20, h2, true);

  return out;
}

export function unpack(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('不是 .dbyte 文件');
  const version = dv.getUint16(4, true);
  if ((version >> 8) !== (VERSION >> 8)) {
    throw new Error('版本不兼容: ' + (version >> 8) + '.' + (version & 0xFF));
  }

  const entry = dv.getUint32(8, true);
  const instrCount = dv.getUint32(12, true);
  const stringCount = dv.getUint32(16, true);
  const checksum = dv.getUint32(20, true);

  const h1 = fnv1a(bytes, 0, 20);
  const h2 = fnv1a(bytes, 24, bytes.length - 24, h1);
  if (h2 !== checksum) throw new Error('校验和不匹配');

  const instructions = [];
  for (let i = 0; i < instrCount; i++) {
    const off = HEADER_SIZE + i * INSTR_SIZE;
    const op = bytes[off];
    const name = OPNAME[op];
    if (!name) throw new Error('未知操作码: ' + op);
    const spec = ARG_SPEC[name];
    const args = [];
    for (let a = 0; a < spec.length; a++) {
      const v = bytes[off + 1 + a * 2] | (bytes[off + 1 + a * 2 + 1] << 8);
      args.push(decodeArg(spec[a], v));
    }
    instructions.push({ op: name, args });
  }

  let p = HEADER_SIZE + instrCount * INSTR_SIZE;
  const dec = new TextDecoder();
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    const len = bytes[p] | (bytes[p + 1] << 8);
    p += 2;
    strings.push(dec.decode(bytes.subarray(p, p + len)));
    p += len;
  }

  return { instructions, strings, entry, version };
}

function encodeArg(spec, arg, labelToIndex) {
  if (spec === 'r') {
    const n = parseInt(String(arg).slice(1), 10);
    if (n < 0 || n > 15) throw new Error('寄存器越界: ' + arg);
    return n;
  }
  if (spec === 'i') {
    const n = typeof arg === 'number' ? arg : parseInt(arg, 10);
    if (!Number.isFinite(n)) throw new Error('非法立即数: ' + arg);
    if (n < -32768 || n > 65535) throw new Error('立即数超出 16 位: ' + n);
    return n & 0xFFFF;
  }
  if (spec === 'l') {
    const idx = labelToIndex.get(arg);
    if (idx === undefined) throw new Error('未知标签: ' + arg);
    return idx;
  }
  if (spec === 's') {
    const n = parseInt(arg, 10);
    if (!Number.isFinite(n)) throw new Error('非法字符串索引: ' + arg);
    return n;
  }
  return 0;
}

function decodeArg(spec, v) {
  if (spec === 'r') return 'r' + v;
  if (spec === 'i') return v >= 32768 ? v - 65536 : v;
  if (spec === 'l') return '@' + v;
  if (spec === 's') return String(v);
  return v;
}

function fnv1a(bytes, start, len, seed) {
  let h = (seed === undefined ? 0x811c9dc5 : seed) >>> 0;
  const end = start + len;
  for (let i = start; i < end; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hexdump(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const row = [];
    const ascii = [];
    for (let j = 0; j < 16; j++) {
      if (i + j < bytes.length) {
        const b = bytes[i + j];
        row.push(b.toString(16).padStart(2, '0'));
        ascii.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
      } else {
        row.push('  ');
        ascii.push(' ');
      }
    }
    const addr = i.toString(16).padStart(6, '0');
    lines.push(addr + '  ' + row.slice(0, 8).join(' ') + '  ' + row.slice(8).join(' ') + '  |' + ascii.join('') + '|');
  }
  return lines.join('\n');
}