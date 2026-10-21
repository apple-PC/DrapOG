// 检查 DrapLang 语言特性的完备性与正确性（无需宿主 syscall，直接 return 数值）
// 覆盖：struct/member、array index/push/len、string index/substr/len、split、
//       &&/|| 短路、continue、字符串比较、嵌套 while
import { VM } from '../src/drapog.vm.js';
import { DrapCC } from '../src/drapcc.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}

async function runDrap(src) {
  const program = new DrapCC(src).compile();
  const vm = new VM();
  vm.load(program);
  await vm.run();
  return vm.regs[0];
}

const wrap = (body) => 'entry fn main() -> i32 {\n' + body + '\n  return 0\n}\n';

(async () => {
  console.log('== 1. struct / member ==');
  {
    const src = `struct Point {
  x: i32,
  y: i32
}
entry fn main() -> i32 {
  let p = Point{ x: 3, y: 4 }
  return p.x + p.y
}`;
    assert((await runDrap(src)) === 7, 'struct 字面量 + 成员访问：3+4=7');
  }
  {
    // 修改字段后读取
    const src = `struct Point {
  x: i32,
  y: i32
}
entry fn main() -> i32 {
  let p = Point{ x: 1, y: 1 }
  p.x = 5
  return p.x * 10 + p.y
}`;
    assert((await runDrap(src)) === 51, 'struct 字段修改：5*10+1=51');
  }
  {
    // 成员复合赋值
    const src = `struct Point {
  x: i32,
  y: i32
}
entry fn main() -> i32 {
  let p = Point{ x: 1, y: 1 }
  p.x += 2
  return p.x * 10 + p.y
}`;
    assert((await runDrap(src)) === 31, 'struct 成员复合赋值：3*10+1=31');
  }

  console.log('== 2. array index / len / push ==');
  {
    const src = `entry fn main() -> i32 {
  let a = [10, 20, 30]
  return a[1] + len(a)
}`;
    assert((await runDrap(src)) === 23, '数组索引 + len：20+3=23');
  }
  {
    const src = `entry fn main() -> i32 {
  let a = [1, 2]
  a.push(9)
  return len(a) * 100 + a[2]
}`;
    assert((await runDrap(src)) === 309, '数组 push + 新元素：len=3, a[2]=9 → 3*100+9=309');
  }
  {
    const src = `entry fn main() -> i32 {
  let a = [10, 20, 30]
  a[1] = 99
  a[0] = 5
  return a[0] * 1000 + a[1] + a[2]
}`;
    assert((await runDrap(src)) === 5129, '数组元素赋值：5*1000+99+30=5129');
  }
  {
    const src = `entry fn main() -> i32 {
  let a = [5, 5, 5, 5]
  let i = 0
  let s = 0
  while (i < len(a)) { s = s + a[i]; i = i + 1 }
  return s
}`;
    assert((await runDrap(src)) === 20, '遍历数组求和：5*4=20');
  }

  console.log('== 3. string index / substr / len ==');
  {
    const src = `entry fn main() -> i32 {
  let c = "abc"[1]
  return c
}`;
    assert((await runDrap(src)) === 98, '字符串索引 s[1] = "b" 码点 98');
  }
  {
    const src = `entry fn main() -> i32 {
  return len(substr("hello", 1))
}`;
    assert((await runDrap(src)) === 4, 'substr("hello",1)="ello" 长度 4');
  }
  {
    const src = `entry fn main() -> i32 {
  return len("DrapOG")
}`;
    assert((await runDrap(src)) === 6, '字符串 len："DrapOG"=6');
  }
  {
    const src = `entry fn main() -> i32 {
  if ("ab" == "ab") { return 1 } else { return 0 }
}`;
    assert((await runDrap(src)) === 1, '字符串相等比较 "ab"=="ab"');
  }

  console.log('== 4. split ==');
  {
    const src = `entry fn main() -> i32 {
  return len(split("a,b,c", ","))
}`;
    assert((await runDrap(src)) === 3, 'split("a,b,c",",") 长度 3');
  }
  {
    const src = `entry fn main() -> i32 {
  let toks = split("x-y-z", "-")
  return len(toks)
}`;
    assert((await runDrap(src)) === 3, 'split 用 "-" 分隔 长度 3');
  }

  console.log('== 5. && / || 短路 ==');
  {
    const src = `entry fn main() -> i32 {
  if (1 == 1 && 2 == 2) { return 7 } else { return 0 }
}`;
    assert((await runDrap(src)) === 7, '&& 两侧真 → 7');
  }
  {
    const src = `entry fn main() -> i32 {
  if (1 == 0 || 2 == 2) { return 9 } else { return 0 }
}`;
    assert((await runDrap(src)) === 9, '|| 一侧真 → 9');
  }
  {
    // 短路：左假时右操作数不应被求值（用「除以零」陷阱验证，若求值得抛错）
    const src = `entry fn main() -> i32 {
  if (1 == 0 && (2 / 0 == 1)) { return 7 } else { return 0 }
}`;
    assert((await runDrap(src)) === 0, '&& 短路：左假，右「除以零」不被求值，返回 0');
  }
  {
    // 短路：左真时右操作数不应被求值（||）
    const src = `entry fn main() -> i32 {
  if (1 == 1 || (2 / 0 == 1)) { return 9 } else { return 0 }
}`;
    assert((await runDrap(src)) === 9, '|| 短路：左真，右「除以零」不被求值，返回 9');
  }

  console.log('== 6. continue ==');
  {
    const src = `entry fn main() -> i32 {
  let s = 0
  let i = 0
  while (i < 5) {
    i = i + 1
    if (i == 3) { continue }
    s = s + i
  }
  return s
}`;
    assert((await runDrap(src)) === 12, 'continue 跳过 i=3：1+2+4+5=12');
  }

  console.log('== 7. 嵌套 while + 算术 ==');
  {
    const src = `entry fn main() -> i32 {
  let s = 0
  let i = 0
  while (i < 3) {
    let j = 0
    while (j < 4) {
      s = s + (i * 10 + j)
      j = j + 1
    }
    i = i + 1
  }
  return s
}`;
    // 0+1+2+3 + 10+11+12+13 + 20+21+22+23 = 6 + 46 + 86 = 138
    assert((await runDrap(src)) === 138, '嵌套 while 求和 = 138');
  }

  console.log('');
  if (failures === 0) console.log('DrapLang 特性检查全部通过 ✓');
  else console.log(failures + ' 项失败 ✗');
  process.exit(failures === 0 ? 0 : 1);
})();
