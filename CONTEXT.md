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
- drapog.registry.js（应用注册表 + 统一启动契约，L4）
- drapog.launcher.js（DrapLang 应用启动器，DOM 无关，L4）

开发目录 _dev/：
- index.html（引导页）
- serve.py（开发服务器）

系统目录 System/：
- BIOS/bios.js、post.js、menu.js
- Boot/cmd.js、gui.js
- Apps/*.app（.app 包：Info.json + main.drap，L4 格式）
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
- Shell 用 **DrapLang 重写**（自举第一步）：System/shell.drap 是第一个用 DrapLang 写的系统组件，REPL 全程只通过 syscall 调用底层工具；宿主命令（mount/cc/load/save/asm/dis/dump/run…）经 term_hostcmd 委托回 JS 版 executeLegacy；shell.drap 缺失时自动回退 JS 版
- DrapLang 编译器：函数、字符串、数组、结构体、syscall
- DrapLang 字符串支持：索引 s[i]（码点）/ 切片 substr / 切分 split（编译器语法糖 + VM 指令 STRGET/STRSUB/STRSPLIT）
- DrapVM：48 条指令（含 SYSCALL / ADDSP / STRGET / STRSUB / STRSPLIT）
- DBYTE 格式（pack/unpack/hexdump，版本 0x0102）
- DrapAS 汇编器（.dasm → .dbyte）
- DrapDis 反汇编器（.dbyte → .dasm）
- 无损往返：.drap → .dbyte → .dasm → .dbyte（字节一致）
- DrapSYS 系统调用层（fs_read / fs_write / fs_exists / fs_ls / fs_mkdir / fs_rm / fs_chdir / fs_realpath / term_print / term_read / term_clear / term_exit / term_gui / term_hostcmd / term_setcwd / time_now）
- P0 修复：term_print 双路径统一（drapog.stream.js）、Shell _split 转义（\" \\ 单引号 空 token）、maxSteps 混合方案（1e6 + 每次 syscall 重置预算）
- 用 DrapLang 写的第一个程序：读磁盘配置文件并打印
- 完整开发闭环：写 .drap → cc 编译 → load 运行
- Finder（浏览真实磁盘）
- Terminal（GUI 内嵌）
- 自动挂载（刷新后恢复文件夹句柄）
- GUI 系统调用层（win_create / win_close / win_set_title / win_focus / win_text / win_fill_rect / win_stroke_rect / win_set_color / win_set_font / win_get_event / win_invalidate / win_atoi / itoa）—— DrapLang 经此自举出窗口 / 绘制 / 输入
- GUI 自举：System/app_gui.drap 是第一个完全用 DrapLang 编写的 GUI 应用（事件循环 + 点击变色主题），由 System/Boot/gui.js 的 launchDrapApp 宿主桥接驱动（建真实 WM 窗口、重放 drawOps、注入鼠标/键盘事件），test_gui.mjs 6 项断言全绿
- win_gui 控件框架（win_button / win_label / win_input / win_w / win_h / win_input_get）—— drapp 声明式控件，宿主自动布局/绘制/命中；test_gui.mjs 改用控件命中模型全绿
- 应用管理助手：drapog.apps.js 的 createAppManagerApp + dock 📦，网格列出 Finder/Terminal/Paint/DrapApp 示例并启动
- 设备感知默认启动：触屏设备（matchMedia('(pointer: coarse)')）默认进 GUI，桌面默认进 CMD；BIOS 菜单显示「自动进入：xxx」并加启动错误兜底
- 移动端软键盘：WM 软键盘 overlay + 菜单栏键盘按钮，焦点在 drapp 输入框时输入经宿主注入
- Finder 增强：上一级按钮、顶部菜单、新建 txt/文件夹、系统目录进入需权限（双击拦截 + 允许后放行）、系统目录内禁止删除
- DrapLang 完善：结构体成员赋值（p.x = 5 / p.x += 2）、数组元素赋值（a[i] = v）、复合赋值 += -= *= /= 真正可用（tokenizer 补齐复合赋值符）；test_draplang.mjs 覆盖 struct/member/array/split/短路/continue/嵌套 while 全绿
- DrapLang 事件处理程序（event fn）：声明式 `event fn on_paint/on_click/on_key/on_input/on_close`，编译器自动合成事件循环（内联 main 作共享 setup + 内联各处理器体），零运行时改动；System/app_gui.drap 改用此写法，test_event.mjs + test_gui.mjs 全绿
- DrapLang 标准库（stdlib）+ 模块导入 + 编译器行号诊断：drapcc.js 加 `import math/str`（core 自动，math/str 需显式导入）；新增内建函数——core: `atoi`；math: `abs/min/max/sqrt/pow/floor/ceil/round/rand/clamp`；str: `toUpper/toLower/trim/contains/indexOf/startsWith/endsWith/repeat`（字符串型内建返回堆指针，inferType 已识别）；drapog.vm.js 加 `BUILTIN` 指令 + JS 实现表（复用 syscall 传参 ABI r1..r3+r6+r7）；token 带行号，解析错误输出 `行 N：...`；test_stdlib.mjs 28 项全绿，全套 9 文件回归无回归
- **L3 统一启动器**：CMD 的 `run <app>` 与 GUI 的 dock / AppMgr 点击都收敛到同一个 `AppRegistry.launch(id, env)`；env = { wm, io }，按类型分派——host → `wm.launchApp`、gui → `launchDrapApp`、cli → `runDrapCli`。CMD 不再硬编码应用列表
- **L4 应用格式 `.app` + 注册表**：引入 `drapog.registry.js`（AppRegistry，无 DOM 依赖）与 `drapog.launcher.js`（DrapLang 应用启动器，从 gui.js 抽出）；`.app` 包 = `Name.app/Info.json`（`{id,name,icon,type:cli|gui,entry,version}`）+ `main.drap`（DrapLang 源）。注册表支持三种登记：`addHost`（内建宿主应用）、`addDrap`（代码显式登记，内存模式用 `import.meta.url` 拉源码）、`addDrapVfs`（`scan(vfs,'System/Apps')` 扫描挂载盘上的 `.app` 包）。已内置 `System/Apps/GuiDemo.app`、`System/Apps/Paint.app` 两个 `.app` 包
- TextEdit 应用（createEditApp：读写 `/Users/guest/Documents/readme.txt`）、Settings 应用（createSettingsApp：软键盘开关）、About 应用（createAboutApp）现已接入 dock，修复了此前 dock 上 edit/settings/about 点击开空窗的 bug

未完成：
- 窗口管理器用 DrapLang 重写
- 应用全部用 DrapLang 重写
- 主题系统（macOS / Win11 双主题）
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
- x = expr / x += expr / x -= expr / x *= expr / x /= expr（左值支持 ident / .成员 / [下标]）
- 结构体成员赋值：p.x = expr / p.x += expr
- 数组元素赋值：a[i] = expr
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

### 当前 VM 支持的指令（48 条）

LABEL LI MOV ADD SUB MUL DIV MOD
LT LE GT GE EQ NE
JMP JZ JNZ PUSH POP
CALL RET ENTER LEAVE ALLOC
LOADL STOREL
STR STRCAT STRLEN STREQ STRGET STRSUB STRSPLIT PRINTSTR
PRINT PRINTINT PRINTLN
NEWARR ARRGET ARRSET ARRLEN ARRPUSH
NEWOBJ FLDGET FLDSET
ADDSP HLT SYSCALL

### 堆对象类型

{ __type: 'str', value: '...' }     字符串
{ __type: 'arr', items: [...] }     数组
{ __type: 'obj', fields: [...] }    结构体

### 寄存器约定

r0  累加器 / 返回值
r1  操作数 / syscall 参数 1
r2  操作数 / syscall 参数 2
r3  操作数 / syscall 参数 3
r4  fp 帧指针（**绝不可用于 syscall 传参**，见下方警告）
r5  sp 栈指针
r6  临时（表达式求值）/ syscall 参数 4（仅 4 参数 syscall 使用）
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
- B6. 事件机制（event fn，编译器合成事件循环） ✅ 已实现
- B7. Shell 用 DrapLang 重写 ✅（System/shell.drap，首个自举组件）

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
r6  syscall 参数 4（仅 4 参数 syscall 使用）

最多 4 个参数（r1/r2/r3/r6）。**注意：r4 是帧指针 FP，绝不可用于 syscall 传参**——早期 4 参数 syscall（win_fill_rect / win_stroke_rect）曾误用 r4 覆盖 FP，导致帧指针错乱、函数内局部变量访问全部失效，表现为异步唤醒后字符串比较恒失败、close 不返回等重大 bug；已在 0.6.0 改为 r6。

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
  0x16  fs_chdir(path)             → str（返回归一化绝对路径）
  0x17  fs_realpath(base, path)    → str（纯路径归一化工具，~ / .. / . 由 VFS.normalize 处理）

终端（0x30-0x3F）：
  0x30  term_print(str)            → i32
  0x31  term_read()                → str（异步读入一行，宿主注入 onRead）
  0x32  term_clear()               → i32（清屏，宿主 onClear 钩子）
  0x33  term_exit()                → i32（退出 Shell，置 terminated 标志，VM 自然停机后宿主收尾）
  0x34  term_gui()                 → i32（切到 GUI，宿主 onSwitchGUI 钩子）
  0x35  term_hostcmd(line)         → i32（把一行交给宿主执行，宿主专属命令 mount/cc/load…）
  0x36  term_setcwd(str)           → i32（同步工作目录给宿主，供提示符显示）

时间（0x50-0x5F）：
  0x50  time_now()                 → i64

窗口 / 绘制 / 输入（0x40-0x4F，GUI 自举底层工具）：
  0x40  win_create(title, w, h)        → i32（创建窗口，返回 id 并设为当前窗口，自动推首帧 paint）
  0x41  win_close(winId)               → i32（推 close 事件并关闭真实窗口）
  0x42  win_set_title(winId, title)    → i32
  0x4b  win_focus(winId)               → i32（设为当前绘制/输入窗口）
  0x43  win_text(x, y, str)            → i32（绘制文本，缓冲到 drawOps）
  0x44  win_fill_rect(x, y, w, h)      → i32（填充矩形，**4 参数**）
  0x45  win_stroke_rect(x, y, w, h)    → i32（描边矩形，**4 参数**）
  0x46  win_set_color(r, g, b)         → i32（设置当前绘制颜色）
  0x47  win_set_font(size)             → i32（设置当前字体大小）
  0x48  win_get_event()                → str（取事件：队列非空立即返回；否则阻塞挂起 resolver，由宿主 injectWinEvent 唤醒）
  0x49  win_invalidate(winId)          → i32（请求重绘，推 paint 事件）
  0x4a  win_atoi(str)                  → i32（事件坐标解析）
  0x4c  itoa(n)                        → str（整数转字符串，便于 GUI/终端显示数字）

GUI 控件框架（0x4d-0x53，win_gui 声明式控件；**0x50 仍是 time_now，控件占用 0x4d/0x4e/0x4f/0x51/0x52/0x53**）：
  0x4d  win_w()                       → i32（当前窗口宽度，drapp 自适应布局，替代硬编码宽高）
  0x4e  win_h()                       → i32（当前窗口高度）
  0x4f  win_button(id, x, y, w, h)    → i32（声明按钮，**5 参数**：id(str) 同时作显示文字，命中事件 'click <id>'）
  0x51  win_label(x, y, str)          → i32（声明静态标签，**3 参数**，不可交互）
  0x52  win_input_get(id)             → str（读取输入框当前值）
  0x53  win_input(id, x, y, w, h)     → i32（声明输入框，**5 参数**，值由宿主键盘/软键盘维护，跨帧保留）

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

B6 事件机制（✅ 已实现，编译器级，零运行时改动）：
  - 顶层 `event fn on_paint() / on_click(ev: str) / on_key(ev: str) / on_input(id: str, val: str) / on_close()`
  - 编译策略：若存在 event fn，把 `entry fn main`（作 setup，其局部变量作为共享状态）内联进编译器**自动合成**的 `main`；main 先 LABEL 入口，再生成事件循环 `L1: e=win_get_event(); 按类型分发→内联各处理器体；处理器 return 跳到函数结尾 L_end；循环回 L1；L_end: RET`。
  - 事件类型常量 EVENT_TYPES = {on_paint:'paint', on_click:'click', on_key:'key', on_input:'input', on_close:'close'}。
  - 处理器内 `return 0` 由 genReturn 在事件上下文中改为跳到 L_end（不 RET）。
  - 宿主端完全不用改：win_get_event 队列/阻塞、injectWinEvent 注入、控件框架的 click/input 注入均已就绪。
  - 对照原设想（ui_button + ui_on 回调 + INT 0x81 结构体入堆）更轻：复用现有字符串事件，编译器承担分发，无需新 syscall。

B7 Shell 用 DrapLang 重写（✅ 已完成）：
  // System/shell.drap —— 纯 DrapLang 的 REPL，只通过 syscall 调底层工具
  entry fn main() -> i32 {
    let cwd = "/Users/guest"
    while (true) {
      let line = syscall term_read()        // 宿主注入 onRead
      let tokens = split(line, ' ')
      let cmd: str = tokens[0]
      if (cmd == "exit") { syscall term_exit(); break }
      else if (cmd == "ls")  { let p = syscall fs_realpath(cwd, tokens[1]); ... syscall fs_ls(p) ... }
      else if (cmd == "cd")  { cwd = syscall fs_realpath(...); syscall term_setcwd(cwd) }
      ...
      else { syscall term_hostcmd(line) }    // 宿主专属命令委托回 JS
    }
  }

  落地方式（与最初设想不同，更稳）：
  - drapog.shell.js 不再自己解析命令，改为「宿主」：启动 VM 跑 shell.drap，
    回车行经队列喂给 term_read；提示符/清屏/切 GUI/退出由宿主钩子（onCwd/onClear/onSwitchGUI/onExit）承接。
  - shell.drap 缺失或编译失败时，自动回退到 JS 版 executeLegacy（保留原命令 switch）。
  - 这是自举第一步；后续 WM / 应用可沿用同一模式（DrapLang 组件 + JS 宿主钩子）。

### GUI 自举（DrapLang 事件循环 + 宿主桥接）

与 Shell 自举同一模式：DrapLang 写 GUI 程序，只调用底层 win_* 工具；JS 宿主负责创建真实窗口、重放绘制、注入输入。

DrapLang 端（System/app_gui.drap，声明式 event fn，编译器合成事件循环）：
  entry fn main() -> i32 {
    let win = syscall win_create("DrapApp 示例", 420, 320)
    let mode = 0
    syscall win_button("go", 160, 60, 100, 40, "切换")   // 控件声明（paint 时宿主自动绘制）
  }
  event fn on_paint() {
    if (mode == 0) { syscall win_set_color(0,200,0) } else { syscall win_set_color(0,80,200) }
    syscall win_fill_rect(0,0,420,320)                    // 背景
    syscall win_set_color(255,255,255); syscall win_text(10,10,"mode=" + itoa(mode))
  }
  event fn on_click(e: str) {
    if (split(e," ")[1] == "go") { mode = mode + 1; syscall win_invalidate(win) }
  }
  event fn on_key(e: str) { mode = mode + 1; syscall win_invalidate(win) }
  // on_close 由编译器自动补：return 0 结束事件循环

JS 宿主端（System/Boot/gui.js）：
  - launchDrapApp(wm, vfs, source)：编译 → 建 VM+sys → 跑 vm.run()；onWinCreate 调 wm.createWindow({appId:'__drapapp__'})，并挂 win.__sys = sys
  - drapAppBridge.render(ctx, win, wm)：重放 sys.drapWins.get(win.id).drawOps 到真实 canvas（fillRect / fillText / strokeRect）
  - drapAppBridge.onMouseDown(lx, ly, win)：sys.injectWinEvent(win.id, 'click ' + lx + ' ' + ly)
  - drapAppBridge.onKeyDown(e, win)：sys.injectWinEvent(win.id, 'key ' + e.key)

事件驱动闭环：
  VM 阻塞在 win_get_event（队列空）→ 宿主 injectWinEvent 调 _pushEvent → 若 st.resolver 存在则唤醒（resolve(pushStr(ev))）→ VM 续体恢复执行事件分支 → win_invalidate 推 paint → 下一轮 win_get_event 消费 paint 并清空 drawOps 重绘 → 再阻塞。

验证：test_gui.mjs（mock 宿主，winId=1）断言首帧绘制、点击命中切换主题色、点击落空不切换、按键切换、close 正常停机，6 项全绿。

### win_gui 控件框架（声明式控件）

与「手绘矩形 + 手算坐标命中」相对，控件框架让 drapp 只在 paint 分支声明控件，宿主自动布局、绘制与命中：

DrapLang 端（paint 分支里声明）：
  win_button("go", x, y, w, h)      // 声明按钮；id 即显示文字；命中 → 注入 'click go'
  win_label(x, y, "文本")            // 声明静态标签（不可交互）
  win_input("name", x, y, w, h)      // 声明输入框；值由宿主键盘/软键盘维护，跨帧保留
  let v = win_input_get("name")      // 读取输入框当前值（str）
  let W = win_w(); let H = win_h()   // 自适应窗口尺寸

JS 宿主端（System/Boot/gui.js 的 drapAppBridge）：
  - render：重放 drawOps 后，按 controls 标准样式绘制按钮（圆角 + 悬停态）/ 标签 / 输入框
  - onMouseDown(lx, ly, win)：hitControl 命中控件 → 注入 'click <id>'；命中空白 → 注入 'click x y'
  - onKeyDown(e, win)：焦点在输入框 → 更新 inputs[id] 并注入 'input <id> <val>'；否则注入 'key <k>'

drapp 事件循环只判断 split(e," ")[0]：
  - == "click" 且 [1] 是控件 id → 命中；== 坐标数字 → 空白点击
  - == "input" → 输入框内容变化（[1]=id，[2]=值）

验证：test_gui.mjs 改用控件命中模型（首帧声明 win_button("go")，注入 'click go' 切主题），6 项断言全绿。

### 应用管理助手（App Manager）

drapog.apps.js 的 createAppManagerApp({ registry, vfs }) 是一个宿主应用，从 `registry.all()` 拉取所有已注册应用（过滤掉 appmgr 自身）以网格列出：
  - host 类（Finder / Terminal / TextEdit / Settings / About / AppMgr）由 WM 实现；
  - DrapLang 类（guidemo / paint，以及挂载盘上 `scan` 到的 `.app` 包）由注册表登记。
点击单元格 → 统一调 `registry.launch(id, { wm, vfs })`，按类型分派（host→wm.launchApp；gui→launchDrapApp；cli→runDrapCli），不再硬编码应用列表。

注册：drapog.wm.js 的 dock 增加 { id:'appmgr', letter:'◆', title:'应用' }；BIOS 启动后 wm.registerApp('appmgr', createAppManagerApp({ registry, vfs }))。

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

## 十五、GUI 自举完成情况

GUI 系统调用层（0x40-0x4c）               ✅（drapog.sys.js 0.4.0）
编译器注册 win_* / itoa + 4 参数传参改 r6  ✅（drapcc.js 0.6.0）
VM SYSCALL 传参扩展 r1..r3 + r6            ✅（drapog.vm.js 0.6.0）
宿主桥接 launchDrapApp + drapAppBridge      ✅（System/Boot/gui.js）
BIOS 菜单 GUI 入口                          ✅（System/BIOS/menu.js）
DrapLang GUI 示例 app_gui.drap              ✅（事件循环 + 点击变色）
test_gui.mjs 6 项断言                       ✅ 全绿
回归：test_b7(7) / test_shell(12) / test_host(6)  ✅ 全绿

关键修复（0.6.0）：
  - 4 参数 syscall（win_fill_rect / win_stroke_rect）原误用 r4 传参，覆盖帧指针 FP，
    导致异步唤醒后局部变量（含事件字符串）读取错乱、字符串比较恒失败、close 不返回；改回 r6。
  - split 分隔符：双引号字符串 " " 在编译器里被当作字符串指针传给 STRSPLIT（期望字符码点），
    导致 click/key 事件切分后的首 token 非 "click"/"key"；现编译器对 STR 型 delim 拆出首字符码点。
---

## 十六、win_gui 控件框架 + 应用管理助手 完成情况（0.7.0）

win_gui 控件框架（声明式按钮/标签/输入框）          ✅（drapog.sys.js 0.5.0 + drapcc.js 0.7.0）
5 参数 syscall 走 r7（win_button / win_input）       ✅（drapcc.js genSyscall n>=5 → r7）
宿主自动布局/绘制/命中（drapAppBridge）              ✅（System/Boot/gui.js 0.5.0）
drapp 输入框焦点 + 软键盘注入（'input <id> <val>'）  ✅
应用管理助手 createAppManagerApp（registry 驱动）+ dock ◆  ✅（drapog.apps.js 1.0.0；详见第十九节 L4）
设备感知默认启动 + 启动错误兜底                       ✅（System/BIOS/menu.js 0.2.0）
移动端软键盘 overlay + 菜单栏键盘按钮                ✅（drapog.wm.js 0.5.0）
Finder 增强（上级/新建/系统权限/预览）               ✅（commit 5c167c9）
DrapLang struct 成员赋值 / 数组元素赋值 / 复合赋值    ✅（drapcc.js 0.7.0；tokenizer 补齐 += -= *= /=）
test_draplang.mjs 17 项 / test_gui 6 项 / 全回归     ✅ 全绿

## 十七、DrapLang 事件处理程序（event fn）完成情况（0.8.0）

声明式事件处理                                       ✅（drapcc.js 0.8.0）
编译器合成事件循环（内联 main 作共享 setup）          ✅（compile/genEventMain：LABEL main → L1 win_get_event → 类型分发内联处理器体 → 处理器 return 跳 L_end → 循环/退出）
事件类型常量 EVENT_TYPES（paint/click/key/input/close）✅
处理器内 return 在事件上下文改为跳 L_end（不 RET）    ✅（genReturn 加 insideEventHandler 分支）
宿主零改动（win_get_event 队列/阻塞 + injectWinEvent 注入） ✅
System/app_gui.drap 改用 event fn 写法                 ✅
test_event.mjs（on_paint/on_click/on_key/on_input/on_close）+ test_gui 复用演示 ✅ 全绿

## 十八、L2 夯实：标准库 / import 模块 / 编译器行号诊断（0.9.0）

### 背景
路线把「底层语言·工具（L2）」作为地基优先夯实。本次补两块：
1. **标准库（stdlib）**：之前只有 len/split/substr 三个编译器内建，没有成体系的函数层；
2. **编译器诊断**：报错不带位置，开发体验差。

### 标准库设计
- 模块机制：`import math` / `import str`；`core` 自动导入（始终可用），math/str 需显式导入（门禁在编译期校验 imports）。
- 编译器加 `BUILTIN_MODULES` / `BUILTINS` 表（name → {mod,id,arity}）；`genCall` 在 len/split/substr 之后、用户函数之前查 BUILTINS，未导入则报「需先 import <mod>」；`genBuiltin` 复用 syscall 传参 ABI（r1..r3+r6+r7）发 `BUILTIN` 指令。
- VM 加 `BUILTIN` 指令 + `BUILTIN_TABLE`（JS 实现）：字符串型内建（toUpper/toLower/trim/repeat）返回堆指针；数值型返回 i32。
- `inferType` 识别字符串型内建，确保 `term_print(toUpper(...))` 走 PRINTSTR 而非 PRINTINT（否则会把字符串指针当数字打印）。

内建清单：
- core（自动）：`atoi(s)`
- math（需 import）：`abs/min/max/sqrt/pow/floor/ceil/round/rand/clamp`
- str（需 import）：`toUpper/toLower/trim/contains/indexOf/startsWith/endsWith/repeat`

### 编译器行号诊断
- tokenize 全程维护 `line`，每个 token 带 `line`；新增 `_err(msg)` 在报错时前缀「行 N：」。
- 修复：`_err` 在 tokenize 内部调用时 `this.tokens` 尚未挂载，回退到 `this.curLine`，避免 NaN 崩溃。
- 关键解析错误（顶层/类型名/syscall/表达式/event fn/import/词法）全部改用 `_err`。

### 验证
- test_stdlib.mjs 28 项全绿（core + math + str + 模块门禁 + 未知模块 + 行号诊断）。
- 全套 9 个测试文件（b7/shell/host/gui/paint/finder/draplang/event/stdlib）回归无回归。
- 版本号：drapcc.js 0.9.0，drapog.vm.js 0.7.0。

## 十九、L3/L4 完成情况（应用注册表 + .app 格式 1.0.0）

### 背景
路线：构思框架 → 构思细节 → 底层语言·工具（L2）→ cmd 调用（L3）→ 整合 draplang 工具、制定格式（L4）→ GUI 使用（L5）。
本次把「应用的发现 / 注册 / 启动」收敛为统一抽象，让 CMD 的 `run`、GUI 的 dock、AppMgr 点击走同一套逻辑。

### 新增文件
- `drapog.registry.js` 1.0.0：AppRegistry（无 DOM 依赖）。方法：`addHost(id,{name,icon,title})`、`addDrap(id,{name,icon,type,file,baseUrl})`（`url = new URL(file, baseUrl).href`）、`addDrapVfs(id,{name,icon,type,entry})`、`scan(vfs, dir='System/Apps')`（读 `*.app/Info.json`）、`get(id)`、`all()`、`launch(id, env={wm, io})`。
  - launch 分派：`host` → `wm.launchApp({id, letter, title})`（无 wm 提示「请用 gui 进入桌面」）；`gui` → 拉源码（`a.url` 用 fetch，`a.entry` 用 `vfs.read`）交给 `launchDrapApp`（无 wm 提示 GUI 应用）；`cli` → 源码交给 `runDrapCli`（输出收敛到 `io.print`，无 wm 也能跑）。
- `drapog.launcher.js` 1.0.0：从 gui.js 抽出的 DrapLang 应用启动层。导出 `drapAppBridge`（render / onMouseDown / onKeyDown 重放绘制与注入事件）、`launchDrapApp(wm, vfs, source)`、`launchDrapAppUrl(wm, vfs, url)`、`runDrapCli(vfs, io, source)`。依赖 DrapCC / VM / DrapSYS / makeLineWriter。

### .app 包格式（L4）
`Name.app/` 目录 = `Info.json`（`{id, name, icon, type: cli|gui, entry, version}`）+ `main.drap`（DrapLang 源）。
已内置：`System/Apps/GuiDemo.app`（id=guidemo，gui）、`System/Apps/Paint.app`（id=paint，gui）。
内存模式（未挂载真实磁盘）下 MemoryBackend 不播种 `.drap` 文件，故 gui.js / cmd.js 用 `addDrap(..., {file:'../app_gui.drap', baseUrl: import.meta.url})` 代码显式登记已知 DrapLang 应用；挂载真实磁盘后 `scan('System/Apps')` 自动扩展发现盘上的 `.app` 包（fire-and-forget，失败不阻断启动）。

### 接线
- CMD（System/Boot/cmd.js 0.8.0）：构建与 gui 同款 registry（host + addDrap guidemo/paint + scan），注入 `DrapShell({registry, wm:null})`；`run <app>` 命令 → `registry.launch(name, {wm:null, io})`。
- Shell（drapog.shell.js 0.8.0）：新增 `run` 命令（`_cmdRun`），有 registry 时列出 id 或启动，无 registry 回退 `_runDemo()`。
- GUI（System/Boot/gui.js 1.0.0）：构建 registry 并注册全部宿主应用实现（含 createEditApp / createSettingsApp / createAboutApp，修复此前 dock 上 edit/settings/about 点击开空窗的 bug）；AppMgr 改为 `registry.all()` + `registry.launch`；自动启动改 `registry.launch('guidemo', {wm, vfs})`。
- `drapog.apps.js` 1.0.0：AppMgr 重写为 registry 驱动；新增 createEditApp（读写 `/Users/guest/Documents/readme.txt`）、createSettingsApp（软键盘开关）、createAboutApp。

### 关键修复（L3/L4 期间）
- registry 导入路径 `./launcher.js` → `./drapog.launcher.js`（原先会 `ERR_MODULE_NOT_FOUND`）。
- cmd.js 顶层 `await registry.scan(...)` 置于非 async 流程导致 `SyntaxError` → 改 fire-and-forget `registry.scan(...).catch(()=>{})`。
- VFS（drapog.vfs.js 0.3.1）MemoryBackend 的 `write`/`writeBytes` 原先不会自动创建缺失的父目录（FSAccessBackend 会），导致内存模式下写嵌套路径静默失败、scan 因 `System/Apps` 不存在提前返回；现写入前自动 `_mkdir` 父目录，与 FSAccess 行为一致。

### 验证
- test_registry.mjs 9 项全绿：scan 发现 cli/gui 型 .app；all 含 host+drapp；launch 的 host/gui/cli 三分支；无 wm 时 host/gui 提示；未知 id 报错。
- 全套 10 个测试文件（b7/shell/host/gui/paint/finder/draplang/event/stdlib/registry）全绿，无回归。

---
最后更新：2026-10-14　当前版本：1.0.0
