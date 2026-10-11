/**
 * @file        drapog.apps.js
 * @module      drapog/apps
 * @summary     内置 GUI 应用（Finder / Terminal）
 * @version     0.3.0
 */

import { makeLineWriter } from './drapog.stream.js';

/* ============================================================
   Finder —— 文件管理器
   ============================================================ */
export function createFinderApp({ vfs }) {
  const states = new Map();

  async function refresh(win, state) {
    state.loading = true;
    try {
      const items = await vfs.ls(state.cwd);
      state.items = items || [];
      state.error = items === null ? '无法读取目录' : null;
    } catch (e) {
      state.items = [];
      state.error = e.message;
    }
    state.loading = false;
  }

  function getState(win) {
    let s = states.get(win.id);
    if (!s) {
      s = {
        cwd: '/Users/guest',
        items: [],
        selected: -1,
        loading: false,
        error: null,
        rowH: 26,
        headerH: 32,
      };
      states.set(win.id, s);
      refresh(win, s);
    }
    return s;
  }

  return {
    create(win) { getState(win); },

    render(ctx, win, wm) {
      const s = getState(win);
      const W = win.w;
      const H = win.h - win.TITLEBAR_H;

      // 背景
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(0, 0, W, H);

      // 顶栏
      ctx.fillStyle = '#323237';
      ctx.fillRect(0, 0, W, s.headerH);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, s.headerH);
      ctx.lineTo(W, s.headerH);
      ctx.stroke();

      // 路径
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.cwd, 12, s.headerH / 2 + 1);

      // 列表
      const listY = s.headerH;
      const maxRows = Math.floor((H - listY) / s.rowH);
      const items = s.items.slice(0, maxRows);

      if (s.loading) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('读取中...', 20, listY + 30);
      } else if (s.error) {
        ctx.fillStyle = '#ff8080';
        ctx.fillText(s.error, 20, listY + 30);
      } else if (items.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('空文件夹', 20, listY + 30);
      } else {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const y = listY + i * s.rowH;
          if (i === s.selected) {
            ctx.fillStyle = 'rgba(10,132,255,0.35)';
            ctx.fillRect(0, y, W, s.rowH);
          }
          ctx.font = '16px -apple-system, "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#ddd';
          ctx.fillText(it.type === 'dir' ? '📁' : '📄', 10, y + s.rowH / 2 + 1);

          ctx.fillStyle = it.type === 'dir' ? '#e8e8e8' : '#c8c8c8';
          ctx.font = '13px -apple-system, sans-serif';
          ctx.fillText(it.name, 36, y + s.rowH / 2 + 1);
        }
      }

      // 状态栏
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText(items.length + ' 项', 10, H - 11);
    },

    async onMouseDown(lx, ly, win, wm) {
      const s = getState(win);
      if (ly < s.headerH) return;
      const idx = Math.floor((ly - s.headerH) / s.rowH);
      if (idx < 0 || idx >= s.items.length) { s.selected = -1; return; }
      s.selected = idx;
    },

    onDoubleClick(lx, ly, win, wm) {
      const s = getState(win);
      if (ly < s.headerH) return;
      const idx = Math.floor((ly - s.headerH) / s.rowH);
      if (idx < 0 || idx >= s.items.length) return;
      const it = s.items[idx];
      if (it.type === 'dir') {
        s.cwd = vfs.normalize(s.cwd, it.name);
        s.selected = -1;
        refresh(win, s);
      } else {
        // 双击文件：在标题栏显示
        win.title = it.name;
      }
    },

    async onKeyDown(e, win, wm) {
      const s = getState(win);
      if (e.key === 'Backspace' || e.key === 'ArrowUp') {
        if (e.key === 'Backspace') {
          if (s.cwd !== '/') {
            s.cwd = vfs.normalize(s.cwd, '..');
            s.selected = -1;
            await refresh(win, s);
          }
        } else {
          s.selected = Math.max(0, s.selected - 1);
        }
        return true;
      }
      if (e.key === 'ArrowDown') {
        s.selected = Math.min(s.items.length - 1, s.selected + 1);
        return true;
      }
      if (e.key === 'Enter') {
        const it = s.items[s.selected];
        if (!it) return true;
        if (it.type === 'dir') {
          s.cwd = vfs.normalize(s.cwd, it.name);
          s.selected = -1;
          await refresh(win, s);
        }
        return true;
      }
      return false;
    },

    getCursor(lx, ly) {
      return 'default';
    },
  };
}

/* ============================================================
   Terminal —— 内嵌终端
   ============================================================ */
export function createTerminalApp({ vfs, DrapShell, VM, DrapCC, DrapSYS }) {
  const states = new Map();
  const FONT = '14px Consolas, "Courier New", monospace';
  const LH = 20;
  const PAD = 8;

  function getState(win, wm) {
    let s = states.get(win.id);
    if (!s) {
      s = {
        lines: [],
        input: '',
        cursor: 0,
        history: [],
        histIdx: -1,
        scrollTop: 0,
        cwd: '/Users/guest',
      };
      const push = txt => {
        for (const p of String(txt).split('\n')) s.lines.push(p);
        s.scrollTop = Math.max(0, s.lines.length - visibleRows(win) + 1);
      };
      s.shell = new DrapShell({
        vfs,
        print: push,
        clear: () => { s.lines = []; s.scrollTop = 0; },
        exit: () => { if (wm) wm.closeWindow(win.id); },
        switchToGUI: () => {},
        getDemoSource: () => [
          'entry fn main() -> i32 {',
          '    term_print("Hello, DrapOG!\\n")',
          '    let x = 0',
          '    while (x < 3) {',
          '        term_print("循环中...\\n")',
          '        x = x + 1',
          '    }',
          '    term_print("完成\\n")',
          '    return 0',
          '}'
        ].join('\n'),
      });
      states.set(win.id, s);
      push('DrapOG Terminal');
      push('输入 help 查看命令。');
      push('');
    }
    return s;
  }

  function visibleRows(win) {
    const H = win.h - win.TITLEBAR_H - PAD * 2;
    return Math.max(1, Math.floor(H / LH));
  }

  return {
    create(win, wm) { getState(win, wm); },

    render(ctx, win, wm) {
      const s = getState(win, wm);
      const W = win.w, H = win.h - win.TITLEBAR_H;
      const rows = visibleRows(win);

      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(0, 0, W, H);

      ctx.font = FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const start = s.scrollTop;
      const end = Math.min(s.lines.length, start + rows);
      let y = PAD;
      for (let i = start; i < end; i++) {
        ctx.fillStyle = '#d4d4d4';
        ctx.fillText(s.lines[i], PAD, y);
        y += LH;
      }

      // 提示符
      let cwd = s.shell ? s.shell.cwd : s.cwd;
      if (cwd.startsWith('/Users/guest')) cwd = '~' + cwd.slice('/Users/guest'.length);
      const prompt = 'guest@drapog:' + cwd + '$ ';
      ctx.fillStyle = '#4ec9b0';
      ctx.fillText(prompt, PAD, y);
      const pw = ctx.measureText(prompt).width;
      ctx.fillStyle = '#d4d4d4';
      ctx.fillText(s.input, PAD + pw, y);

      // 光标
      const before = s.input.slice(0, s.cursor);
      const bw = ctx.measureText(before).width;
      ctx.fillStyle = '#d4d4d4';
      ctx.fillRect(PAD + pw + bw, y, 2, 16);
    },

    onMouseDown(lx, ly, win, wm) {
      // 点击聚焦
      wm.bringToFront(win.id);
    },

    async onKeyDown(e, win, wm) {
      const s = getState(win, wm);

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'l') { s.lines = []; s.scrollTop = 0; return true; }
        if (e.key === 'c') return false;
        if (e.key === 'v') return false;   // 让 paste 事件处理
        if (e.key === 'k') { s.lines = []; s.scrollTop = 0; return true; }
        return false;
      }

      if (e.key === 'Enter') {
        const line = s.input;
        // 显示提示符 + 输入
        let cwd = s.shell.cwd;
        if (cwd.startsWith('/Users/guest')) cwd = '~' + cwd.slice('/Users/guest'.length);
        s.lines.push('guest@drapog:' + cwd + '$ ' + line);
        s.input = ''; s.cursor = 0;
        s.scrollTop = Math.max(0, s.lines.length - visibleRows(win) + 1);
        if (line.trim()) {
          if (line.trim() && s.history[s.history.length - 1] !== line.trim()) {
            s.history.push(line.trim());
          }
          s.histIdx = -1;
          try { await s.shell.execute(line); } catch (err) { s.lines.push('错误: ' + err.message); }
        }
        return true;
      }

      if (e.key === 'Backspace') {
        if (s.cursor > 0) {
          s.input = s.input.slice(0, s.cursor - 1) + s.input.slice(s.cursor);
          s.cursor--;
        }
        return true;
      }
      if (e.key === 'Delete') {
        s.input = s.input.slice(0, s.cursor) + s.input.slice(s.cursor + 1);
        return true;
      }
      if (e.key === 'ArrowLeft')  { if (s.cursor > 0) s.cursor--; return true; }
      if (e.key === 'ArrowRight') { if (s.cursor < s.input.length) s.cursor++; return true; }
      if (e.key === 'Home') { s.cursor = 0; return true; }
      if (e.key === 'End')  { s.cursor = s.input.length; return true; }

      if (e.key === 'ArrowUp') {
        if (s.history.length === 0) return true;
        s.histIdx = Math.max(0, (s.histIdx < 0 ? s.history.length : s.histIdx) - 1);
        s.input = s.history[s.histIdx];
        s.cursor = s.input.length;
        return true;
      }
      if (e.key === 'ArrowDown') {
        if (s.histIdx < 0) return true;
        s.histIdx++;
        if (s.histIdx >= s.history.length) { s.histIdx = -1; s.input = ''; }
        else s.input = s.history[s.histIdx];
        s.cursor = s.input.length;
        return true;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        s.input = s.input.slice(0, s.cursor) + e.key + s.input.slice(s.cursor);
        s.cursor++;
        return true;
      }

      return false;
    },

    onPaste(text, win) {
      const s = states.get(win.id);
      if (!s) return;
      const line = text.replace(/\r/g, '').split('\n')[0];
      s.input = s.input.slice(0, s.cursor) + line + s.input.slice(s.cursor);
      s.cursor += line.length;
    },

    getCursor() { return 'text'; },
  };
}