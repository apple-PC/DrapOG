/**
 * @file        drapog.registry.js
 * @module      drapog/registry
 * @summary     应用注册表 + 统一启动器（L4：整合 draplang 工具 + 制定 .app 格式）
 * @version     1.1.0
 * @description 把「应用的发现 / 注册 / 启动」收敛为统一抽象，让 CMD 的 run、AppMgr 的点击、
 *              GUI 的 dock 都走同一套逻辑：
 *                - 内建 host 应用（Finder / Terminal / TextEdit / Settings / About / AppMgr）
 *                - DrapLang 应用（gui 型交给 WM，cli 型跑终端），由代码显式登记或 VFS 扫描 .app 包
 *             启动契约 launch(id, env)：host → wm.launchApp；gui → launchDrapApp；cli → runDrapCli。
 *
 *  .app 包格式（v1.1）：Name.app/ 目录
 *    Info.json（必填 id / name / type / entry；可选 version / icon / author / description /
 *              category / minVersion / permissions / modules）
 *    entry 指向入口源文件（.drap 源码，或 .dbyte 预编译产物）
 *    modules: 相对本 .app 目录的「兄弟 .drap 模块文件」基名数组（供 app 内 import "name"）
 */

import { launchDrapApp, launchDrapAppProgram, runDrapCli, runDrapCliProgram } from './drapog.launcher.js';
import { unpack } from './drapog.dbyte.js';

// 取图标首字符作为 dock/窗口字母（emoji 计为单字符；多字符 icon 退化用 name[0]）
function glyph(icon, name) {
  if (icon && icon.length >= 1) return icon;
  return (name && name[0]) || '?';
}

// Info.json 必填字段校验
const REQUIRED = ['id', 'name', 'type', 'entry'];

export class AppRegistry {
  constructor() {
    this.apps = new Map();
  }

  /** 注册一个内建 host 应用（实现已由 WM registerApp 提供） */
  addHost(id, { name, icon, title }) {
    this.apps.set(id, { id, name, icon, title: title || name, type: 'host' });
  }

  /** 注册一个 DrapLang 应用：type 'gui' 交 WM，'cli' 跑终端。
   *  file 为相对 baseUrl 的路径（内存模式用 import.meta.url 拉源码）；modules 为兄弟模块基名数组。
   *  可选元数据：version / author / description / category（用于 AppMgr 展示） */
  addDrap(id, { name, icon, type, file, baseUrl, modules, version, author, description, category }) {
    const url = file ? new URL(file, baseUrl).href : null;
    this.apps.set(id, {
      id, name, icon, type,
      url,
      baseUrl: baseUrl || null,
      modules: modules || [],
      version: version || '1.0',
      author: author || '',
      description: description || '',
      category: category || '',
    });
  }

  /** 注册一个 VFS 路径型 DrapLang 应用（mount 模式下由扫描发现）。info 含 name/icon/type/entry 等全量字段 */
  addDrapVfs(id, info) {
    this.apps.set(id, Object.assign({ id, type: info.type || 'gui' }, info));
  }

  /** 通用注册（install 命令用）：直接塞一个完整 app 记录 */
  register(app) { this.apps.set(app.id, app); }

  /** 注销（uninstall 命令用） */
  unregister(id) { return this.apps.delete(id); }

  /** 扫描 VFS 某目录下的 *.app 包（挂载真实磁盘时扩展发现；内存模式通常无 System/Apps）。
   *  校验必填字段，缺失/损坏的包跳过并告警；完整元数据（version/author/description/category/...）入库 */
  async scan(vfs, dir = 'System/Apps') {
    if (!await vfs.exists(dir)) return;
    const items = await vfs.ls(dir);
    if (!items) return;
    for (const it of items) {
      if (it.type !== 'dir' || !it.name.endsWith('.app')) continue;
      const base = dir + '/' + it.name;
      let info;
      try { info = JSON.parse(await vfs.read(base + '/Info.json')); }
      catch (e) { console.warn('跳过损坏的 .app 包（Info.json 解析失败）', base, e.message); continue; }
      if (!info || typeof info !== 'object') { console.warn('跳过空 .app 包', base); continue; }
      const missing = REQUIRED.filter(k => !info[k]);
      if (missing.length) { console.warn('跳过字段不全的 .app 包（缺 ' + missing.join(',') + '）', base); continue; }
      if (info.type !== 'cli' && info.type !== 'gui') { console.warn('跳过未知 type 的 .app 包', base, info.type); continue; }
      this.addDrapVfs(info.id, {
        name: info.name,
        icon: info.icon || '◆',
        type: info.type,
        entry: base + '/' + info.entry,
        version: info.version || '1.0',
        author: info.author || '',
        description: info.description || '',
        category: info.category || '',
        minVersion: info.minVersion || '',
        permissions: Array.isArray(info.permissions) ? info.permissions : [],
        modules: Array.isArray(info.modules) ? info.modules : [],
      });
    }
  }

  get(id) { return this.apps.get(id); }
  all() { return [...this.apps.values()]; }

  /* 解析一个 DrapLang 应用的源码 / 预编译产物 + 模块源
     返回 { kind:'drap', source, modules } 或 { kind:'dbyte', program } 或 null */
  async resolve(entry, vfs) {
    if (entry.url) {
      const isDbyte = /\.dbyte$/i.test(entry.url);
      if (isDbyte) {
        const bytes = new Uint8Array(await (await fetch(entry.url)).arrayBuffer());
        return { kind: 'dbyte', program: unpack(bytes) };
      }
      const source = await (await fetch(entry.url)).text();
      const modules = {};
      if (entry.modules && entry.modules.length) {
        const base = entry.url.replace(/[^/]+$/, '');
        for (const m of entry.modules) modules[m] = await (await fetch(base + m + '.drap')).text();
      }
      return { kind: 'drap', source, modules };
    }
    if (entry.entry) {
      const isDbyte = /\.dbyte$/i.test(entry.entry);
      if (isDbyte) {
        const bytes = await vfs.readBytes(entry.entry);
        return { kind: 'dbyte', program: unpack(bytes) };
      }
      const source = await vfs.read(entry.entry);
      const modules = {};
      if (entry.modules && entry.modules.length) {
        const dir = entry.entry.replace(/[^/]+$/, '');
        for (const m of entry.modules) modules[m] = await vfs.read(dir + m + '.drap');
      }
      return { kind: 'drap', source, modules };
    }
    return null;
  }

  /* 统一启动契约
     env = { wm, io }
       - host：有 wm → wm.launchApp；否则提示「请用 gui 进入桌面」
       - gui ：有 wm → 拉源码/产物交给启动器；否则提示
       - cli ：拉源码/产物交给 runDrapCli（无论是否桌面）
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
      let r;
      try { r = await this.resolve(a, env.vfs); }
      catch (e) { return { error: '加载失败: ' + e.message }; }
      if (!r) return { error: '找不到 ' + (a.name || id) + ' 的源码' };
      if (r.kind === 'dbyte') launchDrapAppProgram(env.wm, env.vfs, r.program);
      else launchDrapApp(env.wm, env.vfs, r.source, { modules: r.modules });
      return { ok: true };
    }

    if (a.type === 'cli') {
      let r;
      try { r = await this.resolve(a, env.vfs); }
      catch (e) { return { error: '加载失败: ' + e.message }; }
      if (!r) return { error: '找不到 ' + (a.name || id) + ' 的源码' };
      const io = env.io || { print: (s) => console.log(s) };
      if (r.kind === 'dbyte') await runDrapCliProgram(env.vfs, io, r.program);
      else await runDrapCli(env.vfs, io, r.source, { modules: r.modules });
      return { ok: true };
    }

    return { error: '未知的应用类型: ' + a.type };
  }
}
