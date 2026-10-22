/**
 * @file        System/BIOS/settings.js
 * @module      drapog/bios/settings
 * @summary     BIOS 设置：模型 + 持久化到「项目文件」System/Settings/bios.json
 * @description 偏好保存在项目里（而非浏览器 localStorage）。BIOS 跑在 VFS 挂载之前，
 *               故 acquireBiosVfs() 尝试从 IndexedDB 恢复上次挂载的项目文件夹句柄
 *               （键 rootHandle，与 drapog.shell.js 一致）→ mount 成真实磁盘 VFS；
 *               拿不到句柄/权限时退回内存 VFS（读取缺失即用默认，保存为临时，重启丢失）。
 *               纯逻辑（normalize/load/save/adjust）与 DOM 无关，可在 node 下单测。
 * @version     0.4.0
 * @author      Whetstone Project
 */

import { VFS } from '../../src/drapog.vfs.js';
import { idbGet, idbSet } from '../../src/drapog.idb.js';

export const SETTINGS_PATH = '/System/Settings/bios.json';
const IDB_ROOT_KEY = 'rootHandle';     // 记住上次挂载的文件夹（与 shell 一致）
const IDB_PREFS_KEY = 'bios_prefs';    // BIOS/UI 偏好兜底存储（与 WM 的 'prefs' 区分）

/** 出厂默认（与项目内置 System/Settings/bios.json 保持一致） */
export const DEFAULT_SETTINGS = {
  bootMode: 'auto',      // 'auto'(按设备) | 'cmd' | 'gui'
  timeout: 5,            // 菜单倒计时秒；0 = 一直等待
  quickPOST: true,       // 快速自检
  bootLogo: true,        // 显示开机 Logo
  secureBoot: false,     // 安全启动
  theme: 'macos',        // 'macos' | 'windows'（GUI 主题，UI 偏好）
  softKeyboard: false,   // 移动端软键盘开关（UI 偏好）
};

const BOOT_MODES = ['auto', 'cmd', 'gui'];
export const BOOT_LABELS = { auto: '自动（按设备）', cmd: 'DrapOG CMD', gui: 'DrapOG GUI' };

/** 清洗/合并：缺字段或非法值回退默认；timeout 约束 [0,30]；布尔字段强制成布尔 */
export function normalizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (s && typeof s === 'object') {
    if (BOOT_MODES.includes(s.bootMode)) out.bootMode = s.bootMode;
    const t = Number(s.timeout);
    if (Number.isFinite(t)) out.timeout = Math.max(0, Math.min(30, Math.trunc(t)));
    if (typeof s.quickPOST === 'boolean') out.quickPOST = s.quickPOST;
    if (typeof s.bootLogo === 'boolean') out.bootLogo = s.bootLogo;
    if (typeof s.secureBoot === 'boolean') out.secureBoot = s.secureBoot;
    if (s.theme === 'macos' || s.theme === 'windows') out.theme = s.theme;
    if (typeof s.softKeyboard === 'boolean') out.softKeyboard = s.softKeyboard;
  }
  return out;
}

/** 从项目文件读取设置（经 VFS）；缺失/损坏 → 回退 IndexedDB；再无 → 默认 */
export async function loadSettings(vfs) {
  try {
    const raw = await vfs.read(SETTINGS_PATH);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch (e) { /* 走 IndexedDB 兜底 */ }
  // 兜底：IndexedDB（刷新后也能恢复，无需挂载项目磁盘）
  try {
    if (typeof indexedDB !== 'undefined') {
      const p = await idbGet(IDB_PREFS_KEY);
      if (p && typeof p === 'object') return normalizeSettings(p);
    }
  } catch (e) { /* 忽略 */ }
  return normalizeSettings(null);
}

/** 写回项目文件（经 VFS）；并兜底写 IndexedDB（无需挂载也可持久化）。返回最终生效的设置 */
export async function saveSettings(vfs, s) {
  const norm = normalizeSettings(s);
  try {
    await vfs.write(SETTINGS_PATH, JSON.stringify(norm, null, 2) + '\n');
  } catch (e) {
    console.error('[BIOS] 设置写入失败（项目文件）:', e);
  }
  // 兜底：IndexedDB（即使未挂载项目磁盘，刷新后也能恢复）
  try {
    if (typeof indexedDB !== 'undefined') await idbSet(IDB_PREFS_KEY, norm);
  } catch (e) { /* 忽略 */ }
  return norm;
}

/** 切换启动模式：dir=1 下一个，-1 上一个（auto→cmd→gui→auto） */
export function cycleBootMode(mode, dir = 1) {
  const i = BOOT_MODES.indexOf(mode);
  const base = i < 0 ? 0 : i;
  return BOOT_MODES[(base + dir + BOOT_MODES.length) % BOOT_MODES.length];
}

/** 调整倒计时：dir=±1，约束 [0,30] */
export function adjustTimeout(t, dir) {
  return Math.max(0, Math.min(30, Math.trunc(t) + dir));
}

/** 布尔开关取反 */
export function toggle(b) { return !b; }

/**
 * 取得 BIOS 用的 VFS：优先恢复上次挂载的项目文件夹（真实磁盘，设置真正存进项目）；
 * 否则退回内存 VFS（此时 loadSettings 读缺失→默认，save 仅临时生效）。
 * 浏览器专用；node 下单测请自行构造 VFS 传入 load/save。
 */
export async function acquireBiosVfs() {
  const vfs = new VFS();
  try {
    if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
      const handle = await idbGet(IDB_ROOT_KEY);
      if (handle) {
        let perm = 'granted';
        try {
          perm = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
          if (perm !== 'granted' && handle.requestPermission) {
            perm = await handle.requestPermission({ mode: 'readwrite' });
          }
        } catch (e) { perm = 'denied'; }
        if (perm === 'granted') {
          await vfs.mount(handle);
          return vfs;   // 真实磁盘：读写都落到项目文件夹
        }
      }
    }
  } catch (e) { /* 落入内存模式 */ }
  return vfs;
}
