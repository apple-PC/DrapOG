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
    T: { palette: { bg: [245, 245, 247], fg: [28, 28, 32], accent: [10, 132, 255], toolbar: [232, 232, 238], sel: [214, 224, 240] } },
    createWindow(o) { lastWin = { id: id++, title: o.title, w: o.w, h: o.h, __sys: null }; return lastWin; },
    closeWindow() {}, drawAppIcon() {}, roundRect() {},
    getWin() { return lastWin; },
  };
}

const program = new DrapCC(readFileSync('System/Apps/Chrono.app/main.drapp', 'utf8')).compile();

async function run() {
  const wm = makeWM();
  const sys = launchDrapAppProgram(wm, {}, program, null, null, 'chrono');
  const win = wm.getWin();
  const st = sys.drapWins.get(win.id);
  const beeps = [];
  sys.audio = { beep: (f, d) => beeps.push(f), state: () => '0|0|0|', band: () => 0, play() {}, pause() {}, stop() {}, seek() {} };
  await settle();

  const texts = () => st.drawOps.filter(o => o.op === 'text' || o.op === 'textc').map(o => o.text);
  const ops = () => { const m = {}; for (const o of st.drawOps) m[o.op] = (m[o.op] || 0) + 1; return m; };

  ok(win.title === '计时器', '窗口标题为「计时器」: ' + win.title);
  ok(st.tickMs === 16, '声明 16ms 帧驱动: ' + st.tickMs);
  // 四个视图按钮以手绘图标 id 注册
  const btnIds = st.controls.filter(c => c.type === 'button').map(c => c.id);
  ok(['globe', 'clock', 'stopwatch', 'timer'].every(k => btnIds.includes(k)), '视图按钮使用图标 id: ' + btnIds.join(','));

  // —— 视图 1：时钟（默认）——
  ok(texts().some(t => /^\d{1,2}:\d{2}:\d{2}$/.test(t)), '时钟视图显示 HH:MM:SS: ' + texts().join(','));
  ok(texts().some(t => t.indexOf('星期') > 0), '时钟视图显示日期与星期');
  ok(ops().line >= 12 && ops().circle >= 2, '时钟视图绘制表盘刻度与指针: line=' + ops().line);

  // —— 视图 0：世界时间 ——
  sys.injectWinEvent(win.id, 'click globe'); await settle();
  const cities = ['北京', '东京', '悉尼', '迪拜', '巴黎', '伦敦', '纽约', '洛杉矶'];
  ok(cities.every(c => texts().includes(c)), '世界时间列出 8 个城市');
  ok(texts().filter(t => /^\d{1,2}:\d{2}$/.test(t)).length >= 9, '每个城市 + 本地时间各有一行时刻');
  ok(texts().some(t => t.indexOf('本地时间') >= 0), '显示本地时间说明');
  ok(texts().some(t => /^UTC[+-]?\d+$/.test(t)), '显示时区偏移');

  // —— 视图 2：秒表 ——
  sys.injectWinEvent(win.id, 'click stopwatch'); await settle();
  ok(texts().includes('0:00.00'), '秒表初始为 0:00.00');
  ok(texts().includes('开始'), '未运行时显示「开始」');
  sys.injectWinEvent(win.id, 'click play'); await settle();
  ok(texts().includes('暂停'), '运行中显示「暂停」');
  await new Promise(r => setTimeout(r, 25));
  sys.injectWinEvent(win.id, 'click lap'); await settle();
  ok(texts().includes('#1'), '计次后出现第 1 条记录');
  ok(texts().some(t => /^\d+:\d{2}\.\d{2}$/.test(t)), '计次记录为 MM:SS.CC 格式');
  sys.injectWinEvent(win.id, 'click reset'); await settle();
  ok(texts().includes('0:00.00') && !texts().includes('#1'), '复位清空计时与计次');

  // —— 视图 3：计时器 ——
  sys.injectWinEvent(win.id, 'click timer'); await settle();
  ok(texts().includes('5:00'), '默认时长为 5:00');
  ok(ops().arc === 1, '倒计时绘制进度弧');
  for (const l of ['1 分', '3 分', '5 分', '10 分', '25 分']) ok(texts().includes(l), '预设 chip 存在: ' + l);
  // 选「1 分」预设（chip 命中区 x 24..92 / y 392..422）
  sys.injectWinEvent(win.id, 'click 60 405'); await settle();
  ok(texts().includes('1:00'), '选择预设后时长变为 1:00');

  // 冻结毫秒时钟 → 开始 → 快进 61 秒 → 到点提示
  let fake = Date.now();
  sys.table[0x8e] = () => fake;
  sys.injectWinEvent(win.id, 'click play'); await settle();
  ok(texts().includes('暂停'), '计时器运行中显示「暂停」');
  fake += 61000;
  sys.injectWinEvent(win.id, 'paint'); await settle();
  ok(texts().includes('时间到'), '倒计时归零显示「时间到」');
  ok(beeps.length >= 1, '到点触发提示音: ' + beeps.join(','));

  // +1 / -1 分钟
  sys.injectWinEvent(win.id, 'click reset'); await settle();
  sys.injectWinEvent(win.id, 'click plus'); await settle();
  sys.injectWinEvent(win.id, 'click 60 405'); await settle();
  sys.injectWinEvent(win.id, 'click plus'); await settle();
  ok(texts().includes('2:00'), '+1 分钟生效: ' + texts().slice(0, 6).join(','));

  // 全视图渲染不抛错
  const ctx = new Proxy({}, {
    get(t, k) { if (k === 'measureText') return () => ({ width: 8 }); if (typeof k === 'string') return () => {}; return undefined; },
    set() { return true; },
  });
  for (const v of ['globe', 'clock', 'stopwatch', 'timer']) {
    sys.injectWinEvent(win.id, 'click ' + v); await settle();
    drapAppBridge.render(ctx, win, wm);
  }
  ok(true, '四视图桥接渲染无异常');

  sys.injectWinEvent(win.id, 'close'); await settle();
}

console.log('== 计时器 Chrono（世界时间 / 时钟 / 秒表 / 计时器）无头冒烟 ==');
try { await run(); } catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 4).join('\n'));
}
console.log('');
if (fail === 0) console.log('计时器验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
