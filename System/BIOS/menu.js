/**
 * @file        System/BIOS/menu.js
 * @module      drapog/bios/menu
 * @summary     启动菜单（从项目设置文件读取默认启动项 + 倒计时；可进入 BIOS Setup）
 * @version     0.4.0
 */

import { loadSettings, BOOT_LABELS } from './settings.js';
import { drawAppleLogo } from '../../src/drapog.icon.js';

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

    function showFatal(err, onRetry) {
      const c2 = screen.getContext('2d');
      c2.fillStyle = '#000';
      c2.fillRect(0, 0, screen.width, screen.height);
      c2.fillStyle = '#f66';
      c2.font = '16px Consolas, monospace';
      c2.textAlign = 'left';
      c2.textBaseline = 'top';
      c2.fillText('启动失败: ' + (err && err.message ? err.message : err), 20, 20);
      c2.fillStyle = '#888';
      c2.font = '13px Consolas, monospace';
      c2.fillText('可能是网络拉取模块超时（国内访问 GitHub Pages 偶发）。可点击下方按钮重试。', 20, 50);
      if (onRetry) {
        const bw = 120, bh = 34, bx = 20, by = 78;
        c2.fillStyle = '#1b3a5a';
        c2.fillRect(bx, by, bw, bh);
        c2.strokeStyle = '#4fc1ff';
        c2.strokeRect(bx, by, bw, bh);
        c2.fillStyle = '#cfe8ff';
        c2.font = '15px Consolas, monospace';
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        c2.fillText('重试', bx + bw / 2, by + bh / 2);
        c2.textAlign = 'left';
        c2.textBaseline = 'top';
        const handler = (e) => {
          if (e.clientX >= bx && e.clientX <= bx + bw && e.clientY >= by && e.clientY <= by + bh) {
            window.removeEventListener('click', handler);
            onRetry();
          }
        };
        window.addEventListener('click', handler);
      }
      console.error(err);
    }

    /**
     * 开机 splash：GUI 模块图较大、国内访问 GitHub Pages 拉取慢/偶发超时，
     * 选 GUI 后立即显示动画覆盖加载，并在失败时自动重试（带缓存 bust）。
     * @param {string} theme 'macos' | 'windows'
     * @param {Function} resolve 启动菜单的 Promise resolve
     */
    function startGuiWithSplash(theme, resolve) {
      const ctx = screen.getContext('2d');
      const W = screen.width, H = screen.height;
      let raf = 0;
      let last = performance.now();
      let progress = 0;       // 0..1 平滑逼近（成功时跳 1）
      let angle = 0;          // Windows 点点转圈角度
      let attempt = 0;
      const MAX_ATTEMPTS = 4;

      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        progress = Math.min(0.9, progress + dt * 0.2);   // 缓慢逼近 90%，成功后跳满
        angle += dt * 2.6;
        drawSplash(ctx, W, H, theme, progress, angle);
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      function attemptLoad(bust) {
        const spec = bust ? `../Boot/gui.js?t=${Date.now()}` : '../Boot/gui.js';
        import(spec).then(m => {
          cancelAnimationFrame(raf);
          drawSplash(ctx, W, H, theme, 1, angle);   // 100%
          m.startGUI();
          resolve();
        }).catch(err => {
          attempt++;
          if (attempt < MAX_ATTEMPTS) {
            setTimeout(() => attemptLoad(true), 1500);
          } else {
            cancelAnimationFrame(raf);
            showFatal(err, () => {
              attempt = 0; last = performance.now();
              raf = requestAnimationFrame(frame);
              attemptLoad(true);
            });
          }
        });
      }
      attemptLoad(false);
    }

    /** 绘制开机 splash（macOS=进度条+Apple 标志；Windows=点点转圈+手绘窗口旗） */
    function drawSplash(ctx, W, H, theme, progress, angle) {
      ctx.clearRect(0, 0, W, H);
      // 背景
      if (theme === 'windows') {
        ctx.fillStyle = '#04122b';
        ctx.fillRect(0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0b0b10');
        g.addColorStop(1, '#15151c');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const cx = W / 2, cy = H / 2;

      if (theme === 'windows') {
        // 手绘窗口旗（四色方块）
        const fw = 54, fh = 54, fx = cx - fw / 2, fy = cy - 70;
        const pane = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w - 3, h - 3); };
        pane(fx, fy, fw / 2, fh / 2, '#f24f3b');          // 红
        pane(fx + fw / 2, fy, fw / 2, fh / 2, '#7cbb00');   // 绿
        pane(fx, fy + fh / 2, fw / 2, fh / 2, '#2f9bd6');   // 蓝
        pane(fx + fw / 2, fy + fh / 2, fw / 2, fh / 2, '#ffb900'); // 黄
        // 点点转圈（5 个圆点绕中心旋转，当前角度对应点高亮）
        const r = 26, n = 5;
        for (let i = 0; i < n; i++) {
          const a = angle + (i / n) * Math.PI * 2;
          const dx = cx + Math.cos(a) * r, dy = cy + 30 + Math.sin(a) * r * 0.5;
          const lit = (i === (Math.floor(angle / (Math.PI * 2 / n)) % n));
          ctx.beginPath();
          ctx.arc(dx, dy, lit ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = lit ? '#7cc4ff' : '#3a5a7a';
          ctx.fill();
        }
      } else {
        // macOS：手绘 Apple 标志 + 进度条
        drawAppleLogo(ctx, cx, cy - 40, 56, 'rgba(255,255,255,0.95)');
        const bw = Math.min(360, W * 0.6), bh = 6, bx = cx - bw / 2, by = cy + 30;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        roundRect(ctx, bx, by, bw, bh, 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(ctx, bx, by, Math.max(bh, bw * progress), bh, 3); ctx.fill();
      }

      // 通用：DrapOG 字样
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '14px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DrapOG', cx, cy + (theme === 'windows' ? 86 : 64));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }

    function roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function choose(idx) {
      const it = items[idx];
      cleanup();
      if (it.action === 'cmd') {
        import('../Boot/cmd.js').then(m => m.startCMD()).then(resolve).catch(showFatal);
      } else if (it.action === 'gui') {
        startGuiWithSplash(settings.theme === 'windows' ? 'windows' : 'macos', resolve);
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
