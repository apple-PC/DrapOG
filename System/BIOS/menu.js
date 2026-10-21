/**
 * @file        System/BIOS/menu.js
 * @module      drapog/bios/menu
 * @summary     启动菜单（从项目设置文件读取默认启动项 + 倒计时；可进入 BIOS Setup）
 * @version     0.4.0
 */

import { loadSettings, BOOT_LABELS } from './settings.js';

const screen = document.getElementById('screen');

/** 设备感知：手机/触控 → GUI，电脑/鼠标 → CMD */
function isMobileDevice() {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch (e) {}
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const small = Math.min(window.innerWidth, window.innerHeight) < 820;
  return touch && small;
}

/**
 * 显示启动菜单，等待用户选择
 * @param {import('../../src/drapog.vfs.js').VFS} vfs 用于读取项目设置文件
 * @returns {Promise<void>}
 */
export async function showBootMenu(vfs) {
  const settings = await loadSettings(vfs);
  return new Promise(resolve => {
    const ctx = screen.getContext('2d');

    const items = [
      { key: '1', label: 'DrapOG CMD',      desc: '命令行模式',  action: 'cmd' },
      { key: '2', label: 'DrapOG GUI',      desc: '图形界面',    action: 'gui' },
      { key: '3', label: 'BIOS Setup',      desc: 'BIOS 设置',   action: 'setup' },
    ];

    const mobile = isMobileDevice();
    let selected = settings.bootMode === 'cmd' ? 0
                 : settings.bootMode === 'gui' ? 1
                 : (mobile ? 1 : 0);
    const initialCountdown = settings.timeout;   // 0 = 一直等待
    let countdown = initialCountdown;

    function draw() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, screen.width, screen.height);

      const x = 60;
      let y = 80;

      ctx.font = '16px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.fillStyle = '#e0e0e0';
      ctx.fillText('DrapOG Boot Menu', x, y);
      y += 40;

      ctx.fillStyle = '#666';
      ctx.font = '14px Consolas, monospace';
      if (countdown > 0) ctx.fillText(`自动启动倒计时: ${countdown} 秒`, x, y);
      else ctx.fillText('自动启动: 关闭（↑↓ 选择，Enter 确认）', x, y);
      y += 22;
      ctx.fillStyle = '#4a9';
      const reason = settings.bootMode === 'auto'
        ? (mobile ? '检测到手机/触控' : '检测到电脑/鼠标')
        : 'BIOS 设定 ' + BOOT_LABELS[settings.bootMode];
      ctx.fillText(`自动进入: ${items[selected].label}（${reason}）`, x, y);
      y += 34;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const sel = i === selected;
        ctx.fillStyle = sel ? '#4fc1ff' : '#aaa';
        ctx.font = sel ? 'bold 15px Consolas, monospace' : '15px Consolas, monospace';
        ctx.fillText((sel ? '▸ ' : '  ') + it.key + '. ' + it.label, x, y);
        ctx.fillStyle = '#666';
        ctx.font = '13px Consolas, monospace';
        ctx.fillText(it.desc, x + 280, y + 2);
        y += 28;
      }

      y += 30;
      ctx.fillStyle = '#555';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText('↑↓ 选择   Enter 确认   1/2 快捷选择', x, y);
    }

    function showFatal(err) {
      const c2 = screen.getContext('2d');
      c2.fillStyle = '#000';
      c2.fillRect(0, 0, screen.width, screen.height);
      c2.fillStyle = '#f66';
      c2.font = '16px Consolas, monospace';
      c2.textAlign = 'left';
      c2.textBaseline = 'top';
      c2.fillText('启动失败: ' + (err && err.message ? err.message : err), 20, 20);
      console.error(err);
    }

    function choose(idx) {
      const it = items[idx];
      cleanup();
      if (it.action === 'cmd') {
        import('../Boot/cmd.js').then(m => m.startCMD()).then(resolve).catch(showFatal);
      } else if (it.action === 'gui') {
        import('../Boot/gui.js').then(m => m.startGUI()).then(resolve).catch(showFatal);
      } else {
        // BIOS Setup：打开两级设置菜单，退出后重显启动菜单（设置可能已变，重读）
        import('./setup.js')
          .then(m => m.showSetup(vfs))
          .then(() => showBootMenu(vfs))
          .catch(() => showBootMenu(vfs));
      }
    }

    function onKey(e) {
      if (e.key === 'ArrowDown') { selected = (selected + 1) % items.length; countdown = initialCountdown; draw(); }
      else if (e.key === 'ArrowUp') { selected = (selected - 1 + items.length) % items.length; countdown = initialCountdown; draw(); }
      else if (e.key === 'Enter') { choose(selected); }
      else if (e.key === '1') { choose(0); }
      else if (e.key === '2') { choose(1); }
    }

    let timer = null;
    if (countdown > 0) {
      timer = setInterval(() => {
        countdown--;
        if (countdown <= 0) { clearInterval(timer); choose(selected); }
        else draw();
      }, 1000);
    }

    function cleanup() {
      if (timer) clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      window.__drapog_redraw = null;
    }

    window.addEventListener('keydown', onKey);
    window.__drapog_redraw = draw;
    draw();
  });
}
