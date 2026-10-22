/**
 * @file        drapog.apps.js
 * @module      drapog/apps
 * @summary     内置 GUI 应用（Finder / Terminal / TextEdit / Settings / About / AppMgr）
 * @version     1.1.0
 */

import { makeLineWriter } from './drapog.stream.js';

/* ============================================================
   受保护的系统目录（进入需要权限）
   ============================================================ */
const PROTECTED = ['/System'];

/* ============================================================
   Finder —— 文件管理器
   顶部工具栏：上一级 / 新建文件夹 / 新建文本 / 刷新 / 删除
   地址栏 + 列表 + 状态栏
   新建时进入命名输入（支持实体键盘与软键盘）
   进入 /System 等系统目录需弹窗授权
   双击文件可预览内容
   ============================================================ */
export function createFinderApp({ vfs }) {
  const states = new Map();

  const TOOLBAR_H = 38;   // 工具栏高度
  const ADDR_H = 26;      // 地址栏高度
  const STATUS_H = 22;    // 状态栏高度
  const ROW_H = 28;       // 列表行高

  // 工具栏按钮定义（id / 图标 / 提示）
  const TOOLBUTTONS = [
    { id: 'parent',    icon: '↑',  tip: '上一级' },
    { id: 'newFolder', icon: '📁', tip: '新建文件夹' },
    { id: 'newFile',   icon: '📄', tip: '新建文本' },
    { id: 'refresh',   icon: '⟳',  tip: '刷新' },
    { id: 'delete',    icon: '🗑',  tip: '删除' },
  ];

  function buttonRects(win) {
    const x0 = 8, y = 4, w = 34, h = 30, gap = 4;
    return TOOLBUTTONS.map((b, i) => ({ ...b, x: x0 + i * (w + gap), y, w, h }));
  }

  // 权限弹窗矩形
  function permRects(win) {
    const bw = 260, bh = 132;
    const bx = Math.round((win.w - bw) / 2), by = Math.round((win.h - bh) / 2);
    const btnW = 100, btnH = 34;
    return {
      bx, by, bw, bh,
      allow: { x: bx + 18, y: by + bh - 46, w: btnW, h: btnH },
      deny:  { x: bx + bw - 18 - btnW, y: by + bh - 46, w: btnW, h: btnH },
    };
  }

  function viewerRects(win) {
    const bw = Math.min(win.w - 24, 360), bh = Math.min(win.h - 24, 300);
    const bx = Math.round((win.w - bw) / 2), by = Math.round((win.h - bh) / 2);
    return { bx, by, bw, bh, close: { x: bx + bw - 26, y: by + 6, w: 20, h: 20 } };
  }

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

  // 导航：进入 target；若 target 落在受保护目录且未授权，则弹出权限请求
  async function navigate(win, state, target) {
    for (const p of PROTECTED) {
      if (target === p || target.startsWith(p + '/')) {
        if (!state.sysAccess) { state.permPrompt = { target }; return; }
      }
    }
    state.cwd = target;
    state.selected = -1;
    state.error = null;
    await refresh(win, state);
  }

  async function openViewer(win, state, name) {
    const path = vfs.normalize(state.cwd, name);
    let content = await vfs.read(path);
    if (content === null || content === undefined) content = '(空或无法读取)';
    state.viewer = { name, content: String(content), scroll: 0 };
  }

  async function doToolbar(win, state, id) {
    if (id === 'parent') {
      if (state.cwd !== '/') await navigate(win, state, vfs.normalize(state.cwd, '..'));
    } else if (id === 'refresh') {
      await refresh(win, state);
    } else if (id === 'newFolder' || id === 'newFile') {
      state.naming = { kind: id === 'newFolder' ? 'dir' : 'file', value: '' };
    } else if (id === 'delete') {
      if (state.selected < 0) return;
      const it = state.items[state.selected];
      if (!it) return;
      if (state.cwd.startsWith('/System')) { state.error = '系统目录受保护，禁止删除'; return; }
      const target = vfs.normalize(state.cwd, it.name);
      const ok = await moveToTrash(vfs, target);   // 删除 = 移到废纸篓（可还原）
      if (!ok) state.error = '移到废纸篓失败';
      state.selected = -1;
      await refresh(win, state);
    }
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
        naming: null,        // { kind:'dir'|'file', value:string }
        permPrompt: null,    // { target:string }
        viewer: null,        // { name, content, scroll }
        sysAccess: false,    // 本次会话是否已授权进入系统目录
      };
      states.set(win.id, s);
      refresh(win, s);
      if (win.__openPath) { const p0 = win.__openPath; win.__openPath = null; navigate(win, s, p0); }
    }
    return s;
  }

  function listTop(win) { return TOOLBAR_H + ADDR_H; }

  return {
    create(win) { getState(win); },

    render(ctx, win, wm) {
      const s = getState(win);
      const W = win.w;
      const H = win.h - win.TITLEBAR_H;

      // 背景
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(0, 0, W, H);

      /* ---------- 工具栏 ---------- */
      ctx.fillStyle = '#323237';
      ctx.fillRect(0, 0, W, TOOLBAR_H);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, TOOLBAR_H); ctx.lineTo(W, TOOLBAR_H); ctx.stroke();

      for (const b of buttonRects(win)) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        wm.roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        wm.roundRect(b.x, b.y, b.w, b.h, 6); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '16px -apple-system, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.icon, b.x + b.w / 2, b.y + b.h / 2);
      }

      /* ---------- 地址栏 ---------- */
      const ay = TOOLBAR_H;
      ctx.fillStyle = '#26262b';
      ctx.fillRect(0, ay, W, ADDR_H);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(0, ay + ADDR_H); ctx.lineTo(W, ay + ADDR_H); ctx.stroke();

      if (s.naming) {
        // 命名输入态：地址栏变为输入框
        ctx.fillStyle = '#9cf';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const label = s.naming.kind === 'dir' ? '新建文件夹: ' : '新建文本: ';
        ctx.fillText(label, 10, ay + ADDR_H / 2);
        const lw = ctx.measureText(label).width;
        ctx.fillStyle = '#fff';
        ctx.font = '14px -apple-system, sans-serif';
        const val = s.naming.value;
        ctx.fillText(val, 10 + lw + 2, ay + ADDR_H / 2);
        const cw = ctx.measureText(val).width;
        ctx.fillStyle = '#fff';
        ctx.fillRect(10 + lw + 2 + cw, ay + 5, 2, ADDR_H - 10);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(s.cwd, 12, ay + ADDR_H / 2 + 1);
      }

      /* ---------- 列表 ---------- */
      const top = listTop(win);
      const maxRows = Math.max(0, Math.floor((H - top - STATUS_H) / ROW_H));
      const items = s.items.slice(0, maxRows);

      if (s.loading) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('读取中...', 20, top + 20);
      } else if (s.error) {
        ctx.fillStyle = '#ff8080';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(s.error, 20, top + 20);
      } else if (items.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('空文件夹', 20, top + 20);
      } else {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const y = top + i * ROW_H;
          if (i === s.selected) {
            ctx.fillStyle = 'rgba(10,132,255,0.35)';
            ctx.fillRect(0, y, W, ROW_H);
          }
          ctx.font = '16px -apple-system, "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ddd';
          ctx.fillText(it.type === 'dir' ? '📁' : '📄', 10, y + ROW_H / 2);

          ctx.fillStyle = it.type === 'dir' ? '#e8e8e8' : '#c8c8c8';
          ctx.font = '13px -apple-system, sans-serif';
          ctx.fillText(it.name, 36, y + ROW_H / 2);
        }
      }

      /* ---------- 状态栏 ---------- */
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, H - STATUS_H, W, STATUS_H);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const hint = s.naming ? '回车确认 · Esc 取消'
                 : s.sysAccess ? '已授权系统目录' : (s.items.length + ' 项');
      ctx.fillText(hint, 10, H - STATUS_H / 2);

      /* ---------- 权限弹窗 ---------- */
      if (s.permPrompt) {
        const r = permRects(win);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#2c2c33';
        wm.roundRect(r.bx, r.by, r.bw, r.bh, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        wm.roundRect(r.bx, r.by, r.bw, r.bh, 10); ctx.stroke();

        ctx.fillStyle = '#ffd479';
        ctx.font = '600 14px -apple-system, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('需要权限', r.bx + r.bw / 2, r.by + 24);

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.fillText('进入系统目录需要授权：', r.bx + r.bw / 2, r.by + 52);
        ctx.fillStyle = '#9cf';
        ctx.fillText(s.permPrompt.target, r.bx + r.bw / 2, r.by + 74);

        // 允许
        ctx.fillStyle = 'rgba(10,132,255,0.9)';
        wm.roundRect(r.allow.x, r.allow.y, r.allow.w, r.allow.h, 6); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.fillText('允许', r.allow.x + r.allow.w / 2, r.allow.y + r.allow.h / 2);
        // 拒绝
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        wm.roundRect(r.deny.x, r.deny.y, r.deny.w, r.deny.h, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText('拒绝', r.deny.x + r.deny.w / 2, r.deny.y + r.deny.h / 2);
      }

      /* ---------- 文件预览 ---------- */
      if (s.viewer) {
        const r = viewerRects(win);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#202026';
        wm.roundRect(r.bx, r.by, r.bw, r.bh, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        wm.roundRect(r.bx, r.by, r.bw, r.bh, 10); ctx.stroke();
        // 标题
        ctx.fillStyle = '#fff';
        ctx.font = '600 13px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(s.viewer.name, r.bx + 12, r.by + 16);
        // 关闭
        ctx.fillStyle = 'rgba(255,95,87,0.9)';
        wm.roundRect(r.close.x, r.close.y, r.close.w, r.close.h, 4); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('×', r.close.x + r.close.w / 2, r.close.y + r.close.h / 2);
        // 文本
        ctx.fillStyle = 'rgba(220,220,220,0.92)';
        ctx.font = '12px Consolas, monospace';
        ctx.textAlign = 'left';
        const tx = r.bx + 12, tyBase = r.by + 36, lineH = 16;
        const lines = s.viewer.content.split('\n');
        const visLines = Math.floor((r.bh - 48) / lineH);
        const start = Math.max(0, Math.min(s.viewer.scroll, lines.length - visLines));
        for (let i = 0; i < visLines && i + start < lines.length; i++) {
          const ln = lines[i + start];
          ctx.fillText(ln.length > 60 ? ln.slice(0, 60) : ln, tx, tyBase + i * lineH);
        }
      }
    },

    async onMouseDown(lx, ly, win, wm) {
      const s = getState(win);

      // 权限弹窗优先
      if (s.permPrompt) {
        const r = permRects(win);
        if (lx >= r.allow.x && lx <= r.allow.x + r.allow.w && ly >= r.allow.y && ly <= r.allow.y + r.allow.h) {
          s.sysAccess = true;
          const t = s.permPrompt.target;
          s.permPrompt = null;
          await navigate(win, s, t);
        } else if (lx >= r.deny.x && lx <= r.deny.x + r.deny.w && ly >= r.deny.y && ly <= r.deny.y + r.deny.h) {
          s.permPrompt = null;
        }
        return;
      }

      // 文件预览：点关闭
      if (s.viewer) {
        const r = viewerRects(win);
        if (lx >= r.close.x && lx <= r.close.x + r.close.w && ly >= r.close.y && ly <= r.close.y + r.close.h) {
          s.viewer = null;
        }
        return;
      }

      // 工具栏
      if (ly < TOOLBAR_H) {
        for (const b of buttonRects(win)) {
          if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) {
            await doToolbar(win, s, b.id);
            return;
          }
        }
        return;
      }

      // 地址栏：命名态下点击取消
      if (ly < listTop(win)) {
        if (s.naming) s.naming = null;
        return;
      }

      // 命名态：在列表区点击取消输入
      if (s.naming) { s.naming = null; return; }

      // 列表选择
      const idx = Math.floor((ly - listTop(win)) / ROW_H);
      if (idx < 0 || idx >= s.items.length) { s.selected = -1; return; }
      s.selected = idx;
    },

    onDoubleClick(lx, ly, win, wm) {
      const s = getState(win);
      if (s.permPrompt || s.viewer || s.naming) return;
      if (ly < listTop(win)) return;
      const idx = Math.floor((ly - listTop(win)) / ROW_H);
      if (idx < 0 || idx >= s.items.length) return;
      const it = s.items[idx];
      if (it.type === 'dir') {
        navigate(win, s, vfs.normalize(s.cwd, it.name));
      } else {
        openViewer(win, s, it.name);
      }
    },

    async onKeyDown(e, win, wm) {
      const s = getState(win);

      // 命名输入态
      if (s.naming) {
        if (e.key === 'Enter') {
          const v = s.naming.value.trim();
          if (v) {
            const target = vfs.normalize(s.cwd, v);
            if (s.naming.kind === 'dir') await vfs.mkdir(target);
            else await vfs.write(target, '');
            s.naming = null;
            await refresh(win, s);
          } else { s.naming = null; }
          return true;
        }
        if (e.key === 'Escape') { s.naming = null; return true; }
        if (e.key === 'Backspace') { s.naming.value = s.naming.value.slice(0, -1); return true; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          s.naming.value += e.key; return true;
        }
        return true; // 命名态吞掉其它键
      }

      // 权限弹窗
      if (s.permPrompt) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'y' || e.key === 'Y') {
          s.sysAccess = true;
          const t = s.permPrompt.target;
          s.permPrompt = null;
          navigate(win, s, t);
        } else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
          s.permPrompt = null;
        }
        return true;
      }

      // 文件预览
      if (s.viewer) {
        if (e.key === 'Escape' || e.key === 'Enter') s.viewer = null;
        else if (e.key === 'ArrowDown') s.viewer.scroll += 1;
        else if (e.key === 'ArrowUp') s.viewer.scroll = Math.max(0, s.viewer.scroll - 1);
        return true;
      }

      // 常规导航
      if (e.key === 'Backspace' || e.key === 'ArrowUp') {
        if (e.key === 'Backspace') {
          if (s.cwd !== '/') await navigate(win, s, vfs.normalize(s.cwd, '..'));
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
        if (it.type === 'dir') await navigate(win, s, vfs.normalize(s.cwd, it.name));
        else openViewer(win, s, it.name);
        return true;
      }
      return false;
    },

    getCursor(lx, ly) { return 'default'; },

    contextMenu(lx, ly, win) {
      const s = getState(win);
      if (s.naming || s.permPrompt || s.viewer) return null;
      let target = null;
      if (ly >= listTop(win)) {
        const idx = Math.floor((ly - listTop(win)) / ROW_H);
        if (idx >= 0 && idx < s.items.length) target = s.items[idx];
      }
      const items = [];
      if (target) {
        const path = vfs.normalize(s.cwd, target.name);
        items.push({ label: '打开', action: () => { if (target.type === 'dir') navigate(win, s, path); else openViewer(win, s, target.name); } });
        items.push({ label: '移到废纸篓', action: async () => { await moveToTrash(vfs, path); s.selected = -1; await refresh(win, s); } });
        items.push({ sep: true });
      }
      items.push({ label: '新建文件夹', action: () => { s.naming = { kind: 'dir', value: '' }; } });
      items.push({ label: '新建文本', action: () => { s.naming = { kind: 'file', value: '' }; } });
      items.push({ label: '刷新', action: () => { refresh(win, s); } });
      return items;
    },
  };
}

/* ============================================================
   Terminal —— 内嵌终端
   ============================================================ */
export function createTerminalApp({ vfs, DrapShell, registry }) {
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
        registry,
        wm,
        print: push,
        clear: () => { s.lines = []; s.scrollTop = 0; },
        exit: () => { if (wm) wm.closeWindow(win.id); },
        switchToGUI: (theme) => { if (wm && typeof wm.setTheme === 'function') wm.setTheme(theme); },
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

/* ============================================================
   App Manager —— 应用管理助手（host 侧）
   从注册表 registry 读取所有应用（内建 host + DrapLang drapp）网格展示，点击启动
   ============================================================ */
export function createAppManagerApp({ registry, vfs }) {
  const CELL = 96, GAP = 16, PAD = 16, TOP = 40;

  // 注册表里除自身外所有应用
  function apps() { return registry.all().filter(a => a.id !== 'appmgr'); }

  function cellRects(win) {
    const list = apps();
    const cols = Math.max(1, Math.floor((win.w - PAD * 2 + GAP) / (CELL + GAP)));
    return list.map((a, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = PAD + c * (CELL + GAP);
      const y = PAD + TOP + r * (CELL + GAP);
      return { a, x, y, w: CELL, h: CELL };
    });
  }

  return {
    create() {},

    render(ctx, win, wm) {
      const W = win.w, H = win.h - win.TITLEBAR_H;
      ctx.fillStyle = '#1e1e24';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 15px -apple-system, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('应用', PAD, 12);

      for (const c of cellRects(win)) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        wm.roundRect(c.x, c.y, c.w, c.h, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        wm.roundRect(c.x, c.y, c.w, c.h, 12); ctx.stroke();
        // 手绘图标（.app 包 icon.json / host 内联 iconSpec）；无规格退回 emoji/字母
        const iconS = 56, ix = c.x + (c.w - iconS) / 2, iy = c.y + 12;
        if (!wm.drawAppIcon(c.a.id, ix, iy, iconS)) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.font = '28px -apple-system, "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(c.a.icon, c.x + c.w / 2, iy + iconS / 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.a.name, c.x + c.w / 2, c.y + c.h - 30);
        const meta = (c.a.version ? 'v' + c.a.version : '') + (c.a.category ? ' · ' + c.a.category : '');
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillText(meta, c.x + c.w / 2, c.y + c.h - 14);
      }
    },

    onMouseDown(lx, ly, win, wm) {
      for (const c of cellRects(win)) {
        if (lx >= c.x && lx <= c.x + c.w && ly >= c.y && ly <= c.y + c.h) {
          registry.launch(c.a.id, { wm, vfs });
          return;
        }
      }
    },

    getCursor() { return 'pointer'; },
  };
}

/* ============================================================
   About —— 关于本机
   ============================================================ */
export function createAboutApp() {
  const LINES = [
    '◆ DrapOG',
    '',
    '版本：自举原型（DrapLang 自举操作系统）',
    '架构：DrapLang → DrapCC → 指令数组 → pack → .dbyte → DrapVM',
    '',
    '自举层次：',
    '  L1 运行基座（浏览器 / Canvas / VFS）',
    '  L2 语言·工具（DrapCC / DrapVM / DBYTE）',
    '  L3 命令层（CMD / Shell）',
    '  L4 应用注册表（.app 格式 / launcher）',
    '  L5 图形界面（WM / Dock / AppMgr）',
    '',
    '由 DrapLang 自举的操作系统内核原型。',
  ];
  return {
    create() {},
    render(ctx, win) {
      const W = win.w, H = win.h - win.TITLEBAR_H;
      ctx.fillStyle = '#1e1e24'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      let y = 16;
      for (const l of LINES) { ctx.fillText(l, 16, y); y += 22; }
    },
    getCursor() { return 'default'; },
  };
}

/* ============================================================
   Settings —— 设置（分级菜单：个性化 / 账户 / 通用 / 关于）
   ============================================================ */
/* ============================================================
   TextEdit —— 简易文本编辑器
   自动加载 /Users/guest/Documents/readme.txt，可编辑并保存；
   工具栏：新建 / 打开(readme) / 保存；光标固定在文末，支持回车换行与退格
   ============================================================ */
export function createEditApp({ vfs }) {
  const states = new Map();
  const TOOL_H = 34, STATUS_H = 20, PATH_H = 26;

  function getState(win) {
    let s = states.get(win.id);
    if (!s) {
      s = { path: '/Users/guest/Documents/readme.txt', text: '', cursor: 0, scroll: 0, status: '', editingPath: false, pathDraft: '' };
      states.set(win.id, s);
      vfs.read(s.path).then(c => {
        s.text = (c == null ? '' : String(c));
        s.cursor = s.text.length;
        s.status = '';
      }).catch(() => { s.status = '读取失败'; });
    }
    return s;
  }

  const TOOLBUTTONS = [
    { id: 'new',   icon: '📄', tip: '新建' },
    { id: 'open',  icon: '📂', tip: '打开' },
    { id: 'save',  icon: '💾', tip: '保存' },
  ];
  function toolRects(win) {
    const x0 = 8, y = 2, w = 32, h = 28, gap = 4;
    return TOOLBUTTONS.map((b, i) => ({ ...b, x: x0 + i * (w + gap), y, w, h }));
  }

  return {
    create(win) { getState(win); },

    render(ctx, win) {
      const s = getState(win);
      const W = win.w, H = win.h - win.TITLEBAR_H;
      ctx.fillStyle = '#15151a'; ctx.fillRect(0, 0, W, H);

      // 工具栏
      ctx.fillStyle = '#26262b'; ctx.fillRect(0, 0, W, TOOL_H);
      for (const b of toolRects(win)) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        wm_roundRect(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '16px -apple-system, "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.icon, b.x + b.w / 2, b.y + b.h / 2);
      }

      // 路径栏（点击编辑：改路径后「打开」加载、「保存」写入该路径 → 打开/另存为）
      const py = TOOL_H;
      ctx.fillStyle = '#1c1c22'; ctx.fillRect(0, py, W, PATH_H);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(0, py + PATH_H); ctx.lineTo(W, py + PATH_H); ctx.stroke();
      ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      if (s.editingPath) {
        ctx.fillStyle = '#9cf'; ctx.fillText('路径: ', 8, py + PATH_H / 2);
        const lw = ctx.measureText('路径: ').width;
        ctx.fillStyle = '#fff'; ctx.fillText(s.pathDraft, 8 + lw, py + PATH_H / 2);
        const cw = ctx.measureText(s.pathDraft).width;
        ctx.fillRect(8 + lw + cw, py + 5, 2, PATH_H - 10);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('📂 ' + s.path, 8, py + PATH_H / 2);
      }

      // 文本区
      const top = TOOL_H + PATH_H + 4;
      const lines = s.text.split('\n');
      const lh = 18, pad = 10;
      const maxRows = Math.max(0, Math.floor((H - top - STATUS_H - 6) / lh));
      const total = lines.length;
      const start = Math.min(s.scroll, Math.max(0, total - maxRows));
      ctx.font = '14px Consolas, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let i = 0; i < maxRows && i + start < total; i++) {
        const ln = lines[i + start];
        ctx.fillStyle = '#d4d4d4';
        ctx.fillText(ln.length > 200 ? ln.slice(0, 200) : ln, pad, top + i * lh);
      }
      // 光标（文末高亮）
      const lastLine = lines[lines.length - 1] || '';
      const cx = pad + ctx.measureText(lastLine).width;
      const cy = top + (total - 1 - start) * lh;
      if (cy < H - STATUS_H) {
        ctx.fillStyle = '#4ec9b0';
        ctx.fillRect(cx, cy, 2, 16);
      }

      // 状态栏
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, H - STATUS_H, W, STATUS_H);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText((s.status || s.path) + '  ' + s.text.length + ' 字符', 10, H - STATUS_H / 2);
    },

    onMouseDown(lx, ly, win) {
      const s = getState(win);
      if (ly < TOOL_H) {
        for (const b of toolRects(win)) {
          if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) {
            if (b.id === 'new') { s.text = ''; s.cursor = 0; s.status = '已新建'; }
            else if (b.id === 'open') {
              vfs.read(s.path).then(c => { s.text = (c == null ? '' : String(c)); s.cursor = s.text.length; s.status = '已打开'; })
                .catch(() => { s.status = '读取失败'; });
            } else if (b.id === 'save') {
              vfs.write(s.path, s.text).then(ok => { s.status = ok ? '已保存' : '保存失败'; })
                .catch(() => { s.status = '保存失败'; });
            }
            return;
          }
        }
        return;
      }
      if (ly < TOOL_H + PATH_H) { s.editingPath = true; s.pathDraft = s.path; return; }
    },

    async onKeyDown(e, win) {
      const s = getState(win);
      if (s.editingPath) {
        if (e.key === 'Enter') {
          s.path = (s.pathDraft.trim() || s.path); s.editingPath = false;
          vfs.read(s.path).then(c => { s.text = (c == null ? '' : String(c)); s.cursor = s.text.length; s.status = '已打开 ' + s.path; })
            .catch(() => { s.status = '打开失败'; });
          return true;
        }
        if (e.key === 'Escape') { s.editingPath = false; return true; }
        if (e.key === 'Backspace') { s.pathDraft = s.pathDraft.slice(0, -1); return true; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { s.pathDraft += e.key; return true; }
        return true;
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 's') {
          vfs.write(s.path, s.text).then(ok => { s.status = ok ? '已保存' : '保存失败'; })
            .catch(() => { s.status = '保存失败'; });
          return true;
        }
        return false;
      }
      if (e.key === 'Enter') { s.text += '\n'; s.cursor = s.text.length; return true; }
      if (e.key === 'Backspace') { if (s.text.length > 0) { s.text = s.text.slice(0, -1); s.cursor = s.text.length; } return true; }
      if (e.key.length === 1 && !e.altKey) { s.text += e.key; s.cursor = s.text.length; return true; }
      return false;
    },

    getCursor() { return 'text'; },
  };

  // 小工具：不依赖 wm 的 roundRect
  function wm_roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/* ============================================================
   废纸篓 / 回收站  +  此电脑
   删除 = 移动到 /Library/Trash（重名加序号）；可还原 / 清空。
   逻辑为纯 VFS 操作，可在 node 下单测；下面是两个宿主 GUI 应用。
   ============================================================ */
export const TRASH_DIR = '/Library/Trash';

async function copyRecursive(vfs, src, dst) {
  if (await vfs.isDir(src)) {
    await vfs.mkdir(dst);
    const items = (await vfs.ls(src)) || [];
    for (const it of items) await copyRecursive(vfs, vfs.normalize(src, it.name), vfs.normalize(dst, it.name));
  } else {
    const c = await vfs.read(src);
    await vfs.write(dst, c == null ? '' : c);
  }
}
async function rmRecursive(vfs, path) {
  if (await vfs.isDir(path)) {
    const items = (await vfs.ls(path)) || [];
    for (const it of items) await rmRecursive(vfs, vfs.normalize(path, it.name));
  }
  await vfs.rm(path);
}
async function uniqueIn(vfs, dir, name) {
  let target = vfs.normalize(dir, name);
  if (!(await vfs.exists(target))) return target;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (await vfs.exists(vfs.normalize(dir, stem + ' ' + i + ext))) i++;
  return vfs.normalize(dir, stem + ' ' + i + ext);
}

/** 把 path 移入废纸篓（复制→删源）；成功返回 true */
export async function moveToTrash(vfs, path) {
  try {
    const name = path.split('/').filter(Boolean).pop();
    if (!name) return false;
    await vfs.mkdir(TRASH_DIR);
    const target = await uniqueIn(vfs, TRASH_DIR, name);
    await copyRecursive(vfs, path, target);
    await rmRecursive(vfs, path);
    return true;
  } catch (e) { return false; }
}
/** 废纸篓条目列表 */
export async function listTrash(vfs) {
  try { return (await vfs.ls(TRASH_DIR)) || []; } catch (e) { return []; }
}
/** 从废纸篓还原 name 到 destDir */
export async function restoreFromTrash(vfs, name, destDir) {
  try {
    const src = vfs.normalize(TRASH_DIR, name);
    if (!(await vfs.exists(src))) return false;
    await vfs.mkdir(destDir);
    const dst = await uniqueIn(vfs, destDir, name);
    await copyRecursive(vfs, src, dst);
    await rmRecursive(vfs, src);
    return true;
  } catch (e) { return false; }
}
/** 清空废纸篓 */
export async function emptyTrash(vfs) {
  try {
    const items = (await vfs.ls(TRASH_DIR)) || [];
    for (const it of items) await rmRecursive(vfs, vfs.normalize(TRASH_DIR, it.name));
    return true;
  } catch (e) { return false; }
}
