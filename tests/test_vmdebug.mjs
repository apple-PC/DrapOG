// test_vmdebug.mjs —— 验证 M2：VM 单步/断点支持（可恢复执行）
//   · 无断点时 run() 行为与旧版一致（跑到停机）
//   · 断点：run() 命中暂停，snapshot() 暴露 pc/regs/curLine，stopReason='breakpoint'
//   · resume()：从暂停点继续到停机（跳过当前 pc 断点一次，不重复触发）
//   · step()：逐条推进，curLine 跟随源码行（联动 M1 行号回填）
import { DrapCC } from '../src/drapcc.js';
import { VM } from '../src/drapog.vm.js';

let failures = 0;
function assert(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); failures++; } }

// 找某源码行对应的首个「真实指令」VM pc（VM pc 含 LABEL 下标，与执行一致）
function pcForLine(prog, line) {
  for (let i = 0; i < prog.instructions.length; i++) {
    const ins = prog.instructions[i];
    if (ins.op !== 'LABEL' && ins.line === line) return i;
  }
  return -1;
}

const SRC = `entry fn main()->i32 {
  let x = 5
  let y = x + 3
  let z = y * 2
  return z
}
`;

console.log('== 1. 无断点：run() 跑完（向后兼容）==');
{
  const prog = new DrapCC(SRC).compile();
  const vm = new VM();
  vm.load(prog);
  await vm.run();
  assert(vm.halted === true, '无断点时 run() 运行至停机');
  assert(vm.paused === false, '未暂停');
}

console.log('== 2. 断点命中暂停 ==');
{
  const prog = new DrapCC(SRC, { debug: true }).compile();
  const bp = pcForLine(prog, 4);           // 第 4 行：let z = y * 2
  assert(bp > 0, '定位到第 4 行指令 pc=' + bp);
  const vm = new VM();
  vm.load(prog);
  vm.setBreakpoint(bp);
  await vm.run();
  assert(vm.halted === false, '命中断点后未停机');
  assert(vm.paused === true, '命中断点后进入暂停态');
  assert(vm._stopReason === 'breakpoint', '停止原因 = breakpoint');
  assert(vm.curLine === 4, '暂停时 curLine = 4（联动 M1 行号）');
  assert(vm.snapshot().pc === bp, 'snapshot().pc 等于断点 pc');
  assert(vm.snapshot().breakpoints.length === 1, 'snapshot 暴露断点集合');
}

console.log('== 3. resume() 继续到停机 ==');
{
  const prog = new DrapCC(SRC, { debug: true }).compile();
  const bp = pcForLine(prog, 4);
  const vm = new VM();
  vm.load(prog);
  vm.setBreakpoint(bp);
  await vm.run();              // 停在 bp
  await vm.resume();           // 跳过 bp 一次，跑到停机
  assert(vm.halted === true, 'resume() 后运行至停机');
  assert(vm.paused === false, 'resume 后未再暂停（未重复触发同 pc 断点）');
}

console.log('== 4. step() 逐条推进 + curLine 跟踪 ==');
{
  const prog = new DrapCC(SRC, { debug: true }).compile();
  const vm = new VM();
  vm.load(prog);
  await vm.start();   // 入口初始化后再单步（否则栈帧未建立）
  // 单步覆盖到第 4 行（z 赋值）后停下，记录经过的 curLine 序列
  const lines = [];
  let guard = 0;
  while (!vm.halted && guard++ < 30) {
    await vm.step();
    lines.push(vm.curLine);
    if (lines.includes(4)) break;
  }
  assert(lines.includes(2) && lines.includes(3) && lines.includes(4), '单步经过第 2/3/4 行（x/y/z 赋值）');
  // 继续单步直到停机
  guard = 0;
  while (!vm.halted && guard++ < 50) await vm.step();
  assert(vm.halted === true, '持续 step() 最终停机');
  assert(vm._stopReason === 'step', '最后一步 stopReason = step');
}

console.log('== 5. clearBreakpoint / clearBreakpoints ==');
{
  const prog = new DrapCC(SRC, { debug: true }).compile();
  const bp = pcForLine(prog, 4);
  const vm = new VM();
  vm.load(prog);
  vm.setBreakpoint(bp);
  vm.clearBreakpoint(bp);
  assert(vm.breakpoints.size === 0, 'clearBreakpoint 后无断点');
  vm.setBreakpoint(bp);
  vm.clearBreakpoints();
  assert(vm.breakpoints.size === 0, 'clearBreakpoints 后无断点');
  await vm.run();
  assert(vm.halted === true, '清断点后 run() 直接跑完');
}

console.log('');
if (failures === 0) console.log('VM 单步/断点（M2）验证全部通过 ✓');
else { console.log(failures + ' 项失败 ✗'); process.exit(1); }
