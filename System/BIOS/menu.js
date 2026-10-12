/**
 * @file        System/BIOS/menu.js
 * @module      drapog/bios/menu
 * @summary     启动菜单
 * @version     0.2.0
 */

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

    // 设备感知默认：电脑（有鼠标）默认进 CMD，手机（触控）默认进 GUI
    const mobile = isMobileDevice();
    let selected = mobile ? 1 : 0;   // 0=CMD, 1=GUI
    let countdown = 5;

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
      ctx.fillText(`自动启动倒计时: ${countdown} 秒`, x, y);
      y += 22;
      ctx.fillStyle = '#4a9';
      ctx.fillText(`自动进入: ${items[selected].label}（${mobile ? '检测到手机/触控' : '检测到电脑/鼠标'}）`, x, y);
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
        // Setup 暂时不做
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, screen.width, screen.height);
        ctx.fillStyle = '#888';
        ctx.font = '14px Consolas, monospace';
        ctx.fillText('BIOS Setup 未实现（v0.1）', 60, 80);
        setTimeout(() => { cleanup(); resolve(); showBootMenu(); }, 1000);
      }
    }

    function onKey(e) {
      if (e.key === 'ArrowDown') {
        selected = (selected + 1) % items.length;
        countdown = 5;
        draw();
      } else if (e.key === 'ArrowUp') {
        selected = (selected - 1 + items.length) % items.length;
        countdown = 5;
        draw();
      } else if (e.key === 'Enter') {
        choose(selected);
      } else if (e.key === '1') {
        choose(0);
      } else if (e.key === '2') {
        choose(1);
      }
    }

    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        choose(selected);
      } else {
        draw();
      }
    }, 1000);

    function cleanup() {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      window.__drapog_redraw = null;
    }

    window.addEventListener('keydown', onKey);
    window.__drapog_redraw = draw;
    draw();
  });
}