import assert from 'assert';
import { readFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { launchDrapAppProgram } from '../src/drapog.launcher.js';

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
const tick = () => new Promise(r => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 4; i++) await tick(); }

// 内存 VFS mock（编辑器用 fs_read/fs_write/fs_exists）
function makeVFS() {
  const store = new Map();
  return {
    async read(p) { return store.has(p) ? store.get(p) : null; },
    async write(p, c) { store.set(p, String(c)); return true; },
    async exists(p) { return store.has(p); },
  };
}

// 桩 WM：仅创建窗口对象，记录其 __sys
function makeWM() {
  let id = 1;
  let lastWin = null;
  return {
    createWindow(opts) { lastWin = { id: id++, title: opts.title, w: opts.w, h: opts.h, __sys: null }; return lastWin; },
    closeWindow() {},
    getWin() { return lastWin; },
  };
}

const src = readFileSync('System/Apps/DocEdit.app/main.drapp', 'utf8');
const program = new DrapCC(src).compile();

async function run() {
  const vfs = makeVFS();
  const wm = makeWM();
  const sys = launchDrapAppProgram(wm, vfs, program);
  const win = wm.getWin();
  const st = sys.drapWins.get(win.id);
  await settle();

  // 首帧已绘制（背景 + 工具栏 + 空白行 + 状态栏）
  ok(st.drawOps.length > 0, '首帧已产生绘制指令');
  const texts0 = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts0.some(t => /行 1\/1/.test(t)), '状态栏显示 行 1/1（空文档）');

  // 注入按键打 "Hello"
  for (const ch of ['H', 'e', 'l', 'l', 'o']) { sys.injectWinEvent(win.id, 'key ' + ch); await settle(); }
  let texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === 'Hello'), '键入 Hello 后文本区绘制 "Hello"');
  ok(texts.some(t => /列 5/.test(t)), '光标列位置更新（列 5）');

  // 回车换行后再打 "World"
  sys.injectWinEvent(win.id, 'key Enter'); await settle();
  for (const ch of ['W', 'o', 'r', 'l', 'd']) { sys.injectWinEvent(win.id, 'key ' + ch); await settle(); }
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === 'Hello') && texts.some(t => t === 'World'), '两行 Hello / World 均绘制');
  ok(texts.some(t => /行 2\/2/.test(t)), '行数更新为 2/2');

  // 退格删掉 'd'
  sys.injectWinEvent(win.id, 'key Backspace'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === 'Worl') && !texts.some(t => t === 'World'), '退格删除末尾字符 → "Worl"');

  // 保存（路径输入框已被 main 预填默认值）
  sys.injectWinEvent(win.id, 'click docSave'); await settle();
  // 找到保存的路径（默认 /Users/guest/Documents/未命名.txt）
  const savedPath = '/Users/guest/Documents/未命名.txt';
  const saved = await vfs.read(savedPath);
  ok(saved !== null, '保存后 VFS 写入文件');
  ok(saved === 'Hello\nWorl', '保存内容正确（Hello\\nWorl）: ' + JSON.stringify(saved));

  // 打开：先清空再重新加载，校验读取路径
  sys.injectWinEvent(win.id, 'click docOpen'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === 'Hello') && texts.some(t => t === 'Worl'), '打开后重新渲染保存的内容');

  // 关闭
  sys.injectWinEvent(win.id, 'close'); await settle();
}

console.log('== DocEdit（DrapLang 文档编辑器）无头冒烟 ==');
try {
  await run();
} catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message + (e.__diag ? '' : ''));
  if (e.stack) console.log(e.stack.split('\n').slice(0, 4).join('\n'));
}
console.log('');
if (fail === 0) console.log('DocEdit 冒烟验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
