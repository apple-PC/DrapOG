#!/usr/bin/env node
// tools/mkapp.mjs —— DrapOG DrapLang 应用脚手架
// 用法：node tools/mkapp.mjs <id> [name] [--title "窗口标题"] [--stdlib]
//
// 从 System/Apps/_template.app 复制出一个新的 .app 包：
//   - 替换占位符 __APPID__ / __APPNAME__ / __WINTITLE__ / __HELLO__ / __BTNLABEL__
//   - --stdlib：注入 `import "stdlib"` 并把 System/Lib/stdlib.drapp 复制到新包目录
//   - 编译校验，确保生成的应用可编译通过
// 生成后，把应用接入桌面：在 System/Boot/gui.js 的 registry.addDrap('id', {...}) 注册，
// 并把 id 加进 drapog.wm.js 的 this.apps（dock + 桌面图标）。
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DrapCC } from '../drapcc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function fail(m) { console.error('mkapp: ' + m); process.exit(1); }

// 解析参数
const args = process.argv.slice(2);
let id = null, name = null, title = null, withStdlib = false;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--stdlib') withStdlib = true;
  else if (args[i] === '--title') { title = args[++i]; }
  else positional.push(args[i]);
}
id = positional[0];
name = positional[1] || (id ? id[0].toUpperCase() + id.slice(1) : null);
if (!id) fail('缺少应用 id。用法：node tools/mkapp.mjs <id> [name] [--title "标题"] [--stdlib]');
if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(id)) fail('id 必须以字母开头，仅含字母/数字/下划线');
if (existsSync(resolve(ROOT, 'System/Apps/' + id + '.app'))) fail('System/Apps/' + id + '.app 已存在');

const hello = name + ' 已启动';
const btn = '确定';
const wtitle = title || name;

// 读取模板
const tplDir = resolve(ROOT, 'System/Apps/_template.app');
let main = readFileSync(resolve(tplDir, 'main.drapp'), 'utf8');
let info = readFileSync(resolve(tplDir, 'Info.json'), 'utf8');

// 占位符替换
const replace = (s) => s
  .replaceAll('__APPID__', id)
  .replaceAll('__APPNAME__', name)
  .replaceAll('__WINTITLE__', wtitle)
  .replaceAll('__HELLO__', hello)
  .replaceAll('__BTNLABEL__', btn)
  .replaceAll('__IMPORT_STDLIB__', withStdlib ? 'import "stdlib"' : '')
  .replaceAll('__MODULES__', withStdlib ? '["stdlib"]' : '[]');

main = replace(main);
info = replace(info);

// 写出新包
const outDir = resolve(ROOT, 'System/Apps/' + id + '.app');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'main.drapp'), main);
writeFileSync(resolve(outDir, 'Info.json'), info);
if (withStdlib) copyFileSync(resolve(ROOT, 'System/Lib/stdlib.drapp'), resolve(outDir, 'stdlib.drapp'));

// 编译校验（--stdlib 时把 stdlib 源作为模块传入，模拟运行期解析）
try {
  const opts = {};
  if (withStdlib) opts.modules = { stdlib: readFileSync(resolve(ROOT, 'System/Lib/stdlib.drapp'), 'utf8') };
  new DrapCC(main, opts).compile();
} catch (e) {
  fail('生成的应用无法编译：' + e.message);
}

console.log('已生成 System/Apps/' + id + '.app/');
console.log('  · main.drapp（' + (withStdlib ? '已注入 stdlib' : '未含 stdlib') + '）');
console.log('  · Info.json');
if (withStdlib) console.log('  · stdlib.drapp（共享标准库副本）');
console.log('');
console.log('接入桌面：在 System/Boot/gui.js 增加');
console.log('  registry.addDrap(\'' + id + '\', { name: \'' + name + '\', icon: \'◆\', type: \'gui\',');
console.log('    file: \'../Apps/' + id + '.app/main.drapp\', baseUrl: import.meta.url,');
if (withStdlib) console.log('    modules: [\'stdlib\'],');
console.log('    version: \'1.0\', author: \'you\', description: \'' + name + '\', category: \'uncategorized\' });');
console.log('并把 \'' + id + '\' 加入 drapog.wm.js 的 this.apps 数组（dock + 桌面图标）。');
