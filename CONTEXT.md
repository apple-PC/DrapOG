# DrapOG 项目上下文

> 把这份文档完整粘贴到新对话开头，就能让 AI 立刻理解 DrapOG 的全部状态。

## 一、项目是什么

**DrapOG** 是一个**运行在浏览器里的类 Unix 操作系统**。

- 一个 HTML 引导，其余全是 JS / DrapLang
- 走 File System Access API 读写本地真实磁盘
- BIOS 由 **Whetstone** 出品
- 有自创编译语言 **DrapLang**、自研虚拟机 **DrapVM**
- 有可执行文件格式 **DBYTE**
- 支持 macOS 风格和 Windows 11 风格主题
- 有应用、窗口、桌面、菜单栏、Dock

**核心原则：**

- 没有解释器。要么编译通过上 VM，要么编译失败。
- JS 只做"硬件"。BIOS / Boot / VM / VFS / 宿主桥接永远 JS，其余全用 DrapLang。
- 真实磁盘。不是内存模拟，是真的写用户桌面上那个 DrapOG/ 文件夹。
- 主题只提供数据。主题 JS 里不许有 DOM 操作、事件绑定、网络请求。

## 二、命名体系

| 名字 | 指什么 |
|---|---|
| DrapOG | 整个系统 |
| Whetstone | BIOS 厂商（磨刀石） |
| DrapLang | 系统源语言（.drap） |
| DrapASM | 汇编语言（.dasm） |
| DBYTE | 可执行文件格式（.dbyte） |
| DrapCC | 编译器 |
| DrapAS | 汇编器 |
| DrapLD | 链接器 |
| DrapVM | 虚拟机 |
| DrapSYS | 系统调用层 |
| DrapML | 网页格式（.dml） |
| DrapShell | 命令行 Shell |
| TMP | 信任标记协议（用户可见名"保护沙箱"） |

## 三、目录结构

项目根 = 用户桌面上的 DrapOG/ 文件夹。

顶层文件：
- CONTEXT.md（本文件）
- drapcc.js（编译器）
- drapog.vm.js（虚拟机）
- drapog.vfs.js（虚拟文件系统）
- drapog.dbyte.js（DBYTE 二进制格式）
- drapog.idb.js（IndexedDB 封装）
- drapog.shell.js（Shell 命令解析）
- drapog.wm.js（窗口管理器）
- drapog.apps.js（GUI 应用）

开发目录 _dev/：
- index.html（引导页）
- serve.py（开发服务器）

系统目录 System/：
- BIOS/bios.js、post.js、menu.js
- Boot/cmd.js、gui.js
- Kernel/、Drivers/、Frameworks/（未来）
- Settings/Themes/（未来）

数据目录：
- Applications/（应用）
- Library/（系统资料库）
- Users/guest/（默认用户：Desktop / Documents / Downloads）
## 四、当前进度

已完成：
- BIOS（厂商画面 + POST + 启动菜单）
- CMD 模式终端（含 PageUp/PageDown/滚轮滚动）
- GUI 模式（桌面 + 窗口管理器 + Dock + 菜单栏）
- VFS（内存 + 真实磁盘 + IndexedDB 自动挂载）
- Shell（help/clear/echo/run/exit/gui/pwd/ls/cd/mkdir/touch/cat/rm/mount/remount/umount/df/save/load/dump/asm/dis/cc）
- DrapLang 编译器：函数、字符串、数组、结构体、syscall
- DrapVM：45 条指令（含 SYSCALL / ADDSP）
- DBYTE 格式（pack/unpack/hexdump）
- DrapAS 汇编器（.dasm → .dbyte）
- DrapDis 反汇编器（.dbyte → .dasm）
- 无损往返：.drap → .dbyte → .dasm → .dbyte（字节一致）
- DrapSYS 系统调用层（fs_read / fs_write / fs_exists / fs_ls / fs_mkdir / fs_rm / term_print / time_now）
- 用 DrapLang 写的第一个程序：读磁盘配置文件并打印
- 完整开发闭环：写 .drap → cc 编译 → load 运行
- Finder（浏览真实磁盘）
- Terminal（GUI 内嵌）
- 自动挂载（刷新后恢复文件夹句柄）

未完成：
- DrapLang 事件处理程序（event fn）
- DrapLang 字符串索引 / 切片
- DrapLang 输入读取（term_read）
- Shell 用 DrapLang 重写（自举第一步）
- 窗口管理器用 DrapLang 重写
- 应用全部用 DrapLang 重写
- 主题系统（macOS / Win11 双主题）
- Settings 应用
- TextEdit 应用
- 多进程 + IPC
- TMP 信任标记协议
- 应用签名 / 应用商店
- 网络栈（fetch 系统调用）
- DrapML 网页格式
- 音频驱动

## 五、已确认的设计决策

VM：
- 位数 64 位（内部双 32 拼接）
- 寄存器 r0-r7 整数 + f0-f7 浮点
- 栈单位 8 字节，向下增长
- 系统调用 INT 0x80
- 事件 INT 0x81
- 指令编码定长 8 字节
- 字节码二进制 .dbyte + 文本 .dasm
- DBYTE 魔数 'DRAP' (44 52 41 50)
- 校验和 FNV-1a 32 位

语言：
- 类 C 语法
- 静态强类型 + 显式优先
- 允许浮点（f32 / f64）
- 禁止指针算术
- 无手动管理、无 GC
- 禁止函数重载
- 禁止 static 局部变量
- 默认可见性 priv
- 禁止循环 import
- 禁止用户自定义中断号

系统：
- 用户文件夹 /Users/guest/
- 系统文件夹 /System/
- 应用文件夹 /Applications/
- 资料库 /Library/
- 应用后缀 .app/
- 应用清单 Info.json
- 废纸篓 .Trash/
- TMP 存储 Library/TMP/trust.json
- 密码哈希 PBKDF2 + SHA-256 + 100k 迭代
- 不做 TPM 2.0
- Secure Boot 默认关闭
- 浏览器方案 File System Access API
- 不允许无授权演示模式
- v1 做多 VM（时间片轮转调度）
- 主题 macOS + Windows 11
- 主题 Schema drapog.theme/v1

## 六、权限模型

身份：kernel / system / user:guest / app:id

访问权限（RWX = 读写删 / R = 只读）：
- kernel：全部 RWX
- system：/System 只读，其余 RWX
- user:guest：/System /Applications /Library 只读，/Users/guest RWX
- app（无授权）：全部只读，只有自己的沙盒 RWX
- app（有 fs.write）：/Users/guest 可读可写
- app（有 fs.delete）：/Users/guest 可读写删（限用户授权目录）

规则：
- system 不能删 /System/
- 用户不能删系统应用
- 应用默认不能删用户文件

## 七、启动流程

1. 双击 _dev/index.html
2. 加载 System/BIOS/bios.js
3. Whetstone 厂商画面（1 秒）
4. POST 自检
5. 从 IndexedDB 恢复文件夹句柄 / 或弹窗让用户选
6. 读 /System/Settings/bios.json
7. 显示启动菜单（5 秒倒计时）
8. 用户选择：GUI / CMD / Safe / Recovery / Setup
9. 引导文件执行，挂载 VFS，加载内核
10. 系统就绪
## 八、编译运行链路

### 编译运行链路（最新）

DrapLang 源码 (.drap)
→ DrapCC 词法分析
→ 语法分析（递归下降）
→ 语义分析（类型检查）
→ 代码生成（AST → VM 指令）
→ DrapAS 汇编（内存指令数组）
→ pack() 打包
→ DBYTE 二进制 (.dbyte)
→ 写入磁盘
→ 读回
→ unpack() 解包
→ DrapVM 逐条执行
→ 输出

### 反向链路

.dbyte → DrapDis → .dasm（文本）→ 人看/改 → DrapAS → .dbyte

### 当前 DrapLang 支持的语法

- struct Name { field: type, ... }
- fn name(p: T, ...) -> T { ... }
- entry fn main() -> i32 { ... }
- let x = expr
- let x: T = expr
- x = expr / x += expr / x -= expr / x *= expr / x /= expr
- if (cond) { ... } else { ... }
- while (cond) { ... }
- return expr
- break / continue
- term_print(expr) / term_println(expr)
- 表达式：+ - * / % < > <= >= == != && || !
- 字面量：整数、字符串 "..."、字符 'c'
- 数组字面量：[1, 2, 3]
- 结构体字面量：Point { x: 5, y: 7 }
- 方法调用：arr.push(x)
- 成员访问：arr.len / str.len / obj.field
- 下标：arr[i]
- 内置函数：len(x)

### 当前 VM 支持的指令（43 + 1）

LABEL LI MOV ADD SUB MUL DIV MOD
LT LE GT GE EQ NE
JMP JZ JNZ PUSH POP
CALL RET ENTER LEAVE ALLOC
LOADL STOREL
STR STRCAT STRLEN STREQ PRINTSTR
PRINT PRINTINT PRINTLN
NEWARR ARRGET ARRSET ARRLEN ARRPUSH
NEWOBJ FLDGET FLDSET
ADDSP HLT

### 堆对象类型

{ __type: 'str', value: '...' }     字符串
{ __type: 'arr', items: [...] }     数组
{ __type: 'obj', fields: [...] }    结构体

### 寄存器约定

r0  累加器 / 返回值
r1  操作数 / syscall 参数 1
r2  操作数 / syscall 参数 2
r3  操作数 / syscall 参数 3
r4  fp 帧指针
r5  sp 栈指针
r6  临时（表达式求值）
r7  临时（数组/结构体构造）

### 栈帧结构

进入函数：
ENTER            压入旧 fp，fp = sp
ALLOC N          分配 N 个局部变量槽（sp -= N）

参数传递：
调用者从右到左 PUSH 参数
CALL 目标
被调用者通过 [fp + 2 + i] 访问第 i 个参数

返回：
LEAVE            恢复 sp 到 fp，fp 弹出
RET              弹出返回地址，跳回

main 的返回地址 = -1（哨兵值），表示程序结束。

## 九、开发方式

启动服务器：
python3 ~/Desktop/DrapOG/_dev/serve.py

浏览器打开：
http://localhost:8080/_dev/

改完文件 Cmd+Shift+R 强刷。

用 VS Code：
code ~/Desktop/DrapOG

检查文件是否保存：
grep -n "关键词" ~/Desktop/DrapOG/文件名.js

## 十、代码约定

JS 文件：
- 一律用 ES Module (import / export)
- 文件头写 JSDoc 注释：@file @module @summary @version
- 缩进 2 空格
- 字符串用单引号
- 分号结尾
- 不写 var，只用 const / let

命名：
- 类名 PascalCase（WindowManager / VFS）
- 函数 / 变量 camelCase
- 常量 UPPER_SNAKE_CASE
- 私有方法以 _ 开头（_cmdLs）

修改文件方式：
永远整段替换，不要"在某行下面加一行"。定位容易出错。

一次给多个功能：
不要每个小功能都单独测一遍。一批功能一起给，一起测。

## 十一、当前待办路线

B. 系统调用层（当前正在做，设计已完成）
- B1. VM 加 SYSCALL 指令 + async run
- B2. 新建 drapog.sys.js（系统调用分发器）
- B3. 编译器加 syscall 语法
- B4. 实现第一批系统调用
        fs_read / fs_write / fs_exists / fs_ls / fs_mkdir / fs_rm
        term_print / time_now
- B5. 用 DrapLang 写读配置文件的小程序测试
- B6. 事件机制（INT 0x81，event fn）
- B7. Shell 用 DrapLang 重写

C. GUI 补完
- C1. Finder 返回 / 前进 / 上一级按钮
- C2. TextEdit 应用
- C3. WM 主题化改造（颜色抽取成 token）
- C4. Settings + 主题切换
- C5. Windows 11 主题

D. 系统层
- D1. 多进程 + IPC（时间片轮转）
- D2. TMP 信任标记
- D3. 应用包（Info.json + .app 目录）
- D4. 窗口管理器用 DrapLang 重写
- D5. 应用全部用 DrapLang 重写

E. 网络与渲染
- E1. 网络栈（fetch 系统调用）
- E2. DrapML 网页格式
- E3. DrapRender 渲染器
- E4. 浏览器应用

F. 工具链
- F1. DrapLD 链接器（多模块）
- F2. 调试信息区（.dbyte 扩展）
- F3. DrapDebug 调试器（单步、断点）
- F4. 优化器（常量折叠、死代码消除）

## 十二、重要参考

- 参考文件：index_single.html（用户早期写的 C++ 网页 IDE，展示了 tokenizer / parser / VM 的完整模式）
- 命名灵感：Whetstone（磨刀石）来自参考文件的标题
- 架构灵感：macOS 目录结构 / BIOS 启动 / UNIX 系统调用

## 十三、快速恢复对话

如果要开新对话，把这份文件完整粘贴，然后说：

"这是 DrapOG 项目上下文，请读完后继续做 B1（字符串类型扩展）。"

或者：

"读完了，继续做下一步。"

AI 会立刻明白：项目在哪、做到哪、下一步做什么、用什么风格写代码。

## 十四、B 阶段设计详情（系统调用层）

### 核心问题

DrapLang 程序需要能读写文件、调时间、和 JS 世界对话。
解法：新增 syscall 指令，桥接 VM 和 JS。

### 架构

DrapLang 程序 → VM → SYSCALL 指令 → DrapSYS → VFS / Canvas / 宿主

DrapSYS 是 JS 层的系统调用分发器。

### 寄存器约定

r0  返回值
r1  syscall 参数 1
r2  syscall 参数 2
r3  syscall 参数 3

最多 3 个参数。超过的暂不支持。

### SYSCALL 指令

新增 VM 指令：SYSCALL <编号>
编号放在指令里，参数在 r1/r2/r3。

### 返回值约定

所有 syscall 返回一个数字到 r0：
- 整数：值本身
- 字符串：VM 堆指针（堆索引）
- 布尔：1 = 真，0 = 假
- 失败：0 或 -1

字符串失败返回 0。堆索引 0 永远是空字符串 ""（初始化时预分配）。

### VM 异步改造

run() 改成 async。只有 SYSCALL 会 await，其它指令同步执行。
热路径无性能损失。

### 字符串跨界

VM 堆中字符串是 { __type: 'str', value: '...' }。
寄存器存堆索引（整数）。
JS 侧：
  vm.readStr(ptr) → JS 字符串
  vm.pushStr(s)   → 堆索引

指针一旦分配，永不移动、永不回收。v1 不做 GC。

### 编译器 syscall 语法

syscall <name> ( [ arg { , arg } ] )

示例：
  let data = syscall fs_read("/System/Settings/boot.json")
  syscall fs_write("/tmp/a.txt", "hello")
  let t = syscall time_now()

名字 → 编号映射表在编译器里。表里没有 → 编译错误。

参数从右向左求值，栈中转，保证正确性。

syscall 返回类型由编译器根据名字给出（SYS_RET 表）。
参数个数编译期检查（SYS_ARGS 表）。

### 第一批系统调用

文件系统（0x10-0x1F）：
  0x10  fs_read(path)              → str
  0x11  fs_write(path, content)    → i32
  0x12  fs_exists(path)            → i32
  0x13  fs_ls(path)                → str（换行分隔）
  0x14  fs_mkdir(path)             → i32
  0x15  fs_rm(path)                → i32

终端（0x30-0x3F）：
  0x30  term_print(str)            → i32

时间（0x50-0x5F）：
  0x50  time_now()                 → i64

### 错误处理

syscall 失败返回 0，不抛异常。
调用者自己判断，例如：
  let data = syscall fs_read(path)
  if (len(data) == 0) { ... 处理失败 ... }

VFS 未挂载时走内存后端，永远不报错。

### term_print 双路径

保留编译器内置的 term_print（走 PRINTSTR / PRINTINT）。
也支持 syscall term_print（走 SYSCALL 48）。
两条路行为一致，编译器自动选择。

### 需要改动的文件

drapog.dbyte.js   加 SYSCALL 操作码（编号 44）
drapog.vm.js      run() 改 async；加 _doSyscall()；加 readStr()/pushStr()
drapcc.js         解析 syscall 语法；加映射表；代码生成
drapog.sys.js     新建——系统调用分发器
System/Boot/cmd.js  创建 VM 时挂 DrapSYS；vm.run() → await vm.run()
drapog.shell.js   load 里的 vm.run() → await vm.run()
drapog.apps.js    Terminal 里 vm.run() → await vm.run()

约 400 行改动。

### 设计决策表

B1  syscall 编号方案        按功能分段（0x10 文件，0x30 终端，0x50 时间）
B2  最多参数个数            3 个（r1/r2/r3）
B3  返回值                  r0；字符串返回堆指针；失败返回 0
B4  字符串跨界              JS 侧读堆 / push 到堆
B5  run() async 化          是；只有 SYSCALL 会 await
B6  term_print 双路径       保留旧路径 + 新 syscall 路径
B7  第一批 syscall          8 个
B8  错误处理                返回 0，不抛异常
B9  参数类型检查            v1 不做，v2 加
B10 堆 GC                   v1 不做，程序结束全清

### 后续阶段

B6 事件机制：
  event fn on_click(e: ClickEvent) { ... }
  syscall ui_button(win, x, y, w, h, title)
  syscall ui_on(ctrl, EVENT_CLICK, on_click)
  JS 侧 DOM 事件 → 打包成结构体写进 VM 内存 → INT 0x81

B7 Shell 用 DrapLang 重写：
  while (true) {
    syscall term_print("guest@drapog$ ")
    let line = syscall term_read()
    if line == "exit" { return 0 }
    ... 分发命令 ...
  }
  编译成 shell.dbyte，替换 drapog.shell.js

这是自举第一步。

## 十五、B.1-B.5 完成情况

B.1 SYSCALL 指令 + async run        ✅
B.2 drapog.sys.js 分发器              ✅
B.3 编译器 syscall 语法                ✅
B.4 第一批系统调用（8 个）             ✅
B.5 DrapLang 写读配置文件程序          ✅

验证：
  cc ~/hello.drap  → hello.dbyte (336 字节, 34 条指令)
  load ~/hello.dbyte → 配置: {"theme":"macos"}

VM 指令集已扩到 45 条（加 SYSCALL、ADDSP）。
DrapSYS 挂载在 vm.sys 上，VM.run() 遇 SYSCALL 时 await。
VM 加 readStr(ptr) / pushStr(s) 供 DrapSYS 读写堆字符串。
堆 0 号永远是空字符串哨兵 ""。
---

最后更新：2026-10-10当前版本：0.2.0
