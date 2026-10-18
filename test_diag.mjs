import assert from 'assert';
import { DrapCC } from './drapcc.js';
import { VM } from './drapog.vm.js';

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
async function run(src) { const p = new DrapCC(src).compile(); const vm = new VM(p); return vm.run(); }

console.log('== 运行期错误诊断（行号 + 调用栈）==');
{
  // 嵌套调用里触发除以零：错误应带「行」+ 调用栈（main → div）
  const src = [
    'fn div(a: i32, b: i32)->i32 {',
    '  return a / b',          // 第 2 行（在 div 内）
    '}',
    'entry fn main()->i32 {',
    '  let x = div(10, 0)',    // 第 5 行（在 main 内调用）
    '  return x',
    '}',
  ].join('\n');
  let err = null;
  try { await run(src); } catch (e) { err = e; }
  ok(err != null, '除以零应抛错');
  ok(/调用栈/.test(err && err.message), '错误信息含「调用栈」');
  ok(/div/.test(err && err.message), '调用栈含被调函数 div');
  ok(/main/.test(err && err.message), '调用栈含 main 底帧');
  ok(/行/.test(err && err.message), '错误信息含「行」定位');
  console.log('  样例:\n' + (err ? err.message.split('\n').map(l => '    ' + l).join('\n') : ''));
}
{
  // 顶层（main 内）直接越界：仅 main 帧 + 行号
  const src = [
    'entry fn main()->i32 {',
    '  let a = [1, 2, 3]',
    '  return a[9]',           // 越界
    '}',
  ].join('\n');
  let err = null;
  try { await run(src); } catch (e) { err = e; }
  ok(err != null, '数组越界应抛错');
  ok(/行/.test(err && err.message), '含行号');
  ok(/调用栈/.test(err && err.message), '含调用栈（main 底帧）');
  console.log('  样例:\n' + (err ? err.message.split('\n').map(l => '    ' + l).join('\n') : ''));
}

console.log('');
if (fail === 0) console.log('运行期错误诊断验证全部通过 ✓ (' + pass + ' 项)');
else { console.log(fail + ' 项失败 ✗'); process.exit(1); }
