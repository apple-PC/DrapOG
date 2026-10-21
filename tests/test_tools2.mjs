// test_tools2.mjs —— 验证第二批 drapp 工具（head/tail/sub/tree）功能正确
import { readFileSync } from 'fs';
import { VFS } from '../src/drapog.vfs.js';
import { runDrapCli } from '../src/drapog.launcher.js';

let fail = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); fail++; } }

async function run(id, argv, setup) {
  const src = readFileSync(`System/Apps/${id}.app/main.drapp`, 'utf8');
  const vfs = new VFS();
  if (setup) await setup(vfs);
  const lines = [];
  const io = { print: s => lines.push(s), readLine: async () => '' };
  const code = await runDrapCli(vfs, io, src, { argv: [id, ...argv] });
  return { code, out: lines.join('\n'), vfs };
}

// 15 行测试文件
function big15(vfs) {
  const arr = [];
  for (let i = 1; i <= 15; i++) arr.push('line' + i);
  return vfs.write('/tmp/nums.txt', arr.join('\n') + '\n');
}

(async () => {
  console.log('== head ==');
  {
    const r = await run('head', ['/tmp/nums.txt'], big15);
    ok(r.code === 0, 'head 退出码 0');
    ok(r.out === 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10', 'head 默认前 10 行');
    const r2 = await run('head', ['/tmp/nums.txt', '3'], big15);
    ok(r2.out === 'line1\nline2\nline3', 'head 3 取前三行');
    const r3 = await run('head', ['/nope.txt']);
    ok(r3.code === 2, 'head 缺文件返回 2');
  }

  console.log('== tail ==');
  {
    const r = await run('tail', ['/tmp/nums.txt'], big15);
    ok(r.code === 0, 'tail 退出码 0');
    ok(r.out === 'line6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15', 'tail 默认后 10 行');
    const r2 = await run('tail', ['/tmp/nums.txt', '3'], big15);
    ok(r2.out === 'line13\nline14\nline15', 'tail 3 取后三行');
  }

  console.log('== sub（文件内替换并写回）==');
  {
    const setup = async (vfs) => { await vfs.write('/tmp/fruit.txt', 'apple banana apple cherry\n'); };
    const r = await run('sub', ['/tmp/fruit.txt', 'apple', 'orange'], setup);
    ok(r.code === 0, 'sub 退出码 0');
    ok(r.out.includes('已替换写入'), 'sub 提示已写入');
    const after = await r.vfs.read('/tmp/fruit.txt');
    ok(after === 'orange banana orange cherry\n', 'sub 替换全部匹配并写回');
  }

  console.log('== tree（递归目录树）==');
  {
    const setup = async (vfs) => {
      await vfs.write('/t/a.txt', 'x');
      await vfs.write('/t/sub/b.txt', 'y');
      await vfs.write('/t/sub/deep/c.txt', 'z');
    };
    const r = await run('tree', ['/t'], setup);
    ok(r.code === 0, 'tree 退出码 0');
    ok(r.out.includes('/t'), 'tree 打印根路径');
    ok(r.out.includes('a.txt') && !r.out.includes('a.txt/'), 'tree 列出文件 a.txt');
    ok(r.out.includes('sub/'), 'tree 目录带 /');
    ok(r.out.includes('\n  b.txt'), 'tree 二级缩进 2 空格');
    ok(r.out.includes('\n  deep/'), 'tree 二级目录缩进');
    ok(r.out.includes('\n    c.txt'), 'tree 三级缩进 4 空格');
  }

  console.log('');
  if (fail === 0) console.log('第二批 drapp 工具验证：全部通过 ✓');
  else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
})();
