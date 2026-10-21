/**
 * @file        tests/test_drapld.mjs
 * @summary     工程化-M4：DrapLD 链接器 + .dbyte 运行器
 * @description 覆盖：多模块链接成单一 .dbyte、.dbyte 经 unpack→VM 运行行为正确、CLI 端到端（drapld 产文件 + run_dbyte 运行）。
 */
import { DrapCC } from '../src/drapcc.js';
import { pack, unpack } from '../src/drapog.dbyte.js';
import { VM } from '../src/drapog.vm.js';
import { DrapSYS } from '../src/drapog.sys.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); failures++; }
  else console.log('  ✓ ' + msg);
}

const UTILS = `fn square(x: i32) -> i32 { return x * x }
fn add(a: i32, b: i32) -> i32 { return a + b }
`;
const MAIN = `import "utils"
entry fn main() -> i32 {
  let r = add(square(3), square(4))
  term_print(r)
  term_print(" done")
  return 0
}
`;

// 直接运行（内存）作为基准。onOutput 传的是累计全串，这里只取增量避免重复。
async function runInMemory(source, modules) {
  const out = [];
  let last = 0;
  const sys = new DrapSYS({ onRead: async () => '' });
  const vm = new VM();
  vm.out = ''; vm.onOutput = (s) => { if (s.length > last) { out.push(s.slice(last)); last = s.length; } };
  const prog = new DrapCC(source, { modules, debug: true }).compile();
  vm.load(prog); vm.sys = sys; sys.vm = vm;
  await vm.run();
  return out.join('');
}

// 经 .dbyte 打包/解包后运行
async function runViaDbyte(source, modules) {
  const out = [];
  let last = 0;
  const sys = new DrapSYS({ onRead: async () => '' });
  const vm = new VM();
  vm.out = ''; vm.onOutput = (s) => { if (s.length > last) { out.push(s.slice(last)); last = s.length; } };
  const prog = new DrapCC(source, { modules, debug: true }).compile();
  const loaded = unpack(pack(prog));
  vm.load(loaded); vm.sys = sys; sys.vm = vm;
  await vm.run();
  return out.join('');
}

console.log('== 1. .dbyte 往返运行行为 ==');
{
  const mem = await runInMemory(MAIN, { utils: UTILS });
  const via = await runViaDbyte(MAIN, { utils: UTILS });
  assert(mem === '25 done', '内存运行输出 = "25 done"');
  assert(via === mem, '.dbyte 打包/解包后运行输出与内存一致（链接产物可运行）');
}

console.log('== 2. 打包/解包行为保持（LABEL→@N 设计 + 运行正确）==');
{
  const prog = new DrapCC(MAIN, { modules: { utils: UTILS }, debug: true }).compile();
  const loaded = unpack(pack(prog));
  // pack 故意把 LABEL 压成 @N 数字下标、unpack 不再还原 LABEL（VM 经 _label('@N') 解析）→ 指令流无 LABEL
  const hasLabel = loaded.instructions.some(i => i.op === 'LABEL');
  assert(!hasLabel, 'unpacked 指令流不含 LABEL（LABEL 已序列化为 @N 下标，VM 用 _label 解析）');
  // 行为保持：运行结果正确
  const out = await runViaDbyte(MAIN, { utils: UTILS });
  assert(out === '25 done', 'unpacked 运行输出仍为 "25 done"（行为保持）');
}

console.log('== 3. 嵌套模块 import 链接 + 运行 ==');
{
  const B = `fn leaf() -> i32 { return 7 }`;
  const A = `import "b"
fn mid() -> i32 { return leaf() + 10 }`;
  const M = `import "a"
entry fn main() -> i32 { let z = mid(); term_print(z); return 0 }`;
  const out = await runViaDbyte(M, { a: A, b: B });
  assert(out === '17', '嵌套模块 mid=leaf+10=17，输出 "17"');
}

console.log('== 4. CLI 端到端：drapld 链接 + run_dbyte 运行 ==');
{
  const tmp = resolve('tests/.tmp_ld');
  mkdirSync(tmp, { recursive: true });
  writeFileSync(tmp + '/utils.drap', UTILS);
  writeFileSync(tmp + '/main.drap', MAIN);
  const outDbyte = tmp + '/out.dbyte';
  execFileSync('node', ['tools/drapld.mjs', tmp + '/main.drap', '-m', tmp + '/utils.drap', '-o', outDbyte]);
  assert(readFileSync(outDbyte).length > 0, 'drapld 产出非空 .dbyte 文件');
  const runOut = execFileSync('node', ['tools/run_dbyte.mjs', outDbyte], { encoding: 'utf8' });
  assert(runOut === '25 done', 'run_dbyte 运行产出 "25 done"');
  rmSync(tmp, { recursive: true, force: true });
}

console.log('== 5. 缺失模块引用应在编译期报错 ==');
{
  let threw = false;
  try { new DrapCC(MAIN, { modules: {}, debug: true }).compile(); }
  catch { threw = true; }
  assert(threw, 'import 未提供的模块名 → 编译错误');
}

console.log('');
if (failures > 0) { console.error(`M4 测试失败：${failures} 项`); process.exit(1); }
else console.log('✅ M4 全部测试通过');
