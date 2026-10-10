/**
 * @file        System/Boot/cmd.js
 * @module      drapog/boot/cmd
 * @summary     CMD 模式引导（支持滚动 + 系统调用）
 * @version     0.5.0
 */

import { VM } from '../../drapog.vm.js';
import { DrapCC } from '../../drapcc.js';
import { DrapShell } from '../../drapog.shell.js';
import { VFS } from '../../drapog.vfs.js';
import { DrapSYS } from '../../drapog.sys.js';

const screen = document.getElementById('screen');

export function startCMD() {
  return new Promise(resolve => {
    const ctx = screen.getContext('2d');
    const vfs = new VFS();
    const state = {
      lines: [], input: '', cursor: 0,
      history: [], histIdx: -1,
      scrollTop: 0,
    };
    const FONT = '15px Consolas, monospace';
    const LH = 22, PAD = 16;

    function visibleLines() { return Math.floor((screen.height - PAD * 2) / LH); }
    function prompt() { return 'guest@drapog:' + shortCwd() + '$ '; }

    function shortCwd() {
      let c = shell.cwd;
      if (c.startsWith('/Users/guest')) c = '~' + c.slice('/Users/guest'.length);
      return c || '/';
    }

    function maxScroll() {
      return Math.max(0, state.lines.length + 1 - visibleLines());
    }

    function clampScroll() {
      const m = maxScroll();
      if (state.scrollTop < 0) state.scrollTop = 0;
      if (state.scrollTop > m) state.scrollTop = m;
    }

    function pushLine(s) {
      for (const p of String(s).split('\n')) state.lines.push(p);
      state.scrollTop = maxScroll();
    }

    function draw() {
      clampScroll();
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(0, 0, screen.width, screen.height);
      ctx.font = FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const maxL = visibleLines();
      const start = state.scrollTop;
      const end = Math.min(state.lines.length, start + maxL);
      let y = PAD;
      for (let i = start; i < end; i++) {
        ctx.fillStyle = '#d4d4d4';
        ctx.fillText(state.lines[i], PAD, y);
        y += LH;
      }

      const atBottom = state.scrollTop >= maxScroll();
      if (atBottom) {
        const ps = prompt();
        ctx.fillStyle = '#4ec9b0';
        ctx.fillText(ps, PAD, y);
        const pw = ctx.measureText(ps).width;
        ctx.fillStyle = '#d4d4d4';
        ctx.fillText(state.input, PAD + pw, y);
        const before = state.input.slice(0, state.cursor);
        const bw = ctx.measureText(before).width;
        ctx.fillRect(PAD + pw + bw, y, 2, 18);
      }

      if (!atBottom) {
        const total = state.lines.length;
        const pct = total > 0 ? Math.round((state.scrollTop + maxL) / total * 100) : 100;
        ctx.fillStyle = 'rgba(78, 201, 176, 0.7)';
        ctx.font = '12px Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('▲ ' + pct + '%  PageDown 到底部', screen.width - PAD, screen.height - 20);
      }
    }

    async function onKey(e) {
      if (e.key === 'PageUp') {
        e.preventDefault();
        state.scrollTop -= Math.max(1, visibleLines() - 1);
        draw(); return;
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        state.scrollTop += Math.max(1, visibleLines() - 1);
        draw(); return;
      }
      if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        state.scrollTop = 0; draw(); return;
      }
      if (e.key === 'End' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        state.scrollTop = maxScroll(); draw(); return;
      }
      if (e.key === 'ArrowUp' && e.shiftKey) {
        e.preventDefault();
        state.scrollTop -= 1; draw(); return;
      }
      if (e.key === 'ArrowDown' && e.shiftKey) {
        e.preventDefault();
        state.scrollTop += 1; draw(); return;
      }

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'l') { state.lines = []; state.scrollTop = 0; draw(); e.preventDefault(); }
        if (e.key === 'c') { e.preventDefault(); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const line = state.input;
        pushLine(prompt() + line);
        state.input = ''; state.cursor = 0;
        state.scrollTop = maxScroll();
        draw();
        if (line.trim()) {
          try { await shell.execute(line); } catch (err) { pushLine('错误: ' + err.message); }
        }
        draw();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (state.cursor > 0) {
          state.input = state.input.slice(0, state.cursor - 1) + state.input.slice(state.cursor);
          state.cursor--; draw();
        }
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        state.input = state.input.slice(0, state.cursor) + state.input.slice(state.cursor + 1);
        draw(); return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (state.cursor > 0) { state.cursor--; draw(); } return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); if (state.cursor < state.input.length) { state.cursor++; draw(); } return; }
      if (e.key === 'Home') { e.preventDefault(); state.cursor = 0; draw(); return; }
      if (e.key === 'End') { e.preventDefault(); state.cursor = state.input.length; draw(); return; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.history.length === 0) return;
        state.histIdx = Math.max(0, (state.histIdx < 0 ? state.history.length : state.histIdx) - 1);
        state.input = state.history[state.histIdx]; state.cursor = state.input.length; draw();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.histIdx < 0) return;
        state.histIdx++;
        if (state.histIdx >= state.history.length) { state.histIdx = -1; state.input = ''; }
        else state.input = state.history[state.histIdx];
        state.cursor = state.input.length; draw();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        state.input = state.input.slice(0, state.cursor) + e.key + state.input.slice(state.cursor);
        state.cursor++; draw();
      }
    }

    function onPaste(e) {
      const text = (e.clipboardData || window.clipboardData).getData('text') || '';
      if (!text) return;
      e.preventDefault();
      const line = text.replace(/\r/g, '').split('\n')[0];
      state.input = state.input.slice(0, state.cursor) + line + state.input.slice(state.cursor);
      state.cursor += line.length;
      draw();
    }

    function onWheel(e) {
      e.preventDefault();
      state.scrollTop += (e.deltaY > 0 ? 3 : -3);
      draw();
    }

    function getDemoSource() {
      return [
        'struct Point { x: i32, y: i32 }',
        '',
        'fn add(a: i32, b: i32) -> i32 {',
        '    return a + b',
        '}',
        '',
        'fn greet(name: str) -> str {',
        '    return "Hello, " + name + "!"',
        '}',
        '',
        'entry fn main() -> i32 {',
        '    term_print("=== 函数 ===\\n")',
        '    let n = add(3, 4)',
        '    term_print("3 + 4 = ")',
        '    term_print(n)',
        '    term_print("\\n")',
        '',
        '    term_print("=== 字符串 ===\\n")',
        '    let msg = greet("DrapOG")',
        '    term_print(msg)',
        '    term_print("\\n")',
        '',
        '    term_print("=== 数组 ===\\n")',
        '    let arr = [10, 20, 30]',
        '    term_print("arr.len = ")',
        '    term_print(arr.len)',
        '    term_print("\\n")',
        '    term_print("arr[1] = ")',
        '    term_print(arr[1])',
        '    term_print("\\n")',
        '    arr.push(40)',
        '    term_print("push 后 len = ")',
        '    term_print(arr.len)',
        '    term_print("\\n")',
        '',
        '    term_print("=== 结构体 ===\\n")',
        '    let p = Point { x: 5, y: 7 }',
        '    term_print("p.x = ")',
        '    term_print(p.x)',
        '    term_print(", p.y = ")',
        '    term_print(p.y)',
        '    term_print("\\n")',
        '',
        '    term_print("=== 系统调用 ===\\n")',
        '    let cfg = syscall fs_read("/System/Settings/boot.json")',
        '    if (len(cfg) == 0) {',
        '        term_print("配置文件读取失败\\n")',
        '    } else {',
        '        term_print("boot.json = ")',
        '        term_print(cfg)',
        '        term_print("\\n")',
        '    }',
        '    let t = syscall time_now()',
        '    term_print("当前时间戳 = ")',
        '    term_print(t)',
        '    term_print("\\n")',
        '',
        '    return 0',
        '}'
      ].join('\n');
    }

    const shell = new DrapShell({
      vfs,
      print: s => { pushLine(s); draw(); },
      clear: () => { state.lines = []; state.scrollTop = 0; draw(); },
      exit: () => { cleanup(); resolve(); },
      switchToGUI: async () => {
        cleanup();
        const { startGUI } = await import('./gui.js');
        await startGUI({ vfs });
      },
      getDemoSource,
      runDemo: async () => {
        const src = getDemoSource();
        pushLine('编译 demo.drap...');
        draw();
        try {
          const program = new DrapCC(src).compile();
          pushLine('编译完成，' + program.instructions.length + ' 条指令');
          pushLine('执行中...');
          pushLine('---');
          draw();
          let lastLen = 0;
          let pending = '';
          const vm = new VM();
          vm.load(program);
          const sys = new DrapSYS({
            vm,
            vfs,
            out: s => {
              // 系统调用直接输出：直接 push 一行
              const ls = String(s).split('\n');
              for (const l of ls) pushLine(l);
              draw();
            },
          });
          vm.sys = sys;
          vm.onOutput = partial => {
            const fresh = partial.slice(lastLen);
            lastLen = partial.length;
            if (!fresh) return;
            pending += fresh;
            const parts = pending.split('\n');
            pending = parts.pop();          // 最后一个可能是不完整的行
            for (const l of parts) pushLine(l);
            draw();
          };
          await vm.run();
          if (pending) { pushLine(pending); pending = ''; }
          pushLine('---');
          pushLine('执行完成');
        } catch (err) {
          pushLine('编译/执行错误: ' + err.message);
        }
        draw();
      }
    });

    function onResize() { draw(); }
    function cleanup() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('resize', onResize);
      screen.removeEventListener('wheel', onWheel);
      window.__drapog_redraw = null;
    }

    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    window.addEventListener('resize', onResize);
    screen.addEventListener('wheel', onWheel, { passive: false });
    window.__drapog_redraw = draw;

    pushLine('DrapOG CMD v0.5');
    pushLine('Whetstone BIOS v1.0');
    pushLine('');
    pushLine('输入 help 查看可用命令。');
    pushLine('');
    pushLine('滚动：PageUp / PageDown 或 Shift+方向键 或 鼠标滚轮');
    pushLine('');
    draw();

    shell.tryRestore().then(draw).catch(() => {});
  });
}