// test_struct.mjs —— DrapLang struct + 方法（语言地基第一批）
// 覆盖：结构体声明/字面量/字段读、字段写、复合赋值、方法(接收者)声明与调用、
//       方法改字段(引用语义)、嵌套 struct、struct 含数组字段(push/len)、方法返回 str。
import { DrapCC } from './drapcc.js';
import { VM } from './drapog.vm.js';

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  ✗ ' + msg); } }
async function runDrap(src) { const { instructions, strings } = new DrapCC(src).compile(); const vm = new VM({ instructions, strings }); await vm.run(); return vm; }
async function runOut(src) { return (await runDrap(src)).out; }

async function main() {
  console.log('— DrapLang struct + 方法 —');

  assert((await runDrap('struct P { x: i32, y: i32 }\nentry fn main()->i32 { let p = P { x: 3, y: 4 }\n  return p.x + p.y }')).regs[0] === 7, '字段读：p.x+p.y=7');
  assert((await runDrap('struct P { x: i32, y: i32 }\nentry fn main()->i32 { let p = P { x: 3, y: 4 }\n  p.x = 10\n  return p.x + p.y }')).regs[0] === 14, '字段写：p.x=10 → 14');
  assert((await runDrap('struct C { n: i32 }\nentry fn main()->i32 { let c = C { n: 5 }\n  c.n += 3\n  return c.n }')).regs[0] === 8, '复合赋值：c.n += 3 → 8');

  assert((await runDrap('struct P { x: i32, y: i32 }\nfn (s: P) sum() -> i32 { return s.x + s.y }\nentry fn main()->i32 { let p = P { x: 3, y: 4 }\n  return p.sum() }')).regs[0] === 7, '方法：p.sum()=7');
  assert((await runDrap('struct P { x: i32, y: i32 }\nfn (s: P) ax2() -> i32 { return s.x * 2 }\nentry fn main()->i32 { let p = P { x: 21, y: 0 }\n  return p.ax2() }')).regs[0] === 42, '方法带返回：p.ax2()=42');
  assert((await runDrap('struct P { x: i32, y: i32 }\nfn (s: P) moveBy(dx: i32, dy: i32) { s.x = s.x + dx\n  s.y = s.y + dy }\nentry fn main()->i32 { let p = P { x: 1, y: 1 }\n  p.moveBy(2, 3)\n  return p.x * 10 + p.y }')).regs[0] === 34, '方法改字段(引用)：moveBy(2,3) → 34');

  assert((await runDrap('struct P { x: i32, y: i32 }\nstruct L { a: P, b: P }\nentry fn main()->i32 { let l = L { a: P { x: 1, y: 2 }, b: P { x: 3, y: 4 } }\n  return l.a.x + l.b.y }')).regs[0] === 5, '嵌套 struct：l.a.x + l.b.y = 5');

  assert((await runDrap('struct D { lines: [str], count: i32 }\nentry fn main()->i32 { let d = D { lines: [], count: 0 }\n  d.lines.push("hello")\n  d.lines.push("world")\n  d.count = d.lines.len\n  return d.count }')).regs[0] === 2, 'struct 数组字段：push×2 + len = 2');

  assert((await runOut('struct B { label: str }\nfn (b: B) get() -> str { return b.label }\nentry fn main()->i32 { let b = B { label: "hi" }\n  term_print(b.get())\n  return 0 }')) === 'hi', '方法返回 str：b.get()="hi"');

  // 方法可作普通函数调用（接收者显式传）
  assert((await runDrap('struct P { x: i32, y: i32 }\nfn (s: P) sum() -> i32 { return s.x + s.y }\nentry fn main()->i32 { let p = P { x: 8, y: 9 }\n  return sum(p) }')).regs[0] === 17, '方法亦可作函数调用：sum(p)=17');

  // 编译期错误：未知字段
  { let ok = false; try { new DrapCC('struct P { x: i32 }\nentry fn main()->i32 { let p = P { x: 1 }\n  return p.z }').compile(); } catch (e) { ok = /未知字段/.test(e.message); } assert(ok, '诊断：未知字段报错'); }
  // 编译期错误：未知方法
  { let ok = false; try { new DrapCC('struct P { x: i32 }\nentry fn main()->i32 { let p = P { x: 1 }\n  return p.nope() }').compile(); } catch (e) { ok = /未知方法/.test(e.message); } assert(ok, '诊断：未知方法报错'); }

  console.log(`struct/方法：${passed} 通过，${failed} 失败`);
  if (failed > 0) { console.log('存在失败用例'); process.exit(1); } else console.log('✓ 全部通过');
}
main().catch(e => { console.error('测试运行异常:', e); process.exit(1); });
