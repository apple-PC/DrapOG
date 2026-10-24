#!/usr/bin/env node
/**
 * @file        tools/ui-preview.mjs
 * @module      drapog/tools/ui-preview
 * @summary     把 DrapLang GUI 应用的绘制指令快照渲染成 SVG/HTML（改版式时肉眼校验用）
 * @description 无浏览器依赖：启动 .app → 注入若干事件 → 取 drawOps → 输出 SVG。
 *   想看图可用系统浏览器无头截图：
 *     node tools/ui-preview.mjs System/Apps/Chrono.app/main.drapp --events "click timer" --out /tmp/chrono
 *     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *       --screenshot=/tmp/chrono.png --window-size=980,660 file:///tmp/chrono.html
 *   --theme light 用浅色调色板（校验双主题对比度）。
 */

import { readFileSync, writeFileSync } from 'fs';
import { DrapCC } from '../src/drapcc.js';
import { launchDrapAppProgram } from '../src/drapog.launcher.js';

const DARK = [[18, 18, 24], [235, 235, 245], [10, 132, 255], [30, 33, 42], [56, 62, 78]];
const LIGHT = [[245, 245, 247], [28, 28, 32], [10, 132, 255], [232, 232, 238], [214, 224, 240]];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

export function opsToSvg(st, W, H, palette) {
  const out = [`<rect x="0" y="0" width="${W}" height="${H}" fill="${rgb(palette[0])}"/>`];
  for (const op of st.drawOps) {
    const a = (typeof op.alpha === 'number') ? op.alpha / 100 : 1;
    if (op.op === 'fill') out.push(`<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${rgb(op.color)}" opacity="${a}"/>`);
    else if (op.op === 'rrect') out.push(`<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" rx="${op.rad}" fill="${rgb(op.color)}" opacity="${a}"/>`);
    else if (op.op === 'stroke') out.push(`<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="none" stroke="${rgb(op.color)}" stroke-width="${op.lineW || 1}" opacity="${a}"/>`);
    else if (op.op === 'line') out.push(`<line x1="${op.x1}" y1="${op.y1}" x2="${op.x2}" y2="${op.y2}" stroke="${rgb(op.color)}" stroke-width="${op.lineW || 1}" stroke-linecap="round" opacity="${a}"/>`);
    else if (op.op === 'circle') out.push(`<circle cx="${op.cx}" cy="${op.cy}" r="${op.r}" fill="${op.fill ? rgb(op.color) : 'none'}"${op.fill ? '' : ` stroke="${rgb(op.color)}" stroke-width="${op.lineW || 1}"`} opacity="${a}"/>`);
    else if (op.op === 'arc') {
      const p0 = [op.cx + op.r * Math.cos(op.a0 * Math.PI / 180), op.cy + op.r * Math.sin(op.a0 * Math.PI / 180)];
      const p1 = [op.cx + op.r * Math.cos(op.a1 * Math.PI / 180), op.cy + op.r * Math.sin(op.a1 * Math.PI / 180)];
      const large = Math.abs(op.a1 - op.a0) > 180 ? 1 : 0;
      out.push(`<path d="M ${p0[0]} ${p0[1]} A ${op.r} ${op.r} 0 ${large} 1 ${p1[0]} ${p1[1]}" fill="none" stroke="${rgb(op.color)}" stroke-width="${op.lineW || 1}" stroke-linecap="round" opacity="${a}"/>`);
    } else if (op.op === 'text' || op.op === 'textc') {
      const fam = op.mono ? 'ui-monospace, Menlo, monospace' : '-apple-system, "PingFang SC", sans-serif';
      out.push(`<text x="${op.x}" y="${op.y + op.font * 0.82}" font-size="${op.font}" font-weight="${op.bold ? 600 : 400}" font-family='${fam}' text-anchor="${op.op === 'textc' ? 'middle' : 'start'}" fill="${rgb(op.color)}" opacity="${a}">${esc(op.text)}</text>`);
    }
  }
  for (const c of st.controls) {   // 声明式控件：画占位块（真实字形由宿主 glyph 库绘制）
    if (c.type !== 'button') continue;
    out.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="8" fill="${rgb(palette[1])}" opacity="0.10"/>`);
    out.push(`<text x="${c.x + c.w / 2}" y="${c.y + c.h / 2 + 5}" font-size="11" text-anchor="middle" fill="${rgb(palette[1])}" font-family="-apple-system">${esc(c.id)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`;
}

async function main() {
  const appPath = process.argv[2];
  if (!appPath) {
    console.error('用法: node tools/ui-preview.mjs <app/main.drapp> [--events "click timer"] [--out /tmp/x] [--theme dark|light]');
    process.exit(1);
  }
  const events = (arg('events', '') || '').split('|').filter(Boolean);
  const outBase = arg('out', '/tmp/drapp-preview');
  const palette = arg('theme', 'dark') === 'light' ? LIGHT : DARK;

  let id = 1, lastWin = null;
  const wm = {
    T: { palette },
    createWindow(o) { lastWin = { id: id++, title: o.title, w: o.w, h: o.h, __sys: null }; return lastWin; },
    closeWindow() {}, drawAppIcon() {}, roundRect() {},
  };
  const program = new DrapCC(readFileSync(appPath, 'utf8')).compile();
  const sys = launchDrapAppProgram(wm, {}, program, null, null, 'preview');
  const win = lastWin;
  await settle();
  for (const ev of events) { sys.injectWinEvent(win.id, ev); await settle(); }
  sys.injectWinEvent(win.id, 'paint'); await settle();

  const st = sys.drapWins.get(win.id);
  const svg = opsToSvg(st, win.w, win.h, palette);
  writeFileSync(outBase + '.svg', svg);
  writeFileSync(outBase + '.html', `<!DOCTYPE html><html><body style="margin:0;background:#000">${svg}</body></html>`);
  console.log('已生成 ' + outBase + '.svg / .html（' + win.w + '×' + win.h + '，' + st.drawOps.length + ' 条绘制指令）');
}

if (process.argv[1] && process.argv[1].endsWith('ui-preview.mjs')) {
  main().catch((e) => { console.error('预览失败: ' + e.message); process.exit(1); });
}
