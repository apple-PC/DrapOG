// test_conv.mjs —— 验证 L5 GUI 应用「Conv 进制转换器」：
//   win_gui + event fn + import baseconv.drapp（app 调用 drapp）
// 方式：编译 main.drapp（带 baseconv 模块）→ VM + mock 宿主 → setInputValue 设输入 →
//       注入 click → 读结果 label(16,88) 文本核对转换结果；close 验证停机。
import { readFileSync } from 'fs';
import { VM } from './drapog.vm.js';
import { DrapSYS } from './drapog.sys.js';
import { DrapCC } from './drapcc.js';

let failures = 0;
function assert(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); failures++; } }
const tick = () => new Promise(r => setTimeout(r, 0));

const mainSrc = readFileSync('System/Apps/Conv.app/main.drapp', 'utf8');
const modSrc = readFileSync('System/Apps/Conv.app/baseconv.drapp', 'utf8');

console.log('== 1. 编译（含 import "baseconv"）==');
const program = new DrapCC(mainSrc, { modules: { baseconv: modSrc } }).compile();
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
assert(st.controls.some(c => c.type === 'input' && c.id === 'val'), '输入框控件 "val" 已声明');
assert(st.controls.some(c => c.type === 'button' && c.id === '十六进制'), '按钮「十六进制」已声明（中文 id=显示文字）');

function resultText() {
  const l = sys.drapWins.get(1).controls.find(c => c.type === 'label' && c.x === 16 && c.y === 88);
  return l ? l.text : null;
}
async function convert(inputVal, btnId) {
  sys.setInputValue(1, 'val', inputVal);
  sys.injectWinEvent(1, 'click ' + btnId);
  await tick();
  sys.injectWinEvent(1, 'paint');
  await tick();
}

console.log('== 3. 转换 ==');
await convert('255', '十六进制');
assert(resultText().includes('FF') && resultText().includes('16'), '255 → 十六进制 FF');
await convert('10', '二进制');
assert(resultText().includes('1010') && resultText().includes('2 '), '10 → 二进制 1010');
await convert('64', '八进制');
assert(resultText().includes('100') && resultText().includes('8 '), '64 → 八进制 100');
await convert('0', '二进制');
assert(resultText().includes(': 0'), '0 → 二进制 0');

console.log('== 4. close → VM 停机 ==');
sys.injectWinEvent(1, 'close');
await runP;
assert(vm.halted === true, 'VM 已停机');

console.log('');
if (failures === 0) console.log('Conv 进制转换器（L5 GUI + app 调用 drapp）验证全部通过 ✓');
else { console.log(failures + ' 项失败 ✗'); process.exit(1); }
