/**
 * @file        tests/test_drapdebug.mjs
 * @summary     工程化-M3：DrapDebugger 单元测试
 * @description 覆盖行断点、run/cont/step、局部变量读取、源码上下文、调用栈、含函数调用的嵌套帧。
 */
import { DrapDebugger } from '../src/drapdebug.js';
import { VM } from '../src/drapog.vm.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); failures++; }
  else console.log('  ✓ ' + msg);
}

const LOOP = `entry fn main()->i32 {
  let sum = 0
  let i = 0
  while (i < 3) {
    let t = i + 1
    sum = sum + t
    i = i + 1
  }
  return sum
}
`;

const CALL = `fn add(a:i32, b:i32)->i32 {
  let r = a + b
  return r
}
entry fn main()->i32 {
  let x = 3
  let y = 4
  let z = add(x, y)
  return z
}
`;

console.log('== 1. 行断点设置（有效/无效行）==');
{
  const dbg = new DrapDebugger(LOOP, {});
  assert(dbg.setBreakpointLine(6) === true, 'line 6 可设断点');
  assert(dbg.setBreakpointLine(99) === false, 'line 99 无效（无代码）返回 false');
  assert(JSON.stringify(dbg.listBreakpoints()) === '[6]', '断点列表 = [6]');
  dbg.clearBreakpointLine(6);
  assert(JSON.stringify(dbg.listBreakpoints()) === '[]', '清除后断点列表为空');
}

console.log('== 2. run 命中断点 + 局部变量读取 ==');
{
  const dbg = new DrapDebugger(LOOP, {});
  dbg.setBreakpointLine(6);
  dbg.start();
  await dbg.run();
  assert(dbg.vm.paused === true, 'run 后在断点暂停');
  assert(dbg.vm._stopReason === 'breakpoint', 'stopReason = breakpoint');
  const loc = dbg.inspectLocals();
  assert(loc.sum === 0 && loc.i === 0 && loc.t === 1, 'hit1 局部变量 sum=0,i=0,t=1');
}

console.log('== 3. cont 推进到下一轮迭代 ==');
{
  const dbg = new DrapDebugger(LOOP, {});
  dbg.setBreakpointLine(6);
  dbg.start();
  await dbg.run();
  await dbg.cont();
  const loc2 = dbg.inspectLocals();
  assert(loc2.i === 1 && loc2.t === 2 && loc2.sum === 1, 'hit2 i=1,t=2,sum=1（迭代已推进）');
  await dbg.cont();
  const loc3 = dbg.inspectLocals();
  assert(loc3.i === 2 && loc3.sum === 3, 'hit3 i=2,sum=3');
  await dbg.cont();
  assert(dbg.vm.halted === true, '继续后程序停机');
  assert(dbg.vm.regs[0] === 6, '返回值 = 6（1+2+3）');
}

console.log('== 4. step 单步推进一条真实指令 ==');
{
  const dbg = new DrapDebugger(LOOP, {});
  dbg.start();
  await dbg.step();           // 执行 main 入口后第一条（含 LABEL 跳过）
  assert(dbg.vm.paused === true, 'step 后暂停');
  assert(dbg.vm._stopReason === 'step', 'stopReason = step');
  // 持续单步直到停机
  let guard = 0;
  while (!dbg.vm.halted && guard++ < 500) await dbg.step();
  assert(dbg.vm.halted === true, '持续 step 最终停机');
}

console.log('== 5. 源码上下文带断点/当前行标记 ==');
{
  const dbg = new DrapDebugger(LOOP, {});
  dbg.setBreakpointLine(6);
  dbg.start();
  await dbg.run();
  const src = dbg.listSource();
  assert(/●/.test(src), '源码上下文含断点标记 ●');
  assert(/→/.test(src), '源码上下文含当前行箭头 →');
  assert(/6:/.test(src), '源码上下文含第 6 行');
}

console.log('== 6. 调用栈 + 嵌套帧局部变量 ==');
{
  const dbg = new DrapDebugger(CALL, {});
  // 在 add 的返回前（line 3）设断点
  assert(dbg.setBreakpointLine(3) === true, 'add 内 line 3 可设断点');
  dbg.start();
  await dbg.run();
  assert(dbg.vm.paused === true, '命中 add 内断点');
  const fn = dbg.currentFunction();
  assert(fn === 'add', '当前函数为 add（step-into 进入被调）');
  const loc = dbg.inspectLocals();
  assert(loc.a === 3 && loc.b === 4 && loc.r === 7, 'add 帧局部 a=3,b=4,r=7');
  const bt = dbg.vm.callStack.map(f => f.fn);
  assert(bt.includes('main') && bt.includes('add'), '调用栈含 main 与 add');
}

console.log('== 7. 无断点 run 直接跑到停机（向后兼容）==');
{
  const dbg = new DrapDebugger(LOOP, {});
  dbg.start();
  await dbg.run();
  assert(dbg.vm.halted === true, '无断点时 run 直接停机');
  assert(dbg.vm.regs[0] === 6, '无断点返回值仍为 6');
}

console.log('');
if (failures > 0) { console.error(`M3 测试失败：${failures} 项`); process.exit(1); }
else console.log('✅ M3 全部测试通过');
