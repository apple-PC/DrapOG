/**
 * @file        drapog.glyphs.js
 * @module      drapog/glyphs
 * @summary     手绘风矢量图标库（24×24 设计网格）
 * @description DrapLang 应用经 win_glyph(0x84) 或 win_button(图标名 id) 调用的图标都在此绘制。
 *              线型图标（导航/视图/格式/分享等）使用传入的前景色；语义图标（文件夹/文档/动作）
 *              使用固定配色，保证在任何主题下都清晰可辨。所有绘制均不依赖 DOM，纯 Canvas2D。
 */

// 圆角矩形路径（当前 ctx 已 translate/scale 到 24×24 网格）
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function stroke(ctx, color, w, fn) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  fn(ctx);
  ctx.stroke();
}
function fill(ctx, color, fn) {
  ctx.fillStyle = color;
  ctx.beginPath();
  fn(ctx);
  ctx.fill();
}

// 文件夹路径（蓝色主体 + 顶部稍深一截），返回两个填充调用
function folderBody(ctx, body, tab) {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(2, 7);
  ctx.lineTo(9, 7);
  ctx.lineTo(11.5, 9.5);
  ctx.lineTo(21, 9.5);
  ctx.quadraticCurveTo(22, 9.5, 22, 11);
  ctx.lineTo(22, 19);
  ctx.quadraticCurveTo(22, 20.5, 20.5, 20.5);
  ctx.lineTo(3.5, 20.5);
  ctx.quadraticCurveTo(2, 20.5, 2, 19);
  ctx.closePath();
  ctx.fill();
  // 顶部高光（略深）
  ctx.fillStyle = tab;
  ctx.beginPath();
  ctx.moveTo(2, 7);
  ctx.lineTo(9, 7);
  ctx.lineTo(11.5, 9.5);
  ctx.lineTo(21, 9.5);
  ctx.quadraticCurveTo(22, 9.5, 22, 11);
  ctx.lineTo(2, 11);
  ctx.closePath();
  ctx.fill();
}
function docBody(ctx) {
  // 白底文档 + 折角 + 描边
  ctx.fillStyle = '#f4f4f7';
  ctx.beginPath();
  ctx.moveTo(5, 3); ctx.lineTo(13, 3); ctx.lineTo(19, 9); ctx.lineTo(19, 21); ctx.lineTo(5, 21); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#dfe0e6';
  ctx.beginPath();
  ctx.moveTo(13, 3); ctx.lineTo(13, 9); ctx.lineTo(19, 9); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c2c3cc';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(5, 3); ctx.lineTo(13, 3); ctx.lineTo(19, 9); ctx.lineTo(19, 21); ctx.lineTo(5, 21); ctx.closePath();
  ctx.stroke();
}

const GLYPHS = {
  // ---------- 导航 ----------
  back(ctx, color) { stroke(ctx, color, 2.2, c => { c.moveTo(14, 6); c.lineTo(8, 12); c.lineTo(14, 18); }); },
  forward(ctx, color) { stroke(ctx, color, 2.2, c => { c.moveTo(10, 6); c.lineTo(16, 12); c.lineTo(10, 18); }); },

  // ---------- 视图切换 ----------
  viewGrid(ctx, color) { stroke(ctx, color, 1.8, c => { rr(c, 4, 4, 7, 7, 1.5); rr(c, 13, 4, 7, 7, 1.5); rr(c, 4, 13, 7, 7, 1.5); rr(c, 13, 13, 7, 7, 1.5); }); },
  viewList(ctx, color) { stroke(ctx, color, 1.8, c => { c.moveTo(4, 7); c.lineTo(20, 7); c.moveTo(4, 12); c.lineTo(20, 12); c.moveTo(4, 17); c.lineTo(20, 17); }); },
  viewColumns(ctx, color) { stroke(ctx, color, 1.8, c => { c.moveTo(9, 4); c.lineTo(9, 20); c.moveTo(12, 4); c.lineTo(12, 20); c.moveTo(15, 4); c.lineTo(15, 20); }); },
  viewGallery(ctx, color) {
    stroke(ctx, color, 1.8, c => { rr(c, 3, 5, 18, 14, 2); });
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(9, 11, 2.2, 0, Math.PI * 2); ctx.fill();
    stroke(ctx, color, 1.8, c => { c.moveTo(5, 17); c.lineTo(11, 11); c.lineTo(15, 15); c.lineTo(18, 12); c.lineTo(21, 16); });
  },

  // ---------- 动作 ----------
  newfolder(ctx) {
    folderBody(ctx, '#3b9eff', '#2b8ae6');
    stroke(ctx, '#34c759', 2.2, c => { c.moveTo(17, 4); c.lineTo(17, 10); c.moveTo(14, 7); c.lineTo(20, 7); });
  },
  newfile(ctx) {
    docBody(ctx);
    stroke(ctx, '#34c759', 2.2, c => { c.moveTo(12, 9); c.lineTo(12, 15); c.moveTo(9, 12); c.lineTo(15, 12); });
  },
  trash(ctx) {
    ctx.fillStyle = '#9aa0a6';
    rr(ctx, 6, 9, 12, 12, 1.5); ctx.fill();
    rr(ctx, 4, 5, 16, 4, 1.2); ctx.fill();
    stroke(ctx, '#9aa0a6', 1, c => { c.moveTo(10, 3); c.lineTo(10, 5); c.moveTo(14, 3); c.lineTo(14, 5); });
    stroke(ctx, '#6b6f75', 1.2, c => { c.moveTo(9, 12); c.lineTo(9, 18); c.moveTo(12, 12); c.lineTo(12, 18); c.moveTo(15, 12); c.lineTo(15, 18); });
  },
  open(ctx) {
    folderBody(ctx, '#3b9eff', '#2b8ae6');
    stroke(ctx, '#ffffff', 2, c => { c.moveTo(9, 16); c.lineTo(15, 10); c.moveTo(11, 10); c.lineTo(15, 10); c.lineTo(15, 14); });
  },
  share(ctx, color) {
    stroke(ctx, color, 1.8, c => { rr(c, 4, 9, 16, 11, 2); });
    stroke(ctx, color, 1.8, c => { c.moveTo(12, 3); c.lineTo(12, 15); c.moveTo(8, 7); c.lineTo(12, 3); c.lineTo(16, 7); });
  },
  tag(ctx, color) {
    stroke(ctx, color, 1.8, c => { c.moveTo(4, 8); c.lineTo(11, 3); c.lineTo(21, 3); c.lineTo(21, 15); c.lineTo(9, 21); c.lineTo(4, 15); c.closePath(); });
    stroke(ctx, color, 1.8, c => { c.moveTo(8.5, 8.5); c.arc(8.5, 8.5, 2, 0, Math.PI * 2); });
  },
  more(ctx, color) {
    ctx.fillStyle = color;
    [6, 12, 18].forEach(cx => { ctx.beginPath(); ctx.arc(cx, 12, 1.8, 0, Math.PI * 2); ctx.fill(); });
  },
  search(ctx, color) {
    stroke(ctx, color, 2, c => { c.arc(10.5, 10.5, 6, 0, Math.PI * 2); });
    stroke(ctx, color, 2, c => { c.moveTo(15, 15); c.lineTo(20, 20); });
  },
  restore(ctx, color) {
    stroke(ctx, color, 1.8, c => { c.arc(12, 12, 7, Math.PI * 0.35, Math.PI * 1.9); });
    stroke(ctx, color, 1.8, c => { c.moveTo(6.5, 8.5); c.lineTo(4.5, 13.5); c.lineTo(10, 12.5); });
  },

  // ---------- 文件 / 文件夹 / 应用 ----------
  folder(ctx) { folderBody(ctx, '#3b9eff', '#2b8ae6'); },
  file(ctx) { docBody(ctx); },
  app(ctx) {
    ctx.fillStyle = '#9aa0a6'; rr(ctx, 4, 4, 16, 16, 4); ctx.fill();
    ctx.fillStyle = '#c7ccd1'; rr(ctx, 8, 8, 8, 8, 2); ctx.fill();
  },

  // ---------- 文档动作 ----------
  docNew(ctx) {
    docBody(ctx);
    stroke(ctx, '#0a84ff', 2.2, c => { c.moveTo(12, 9); c.lineTo(12, 15); c.moveTo(9, 12); c.lineTo(15, 12); });
  },
  docOpen(ctx) {
    folderBody(ctx, '#3b9eff', '#2b8ae6');
    stroke(ctx, '#ffffff', 2, c => { c.moveTo(9, 16); c.lineTo(15, 10); c.moveTo(11, 10); c.lineTo(15, 10); c.lineTo(15, 14); });
  },
  docSave(ctx) {
    ctx.fillStyle = '#9aa0a6';
    ctx.beginPath();
    ctx.moveTo(3, 12); ctx.lineTo(8, 12); ctx.quadraticCurveTo(12, 19, 16, 12); ctx.lineTo(21, 12); ctx.lineTo(21, 19); ctx.lineTo(3, 19); ctx.closePath();
    ctx.fill();
    stroke(ctx, '#0a84ff', 2.2, c => { c.moveTo(12, 3); c.lineTo(12, 13); c.moveTo(9, 10); c.lineTo(12, 13); c.lineTo(15, 10); });
  },

  // ---------- 文本格式 ----------
  bold(ctx, color) {
    ctx.fillStyle = color; ctx.font = '700 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B', 12, 13);
  },
  italic(ctx, color) {
    ctx.fillStyle = color; ctx.font = 'italic 700 16px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('I', 12, 13);
  },
  underline(ctx, color) {
    ctx.fillStyle = color; ctx.font = '700 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('U', 12, 12);
    stroke(ctx, color, 1.6, c => { c.moveTo(6, 19); c.lineTo(18, 19); });
  },
  fontMinus(ctx, color) {
    ctx.fillStyle = color; ctx.font = '700 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 10, 11);
    stroke(ctx, color, 1.6, c => { c.moveTo(15, 16); c.lineTo(21, 16); });
  },
  fontPlus(ctx, color) {
    ctx.fillStyle = color; ctx.font = '700 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 10, 11);
    stroke(ctx, color, 1.6, c => { c.moveTo(18.5, 14); c.lineTo(18.5, 18); c.moveTo(16.5, 16); c.lineTo(20.5, 16); });
  },
  alignLeft(ctx, color) {
    stroke(ctx, color, 1.8, c => { c.moveTo(4, 6); c.lineTo(20, 6); c.moveTo(4, 12); c.lineTo(14, 12); c.moveTo(4, 18); c.lineTo(17, 18); });
  },
  alignCenter(ctx, color) {
    stroke(ctx, color, 1.8, c => { c.moveTo(6, 6); c.lineTo(18, 6); c.moveTo(8, 12); c.lineTo(16, 12); c.moveTo(5, 18); c.lineTo(19, 18); });
  },
  alignRight(ctx, color) {
    stroke(ctx, color, 1.8, c => { c.moveTo(4, 6); c.lineTo(20, 6); c.moveTo(10, 12); c.lineTo(20, 12); c.moveTo(7, 18); c.lineTo(20, 18); });
  },

  // ---------- 播放 / 音频（音波） ----------
  play(ctx, color) {
    fill(ctx, color, c => { c.moveTo(7, 4.5); c.lineTo(19, 12); c.lineTo(7, 19.5); c.closePath(); });
  },
  pause(ctx, color) {
    ctx.fillStyle = color;
    rr(ctx, 6.5, 4.5, 4, 15, 1.4); ctx.fill();
    rr(ctx, 13.5, 4.5, 4, 15, 1.4); ctx.fill();
  },
  stop(ctx, color) {
    ctx.fillStyle = color;
    rr(ctx, 6, 6, 12, 12, 2); ctx.fill();
  },
  volume(ctx, color) {
    fill(ctx, color, c => { c.moveTo(3, 9); c.lineTo(7, 9); c.lineTo(12, 4.5); c.lineTo(12, 19.5); c.lineTo(7, 15); c.lineTo(3, 15); c.closePath(); });
    stroke(ctx, color, 1.7, c => { c.moveTo(15, 9); c.quadraticCurveTo(17.5, 12, 15, 15); });
    stroke(ctx, color, 1.7, c => { c.moveTo(18, 6.5); c.quadraticCurveTo(21.5, 12, 18, 17.5); });
  },
  mic(ctx, color) {
    stroke(ctx, color, 1.9, c => { rr(c, 9, 3, 6, 11, 3); });
    stroke(ctx, color, 1.9, c => { c.moveTo(5.5, 11.5); c.quadraticCurveTo(5.5, 17, 12, 17); c.quadraticCurveTo(18.5, 17, 18.5, 11.5); });
    stroke(ctx, color, 1.9, c => { c.moveTo(12, 17); c.lineTo(12, 21); c.moveTo(8.5, 21); c.lineTo(15.5, 21); });
  },
  bars(ctx, color) {
    ctx.fillStyle = color;
    const hs = [8, 15, 11, 18, 13];
    for (let i = 0; i < 5; i++) { rr(ctx, 3 + i * 4, 20 - hs[i], 2.6, hs[i], 1.2); ctx.fill(); }
  },
  ring(ctx, color) {
    stroke(ctx, color, 1.8, c => { c.arc(12, 12, 8.5, 0, Math.PI * 2); });
    stroke(ctx, color, 1.8, c => { c.arc(12, 12, 4, 0, Math.PI * 2); });
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(12, 12, 1.8, 0, Math.PI * 2); ctx.fill();
  },
  wave(ctx, color) {
    stroke(ctx, color, 1.9, c => {
      c.moveTo(2.5, 12);
      for (let x = 2.5; x <= 21.5; x += 0.5) c.lineTo(x, 12 - Math.sin((x - 2.5) / 19 * Math.PI * 4) * 6);
    });
  },
  particles(ctx, color) {
    ctx.fillStyle = color;
    const pts = [[7, 8, 2], [15, 6, 1.4], [18, 12, 2.2], [11, 13, 1.6], [6, 16, 1.3], [16, 18, 1.8], [9, 19, 1.2]];
    for (const [x, y, r] of pts) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  },

  // ---------- 时间（计时器） ----------
  clock(ctx, color) {
    stroke(ctx, color, 1.9, c => { c.arc(12, 12, 8.6, 0, Math.PI * 2); });
    stroke(ctx, color, 2, c => { c.moveTo(12, 7); c.lineTo(12, 12.4); c.lineTo(16, 14.2); });
  },
  stopwatch(ctx, color) {
    stroke(ctx, color, 1.9, c => { c.arc(12, 13.5, 7.5, 0, Math.PI * 2); });
    stroke(ctx, color, 1.9, c => { c.moveTo(12, 13.5); c.lineTo(12, 9.5); });
    stroke(ctx, color, 1.9, c => { c.moveTo(9.5, 2.5); c.lineTo(14.5, 2.5); c.moveTo(12, 2.5); c.lineTo(12, 4); });
    stroke(ctx, color, 1.9, c => { c.moveTo(18.5, 6.5); c.lineTo(20, 8); });
  },
  globe(ctx, color) {
    stroke(ctx, color, 1.8, c => { c.arc(12, 12, 8.6, 0, Math.PI * 2); });
    stroke(ctx, color, 1.5, c => { c.moveTo(3.4, 12); c.lineTo(20.6, 12); });
    stroke(ctx, color, 1.5, c => {
      c.moveTo(12, 3.4);
      c.bezierCurveTo(7, 7, 7, 17, 12, 20.6);
      c.bezierCurveTo(17, 17, 17, 7, 12, 3.4);
    });
  },
  plus(ctx, color) {
    stroke(ctx, color, 2.2, c => { c.moveTo(12, 5); c.lineTo(12, 19); c.moveTo(5, 12); c.lineTo(19, 12); });
  },
  minus(ctx, color) {
    stroke(ctx, color, 2.2, c => { c.moveTo(5, 12); c.lineTo(19, 12); });
  },
  reset(ctx, color) {
    stroke(ctx, color, 1.9, c => { c.arc(12, 12, 7.2, Math.PI * 0.4, Math.PI * 1.95); });
    stroke(ctx, color, 1.9, c => { c.moveTo(6.4, 8.2); c.lineTo(4.3, 13.2); c.lineTo(9.8, 12.3); });
  },
  timer(ctx, color) {
    // 沙漏
    stroke(ctx, color, 1.9, c => {
      c.moveTo(6, 3); c.lineTo(18, 3);
      c.moveTo(6, 21); c.lineTo(18, 21);
      c.moveTo(7, 3); c.lineTo(7, 7); c.lineTo(12, 12); c.lineTo(7, 17); c.lineTo(7, 21);
      c.moveTo(17, 3); c.lineTo(17, 7); c.lineTo(12, 12); c.lineTo(17, 17); c.lineTo(17, 21);
    });
  },
  lap(ctx, color) {    stroke(ctx, color, 1.8, c => { c.moveTo(4, 6); c.lineTo(16, 6); c.moveTo(4, 11); c.lineTo(16, 11); c.moveTo(4, 16); c.lineTo(16, 16); });
    stroke(ctx, color, 1.8, c => { c.moveTo(19, 4); c.lineTo(19, 18); });
  },
};

export function isGlyph(name) { return Object.prototype.hasOwnProperty.call(GLYPHS, name); }

// 在 (x,y) 处绘制 size×size 的图标；返回是否成功识别
export function drawGlyph(ctx, name, x, y, size, opts = {}) {
  const g = GLYPHS[name];
  if (!g) return false;
  ctx.save();
  ctx.translate(x, y);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  g(ctx, opts.color || '#e8e8ed');
  ctx.restore();
  return true;
}
