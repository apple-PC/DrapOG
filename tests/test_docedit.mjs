import assert from 'assert';
import { readFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { launchDrapAppProgram } from '../src/drapog.launcher.js';

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
const tick = () => new Promise(r => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 4; i++) await tick(); }

// 内存 VFS mock：支持 normalize / ls / read / write / exists（与 drapog.vfs.js 语义一致）
function makeVFS() {
  const files = new Map();   // absPath -> content
  const dirs = new Set(['/']);
  function normalize(cwd, p) {
    if (!p) return cwd;
    if (p === '~') p = '/Users/guest';
    else if (p.startsWith('~/')) p = '/Users/guest/' + p.slice(2);
    const full = p.startsWith('/') ? p : (cwd === '/' ? '/' + p : cwd + '/' + p);
    const parts = [];
    for (const seg of full.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return '/' + parts.join('/');
  }
  function ensureDir(abs) {
    const parts = abs.split('/').filter(Boolean);
    let cur = '/';
    dirs.add(cur);
    for (const p of parts) { cur = cur + (cur === '/' ? '' : '/') + p; dirs.add(cur); }
  }
  return {
    normalize,
    async read(p) { p = normalize('/', p); return files.has(p) ? files.get(p) : null; },
    async write(p, c) { p = normalize('/', p); ensureDir(p.slice(0, p.lastIndexOf('/') || 1)); files.set(p, String(c)); return true; },
    async exists(p) { p = normalize('/', p); return files.has(p) || dirs.has(p); },
    async ls(p) {
      p = normalize('/', p);
      const entries = [];
      for (const d of dirs) {
        if (d === p || d === '/') continue;
        const idx = d.lastIndexOf('/');
        const parent = idx <= 0 ? '/' : d.slice(0, idx);
        if (parent === p) { const name = idx <= 0 ? d : d.slice(idx + 1); entries.push({ name, type: 'dir' }); }
      }
      for (const f of files.keys()) {
        const idx = f.lastIndexOf('/');
        const parent = idx <= 0 ? '/' : f.slice(0, idx);
        if (parent === p) { const name = idx <= 0 ? f : f.slice(idx + 1); entries.push({ name, type: 'file' }); }
      }
      return entries;
    },
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
  // 预置一个可被「打开」选择的文件
  await vfs.write('/Users/guest/Documents/示例.txt', '第一行\n第二行');
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

  // 保存：默认路径不存在 → 打开「保存文件」选择器（pName 已预填 "未命名.txt"）
  sys.injectWinEvent(win.id, 'click docSave'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === '保存文件'), '点击保存后弹出「保存文件」选择器');
  // 确认文件名输入框已预填
  const pName = st.inputs.get('pName');
  ok(typeof pName === 'string' && pName.length > 0, '保存选择器文件名已预填: ' + pName);
  // 点击「保存」按钮（pSave）写入文件
  sys.injectWinEvent(win.id, 'click pSave'); await settle();
  const savedPath = '/Users/guest/Documents/未命名.txt';
  const saved = await vfs.read(savedPath);
  ok(saved !== null, '保存后 VFS 写入文件');
  ok(saved === 'Hello\nWorl', '保存内容正确（Hello\\nWorl）: ' + JSON.stringify(saved));
  // 路径框同步为新路径
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t.indexOf(savedPath) >= 0), '保存后状态栏路径同步为 ' + savedPath);

  // 新建空白文档
  sys.injectWinEvent(win.id, 'click docNew'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => /行 1\/1/.test(t)), '新建后回到空文档 行 1/1');

  // 打开：弹出「打开文件」选择器，定位到 Documents 目录，选择 示例.txt 行，点 pOpen
  sys.injectWinEvent(win.id, 'click docOpen'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === '打开文件'), '点击打开后弹出「打开文件」选择器');
  // 选择器布局：px=(720-460)/2=130, py=(520-340)/2=90, lx0=142, ly0=160, rh=28；第 0 行中心 (192,174)
  sys.injectWinEvent(win.id, 'click 192 174'); await settle();
  sys.injectWinEvent(win.id, 'click pOpen'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === '第一行') && texts.some(t => t === '第二行'), '经选择器打开后重新渲染 示例.txt 内容');

  // 关闭
  sys.injectWinEvent(win.id, 'close'); await settle();
}

console.log('== DocEdit（DrapLang 文档编辑器）无头冒烟 ==');
try {
  await run();
} catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 4).join('\n'));
}
console.log('');
if (fail === 0) console.log('DocEdit 冒烟验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
