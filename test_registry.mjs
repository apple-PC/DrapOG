/**
 * test_registry.mjs —— L3/L4 验证：应用注册表 + 统一启动器
 *   - scan 发现 VFS 中的 .app 包
 *   - addHost / addDrap / addDrapVfs
 *   - launch 的 host / gui / cli 三种分支
 */
import assert from 'assert';
import { VFS } from './drapog.vfs.js';
import { AppRegistry } from './drapog.registry.js';
import { DrapCC } from './drapcc.js';

let passed = 0;
function ok(cond, msg) { assert(cond, msg); console.log('  ✓ ' + msg); passed++; }

const GUI_SRC = `entry fn main() -> i32 {
  let win = syscall win_create("T", 100, 100)
  while (true) {
    let e = syscall win_get_event()
    if (e == "paint") { syscall win_fill_rect(0, 0, 100, 100) }
    else if (e == "close") { return 0 }
  }
}`;
const CLI_SRC = `entry fn main() -> i32 {
  term_print("Hello from CLI\\n")
  return 0
}`;

async function main() {
  const vfs = new VFS();
  await vfs.write('System/Apps/Hello.app/Info.json', JSON.stringify({ id: 'hello', name: 'Hello', icon: 'H', type: 'cli', entry: 'main.drapp', version: '1.0' }));
  await vfs.write('System/Apps/Hello.app/main.drapp', CLI_SRC);
  await vfs.write('System/Apps/GuiDemo.app/Info.json', JSON.stringify({ id: 'guidemo', name: 'DrapApp 示例', icon: '◆', type: 'gui', entry: 'main.drapp', version: '1.0' }));
  await vfs.write('System/Apps/GuiDemo.app/main.drapp', GUI_SRC);

  const registry = new AppRegistry();
  registry.addHost('finder', { name: 'Finder', icon: '📁', title: 'Finder' });
  registry.addHost('terminal', { name: 'Terminal', icon: '>', title: 'Terminal' });
  await registry.scan(vfs, 'System/Apps');

  // 1) scan 发现 .app 包
  ok(registry.get('hello') && registry.get('hello').type === 'cli', 'scan: 发现 cli 型 Hello.app');
  ok(registry.get('guidemo') && registry.get('guidemo').type === 'gui', 'scan: 发现 gui 型 GuiDemo.app');

  // 2) all 包含内建 host + 扫描到的 drapp
  const ids = registry.all().map(a => a.id);
  ok(ids.includes('finder') && ids.includes('terminal') && ids.includes('hello') && ids.includes('guidemo'), 'all: 含内建 host + 扫描 drapp');

  // 3) launch host 型（带 wm）→ 调 wm.launchApp
  let launchAppCalls = 0;
  const mockWm = {
    launchApp(app) { launchAppCalls++; this._lastLaunch = app; },
    createWindow() { return { id: 1, __sys: null }; },
    closeWindow() {},
    roundRect() {},
  };
  const r1 = await registry.launch('finder', { wm: mockWm, vfs });
  ok(r1.ok && launchAppCalls === 1 && mockWm._lastLaunch.id === 'finder', 'launch host: 调用 wm.launchApp(finder)');

  // 4) launch gui 型（带 wm）→ 调 launchDrapApp（建窗）
  let createCalls = 0;
  const mockWm2 = {
    launchApp() {},
    createWindow() { createCalls++; return { id: 99, __sys: null }; },
    closeWindow() {},
    roundRect() {},
  };
  const r2 = await registry.launch('guidemo', { wm: mockWm2, vfs });
  ok(r2.ok && createCalls === 1, 'launch gui: 调用 launchDrapApp 并建窗');

  // 5) launch cli 型（无 wm）→ runDrapCli 跑完，输出到 io.print
  const out = [];
  const r3 = await registry.launch('hello', { wm: null, vfs, io: { print: s => out.push(s) } });
  ok(r3.ok && out.join('').includes('Hello from CLI'), 'launch cli: runDrapCli 输出 Hello from CLI');

  // 6) 无 wm 时启动 host / gui 应提示而非崩溃
  const r4 = await registry.launch('finder', { wm: null, vfs });
  ok(r4.error && /桌面/.test(r4.error), 'launch host 无 wm: 提示请在桌面启动');
  const r5 = await registry.launch('guidemo', { wm: null, vfs });
  ok(r5.error && /GUI/.test(r5.error), 'launch gui 无 wm: 提示是 GUI 应用');

  // 7) 未知 id
  const r6 = await registry.launch('nope', { wm: mockWm, vfs });
  ok(r6.error && /未知应用/.test(r6.error), 'launch 未知 id: 报错未知应用');

  // 8) scan 跳过字段不全的 .app 包（缺 type / entry）
  await vfs.write('System/Apps/Bad.app/Info.json', JSON.stringify({ id: 'bad', name: 'Bad' }));
  const reg2 = new AppRegistry();
  await reg2.scan(vfs, 'System/Apps');
  ok(!reg2.get('bad'), 'scan: 字段不全的 .app 被跳过');
  ok(reg2.get('hello') && reg2.get('guidemo'), 'scan: 合法 .app 仍被注册');

  // 9) 元数据入库（entry 全路径 / 类型）
  ok(registry.get('guidemo').entry === 'System/Apps/GuiDemo.app/main.drapp', 'scan: 写入完整 entry 路径');
  ok(registry.get('hello').type === 'cli', 'scan: 类型正确（cli）');

  // 10) register / unregister（install / uninstall 用）
  registry.register({ id: 'tmp', name: 'Tmp', icon: 'T', type: 'host' });
  ok(registry.get('tmp') && registry.all().some(a => a.id === 'tmp'), 'register: 动态注册应用');
  registry.unregister('tmp');
  ok(!registry.get('tmp'), 'unregister: 动态注销应用');

  // 11) 预编译 .dbyte 入口的 cli .app 可运行（工具链闭环：cc → pack → 运行）
  const { pack } = await import('./drapog.dbyte.js');
  const dbProgram = new DrapCC('entry fn main() -> i32 { term_print("dbyte-ok"); return 0 }').compile();
  const dbBytes = pack(dbProgram);
  await vfs.write('System/Apps/Db.app/Info.json', JSON.stringify({ id: 'dbapp', name: 'Db', icon: 'D', type: 'cli', entry: 'main.dbyte', version: '1.0' }));
  await vfs.writeBytes('System/Apps/Db.app/main.dbyte', dbBytes);
  const reg3 = new AppRegistry();
  await reg3.scan(vfs, 'System/Apps');
  const out2 = [];
  const r7 = await reg3.launch('dbapp', { wm: null, vfs, io: { print: s => out2.push(s) } });
  ok(r7.ok && out2.join('').includes('dbyte-ok'), 'launch cli(.dbyte): 预编译产物运行并输出 dbyte-ok');

  console.log('\n[L3/L4] 注册表与启动器验证：全部通过 ✓ (' + passed + ' 项)');
  process.exit(0);
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });
