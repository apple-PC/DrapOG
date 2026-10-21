/**
 * @file        tests/test_opt.mjs
 * @summary     工程化-M5：优化器（常量折叠 + 死代码消除）
 * @description 核心性质：优化后程序运行输出与未优化版逐字节一致（语义保持）；
 *   并覆盖若干常量密集程序，确认折叠不引入错误；优化幂等。
 */
import { DrapCC } from '../src/drapcc.js';
import { optimize } from '../src/drapopt.js';
import { VM } from '../src/drapog.vm.js';
import { DrapSYS } from '../src/drapog.sys.js';
import { pack, unpack } from '../src/drapog.dbyte.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); failures++; }
  else console.log('  ✓ ' + msg);
}

async function run(p) {
  const out = []; let last = 0;
  const sys = new DrapSYS({ onRead: async () => '' });
  const vm = new VM();
  vm.out = ''; vm.onOutput = (s) => { if (s.length > last) { out.push(s.slice(last)); last = s.length; } };
  vm.load(p); vm.sys = sys; sys.vm = vm;
  await vm.run();
  return out.join('');
}

// 一组语义保持用例：base 与 opt 输出必须一致
const CASES = [
  `entry fn main() -> i32 { let x = (2+3)*4 - 1; term_print(x); return 0 }`,
  `fn sq(x: i32) -> i32 { return x * x }
entry fn main() -> i32 { let a = 3 + 4 * 2; let b = (10 - 2) / 2; let c = a + b; let d = sq(5); term_print(c); term_print(" "); term_print(d); return 0 }`,
  `entry fn main() -> i32 { let x = 7; let y = x * 0 + 9; term_print(y); return 0 }`,
  `entry fn main() -> i32 { if (1 + 1 < 5 - 1) { term_print(1) } else { term_print(0) } return 0 }`,
  `fn f(a:i32,b:i32)->i32 { return a * b + 1 }
entry fn main() -> i32 { let r = f(2, 3) + 10; term_print(r); return 0 }`,
  // 含字符串与 syscall，确保优化不破坏非纯指令
  `entry fn main() -> i32 { let n = 2 * 3; term_print(n); term_print(" ok"); return 0 }`,
];

console.log('== 1. 语义保持：优化前后输出一致 ==');
for (let i = 0; i < CASES.length; i++) {
  const base = new DrapCC(CASES[i], { debug: true }).compile();
  const opt = optimize(base);
  const ob = await run(base), oo = await run(opt);
  assert(ob === oo, `用例 #${i + 1} 优化前后输出一致（"${ob}"）`);
}

console.log('== 2. .dbyte 往返 + 优化后运行一致 ==');
{
  const base = new DrapCC(CASES[1], { debug: true }).compile();
  const opt = optimize(base);
  const via = unpack(pack(opt));
  const oo = await run(via);
  const ob = await run(opt);
  assert(oo === ob, '.dbyte 打包/解包后运行与内存优化版一致');
}

console.log('== 3. 优化幂等（再优化无变化且仍正确）==');
{
  const base = new DrapCC(CASES[1], { debug: true }).compile();
  const opt1 = optimize(base);
  const opt2 = optimize(opt1);
  const o1 = await run(opt1), o2 = await run(opt2);
  assert(o1 === o2, '二次优化输出一致');
}

console.log('== 4. 优化对含调用/CALL 的程序安全（CALL 后常量未知不被误折叠）==');
{
  const SRC = `fn g()->i32 { return 5 }
entry fn main() -> i32 { let a = 2 + 3; let b = g(); let c = a + b; term_print(c); return 0 }`;
  const base = new DrapCC(SRC, { debug: true }).compile();
  const opt = optimize(base);
  const ob = await run(base), oo = await run(opt);
  assert(ob === oo && ob === '10', 'a=5,b=5,c=10，优化前后均为 "10"');
}

console.log('');
if (failures > 0) { console.error(`M5 测试失败：${failures} 项`); process.exit(1); }
else console.log('✅ M5 全部测试通过');
