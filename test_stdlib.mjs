/**
 * test_stdlib.mjs —— DrapLang 标准库 / import 模块 / 编译器行号诊断
 */
import { DrapCC } from './drapcc.js';
import { VM } from './drapog.vm.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log('  ✗ ' + msg); }
}

async function runDrap(src) {
  const { instructions, strings } = new DrapCC(src).compile();
  const vm = new VM({ instructions, strings });
  await vm.run();
  return vm;
}

// 运行并捕获输出字符串（term_print 走 PRINTSTR 写 vm.out）
async function runOut(src) {
  return (await runDrap(src)).out;
}

async function main() {
  console.log('— DrapLang 标准库 / import / 诊断 —');

  // 1) core 自带（无需 import）
  assert((await runDrap('entry fn main()->i32 { return atoi("42") }')).regs[0] === 42, 'core: atoi("42")=42');
  assert((await runDrap('entry fn main()->i32 { return atoi("-5") }')).regs[0] === -5, 'core: atoi("-5")=-5');
  assert((await runDrap('entry fn main()->i32 { let s="abc"; return len(s) }')).regs[0] === 3, 'core: len("abc")=3（原内建仍可用）');

  // 2) import math
  assert((await runDrap('import math\nentry fn main()->i32 { return abs(-7) }')).regs[0] === 7, 'math: abs(-7)=7');
  assert((await runDrap('import math\nentry fn main()->i32 { return min(3,7) }')).regs[0] === 3, 'math: min(3,7)=3');
  assert((await runDrap('import math\nentry fn main()->i32 { return max(-5,2) }')).regs[0] === 2, 'math: max(-5,2)=2');
  assert((await runDrap('import math\nentry fn main()->i32 { return sqrt(16) }')).regs[0] === 4, 'math: sqrt(16)=4');
  assert((await runDrap('import math\nentry fn main()->i32 { return pow(2,10) }')).regs[0] === 1024, 'math: pow(2,10)=1024');
  assert((await runDrap('import math\nentry fn main()->i32 { return round(sqrt(9)) }')).regs[0] === 3, 'math: round(sqrt(9))=3（浮点值）');
  assert((await runDrap('import math\nentry fn main()->i32 { return floor(sqrt(10)) }')).regs[0] === 3, 'math: floor(sqrt(10))=3');
  assert((await runDrap('import math\nentry fn main()->i32 { return ceil(sqrt(8)) }')).regs[0] === 3, 'math: ceil(sqrt(8))=3');
  assert((await runDrap('import math\nentry fn main()->i32 { return clamp(15,0,10) }')).regs[0] === 10, 'math: clamp(15,0,10)=10');
  {
    const r = (await runDrap('import math\nentry fn main()->i32 { return rand() }')).regs[0];
    assert(r >= 0 && r < 32768, 'math: rand() 落在 [0,32768)');
  }

  // 3) import str（返回字符串的 builtin 经 term_print 验证）
  assert((await runOut('import str\nentry fn main()->i32 { term_print(toUpper("ab")); return 0 }')) === 'AB', 'str: toUpper("ab")="AB"');
  assert((await runOut('import str\nentry fn main()->i32 { term_print(toLower("AB")); return 0 }')) === 'ab', 'str: toLower("AB")="ab"');
  assert((await runOut('import str\nentry fn main()->i32 { term_print(trim("  x  ")); return 0 }')) === 'x', 'str: trim("  x  ")="x"');
  assert((await runDrap('import str\nentry fn main()->i32 { return contains("hello","ell") }')).regs[0] === 1, 'str: contains("hello","ell")=1');
  assert((await runDrap('import str\nentry fn main()->i32 { return contains("hello","xyz") }')).regs[0] === 0, 'str: contains("hello","xyz")=0');
  assert((await runDrap('import str\nentry fn main()->i32 { return indexOf("hello","ll") }')).regs[0] === 2, 'str: indexOf("hello","ll")=2');
  assert((await runDrap('import str\nentry fn main()->i32 { return indexOf("hello","z") }')).regs[0] === -1, 'str: indexOf("hello","z")=-1');
  assert((await runDrap('import str\nentry fn main()->i32 { return startsWith("hello","he") }')).regs[0] === 1, 'str: startsWith("hello","he")=1');
  assert((await runDrap('import str\nentry fn main()->i32 { return endsWith("hello","lo") }')).regs[0] === 1, 'str: endsWith("hello","lo")=1');
  assert((await runOut('import str\nentry fn main()->i32 { term_print(repeat("ab",3)); return 0 }')) === 'ababab', 'str: repeat("ab",3)="ababab"');

  // 4) 模块门禁：未 import 不能直接用 math/str 内建
  {
    let ok = false;
    try { new DrapCC('entry fn main()->i32 { return sqrt(9) }').compile(); }
    catch (e) { ok = /import math/.test(e.message); }
    assert(ok, '门禁: 未 import math 用 sqrt 编译报错');
  }
  {
    let ok = false;
    try { new DrapCC('entry fn main()->i32 { term_print(toUpper("x")); return 0 }').compile(); }
    catch (e) { ok = /import str/.test(e.message); }
    assert(ok, '门禁: 未 import str 用 toUpper 编译报错');
  }

  // 5) import 未知模块报错
  {
    let ok = false;
    try { new DrapCC('import foo\nentry fn main()->i32 { return 0 }').compile(); }
    catch (e) { ok = /未知模块/.test(e.message); }
    assert(ok, 'import 未知模块报错');
  }

  // 6) 编译器行号诊断
  {
    let ok = false;
    try { new DrapCC('entry fn main()->i32 {\n  let x = 1\n  let y = @\n}').compile(); }
    catch (e) { ok = /行 3/.test(e.message); }
    assert(ok, '诊断: 行 3 的词法错误带行号（行 3：...）');
  }
  {
    let ok = false;
    try { new DrapCC('entry fn main()->i32 {\n  let @ = 1\n}').compile(); }
    catch (e) { ok = /行 2/.test(e.message); }
    assert(ok, '诊断: 行 2 的语法错误带行号');
  }

  console.log(`标准库/import/诊断：${passed} 通过，${failed} 失败`);
  if (failed > 0) { console.log('存在失败用例'); process.exit(1); }
  else console.log('✓ 全部通过');
}

main().catch(e => { console.error('测试运行异常:', e); process.exit(1); });
