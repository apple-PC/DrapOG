#!/usr/bin/env node
/**
 * @file        tools/run_dbyte.mjs
 * @summary     DrapLang .dbyte 运行器（工程化-M4 配套）
 * @description 加载 drapld 产出的 .dbyte，挂载极简 DrapSYS 宿主（stdout 输出 + 内存 VFS），运行并打印程序输出与退出码。
 * 用法：node tools/run_dbyte.mjs <file.dbyte>
 */
import { readFileSync } from 'node:fs';
import { unpack } from '../src/drapog.dbyte.js';
import { VM } from '../src/drapog.vm.js';
import { DrapSYS } from '../src/drapog.sys.js';

const file = process.argv[2];
if (!file) { console.error('用法: node tools/run_dbyte.mjs <file.dbyte>'); process.exit(1); }

let buf;
try { buf = new Uint8Array(readFileSync(file)); }
catch { console.error('无法读取文件: ' + file); process.exit(1); }

const program = unpack(buf);   // 校验失败会抛「校验和不匹配」
const out = [];
const sys = new DrapSYS({ onRead: async () => '' });
const vm = new VM();
vm.out = '';
let _lastLen = 0;
// term_print 的 onOutput 传的是「累计全串」(vm.out)，宿主应做幂等替换而非追加；
// 这里只写出相对上次新增的增量，避免重复输出。
vm.onOutput = (s) => {
  if (s.length > _lastLen) { const delta = s.slice(_lastLen); out.push(delta); process.stdout.write(delta); }
  _lastLen = s.length;
};
vm.load(program);
vm.sys = sys;
sys.vm = vm;

try {
  await vm.run();
} catch (e) {
  console.error('\n运行错误: ' + e.message);
  process.exit(1);
}
process.exit(vm.regs[0] & 0xFF);
