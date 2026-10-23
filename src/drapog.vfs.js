/**
 * @file        drapog.vfs.js
 * @module      drapog/vfs
 * @summary     DrapOG 虚拟文件系统
 * @description 统一接口，两种后端：
 *                - MemoryBackend   内存
 *                - FSAccessBackend 真实磁盘
 *              文本用 read/write，二进制用 readBytes/writeBytes。
 * @version     0.3.1
 */

/* ============================================================
   内存后端
   ============================================================ */
class MemoryBackend {
  constructor() {
    this.root = { type: 'dir', name: '', children: new Map() };
    this._initTree();
  }

  _initTree() {
    const dirs = [
      '/System', '/System/BIOS', '/System/Boot', '/System/Kernel', '/System/Settings',
      '/Applications',
      '/Library', '/Library/TMP', '/Library/Logs', '/Library/Preferences',
      '/Users', '/Users/guest',
      '/Users/guest/Desktop', '/Users/guest/Documents', '/Users/guest/Downloads'
    ];
    for (const d of dirs) this._mkdir(d);
    this._write('/System/Settings/boot.json', '{"theme":"macos"}');
    this._write('/Users/guest/Documents/readme.txt', 'Hello, DrapOG!\n');
  }

  _resolve(absPath) {
    if (absPath === '/') return this.root;
    let node = this.root;
    for (const s of absPath.split('/').filter(Boolean)) {
      if (!node || node.type !== 'dir') return null;
      node = node.children.get(s);
      if (!node) return null;
    }
    return node;
  }
  _resolveParent(absPath) {
    if (absPath === '/') return null;
    const segs = absPath.split('/').filter(Boolean);
    const name = segs.pop();
    const parent = this._resolve('/' + segs.join('/'));
    if (!parent || parent.type !== 'dir') return null;
    return { parent, name };
  }

  async exists(p) { return this._resolve(p) !== null; }
  async isDir(p) { const n = this._resolve(p); return n !== null && n.type === 'dir'; }
  async ls(p) {
    const n = this._resolve(p);
    if (!n || n.type !== 'dir') return null;
    const items = [];
    for (const [name, c] of n.children) items.push({ name, type: c.type });
    items.sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
    return items;
  }
  async mkdir(p) { this._mkdir(p); return true; }
  _mkdir(p) {
    if (p === '/') return;
    const segs = p.split('/').filter(Boolean);
    let node = this.root;
    for (const s of segs) {
      let c = node.children.get(s);
      if (!c) { c = { type: 'dir', name: s, children: new Map() }; node.children.set(s, c); }
      node = c;
    }
  }
  async touch(p) {
    if (this._resolve(p)) return true;
    const r = this._resolveParent(p);
    if (!r) return false;
    r.parent.children.set(r.name, { type: 'file', name: r.name, content: '', size: 0 });
    return true;
  }
  async read(p) {
    const n = this._resolve(p);
    if (!n || n.type !== 'file') return null;
    if (n.bytes) return new TextDecoder().decode(n.bytes);
    return n.content;
  }
  async write(p, content) { return this._write(p, content); }
  _write(p, content) {
    const n = this._resolve(p);
    if (n && n.type === 'file') { n.content = String(content); n.bytes = null; n.size = String(content).length; return true; }
    // 写入时自动创建缺失的父目录（与 FSAccessBackend 行为一致）
    const segs = p.split('/').filter(Boolean);
    const name = segs.pop();
    const parentPath = '/' + segs.join('/');
    if (parentPath !== '/') this._mkdir(parentPath);
    const parent = this._resolve(parentPath);
    if (!parent || parent.type !== 'dir') return false;
    const existing = parent.children.get(name);
    if (existing && existing.type === 'dir') return false;
    parent.children.set(name, { type: 'file', name, content: String(content), bytes: null, size: String(content).length });
    return true;
  }

  /* 二进制读写 */
  async readBytes(p) {
    const n = this._resolve(p);
    if (!n || n.type !== 'file') return null;
    if (n.bytes) return n.bytes;
    if (typeof n.content === 'string') return new TextEncoder().encode(n.content);
    return new Uint8Array(0);
  }
  async writeBytes(p, bytes) {
    const n = this._resolve(p);
    if (n && n.type === 'file') {
      n.bytes = bytes; n.content = null; n.size = bytes.length;
      return true;
    }
    const segs = p.split('/').filter(Boolean);
    const name = segs.pop();
    const parentPath = '/' + segs.join('/');
    if (parentPath !== '/') this._mkdir(parentPath);
    const parent = this._resolve(parentPath);
    if (!parent || parent.type !== 'dir') return false;
    const existing = parent.children.get(name);
    if (existing && existing.type === 'dir') return false;
    parent.children.set(name, {
      type: 'file', name, bytes, content: null, size: bytes.length,
    });
    return true;
  }

  async rm(p) {
    const n = this._resolve(p);
    if (!n) return false;
    if (n.type === 'dir' && n.children.size > 0) return false;
    const r = this._resolveParent(p);
    if (!r) return false;
    r.parent.children.delete(r.name);
    return true;
  }
}

/* ============================================================
   File System Access 后端
   ============================================================ */
class FSAccessBackend {
  constructor(root) { this.root = root; }

  async _resolveDir(absPath, create) {
    if (absPath === '/' || absPath === '') return this.root;
    let h = this.root;
    for (const seg of absPath.split('/').filter(Boolean)) {
      h = await h.getDirectoryHandle(seg, { create: !!create });
    }
    return h;
  }

  async _resolveFile(absPath, create) {
    const segs = absPath.split('/').filter(Boolean);
    const name = segs.pop();
    if (!name) throw new Error('无效的文件路径');
    let h = this.root;
    for (const seg of segs) h = await h.getDirectoryHandle(seg, { create: !!create });
    return h.getFileHandle(name, { create: !!create });
  }

  async exists(absPath) {
    try {
      const segs = absPath.split('/').filter(Boolean);
      const name = segs.pop();
      let h = this.root;
      for (const seg of segs) h = await h.getDirectoryHandle(seg);
      if (!name) return true;
      try { await h.getFileHandle(name); return true; }
      catch { await h.getDirectoryHandle(name); return true; }
    } catch { return false; }
  }

  async isDir(absPath) {
    try {
      const segs = absPath.split('/').filter(Boolean);
      const name = segs.pop();
      let h = this.root;
      for (const seg of segs) h = await h.getDirectoryHandle(seg);
      if (!name) return true;
      await h.getDirectoryHandle(name);
      return true;
    } catch { return false; }
  }

  async ls(absPath) {
    try {
      const dir = await this._resolveDir(absPath);
      const items = [];
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith('.')) continue;
        items.push({ name, type: handle.kind === 'directory' ? 'dir' : 'file' });
      }
      items.sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
      return items;
    } catch { return null; }
  }

  async mkdir(absPath) {
    try { await this._resolveDir(absPath, true); return true; }
    catch { return false; }
  }

  async touch(absPath) {
    try { await this._resolveFile(absPath, true); return true; }
    catch { return false; }
  }

  async read(absPath) {
    try {
      const fh = await this._resolveFile(absPath);
      const file = await fh.getFile();
      return await file.text();
    } catch { return null; }
  }

  async write(absPath, content) {
    try {
      const fh = await this._resolveFile(absPath, true);
      const w = await fh.createWritable();
      await w.write(String(content));
      await w.close();
      return true;
    } catch (e) {
      console.error('[VFS] write 失败:', e);
      return false;
    }
  }

  async readBytes(absPath) {
    try {
      const fh = await this._resolveFile(absPath);
      const file = await fh.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch { return null; }
  }

  async writeBytes(absPath, bytes) {
    try {
      const fh = await this._resolveFile(absPath, true);
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();
      return true;
    } catch (e) {
      console.error('[VFS] writeBytes 失败:', e);
      return false;
    }
  }

  async rm(absPath) {
    try {
      const segs = absPath.split('/').filter(Boolean);
      const name = segs.pop();
      let h = this.root;
      for (const seg of segs) h = await h.getDirectoryHandle(seg);
      try {
        const dh = await h.getDirectoryHandle(name);
        let count = 0;
        for await (const _ of dh.entries()) { count++; if (count > 0) break; }
        if (count > 0) return false;
      } catch {}
      await h.removeEntry(name, { recursive: false });
      return true;
    } catch { return false; }
  }
}

/* ============================================================
   VFS 统一接口
   ============================================================ */
export class VFS {
  constructor() {
    this.mem = new MemoryBackend();
    this.fs = null;
    this.rootHandle = null;
    this.mode = 'memory';
  }

  async mount(handle) {
    try { await handle.getDirectoryHandle('System'); }
    catch { throw new Error('所选文件夹不是 DrapOG 根目录（未找到 System/）'); }
    this.fs = new FSAccessBackend(handle);
    this.rootHandle = handle;
    this.mode = 'fsaccess';
  }

  unmount() {
    this.fs = null;
    this.rootHandle = null;
    this.mode = 'memory';
  }

  normalize(cwd, p) {
    if (!p) return cwd;
    if (p === '~') p = '/Users/guest';
    else if (p.startsWith('~/')) p = '/Users/guest/' + p.slice(2);
    const full = p.startsWith('/') ? p : (cwd === '/' ? '/' + p : cwd + '/' + p);
    const parts = [];
    for (const seg of full.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return '/' + parts.join('/');
  }

  _backend() { return this.fs || this.mem; }

  async exists(p)    { return this._backend().exists(p); }
  async isDir(p)     { return this._backend().isDir(p); }
  async ls(p)        { return this._backend().ls(p); }
  async mkdir(p)     { return this._backend().mkdir(p); }
  async touch(p)     { return this._backend().touch(p); }
  async read(p)      { return this._backend().read(p); }
  async write(p, c)  { return this._backend().write(p, c); }
  async readBytes(p) { return this._backend().readBytes(p); }
  async writeBytes(p, b) { return this._backend().writeBytes(p, b); }
  async rm(p)        { return this._backend().rm(p); }
}

/* ============================================================
   废纸篓 / 回收站（共享底层工具）
   删除 = 移动到 /Library/Trash（重名加序号）；可还原 / 清空。
   逻辑为纯 VFS 操作，可在 node 下单测；JS 应用与 DrapLang 应用（经 syscall）共用。
   ============================================================ */
export const TRASH_DIR = '/Library/Trash';

export async function copyRecursive(vfs, src, dst) {
  if (await vfs.isDir(src)) {
    await vfs.mkdir(dst);
    const items = (await vfs.ls(src)) || [];
    for (const it of items) await copyRecursive(vfs, vfs.normalize(src, it.name), vfs.normalize(dst, it.name));
  } else {
    const c = await vfs.read(src);
    await vfs.write(dst, c == null ? '' : c);
  }
}

export async function rmRecursive(vfs, path) {
  if (await vfs.isDir(path)) {
    const items = (await vfs.ls(path)) || [];
    for (const it of items) await rmRecursive(vfs, vfs.normalize(path, it.name));
  }
  await vfs.rm(path);
}

export async function uniqueIn(vfs, dir, name) {
  let target = vfs.normalize(dir, name);
  if (!(await vfs.exists(target))) return target;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (await vfs.exists(vfs.normalize(dir, stem + ' ' + i + ext))) i++;
  return vfs.normalize(dir, stem + ' ' + i + ext);
}

/** 把 path 移入废纸篓（复制→删源）；成功返回 true */
export async function moveToTrash(vfs, path) {
  try {
    const name = path.split('/').filter(Boolean).pop();
    if (!name) return false;
    await vfs.mkdir(TRASH_DIR);
    const target = await uniqueIn(vfs, TRASH_DIR, name);
    await copyRecursive(vfs, path, target);
    await rmRecursive(vfs, path);
    return true;
  } catch (e) { return false; }
}

/** 废纸篓条目列表 */
export async function listTrash(vfs) {
  try { return (await vfs.ls(TRASH_DIR)) || []; } catch (e) { return []; }
}

/** 从废纸篓还原 name 到 destDir */
export async function restoreFromTrash(vfs, name, destDir) {
  try {
    const src = vfs.normalize(TRASH_DIR, name);
    if (!(await vfs.exists(src))) return false;
    await vfs.mkdir(destDir);
    const dst = await uniqueIn(vfs, destDir, name);
    await copyRecursive(vfs, src, dst);
    await rmRecursive(vfs, src);
    return true;
  } catch (e) { return false; }
}

/** 清空废纸篓 */
export async function emptyTrash(vfs) {
  try {
    const items = (await vfs.ls(TRASH_DIR)) || [];
    for (const it of items) await rmRecursive(vfs, vfs.normalize(TRASH_DIR, it.name));
    return true;
  } catch (e) { return false; }
}