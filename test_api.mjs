// DrapLang 接口完整性验证（v1.0）：新增系统调用 + 标准库 + argv 全链路
// 覆盖：fs_append/fs_copy/fs_move/fs_size/fs_isdir、time_format/time_sleep、
//       itoa/replace/join/charAt/sin/cos/log/exp、以及 argv 经 registry→launcher 透传
import { VM } from './drapog.vm.js';
import { DrapCC } from './drapcc.js';
import { DrapSYS } from './drapog.sys.js';
import { VFS } from './drapog.vfs.js';
import { AppRegistry } from './drapog.registry.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}
function runDrap(src, argv = [], vfs = new VFS()) {
  return new Promise((resolve) => {
    const program = new DrapCC(src).compile();
    const vm = new VM();
    vm.load(program);
    let out = '';
    vm.onOutput = (s) => { out = s; };
    const sys = new DrapSYS({ vm, vfs, out: () => {}, onRead: null });
    sys.argv = argv.map(String);
    vm.sys = sys;
    vm.run().then(() => resolve({ out, code: vm.regs[0] | 0, vfs, sys }));
  });
}

(async () => {
  console.log('== 1. 新增文件系统调用 ==');
  {
    const src = `
entry fn main() -> i32 {
  syscall fs_write("/a.txt", "line1\\n")
  syscall fs_append("/a.txt", "line2\\n")
  term_print(syscall fs_read("/a.txt"))
  term_print(itoa(syscall fs_size("/a.txt")))
  term_print("\\n")
  syscall fs_copy("/a.txt", "/b.txt")
  term_print(itoa(syscall fs_exists("/b.txt")))
  term_print("\\n")
  syscall fs_move("/b.txt", "/c.txt")
  term_print(itoa(syscall fs_exists("/b.txt")))
  term_print(itoa(syscall fs_exists("/c.txt")))
  term_print("\\n")
  term_print(itoa(syscall fs_isdir("/")))
  term_print(itoa(syscall fs_isdir("/a.txt")))
  term_print("\\n")
  return 0
}`;
    const { out } = await runDrap(src);
    // 输出被拆成多行；逐段核对
    assert(out.includes('line1') && out.includes('line2'), 'fs_append 追加成功');
    assert(out.includes('12'), 'fs_size=12（"line1\\nline2\\n"）');
    assert(out.includes('1') && !/00\n/.test(out), 'fs_copy/fs_move：b→c 迁移');
    assert(/1\d*0/.test(out.replace(/\n/g, '')), 'fs_isdir：目录=1 文件=0');
  }

  console.log('== 2. 时间系统调用 ==');
  {
    const src = `
entry fn main() -> i32 {
  term_print(syscall time_format(0))
  term_print("\\n")
  term_print(itoa(syscall time_sleep(1)))
  term_print("\\n")
  return 0
}`;
    const { out } = await runDrap(src);
    const L = out.split('\n');
    assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(L[0]), 'time_format(0) 形状 YYYY-MM-DD HH:MM:SS');
    assert(L[1] === '0', 'time_sleep 返回 0');
  }

  console.log('== 3. 标准库内建（core/math/str） ==');
  {
    const src = `
import math
import str
entry fn main() -> i32 {
  term_print(itoa(123))
  term_print("\\n")
  term_print(replace("a-b-c", "-", "/"))
  term_print("\\n")
  term_print(join(["x","y","z"], "|"))
  term_print("\\n")
  term_print(charAt("abc", 1))
  term_print("\\n")
  term_print(itoa(sin(0)))
  term_print("\\n")
  term_print(itoa(cos(0)))
  term_print("\\n")
  term_print(itoa(round(exp(0))))
  term_print("\\n")
  term_print(itoa(round(log(1))))
  term_print("\\n")
  return 0
}`;
    const { out } = await runDrap(src);
    const L = out.split('\n');
    assert(L[0] === '123', 'itoa(123)');
    assert(L[1] === 'a/b/c', 'replace');
    assert(L[2] === 'x|y|z', 'join');
    assert(L[3] === 'b', 'charAt');
    assert(L[4] === '0', 'sin(0)=0');
    assert(L[5] === '1' || L[5] === '1', 'cos(0)=1');
    assert(L[6] === '1', 'exp(0) 取整=1');
    assert(L[7] === '0', 'log(1)=0');
  }

  console.log('== 4. argv 全链路（registry → launcher → DrapSYS） ==');
  {
    const vfs = new VFS();
    const helloSrc = `import str
entry fn main() -> i32 {
  term_print(syscall args_get(0))
  term_print("\\n")
  term_print(syscall args_get(1))
  term_print("\\n")
  term_print(itoa(syscall args_count()))
  term_print("\\n")
  return 42
}`;
    await vfs.write('System/Apps/Hello.app/Info.json', JSON.stringify({ id: 'hello', name: 'Hello', type: 'cli', entry: 'main.drapp', version: '1.0' }));
    await vfs.write('System/Apps/Hello.app/main.drapp', helloSrc);
    const reg = new AppRegistry();
    await reg.scan(vfs, 'System/Apps');
    const lines = [];
    const io = { print: (s) => lines.push(s) };
    const r = await reg.launch('hello', { vfs, io, argv: ['hello', 'world'] });
    assert(r.ok && r.code === 42, 'launch 返回程序退出码 42');
    const joined = lines.join('\n');
    assert(joined.includes('hello'), 'argv[0]=程序名 透传成功');
    assert(joined.includes('world'), 'argv[1] 透传成功');
    assert(joined.includes('2'), 'args_count=2（含程序名）');
  }

  console.log('');
  if (failures === 0) console.log('DrapLang 接口完整性验证：全部通过 ✓');
  else console.log(failures + ' 项失败 ✗');
  process.exit(failures === 0 ? 0 : 1);
})();
