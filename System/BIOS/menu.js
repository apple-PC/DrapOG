/**
 * @file        System/BIOS/menu.js
 * @module      drapog/bios/menu
 * @summary     启动菜单（读取 BIOS 设置：默认启动项 + 倒计时；可进入 BIOS Setup）
 * @version     0.3.0
 */

import { loadBiosSettings } from './setup.js';

const screen = document.getElementById('screen');

/**
 * 设备感知：判断是否为手机 / 触控设备
 *  - 优先用 pointer:coarse（触控笔/手指，桌面鼠标是 fine）
 *  - 退而求其次：有触控点且屏幕较小
 */
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
 * @returns {Promise<void>}
 */
export function showBootMenu() {
  return new Promise(resolve => {
    const ctx = screen.getContext('2d');

    const items = [
      { key: '1', label: 'DrapOG CMD',      desc: '命令行模式',  action: 'cmd' },
      { key: '2', label: 'DrapOG GUI',      desc: '图形界面',    action: 'gui' },
      { key: '3', label: 'BIOS Setup',      desc: 'BIOS 设置',   action: 'setup' },
    ];

    // 读取 BIOS 设置（CMOS）：决定默认启动项与倒计时
    const settings = loadBiosSettings();
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
      if (countdown > 0) {
        ctx.fillText(`自动启动倒计时: ${countdown} 秒`, x, y);
      } else {
        ctx.fillText('自动启动: 关闭（↑↓ 选择，Enter 确认）', x, y);
      }
      y += 22;
      ctx.fillStyle = '#4a9';
      const reason = settings.bootMode === 'auto'
        ? (mobile ? '检测到手机/触控' : '检测到电脑/鼠标')
        : `BIOS 设定: ${settings.bootMode.toUpperCase()}`;
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
      const ctx = screen.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, screen.width, screen.height);
      ctx.fillStyle = '#f66';
      ctx.font = '16px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('启动失败: ' + (err && err.message ? err.message : err), 20, 20);
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
        // BIOS Setup：打开设置界面，退出后重显启动菜单（设置可能已变，重新读取）
        import('./setup.js')
          .then(m => m.showSetup())
          .then(() => showBootMenu())
          .catch(() => showBootMenu());
      }
    }

    function onKey(e) {
      if (e.key === 'ArrowDown') {
        selected = (selected + 1) % items.length;
        countdown = initialCountdown;
        draw();
      } else if (e.key === 'ArrowUp') {
        selected = (selected - 1 + items.length) % items.length;
        countdown = initialCountdown;
        draw();
      } else if (e.key === 'Enter') {
        choose(selected);
      } else if (e.key === '1') {
        choose(0);
      } else if (e.key === '2') {
        choose(1);
      }
    }

    let timer = null;
    if (countdown > 0) {
      timer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(timer);
          choose(selected);
        } else {
          draw();
        }
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
