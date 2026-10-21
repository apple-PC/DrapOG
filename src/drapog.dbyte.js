/**
 * @file        drapog.dbyte.js
 * @module      drapog/dbyte
 * @summary     DBYTE 可执行文件格式
 * @version     0.5.0
 */

export const MAGIC = 0x50415244;
export const VERSION = 0x0102;
export const HEADER_SIZE = 24;
export const INSTR_SIZE = 8;

// 可选调试段魔数（'DBG0'）。接在字符串段之后；旧加载器只读 instrCount+stringCount，
// 天然忽略尾部，因此带调试段的 .dbyte 也能被旧版 loader 安全加载（仅丢弃调试信息）。
export const DEBUG_MAGIC = 0x44424730;

/* ==================== 调试信息段（可选，向后兼容） ====================
 * 段布局（小端）：
 *   [0..3]  DEBUG_MAGIC ('DBG0')
 *   [4..5]  segVersion (u16)
 *   [6..9]  lineMapCount N (u32)
 *   N×2     每个扁平指令的源码行号 u16（数组下标即扁平指令下标）
 *   4       函数数 F (u32)
 *   每函数: nameLen u16 + name(utf8) + start u32 + end u32
 *   4       源码行数 L (u32)
 *   每行:   lineLen u16 + line(utf8)
 */
function buildDebugSegment(flatLine, functions, source) {
  const enc = new TextEncoder();
  const parts = [];

  const header = new Uint8Array(10);
  const hdv = new DataView(header.buffer);
  hdv.setUint32(0, DEBUG_MAGIC, true);
  hdv.setUint16(4, 1, true);                  // segVersion
  hdv.setUint32(6, flatLine.length, true);     // lineMapCount
  parts.push(header);

  const lm = new Uint8Array(flatLine.length * 2);
  const lmdv = new DataView(lm.buffer);
  for (let i = 0; i < flatLine.length; i++) lmdv.setUint16(i * 2, (flatLine[i].line | 0) & 0xFFFF, true);
  parts.push(lm);

  const fnHeader = new Uint8Array(4);
  new DataView(fnHeader.buffer).setUint32(0, functions.length, true);
  parts.push(fnHeader);
  for (const f of functions) {
    const nb = enc.encode(String(f.name));
    const fh = new Uint8Array(2 + nb.length + 8);
    const fhdv = new DataView(fh.buffer);
    fhdv.setUint16(0, nb.length, true);
    fh.set(nb, 2);
    fhdv.setUint32(2 + nb.length, f.start >>> 0, true);
    fhdv.setUint32(2 + nb.length + 4, f.end >>> 0, true);
    parts.push(fh);
  }

  const srcLines = String(source).split('\n');
  const srcHeader = new Uint8Array(4);
  new DataView(srcHeader.buffer).setUint32(0, srcLines.length, true);
  parts.push(srcHeader);
  for (const line of srcLines) {
    const lb = enc.encode(line);
    const lh = new Uint8Array(2 + lb.length);
    const lhdv = new DataView(lh.buffer);
    lhdv.setUint16(0, lb.length, true);
    lh.set(lb, 2);
    parts.push(lh);
  }

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function parseDebugSegment(bytes, offset) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(offset, true) !== DEBUG_MAGIC) return null;
  const segVersion = dv.getUint16(offset + 4, true);
  if (segVersion !== 1) return null;
  const N = dv.getUint32(offset + 6, true);
  let p = offset + 10;
  const lineMap = new Array(N);
  for (let i = 0; i < N; i++) lineMap[i] = { line: dv.getUint16(p + i * 2, true), col: 0 };
  p += N * 2;
  const F = dv.getUint32(p, true); p += 4;
  const dec = new TextDecoder();
  const functions = [];
  for (let i = 0; i < F; i++) {
    const nl = dv.getUint16(p, true); p += 2;
    const name = dec.decode(bytes.subarray(p, p + nl)); p += nl;
    const start = dv.getUint32(p, true); p += 4;
    const end = dv.getUint32(p, true); p += 4;
    functions.push({ name, start, end });
  }
  const L = dv.getUint32(p, true); p += 4;
  const srcLines = [];
  for (let i = 0; i < L; i++) {
    const ll = dv.getUint16(p, true); p += 2;
    srcLines.push(dec.decode(bytes.subarray(p, p + ll))); p += ll;
  }
  return { lineMap, functions, source: srcLines.join('\n') };
}

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
  BUILTIN: 48,
  LEN: 49,
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
  BUILTIN: ['i'],
  LEN: ['r'],
};

export function pack(program) {
  const { instructions, strings } = program;

  const labelToIndex = new Map();
  const flat = [];
  const flatLine = [];
  for (const ins of instructions) {
    if (ins.op === 'LABEL') labelToIndex.set(ins.args[0], flat.length);
    else { flat.push(ins); flatLine.push({ line: (ins.line || 0) | 0, col: 0 }); }
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

  // 可选调试段：仅在 program.debug 存在时追加。默认（无 debug）路径字节完全不变，
  // 满足无损往返硬约束；校验码在追加后整体重算，旧版 loader 读带段 .dbyte 也会忽略尾部。
  if (program.debug) {
    const debugBytes = buildDebugSegment(
      flatLine,
      program.debug.functions || [],
      program.debug.source || ''
    );
    const combined = new Uint8Array(out.length + debugBytes.length);
    combined.set(out, 0);
    combined.set(debugBytes, out.length);
    const c1 = fnv1a(combined, 0, 20);
    const c2 = fnv1a(combined, 24, combined.length - 24, c1);
    new DataView(combined.buffer).setUint32(20, c2, true);
    return combined;
  }

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

  // 可选调试段：尾部若有 DBG0 魔数则解析并回填指令行号；旧文件无尾部 → debug=null
  let debug = null;
  if (p < bytes.length) {
    const seg = parseDebugSegment(bytes, p);
    if (seg) {
      debug = { functions: seg.functions, source: seg.source };
      const n = Math.min(instructions.length, seg.lineMap.length);
      for (let i = 0; i < n; i++) {
        if (seg.lineMap[i]) {
          instructions[i].line = seg.lineMap[i].line;
          instructions[i].col = seg.lineMap[i].col;
        }
      }
    }
  }

  return { instructions, strings, entry, version, debug };
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