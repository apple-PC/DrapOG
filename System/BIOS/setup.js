/**
 * @file        System/BIOS/setup.js
 * @module      drapog/bios/setup
 * @summary     Whetstone BIOS Setup（BIOS 设置）
 * @description 固件级设置界面。BIOS 运行在 VFS 挂载之前，故设置持久化到
 *              localStorage（相当于真实机器的 CMOS/NVRAM），键：drapog.bios.cmos。
 *              可配置：启动模式（自动/CMD/GUI）、启动菜单倒计时（0=一直等待）。
 *              纯逻辑（load/save/normalize/adjust）与 DOM 分离，便于在 node 下单测。
 * @version     0.3.0
 * @author      Whetstone Project
 */

export const BIOS_CMOS_KEY = 'drapog.bios.cmos';

/** 出厂默认设置 */
export const DEFAULT_SETTINGS = { bootMode: 'auto', timeout: 5 };
// bootMode: 'auto'(按设备) | 'cmd' | 'gui'
// timeout : 菜单倒计时秒数，0 = 一直等待用户选择

const BOOT_MODES = ['auto', 'cmd', 'gui'];
export const BOOT_LABELS = { auto: '自动（按设备检测）', cmd: 'DrapOG CMD', gui: 'DrapOG GUI' };

/** 清洗/合并设置：缺字段或非法值回退默认；timeout 约束到 [0,30] */
export function normalizeSettings(s) {
  const out = { bootMode: DEFAULT_SETTINGS.bootMode, timeout: DEFAULT_SETTINGS.timeout };
  if (s && typeof s === 'object') {
    if (BOOT_MODES.includes(s.bootMode)) out.bootMode = s.bootMode;
    const t = Number(s.timeout);
    if (Number.isFinite(t)) out.timeout = Math.max(0, Math.min(30, Math.trunc(t)));
  }
  return out;
}

/** 从 CMOS 读取设置（无记录/解析失败 → 默认） */
export function loadBiosSettings() {
  try {
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(BIOS_CMOS_KEY);
    if (!raw) return normalizeSettings(null);
    return normalizeSettings(JSON.parse(raw));
  } catch (e) {
    return normalizeSettings(null);
  }
}

/** 写入 CMOS（先 normalize），返回最终生效的设置 */
export function saveBiosSettings(s) {
  const norm = normalizeSettings(s);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BIOS_CMOS_KEY, JSON.stringify(norm));
  } catch (e) { /* 忽略写入失败（如隐私模式） */ }
  return norm;
}

/** 切换启动模式：dir=1 下一个，dir=-1 上一个（auto→cmd→gui→auto） */
export function cycleBootMode(mode, dir = 1) {
  const i = BOOT_MODES.indexOf(mode);
  const base = i < 0 ? 0 : i;
  return BOOT_MODES[(base + dir + BOOT_MODES.length) % BOOT_MODES.length];
}

/** 调整倒计时：dir=±1，约束 [0,30] */
export function adjustTimeout(t, dir) {
  return Math.max(0, Math.min(30, Math.trunc(t) + dir));
}

/* ==================== 设置界面（canvas，DOM 相关） ==================== */

/**
 * 打开 BIOS Setup，返回 Promise；用户「保存并退出 / 不保存退出」后 resolve。
 * 保存时写 CMOS；不保存则丢弃工作副本。调用方负责在 resolve 后回到启动菜单。
 */
export function showSetup() {
  return new Promise(resolve => {
    const screen = document.getElementById('screen');
    const ctx = screen.getContext('2d');

    const s = { ...loadBiosSettings() };   // 工作副本
    let sel = 0;

    const ROWS = [
      { type: 'enum',   key: 'bootMode', label: '启动模式' },
      { type: 'num',    key: 'timeout',  label: '菜单倒计时' },
      { type: 'action', id: 'defaults',  label: '恢复默认设置' },
      { type: 'action', id: 'save',      label: '保存并退出' },
      { type: 'action', id: 'discard',   label: '不保存退出' },
    ];

    function valueText(row) {
      if (row.type === 'enum') return BOOT_LABELS[s.bootMode] + '   < >';
      if (row.type === 'num') return (s.timeout === 0 ? '一直等待' : s.timeout + ' 秒') + '   < >';
      return '';
    }

    function draw() {
      const W = screen.width, H = screen.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // 外框
      ctx.strokeStyle = '#2a4d5e';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 40, Math.max(360, W - 80), Math.max(280, H - 120));

      let y = 64;
      ctx.fillStyle = '#4fc1ff';
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.fillText('Whetstone BIOS Setup', 64, y);
      y += 28;
      ctx.fillStyle = '#666';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText('v0.3   ↑↓ 选择   ←→ 调整   Enter 确认   F10 保存并退出   Esc 不保存退出', 64, y);
      y += 34;

      for (let i = 0; i < ROWS.length; i++) {
        const row = ROWS[i];
        const on = i === sel;
        ctx.fillStyle = on ? '#4fc1ff' : '#cfcfcf';
        ctx.font = (on ? 'bold ' : '') + '15px Consolas, monospace';
        ctx.fillText((on ? '> ' : '  ') + row.label, 72, y);
        if (row.type !== 'action') {
          ctx.fillStyle = on ? '#9fe0ff' : '#8a8a8a';
          ctx.textAlign = 'right';
          ctx.fillText(valueText(row), W - 72, y);
          ctx.textAlign = 'left';
        }
        y += 30;
      }

      ctx.fillStyle = '#555';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText('设置保存于本机 CMOS（localStorage），重启后生效。', 64, H - 56);
    }

    function adjust(dir) {
      const row = ROWS[sel];
      if (row.type === 'enum') s.bootMode = cycleBootMode(s.bootMode, dir);
      else if (row.type === 'num') s.timeout = adjustTimeout(s.timeout, dir);
      draw();
    }

    function finish(result) {
      cleanup();
      resolve(result);
    }

    function activate() {
      const row = ROWS[sel];
      if (row.type === 'action') {
        if (row.id === 'defaults') {
          s.bootMode = DEFAULT_SETTINGS.bootMode;
          s.timeout = DEFAULT_SETTINGS.timeout;
          draw();
        } else if (row.id === 'save') {
          finish(saveBiosSettings(s));
        } else if (row.id === 'discard') {
          finish(null);
        }
      } else {
        adjust(1);   // Enter 在可调行上 = 向后切换
      }
    }

    function onKey(e) {
      switch (e.key) {
        case 'ArrowDown': sel = (sel + 1) % ROWS.length; draw(); break;
        case 'ArrowUp':   sel = (sel - 1 + ROWS.length) % ROWS.length; draw(); break;
        case 'ArrowRight': adjust(1); break;
        case 'ArrowLeft':  adjust(-1); break;
        case 'Enter': activate(); break;
        case 'F10':   finish(saveBiosSettings(s)); break;
        case 'Escape': finish(null); break;
      }
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
        if (e.preventDefault) e.preventDefault();
      }
    }

    function cleanup() {
      window.removeEventListener('keydown', onKey);
      window.__drapog_redraw = null;
    }

    window.addEventListener('keydown', onKey);
    window.__drapog_redraw = draw;
    draw();
  });
}
