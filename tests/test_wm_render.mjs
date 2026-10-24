import assert from 'assert';
import { readFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { launchDrapAppProgram } from '../src/drapog.launcher.js';
import { drapAppBridge } from '../src/drapog.launcher.js';
import { WindowManager } from '../src/drapog.wm.js';

// ---- mock canvas / ctx（Proxy：方法 no-op，少数返回合理值，记录关键绘制调用）----
function makeCtx() {
  const calls = { fillRect: 0, fillText: 0, strokeRect: 0 };
  const proxy = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
      if (prop in calls) return () => { calls[prop]++; };
      return () => {};
    },
    set() { return true; },
  });
  return { calls, proxy };
}

function makeVFS() {
  const s = new Map();
  return {
    async read(p) { return s.has(p) ? s.get(p) : null; },
    async write(p, c) { s.set(p, String(c)); return true; },
    async exists(p) { return s.has(p); },
  };
}

const tick = () => new Promise(r => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

async function run() {
  global.window = { SCR_W: 1000, SCR_H: 700 };
  const { calls, proxy } = makeCtx();
  const canvas = { getContext: () => proxy };

  const wm = new WindowManager(canvas, { theme: 'macos' });

  // 模拟 gui.js：所有 DrapLang 应用统一经 '__drapapp__' 宿主桥接渲染
  let renderCalls = 0;
  const origRender = drapAppBridge.render;
  drapAppBridge.render = function (...a) { renderCalls++; return origRender.apply(this, a); };
  wm.registerApp('__drapapp__', drapAppBridge);

  // 启动一个 DrapLang 应用，窗口 appId 用真实 id（复现“应用名同步”改动后的状态）
  const src = readFileSync('System/Apps/DocEdit.app/main.drapp', 'utf8');
  const program = new DrapCC(src).compile();
  const vfs = makeVFS();
  launchDrapAppProgram(wm, vfs, program, null, null, 'docedit');
  await settle();

  const win = wm.windows.find(w => w.appId === 'docedit');
  ok(!!win, 'DrapLang 应用窗口已创建且 appId=docedit');
  ok(!!win && !!win.__sys, '窗口已挂 __sys（DrapLang 自举标记）');

  // 直接断言 appHandler 回退逻辑（真实 appId 无内建实现 → 回退到 '__drapapp__'）
  const handler = win ? wm.appHandler(win) : null;
  ok(handler === wm.getApp('__drapapp__'), 'appHandler 对 DrapLang 窗口回退到 drapAppBridge');

  // 关键回归断言：render() 必须触发内容区渲染（否则窗口全黑）
  renderCalls = 0;
  wm.render();
  ok(renderCalls > 0, 'WM.render() 触发了 DrapLang 应用内容区渲染（修复黑屏）');

  // 内容区确实绘制了文字/图形（drawOps 非空，且被重放到 canvas）
  const st = win ? [...wm.windows].length && win.__sys.drapWins.get(win.id) : null;
  ok(st && st.drawOps.length > 0, '应用 drawOps 非空');
  ok(calls.fillText > 0 || calls.fillRect > 0, 'canvas 收到内容绘制调用');

  drapAppBridge.render = origRender;
}

console.log('== WM 渲染关联（DrapLang 应用不再黑屏）回归 ==');
try {
  await run();
} catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 5).join('\n'));
}
console.log('');
if (fail === 0) console.log('WM 渲染关联验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
