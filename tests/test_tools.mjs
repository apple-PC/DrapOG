// test_tools.mjs —— 验证四个 cmd 下运行的 drapp 工具（cat/wc/grep/ls）功能正确
import { readFileSync } from 'fs';
import { VFS } from '../src/drapog.vfs.js';
import { runDrapCli } from '../src/drapog.launcher.js';

let fail = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); fail++; } }

async function runTool(id, argv) {
  const src = readFileSync(`System/Apps/${id}.app/main.drapp`, 'utf8');
  const vfs = new VFS();
  await vfs.write('/Users/guest/sample.txt',
    'hello world\nfoo bar baz\nDrapOG is cool\n');
  await vfs.write('/Users/guest/notes.md', '# Title\nbody text here\n');
  const lines = [];
  const io = { print: s => lines.push(s), readLine: async () => '' };
  const code = await runDrapCli(vfs, io, src, { argv: [id, ...argv] });
  return { code, out: lines.join('\n') };
}

(async () => {
  console.log('== cat ==');
  {
    const r = await runTool('cat', ['/Users/guest/sample.txt']);
    ok(r.code === 0, 'cat 退出码 0');
    ok(r.out === 'hello world\nfoo bar baz\nDrapOG is cool', 'cat 输出三行内容');
    const r2 = await runTool('cat', ['/Users/guest/sample.txt', '-n']);
    ok(r2.out === '1\thello world\n2\tfoo bar baz\n3\tDrapOG is cool', 'cat -n 带行号');
    const r3 = await runTool('cat', ['/nope.txt']);
    ok(r3.code === 2, 'cat 缺文件返回 2');
    ok(r3.out.includes('找不到文件'), 'cat 报缺文件错误');
  }

  console.log('== wc ==');
  {
    const r = await runTool('wc', ['/Users/guest/sample.txt']);
    // 3 行 / 8 词 / 39 字符
    ok(r.code === 0, 'wc 退出码 0');
    ok(r.out.trim() === '3 8 39 /Users/guest/sample.txt', 'wc 统计 3/8/39');
    const r2 = await runTool('wc', ['/Users/guest/notes.md']);
    // "# Title\nbody text here\n" → 2 行, words: "#"(1) "Title"(1) "body"(1) "text"(1) "here"(1) = 5, chars = 6+1 + 15+1 = 23
    ok(r2.out.trim() === '2 5 23 /Users/guest/notes.md', 'wc notes.md 2/5/23');
  }

  console.log('== grep ==');
  {
    const r = await runTool('grep', ['foo', '/Users/guest/sample.txt']);
    ok(r.code === 0, 'grep 退出码 0');
    ok(r.out === 'foo bar baz', 'grep 命中一行');
    const r2 = await runTool('grep', ['DrapOG', '/Users/guest/sample.txt']);
    ok(r2.out === 'DrapOG is cool', 'grep 命中 DrapOG 行');
    const r3 = await runTool('grep', ['zzz', '/Users/guest/sample.txt']);
    ok(r3.out === '', 'grep 无命中输出空');
  }

  console.log('== ls ==');
  {
    const r = await runTool('ls', ['/Users/guest']);
    ok(r.code === 0, 'ls 退出码 0');
    ok(r.out.includes('sample.txt') && r.out.includes('notes.md'), 'ls 列出两个文件');
    ok(r.out.includes('Desktop/') && !r.out.includes('sample.txt/'), 'ls：目录带 / 普通文件不带 /');
    const r2 = await runTool('ls', ['/nope']);
    ok(r2.code === 1, 'ls 非目录返回 1');
  }

  console.log('');
  if (fail === 0) console.log('drapp 工具验证：全部通过 ✓');
  else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
})();
