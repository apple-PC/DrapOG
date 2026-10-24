import { readFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { VM } from '../src/drapog.vm.js';
import { DrapSYS } from '../src/drapog.sys.js';

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
const tick = () => new Promise(r => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 5; i++) await tick(); }

/* 语言层新增能力（媒体类应用的基础设施）：
   · 浮点字面量（3.14）+ fmul / fdiv / fmod（* 与 / 是整数语义，动画必须走浮点内建）
   · 矢量绘图原语 line / circle / arc / rrect + alpha / set_line
   · 帧驱动 tick + millis、时间分量 time_parts
   · 音频桥 win_audio*（无引擎时安全退化） */

const SRC = `
import math
entry fn main() -> i32 {
    let win = syscall win_create("媒体原语", 400, 300)
    let f = 0.0
    let g = 0.0
    let i = 0
}
event fn on_paint() {
    syscall win_set_color(10, 20, 30)
    syscall win_fill_rect(0, 0, 400, 300)
    syscall win_set_line(4)
    syscall win_alpha(45)
    syscall win_line(0, 0, 10, 10)
    syscall win_circle(20, 20, 8, 0)
    syscall win_circle(20, 20, 12, 1)
    syscall win_arc(40, 40, 16, 0, 180)
    syscall win_rrect(5, 50, 90, 24, 6)
    syscall win_alpha(100)
    syscall win_tick(16)
    f = fmul(1.5, 4.0)
    g = fdiv(1.0, 4.0)
    syscall win_text(0, 90, itoa(round(f)) + "|" + itoa(round(fmul(g, 100))))
    syscall win_text(0, 110, syscall time_parts(1700000000, 1))
    syscall win_text(0, 130, syscall win_audio_state())
    syscall win_text(0, 150, itoa(syscall win_audio_band(3, 20)))
    syscall win_textc(200, 170, "居中")
}
`;

function makeSys(audio) {
  const vm = new VM();
  vm.load(new DrapCC(SRC).compile());
  let wid = 1;
  const sys = new DrapSYS({ vm, vfs: {}, out: () => {}, audio, onWinCreate: () => 1 });
  vm.sys = sys;
  vm.run().catch(() => {});
  return { vm, sys, wid };
}

async function run() {
  // —— 1. 无音频引擎：绘图 / 帧驱动 / 时间仍工作，音频安全退化 ——
  const { sys } = makeSys(null);
  await settle();
  const st = sys.drapWins.get(1);
  const ops = st.drawOps.map(o => o.op);
  ok(ops.includes('line'), 'win_line 产生 line 指令');
  ok(ops.includes('circle'), 'win_circle 产生 circle 指令');
  ok(ops.includes('arc'), 'win_arc 产生 arc 指令');
  ok(ops.includes('rrect'), 'win_rrect 产生 rrect 指令');

  const line = st.drawOps.find(o => o.op === 'line');
  ok(line.lineW === 4, 'win_set_line 影响线宽: ' + line.lineW);
  ok(line.alpha === 45, 'win_alpha 影响透明度: ' + line.alpha);
  ok(st.drawOps.filter(o => o.op === 'circle').length === 2, 'circle 填充/描边各一条');
  const circles = st.drawOps.filter(o => o.op === 'circle');
  ok(circles[0].fill === true && circles[1].fill === false, 'circle mode 0=填充 1=描边');
  const arc = st.drawOps.find(o => o.op === 'arc');
  ok(arc.a0 === 0 && arc.a1 === 180 && arc.r === 16, 'arc 角度与半径正确');

  const tail = st.drawOps.filter(o => o.op === 'text').map(o => o.text);
  ok(tail[0] === '6|25', '浮点字面量 + fmul/fdiv 正确: ' + tail[0]);
  ok(tail[1] === '2023|11|14|22|13|20|2', 'time_parts(utc) 分量正确: ' + tail[1]);
  ok(tail[2] === '0|0|0|', '无音频引擎时 state 退化: ' + tail[2]);
  ok(tail[3] === '0', '无音频引擎时 band 退化: ' + tail[3]);
  ok(st.tickMs === 16, 'win_tick 设置帧间隔: ' + st.tickMs);
  const tc = st.drawOps.find(o => o.op === 'textc');
  ok(tc && tc.x === 200 && tc.text === '居中', 'win_textc 产生居中文本指令');

  // 帧驱动：宿主 render 时按间隔注入 paint（而非每次调用都注入）
  const { drapAppBridge } = await import('../src/drapog.launcher.js');
  const wm = { T: { palette: { bg: [0, 0, 0], fg: [255, 255, 255], accent: [10, 132, 255], toolbar: [30, 30, 30], sel: [50, 50, 50] } }, roundRect() {}, drawAppIcon() {} };
  const win = { id: 1, title: 'x', w: 400, h: 300, __sys: sys };
  st.tickBusy = false;
  st.lastTick = 0;
  let injected = 0;
  const origInject = sys.injectWinEvent.bind(sys);
  sys.injectWinEvent = (id, ev) => { injected++; origInject(id, ev); };
  const ctx = new Proxy({}, {
    get(t, k) { if (k === 'measureText') return () => ({ width: 8 }); if (typeof k === 'string') return () => {}; return undefined; },
    set() { return true; },
  });
  drapAppBridge.render(ctx, win, wm);
  ok(injected === 1, 'render 在 tickMs 到期时注入一帧: ' + injected);
  drapAppBridge.render(ctx, win, wm);
  ok(injected === 1, '未到期不重复注入（tickBusy 守卫）: ' + injected);
  await settle();

  // —— 2. 有音频引擎：状态 / 频段 / 控制命令 ——
  const calls = [];
  const fakeAudio = {
    play() { calls.push('play'); }, pause() { calls.push('pause'); }, stop() { calls.push('stop'); },
    micOn() { calls.push('mic'); }, micOff() { calls.push('micOff'); }, systemOn() { calls.push('sys'); },
    seek(p) { calls.push('seek:' + p); }, beep(f, d) { calls.push('beep:' + f + ':' + d); },
    state() { return '1|1200|3000|测试.mp3'; }, band(i, n) { return i % 5; },
    async open() { return 'track.mp3'; },
  };
  const b = makeSys(fakeAudio);
  await settle();
  ok(b.sys.drapWins.get(1).drawOps.some(o => o.op === 'text' && o.text === '1|1200|3000|测试.mp3'), '音频 state 透传');
  ok(b.sys.drapWins.get(1).drawOps.some(o => o.op === 'text' && o.text === '3'), '音频 band 透传 (i=3 → 3)');

  b.sys.win_audio(0); b.sys.win_audio(1); b.sys.win_audio(2); b.sys.win_audio(3);
  b.sys.win_audio_seek(500); b.sys.win_audio_beep(880, 200);
  const name = b.sys.vm.readStr(await b.sys.win_audio_open());
  ok(name === 'track.mp3', 'win_audio_open 返回文件名: ' + name);
  ok(calls.join(',') === 'play,pause,stop,mic,seek:500,beep:880:200', '音频控制命令序列: ' + calls.join(','));
}

console.log('== 语言层媒体能力（矢量绘图 / 帧驱动 / 浮点 / 音频桥） ==');
try {
  await run();
} catch (e) {
  fail++;
  console.log('  ✗ 运行异常: ' + e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 4).join('\n'));
}
console.log('');
if (fail === 0) console.log('媒体能力验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
