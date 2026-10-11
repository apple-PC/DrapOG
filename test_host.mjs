// 宿主集成验证：DrapShell（宿主）跑 System/shell.drap（DrapLang REPL）
// 确认 execute(line) → VM REPL → syscall 底层工具 整条链路在 node 下成立。
import { DrapShell } from './drapog.shell.js';
import { VFS } from './drapog.vfs.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

const vfs = new VFS();
const out = [];
let exitCalled = false;
let guiCalled = false;
let clearCalled = 0;

const shell = new DrapShell({
  vfs,
  print: s => { for (const l of String(s).split('\n')) if (l !== '' || true) out.push(l); },
  clear: () => { clearCalled++; },
  exit: () => { exitCalled = true; },
  switchToGUI: () => { guiCalled = true; },
  getDemoSource: () => 'entry fn main() -> i32 { term_print("demo\\n"); return 0 }',
});

const lines = [
  'pwd',
  'ls',
  'mkdir hosttest',
  'cd hosttest',
  'pwd',
  'cd ..',
  'rm hosttest',
  'gui',
  'cc',            // 宿主命令，走 term_hostcmd → executeLegacy
  'exit',
];

console.log('== 经宿主 execute 喂命令 ==');
for (const l of lines) await shell.execute(l);
await shell._replDone;            // 等 exit 触发、VM 自然停机
console.log('REPL 结束，exit 已触发');

const text = out.join('\n');
console.log('\n== 断言 ==');
assert(text.includes('/Users/guest'), 'pwd 输出 /Users/guest（宿主层）');
assert(await vfs.exists('/Users/guest/hosttest') === false, 'mkdir+rm 经宿主 REPL 生效');
assert(shell.cwd === '/Users/guest', 'cd .. 后宿主 cwd 同步回 /Users/guest');
assert(guiCalled === true, 'gui 命令 → onSwitchGUI 钩子被调用');
assert(exitCalled === true, 'exit → 自然停机后 io.exit 被调用');
assert(clearCalled === 0, 'clear 未在本序列调用');

console.log('\n' + (fail === 0 ? '全部通过 ✓ (' + pass + ')' : fail + ' 项失败 ✗'));
process.exit(fail === 0 ? 0 : 1);
