#!/usr/bin/env node
/**
 * @file        tools/drapdebug.mjs
 * @summary     DrapLang 命令行调试器（工程化-M3 前端）
 * @description 交互式 REPL（也支持管道输入），基于 src/drapdebug.js 核心：
 *   行断点 break、运行 run、继续 cont、单步 step、列源码 list、查看变量/寄存器 print、调用栈 bt。
 * 用法：
 *   node tools/drapdebug.mjs <file.drap>
 *   echo -e "b 6\nrun\ncont\np i\nq" | node tools/drapdebug.mjs prog.drap
 */
import { readFileSync } from 'node:fs';
import { DrapDebugger } from '../src/drapdebug.js';
import { DrapSYS } from '../src/drapog.sys.js';

function usage() {
  console.error('用法: node tools/drapdebug.mjs <file.drap>  （或从 stdin 管道接收命令）');
  process.exit(1);
}

const file = process.argv[2];
let source;
try {
  source = readFileSync(file, 'utf8');
} catch {
  console.error('无法读取源文件: ' + file);
  usage();
}

// 极简宿主：console 输出 + 内存 VFS，让用到系统调用的真实 CLI 程序也能被调试
const sys = new DrapSYS({ out: (s) => process.stdout.write(s), onRead: async () => '' });
const dbg = new DrapDebugger(source, {});

// 把系统调用层注入 VM（DrapDebugger 内部 VM 已 load program，需补 sys）
dbg.vm.sys = sys;
sys.vm = dbg.vm;

function showPrompt() { process.stdout.write('(drap) '); }

async function handle(line) {
  const cmd = line.trim();
  if (!cmd) return true;
  const [c, ...rest] = cmd.split(/\s+/);
  switch (c) {
    case 'b': case 'break': {
      const ln = Number(rest[0]);
      console.log(dbg.setBreakpointLine(ln) ? `已设断点: 行 ${ln}` : `无效行号或该行无代码: ${ln}`);
      return true;
    }
    case 'del': case 'clear': {
      const ln = Number(rest[0]);
      dbg.clearBreakpointLine(ln);
      console.log(`已清除断点: 行 ${ln}`);
      return true;
    }
    case 'r': case 'run': {
      await dbg.run();
      console.log(dbg.statusLine());
      return true;
    }
    case 'c': case 'cont': {
      await dbg.cont();
      console.log(dbg.statusLine());
      return true;
    }
    case 's': case 'step': {
      await dbg.step();
      console.log(dbg.statusLine());
      return true;
    }
    case 'l': case 'list': {
      const ln = rest[0] ? Number(rest[0]) : undefined;
      console.log(dbg.listSource(ln));
      return true;
    }
    case 'p': case 'print': {
      console.log(dbg.print(rest.join(' ')));
      return true;
    }
    case 'info': {
      if (rest[0] === 'regs' || rest[0] === 'registers') {
        const r = dbg.registers();
        console.log('r0..r7 = ' + r.slice(0, 8).join(' '));
      } else console.log('info 子命令: regs');
      return true;
    }
    case 'bt': case 'backtrace': {
      console.log(dbg.vm.callStack.map((f, i) => `#${i} ${f.fn}${f.line ? ' (行 ' + f.line + ')' : ''}`).join('\n') || '(空调用栈)');
      return true;
    }
    case 'q': case 'quit': case 'exit':
      return false;
    default:
      console.log('未知命令: ' + c + '  （b/break del/clear r/run c/cont s/step l/list p/print info regs bt/q）');
      return true;
  }
}

import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

async function main() {
  if (process.stdin.isTTY) showPrompt();
  for await (const line of rl) {
    const keepGoing = await handle(line);
    if (!keepGoing) break;
    if (process.stdin.isTTY) showPrompt();
  }
  rl.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error('调试器错误:', e.message); process.exit(1); });
