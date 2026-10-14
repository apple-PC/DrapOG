/**
 * @file        drapog.registry.js
 * @module      drapog/registry
 * @summary     应用注册表 + 统一启动器（L4：整合 draplang 工具 + 制定 .app 格式）
 * @version     1.0.0
 * @description 把「应用的发现 / 注册 / 启动」收敛为统一抽象，让 CMD 的 run、AppMgr 的点击、
 *              GUI 的 dock 都走同一套逻辑：
 *                - 内建 host 应用（Finder / Terminal / TextEdit / Settings / About / AppMgr）
 *                - DrapLang 应用（gui 型交给 WM，cli 型跑终端），由代码显式登记或 VFS 扫描 .app 包
 *             启动契约 launch(id, env)：host → wm.launchApp；gui → launchDrapApp；cli → runDrapCli。
 */

import { launchDrapApp, runDrapCli } from './drapog.launcher.js';

// 取图标首字符作为 dock/窗口字母（emoji 计为单字符；多字符 icon 退化用 name[0]）
function glyph(icon, name) {
  if (icon && icon.length >= 1) return icon;
  return (name && name[0]) || '?';
}

export class AppRegistry {
  constructor() {
    this.apps = new Map();
  }

  /** 注册一个内建 host 应用（实现已由 WM registerApp 提供） */
  addHost(id, { name, icon, title }) {
    this.apps.set(id, { id, name, icon, title: title || name, type: 'host' });
  }

  /** 注册一个 DrapLang 应用：type 'gui' 交 WM，'cli' 跑终端。file 为相对 baseUrl 的路径 */
  addDrap(id, { name, icon, type, file, baseUrl }) {
    const url = file ? new URL(file, baseUrl).href : null;
    this.apps.set(id, { id, name, icon, type, url });
  }

  /** 注册一个 VFS 路径型 DrapLang 应用（mount 模式下由扫描发现） */
  addDrapVfs(id, { name, icon, type, entry }) {
    this.apps.set(id, { id, name, icon, type, entry });
  }

  /** 扫描 VFS 某目录下的 *.app 包（挂载真实磁盘时扩展发现；内存模式通常无 System/Apps） */
  async scan(vfs, dir = 'System/Apps') {
    if (!await vfs.exists(dir)) return;
    const items = await vfs.ls(dir);
    if (!items) return;
    for (const it of items) {
      if (it.type !== 'dir' || !it.name.endsWith('.app')) continue;
      const base = dir + '/' + it.name;
      let info;
      try { info = JSON.parse(await vfs.read(base + '/Info.json')); }
      catch (e) { console.warn('跳过损坏的 .app 包', base, e.message); continue; }
      if (!info || !info.id) continue;
      this.addDrapVfs(info.id, {
        name: info.name || info.id,
        icon: info.icon || '◆',
        type: info.type === 'cli' ? 'cli' : 'gui',
        entry: base + '/' + (info.entry || 'main.drap'),
      });
    }
  }

  get(id) { return this.apps.get(id); }
  all() { return [...this.apps.values()]; }

  /* 统一启动契约
     env = { wm, io }
       - host：有 wm → wm.launchApp；否则提示「请在桌面启动」
       - gui ：有 wm → 拉源码交给 launchDrapApp；否则提示
       - cli ：拉源码交给 runDrapCli（无论是否桌面）
     返回 { ok:true } 或 { error:'...' } */
  async launch(id, env = {}) {
    const a = this.apps.get(id);
    if (!a) return { error: '未知应用: ' + id };

    if (a.type === 'host') {
      if (env.wm) {
        env.wm.launchApp({ id, letter: glyph(a.icon, a.name), title: a.title || a.name });
        return { ok: true };
      }
      return { error: (a.title || a.name) + ' 是桌面应用，请用 gui 进入桌面' };
    }

    if (a.type === 'gui') {
      if (!env.wm) return { error: (a.name || id) + ' 是 GUI 应用，请用 gui 进入桌面' };
      let src = null;
      if (a.url) {
        try { src = await (await fetch(a.url)).text(); } catch (e) { return { error: '加载失败: ' + e.message }; }
      } else if (a.entry) {
        src = await env.vfs.read(a.entry);
      }
      if (src == null) return { error: '找不到 ' + (a.name || id) + ' 的源码' };
      launchDrapApp(env.wm, env.vfs, src);
      return { ok: true };
    }

    if (a.type === 'cli') {
      let src = null;
      if (a.url) {
        try { src = await (await fetch(a.url)).text(); } catch (e) { return { error: '加载失败: ' + e.message }; }
      } else if (a.entry) {
        src = await env.vfs.read(a.entry);
      }
      if (src == null) return { error: '找不到 ' + (a.name || id) + ' 的源码' };
      await runDrapCli(env.vfs, env.io || { print: (s) => console.log(s) }, src);
      return { ok: true };
    }

    return { error: '未知的应用类型: ' + a.type };
  }
}
