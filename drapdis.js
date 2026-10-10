/**
 * @file        drapdis.js
 * @module      drapog/drapdis
 * @summary     DrapDis 反汇编器（.dbyte → .dasm）
 * @version     0.1.0
 */

import { unpack, ARG_SPEC } from './drapog.dbyte.js';

export function disassemble(bytes, filename) {
  const { instructions, strings, entry, version } = unpack(bytes);

  const labelSet = new Set();
  labelSet.add(entry);
  for (const ins of instructions) {
    const spec = ARG_SPEC[ins.op] || [];
    for (let i = 0; i < spec.length; i++) {
      if (spec[i] === 'l') {
        const a = ins.args[i];
        if (typeof a === 'string' && a.startsWith('@')) {
          labelSet.add(parseInt(a.slice(1), 10));
        }
      }
    }
  }

  const lines = [];
  lines.push('; ' + '='.repeat(60));
  lines.push('; DrapDis 反汇编输出');
  if (filename) lines.push('; 源文件: ' + filename);
  lines.push('; 大小: ' + bytes.length + ' 字节');
  lines.push('; 版本: ' + (version >> 8) + '.' + (version & 0xFF));
  lines.push('; 指令数: ' + instructions.length + '  字符串数: ' + strings.length + '  入口: ' + entry);
  lines.push('; ' + '='.repeat(60));
  lines.push('');
  lines.push('.section .text');

  for (let i = 0; i < instructions.length; i++) {
    if (labelSet.has(i)) {
      if (i === entry) {
        lines.push('main:  ; 入口');
      } else {
        lines.push('.L_' + i + ':');
      }
    }
    lines.push('    ' + formatInstr(instructions[i]));
  }

  lines.push('');
  lines.push('.section .strings');
  if (strings.length === 0) {
    lines.push('; （无字符串）');
  } else {
    for (let i = 0; i < strings.length; i++) {
      lines.push('str[' + i + '] = "' + escape(strings[i]) + '"');
    }
  }

  return lines.join('\n');
}

function formatInstr(ins) {
  const op = ins.op;
  const spec = ARG_SPEC[op] || [];
  const args = ins.args.map((a, i) => {
    if (spec[i] === 'l' && typeof a === 'string' && a.startsWith('@')) {
      return '.L_' + a.slice(1);
    }
    return a;
  });
  const opStr = op.padEnd(9);
  return args.length ? opStr + args.join(', ') : opStr.trimEnd();
}

function escape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          .replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
}