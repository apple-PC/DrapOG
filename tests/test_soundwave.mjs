import { readFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { launchDrapAppProgram, drapAppBridge } from '../src/drapog.launcher.js';

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
const tick = () => new Promise(r => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 5; i++) await tick(); }

function makeWM() {
  let id = 1, lastWin = null;
  return {
    T: { palette: { bg: [18, 18, 24], fg: [235, 235, 245], accent: [10, 132, 255], toolbar: [40, 43, 54], sel: [56, 62, 78] } },
    createWindow(o) { lastWin = { id: id++, title: o.title, w: o.w, h: o.h, __sys: null }; return lastWin; },
    closeWindow() {}, drawAppIcon() {}, roundRect() {},
    getWin() { return lastWin; },
  };
}
function mockCtx() {
  const rec = { fill: 0, stroke: 0, text: 0, arc: 0, rrect: 0 };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 8 });
      if (/Style|Alpha|Width|Font|Align|Baseline|Cap|Join/.test(String(k))) return t[k];
      if (typeof k === 'string') return () => { if (k === 'fill') rec.fill++; else if (k === 'stroke') rec.stroke++; else if (k === 'fillText') rec.text++; else if (k === 'arc') rec.arc++; };
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, rec };
}

const program = new DrapCC(readFileSync('System/Apps/SoundWave.app/main.drapp', 'utf8')).compile();

async function run() {
  const wm = makeWM();
  const sys = launchDrapAppProgram(wm, {}, program, null, null, 'soundwave');
  const win = wm.getWin();
  const st = sys.drapWins.get(win.id);
  await settle();

  const ops = () => { const m = {}; for (const o of st.drawOps) m[o.op] = (m[o.op] || 0) + 1; return m; };
  const texts = () => st.drawOps.filter(o => o.op === 'text' || o.op === 'textc').map(o => o.text);

  ok(win.title === '音波', '窗口标题为「音波」: ' + win.title);
  ok(st.tickMs === 16, '声明 16ms 帧驱动（60fps）: ' + st.tickMs);
  ok(ops().rrect > 40, '频谱柱模式绘制柱体: rrect=' + ops().rrect);
  ok(texts().includes('音波'), '顶栏标题文字存在');
  ok(texts().some(t => t.indexOf('未加载音源') >= 0), '无音源时提示可用「打开 / 麦克风」');

  // 四个模式按钮以手绘图标 id 注册（win_button 复用图标名）
  const btnIds = st.controls.filter(c => c.type === 'button').map(c => c.id);
  ok(['bars', 'ring', 'wave', 'particles'].every(k => btnIds.includes(k)), '模式按钮使用图标 id: ' + btnIds.join(','));
  ok(btnIds.includes('open') && btnIds.includes('mic'), '打开 / 麦克风 图标按钮存在');

  // 切模式
  sys.injectWinEvent(win.id, 'click ring'); await settle();
  ok(ops().line >= 60, '环形波模式绘制放射线: line=' + ops().line);
  ok(st.drawOps.some(o => o.op === 'arc'), '环形波含外环 arc');
  sys.injectWinEvent(win.id, 'click wave'); await settle();
  ok(ops().line >= 60 && !st.drawOps.some(o => o.op === 'arc'), '波形线模式只画折线');
  sys.injectWinEvent(win.id, 'click particles'); await settle();
  ok(ops().circle >= 60, '粒子模式绘制粒子圆: circle=' + ops().circle);

  // 接上音频引擎：频段驱动柱高、srcName 显示在顶栏
  const calls = [];
  sys.audio = {
    state: () => '1|4200|30000|demo.mp3',
    band: (i) => 20 + (i % 7) * 9,
    play: () => calls.push('play'), pause: () => calls.push('pause'),
    seek: (p) => calls.push('seek:' + p), beep() {}, stop() {}, micOn() { calls.push('mic'); },
  };
  sys.injectWinEvent(win.id, 'click bars'); await settle();
  sys.injectWinEvent(win.id, 'paint'); await settle();
  ok(texts().includes('demo.mp3'), '顶栏显示当前音源名');
  ok(texts().some(t => t === '0:04'), '播放进度显示 0:04: ' + texts().join(','));
  ok(texts().some(t => t === '0:30'), '总时长显示 0:30');

  // 点击进度条跳转
  sys.injectWinEvent(win.id, 'click 500 555'); await settle();
  const seek = calls.find(c => c.startsWith('seek:'));
  ok(!!seek && Math.abs(parseFloat(seek.slice(5)) - 555) < 2, '点击进度条按千分比跳转: ' + seek);

  // 播放 / 暂停按钮
  sys.injectWinEvent(win.id, 'click pause'); await settle();
  ok(calls.includes('pause'), '点击暂停调用音频暂停');
  sys.injectWinEvent(win.id, 'click play'); await settle();
  ok(calls.includes('play'), '点击播放调用音频播放');

  // 全模式渲染不抛错（宿主桥接重放 line/circle/arc/rrect）
  const { ctx, rec } = mockCtx();
  for (const m of ['bars', 'ring', 'wave', 'particles']) {
    sys.injectWinEvent(win.id, 'click ' + m); await settle();
    drapAppBridge.render(ctx, win, wm);
  }
  ok(rec.stroke > 0 && rec.arc > 0, '桥接渲染矢量为真实 canvas 调用: stroke=' + rec.stroke + ' arc=' + rec.arc);

  sys.injectWinEvent(win.id, 'close'); await settle();
}

console.log('== 音波 SoundWave（音频频谱可视化）无头冒烟 ==');
try { await run(); } catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 4).join('\n'));
}
console.log('');
if (fail === 0) console.log('音波验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
