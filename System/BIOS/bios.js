/**
 * @file        System/BIOS/bios.js
 * @module      drapog/bios
 * @summary     Whetstone BIOS 主入口
 * @description 负责 POST 自检、加载引导设备、显示启动菜单。
 *              这是 DrapOG 启动流程的起点。
 * @version     0.1.0
 * @author      Whetstone Project
 * @license     MIT
 */

import { runPOST } from './post.js';
import { showBootMenu } from './menu.js';

const screen = document.getElementById('screen');
screen.width = window.innerWidth;
screen.height = window.innerHeight;

window.addEventListener('resize', () => {
  screen.width = window.innerWidth;
  screen.height = window.innerHeight;
  if (window.__drapog_redraw) window.__drapog_redraw();
});

/**
 * BIOS 主流程
 */
async function main() {
  await showSplash();
  await runPOST();
  await showBootMenu();
}

/**
 * 厂商画面：停留 1 秒
 */
function showSplash() {
  return new Promise(resolve => {
    const ctx = screen.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, screen.width, screen.height);

    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 48px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = screen.width / 2;
    const cy = screen.height / 2;

    ctx.fillText('W H E T S T O N E', cx, cy - 60);

    ctx.font = '20px Consolas, monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('B I O S', cx, cy + 10);

    ctx.font = '14px Consolas, monospace';
    ctx.fillText('v1.0', cx, cy + 45);

    ctx.font = '12px Consolas, monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('© 2026 Whetstone Project', cx, cy + 100);

    setTimeout(resolve, 1000);
  });
}

main().catch(err => {
  const ctx = screen.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, screen.width, screen.height);
  ctx.fillStyle = '#f66';
  ctx.font = '16px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('BIOS 错误: ' + err.message, 20, 20);
  console.error(err);
});