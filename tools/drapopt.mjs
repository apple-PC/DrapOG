#!/usr/bin/env node
/**
 * @file        tools/drapopt.mjs
 * @summary     DrapLang 优化器 CLI（工程化-M5 前端）
 * @description 编译源程序并施加优化（常量折叠 + 死代码消除），报告指令数变化；可选 -o 导出 .dbyte。
 * 用法：
 *   node tools/drapopt.mjs prog.drap                # 仅报告优化前后指令数
 *   node tools/drapopt.mjs prog.drap -o out.dbyte   # 导出优化后的 .dbyte
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DrapCC } from '../src/drapcc.js';
import { optimize, stats } from '../src/drapopt.js';
import { pack } from '../src/drapog.dbyte.js';

const args = process.argv.slice(2);
let inFile = null, outFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o') outFile = args[++i];
  else if (!inFile) inFile = args[i];
}
if (!inFile) { console.error('用法: node tools/drapopt.mjs <prog.drap> [-o <out.dbyte>]'); process.exit(1); }

let src;
try { src = readFileSync(inFile, 'utf8'); }
catch { console.error('无法读取: ' + inFile); process.exit(1); }

const base = new DrapCC(src, { debug: true }).compile();
const opt = optimize(base);
const sb = stats(base), so = stats(opt);
console.log(`指令数: ${sb.count} → ${so.count}（减少 ${sb.count - so.count}）`);

if (outFile) {
  writeFileSync(outFile, pack(opt));
  console.log(`已写出优化后的 .dbyte: ${outFile}`);
}
