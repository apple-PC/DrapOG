/**
 * @file        src/drapog.icon.js
 * @module      drapog/icon
 * @summary     共享手绘图标资源（Apple 标志路径 + 绘制助手）
 * @description 供 BIOS 开机 splash 与 WM macOS 菜单栏复用，避免重复维护同一路径。
 *              绘制优先用 Path2D（浏览器）+ 标准 Apple 标志轮廓；不支持时退回简单圆点兜底。
 * @version     1.0.0
 */

// 经典 Apple 标志轮廓（viewBox 814 × 1000，相对路径命令，Path2D 可直接 fill）
export const APPLE_LOGO_PATH =
  'M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-' +
  '0.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5' +
  'c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 ' +
  '126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 ' +
  '130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-0.6-14.3-1.9-20.1' +
  '-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 ' +
  '3.2 0.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z';

const APPLE_W = 814;
const APPLE_H = 1000;

/**
 * 在 (cx, cy) 居中绘制高为 h 的 Apple 标志。
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {number} cx 中心 x
 * @param {number} cy 中心 y
 * @param {number} h  标志高度（像素）
 * @param {string} [color='rgba(255,255,255,0.94)'] 填充色
 */
export function drawAppleLogo(ctx, cx, cy, h, color = 'rgba(255,255,255,0.94)') {
  const s = h / APPLE_H;
  ctx.save();
  ctx.translate(cx - (APPLE_W * s) / 2, cy - h / 2);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  if (typeof Path2D !== 'undefined') {
    ctx.fill(new Path2D(APPLE_LOGO_PATH));
  } else {
    // 兜底：画一个实心圆，至少有个可见图标
    ctx.beginPath();
    ctx.arc(APPLE_W / 2, APPLE_H / 2, 360, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
