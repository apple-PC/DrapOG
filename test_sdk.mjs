import { execFile } from 'child_process';
import { readFileSync, existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DrapCC } from './drapcc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { cwd: ROOT }, (e, so, se) => e ? rej(new Error(se || so)) : res(so + se)));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

const id = 'sdktest_app';
const appDir = resolve(ROOT, 'System/Apps/' + id + '.app');

console.log('== SDK（mkapp 脚手架 + 模板）==');
try {
  // 生成含 stdlib 的样例应用
  await run('node', ['tools/mkapp.mjs', id, 'SDKTest', '--title', 'SDKTest', '--stdlib']);
  ok(existsSync(resolve(appDir, 'main.drapp')), '生成 main.drapp');
  ok(existsSync(resolve(appDir, 'Info.json')), '生成 Info.json');
  ok(existsSync(resolve(appDir, 'stdlib.drapp')), '复制 stdlib.drapp');

  // 生成的源码占位符已被替换、可编译
  const src = readFileSync(resolve(appDir, 'main.drapp'), 'utf8');
  ok(!src.includes('__APPID__') && !src.includes('__IMPORT_STDLIB__'), '占位符全部替换');
  const stdlibSrc = readFileSync(resolve(ROOT, 'System/Lib/stdlib.drapp'), 'utf8');
  const p = new DrapCC(src, { modules: { stdlib: stdlibSrc } }).compile();
  ok(p.instructions.length > 0, '生成应用编译通过');

  // 不含 stdlib 的极简生成也应可编译
  const id2 = 'sdktest_min';
  await run('node', ['tools/mkapp.mjs', id2, 'Min']);
  const src2 = readFileSync(resolve(ROOT, 'System/Apps/' + id2 + '.app/main.drapp'), 'utf8');
  new DrapCC(src2).compile();
  ok(true, '极简生成（无 stdlib）编译通过');
  rmSync(resolve(ROOT, 'System/Apps/' + id2 + '.app'), { recursive: true, force: true });
} catch (e) {
  fail++;
  console.log('  ✗ 异常: ' + e.message);
} finally {
  rmSync(appDir, { recursive: true, force: true });
}

console.log('');
if (fail === 0) console.log('SDK 验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
