// 静态 import 解析校验：扫描仓库内所有 .js/.mjs（排除 node_modules/.workbuddy/_dev 缓存），
// 解析相对 import（静态 from / 动态 import() / 副作用 import）并验证目标文件存在。
// 背景：单测直接 mock 引擎、不加载 System/Boot 入口，曾漏掉 gui.js/cmd.js 的 '../src' 深度错误
// （GitHub Pages 上「Failed to fetch dynamically imported module」）。此校验补上该盲区。
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.workbuddy', '.git', 'Users']);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(m?js)$/.test(e.name)) yield p;
  }
}

const SPEC_RE = /(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

let bad = 0, checked = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const base = pathToFileURL(file);
  for (const m of src.matchAll(SPEC_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec || !spec.startsWith('.')) continue;   // 只校验相对路径
    checked++;
    const url = new URL(spec, base);
    if (!existsSync(fileURLToPath(url))) {
      bad++;
      console.log(`✗ ${file}\n   → ${spec}  解析为 ${decodeURIComponent(url.pathname)}（不存在）`);
    }
  }
}
if (bad) { console.log(`\n${bad} 处 import 断链（共校验 ${checked} 处相对引用）`); process.exit(1); }
console.log(`import 解析校验通过 ✓（${checked} 处相对引用全部存在）`);
