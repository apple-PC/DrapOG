/**
 * @file        tools/build.mjs
 * @summary     统一构建/发布校验流水线（工程化-M6）
 * @description 把静态 import 校验、全量测试（含全语料无损往返）、GitHub Pages 发布前资产/路径校验
 *   串成一条命令，任一环节失败即非零退出，可作为 CI / 发布前的把关。
 *   用法：node tools/build.mjs            （跑全部校验）
 *   环节：
 *     1) tools/check-imports.mjs   —— 全仓相对 import 解析，补单测盲区（Boot 入口层）
 *     2) tools/run-tests.mjs       —— 全部 test_*.mjs（已含 test_examples 全语料往返）
 *     3) Pages 发布前校验           —— 校验入口 HTML 引用的资产路径全部存在、入口可达
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => spawnSync('node', [resolve(ROOT, cmd)], { cwd: ROOT, encoding: 'utf8' });

let failed = false;
const step = (name, r, extraFail) => {
  console.log(`\n──── ${name} ────`);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0 || extraFail) { failed = true; console.log(`✗ ${name} 未通过`); return false; }
  console.log(`✓ ${name} 通过`);
  return true;
};

// 1) import 校验
const pre = step('静态 import 解析校验', run('tools/check-imports.mjs'));
if (!pre) finish();

// 2) 全量测试（含全语料无损往返）
const tst = step('全量测试（npm test）', run('tools/run-tests.mjs'));
if (!tst) finish();

// 3) Pages 发布前资产/路径校验
console.log('\n──── GitHub Pages 发布前资产/路径校验 ────');
const pageOk = pagesCheck();
if (!pageOk) { failed = true; console.log('✗ Pages 资产校验未通过'); }
else console.log('✓ Pages 资产校验通过');

finish();

function finish() {
  console.log('\n========================================');
  if (failed) { console.log('构建校验：有环节失败，禁止发布。'); process.exit(1); }
  console.log('构建校验：全部通过，可以发布 / 推送。');
  process.exit(0);
}

// 解析 HTML 中的相对 src/href 并校验存在
function pagesCheck() {
  let ok = true;
  const note = (s) => console.log('   ' + s);

  // 根入口 index.html：应重定向到 _dev/
  const rootHtml = resolve(ROOT, 'index.html');
  if (!existsSync(rootHtml)) { note(`✗ 根入口缺失：${relative(ROOT, rootHtml)}`); return false; }
  const rootSrc = readFileSync(rootHtml, 'utf8');
  if (!/url=_dev\//.test(rootSrc) && !/_dev\//.test(rootSrc)) {
    note('⚠ 根 index.html 未指向 _dev/（Pages 入口可能不对）');
  } else note('• 根 index.html 指向 _dev/');

  // 真实入口 _dev/index.html：扫描 <script src> / <link href> 相对引用
  const entry = resolve(ROOT, '_dev/index.html');
  if (!existsSync(entry)) { note(`✗ 入口缺失：${relative(ROOT, entry)}`); return false; }
  const html = readFileSync(entry, 'utf8');
  const re = /<(?:script|link)[^>]+(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m, refs = 0;
  while ((m = re.exec(html))) {
    const spec = m[1];
    if (/^https?:|^\/\//.test(spec)) continue;     // 外链跳过
    refs++;
    const url = new URL(spec, pathToFileURL(entry));
    if (!existsSync(fileURLToPath(url))) {
      note(`✗ 引用资产不存在：${spec}（解析为 ${decodeURIComponent(url.pathname)}）`);
      ok = false;
    }
  }
  if (refs === 0) { note('⚠ _dev/index.html 未引用任何本地 src/href'); }
  else note(`• ${refs} 个本地资产引用全部存在`);

  // 引擎入口（被 _dev/index.html 静态加载的 BIOS 引导）及其依赖链已由 check-imports 覆盖
  const bios = resolve(ROOT, 'System/BIOS/bios.js');
  if (!existsSync(bios)) { note(`✗ 引擎入口缺失：${relative(ROOT, bios)}`); ok = false; }
  else note('• 引擎入口 System/BIOS/bios.js 存在');

  return ok;
}
