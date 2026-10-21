/**
 * test_modules.mjs —— L4 验证：DrapLang 文件级模块 import
 *   - `import "utils"` 后可在主程序调用模块里的函数（编译产物出现 CALL <模块函数>）
 *   - 运行级：term_print(模块计算结果) 输出正确
 *   - 嵌套 import（main → a → b）按 BFS 解析
 *   - 引用未提供的模块名应报编译错误
 *   - 模块可返回字符串并被主程序通过 term_print 打印
 */
import assert from 'assert';
import { DrapCC } from '../src/drapcc.js';
import { runDrapCli } from '../src/drapog.launcher.js';

const UTILS = `
fn square(x: i32) -> i32 {
  return x * x
}
fn add(a: i32, b: i32) -> i32 {
  return a + b
}
`;
const MAIN = `
import "utils"
entry fn main() -> i32 {
  term_print(add(square(3), square(4)))
  return 0
}
`;

const B = `fn leaf() -> i32 { return 1 }`;
const A = `import "b"
fn mid() -> i32 { return leaf() + 10 }`;
const MAIN2 = `import "a"
entry fn main() -> i32 { term_print(mid()); return 0 }`;

const STRMOD = `fn greet() -> str { return "module-ok" }`;
const MAIN3 = `import "strmod"
entry fn main() -> i32 { term_print(greet()); return 0 }`;

let passed = 0;
function ok(cond, msg) { assert(cond, msg); console.log('  ✓ ' + msg); passed++; }

// 1) 编译产物包含对模块函数的 CALL
const prog = new DrapCC(MAIN, { modules: { utils: UTILS } }).compile();
ok(prog.instructions.some(i => i.op === 'CALL' && i.args[0] === 'add'), '主程序 CALL 模块函数 add');
ok(prog.instructions.some(i => i.op === 'CALL' && i.args[0] === 'square'), '主程序 CALL 模块函数 square');

async function run(source, modules) {
  const out = [];
  await runDrapCli(null, { print: s => out.push(s) }, source, { modules });
  return out.join('');
}

// 2) 运行级：模块计算结果被打印
const out = await run(MAIN, { utils: UTILS });
ok(out.includes('25'), '模块函数可调用：add(square(3), square(4)) = 25，输出含 "25" (' + JSON.stringify(out) + ')');

// 3) 嵌套 import
const prog2 = new DrapCC(MAIN2, { modules: { a: A, b: B } }).compile();
ok(prog2.instructions.some(i => i.op === 'CALL' && i.args[0] === 'mid'), '嵌套 import：主程序 CALL mid（来自模块 a）');
ok(prog2.instructions.some(i => i.op === 'CALL' && i.args[0] === 'leaf'), '嵌套 import：mid 内部 CALL leaf（来自模块 b）');
const out2 = await run(MAIN2, { a: A, b: B });
ok(out2.includes('11'), '嵌套 import 运行：mid() = leaf()+10 = 11 (' + JSON.stringify(out2) + ')');

// 4) 模块返回字符串
const out3 = await run(MAIN3, { strmod: STRMOD });
ok(out3.includes('module-ok'), '模块返回字符串可被 term_print 打印 (' + JSON.stringify(out3) + ')');

// 5) 引用未提供的模块名报编译错误
let threw = false;
try { new DrapCC('import "nope"\nentry fn main() -> i32 { return 0 }\n', {}).compile(); }
catch (e) { threw = true; }
ok(threw, 'import 未声明的模块名报编译错误');

console.log('\n[L4] DrapLang 文件级模块 import：全部通过 ✓ (' + passed + ' 项)');
process.exit(0);
