/**
 * B7 地基验证桩：无损往返 + 新字符串指令 + term_read / fs_chdir
 * 仅用于 node 验证，不参与浏览器运行。
 */
import { readFileSync } from 'fs';
import { DrapCC } from './drapcc.js';
import { pack, unpack } from './drapog.dbyte.js';
import { VM } from './drapog.vm.js';
import { DrapSYS } from './drapog.sys.js';
import { assemble } from './drapas.js';
import { disassemble } from './drapdis.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ ' + msg); failures++; }
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// 内存 VFS mock：只实现 normalize（fs_chdir 需要），其余返回“不存在”
function makeVfs() {
  return {
    mode: 'memory',
    normalize(cwd, p) {
      if (!p) return cwd;
      if (p === '~') return '/Users/guest';
      if (p.startsWith('/')) return p;
      if (p.startsWith('~/')) return '/Users/guest/' + p.slice(2);
      const parts = (cwd + '/' + p).split('/');
      const stack = [];
      for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') { stack.pop(); continue; }
        stack.push(part);
      }
      return '/' + stack.join('/');
    },
    async read(p) { return p === '/System/Settings/boot.json' ? '{"theme":"macos"}' : null; },
    async exists() { return false; },
    async ls() { return null; },
    async mkdir() { return false; },
    async rm() { return false; },
    async write() { return false; },
    async touch() { return false; },
    async readBytes() { return null; },
    async writeBytes() { return false; },
  };
}

// 编译 + 跑，收集 VM 全量输出
async function run(source, { onRead } = {}) {
  const program = new DrapCC(source).compile();
  const bytes = pack(program);
  const vfs = makeVfs();
  const vm = new VM();
  vm.load(program);
  let out = '';
  vm.onOutput = full => { out = String(full); };
  const sys = new DrapSYS({ vm, vfs, onRead: onRead || null });
  vm.sys = sys;
  await vm.run();
  return { out, bytes, instructions: program.instructions.length };
}

const PROG_STR = `
entry fn main() -> i32 {
    let line = "a b  c"
    let tokens = split(line, ' ')
    term_print("count=")
    term_print(len(tokens))
    term_print("\\n")
    let i = 0
    while (i < len(tokens)) {
        term_print(tokens[i])
        term_print("|")
        i = i + 1
    }
    term_print("\\n")
    let s = "hello"
    term_print("s[1]=")
    term_print(s[1])
    term_print("\\n")
    term_print("sub=")
    term_print(substr(s, 2))
    term_print("\\n")
    return 0
}
`;

const PROG_READ = `
entry fn main() -> i32 {
    let line = syscall term_read()
    let tokens = split(line, ' ')
    let i = 0
    while (i < len(tokens)) {
        term_print(tokens[i])
        term_print("\\n")
        i = i + 1
    }
    return 0
}
`;

const PROG_CHDIR = `
entry fn main() -> i32 {
    let p = syscall fs_chdir("Documents")
    term_print(p)
    term_print("\\n")
    return 0
}
`;

console.log('== 1. 无损往返：cc → .dbyte → dis → .dasm → asm → .dbyte ==');
{
  const { instructions } = await (async () => {
    const program = new DrapCC(PROG_STR).compile();
    const bytes1 = pack(program);
    const dasm = disassemble(bytes1, 'prog.drap');
    const bytes2 = assemble(dasm);
    assert(bytesEqual(bytes1, bytes2), '两次 .dbyte 字节一致（含 STRSPLIT/STRGET/STRSUB）');
    return { instructions: program.instructions.length };
  })();
  console.log('    （编译通过，指令数 ' + instructions + '）');
}

console.log('== 2. 字符串指令功能 ==');
{
  const { out } = await run(PROG_STR);
  assert(out === 'count=4\na|b||c|\ns[1]=101\nsub=llo\n',
    'split/s[i]/substr 输出正确：' + JSON.stringify(out));
}

console.log('== 3. term_read 异步输入 ==');
{
  const { out } = await run(PROG_READ, { onRead: async () => 'foo bar baz' });
  assert(out === 'foo\nbar\nbaz\n', 'term_read 读入并 split 输出：' + JSON.stringify(out));
}

console.log('== 4. fs_chdir 路径归一化 ==');
{
  const { out } = await run(PROG_CHDIR);
  assert(out === '/Users/guest/Documents\n', 'fs_chdir 归一化输出：' + JSON.stringify(out));
}

console.log('== 5. 回归：现有 hello.drapp 仍能跑（struct/array/syscall） ==');
{
  const src = readFileSync(new URL('./Users/guest/hello.drapp', import.meta.url), 'utf8');
  const { out } = await run(src);
  assert(out.includes('theme') || out.includes('配置文件') || out.length > 0,
    'hello.drapp 运行无异常，输出长度 ' + out.length);
}

console.log('== 6. P0-4：无 syscall 的死循环应在 1e6 步内被掐死 ==');
{
  const program = new DrapCC(`
entry fn main() -> i32 {
    let x = 0
    while (x < 1000000000) { x = x + 1 }
    return 0
}`).compile();
  const vm = new VM();
  vm.load(program);
  let threw = false;
  try { await vm.run(); } catch (e) { threw = /步数超限/.test(e.message); }
  assert(threw, '死循环被 maxSteps 拦截');
}

console.log('== 7. P0-4 混合方案：含 syscall 的长驻循环不应被掐死 ==');
{
  const program = new DrapCC(`
entry fn main() -> i32 {
    let n = 0
    while (n < 50000) {
        let line = syscall term_read()
        n = n + 1
    }
    return 0
}`).compile();
  const vfs = makeVfs();
  const vm = new VM();
  vm.load(program);
  const sys = new DrapSYS({ vm, vfs, onRead: async () => 'x' });
  vm.sys = sys;
  let threw = false;
  try { await vm.run(); } catch (e) { threw = /步数超限/.test(e.message); }
  assert(!threw, '5 万轮（含 syscall）循环正常跑完，未被 maxSteps 误杀');
}

console.log('');
if (failures === 0) console.log('全部通过 ✓');
else console.log(failures + ' 项失败 ✗');
process.exit(failures === 0 ? 0 : 1);
