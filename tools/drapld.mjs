#!/usr/bin/env node
/**
 * @file        tools/drapld.mjs
 * @summary     DrapLang 链接器（工程化-M4）
 * @description 把「主程序 + 多个模块源文件」链接成单一可分发 .dbyte 可执行。
 *   模块解析复用 DrapCC 的 files 级 import 机制（import "name" 引用 -m 提供的模块），
 *   但本工具把它们从独立文件聚合成一个 .dbyte 产物，是面向分发的「链接」步骤。
 * 用法：
 *   node tools/drapld.mjs main.drap -m utils.drap -m helper.drap -o out.dbyte
 *   node tools/drapld.mjs main.drap -m utils=./lib/utils.drap -o out.dbyte   # 显式指定模块名
 * 之后用：node tools/run_dbyte.mjs out.dbyte   运行
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DrapCC } from '../src/drapcc.js';
import { pack } from '../src/drapog.dbyte.js';

function usage() {
  console.error('用法: node tools/drapld.mjs <main.drap> -m <mod.drap> [-m <name>=<mod.drap> ...] -o <out.dbyte>');
  process.exit(1);
}

const args = process.argv.slice(2);
let mainFile = null;
const modules = {};
let outFile = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-m') {
    const spec = args[++i];
    if (!spec) usage();
    const eq = spec.indexOf('=');
    let name, path;
    if (eq >= 0) { name = spec.slice(0, eq); path = spec.slice(eq + 1); }
    else { path = spec; name = spec.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, ''); }
    modules[name] = path;
  } else if (a === '-o') {
    outFile = args[++i];
  } else if (!mainFile) {
    mainFile = a;
  } else {
    console.error('多余参数: ' + a);
    usage();
  }
}

if (!mainFile || !outFile) usage();

let mainSrc;
try { mainSrc = readFileSync(mainFile, 'utf8'); }
catch { console.error('无法读取主程序: ' + mainFile); process.exit(1); }

const moduleSources = {};
for (const [name, path] of Object.entries(modules)) {
  try { moduleSources[name] = readFileSync(path, 'utf8'); }
  catch { console.error('无法读取模块 ' + name + ': ' + path); process.exit(1); }
}

// 链接：以主程序为入口，把模块源提供给编译器，编译成单一 program，再打包为 .dbyte
const program = new DrapCC(mainSrc, { modules: moduleSources, debug: true }).compile();
const bytes = pack(program);
writeFileSync(outFile, bytes);
console.log(`已链接 ${Object.keys(moduleSources).length} 个模块 → ${outFile}（${bytes.length} 字节）`);
