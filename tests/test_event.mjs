// 验证 B6 事件机制（event fn）：
//   编译内联 event fn 源码 → 建 VM + DrapSYS（mock 宿主）→ 跑自动事件循环
//   → 断言 on_paint 首帧绘制、on_input 收到输入切换状态、on_close 正常停机
//   同时覆盖：event fn 与 manual-loop 旧模型互不干扰（由 test_gui.mjs 保证）
import { VM } from '../src/drapog.vm.js';
import { DrapSYS } from '../src/drapog.sys.js';
import { DrapCC } from '../src/drapcc.js';

const src = `
entry fn main() -> i32 {
    let win = syscall win_create("EVT", 200, 120)
    let n = 0
}
event fn on_paint() {
    if (n == 0) { syscall win_set_color(200, 0, 0) }
    else { syscall win_set_color(0, 200, 0) }
    syscall win_fill_rect(0, 0, 200, 120)
    syscall win_input("name", 10, 10, 120, 30)
}
event fn on_input(ev: str) {
    n = 1
}
event fn on_close() {
    return 0
}
`;

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}
const tick = () => new Promise(r => setTimeout(r, 0));

console.log('== 1. 编译 event fn 源码 ==');
const program = new DrapCC(src).compile();
assert(Array.isArray(program.instructions) && program.instructions.length > 0, '编译成功，生成 ' + program.instructions.length + ' 条指令');
assert(program.instructions.some(i => i.op === 'LABEL' && i.args[0] === 'main'), '生成合成 main 入口');

console.log('== 2. 启动（mock 宿主，winId=1） ==');
const vm = new VM();
vm.load(program);
const sys = new DrapSYS({
  vm,
  vfs: null,
  out: () => {},
  onWinCreate: () => 1,
  onWinClose: () => {},
});
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
assert(!!st, '窗口 1 已注册');
const bg0 = st.drawOps.find(o => o.op === 'fill' && o.x === 0 && o.y === 0 && o.w === 200 && o.h === 120);
assert(bg0 && bg0.color[0] === 200 && bg0.color[1] === 0 && bg0.color[2] === 0, '首帧背景红 [200,0,0]（n=0）');
assert(st.controls.some(c => c.type === 'input' && c.id === 'name'), '声明式输入框控件 "name" 已注册（on_paint 中声明）');

console.log('== 3. 注入输入事件 "input name hello" → on_input 置 n=1 ==');
sys.injectWinEvent(1, 'input name hello');
await tick();
// on_input 仅置状态，不重绘；强制 paint 观察
sys.injectWinEvent(1, 'paint');
await tick();
const bg1 = sys.drapWins.get(1).drawOps.find(o => o.op === 'fill' && o.x === 0 && o.y === 0 && o.w === 200 && o.h === 120);
assert(bg1 && bg1.color[0] === 0 && bg1.color[1] === 200 && bg1.color[2] === 0, 'on_input 后重绘背景变绿 [0,200,0]（n=1）');
// 验证 win_input_get 不崩溃（输入框值由真实宿主跨帧维护；mock 下为空串）
const namePtr = sys.vm.pushStr('name');
const valPtr = sys.win_input_get(namePtr);
assert(typeof sys.vm.readStr(valPtr) === 'string', 'win_input_get 返回可读字符串（输入框机制可用）');

console.log('== 4. 注入 close → VM 正常停机 ==');
sys.injectWinEvent(1, 'close');
await runP;
assert(vm.halted === true, 'VM 已停机（on_close 的 return 跳到合成 main 结尾）');

console.log('');
if (failures === 0) console.log('B6 事件机制验证全部通过 ✓');
else console.log(failures + ' 项失败 ✗');
process.exit(failures === 0 ? 0 : 1);
