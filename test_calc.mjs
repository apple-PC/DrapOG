// test_calc.mjs —— 验证 L5 GUI 应用「Calc 计算器」：
//   win_gui 控件框架 + event fn + 「app import 复用 drapp 模块(calcutil)」全链路
// 方式：编译 main.drapp（带 calcutil 模块）→ VM + mock 宿主 → 注入 click 事件 →
//       读显示屏 label(24,54) 文本，核对算术结果；最后 close 验证停机。
import { readFileSync } from 'fs';
import { VM } from './drapog.vm.js';
import { DrapSYS } from './drapog.sys.js';
import { DrapCC } from './drapcc.js';

let failures = 0;
function assert(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); failures++; } }
const tick = () => new Promise(r => setTimeout(r, 0));

const mainSrc = readFileSync('System/Apps/Calc.app/main.drapp', 'utf8');
const modSrc = readFileSync('System/Apps/Calc.app/calcutil.drapp', 'utf8');

console.log('== 1. 编译（含 import "calcutil" 模块）==');
const program = new DrapCC(mainSrc, { modules: { calcutil: modSrc } }).compile();
assert(program.instructions.some(i => i.op === 'LABEL' && i.args[0] === 'main'), '生成合成 main 入口');

console.log('== 2. 启动 + 首帧 ==');
const vm = new VM();
vm.load(program);
const sys = new DrapSYS({ vm, vfs: null, out: () => {}, onWinCreate: () => 1, onWinClose: () => {} });
vm.sys = sys;
const runP = vm.run();
await tick();

const st = sys.drapWins.get(1);
assert(!!st, '窗口 1 已创建');
assert(st.controls.some(c => c.type === 'button' && c.id === 'b7'), '按钮控件已声明（win_button）');
assert(st.controls.some(c => c.type === 'label' && c.x === 24 && c.y === 54), '显示屏 label 已声明');

function disp() {
  const l = sys.drapWins.get(1).controls.find(c => c.type === 'label' && c.x === 24 && c.y === 54);
  return l ? l.text : null;
}
async function tap(id) { sys.injectWinEvent(1, 'click ' + id); await tick(); sys.injectWinEvent(1, 'paint'); await tick(); }
async function seq(ids) { for (const id of ids) await tap(id); }

console.log('== 3. 2 + 3 = → 5 ==');
await seq(['bc', 'b2', 'badd', 'b3', 'beq']);
assert(disp() === '5', '2+3=5（当前显示 ' + disp() + '）');

console.log('== 4. 5 * 4 = → 20 ==');
await seq(['bc', 'b5', 'bmul', 'b4', 'beq']);
assert(disp() === '20', '5*4=20（当前显示 ' + disp() + '）');

console.log('== 5. 10 - 3 - 2 = → 5（左结合链式）==');
await seq(['bc', 'b1', 'b0', 'bsub', 'b3', 'bsub', 'b2', 'beq']);
assert(disp() === '5', '10-3-2=5（当前显示 ' + disp() + '）');

console.log('== 6. 8 / 0 = → 0（除零保护，来自 drapp 模块 apply）==');
await seq(['bc', 'b8', 'bdiv', 'b0', 'beq']);
assert(disp() === '0', '8/0=0 不崩溃（当前显示 ' + disp() + '）');

console.log('== 7. 多位输入 + clear ==');
await seq(['bc', 'b1', 'b2', 'b3']);
assert(disp() === '123', '连续输入得 123');
await tap('bc');
assert(disp() === '0', 'clear 归零');

console.log('== 8. close → VM 停机 ==');
sys.injectWinEvent(1, 'close');
await runP;
assert(vm.halted === true, 'VM 已停机');

console.log('');
if (failures === 0) console.log('Calc 计算器（L5 GUI + app 调用 drapp）验证全部通过 ✓');
else { console.log(failures + ' 项失败 ✗'); process.exit(1); }
