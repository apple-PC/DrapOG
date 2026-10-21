// 端到端验证：编译并运行 System/shell.drap（DrapLang 自举 Shell）
// 用真实 VFS（内存后端）+ 模拟 onRead，确认上层确实靠底层工具完成命令。
import { readFileSync } from 'fs';
import { VM } from '../src/drapog.vm.js';
import { DrapCC } from '../src/drapcc.js';
import { DrapSYS } from '../src/drapog.sys.js';
import { VFS } from '../src/drapog.vfs.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

const src = readFileSync('./System/shell.drapp', 'utf8');
const program = new DrapCC(src).compile();
console.log('编译 shell.drapp → ' + program.instructions.length + ' 条指令');

const vfs = new VFS();
const cwdTrace = [];
let guiCalled = false;
let clearCalled = 0;
const hostCmds = [];

const vm = new VM();
vm.load(program);
let out = '';
vm.onOutput = s => { out = s; };

let idx = 0;
const lines = [
  'pwd',
  'ls',
  'cat Documents/readme.txt',
  'echo hello world',
  'mkdir testdir',
  'cd testdir',
  'ls',
  'cd ..',
  'rm testdir',
  'time',
  'cc',            // 应委托宿主
  'foobar',        // 未知命令，也应委托宿主
  'exit',
];
const onRead = () => {
  const l = lines[idx++];
  return Promise.resolve(l === undefined ? '' : l);
};

const sys = new DrapSYS({
  vm,
  vfs,
  out: s => { out += s; },
  onRead,
});
sys.onCwd = c => cwdTrace.push(c);
sys.onSwitchGUI = () => { guiCalled = true; };
sys.onClear = () => { clearCalled++; };
sys.onExit = () => {};
sys.hostExec = line => { hostCmds.push(line); };
vm.sys = sys;

console.log('\n== 运行 REPL ==');
await vm.run();
console.log('VM 运行结束（exit 触发）');

console.log('\n== 断言 ==');
assert(out.includes('/Users/guest\n'), 'pwd 输出 /Users/guest');
assert(out.includes('Documents'), 'ls 列出 Documents（cwd 下子目录）');
assert(out.includes('Hello, DrapOG!'), 'cat 输出文件内容');
assert(out.includes('hello world '), 'echo 拼接 token');
assert(await vfs.exists('/Users/guest/testdir') === false, 'mkdir 后 rm 已删除 testdir');
assert(cwdTrace.includes('/Users/guest/testdir'), 'cd testdir → cwd 经 term_setcwd 同步给宿主');
assert(cwdTrace[cwdTrace.length - 1] === '/Users/guest', 'cd .. → 回到 /Users/guest');
assert(out.includes('时间戳: '), 'time 输出时间戳');
assert(hostCmds.includes('cc'), 'cc 经 term_hostcmd 委托宿主');
assert(hostCmds.includes('foobar'), '未知命令 foobar 经 term_hostcmd 委托宿主');
assert(sys.terminated === true, 'exit 置 terminated 标志');
assert(guiCalled === false, 'gui 未被调用（本测试未发 gui 命令）');

console.log('\n' + (fail === 0 ? '全部通过 ✓ (' + pass + ')' : fail + ' 项失败 ✗'));
process.exit(fail === 0 ? 0 : 1);
