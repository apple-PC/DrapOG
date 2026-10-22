/**
 * @file        tests/test_examples.mjs
 * @module      tests
 * @summary     全仓库 DrapLang 源文件「无损往返」校验（工程化-M6）
 * @description 遍历仓库内所有真实可编译的 .drapp 源文件（examples 目录、System/Apps 下各 app 的
 *   main.drapp、Users/guest 下的 .drapp，排除 _template.app 占位模板），对每个源做：
 *     编译 → pack → unpack → pack
 *   断言两次 pack 的字节完全一致（DBYTE 序列化确定性，unpack 不丢不改任何可观察信息）。
 *   这把项目硬约束「.drap → .dbyte → .dasm → .dbyte 字节一致」扩展到整个应用语料库，
 *   纳入 `npm test` 常规回归，任何破坏往返的改动都会在此暴露。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { DrapCC } from '../src/drapcc.js';
import { pack, unpack } from '../src/drapog.dbyte.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const failures = [];

// 收集所有待校验源文件
function collectSources() {
  const out = [];
  // examples/
  for (const f of readdirSync(resolve(ROOT, 'examples'))) {
    if (f.endsWith('.drapp')) out.push(resolve(ROOT, 'examples', f));
  }
  // System/Apps/*/main.drapp（排除 _template.app 占位模板）
  for (const d of readdirSync(resolve(ROOT, 'System/Apps'))) {
    if (d === '_template.app') continue;
    const p = resolve(ROOT, 'System/Apps', d, 'main.drapp');
    try { readFileSync(p); out.push(p); } catch { /* 无 main.drapp，跳过 */ }
  }
  // Users/guest/*.drapp
  try {
    for (const f of readdirSync(resolve(ROOT, 'Users/guest'))) {
      if (f.endsWith('.drapp')) out.push(resolve(ROOT, 'Users/guest', f));
    }
  } catch { /* 无目录，跳过 */ }
  return out;
}

// 收集同目录下的兄弟 .drapp 作为模块源（供 import "name" 解析）
function collectModules(mainPath) {
  const dir = dirname(mainPath);
  const mods = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.drapp') || resolve(dir, f) === mainPath) continue;
    const stem = f.replace(/\.drapp$/, '');
    mods[stem] = readFileSync(resolve(dir, f), 'utf8');
  }
  return mods;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function assert(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
}

const sources = collectSources();
assert(sources.length >= 10, `语料库规模应 >= 10（实际 ${sources.length}）`);

for (const srcPath of sources) {
  const rel = srcPath.replace(ROOT + '/', '');
  let source;
  try { source = readFileSync(srcPath, 'utf8'); }
  catch (e) { assert(false, `${rel}：无法读取 (${e.message})`); continue; }

  // 1) 编译（带兄弟模块）
  let program1;
  try {
    program1 = new DrapCC(source, { modules: collectModules(srcPath) }).compile();
  } catch (e) {
    assert(false, `${rel}：编译失败 (${e.message})`);
    continue;
  }
  assert(program1 && Array.isArray(program1.instructions) && program1.instructions.length > 0,
    `${rel}：编译产出空指令`);

  // 2) pack → unpack → pack 字节一致
  let bytes1, bytes2, program2;
  try {
    bytes1 = pack(program1);
    program2 = unpack(bytes1);
    bytes2 = pack(program2);
  } catch (e) {
    assert(false, `${rel}：往返异常 (${e.message})`);
    continue;
  }
  assert(bytesEqual(bytes1, bytes2),
    `${rel}：pack(unpack(pack)) 字节不一致（${bytes1.length} vs ${bytes2.length}）`);

  // 3) unpack 不丢「真实指令」（LABEL 在 pack 时被压平、unpack 不重建，故比对去 LABEL 后的条数）
  const flat1 = program1.instructions.filter(i => i.op !== 'LABEL').length;
  assert(program2.instructions.length === flat1,
    `${rel}：真实指令数在往返后变化（${flat1} → ${program2.instructions.length}）`);
  assert(JSON.stringify(program2.strings) === JSON.stringify(program1.strings),
    `${rel}：字符串表在往返后变化`);
  // 入口下标：pack 已支持显式数值 entry，re-pack 后应与首包一致（隐含在字节一致性里）
}

console.log(`全语料无损往返校验：覆盖 ${sources.length} 个源文件`);
if (fail) {
  console.log(`✗ ${fail} 项失败：`);
  for (const m of failures) console.log('   -', m);
} else {
  console.log('✓ 全部源文件 pack→unpack→pack 字节一致，编译均成功');
}

console.log(`\n通过 ${pass} / ${pass + fail}${fail ? '，有失败' : '，全部通过'}`);
process.exit(fail ? 1 : 0);
