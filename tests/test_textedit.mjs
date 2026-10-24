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
  const files = new Map();
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

function makeWM() {
  let id = 1, lastWin = null;
  return {
    createWindow(opts) { lastWin = { id: id++, title: opts.title, w: opts.w, h: opts.h, __sys: null }; return lastWin; },
    closeWindow() {},
    getWin() { return lastWin; },
  };
}

const src = readFileSync('System/Apps/TextEdit.app/main.drapp', 'utf8');
const program = new DrapCC(src).compile();

async function run() {
  const vfs = makeVFS();
  await vfs.write('/Users/guest/Documents/笔记.txt', '内容A\n内容B');
  const wm = makeWM();
  const sys = launchDrapAppProgram(wm, vfs, program);
  const win = wm.getWin();
  const st = sys.drapWins.get(win.id);
  await settle();

  ok(st.drawOps.length > 0, '首帧已产生绘制指令');

  // 输入 "Hello"
  for (const ch of ['H', 'e', 'l', 'l', 'o']) { sys.injectWinEvent(win.id, 'key ' + ch); await settle(); }
  let texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === 'Hello'), '键入 Hello 后文本区绘制 "Hello"');

  // 保存：默认路径不存在 → 弹出「保存文件」选择器，文件名预填 readme.txt
  sys.injectWinEvent(win.id, 'click docSave'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === '保存文件'), '点击保存后弹出「保存文件」选择器');
  ok(st.inputs.get('pName') === 'readme.txt', '保存选择器文件名正确预填 readme.txt: ' + st.inputs.get('pName'));
  // 点击 pSave 写入文件
  sys.injectWinEvent(win.id, 'click pSave'); await settle();
  const saved = await vfs.read('/Users/guest/Documents/readme.txt');
  ok(saved === 'Hello', '保存内容正确: ' + JSON.stringify(saved));

  // 新建
  sys.injectWinEvent(win.id, 'click docNew'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(!texts.some(t => t === 'Hello'), '新建后文本清空');

  // 打开：弹出「打开文件」选择器，选择 笔记.txt（行 0），点 pOpen
  sys.injectWinEvent(win.id, 'click docOpen'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === '打开文件'), '点击打开后弹出「打开文件」选择器');
  // 选择器布局：px=(560-460)/2=50, py=(420-320)/2=50, lx0=62, ly0=120, rh=28；第 0 行中心 (112,134)
  sys.injectWinEvent(win.id, 'click 112 134'); await settle();
  sys.injectWinEvent(win.id, 'click pOpen'); await settle();
  texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(t => t === '内容A') && texts.some(t => t === '内容B'), '经选择器打开后渲染 笔记.txt 内容');

  sys.injectWinEvent(win.id, 'close'); await settle();
}

console.log('== TextEdit（DrapLang 文本编辑器）无头冒烟 ==');
try {
  await run();
} catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 4).join('\n'));
}
console.log('');
if (fail === 0) console.log('TextEdit 冒烟验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
