import assert from 'assert';
import { readFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { launchDrapAppProgram } from '../src/drapog.launcher.js';

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
const tick = () => new Promise(r => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 5; i++) await tick(); }

// 内存树形 VFS（支持 read/write/exists/ls/mkdir/rm；write 自动建父目录）
function makeVFS() {
  const nodes = new Map(); // abs path -> {type, content}
  const norm = p => p.replace(/\/+/g, '/');
  const parentOf = p => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
  const ensureDir = p => { p = norm(p); while (p !== '/' && p.length) { if (!nodes.has(p)) nodes.set(p, { type: 'dir', content: '' }); p = parentOf(p); } };
  return {
    async read(p) { const n = nodes.get(norm(p)); return n && n.type === 'file' ? n.content : null; },
    async write(p, c) { p = norm(p); ensureDir(parentOf(p)); nodes.set(p, { type: 'file', content: String(c) }); return true; },
    async exists(p) { return nodes.has(norm(p)); },
    async mkdir(p) { p = norm(p); ensureDir(p); nodes.set(p, { type: 'dir', content: '' }); return true; },
    async rm(p) {
      p = norm(p);
      for (const k of [...nodes.keys()]) if (k === p || k.startsWith(p + '/')) nodes.delete(k);
      return true;
    },
    async ls(p) {
      p = norm(p); if (!nodes.has(p) || nodes.get(p).type !== 'dir') return null;
      const out = [];
      for (const k of nodes.keys()) {
        if (k === p || !k.startsWith(p + '/')) continue;
        const rest = k.slice(p.length + 1);
        if (!rest.includes('/')) { const n = nodes.get(k); out.push({ name: rest, type: n.type }); }
      }
      return out;
    },
    _nodes: nodes,
  };
}

// 桩 WM：记录宿主钩子调用
function makeWM() {
  let id = 1; let lastWin = null;
  return {
    T: { palette: [[38,38,42],[232,232,237],[10,132,255],[46,46,50],[10,132,255]] },
    softKeyboard: { open: false },
    theme: 'macos',
    createWindow(opts) { lastWin = { id: id++, title: opts.title, w: opts.w, h: opts.h, __sys: null }; return lastWin; },
    closeWindow() {},
    getWin() { return lastWin; },
    setTheme(name) { this.theme = name; },
    openFinderAt(path) { this._lastFinder = path; },
  };
}

function compile(app) {
  const src = readFileSync('System/Apps/' + app + '.app/main.drapp', 'utf8');
  return new DrapCC(src).compile();
}

async function testSettings() {
  const vfs = makeVFS(); const wm = makeWM();
  const sys = launchDrapAppProgram(wm, vfs, compile('Settings'));
  const win = wm.getWin(); const st = sys.drapWins.get(win.id);
  await settle();
  const t0 = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(st.drawOps.length > 0, 'Settings 首帧已绘制');
  ok(t0.some(x => /外观/.test(x)), 'Settings 侧栏含「外观」');
  ok(t0.some(x => x === 'Wi-Fi'), 'Settings 侧栏含「Wi-Fi」（macOS 风格分类）');
  ok(t0.some(x => /系统主题/.test(x)), '默认落在「外观」页并显示「系统主题」设置项');
  // 切换主题
  sys.injectWinEvent(win.id, 'click macos'); await settle();
  ok(wm.theme === 'macos', '点击 macOS 触发 setTheme(macos)');
  sys.injectWinEvent(win.id, 'click windows'); await settle();
  ok(wm.theme === 'windows', '点击 Windows 触发 setTheme(windows)');
  // 软键盘
  sys.injectWinEvent(win.id, 'click kb'); await settle();
  ok(wm.softKeyboard.open === true, '点击 kb 打开软键盘');
  sys.injectWinEvent(win.id, 'close'); await settle();
}

async function testTrash() {
  const vfs = makeVFS(); const wm = makeWM();
  await vfs.mkdir('/Library/Trash');
  await vfs.write('/Library/Trash/note.txt', 'hello trash');
  const sys = launchDrapAppProgram(wm, vfs, compile('Trash'));
  const win = wm.getWin(); const st = sys.drapWins.get(win.id);
  await settle();
  let t0 = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(t0.some(x => x === 'note.txt'), 'Trash 渲染出 note.txt');
  // 选中第 0 行（y=48 → sel=0）
  sys.injectWinEvent(win.id, 'click 12 48'); await settle();
  // 还原
  sys.injectWinEvent(win.id, 'click 还原'); await settle();
  ok((await vfs.read('/Users/guest/note.txt')) === 'hello trash', '还原后文件回到 /Users/guest/note.txt');
  ok((await vfs.exists('/Library/Trash/note.txt')) === false, '还原后废纸篓内文件被移出');
  // 清空（此时为空）
  sys.injectWinEvent(win.id, 'click 清空'); await settle();
  const texts = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(texts.some(x => /废纸篓为空/.test(x)), '清空后显示「废纸篓为空」');
  sys.injectWinEvent(win.id, 'close'); await settle();
}

async function testThisPC() {
  const vfs = makeVFS(); const wm = makeWM();
  const sys = launchDrapAppProgram(wm, vfs, compile('ThisPC'));
  const win = wm.getWin(); const st = sys.drapWins.get(win.id);
  await settle();
  const t0 = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(t0.some(x => /此电脑/.test(x)), 'ThisPC 渲染出「此电脑」');
  ok(t0.some(x => /用户主目录/.test(x)), 'ThisPC 渲染出「用户主目录」');
  // 单击第 1 行（y=116 → sel=1 → /Users/guest）
  sys.injectWinEvent(win.id, 'click 12 116'); await settle();
  ok(wm._lastFinder === '/Users/guest', '点击用户主目录 → openFinderAt(/Users/guest)，实际=' + wm._lastFinder);
  // 单击第 0 行（y=76 → sel=0 → /）
  sys.injectWinEvent(win.id, 'click 12 76'); await settle();
  ok(wm._lastFinder === '/', '点击本地磁盘 → openFinderAt(/)，实际=' + wm._lastFinder);
  sys.injectWinEvent(win.id, 'close'); await settle();
}

console.log('== Settings / Trash / ThisPC（DrapLang 自举应用）无头冒烟 ==');
try {
  await testSettings();
  await testTrash();
  await testThisPC();
} catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 5).join('\n'));
}
console.log('');
if (fail === 0) console.log('drapp 应用冒烟验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
