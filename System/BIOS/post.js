/**
 * @file        System/BIOS/post.js
 * @module      drapog/bios/post
 * @summary     POST 开机自检
 * @version     0.1.0
 */

const screen = document.getElementById('screen');

/**
 * 执行 POST 自检并打印结果
 * @returns {Promise<void>}
 */
export async function runPOST() {
  const ctx = screen.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, screen.width, screen.height);

  const checks = [
    { name: 'CPU',     test: () => typeof BigInt === 'function',              detail: getEngineName() },
    { name: 'MEM',     test: () => typeof ArrayBuffer === 'function',         detail: '64 MB' },
    { name: 'VIDEO',   test: () => !!ctx,                                     detail: 'Canvas 2D' },
    { name: 'INPUT',   test: () => 'onkeydown' in window,                     detail: 'Keyboard / Mouse' },
    { name: 'STORAGE', test: () => typeof showDirectoryPicker === 'function', detail: 'File System Access API' },
    { name: 'IDB',     test: () => typeof indexedDB !== 'undefined',          detail: 'IndexedDB' },
    { name: 'WORKER',  test: () => typeof Worker !== 'undefined',             detail: 'Web Worker' },
    { name: 'NET',     test: () => typeof fetch === 'function',               detail: 'fetch' },
  ];

  let y = 30;
  const x = 30;
  const lineH = 22;

  ctx.font = '14px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#e0e0e0';
  ctx.fillText('Whetstone BIOS v1.0', x, y);
  y += lineH;
  ctx.fillStyle = '#666';
  ctx.fillText('Copyright (C) 2026 Whetstone Project', x, y);
  y += lineH * 2;

  ctx.fillStyle = '#e0e0e0';
  ctx.fillText('POST 自检中...', x, y);
  y += lineH * 1.5;

  for (const c of checks) {
    await sleep(60);
    let ok = false;
    try { ok = c.test(); } catch { ok = false; }

    const nameCol = (c.name + '        ').slice(0, 8);
    ctx.fillStyle = '#888';
    ctx.fillText(nameCol, x, y);
    ctx.fillStyle = '#666';
    ctx.fillText(': ' + c.detail, x + 110, y);
    ctx.fillStyle = ok ? '#4ec9b0' : '#f48771';
    ctx.fillText(ok ? '✓' : '✗', x + 360, y);
    y += lineH;
  }

  y += lineH;
  ctx.fillStyle = '#4ec9b0';
  ctx.fillText('POST OK', x, y);

  await sleep(500);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getEngineName() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'JavaScript V8 (Chromium)';
  if (ua.includes('Firefox')) return 'JavaScript SpiderMonkey';
  if (ua.includes('Safari')) return 'JavaScript JavaScriptCore';
  return 'JavaScript';
}