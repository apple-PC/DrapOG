/**
 * @file        drapcc.js
 * @module      drapog/drapcc
 * @summary     DrapLang 编译器（支持 syscall）
 * @version     0.9.0
 */

/* ==================== 系统调用表 ==================== */
const SYS_TABLE = {
  'fs_read':    0x10,
  'fs_write':   0x11,
  'fs_exists':  0x12,
  'fs_ls':      0x13,
  'fs_mkdir':   0x14,
  'fs_rm':      0x15,
  'term_print': 0x30,
  'term_read':  0x31,
  'fs_chdir':   0x16,
  'fs_realpath':0x17,
  'time_now':   0x50,
  'term_clear': 0x32,
  'term_exit':  0x33,
  'term_gui':   0x34,
  'term_hostcmd':0x35,
  'term_setcwd':0x36,
  // 窗口 / 绘制 / 输入（GUI 自举底层工具）
  'win_create':     0x40,
  'win_close':      0x41,
  'win_set_title':  0x42,
  'win_focus':      0x4b,
  'win_text':       0x43,
  'win_fill_rect':  0x44,
  'win_stroke_rect':0x45,
  'win_set_color':  0x46,
  'win_set_font':   0x47,
  'win_get_event':  0x48,
  'win_invalidate': 0x49,
  'win_atoi':       0x4a,
  'itoa':           0x4c,
  // GUI 控件框架（win_gui）：声明式按钮 / 标签 / 输入框，宿主自动布局与命中
  'win_w':          0x4d,
  'win_h':          0x4e,
  'win_button':     0x4f,
  'win_label':      0x51,
  'win_input_get':  0x52,
  'win_input':      0x53,
};

/* event fn 名称 → 事件类型字符串（分发时比对 __et） */
const EVENT_TYPES = {
  on_paint: 'paint',
  on_click: 'click',
  on_key:   'key',
  on_input: 'input',
  on_close: 'close',
};

/* ==================== 标准库模块 + 内建函数 ==================== */
const BUILTIN_MODULES = { core: true, math: true, str: true };

/* name → { mod, id, arity }；调用前编译器校验 imports 含 mod（core 自动导入） */
const BUILTINS = {
  // core（自动，始终可用）
  atoi:   { mod: 'core', id: 10,  arity: 1 },
  // math（需 import math）
  abs:    { mod: 'math', id: 100, arity: 1 },
  min:    { mod: 'math', id: 101, arity: 2 },
  max:    { mod: 'math', id: 102, arity: 2 },
  sqrt:   { mod: 'math', id: 103, arity: 1 },
  pow:    { mod: 'math', id: 104, arity: 2 },
  floor:  { mod: 'math', id: 105, arity: 1 },
  ceil:   { mod: 'math', id: 106, arity: 1 },
  round:  { mod: 'math', id: 107, arity: 1 },
  rand:   { mod: 'math', id: 108, arity: 0 },
  clamp:  { mod: 'math', id: 109, arity: 3 },
  // str（需 import str）
  toUpper:    { mod: 'str', id: 200, arity: 1 },
  toLower:    { mod: 'str', id: 201, arity: 1 },
  trim:       { mod: 'str', id: 202, arity: 1 },
  contains:   { mod: 'str', id: 203, arity: 2 },
  indexOf:    { mod: 'str', id: 204, arity: 2 },
  startsWith: { mod: 'str', id: 205, arity: 2 },
  endsWith:   { mod: 'str', id: 206, arity: 2 },
  repeat:     { mod: 'str', id: 207, arity: 2 },
};

/* 返回字符串（堆指针）的 builtin，inferType 据此判定 str 型 */
const BUILTIN_RET_STR = new Set(['toUpper', 'toLower', 'trim', 'repeat']);

const SYS_RET = {
  'fs_read':    { kind: 'prim', name: 'str' },
  'fs_write':   { kind: 'prim', name: 'i32' },
  'fs_exists':  { kind: 'prim', name: 'i32' },
  'fs_ls':      { kind: 'prim', name: 'str' },
  'fs_mkdir':   { kind: 'prim', name: 'i32' },
  'fs_rm':      { kind: 'prim', name: 'i32' },
  'term_print': { kind: 'prim', name: 'i32' },
  'term_read':  { kind: 'prim', name: 'str' },
  'fs_chdir':   { kind: 'prim', name: 'str' },
  'fs_realpath':{ kind: 'prim', name: 'str' },
  'time_now':   { kind: 'prim', name: 'i32' },
  'term_clear': { kind: 'prim', name: 'i32' },
  'term_exit':  { kind: 'prim', name: 'i32' },
  'term_gui':   { kind: 'prim', name: 'i32' },
  'term_hostcmd':{ kind: 'prim', name: 'i32' },
  'term_setcwd':{ kind: 'prim', name: 'i32' },
  'win_create':     { kind: 'prim', name: 'i32' },
  'win_close':      { kind: 'prim', name: 'i32' },
  'win_set_title':  { kind: 'prim', name: 'i32' },
  'win_focus':      { kind: 'prim', name: 'i32' },
  'win_text':       { kind: 'prim', name: 'i32' },
  'win_fill_rect':  { kind: 'prim', name: 'i32' },
  'win_stroke_rect':{ kind: 'prim', name: 'i32' },
  'win_set_color':  { kind: 'prim', name: 'i32' },
  'win_set_font':   { kind: 'prim', name: 'i32' },
  'win_get_event':  { kind: 'prim', name: 'str' },
  'win_invalidate': { kind: 'prim', name: 'i32' },
  'win_atoi':       { kind: 'prim', name: 'i32' },
  'itoa':           { kind: 'prim', name: 'str' },
  'win_w':          { kind: 'prim', name: 'i32' },
  'win_h':          { kind: 'prim', name: 'i32' },
  'win_button':     { kind: 'prim', name: 'i32' },
  'win_label':      { kind: 'prim', name: 'i32' },
  'win_input_get':  { kind: 'prim', name: 'str' },
  'win_input':      { kind: 'prim', name: 'i32' },
};

const SYS_ARGS = {
  'fs_read':    1,
  'fs_write':   2,
  'fs_exists':  1,
  'fs_ls':      1,
  'fs_mkdir':   1,
  'fs_rm':      1,
  'term_print': 1,
  'term_read':  0,
  'fs_chdir':   1,
  'fs_realpath':2,
  'time_now':   0,
  'term_clear': 0,
  'term_exit':  0,
  'term_gui':   0,
  'term_hostcmd':1,
  'term_setcwd':1,
  'win_create':     3,
  'win_close':      1,
  'win_set_title':  2,
  'win_focus':      1,
  'win_text':       3,
  'win_fill_rect':  4,
  'win_stroke_rect':4,
  'win_set_color':  3,
  'win_set_font':   1,
  'win_get_event':  0,
  'win_invalidate': 1,
  'win_atoi':       1,
  'itoa':           1,
  'win_w':          0,
  'win_h':          0,
  'win_button':     5,
  'win_label':      3,
  'win_input_get':  1,
  'win_input':      5,
};

class Scope {
  constructor(parent) {
    this.parent = parent || null;
    this.vars = new Map();
    this.nextLocal = -1;
  }
  defineLocal(name, type) {
    const off = this.nextLocal--;
    this.vars.set(name, { offset: off, type });
    return off;
  }
  defineParam(name, type, offset) {
    this.vars.set(name, { offset, type });
    return offset;
  }
  lookup(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.lookup(name);
    return null;
  }
  localCount() { return -this.nextLocal - 1; }
}

export class DrapCC {
  constructor(source, options = {}) {
    this.source = source;
    this.options = options;
    this.moduleMap = options.modules || null;       // { name: sourceString }
    this.resolveModule = options.resolveModule || null; // (name) => sourceString | null
    this.instructions = [];
    this.strings = [];
    this.stringMap = new Map();
    this.labelId = 0;
    this.structs = new Map();
    this.funcs = new Map();
    this.eventHandlers = new Map();
    this.setupBody = null;
    this.insideEventHandler = false;
    this.eventMainEndLabel = null;
    this.curScope = null;
    this.curFn = null;
    this.loopStack = [];
    this.imports = new Set(['core']);
    this.fileImports = [];
  }

  compile() {
    this.tokens = this.tokenize(this.source);
    this.pos = 0;
    this.imports = new Set(['core']);
    this.fileImports = [];

    const decls = this._parseToplevel();

    // 解析文件级模块 import（BFS，支持嵌套 import）
    const seen = new Set();
    while (this.fileImports.length) {
      const name = this.fileImports.shift();
      if (seen.has(name)) continue;
      seen.add(name);
      let msrc = this.resolveModule ? this.resolveModule(name) : null;
      if (msrc == null && this.moduleMap) msrc = this.moduleMap[name];
      if (msrc == null) throw this._err('找不到模块 "' + name + '"（检查 modules 列表或 resolveModule）');
      const mdecls = this._parseFromSource(msrc);
      for (const d of mdecls) decls.push(d);
    }

    this.structs = new Map();
    this.funcs = new Map();
    this.eventHandlers = new Map();
    this.setupBody = null;

    for (const d of decls) if (d.kind === 'struct') this.structs.set(d.name, d);
    // 先收集 event fn（决定 entry main 是否作为 setup 内联进合成 main）
    for (const d of decls) if (d.kind === 'eventfn') this.eventHandlers.set(d.name, d);
    // 普通函数 / entry main
    for (const d of decls) {
      if (d.kind !== 'fn') continue;
      if (d.isEntry && d.name === 'main' && this.eventHandlers.size > 0) {
        this.setupBody = d.body;            // main 退化为 setup，内联进合成 main
      } else {
        this.funcs.set(d.name, d);
      }
    }
    for (const d of this.funcs.values()) this.genFn(d);
    if (this.eventHandlers.size > 0) this.genEventMain();

    return { instructions: this.instructions, strings: this.strings };
  }

  /* ==================== 词法 ==================== */
  tokenize(src) {
    const tokens = [];
    let i = 0;
    const n = src.length;
    let line = 1;
    const push = (o) => { o.line = line; tokens.push(o); };
    while (i < n) {
      this.curLine = line;
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        i += 2; continue;
      }
      if (c === '"') {
        i++;
        let s = '';
        while (i < n && src[i] !== '"') {
          if (src[i] === '\n') line++;
          if (src[i] === '\\') {
            i++;
            const e = src[i];
            s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r'
               : e === '\\' ? '\\' : e === '"' ? '"' : e === '0' ? '\0' : e;
            i++;
          } else s += src[i++];
        }
        i++;
        push({ type: 'STR', value: s }); continue;
      }
      if (c === "'") {
        i++;
        let s = '';
        if (src[i] === '\\') {
          i++;
          const e = src[i];
          s = e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e;
          i++;
        } else s = src[i++];
        i++;
        push({ type: 'CHAR', value: s }); continue;
      }
      if (/\d/.test(c)) {
        let j = i;
        while (j < n && /\d/.test(src[j])) j++;
        push({ type: 'NUM', value: parseInt(src.slice(i, j), 10) });
        i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        push({ type: 'IDENT', value: src.slice(i, j) });
        i = j; continue;
      }
      const two = src.substr(i, 2);
      if (['==','!=','<=','>=','&&','||','->','+=','-=','*=','/='].includes(two)) {
        push({ type: 'OP', value: two }); i += 2; continue;
      }
      if ('(){}[]=+-*/%<>!;:,.&|^'.includes(c)) {
        push({ type: 'OP', value: c }); i++; continue;
      }
      throw this._err('词法错误：未知字符 "' + c + '"');
    }
    push({ type: 'EOF', value: null });
    return tokens;
  }

  // 带行号的错误：报错时若当前 token 有 line 信息则前缀「行 N：」
  _err(msg) {
    let ln = '?';
    const t = (this.tokens && this.pos != null) ? this.tokens[this.pos] : undefined;
    if (t && typeof t.line === 'number') ln = t.line;
    else if (typeof this.curLine === 'number') ln = this.curLine;
    return new Error('行 ' + ln + '：' + msg);
  }

  peek(k) { return this.tokens[this.pos + (k || 0)]; }
  next() { return this.tokens[this.pos++]; }
  is(v) {
    const t = this.peek();
    return (t.type === 'IDENT' && t.value === v) || (t.type === 'OP' && t.value === v);
  }
  accept(v) { if (this.is(v)) { this.pos++; return true; } return false; }
  expect(v) {
    if (this.accept(v)) return;
    throw this._err('期望 "' + v + '"，实际 "' + (this.peek().value || '<eof>') + '"');
  }

  /* ==================== 语法 ==================== */
  // 解析「当前已 tokenize 且 pos 已归零」的源码里的顶层声明；import 仅登记，不产出 decl
  _parseToplevel() {
    const decls = [];
    while (this.peek().type !== 'EOF') {
      const t = this.peek();
      if (t.type === 'IDENT' && t.value === 'struct') decls.push(this.parseStruct());
      else if (t.type === 'IDENT' && (t.value === 'fn' || t.value === 'entry')) decls.push(this.parseFn());
      else if (t.type === 'IDENT' && t.value === 'event') decls.push(this.parseEventFn());
      else if (t.type === 'IDENT' && t.value === 'import') this.parseImport();
      else throw this._err('顶层不认识 "' + t.value + '"');
    }
    return decls;
  }

  // 把一段「模块源码」tokenize 后解析其顶层声明；模块只允许 struct / fn / import，禁止 entry / event
  _parseFromSource(src) {
    this.tokens = this.tokenize(src);
    this.pos = 0;
    const decls = [];
    while (this.peek().type !== 'EOF') {
      const t = this.peek();
      if (t.type === 'IDENT' && t.value === 'struct') decls.push(this.parseStruct());
      else if (t.type === 'IDENT' && t.value === 'fn') decls.push(this.parseFn());
      else if (t.type === 'IDENT' && t.value === 'import') this.parseImport();
      else if (t.type === 'IDENT' && (t.value === 'entry' || t.value === 'event'))
        throw this._err('模块内不允许 "' + t.value + '"（模块只提供函数 / 结构体）');
      else throw this._err('顶层不认识 "' + t.value + '"');
    }
    return decls;
  }

  parseImport() {
    this.expect('import');
    const t = this.peek();
    if (t.type === 'STR') {
      // 文件级模块导入：import "name"（name 不带扩展名，对应 modules 里的 key）
      this.next();
      this.fileImports.push(t.value);
      this.accept(';');
      return;
    }
    const name = this.next().value;
    if (!(name in BUILTIN_MODULES)) {
      throw this._err('未知模块 "' + name + '"（可选：core / math / str）');
    }
    this.imports.add(name);
    this.accept(';');
  }

  parseStruct() {
    this.expect('struct');
    const name = this.next().value;
    this.expect('{');
    const fields = [];
    while (!this.is('}')) {
      const fname = this.next().value;
      this.expect(':');
      const ftype = this.parseType();
      fields.push({ name: fname, type: ftype });
      this.accept(',');
      this.accept(';');
    }
    this.expect('}');
    this.accept(';');
    return { kind: 'struct', name, fields };
  }

  parseFn() {
    const isEntry = this.accept('entry');
    this.expect('fn');
    const name = this.next().value;
    this.expect('(');
    const params = [];
    if (!this.is(')')) {
      while (true) {
        const pname = this.next().value;
        this.expect(':');
        const ptype = this.parseType();
        params.push({ name: pname, type: ptype });
        if (!this.accept(',')) break;
      }
    }
    this.expect(')');
    let retType = { kind: 'prim', name: 'void' };
    if (this.accept('->')) retType = this.parseType();
    this.expect('{');
    const body = this.parseBlockBody();
    this.expect('}');
    return { kind: 'fn', name, params, retType, body, isEntry };
  }

  parseEventFn() {
    this.expect('event');
    this.expect('fn');
    const name = this.next().value;
    if (!(name in EVENT_TYPES)) {
      throw this._err('event fn 名称必须是 on_paint/on_click/on_key/on_input/on_close 之一，实际: ' + name);
    }
    this.expect('(');
    const params = [];
    if (!this.is(')')) {
      while (true) {
        const pname = this.next().value;
        this.expect(':');
        const ptype = this.parseType();
        params.push({ name: pname, type: ptype });
        if (!this.accept(',')) break;
      }
    }
    this.expect(')');
    this.expect('{');
    const body = this.parseBlockBody();
    this.expect('}');
    return { kind: 'eventfn', name, params, body };
  }

  parseType() {
    const t = this.next();
    if (t.type !== 'IDENT') throw this._err('期望类型名，实际 "' + t.value + '"');
    if (this.accept('[')) {
      const elem = this.parseType();
      this.expect(']');
      return { kind: 'array', elem };
    }
    return { kind: 'prim', name: t.value };
  }

  parseBlockBody() {
    const body = [];
    while (!this.is('}') && this.peek().type !== 'EOF') body.push(this.parseStmt());
    return body;
  }

  parseStmt() {
    const t = this.peek();

    if (this.is('{')) {
      this.next();
      const body = this.parseBlockBody();
      this.expect('}');
      return { kind: 'block', body };
    }

    if (t.type === 'IDENT') {
      if (t.value === 'let') return this.parseLet();
      if (t.value === 'if') return this.parseIf();
      if (t.value === 'while') return this.parseWhile();
      if (t.value === 'return') return this.parseReturn();
      if (t.value === 'break') { this.next(); this.accept(';'); return { kind: 'break' }; }
      if (t.value === 'continue') { this.next(); this.accept(';'); return { kind: 'continue' }; }
      if (t.value === 'term_print' || t.value === 'term_println') return this.parsePrint();
      // 赋值语句：左值可能是 ident / member(.) / index([])
      const savedPos = this.pos;
      let assignTarget = null;
      let isAssign = false;
      try {
        assignTarget = this.parseAssignTarget();
        isAssign = this.isAssignOp();
      } catch (e) { isAssign = false; }
      if (isAssign) {
        return this.parseAssignRhs(assignTarget);
      }
      this.pos = savedPos;
      const expr = this.parseExpr();
      this.accept(';');
      return { kind: 'exprstmt', expr };
    }

    const expr = this.parseExpr();
    this.accept(';');
    return { kind: 'exprstmt', expr };
  }

  parseLet() {
    this.expect('let');
    const name = this.next().value;
    let type = null;
    if (this.accept(':')) type = this.parseType();
    let init = null;
    if (this.accept('=')) init = this.parseExpr();
    this.accept(';');
    return { kind: 'let', name, type, init };
  }

  parseAssignTarget() {
    let e = this.parsePrimary();
    while (true) {
      if (this.is('.')) {
        this.next();
        const name = this.next().value;
        e = { kind: 'member', obj: e, name };
      } else if (this.is('[')) {
        this.next();
        const idx = this.parseExpr();
        this.expect(']');
        e = { kind: 'index', obj: e, index: idx };
      } else break;
    }
    return e;
  }

  isAssignOp() {
    const t = this.peek();
    return t.type === 'OP' && ['=', '+=', '-=', '*=', '/='].includes(t.value);
  }

  parseAssignRhs(target) {
    const op = this.next().value;
    const value = this.parseExpr();
    this.accept(';');
    return { kind: 'assign', target, op, value };
  }

  parseIf() {
    this.expect('if');
    this.expect('(');
    const cond = this.parseExpr();
    this.expect(')');
    const then = this.parseStmt();
    let alt = null;
    if (this.accept('else')) alt = this.parseStmt();
    return { kind: 'if', cond, then, alt };
  }

  parseWhile() {
    this.expect('while');
    this.expect('(');
    const cond = this.parseExpr();
    this.expect(')');
    const body = this.parseStmt();
    return { kind: 'while', cond, body };
  }

  parseReturn() {
    this.expect('return');
    let expr = null;
    if (!this.is(';') && !this.is('}')) expr = this.parseExpr();
    this.accept(';');
    return { kind: 'return', expr };
  }

  parsePrint() {
    const fn = this.next().value;
    this.expect('(');
    const args = [];
    if (!this.is(')')) {
      while (true) {
        args.push(this.parseExpr());
        if (!this.accept(',')) break;
      }
    }
    this.expect(')');
    this.accept(';');
    return { kind: 'print', fn, args };
  }

  /* ==================== 表达式 ==================== */
  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.is('||')) { this.next(); left = { kind: 'bin', op: '||', left, right: this.parseAnd() }; }
    return left;
  }
  parseAnd() {
    let left = this.parseEq();
    while (this.is('&&')) { this.next(); left = { kind: 'bin', op: '&&', left, right: this.parseEq() }; }
    return left;
  }
  parseEq() {
    let left = this.parseCmp();
    while (this.is('==') || this.is('!=')) {
      const op = this.next().value;
      left = { kind: 'bin', op, left, right: this.parseCmp() };
    }
    return left;
  }
  parseCmp() {
    let left = this.parseAdd();
    while (this.is('<') || this.is('>') || this.is('<=') || this.is('>=')) {
      const op = this.next().value;
      left = { kind: 'bin', op, left, right: this.parseAdd() };
    }
    return left;
  }
  parseAdd() {
    let left = this.parseMul();
    while (this.is('+') || this.is('-')) {
      const op = this.next().value;
      left = { kind: 'bin', op, left, right: this.parseMul() };
    }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    while (this.is('*') || this.is('/') || this.is('%')) {
      const op = this.next().value;
      left = { kind: 'bin', op, left, right: this.parseUnary() };
    }
    return left;
  }
  parseUnary() {
    if (this.is('-')) { this.next(); return { kind: 'neg', expr: this.parseUnary() }; }
    if (this.is('!')) { this.next(); return { kind: 'not', expr: this.parseUnary() }; }
    return this.parsePostfix();
  }

  parsePostfix() {
    let e = this.parsePrimary();
    while (true) {
      if (this.is('(')) {
        this.next();
        const args = [];
        if (!this.is(')')) {
          while (true) {
            args.push(this.parseExpr());
            if (!this.accept(',')) break;
          }
        }
        this.expect(')');
        if (e.kind !== 'ident') throw this._err('只能调用命名函数');
        e = { kind: 'call', name: e.name, args };
      } else if (this.is('[')) {
        this.next();
        const idx = this.parseExpr();
        this.expect(']');
        e = { kind: 'index', obj: e, index: idx };
      } else if (this.is('.')) {
        this.next();
        const name = this.next().value;
        if (this.is('(')) {
          this.next();
          const args = [];
          if (!this.is(')')) {
            while (true) {
              args.push(this.parseExpr());
              if (!this.accept(',')) break;
            }
          }
          this.expect(')');
          e = { kind: 'methodcall', obj: e, method: name, args };
        } else {
          e = { kind: 'member', obj: e, name };
        }
      } else break;
    }
    return e;
  }

  parsePrimary() {
    const t = this.peek();

    // ---- syscall 表达式 ----
    if (t.type === 'IDENT' && t.value === 'syscall') {
      this.next();
      const nameTok = this.peek();
      if (nameTok.type !== 'IDENT') throw this._err('syscall 后期望名字，实际 "' + nameTok.value + '"');
      const name = this.next().value;
      this.expect('(');
      const args = [];
      if (!this.is(')')) {
        while (true) {
          args.push(this.parseExpr());
          if (!this.accept(',')) break;
        }
      }
      this.expect(')');
      return { kind: 'syscall', name, args };
    }

    if (t.type === 'NUM') { this.next(); return { kind: 'num', value: t.value }; }
    if (t.type === 'STR') { this.next(); return { kind: 'str', value: t.value }; }
    if (t.type === 'CHAR') { this.next(); return { kind: 'num', value: t.value.charCodeAt(0) }; }
    if (t.type === 'IDENT') {
      if (t.value === 'true') { this.next(); return { kind: 'num', value: 1 }; }
      if (t.value === 'false') { this.next(); return { kind: 'num', value: 0 }; }
      this.next();
      if (this.is('{')) {
        this.next();
        const fields = [];
        while (!this.is('}')) {
          const fname = this.next().value;
          this.expect(':');
          const val = this.parseExpr();
          fields.push({ name: fname, value: val });
          if (!this.accept(',')) break;
        }
        this.expect('}');
        return { kind: 'structlit', name: t.value, fields };
      }
      return { kind: 'ident', name: t.value };
    }
    if (this.is('(')) {
      this.next();
      const e = this.parseExpr();
      this.expect(')');
      return e;
    }
    if (this.is('[')) {
      this.next();
      const items = [];
      if (!this.is(']')) {
        while (true) {
          items.push(this.parseExpr());
          if (!this.accept(',')) break;
        }
      }
      this.expect(']');
      return { kind: 'arraylit', items };
    }
    throw this._err('无法解析表达式，遇到 "' + (t.value || '<eof>') + '"');
  }

  /* ==================== 代码生成 ==================== */
  emit(op, args) { this.instructions.push({ op, args: args || [] }); }
  newLabel(p) { return '._' + p + '_' + (this.labelId++); }
  getStringId(s) {
    if (this.stringMap.has(s)) return this.stringMap.get(s);
    const id = this.strings.length;
    this.strings.push(s);
    this.stringMap.set(s, id);
    return id;
  }

  genFn(fn) {
    this.curFn = fn;
    this.curScope = new Scope(null);
    this.loopStack = [];

    fn.params.forEach((p, i) => this.curScope.defineParam(p.name, p.type, 2 + i));
    this.scanLocals(fn.body, this.curScope);

    this.emit('LABEL', [fn.name]);
    this.emit('ENTER', []);
    const nLocals = this.curScope.localCount();
    if (nLocals > 0) this.emit('ALLOC', [String(nLocals)]);

    for (const stmt of fn.body) this.genStmt(stmt);

    this.emit('LI', ['r0', '0']);
    this.emit('LEAVE', []);
    this.emit('RET', []);
  }

  /* ==================== event fn 合成 main 事件循环 ==================== */
  genEventMain() {
    this.curFn = { name: 'main', params: [], retType: { kind: 'prim', name: 'i32' } };
    this.curScope = new Scope(null);
    this.loopStack = [];
    this.insideEventHandler = false;

    // 扫描局部（setup + 各 handler 体 + handler 参数 + 内部变量 __ev/__et）
    if (this.setupBody) this.scanLocals(this.setupBody, this.curScope);
    for (const h of this.eventHandlers.values()) {
      for (const p of h.params) this.curScope.defineLocal(p.name, p.type);
      this.scanLocals(h.body, this.curScope);
    }
    this.curScope.defineLocal('__ev', { kind: 'prim', name: 'str' });
    this.curScope.defineLocal('__et', { kind: 'prim', name: 'str' });

    this.emit('LABEL', ['main']);
    this.emit('ENTER', []);
    const nLocals = this.curScope.localCount();
    if (nLocals > 0) this.emit('ALLOC', [String(nLocals)]);

    // 内联 setup（创建窗口、初始化状态）
    if (this.setupBody) for (const s of this.setupBody) this.genStmt(s);

    const loopStart = this.newLabel('eloop');
    const endL = this.newLabel('eend');
    this.eventMainEndLabel = endL;
    this.emit('LABEL', [loopStart]);

    // __ev = syscall win_get_event()
    this.genStmt({ kind: 'assign', target: { kind: 'ident', name: '__ev' }, op: '=',
      value: { kind: 'syscall', name: 'win_get_event', args: [] } });
    // __et = split(__ev, ' ')[0]  —— 取事件类型 token
    this.genStmt({ kind: 'assign', target: { kind: 'ident', name: '__et' }, op: '=',
      value: { kind: 'index',
        obj: { kind: 'call', name: 'split', args: [ { kind: 'ident', name: '__ev' }, { kind: 'str', value: ' ' } ] },
        index: { kind: 'num', value: 0 } } });

    // 分发：paint / click / key / input（逆序构建 else-if 链）
    const items = [
      { t: 'paint', h: this.eventHandlers.get('on_paint') },
      { t: 'click', h: this.eventHandlers.get('on_click') },
      { t: 'key',   h: this.eventHandlers.get('on_key') },
      { t: 'input', h: this.eventHandlers.get('on_input') },
    ];
    let chain = null;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.h) continue;
      const body = [];
      for (const p of it.h.params) {
        body.push({ kind: 'assign', target: { kind: 'ident', name: p.name }, op: '=', value: { kind: 'ident', name: '__ev' } });
      }
      for (const st of it.h.body) body.push(st);
      const branch = { kind: 'block', body };
      const cond = { kind: 'bin', op: '==', left: { kind: 'ident', name: '__et' }, right: { kind: 'str', value: it.t } };
      chain = chain === null
        ? { kind: 'if', cond, then: branch, alt: null }
        : { kind: 'if', cond, then: branch, alt: chain };
    }
    this.insideEventHandler = true;          // 处理器体（含可能的 return）视为应用内上下文
    if (chain) this.genStmt(chain);

    // close：精确匹配完整事件串 'close'
    this.genExpr({ kind: 'bin', op: '==', left: { kind: 'ident', name: '__ev' }, right: { kind: 'str', value: 'close' } });
    this.emit('JZ', [loopStart]);
    const closeH = this.eventHandlers.get('on_close');
    if (closeH) for (const st of closeH.body) this.genStmt(st);
    this.insideEventHandler = false;
    this.emit('JMP', [endL]);

    this.emit('LABEL', [endL]);
    this.emit('LI', ['r0', '0']);
    this.emit('LEAVE', []);
    this.emit('RET', []);
  }

  scanLocals(stmts, scope) {
    for (const s of stmts) {
      if (s.kind === 'let') {
        let t = s.type;
        if (!t) {
          const init = s.init;
          if (init && init.kind === 'str') t = { kind: 'prim', name: 'str' };
          else if (init && init.kind === 'syscall') t = SYS_RET[init.name] || { kind: 'prim', name: 'i32' };
          else if (init && init.kind === 'call' && init.name === 'split') t = { kind: 'array', elem: { kind: 'prim', name: 'str' } };
          else if (init && init.kind === 'arraylit') t = { kind: 'array', elem: { kind: 'prim', name: 'i32' } };
          else if (init && init.kind === 'structlit') t = { kind: 'struct', name: init.name };
          else t = { kind: 'prim', name: 'i32' };
        }
        scope.defineLocal(s.name, t);
      } else if (s.kind === 'block') this.scanLocals(s.body, scope);
      else if (s.kind === 'if') {
        this.scanLocals([s.then], scope);
        if (s.alt) this.scanLocals([s.alt], scope);
      } else if (s.kind === 'while') {
        this.scanLocals([s.body], scope);
      }
    }
  }

  genStmt(s) {
    switch (s.kind) {
      case 'let': return this.genLet(s);
      case 'assign': return this.genAssign(s);
      case 'exprstmt': this.genExpr(s.expr); return;
      case 'if': return this.genIf(s);
      case 'while': return this.genWhile(s);
      case 'return': return this.genReturn(s);
      case 'break': {
        if (this.loopStack.length === 0) throw new Error('break 不在循环中');
        this.emit('JMP', [this.loopStack[this.loopStack.length - 1].end]);
        return;
      }
      case 'continue': {
        if (this.loopStack.length === 0) throw new Error('continue 不在循环中');
        this.emit('JMP', [this.loopStack[this.loopStack.length - 1].start]);
        return;
      }
      case 'block': for (const st of s.body) this.genStmt(st); return;
      case 'print': return this.genPrint(s);
      default: throw new Error('未处理的语句: ' + s.kind);
    }
  }

  genLet(s) {
    const v = this.curScope.lookup(s.name);
    if (!v) throw new Error('未分配局部变量: ' + s.name);
    if (s.init) {
      this.genExpr(s.init);
      if (!s.type) v.type = this.inferType(s.init);
    } else {
      this.emit('LI', ['r0', '0']);
    }
    this.emit('STOREL', [String(v.offset), 'r0']);
  }

  genAssign(s) {
    const tgt = s.target;
    this.genExpr(s.value);           // r0 = 右值

    if (tgt.kind === 'ident') {
      const v = this.curScope.lookup(tgt.name);
      if (!v) throw new Error('未定义变量: ' + tgt.name);
      if (s.op === '=') {
        this.emit('STOREL', [String(v.offset), 'r0']);
      } else {
        this.emit('LOADL', [String(v.offset), 'r1']);   // r1 = 旧值
        const m = { '+=': 'ADD', '-=': 'SUB', '*=': 'MUL', '/=': 'DIV' };
        this.emit(m[s.op], ['r2', 'r1', 'r0']);          // r2 = 旧 OP 新
        this.emit('STOREL', [String(v.offset), 'r2']);
      }
      return;
    }

    if (tgt.kind === 'member') {
      this.emit('PUSH', ['r0']);                 // 暂存右值
      this.genExpr(tgt.obj);                      // r0 = 对象指针
      this.emit('MOV', ['r7', 'r0']);             // r7 = 对象指针
      this.emit('POP', ['r0']);                   // r0 = 右值
      const objType = this.inferType(tgt.obj);
      let fieldIdx = -1;
      if (objType && objType.kind === 'struct') {
        const sd = this.structs.get(objType.name);
        if (sd) fieldIdx = sd.fields.findIndex(f => f.name === tgt.name);
      }
      if (fieldIdx < 0) throw new Error('未知字段: ' + tgt.name);
      if (s.op === '=') {
        this.emit('FLDSET', ['r7', String(fieldIdx), 'r0']);
      } else {
        this.emit('FLDGET', ['r7', String(fieldIdx), 'r1']);   // r1 = 旧值
        const m = { '+=': 'ADD', '-=': 'SUB', '*=': 'MUL', '/=': 'DIV' };
        this.emit(m[s.op], ['r2', 'r1', 'r0']);                // r2 = 旧 OP 新
        this.emit('FLDSET', ['r7', String(fieldIdx), 'r2']);
      }
      return;
    }

    if (tgt.kind === 'index') {
      const objT = this.inferType(tgt.obj);
      if (this.isStrType(objT)) throw new Error('字符串不可被赋值');
      this.emit('PUSH', ['r0']);                 // 暂存右值
      this.genExpr(tgt.obj);                      // r0 = 数组指针
      this.emit('PUSH', ['r0']);                  // 暂存数组指针
      this.genExpr(tgt.index);                     // r0 = 下标
      this.emit('MOV', ['r1', 'r0']);              // r1 = 下标
      this.emit('POP', ['r7']);                    // r7 = 数组指针
      this.emit('POP', ['r0']);                    // r0 = 右值
      if (s.op === '=') {
        this.emit('ARRSET', ['r7', 'r1', 'r0']);
      } else {
        this.emit('ARRGET', ['r7', 'r1', 'r2']);   // r2 = 旧值
        const m = { '+=': 'ADD', '-=': 'SUB', '*=': 'MUL', '/=': 'DIV' };
        this.emit(m[s.op], ['r3', 'r2', 'r0']);    // r3 = 旧 OP 新
        this.emit('ARRSET', ['r7', 'r1', 'r3']);
      }
      return;
    }

    throw new Error('非法的赋值目标');
  }

  genIf(s) {
    const elseL = this.newLabel('else');
    const endL = this.newLabel('endif');
    this.genExpr(s.cond);
    this.emit('JZ', [elseL]);
    this.genStmt(s.then);
    if (s.alt) {
      this.emit('JMP', [endL]);
      this.emit('LABEL', [elseL]);
      this.genStmt(s.alt);
      this.emit('LABEL', [endL]);
    } else {
      this.emit('LABEL', [elseL]);
    }
  }

  genWhile(s) {
    const startL = this.newLabel('wstart');
    const endL = this.newLabel('wend');
    this.emit('LABEL', [startL]);
    this.genExpr(s.cond);
    this.emit('JZ', [endL]);
    this.loopStack.push({ start: startL, end: endL });
    this.genStmt(s.body);
    this.loopStack.pop();
    this.emit('JMP', [startL]);
    this.emit('LABEL', [endL]);
  }

  genReturn(s) {
    if (this.insideEventHandler) {
      // 处理器内的 return 直接退出整个应用（跳到合成 main 结尾）
      this.emit('JMP', [this.eventMainEndLabel]);
      return;
    }
    if (s.expr) this.genExpr(s.expr);
    else this.emit('LI', ['r0', '0']);
    this.emit('LEAVE', []);
    this.emit('RET', []);
  }

  genPrint(s) {
    for (const arg of s.args) {
      this.genExpr(arg);
      const t = this.inferType(arg);
      if (this.isStrType(t)) this.emit('PRINTSTR', ['r0']);
      else this.emit('PRINTINT', ['r0']);
    }
    if (s.fn === 'term_println') this.emit('PRINTLN', []);
  }

  genExpr(node) {
    switch (node.kind) {
      case 'num': this.emit('LI', ['r0', String(node.value)]); return;
      case 'str': {
        const id = this.getStringId(node.value);
        this.emit('STR', [String(id), 'r0']);
        return;
      }
      case 'ident': {
        const v = this.curScope.lookup(node.name);
        if (!v) throw new Error('未定义变量: ' + node.name);
        this.emit('LOADL', [String(v.offset), 'r0']);
        return;
      }
      case 'neg': {
        this.genExpr(node.expr);
        this.emit('LI', ['r1', '0']);
        this.emit('SUB', ['r0', 'r1', 'r0']);
        return;
      }
      case 'not': {
        this.genExpr(node.expr);
        this.emit('LI', ['r1', '0']);
        this.emit('EQ', ['r0', 'r0', 'r1']);
        return;
      }
      case 'bin': return this.genBin(node);
      case 'call': return this.genCall(node);
      case 'methodcall': return this.genMethodCall(node);
      case 'index': return this.genIndex(node);
      case 'member': return this.genMember(node);
      case 'arraylit': return this.genArrayLit(node);
      case 'structlit': return this.genStructLit(node);
      case 'syscall': return this.genSyscall(node);
      default: throw new Error('未处理的表达式: ' + node.kind);
    }
  }

  genSyscall(node) {
    const num = SYS_TABLE[node.name];
    if (num === undefined) throw new Error('未知系统调用: ' + node.name);
    const expected = SYS_ARGS[node.name];
    if (node.args.length !== expected) {
      throw new Error(node.name + ' 需要 ' + expected + ' 个参数，实际 ' + node.args.length + ' 个');
    }
    const n = node.args.length;
    // 从右到左求值，除最左（第一个参数）外都压栈
    for (let i = n - 1; i >= 1; i--) {
      this.genExpr(node.args[i]);
      this.emit('PUSH', ['r0']);
    }
    // 第一个参数求值到 r0，然后送入 r1
    if (n >= 1) {
      this.genExpr(node.args[0]);
      this.emit('MOV', ['r1', 'r0']);
    }
    // 依次弹出到 r2, r3
    if (n >= 2) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r2', 'r0']);
    }
    if (n >= 3) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r3', 'r0']);
    }
    if (n >= 4) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r6', 'r0']);
    }
    if (n >= 5) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r7', 'r0']);
    }
    this.emit('SYSCALL', [String(num)]);
  }

  // 内建函数：调用约定与 syscall 一致（r1..r3 + r6 + r7），结果回 r0
  genBuiltin(id, args) {
    const n = args.length;
    for (let i = n - 1; i >= 1; i--) {
      this.genExpr(args[i]);
      this.emit('PUSH', ['r0']);
    }
    if (n >= 1) {
      this.genExpr(args[0]);
      this.emit('MOV', ['r1', 'r0']);
    }
    if (n >= 2) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r2', 'r0']);
    }
    if (n >= 3) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r3', 'r0']);
    }
    if (n >= 4) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r6', 'r0']);
    }
    if (n >= 5) {
      this.emit('POP', ['r0']);
      this.emit('MOV', ['r7', 'r0']);
    }
    this.emit('BUILTIN', [String(id)]);
  }

  genBin(node) {
    const lt = this.inferType(node.left);
    const rt = this.inferType(node.right);

    if (node.op === '+' && (this.isStrType(lt) || this.isStrType(rt))) {
      this.genExpr(node.left);
      this.emit('PUSH', ['r0']);
      this.genExpr(node.right);
      this.emit('MOV', ['r1', 'r0']);
      this.emit('POP', ['r0']);
      this.emit('STRCAT', ['r0', 'r1']);
      return;
    }

    if ((node.op === '==' || node.op === '!=') && this.isStrType(lt) && this.isStrType(rt)) {
      this.genExpr(node.left);
      this.emit('PUSH', ['r0']);
      this.genExpr(node.right);
      this.emit('MOV', ['r1', 'r0']);
      this.emit('POP', ['r0']);
      this.emit('STREQ', ['r0', 'r1']);
      if (node.op === '!=') {
        this.emit('LI', ['r1', '1']);
        this.emit('SUB', ['r0', 'r1', 'r0']);
      }
      return;
    }

    if (node.op === '&&' || node.op === '||') {
      const endL = this.newLabel(node.op === '&&' ? 'andend' : 'orend');
      this.genExpr(node.left);
      if (node.op === '&&') {
        this.emit('JZ', [endL]);
        this.genExpr(node.right);
        this.emit('LI', ['r1', '0']);
        this.emit('NE', ['r0', 'r0', 'r1']);
        this.emit('LABEL', [endL]);
      } else {
        const lFalse = this.newLabel('orf');
        this.emit('JZ', [lFalse]);
        this.emit('LI', ['r0', '1']);
        this.emit('JMP', [endL]);
        this.emit('LABEL', [lFalse]);
        this.genExpr(node.right);
        this.emit('LI', ['r1', '0']);
        this.emit('NE', ['r0', 'r0', 'r1']);
        this.emit('LABEL', [endL]);
      }
      return;
    }

    this.genExpr(node.left);
    this.emit('PUSH', ['r0']);
    this.genExpr(node.right);
    this.emit('MOV', ['r1', 'r0']);
    this.emit('POP', ['r0']);
    const map = {
      '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
      '<': 'LT', '>': 'GT', '<=': 'LE', '>=': 'GE', '==': 'EQ', '!=': 'NE',
    };
    const inst = map[node.op];
    if (!inst) throw new Error('不支持的运算符: ' + node.op);
    this.emit(inst, ['r2', 'r0', 'r1']);
    this.emit('MOV', ['r0', 'r2']);
  }

  genCall(node) {
    if (node.name === 'len') {
      const t = this.inferType(node.args[0]);
      this.genExpr(node.args[0]);
      if (this.isStrType(t)) this.emit('STRLEN', ['r0']);
      else this.emit('ARRLEN', ['r0']);
      return;
    }
    if (node.name === 'split') {
      // split(src, delim) → STRSPLIT src, delim, dst；dst 存字符串指针数组，最后搬到 r0
      // 约定：delim 传「单字符码点」(i32)。字符字面量 ' ' 已是码点；
      // 双引号字符串 " " 需在此拆出首字符码点，否则会被当成字符串指针而误用。
      if (node.args.length !== 2) throw new Error('split 需要 2 个参数');
      this.genExpr(node.args[0]);          // 源字符串 → r0
      this.emit('PUSH', ['r0']);
      const delim = node.args[1];
      if (delim.kind === 'str') {
        const code = delim.value.length > 0 ? delim.value.charCodeAt(0) : 0;
        this.emit('LI', ['r1', String(code)]);
      } else {
        this.genExpr(delim);               // 字符字面量 ' '（已是码点）或变量
        this.emit('MOV', ['r1', 'r0']);
      }
      this.emit('POP', ['r0']);
      this.emit('STRSPLIT', ['r0', 'r1', 'r2']);
      this.emit('MOV', ['r0', 'r2']);
      return;
    }
    if (node.name === 'substr') {
      // substr(src, start) → STRSUB src, start, dst；dst 存新字符串指针，搬到 r0
      if (node.args.length !== 2) throw new Error('substr 需要 2 个参数');
      this.genExpr(node.args[0]);
      this.emit('PUSH', ['r0']);
      this.genExpr(node.args[1]);
      this.emit('MOV', ['r1', 'r0']);
      this.emit('POP', ['r0']);
      this.emit('STRSUB', ['r0', 'r1', 'r2']);
      this.emit('MOV', ['r0', 'r2']);
      return;
    }
    const bi = BUILTINS[node.name];
    if (bi) {
      if (!this.imports.has(bi.mod)) {
        throw new Error(node.name + ' 属于模块 ' + bi.mod + '，需先 `import ' + bi.mod + '`');
      }
      if (node.args.length !== bi.arity) {
        throw new Error(node.name + ' 需要 ' + bi.arity + ' 个参数，实际 ' + node.args.length + ' 个');
      }
      this.genBuiltin(bi.id, node.args);
      return;
    }
    const fn = this.funcs.get(node.name);
    if (!fn) throw new Error('未定义函数: ' + node.name);
    if (fn.params.length !== node.args.length) {
      throw new Error('参数个数不符: ' + node.name + ' 需要 ' + fn.params.length + ' 个，实际 ' + node.args.length + ' 个');
    }
    for (let i = node.args.length - 1; i >= 0; i--) {
      this.genExpr(node.args[i]);
      this.emit('PUSH', ['r0']);
    }
    this.emit('CALL', [node.name]);
    if (node.args.length > 0) {
      this.emit('ADDSP', [String(node.args.length)]);
    }
  }

  genMethodCall(node) {
    if (node.method === 'push') {
      if (node.args.length !== 1) throw new Error('push 需要 1 个参数');
      this.genExpr(node.obj);
      this.emit('PUSH', ['r0']);
      this.genExpr(node.args[0]);
      this.emit('MOV', ['r1', 'r0']);
      this.emit('POP', ['r0']);
      this.emit('ARRPUSH', ['r0', 'r1']);
      return;
    }
    throw new Error('未知方法: ' + node.method);
  }

  genIndex(node) {
    const objT = this.inferType(node.obj);
    if (this.isStrType(objT)) {
      // 字符串索引：s[i] → 码点（i32），走 STRGET
      this.genExpr(node.obj);
      this.emit('PUSH', ['r0']);
      this.genExpr(node.index);
      this.emit('MOV', ['r1', 'r0']);
      this.emit('POP', ['r0']);
      this.emit('STRGET', ['r2', 'r0', 'r1']);
      this.emit('MOV', ['r0', 'r2']);
      return;
    }
    // 数组索引：走 ARRGET
    this.genExpr(node.obj);
    this.emit('PUSH', ['r0']);
    this.genExpr(node.index);
    this.emit('MOV', ['r1', 'r0']);
    this.emit('POP', ['r0']);
    this.emit('ARRGET', ['r0', 'r1', 'r2']);
    this.emit('MOV', ['r0', 'r2']);
  }

  genMember(node) {
    if (node.name === 'len') {
      const t = this.inferType(node.obj);
      this.genExpr(node.obj);
      if (this.isStrType(t)) this.emit('STRLEN', ['r0']);
      else this.emit('ARRLEN', ['r0']);
      return;
    }
    this.genExpr(node.obj);
    const objType = this.inferType(node.obj);
    let fieldIdx = -1;
    if (objType && objType.kind === 'struct') {
      const sd = this.structs.get(objType.name);
      if (sd) fieldIdx = sd.fields.findIndex(f => f.name === node.name);
    }
    if (fieldIdx < 0) throw new Error('未知字段: ' + node.name);
    this.emit('FLDGET', ['r0', String(fieldIdx), 'r1']);
    this.emit('MOV', ['r0', 'r1']);
  }

  genArrayLit(node) {
    this.emit('NEWARR', [String(node.items.length), 'r0']);
    this.emit('MOV', ['r7', 'r0']);
    for (let i = 0; i < node.items.length; i++) {
      this.genExpr(node.items[i]);
      this.emit('ARRSET', ['r7', String(i), 'r0']);
    }
    this.emit('MOV', ['r0', 'r7']);
  }

  genStructLit(node) {
    const sd = this.structs.get(node.name);
    if (!sd) throw new Error('未定义结构体: ' + node.name);
    this.emit('NEWOBJ', [String(sd.fields.length), 'r0']);
    this.emit('MOV', ['r7', 'r0']);
    for (const f of node.fields) {
      const idx = sd.fields.findIndex(sf => sf.name === f.name);
      if (idx < 0) throw new Error('未知字段: ' + f.name);
      this.genExpr(f.value);
      this.emit('FLDSET', ['r7', String(idx), 'r0']);
    }
    this.emit('MOV', ['r0', 'r7']);
  }

  /* ==================== 类型推断 ==================== */
  isStrType(t) { return t && t.kind === 'prim' && t.name === 'str'; }

  inferType(node) {
    if (!node) return { kind: 'prim', name: 'i32' };
    switch (node.kind) {
      case 'num': return { kind: 'prim', name: 'i32' };
      case 'str': return { kind: 'prim', name: 'str' };
      case 'syscall': return SYS_RET[node.name] || { kind: 'prim', name: 'i32' };
      case 'ident': {
        const v = this.curScope ? this.curScope.lookup(node.name) : null;
        return v ? v.type : { kind: 'prim', name: 'i32' };
      }
      case 'bin': {
        const lt = this.inferType(node.left);
        const rt = this.inferType(node.right);
        if (node.op === '+' && (this.isStrType(lt) || this.isStrType(rt))) {
          return { kind: 'prim', name: 'str' };
        }
        return { kind: 'prim', name: 'i32' };
      }
      case 'call': {
        const fn = this.funcs.get(node.name);
        if (fn) return fn.retType;
        if (node.name in BUILTINS) {
          return BUILTIN_RET_STR.has(node.name) ? { kind: 'prim', name: 'str' } : { kind: 'prim', name: 'i32' };
        }
        if (node.name === 'len') return { kind: 'prim', name: 'i32' };
        if (node.name === 'split') return { kind: 'array', elem: { kind: 'prim', name: 'str' } };
        if (node.name === 'substr') return { kind: 'prim', name: 'str' };
        return { kind: 'prim', name: 'i32' };
      }
      case 'arraylit': return { kind: 'array', elem: { kind: 'prim', name: 'i32' } };
      case 'structlit': return { kind: 'struct', name: node.name };
      case 'member': {
        if (node.name === 'len') return { kind: 'prim', name: 'i32' };
        const objT = this.inferType(node.obj);
        if (objT.kind === 'struct') {
          const sd = this.structs.get(objT.name);
          if (sd) {
            const f = sd.fields.find(f => f.name === node.name);
            if (f) return f.type;
          }
        }
        return { kind: 'prim', name: 'i32' };
      }
      case 'index': {
        const objT = this.inferType(node.obj);
        if (this.isStrType(objT)) return { kind: 'prim', name: 'i32' };   // s[i] → 码点（i32）
        if (objT && objT.kind === 'array') return objT.elem || { kind: 'prim', name: 'i32' };
        return { kind: 'prim', name: 'i32' };
      }
      case 'neg': case 'not': return { kind: 'prim', name: 'i32' };
      case 'methodcall': return { kind: 'prim', name: 'void' };
    }
    return { kind: 'prim', name: 'i32' };
  }
}