// test_trash.mjs —— 验证废纸篓/回收站逻辑（VFS）：移到废纸篓、列表、还原、清空、目录递归、重名
import { VFS } from './drapog.vfs.js';
import { moveToTrash, listTrash, restoreFromTrash, emptyTrash, TRASH_DIR } from './drapog.apps.js';

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; else pass++; };

(async () => {
  const vfs = new VFS();
  await vfs.write('/Users/guest/a.txt', 'hello');
  await vfs.write('/Users/guest/b.txt', 'world');
  await vfs.mkdir('/Users/guest/docs');
  await vfs.write('/Users/guest/docs/x.txt', 'x');

  console.log('== 移到废纸篓 ==');
  ok(await moveToTrash(vfs, '/Users/guest/a.txt'), '移动文件 a.txt → true');
  ok(!(await vfs.exists('/Users/guest/a.txt')), '源文件已删除');
  ok((await vfs.read('/Library/Trash/a.txt')) === 'hello', '废纸篓里内容完好');

  console.log('== 目录递归移动 ==');
  ok(await moveToTrash(vfs, '/Users/guest/docs'), '移动目录 docs → true');
  ok(!(await vfs.exists('/Users/guest/docs')), '源目录已删除');
  ok(await vfs.isDir('/Library/Trash/docs') && (await vfs.read('/Library/Trash/docs/x.txt')) === 'x', '目录连内容一起进废纸篓');

  console.log('== 重名加序号 ==');
  await vfs.write('/Users/guest/a.txt', 'again');
  ok(await moveToTrash(vfs, '/Users/guest/a.txt'), '再次移动同名 a.txt');
  ok((await vfs.read('/Library/Trash/a 2.txt')) === 'again', '重名落为 a 2.txt（原 a.txt 保留）');

  console.log('== 列表 ==');
  const items = await listTrash(vfs);
  ok(items.some(i => i.name === 'a.txt') && items.some(i => i.name === 'a 2.txt') && items.some(i => i.name === 'docs'), '废纸篓列出全部条目');

  console.log('== 还原 ==');
  ok(await restoreFromTrash(vfs, 'a.txt', '/Users/guest'), '还原 a.txt → true');
  ok((await vfs.read('/Users/guest/a.txt')) === 'hello', '还原内容正确');
  ok(!(await vfs.exists('/Library/Trash/a.txt')), '还原后从废纸篓移除');

  console.log('== 清空 ==');
  ok(await emptyTrash(vfs), '清空 → true');
  ok((await listTrash(vfs)).length === 0, '废纸篓为空');

  console.log('');
  if (fail === 0) console.log('废纸篓逻辑验证全部通过 ✓ (' + pass + ' 项)');
  else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
})();
