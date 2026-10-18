// 验证 DrapLang GUI 自举闭环：
//   编译 System/app_gui.drap → 建 VM + DrapSYS（mock 宿主）→ 跑事件循环
//   → 断言首帧绘制指令、点击后主题色切换、close 正常停机
import { readFileSync } from 'fs';
import { VM } from './drapog.vm.js';
import { DrapSYS } from './drapog.sys.js';
import { DrapCC } from './drapcc.js';

const src = readFileSync(new URL('./System/app_gui.drapp', import.meta.url), 'utf8');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}
const tick = () => new Promise(r => setTimeout(r, 0));

console.log('== 1. 编译 app_gui.drapp ==');
const program = new DrapCC(src).compile();
assert(Array.isArray(program.instructions) && program.instructions.length > 0, '编译成功，生成 ' + program.instructions.length + ' 条指令');

console.log('== 2. 启动应用（mock 宿主，winId=1） ==');
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

// 安全网：防止潜在的事件循环风暴导致 OOM（正常应用远不会达到）
const origDoS = vm._doSyscall.bind(vm);
let _guard = 0;
vm._doSyscall = async function (ins) {
  if (++_guard > 100000) throw new Error('[guard] 疑似死循环，curWinId=' + sys.curWinId);
  return origDoS(ins);
};

const runP = vm.run();          // 异步跑；首帧 paint 在同步阶段绘制，随后阻塞在 win_get_event
await tick();

const st = sys.drapWins.get(1);
assert(!!st, '窗口 1 已在 drapspace 注册');
assert(st.drawOps.length > 0, '首帧绘制指令非空（' + st.drawOps.length + ' 条）');

const bg0 = st.drawOps.find(o => o.op === 'fill' && o.x === 0 && o.y === 0 && o.w === 420 && o.h === 320);
assert(bg0 && bg0.color[0] === 28 && bg0.color[1] === 28 && bg0.color[2] === 34, '首帧背景色 = 深灰 [28,28,34]（mode=0）');

// 控件框架：按钮/标签以声明式 controls 存在，不进 drawOps
assert(st.controls.some(c => c.type === 'button' && c.id === 'go'), '声明式按钮控件 "go" 已注册');
assert(st.controls.some(c => c.type === 'label' && c.text === 'DrapLang 控件框架示例'), '标签控件已注册');

console.log('== 3. 命中按钮（宿主注入 "click go"）→ mode 切到 1 ==');
sys.injectWinEvent(1, 'click go');
await tick();
const after = sys.drapWins.get(1);
const bg1 = after.drawOps.find(o => o.op === 'fill' && o.x === 0 && o.y === 0 && o.w === 420 && o.h === 320);
assert(bg1 && bg1.color[0] === 42 && bg1.color[1] === 22 && bg1.color[2] === 46, '点击后背景色切换为 [42,22,46]（mode=1）');

console.log('== 4. 空白处点击（"click x y"）→ 不应切换 ==');
sys.injectWinEvent(1, 'click 300 300');
await tick();
const bg1b = sys.drapWins.get(1).drawOps.find(o => o.op === 'fill' && o.x === 0 && o.y === 0 && o.w === 420 && o.h === 320);
assert(bg1b && bg1b.color[0] === 42 && bg1b.color[1] === 22 && bg1b.color[2] === 46, '空白点击，主题不变（仍 mode=1）');

console.log('== 5. 注入 key → 再切到 mode=2 ==');
sys.injectWinEvent(1, 'key a');
await tick();
const bg2 = sys.drapWins.get(1).drawOps.find(o => o.op === 'fill' && o.x === 0 && o.y === 0 && o.w === 420 && o.h === 320);
assert(bg2 && bg2.color[0] === 20 && bg2.color[1] === 42 && bg2.color[2] === 32, '按键后背景色切换为 [20,42,32]（mode=2）');

console.log('== 6. 注入 close → VM 正常停机 ==');
sys.injectWinEvent(1, 'close');
await runP;                    // 等待 VM 跑完 return 0
assert(vm.halted === true, 'VM 已停机（close 分支 return 0）');

console.log('');
if (failures === 0) console.log('GUI 自举验证全部通过 ✓');
else console.log(failures + ' 项失败 ✗');
process.exit(failures === 0 ? 0 : 1);
