// test_dbyte.mjs —— 验证 M1：DBYTE 可选调试信息段（向后兼容、无损往返）
//   · 默认编译不附加 debug，.dbyte 字节完全不变（无损往返硬约束）
//   · compile({debug:true}) 产出 source + 函数符号表
//   · pack→unpack 回填指令行号、恢复 source/函数，校验码不报 mismatch
//   · 带调试段 .dbyte 的前缀（无段部分）与无调试段字节完全一致（旧 loader 安全忽略尾部）
import { DrapCC } from '../src/drapcc.js';
import { pack, unpack, MAGIC, DEBUG_MAGIC } from '../src/drapog.dbyte.js';

let failures = 0;
function assert(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); failures++; } }

const SRC = `entry fn main()->i32 {
  let x = 10
  x = x + add(x, 5)
  return x
}

fn add(a: i32, b: i32)->i32 {
  return a + b
}
`;

console.log('== 1. 默认编译（无 debug）==');
const p0 = new DrapCC(SRC).compile();
assert(!('debug' in p0) || p0.debug == null, '默认编译不附加 debug');
const b0 = pack(p0);
const u0 = unpack(b0);
assert(u0.debug === null, '无 debug 的 .dbyte 解包后 debug === null');
assert(u0.instructions.every(i => i.line === undefined), '无 debug 解包后指令无 .line（与旧行为一致）');

console.log('== 2. debug 编译 ==');
const p1 = new DrapCC(SRC, { debug: true }).compile();
assert(p1.debug && typeof p1.debug.source === 'string', 'debug 含 source');
assert(p1.debug.source.includes('fn add'), 'source 保留原始代码');
assert(Array.isArray(p1.debug.functions) && p1.debug.functions.length >= 2, '函数符号表非空');
const mainFn = p1.debug.functions.find(f => f.name === 'main');
const addFn = p1.debug.functions.find(f => f.name === 'add');
assert(!!mainFn && !!addFn, '函数符号表含 main 与 add');
assert(mainFn.start < addFn.start, 'main 排在 add 之前');
assert(addFn.end >= addFn.start, 'add 的 end >= start');

console.log('== 3. debug 序列化往返 ==');
const b1 = pack(p1);
assert(b1.length > b0.length, '带 debug 的 .dbyte 比无 debug 长（多调试段）');
assert(String.fromCharCode(b1[0], b1[1], b1[2], b1[3]) === 'DRAP', '文件魔数保持 DRAP（MAGIC 未被改动）');
const u1 = unpack(b1);   // 不应抛“校验和不匹配”
assert(u1.debug !== null, '解包到调试段');
assert(u1.debug.source === p1.debug.source, 'source 往返一致');
assert(u1.debug.functions.length === p1.debug.functions.length, '函数数一致');
const origLines = p1.instructions.filter(i => i.op !== 'LABEL').map(i => i.line);
const gotLines = u1.instructions.map(i => i.line);
assert(JSON.stringify(origLines) === JSON.stringify(gotLines), '指令行号全部回填一致');
assert(u1.instructions.length === u0.instructions.length, '指令数一致');
assert(JSON.stringify(u1.strings) === JSON.stringify(u0.strings), '字符串一致');

console.log('== 4. 向后兼容：旧 loader 读取的代码/数据字节区与无段版本完全一致 ==');
// 带段 .dbyte = 无段内容 + 调试段；仅 [20,24) 的 4 字节校验码因需覆盖尾部而更新，
// 其余（头部 [0,20) 与 指令/字符串区 [24, len)）与无段版逐字节相同。
assert(b1.subarray(0, 20).join(',') === b0.subarray(0, 20).join(','), '头部字节区 [0,20) 完全一致');
assert(b1.subarray(24, b0.length).join(',') === b0.subarray(24, b0.length).join(','), '指令/字符串字节区 [24,len) 完全一致（旧 loader 读取区域无变化）');

console.log('');
if (failures === 0) console.log('DBYTE 调试段（M1）验证全部通过 ✓');
else { console.log(failures + ' 项失败 ✗'); process.exit(1); }
