/**
 * @file        tools/bump-version.mjs
 * @summary     版本号提升脚本（工程化-M6）
 * @description 统一提升项目版本号，保持 package.json 与 docs/CONTEXT.md 的「当前版本」一致。
 *   用法：
 *     node tools/bump-version.mjs 2.5.0        -> 显式指定新版本
 *     node tools/bump-version.mjs --major      -> 主版本 +1（如 2.4.1 -> 3.0.0）
 *     node tools/bump-version.mjs --minor      -> 次版本 +1（如 2.4.1 -> 2.5.0）
 *     node tools/bump-version.mjs --patch      -> 修订号 +1（默认，如 2.4.1 -> 2.4.2）
 *   仅更新 package.json 与 CONTEXT.md 两个权威版本位；源码文件内的 @version 仍按改动内容手动维护。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(ROOT, 'package.json');
const ctxPath = resolve(ROOT, 'docs/CONTEXT.md');

const args = process.argv.slice(2);
const flag = args.find(a => a.startsWith('--'));
const explicit = args.find(a => /^\d+\.\d+\.\d+$/.test(a));

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const cur = pkg.version || '0.0.0';
const [maj, min, pat] = cur.split('.').map(Number);

let next;
if (explicit) next = explicit;
else if (flag === '--major') next = `${maj + 1}.0.0`;
else if (flag === '--minor') next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${pat + 1}`; // --patch 或缺省

if (!/^\d+\.\d+\.\d+$/.test(next)) { console.error('非法版本号:', next); process.exit(1); }

// 1) package.json
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2) CONTEXT.md 「当前版本：X.Y.Z（…）」
let ctx = readFileSync(ctxPath, 'utf8');
if (!ctx.includes('当前版本：')) { console.error('CONTEXT.md 未找到「当前版本：」行，跳过'); }
else {
  ctx = ctx.replace(/当前版本：\d+\.\d+\.\d+/, '当前版本：' + next);
  writeFileSync(ctxPath, ctx, 'utf8');
}

console.log(`版本已提升：${cur} -> ${next}`);
console.log('  更新：package.json、docs/CONTEXT.md');
console.log('提示：源码内 @version 按改动内容手动维护；提交后运行 npm run build 校验。');
