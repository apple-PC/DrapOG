// test_l4.mjs —— L4 完善验证：.app 扫描/元数据/CLI 运行/dbyte 入口/shell 应用管理命令
import assert from 'assert';
import { readFileSync } from 'fs';
import { VFS } from '../src/drapog.vfs.js';
import { AppRegistry } from '../src/drapog.registry.js';
import { DrapCC } from '../src/drapcc.js';
import { pack } from '../src/drapog.dbyte.js';
import { DrapShell } from '../src/drapog.shell.js';

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); console.log('  ✓ ' + msg); passed++; }

const helloSrc = readFileSync('System/Apps/Hello.app/main.drapp', 'utf8');
const helloInfo = JSON.parse(readFileSync('System/Apps/Hello.app/Info.json', 'utf8'));

async function main() {
  console.log('[L4] .app 格式 / 注册表 / shell 应用管理 验证');

  // 1) 注册表扫描 VFS 中的 .app 包并采集元数据
  const vfs = new VFS();
  await vfs.write('System/Apps/Hello.app/Info.json', JSON.stringify(helloInfo));
  await vfs.write('System/Apps/Hello.app/main.drapp', helloSrc);
  const registry = new AppRegistry();
  await registry.scan(vfs, 'System/Apps');
  const hello = registry.get('hello');
  ok(hello, 'scan 发现 Hello.app');
  ok(hello.type === 'cli', 'hello.type === cli');
  ok(hello.version === '1.0', 'hello.version === 1.0');
  ok(hello.category === 'tools', 'hello.category === tools');
  ok(hello.entry === 'System/Apps/Hello.app/main.drapp', 'hello.entry 指向 main.drapp');

  // 2) 运行 CLI 应用（经 VFS 解析，不走 fetch）
  const out = [];
  const io = { print: s => out.push(s), clear() {}, readLine: async () => '' };
  const r = await registry.launch('hello', { vfs, io });
  ok(r.ok, 'launch hello 成功');
  const text = out.join('\n');
  ok(text.includes('程序名: hello'), 'CLI 输出含程序名');
  ok(text.includes('演示 replace: a/b/c'), 'CLI 输出含 replace 演示');

  // 3) 预编译 .dbyte 入口解析
  const program = new DrapCC(helloSrc).compile();
  const bytes = pack(program);
  await vfs.writeBytes('System/Apps/Hello.app/main.dbyte', bytes);
  const reg2 = new AppRegistry();
  reg2.addDrapVfs('hello2', {
    name: 'Hello2', icon: 'H', type: 'cli',
    entry: 'System/Apps/Hello.app/main.dbyte', version: '1.0', category: 'tools',
  });
  const out2 = [];
  const io2 = { print: s => out2.push(s), clear() {}, readLine: async () => '' };
  const r2 = await reg2.launch('hello2', { vfs, io: io2 });
  ok(r2.ok, 'launch dbyte 入口成功');
  ok(out2.join('\n').includes('程序名: hello2'), 'dbyte 入口运行输出程序名');
  ok(out2.join('\n').includes('演示 replace: a/b/c'), 'dbyte 入口运行含 replace 演示（验证 BUILTIN 序列化）');

  // 4) shell 应用管理命令（pack / apps / info / install / uninstall）
  const shellOut = [];
  const shell = new DrapShell({
    vfs,
    registry,
    print: s => shellOut.push(s),
    clear: () => {},
    exit: () => {},
    readLine: async () => '',
  });
  shell.cwd = '/Users/guest';

  // 4a) pack：把一份 .drapp 打包成 System/Apps/Widget.app
  await vfs.write('/Users/guest/widget.drapp', helloSrc);
  await shell._cmdPack(['widget.drapp', 'Widget']);
  ok(await vfs.exists('System/Apps/Widget.app/Info.json'), 'pack 生成 Info.json');
  ok(await vfs.exists('System/Apps/Widget.app/main.drapp'), 'pack 生成 main.drapp');
  let info2 = JSON.parse(await vfs.read('System/Apps/Widget.app/Info.json'));
  ok(info2.id === 'Widget' && info2.type === 'cli', 'pack Info.json 字段正确');

  // 4b) apps：列出（应含 hello / Widget）
  shellOut.length = 0;
  shell._cmdApps();
  const appsText = shellOut.join('\n');
  ok(appsText.includes('hello') && appsText.includes('Widget'), 'apps 列出已注册应用');

  // 4c) info：显示元数据
  shellOut.length = 0;
  shell._cmdInfo(['hello']);
  const infoText = shellOut.join('\n');
  ok(infoText.includes('category') && infoText.includes('tools'), 'info 显示 category 元数据');

  // 4d) install：把 Widget.app 复制到 New.app
  await shell._cmdInstall(['System/Apps/Widget.app']);
  ok(await vfs.exists('System/Apps/Widget.app'), 'install 后 Widget.app 仍在');
  ok(registry.get('Widget'), 'install 让注册表发现 Widget');

  // 4e) uninstall：删除并注销
  await shell._cmdUninstall(['Widget']);
  ok(!(await vfs.exists('System/Apps/Widget.app')), 'uninstall 删除 Widget.app');
  ok(!registry.get('Widget'), 'uninstall 注销 Widget');

  console.log('\n[L4] 全部通过 ✓ (' + passed + ' 项)');
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });
