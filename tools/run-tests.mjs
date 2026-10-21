// 统一测试运行器：从项目根目录跑 tests/ 下所有 test_*.mjs，汇总结果。
// 用法：node tools/run-tests.mjs   （也可 npm test）
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = resolve(ROOT, 'tests');
const files = readdirSync(testsDir)
  .filter(f => /^test_.*\.mjs$/.test(f))
  .sort();

let pass = 0, fail = 0;
const failed = [];
for (const f of files) {
  const r = spawnSync('node', [resolve(testsDir, f)], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0) {
    pass++;
    console.log('✓', f);
  } else {
    fail++;
    failed.push(f);
    console.log('✗', f);
    const out = (r.stdout || '') + (r.stderr || '');
    console.log(out.split('\n').slice(-12).join('\n'));
  }
}
console.log('\n========================================');
console.log(`通过 ${pass} / ${pass + fail}${fail ? `，失败：${failed.join(', ')}` : '，全部通过'}`);
process.exit(fail ? 1 : 0);
