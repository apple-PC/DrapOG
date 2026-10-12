// 验证第二个基础 drapp（调色板 Paint）：
//   编译 System/app_paint.drap → 建 VM + DrapSYS（mock 宿主）→ 跑事件循环
//   → 断言首帧网格绘制、点击格子高亮(stroke)、按键重置、close 正常停机
import { readFileSync } from 'fs';
import { VM } from './drapog.vm.js';
import { DrapSYS } from './drapog.sys.js';
import { DrapCC } from './drapcc.js';

const src = readFileSync(new URL('./System/app_paint.drap', import.meta.url), 'utf8');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}
const tick = () => new Promise(r => setTimeout(r, 0));

console.log('== 1. 编译 app_paint.drap ==');
let program;
try { program = new DrapCC(src).compile(); }
catch (e) { console.log('  ✗ 编译失败: ' + e.message); process.exit(1); }
assert(program.instructions.length > 0, '编译成功，生成 ' + program.instructions.length + ' 条指令');

console.log('== 2. 启动应用（mock 宿主，winId=1） ==');
const vm = new VM();
vm.load(program);
const sys = new DrapSYS({ vm, vfs: null, out: () => {}, onWinCreate: () => 1, onWinClose: () => {} });
vm.sys = sys;

const origDoS = vm._doSyscall.bind(vm);
let _guard = 0;
vm._doSyscall = async function (ins) {
  if (++_guard > 100000) throw new Error('[guard] 疑似死循环');
  return origDoS(ins);
};

const runP = vm.run();
await tick();

const st = sys.drapWins.get(1);
assert(!!st, '窗口 1 已在 drapspace 注册');
const gridCells = st.drawOps.filter(o => o.op === 'fill' && o.w === 40 && o.h === 40);
assert(gridCells.length === 24, '首帧绘制 24 个调色格 (6×4)，实际 ' + gridCells.length);

console.log('== 3. 注入 click 落在格子 (0,0) 中心 (30,30) → 高亮(stroke) ==');
sys.injectWinEvent(1, 'click 30 30');
await tick();
const stk = sys.drapWins.get(1);
const stroke = stk.drawOps.find(o => o.op === 'stroke' && o.x === 8 && o.y === 8 && o.w === 40 && o.h === 40);
assert(!!stroke, '点击后格子 (0,0) 出现白色高亮描边');

console.log('== 4. 注入 key → 重置（描边消失） ==');
sys.injectWinEvent(1, 'key x');
await tick();
const stk2 = sys.drapWins.get(1);
const stroke2 = stk2.drawOps.find(o => o.op === 'stroke');
assert(!stroke2, '按键后高亮描边已消失（sel 重置）');

console.log('== 5. 注入 close → VM 正常停机 ==');
sys.injectWinEvent(1, 'close');
await runP;
assert(vm.halted === true, 'VM 已停机（close 分支 return 0）');

console.log('');
if (failures === 0) console.log('Paint drapp 验证全部通过 ✓');
else console.log(failures + ' 项失败 ✗');
process.exit(failures === 0 ? 0 : 1);
