/**
 * @file        drapas.js
 * @module      drapog/drapas
 * @summary     DrapAS 汇编器（.dasm → .dbyte）
 * @version     0.1.0
 */

import { pack, OPCODE } from './drapog.dbyte.js';

export function assemble(source) {
  const lines = source.split('\n');
  let section = null;
  const items = [];
  const strings = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const ci = line.indexOf(';');
    if (ci >= 0) line = line.slice(0, ci);
    line = line.trim();
    if (!line) continue;

    if (/^\.section\s+/.test(line)) {
      section = line.split(/\s+/)[1];
      continue;
    }

    if (section === '.strings') {
      const m = line.match(/^str\[(\d+)\]\s*=\s*"((?:[^"\\]|\\.)*)"$/);
      if (!m) throw new Error(`第 ${i + 1} 行: 无法解析字符串定义 "${line}"`);
      strings[parseInt(m[1], 10)] = unescape(m[2]);
      continue;
    }

    if (section === '.text') {
      if (/^[.\w]+:$/.test(line)) {
        items.push({ type: 'label', name: line.slice(0, -1) });
        continue;
      }
      const m = line.match(/^(\w+)(?:\s+(.+))?$/);
      if (!m) throw new Error(`第 ${i + 1} 行: 无法解析 "${line}"`);
      const op = m[1];
      if (!(op in OPCODE)) throw new Error(`第 ${i + 1} 行: 未知指令 "${op}"`);
      const args = m[2] ? m[2].split(/\s*,\s*/) : [];
      items.push({ type: 'instr', op, args });
      continue;
    }

    if (!section) throw new Error(`第 ${i + 1} 行: 未指定 section`);
    throw new Error(`第 ${i + 1} 行: 未知 section "${section}"`);
  }

  const instructions = [];
  for (const it of items) {
    if (it.type === 'label') instructions.push({ op: 'LABEL', args: [it.name] });
    else instructions.push({ op: it.op, args: it.args });
  }

  const finalStrings = [];
  for (let i = 0; i < strings.length; i++) finalStrings[i] = strings[i] || '';

  return pack({ instructions, strings: finalStrings });
}

function unescape(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const e = s[i + 1];
      out += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r'
           : e === '\\' ? '\\' : e === '"' ? '"' : e;
      i++;
    } else out += s[i];
  }
  return out;
}