// test_shellrep.mjs —— 回归：DrapShell 自举 REPL 真能跑（捕获 _ensureRepl 漏 import DrapSYS 的 bug）
//   并验证 DrapLang Shell 里 `gui <theme>` 经 term_hostcmd → executeLegacy → switchToGUI(theme) 透传主题。
import { readFileSync } from 'fs';
import { VFS } from '../src/drapog.vfs.js';
import { DrapShell } from '../src/drapog.shell.js';

const shellSrc = readFileSync('./System/shell.drapp', 'utf8');
const tick = () => new Promise(r => setTimeout(r, 5));

(async () => {
  const vfs = new VFS();
  await vfs.write('/System/shell.drapp', shellSrc);   // 磁盘/内存里备好 shell 源码
  const out = [];
  let guiTheme = 'UNSET';
  const io = {
    vfs, registry: null, wm: null,
    print: s => out.push(s),
    clear: () => {}, exit: () => {}, readLine: async () => '',
    switchToGUI: (t) => { guiTheme = t; }, getDemoSource: () => '',
  };
  const shell = new DrapShell(io);

  await shell.execute('help');       // 首次命令触发 _ensureRepl → 编译 shell.drapp → new DrapSYS → 跑 REPL
  for (let i = 0; i < 30; i++) await tick();
  const text = out.join('\n');

  let fail = 0;
  const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

  ok(!shell.legacyMode, 'REPL 自举成功（未回退 legacy —— DrapSYS 已正确导入）');
  ok(text.includes('DrapLang Shell 可用命令'), 'DrapLang Shell 输出 help（REPL 真在跑）');
  ok(text.includes('gui [macos|windows]'), 'help 含新的 gui 主题用法');

  out.length = 0;
  await shell.execute('gui windows');   // 经 term_hostcmd → executeLegacy → switchToGUI('windows')
  for (let i = 0; i < 30; i++) await tick();
  ok(guiTheme === 'windows', 'DrapLang Shell 里 `gui windows` → switchToGUI("windows")');

  await shell.execute('gui');
  for (let i = 0; i < 30; i++) await tick();
  ok(guiTheme === undefined, '裸 `gui` → switchToGUI(undefined)（默认 macos）');

  console.log(fail ? fail + ' 项失败 ✗' : 'DrapLang Shell 自举 + gui 主题透传验证全部通过 ✓');
  process.exit(fail ? 1 : 0);
})();
