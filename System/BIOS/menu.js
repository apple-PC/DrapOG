/**
 * @file        System/BIOS/menu.js
 * @module      drapog/bios/menu
 * @summary     启动菜单
 * @version     0.1.0
 */

const screen = document.getElementById('screen');

/**
 * 显示启动菜单，等待用户选择
 * @returns {Promise<void>}
 */
export function showBootMenu() {
  return new Promise(resolve => {
    const ctx = screen.getContext('2d');

    const items = [
      { key: '1', label: 'DrapOG CMD',      desc: '命令行模式',  action: 'cmd' },
      { key: '2', label: 'BIOS Setup',      desc: 'BIOS 设置',   action: 'setup' },
    ];

    let selected = 0;
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
      y += 40;

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

    function choose(idx) {
      const it = items[idx];
      cleanup();
      if (it.action === 'cmd') {
        import('../Boot/cmd.js').then(m => m.startCMD()).then(resolve);
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