/**
 * @file        src/drapog.icons.js
 * @module      drapog/icons
 * @summary     内建应用手绘图标规格（单一真相源，内存/ Pages 模式下零网络依赖）
 * @description 桌面 / Dock / 窗口标题栏的 macOS 风格 squircle 图标统一从这里取，
 *   不再运行时 fetch icon.json（国内访问 GitHub Pages 偶发超时会导致退回字母）。
 *   - 内存模式：wm.iconSpecOf 直接回退到本表，永远渲染手绘图标。
 *   - 挂载真实磁盘模式：registry.scan 会读取各 .app/icon.json 覆盖本表（同内容）。
 *   若修改某个 app 图标，请同步更新对应 System/Apps/<id>.app/icon.json，保持两份一致。
 *
 *   规格字段（与 .app/icon.json 完全一致）：
 *     bg: [深, 浅] 双色垂直渐变底色
 *     fg: 图形指令数组 {t:'r'圆角矩形|'c'圆|'l'线段|'p'多边形|'t'文字, 坐标 0–100}
 */

export const BUILTIN_ICONS = {
  hello: {
    bg: ['#30d158', '#248a3d'],
    fg: [
      { t: 'l', x1: 26, y1: 32, x2: 42, y2: 48, w: 7, c: '#ffffff' },
      { t: 'l', x1: 42, y1: 48, x2: 26, y2: 64, w: 7, c: '#ffffff' },
      { t: 'l', x1: 50, y1: 66, x2: 70, y2: 66, w: 7, c: '#ffffff' },
    ],
  },
  calc: {
    bg: ['#4a4a4f', '#1c1c1e'],
    fg: [
      { t: 'r', x: 14, y: 12, w: 72, h: 18, rad: 4, c: '#2c2c2e' },
      { t: 't', s: '0', x: 74, y: 21, size: 14, c: '#ffffff', bold: true },
      { t: 'c', cx: 30, cy: 44, r: 7, c: '#8e8e93' },
      { t: 'c', cx: 50, cy: 44, r: 7, c: '#8e8e93' },
      { t: 'c', cx: 70, cy: 44, r: 7, c: '#ff9500' },
      { t: 'c', cx: 30, cy: 62, r: 7, c: '#8e8e93' },
      { t: 'c', cx: 50, cy: 62, r: 7, c: '#8e8e93' },
      { t: 'c', cx: 70, cy: 62, r: 7, c: '#ff9500' },
      { t: 'c', cx: 30, cy: 80, r: 7, c: '#8e8e93' },
      { t: 'c', cx: 50, cy: 80, r: 7, c: '#8e8e93' },
      { t: 'c', cx: 70, cy: 80, r: 7, c: '#ff9500' },
    ],
  },
  conv: {
    bg: ['#5ac8fa', '#007aff'],
    fg: [
      { t: 'l', x1: 28, y1: 38, x2: 66, y2: 38, w: 7, c: '#ffffff' },
      { t: 'p', pts: [[62, 28], [78, 38], [62, 48]], c: '#ffffff' },
      { t: 'l', x1: 72, y1: 64, x2: 34, y2: 64, w: 7, c: '#ffffff' },
      { t: 'p', pts: [[38, 54], [22, 64], [38, 74]], c: '#ffffff' },
    ],
  },
  docedit: {
    bg: ['#ffffff', '#e4e4ea'],
    fg: [
      { t: 'p', pts: [[24, 8], [62, 8], [78, 24], [78, 92], [24, 92]], c: '#ffffff' },
      { t: 'p', pts: [[62, 8], [62, 24], [78, 24]], c: '#cfcfd8' },
      { t: 'r', x: 32, y: 36, w: 38, h: 5, rad: 2.5, c: '#0a84ff' },
      { t: 'r', x: 32, y: 50, w: 38, h: 5, rad: 2.5, c: '#0a84ff' },
      { t: 'r', x: 32, y: 64, w: 26, h: 5, rad: 2.5, c: '#0a84ff' },
    ],
  },
  settings: {
    bg: ['#b6bcc4', '#7d8590'],
    fg: [
      { t: 'l', x1: 50, y1: 20, x2: 50, y2: 80, w: 13, c: '#f2f2f7' },
      { t: 'l', x1: 20, y1: 50, x2: 80, y2: 50, w: 13, c: '#f2f2f7' },
      { t: 'l', x1: 29, y1: 29, x2: 71, y2: 71, w: 13, c: '#f2f2f7' },
      { t: 'l', x1: 71, y1: 29, x2: 29, y2: 71, w: 13, c: '#f2f2f7' },
      { t: 'c', cx: 50, cy: 50, r: 23, c: '#f2f2f7' },
      { t: 'c', cx: 50, cy: 50, r: 10, c: '#8f97a1' },
    ],
  },
  trash: {
    bg: ['#e5e8ec', '#b0b7c1'],
    fg: [
      { t: 'r', x: 26, y: 20, w: 48, h: 6, rad: 3, c: '#ffffff' },
      { t: 'p', pts: [[30, 31], [70, 31], [65, 84], [35, 84]], c: '#ffffff' },
      { t: 'l', x1: 43, y1: 40, x2: 44, y2: 74, w: 4, c: '#c2c8d1' },
      { t: 'l', x1: 57, y1: 40, x2: 56, y2: 74, w: 4, c: '#c2c8d1' },
    ],
  },
  thispc: {
    bg: ['#98a4b0', '#5b6672'],
    fg: [
      { t: 'r', x: 16, y: 22, w: 68, h: 44, rad: 5, c: '#1d1f24' },
      { t: 'r', x: 20, y: 26, w: 60, h: 34, rad: 3, c: '#0a84ff' },
      { t: 'r', x: 44, y: 66, w: 12, h: 9, c: '#d8dce2' },
      { t: 'r', x: 32, y: 75, w: 36, h: 6, rad: 3, c: '#d8dce2' },
    ],
  },
  finder: {
    bg: ['#c6e8ff', '#3aa0e8'],
    fg: [
      { t: 'r', x: 10, y: 10, w: 38, h: 80, rad: 14, c: '#ffffff' },
      { t: 'r', x: 32, y: 30, w: 8, h: 15, rad: 4, c: '#2a3b4d' },
      { t: 'r', x: 58, y: 30, w: 8, h: 15, rad: 4, c: '#2a3b4d' },
      { t: 'l', x1: 32, y1: 66, x2: 68, y2: 60, w: 6, c: '#2a3b4d' },
    ],
  },
  terminal: {
    bg: ['#4a4a4f', '#1c1c1e'],
    fg: [
      { t: 'l', x1: 24, y1: 32, x2: 40, y2: 48, w: 7, c: '#ffffff' },
      { t: 'l', x1: 40, y1: 48, x2: 24, y2: 64, w: 7, c: '#ffffff' },
      { t: 'l', x1: 48, y1: 66, x2: 70, y2: 66, w: 7, c: '#ffffff' },
    ],
  },
  edit: {
    bg: ['#ffffff', '#e9e9ee'],
    fg: [
      { t: 'p', pts: [[24, 8], [62, 8], [78, 24], [78, 92], [24, 92]], c: '#ffffff' },
      { t: 'p', pts: [[62, 8], [62, 24], [78, 24]], c: '#cfcfd8' },
      { t: 'r', x: 32, y: 36, w: 38, h: 5, rad: 2.5, c: '#8e8e93' },
      { t: 'r', x: 32, y: 50, w: 38, h: 5, rad: 2.5, c: '#8e8e93' },
      { t: 'r', x: 32, y: 64, w: 26, h: 5, rad: 2.5, c: '#8e8e93' },
    ],
  },
  about: {
    bg: ['#a1a6ad', '#63676e'],
    fg: [
      { t: 'c', cx: 50, cy: 50, r: 30, c: '#ffffff' },
      { t: 't', s: 'i', x: 50, y: 51, size: 42, c: '#7d8590', bold: true },
    ],
  },
  appmgr: {
    bg: ['#64d2ff', '#0a84ff'],
    fg: [
      { t: 'r', x: 24, y: 24, w: 22, h: 22, rad: 6, c: '#ffffff' },
      { t: 'r', x: 54, y: 24, w: 22, h: 22, rad: 6, c: '#ffffff' },
      { t: 'r', x: 24, y: 54, w: 22, h: 22, rad: 6, c: '#ffffff' },
      { t: 'r', x: 54, y: 54, w: 22, h: 22, rad: 6, c: '#ffffff' },
    ],
  },
};
