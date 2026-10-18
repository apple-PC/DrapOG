/**
 * @file        System/BIOS/setup.js
 * @module      drapog/bios/setup
 * @summary     Whetstone BIOS Setup —— 一/二级菜单 + 偏好存项目文件
 * @description 两级菜单：主菜单（启动/高级/安全/系统信息 + 保存/不保存/恢复默认），
 *               每个分类是二级菜单；Esc 返回上一级（主菜单 Esc = 不保存退出），
 *               F10 随时保存并退出。设置经 VFS 持久化到项目文件 System/Settings/bios.json。
 *               按键：↑↓ 选择  ←→ 调整  Enter 确认/进入  Esc 返回/退出  F10 保存并退出。
 * @version     0.4.0
 * @author      Whetstone Project
 */

import {
  DEFAULT_SETTINGS, BOOT_LABELS, SETTINGS_PATH,
  loadSettings, saveSettings, cycleBootMode, adjustTimeout,
} from './settings.js';

/**
 * 打开 BIOS Setup。resolve(保存后的设置 | null)。调用方负责 resolve 后回到启动菜单。
 * @param {import('../../drapog.vfs.js').VFS} vfs 用于读写项目设置文件
 */
export function showSetup(vfs) {
  return new Promise(resolve => {
    const screen = document.getElementById('screen');
    const ctx = screen.getContext('2d');

    let s = { ...DEFAULT_SETTINGS };   // 工作副本（异步加载真实值）
    let sel = 0;
    const stack = [mainPage()];        // 页面栈：stack[0]=主菜单

    loadSettings(vfs).then(cfg => { s = cfg; draw(); });

    /* ---------- 页面定义（函数返回 {title, short, rows}） ---------- */
    function mainPage() {
      return {
        title: 'Whetstone BIOS Setup', short: '主菜单',
        rows: [
          { kind: 'sub', label: '启动设置', desc: '启动模式 / 菜单倒计时', page: bootPage },
          { kind: 'sub', label: '高级设置', desc: '快速自检 / 开机 Logo', page: advPage },
          { kind: 'sub', label: '安全设置', desc: '安全启动', page: secPage },
          { kind: 'sub', label: '系统信息', desc: 'BIOS / 设备 / 存储', page: infoPage },
          { kind: 'action', id: 'save', label: '保存并退出 (F10)', gap: true },
          { kind: 'action', id: 'discard', label: '不保存退出 (Esc)' },
          { kind: 'action', id: 'defaults', label: '恢复默认设置' },
        ],
      };
    }
    function bootPage() {
      return {
        title: '启动设置', short: '启动',
        rows: [
          { kind: 'enum', label: '启动模式', get: () => s.bootMode, set: v => { s.bootMode = v; }, cycle: cycleBootMode, text: v => BOOT_LABELS[v] },
          { kind: 'num', label: '菜单倒计时', get: () => s.timeout, set: v => { s.timeout = v; }, adjust: adjustTimeout, text: v => (v === 0 ? '一直等待' : v + ' 秒') },
        ],
      };
    }
    function advPage() {
      return {
        title: '高级设置', short: '高级',
        rows: [
          { kind: 'bool', label: '快速自检', get: () => s.quickPOST, set: v => { s.quickPOST = v; }, text: v => (v ? '开' : '关') },
          { kind: 'bool', label: '开机 Logo', get: () => s.bootLogo, set: v => { s.bootLogo = v; }, text: v => (v ? '开' : '关') },
        ],
      };
    }
    function secPage() {
      return {
        title: '安全设置', short: '安全',
        rows: [
          { kind: 'bool', label: '安全启动', get: () => s.secureBoot, set: v => { s.secureBoot = v; }, text: v => (v ? '开' : '关') },
        ],
      };
    }
    function infoPage() {
      const mode = (vfs && vfs.mode === 'fsaccess') ? '项目磁盘（已持久化）' : '内存（重启丢失，需先挂载）';
      return {
        title: '系统信息', short: '信息',
        rows: [
          { kind: 'info', label: 'BIOS 版本', value: () => 'Whetstone v0.6' },
          { kind: 'info', label: '设备', value: () => (isMobile() ? '手机/触控' : '电脑/鼠标') },
          { kind: 'info', label: '存储模式', value: () => mode },
          { kind: 'info', label: '设置文件', value: () => SETTINGS_PATH },
          { kind: 'info', label: '启动模式', value: () => BOOT_LABELS[s.bootMode] },
          { kind: 'info', label: '菜单倒计时', value: () => (s.timeout === 0 ? '一直等待' : s.timeout + ' 秒') },
        ],
      };
    }

    function cur() { return stack[stack.length - 1]; }
    function isMobile() {
      try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      } catch (e) {}
      return (navigator.maxTouchPoints || 0) > 0 &&
             Math.min(window.innerWidth, window.innerHeight) < 820;
    }

    function valueOf(row) {
      if (row.kind === 'enum' || row.kind === 'num' || row.kind === 'bool') return row.text(row.get());
      if (row.kind === 'info') return row.value();
      if (row.kind === 'sub') return row.desc;
      return '';
    }

    function draw() {
      const W = screen.width, H = screen.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.strokeStyle = '#2a4d5e';
      ctx.lineWidth = 1;
      ctx.strokeRect(36, 36, Math.max(400, W - 72), Math.max(300, H - 110));

      let y = 56;
      ctx.fillStyle = '#4fc1ff';
      ctx.font = 'bold 19px Consolas, monospace';
      ctx.fillText(cur().title, 56, y);
      y += 24;
      // 面包屑 + 提示
      ctx.fillStyle = '#777';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText(stack.map(p => p.short).join('  /  ') +
        '    ↑↓选择  ←→调整  Enter确认  Esc返回/退出  F10保存并退出', 56, y);
      y += 30;

      const rows = cur().rows;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.gap) y += 12;
        const on = i === sel;
        ctx.fillStyle = on ? '#4fc1ff' : '#cfcfcf';
        ctx.font = (on ? 'bold ' : '') + '15px Consolas, monospace';
        ctx.fillText((on ? '> ' : '  ') + row.label, 64, y);
        const val = valueOf(row);
        if (val) {
          const adjustable = row.kind === 'enum' || row.kind === 'num' || row.kind === 'bool';
          const txt = adjustable ? val + '   < >' : val;
          ctx.fillStyle = on ? '#9fe0ff' : (row.kind === 'sub' ? '#7a7a7a' : '#8a8a8a');
          ctx.textAlign = 'right';
          ctx.fillText(txt, W - 64, y);
          ctx.textAlign = 'left';
        }
        y += 28;
      }

      ctx.fillStyle = '#555';
      ctx.font = '12px Consolas, monospace';
      const storeNote = (vfs && vfs.mode === 'fsaccess')
        ? '偏好保存于项目文件 ' + SETTINGS_PATH
        : '未挂载项目磁盘：保存仅临时生效（进系统后用 mount 挂载）';
      ctx.fillText(storeNote, 56, H - 52);
    }

    /* ---------- 交互 ---------- */
    function adjust(dir) {
      const row = cur().rows[sel];
      if (!row) return;
      if (row.kind === 'enum') row.set(row.cycle(row.get(), dir));
      else if (row.kind === 'num') row.set(row.adjust(row.get(), dir));
      else if (row.kind === 'bool') row.set(!row.get());
      draw();
    }
    function activate() {
      const row = cur().rows[sel];
      if (!row) return;
      if (row.kind === 'sub') { stack.push(row.page()); sel = 0; draw(); }
      else if (row.kind === 'enum' || row.kind === 'bool') adjust(1);
      else if (row.kind === 'action') {
        if (row.id === 'save') finishSave();
        else if (row.id === 'discard') finish(null);
        else if (row.id === 'defaults') { s = { ...DEFAULT_SETTINGS }; draw(); }
      }
    }
    function back() { if (stack.length > 1) { stack.pop(); sel = 0; draw(); } }
    async function finishSave() {
      const res = await saveSettings(vfs, s);
      cleanup();
      resolve(res);
    }
    function finish(result) { cleanup(); resolve(result); }

    function onKey(e) {
      const rows = cur().rows;
      switch (e.key) {
        case 'ArrowDown': sel = (sel + 1) % rows.length; draw(); break;
        case 'ArrowUp':   sel = (sel - 1 + rows.length) % rows.length; draw(); break;
        case 'ArrowRight': adjust(1); break;
        case 'ArrowLeft':  adjust(-1); break;
        case 'Enter': activate(); break;
        case 'F10':   finishSave(); break;
        case 'Escape':
          if (stack.length > 1) back();     // 二级 → 返回一级
          else finish(null);                // 主菜单 Esc = 不保存退出
          break;
      }
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
        if (e.preventDefault) e.preventDefault();
      }
    }

    function cleanup() {
      window.removeEventListener('keydown', onKey);
      window.__drapog_redraw = null;
    }

    window.addEventListener('keydown', onKey);
    window.__drapog_redraw = draw;
    draw();
  });
}
