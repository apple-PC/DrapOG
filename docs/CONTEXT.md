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
| DrapLang | 系统源语言（.drapp） |
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
- DrapVM：49 条指令（含 SYSCALL / ADDSP / STRGET / STRSUB / STRSPLIT / LEN）
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
- **L4 应用格式 `.app` + 注册表**：引入 `drapog.registry.js`（AppRegistry，无 DOM 依赖）与 `drapog.launcher.js`（DrapLang 应用启动器，从 gui.js 抽出）；`.app` 包 = `Name.app/Info.json`（`{id,name,icon,type:cli|gui,entry,version}`）+ `main.drapp`（DrapLang 源）。注册表支持三种登记：`addHost`（内建宿主应用）、`addDrap`（代码显式登记，内存模式用 `import.meta.url` 拉源码）、`addDrapVfs`（`scan(vfs,'System/Apps')` 扫描挂载盘上的 `.app` 包）。已内置 `System/Apps/GuiDemo.app`、`System/Apps/Paint.app`、`System/Apps/Hello.app` 三个 `.app` 包
- TextEdit 应用（createEditApp：读写 `/Users/guest/Documents/readme.txt`）、Settings 应用（createSettingsApp：软键盘开关）、About 应用（createAboutApp）现已接入 dock，修复了此前 dock 上 edit/settings/about 点击开空窗的 bug
- **L4 完善（1.1.0）**：DrapLang 支持 `import "name"` 文件级模块（多文件 app 可拆模块，registry 按 `modules` 自动拉取兄弟 `.drapp`）；`.app` 格式升级（`Info.json` 增 `author/description/category/minVersion/permissions/modules`，`entry` 支持 `.dbyte` 预编译入口，扫描校验必填字段）；Shell 新增应用管理命令 `apps`/`info`/`pack`/`install`/`uninstall`；WM `launchApp` 增加 registry 回退、dock 加入 guidemo/hello，使纯 DrapLang 应用从 dock 也能启动；新增 CLI 示例 `System/Apps/Hello.app`；`.app/main.drapp` 成为唯一真源（旧 `System/app_gui.drapp`/`app_paint.drapp` 仅留作旧测试）。test_modules.mjs(8) + test_l4.mjs(19) + test_registry.mjs(16) 全绿
- **DrapLang 接口完善（v1.0 / 项目 1.2.0）**：为「让开发者编写实用工具/应用程序」补齐完整接口与基础工具——（1）**新增系统调用**：`fs_append/fs_copy/fs_move/fs_size/fs_isdir`（文件）、`time_sleep/time_format`（时间）、`args_count/args_get`（CLI 参数，argv[0] 默认程序名）；（2）**新增标准库内建**：`itoa`（core）、`replace/join/charAt`（str）、`sin/cos/log/exp`（math），`replace` 替换全部匹配；（3）**打通 argv 全链路**：registry→launcher→DrapSYS，CLI 退出码取 `main` 的 `i32` 返回值；（4）**源文件后缀 `.drap` → `.drapp`**：全量重命名 System/Boot/gui.js、cmd.js、shell.drapp、app_gui.drapp、app_paint.drapp、Users/guest/hello.drapp 及 System/Apps/{GuiDemo,Paint,Hello}.app/main.drapp，并同步所有引用（registry/shell/test）；（5）**编写《DrapLang 语言规范（v1.0）》**（DrapLang规范.md）：模型/词法/类型/声明/语句/表达式/标准库（core/math/str 全表）/系统调用（fs_/term_/time_/args_/win_ 全表含参数与返回值）/.app 格式/工具链命令/示例，即「编写软件」所需完整接口清单；（6）**修复 DBYTE 序列化漏掉 `BUILTIN` 指令的 bug**：预编译 `.dbyte` 产物使用内建函数会报「未知指令」，已在 drapog.dbyte.js 的 OPCODE/ARG_SPEC 补齐 `BUILTIN:48`（含 'i' 参数）。版本号：drapcc.js 1.0.0、drapog.sys.js 0.6.0、drapog.vm.js 0.8.0、drapog.dbyte.js 0.5.0。test_api.mjs 接口完整性验证（fs_/time_/builtins/argv 全绿）+ 全套 14 文件回归无回归（新增 test_tools.mjs 验证四个 drapp 工具）
- **DrapLang 实用工具 + 运行时契约（项目 1.3.0）**：按「drapp = cmd 里的程序、app = gui 里的程序、app 可调用 drapp」的契约，新增四个运行在 cmd 的 drapp 实用工具（均为 type:cli 的 .app 包，cmd 的 `scan('System/Apps')` 自动发现，可直接 `run <名>`）：`cat <文件> [-n]`（打印文件内容、-n 行号、自动去结尾换行避免空行）、`wc <文件>`（行/词/字符统计、逐字符扫描兼容 `\r\n`）、`grep <模式> <文件>`（打印命中行）、`ls [路径]`（列目录、目录名加 /）。全部基于标准接口实现（fs_read/fs_exists/fs_isdir/fs_ls、args_count/args_get、split/contains/charAt/itoa/replace、term_print/term_println）。运行时契约：drapp 在 cmd 调用 GUI 系统调用（win_*）时，DrapSYS 因无 WM 直接安全返回（`win_create` 无 `onWinCreate` 返 0、其余 `if (!st) return 0`），即「忽略 GUI、只跑功能」已内建保障、不崩溃。验证见 test_tools.mjs 14 项全绿
- **第二批 drapp 实用工具（项目 1.4.0）**：再增四个 cmd 工具——`head <文件> [N=10]`（前 N 行）、`tail <文件> [N=10]`（后 N 行）、`sub <文件> <旧> <新>`（文件内查找替换、sed 风格、写回）、`tree [路径]`（递归目录树，首次演示 **DrapLang 函数递归** `walk(path, depth)` 自调用）。至此 cmd 下共有 8 个 drapp 工具（cat/wc/grep/ls/head/tail/sub/tree）。新增 test_tools2.mjs（head/tail/sub/tree 共 18 项断言全绿）；全套 15 个测试文件回归无回归
- **L5 首个 GUI 应用：Calc 计算器（项目 1.5.0）**：正式进入 L5「GUI 使用」。新增 `System/Apps/Calc.app`（type:gui）——用 **win_gui 控件框架 + event fn** 编写的计算器（on_paint 声明标题/显示屏/4×4 按钮网格，on_click 驱动左结合整数状态机，除零保护）；并**首次落地「app 调用 drapp」**：Calc 这个 GUI 应用通过 `import "calcutil"` 复用兄弟模块 `calcutil.drapp` 的 `apply(a,o,b)`（算术核心，除零返回 0）。已接入 GUI：gui.js `addDrap('calc', {type:'gui', modules:['calcutil']})`、WM dock 加 🧮 Calc 图标、AppMgr 经 scan 自动展示。新增 test_calc.mjs（编译+import 模块+注入 click 读显示屏 label，覆盖 2+3 / 5×4 / 10-3-2 / 8÷0 / 多位 / clear / 停机 共 14 断言全绿）；全套 16 个测试文件回归无回归
- **BIOS Setup 固件设置（项目 1.6.0）**：实现启动菜单里原本「未实现」的 BIOS Setup。新增 `System/BIOS/setup.js`——canvas 风格固件设置界面（↑↓ 选择 / ←→ 调整 / Enter 确认 / F10 保存并退出 / Esc 不保存退出）。可配置：**启动模式**（自动按设备 / 强制 CMD / 强制 GUI）、**菜单倒计时**（0–30 秒，0=一直等待）、恢复默认。因 BIOS 运行在 VFS 挂载之前，设置持久化到 **localStorage（相当于 CMOS/NVRAM，键 `drapog.bios.cmos`）**；`menu.js` 改为读取该设置决定默认启动项与倒计时（倒计时 0 则关闭自动启动、等待用户），Setup 退出后重显菜单。新增 test_bios.mjs（mock 浏览器环境，纯逻辑 + showSetup 交互共 18 断言全绿）；全套 17 个测试文件回归无回归
- **L5 GUI 应用：Conv 进制转换器（项目 1.7.0）**：再增一个 GUI 应用 `System/Apps/Conv.app`（type:gui）——输入十进制数，点按钮转二/八/十六进制。**又一次「app 调用 drapp」**：`import "baseconv"` 复用 `baseconv.drapp` 的 `toBase(n, base)`（反复取余构串，整数精确，含 0/负数处理）。on_paint 声明输入框 + 结果 + 三个中文按钮，on_click 读输入→atoi→toBase→win_invalidate 重绘。已接入 dock/gui.js。新增 test_conv.mjs（setInputValue 设输入 + 注入 click + 读结果 label，7 断言全绿）；全套 18 个测试文件回归无回归
- **主题系统 + 图标统一 + 清理演示应用（项目 1.8.0）**：
  - **`gui <theme>` 命令**：shell 的 `gui` 现接受主题标识符——`gui macos` / `gui windows`（`>gui windows` 进 Windows 桌面）；经 `switchToGUI(theme)` → `startGUI({theme})` → WM。
  - **Windows GUI 主题（起始）**：WM 引入 THEMES 配置并按主题渲染 chrome——macOS=顶部菜单栏 + 底部居中 dock + 左上三色圆点控件 + 紫蓝壁纸；Windows=无顶部栏 + 底部任务栏（Start 四格标 + 应用图标 + 最小化窗口 + 时钟）+ 右上方形 min/max/close 控件 + 蓝色壁纸。窗口最大化/拖动按各自工作区计算。DrapLang 应用自绘内容（主题无关），宿主 chrome 随主题切换——两套主题下 app 界面均正确使用。
  - **图标统一**：新增 `appIcon(id)`——取 id 前两个字母、首字母大写次字母小写（finder→Fi、calc→Ca、conv→Co）；registry（host/drap/scan）与 WM dock 全部改用，弃用 emoji/杂字。
  - **删除演示/调色板应用**：移除 `GuiDemo.app`、`Paint.app`（及 dock/registry/自动启动引用；自举改自动启动 Calc）。`System/app_gui.drapp`/`app_paint.drapp` 保留仅供 test_gui/test_paint。
  - 新增 test_theme.mjs（appIcon / normalizeTheme / WM 两主题工作区与控件位置 / 任务栏布局 / gui 命令传参，19 断言全绿）；全套 19 个测试文件回归无回归
- **修复 DrapLang Shell 自举 + `gui` 主题透传（项目 1.8.1，bugfix）**：
  - `_ensureRepl` 漏 import `DrapSYS`（用了 `new DrapSYS` 却只动态 import 了 DrapCC/VM）→ 挂载后一输命令就「DrapSYS is not defined」回退 legacy；已补 import。
  - 构造函数未初始化 REPL 状态（`inputWaiters/inputQueue/replStarted/legacyMode` 用了却没在 constructor 赋值）→ REPL 模式首次 `execute` 读 `inputWaiters.length` 直接崩；已在 constructor 初始化。**这两条意味着 DrapLang 自举 Shell 此前从未真正跑起来（总是回退 JS legacy），现已真正可用。**
  - 免 mount 可用 Shell：`_ensureRepl` 在 vfs 读不到 `/System/shell.drapp` 时，改用 `fetch(new URL('System/shell.drapp', import.meta.url))` 从项目服务端取源码——内存模式（未挂载）也能跑 DrapLang Shell，不必先 `mount`。
  - `gui <theme>` 透修：shell.drapp 的 `gui` 分支改走 `term_hostcmd(line)`（原来 `term_gui()` 丢主题参数）→ executeLegacy 解析 `gui windows` → `switchToGUI('windows')`；GUI 内 Terminal 的 `switchToGUI` 改为 `wm.setTheme(theme)` 实时切换（原为 no-op）；CMD 内仍走 `startGUI({theme})`。
  - 新增 test_shellrep.mjs（真跑 REPL：自举不回退、输出 help、`gui windows`→switchToGUI('windows')）；全套 20 个测试文件回归无回归
- **主菜单 + UI 反馈修复（项目 1.8.2）**：
  - 计算器按钮标签：`win_button` 的 id 即显示文字，原 id 带 "b" 前缀（b7/badd）导致显示 "b7"；改用符号 id（7 8 9 / 4 5 6 * 1 2 3 - C 0 = +），显示干净。
  - Windows 控件重叠：方形 min/max/close 边长 26 > 间距 20 相互重叠；间距提到 26、边长降到 22。
  - 主菜单：macOS 左上角 Apple 菜单（ 关于本机 / 系统设置... / 锁定屏幕 / 重新启动... / 关机...）；Windows 任务栏 Start 开「开始菜单」（应用网格 + 锁定/注销/重启/关机）。Start 不再与 Ap 重复打开 AppMgr。新增锁屏/关机覆盖层与电源动作（restart=location.reload；lock/logout=锁屏；shutdown=关机屏 + 开机键）。菜单/覆盖层逻辑可在 node 下单测（hitMenu / runMenuAction / appleMenuLayout / startMenuLayout）。
  - 新增 test_theme.mjs 主菜单断言（Apple 菜单逐项、开始菜单电源行/网格、锁/注销/关机）；全套 20 个测试文件回归无回归
- **桌面功能批量（项目 1.9.0）**：
  - **主题文件格式**：新增 `System/Themes/{macos,windows}.json` 作为主题规范（控件位置/样式、顶/底栏、壁纸渐变、window 配色）；gui.js 启动时 fetch 合并进 `wm.T`，应用可读 `wm.T.window.*` 适配主题。
  - **右键上下文菜单**：WM 加 `onContextMenu`（contextmenu 事件）——桌面右键=新建文件夹/新建文本/刷新/个性化；窗口右键委托应用（`app.contextMenu`）。动作支持字符串（WM 全局）或函数（应用自定义，如 Finder 打开/移到废纸篓）。
  - **设置分级菜单**：重写 createSettingsApp——侧栏 个性化/账户/通用/关于；个性化一键切 macOS/Windows 主题（`wm.setTheme`）；通用含软键盘开关。
  - **Finder 增强**：删除改「移到废纸篓」；新增右键菜单（打开/移到废纸篓/新建/刷新）；支持 `openFinderAt(path)` 初始路径打开（此电脑双击用）。
  - **TextEdit**：新增可编辑路径栏（改路径→打开/保存 = 打开/另存为）。
  - **废纸篓/回收站 + 此电脑**：新增 Trash 应用（还原/清空）与此电脑应用（卷列表，双击 openFinderAt）；删除=移入 `/Library/Trash`（递归、重名加序号、可还原/清空）。接入 dock/任务栏/AppMgr。
  - 新增 test_trash.mjs（14 断言）+ test_theme.mjs 增右键菜单/主题合并断言（47 项）；全套 21 个测试文件回归无回归
- **L6 办公级第一块拼图：DrapLang 文档编辑器 DocEdit（项目 2.0.0）**：用 DrapLang 编写的多行文本编辑器 `System/Apps/DocEdit.app`（type:gui）——方向键/Home/End/退格/回车、滚动、点击定位光标、打开/保存任意路径、字数/行列统计、未保存标记；演示 `win_mono` 等宽字体（光标精确定位）+ `win_set_input` 输入框预填（默认路径）+ 运行期错误诊断（行号+调用栈，A 阶段地基）。已接入 dock（Do 图标）+ AppMgr + registry（`addDrap('docedit', ...)` 配 `Info.json`）。修复两个 bug：（1）**substr 代码生成的寄存器分配缺陷**——`start` 存于 r1，求值 `len` 表达式（如 `col-1`）时内部用 r1 作临时寄存器把它覆盖，导致 `substr(s,0,n)` 的 start 被篡改为 1，退格删末尾字符错误（'World'→'orld'）；现求值 `args[2]` 前先把 `start`/`src` 压栈保护、再出栈还原；（2）**DBYTE packer 漏掉 `LEN` 指令**——`len()` 运行期编译为 `LEN`，但 `drapog.dbyte.js` 的 OPCODE/ARG_SPEC 无 LEN，预编译/往返含 `len()` 的程序会报「未知指令」，已补 `LEN:49`（单寄存器操作数）。新增 test_docedit.mjs（10 项无头冒烟全绿）；全套 24 个测试文件回归无回归

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

### 当前 VM 支持的指令（49 条）

LABEL LI MOV ADD SUB MUL DIV MOD
LT LE GT GE EQ NE
JMP JZ JNZ PUSH POP
CALL RET ENTER LEAVE ALLOC
LOADL STOREL
STR STRCAT STRLEN STREQ STRGET STRSUB STRSPLIT LEN PRINTSTR
PRINT PRINTINT PRINTLN
NEWARR ARRGET ARRSET ARRLEN ARRPUSH
NEWOBJ FLDGET FLDSET
ADDSP HLT SYSCALL

LEN 为运行期长度分发：操作数 r0 是堆对象指针，按 `__type` 决定取字符串字符数或数组元素数（规避「字符串元素的数组」在编译期被误判为数组而走 ARRLEN 的 bug）。DBYTE 编码号 49。

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

## 十九、L3/L4 完成情况（应用注册表 + .app 格式 1.1.0）

### 背景
路线：构思框架 → 构思细节 → 底层语言·工具（L2）→ cmd 调用（L3）→ 整合 draplang 工具、制定格式（L4）→ GUI 使用（L5）。
本次把「应用的发现 / 注册 / 启动」收敛为统一抽象，让 CMD 的 `run`、GUI 的 dock、AppMgr 点击走同一套逻辑。

### 新增文件
- `drapog.registry.js` 1.1.0：AppRegistry（无 DOM 依赖）。方法：`addHost(id,{name,icon,title})`、`addDrap(id,{name,icon,type,file,baseUrl,version,author,description,category})`（`url = new URL(file, baseUrl).href`）、`addDrapVfs(id,info)`、`register(app)`（install 用）、`unregister(id)`（uninstall 用）、`scan(vfs, dir='System/Apps')`（读 `*.app/Info.json` 并校验必填字段）、`get(id)`、`all()`、`launch(id, env={wm, io})`、`resolve(entry, vfs)`（解析 drap 源码 / dbyte 预编译产物 + 模块源）。
  - launch 分派：`host` → `wm.launchApp({id, letter, title})`（无 wm 提示「请用 gui 进入桌面」）；`gui` → 拉源码（`a.url` 用 fetch，`a.entry` 用 `vfs.read`）交给 `launchDrapApp`/`launchDrapAppProgram`（无 wm 提示 GUI 应用）；`cli` → 源码交给 `runDrapCli`/`runDrapCliProgram`（输出收敛到 `io.print`，无 wm 也能跑）。
- `drapog.launcher.js`（1.0.0 → 新增 program 重载）：`drapAppBridge`（render / onMouseDown / onKeyDown）、`launchDrapApp(wm,vfs,source,opts)`（opts.modules 支持文件级模块）、`launchDrapAppProgram(wm,vfs,program)`、`runDrapCli(vfs,io,source,opts)`、`runDrapCliProgram(vfs,io,program)`。

### .app 包格式（L4 v1.1）
`Name.app/` 目录 = `Info.json` + `main.drapp`（或 `main.dbyte` 预编译入口）。
- `Info.json` 字段：必填 `id / name / type(gui|cli) / entry`；可选 `version / icon / author / description / category / minVersion / permissions / modules`（modules 为兄弟 `.drapp` 基名数组，供 app 内 `import "name"` 文件级模块解析）。扫描时校验必填字段，缺字段/损坏的包跳过告警。
- 内置包：`System/Apps/GuiDemo.app`（guidemo, gui）、`System/Apps/Paint.app`（paint, gui）、`System/Apps/Hello.app`（hello, cli）。
- **唯一真源**：gui.js / cmd.js 的 `addDrap` 现指向 `../Apps/<Name>.app/main.drapp`（取代旧的 `System/app_gui.drapp` / `app_paint.drapp`，后者仅保留供旧测试）。挂载真实磁盘后 `scan('System/Apps')` 自动扩展发现盘上的 `.app` 包（fire-and-forget）。
- 预编译入口：entry 为 `.dbyte` 时，`resolve` 经 `drapog.dbyte.unpack` 还原 program，直接 `launchDrapAppProgram` / `runDrapCliProgram`，免去运行时编译。

### 接线
- CMD（System/Boot/cmd.js 0.9.0）：构建与 gui 同款 registry（host + addDrap guidemo/paint/hello + scan），注入 `DrapShell({registry, wm:null})`；`run <app>` → `registry.launch(name, {wm:null, io})`。
- Shell（drapog.shell.js 0.9.0）：新增 `run` 命令；新增应用管理命令 `apps` / `info <id>` / `pack <in.drapp> [name] [-gui]` / `install <src.app>` / `uninstall <id>`（install/uninstall 经 `registry.scan` / `unregister` 同步注册表，VFS 用递归 `_copyTree` / `_rmTree`）。
- GUI（System/Boot/gui.js 1.1.0）：构建 registry 并注册全部宿主应用实现；`wm.vfs` / `wm.registry` 注入 WM；AppMgr 改为 `registry.all()` + `registry.launch`；dock 增加 `guidemo` / `hello` 图标，WM `launchApp` 增加「无 WM 实现但注册表有」的 registry 回退，使 dock 也能启动纯 DrapLang 应用；自动启动 `registry.launch('guidemo')`。
- WM（drapog.wm.js 0.6.0）：`launchApp` 增加 registry 回退；dock 列表加入 guidemo/hello。
- `drapog.apps.js` 1.1.0：AppMgr 重写（registry 驱动，单元格显示图标 + name + `v版本 · category`）；新增 createEditApp / createSettingsApp / createAboutApp。

### DrapLang 文件级模块（L4 配套，drapcc.js 0.9.0）
`import "name"` 现支持「文件模块」：`DrapCC(source, { modules:{name:source} })` 在解析主源后 BFS 解析各模块源，合并其函数/结构体声明（模块内禁止 entry/event）。`runDrapCli` / `launchDrapApp` 透传 `opts.modules`，registry 的 `resolve` 按 `entry.modules` 自动拉取兄弟 `.drapp`。测试 test_modules.mjs 8 项全绿（含嵌套 import、模块返回字符串、未声明模块报错）。

### drapp / app 运行时契约与实用工具（项目 1.3.0 → 1.4.0）
- **运行时契约**：`.drapp` 是 DrapLang 源文件，运行在 **cmd**（只跑框架与功能，忽略 GUI）；`.app` 是打包格式——`type: cli` 即在 cmd 运行的 drapp 程序，`type: gui` 即在 gui 运行的 app；gui 型 app 可 `import` 共享的 `.drapp` 文件级模块（见上节「DrapLang 文件级模块」）。
- **cmd 下忽略 GUI 已内建保障**：DrapSYS 的 `win_*` 方法在无 WM 时安全返回（`win_create` 无 `onWinCreate` 回调则返 0；`win_text/win_fill_rect/win_stroke_rect/win_set_color/win_set_font/win_button/win_label/win_input` 在 `!st` 时返 0；`win_get_event` 无当前窗口返空串）；`win_w/win_h` 无窗口返 0。所以 drapp 即便调用 GUI 也不会崩——「忽略 GUI、只跑功能」由运行时兜底。
- **八个 cmd 实用工具**（`System/Apps/`，type:cli，cmd 的 `scan` 自动发现，`run <名>` 运行）：
  - `Cat.app`：`cat <文件> [-n]` —— 打印文件内容，-n 加行号（自动去结尾换行，避免 split 多出空行）。
  - `Wc.app`：`wc <文件>` —— 行/词/字符统计（逐字符扫描，兼容 `\r\n`）。
  - `Grep.app`：`grep <模式> <文件>` —— 逐行包含匹配。
  - `Ls.app`：`ls [路径]` —— 列目录（`/Users/guest` 为默认），目录名加 `/`。
  - `Head.app`：`head <文件> [N=10]` —— 打印前 N 行。
  - `Tail.app`：`tail <文件> [N=10]` —— 打印后 N 行。
  - `Sub.app`：`sub <文件> <旧> <新>` —— 文件内查找替换（sed 风格）并写回。
  - `Tree.app`：`tree [路径]` —— 递归打印目录树（演示 DrapLang 函数递归 `walk` 自调用）。
  - 源码均基于标准接口（fs_/args_/builtins/term_print/函数递归），示例兼作「如何用 DrapLang 写软件」的参考；验证见 test_tools.mjs + test_tools2.mjs（共 32 项断言全绿）。

### L5：GUI 应用 —— Calc 计算器 + app 调用 drapp（项目 1.5.0）
- **Calc 计算器**（`System/Apps/Calc.app`，type:gui）：完全用 DrapLang 编写，基于 win_gui 控件框架（win_label/win_button）+ event fn（on_paint/on_click/on_close）。左结合整数运算，除零返回 0。启动：桌面 dock 点 🧮 / AppMgr 里点开。
- **app 调用 drapp（架构验证）**：Calc 的 `Info.json` 声明 `modules:["calcutil"]`，`main.drapp` 顶部 `import "calcutil"`，复用 `calcutil.drapp` 里的纯函数 `apply(a,o,b)`。gui 型 .app 经 registry resolve 拉取兄弟 `.drapp` 模块交给 DrapCC 合并——证明「gui 的 app 能调用 drapp 代码」。
- **写 GUI 应用的范式**（供参考）：`entry fn main` 里 `win_create` + 声明共享状态变量（不 return，控制权交给编译器合成的事件循环）；`event fn on_paint` 画背景 + 声明控件；`event fn on_click(ev)` 用 `split(ev," ")[1]` 取控件 id 驱动逻辑 + `win_invalidate(win)` 重绘。注意：event 处理器与 setup 共享 main 局部作用域，但独立 `fn` 看不到这些局部——跨作用域只能用纯函数（放 `.drapp` 模块里正合适，即「app 调用 drapp」的用武之地）。
- 验证：test_calc.mjs 14 断言全绿（VM 层注入 click、读显示屏 label 文本核对结果）。

### BIOS Setup 固件设置（项目 1.6.0）
- **入口**：`System/BIOS/bios.js`（splash → POST → menu）；`menu.js` 第 3 项「BIOS Setup」原为占位，现调用 `setup.js` 的 `showSetup()`，退出后重显启动菜单。
- **设置项**：启动模式（auto/cmd/gui）、菜单倒计时（0–30 秒，0=一直等待）、恢复默认。F10 保存并退出、Esc 不保存退出。
- **持久化**：localStorage 键 `drapog.bios.cmos`（BIOS 先于 VFS 运行，故用浏览器存储模拟 CMOS/NVRAM）。`loadBiosSettings/saveBiosSettings/normalizeSettings` 均做清洗与边界约束；损坏 JSON 回退默认。
- **联动**：`menu.js` 用 `loadBiosSettings()` 决定默认选中项（cmd→CMD、gui→GUI、auto→按设备检测）与倒计时；倒计时 0 时关闭自动启动计时器。
- 验证：test_bios.mjs（纯逻辑 + showSetup 交互，mock window/document/localStorage/canvas）18 断言全绿。

### L6：DocEdit 文档编辑器（项目 2.0.0）
- **DocEdit**（`System/Apps/DocEdit.app`，DrapLang 多行文本编辑器，办公级第一块拼图）：方向键/Home/End/退格/回车、滚动、点击定位光标、打开/保存任意路径、字数/行列统计、未保存标记；演示 `win_mono` 等宽字体（光标精确定位）+ `win_set_input` 输入框预填。`registry.addDrap('docedit', ...)` + dock 图标 + AppMgr，从桌面/dock 启动。
- **两个关键 bug 修复**：
  - `substr` 代码生成寄存器分配缺陷：`start` 放进 `r1` 后求值 `len` 表达式（`col-1`）会覆盖 `r1`，导致退格删末尾字符错误（`World`→`orld`）。修复：求值 `args[2]` 前先把 `src`/`start` 压栈保护。
  - DBYTE 打包漏掉 `LEN` 指令（`len()` 运行期分发，按堆对象 `__type` 区分字符串/数组长度）：补 `LEN:49`，使含 `len()` 的程序可预编译/往返。
- 验证：test_docedit.mjs 10 项全绿（退格→"Worl"、保存内容 `Hello\nWorl`、打开后重渲染）；test_diag.mjs / test_struct.mjs 全绿。

### L7：C·SDK 脚手架 / D·自举深化 / E·GUI 体验（项目 2.2.0）
- **D·自举深化**：把 `设置 / 废纸篓 / 此电脑` 三个 JS 宿主应用改写为真正的 DrapLang `.app`（`System/Apps/Settings.app`、`Trash.app`、`ThisPC.app`），`gui.js` 改为 `registry.addDrap` 注册、下线 JS 版本；Finder 的删除仍走 `moveToTrash` 等 VFS 辅助（保留）。
  - 新增 syscalls（表驱动，无需动 VM 指令集）：`win_theme(slot)` 主题语义色（0=背景 1=前景 2=强调 3=工具栏 4=选中，双主题内容级适配）、`win_set_theme(name)`（经宿主钩子转 `wm.setTheme`）、`win_open_finder(path)`（转 `wm.openFinderAt`）、`win_set_softkeyboard(on)`；并修复既有 `0x50` 冲突（`time_now` 与 `win_mono` 争用同一 opcode，现 `win_mono` 改 `0x56`、`time_now` 保持 `0x50`）。
- **E·GUI 体验**：桌面图标层（`renderDesktopIcons` + `hitDesktopIcon`，点击启动应用）、窗口吸附（`snapWindow`：左/右边缘→半屏、顶部→最大化）、双主题内容级适配（DocEdit/Settings/Trash/ThisPC 用 `win_theme` 读语义色，自动适配 macOS/Windows）。
- **C·SDK 脚手架**：`System/Apps/_template.app` 规范化模板（事件驱动 + 主题感知 + 占位符）、`tools/mkapp.mjs` 生成器（`node tools/mkapp.mjs <id> [name] [--title ...] [--stdlib]`，替换占位符、可选注入并复制 `System/Lib/stdlib.drapp` 共享标准库、编译校验）、`System/Lib/stdlib.drapp` 共享库（clamp/max2/min2/sign/abs 等纯函数，应用 `import "stdlib"` 复用）。
- **编译器关键修复**：`genReturn` 在 event handler 内的 `return` 原先一律跳到合成 main 结尾、退出整个事件循环（导致 handler 末尾 `return 0` 后窗口不再响应后续事件）；现改为非 `on_close` 的 handler `return` 回到事件循环继续、`on_close` 的 `return` 才退出应用。此修复让 DrapLang 的 GUI 应用能正常连续处理多事件（Settings/Trash/ThisPC 的多轮交互依赖它）。
- 验证：test_drapps.mjs 13 项全绿（Settings 主题切换/软键盘、Trash 还原/清空、ThisPC 打开 Finder）；test_sdk.mjs 6 项全绿（mkapp 生成 + 编译）；全套 26 个测试文件回归无回归。

### L8：窗口缩放 + macOS 风格菜单栏（项目 2.3.0）
- **窗口缩放**（drapog.wm.js）：窗口四边 + 四角 6px 热区（`hitResize` 返回 n/s/e/w/ne/nw/se/sw），按下记录基准几何（`dragState.mode='resize'` + `orig`），拖动期间 `applyResize` 按方向实时计算：
  - 最小尺寸钳制 280×160（`RESIZE_MIN_W/H`）；北缘不越过菜单栏（`workArea().top`），东/南缘不越过屏幕；西/北缩放时对侧边缘固定。
  - 最大化窗口 `hitResize` 直接返回 null（不可缩放）。
  - 光标随方向变化：`ns-resize`/`ew-resize`/`nwse-resize`/`nesw-resize`（`getCursor` 在 `hitButton` 之后、`hitTitleBar` 之前判定，北缘 6px 优先于拖动）。
  - 事件模型重构：`dragState` 增加 `mode`（'move'/'resize'），双击标题栏最大化与拖拽吸附（`snapWindow`）均只在 `mode='move'` 时触发，缩放结束不吸附。
- **macOS 风格菜单栏**（`renderMenuBar` 重写 + `menuBarLayout`）：对齐真实 macOS 顶栏布局——
  - 左侧：`` Apple 标志（点击仍弹主菜单）→ 焦点应用名加粗（无焦点窗口显示「访达」）→ 应用菜单项（文件/编辑/显示/前往/窗口/帮助，装饰性，间距按 `measureText` 排布）。
  - 右侧（从右到左）：时间 `HH:MM` → 日期 `10月21日 周三` → 软键盘切换按钮（`kbButtonRect` 移至 `W-210, w=36`，点击切软键盘行为不变）→ WiFi 图标（`drawWifiIcon` 两段弧+圆点）→ 电池图标（`drawBattery`，80% 示意电量，<20% 变红）。
  - 底色由 `rgba(0,0,0,0.35)` 调为 `rgba(15,15,20,0.45)`。
- 验证：新增 test_wm.mjs 24 项全绿（8 方向缩放/最小尺寸钳制/菜单栏与屏幕边界钳制/最大化禁缩放/光标反馈/拖动+吸附回归/菜单栏布局与渲染冒烟）；全套 27 个测试文件回归无回归。

### L9：设置应用 macOS 风格改版（项目 2.3.1）
- **Settings.app 重写**（`System/Apps/Settings.app/main.drapp`，窗口 560×440）：侧栏仿 macOS 系统设置——10 个分类（Wi-Fi/蓝牙/网络/电池/通用/外观/显示器/桌面与程序坞/账户/关于），每项彩色图标块（`win_set_color` 色板数组）+ emoji 图标 + 名称，选中项用 `win_theme(4)` 高亮条；侧栏点击按 `(y-12)/30` 整除映射分类，越界钳制。
- **主题项统一归入「外观」**：原「个性化」分类撤销，系统主题切换（macos/windows 按钮 + `win_set_theme`）移入「外观」页；「通用」保留软键盘开关（`win_set_softkeyboard`）；内容区带卡片描边（`win_stroke_rect` + `win_theme(3)`）与副标题说明；未实现分类显示「此设置项暂未开放」占位；默认落在「外观」页。
- 验证：test_drapps.mjs 增至 15 项全绿（侧栏含「外观」「Wi-Fi」、默认显示「系统主题」、主题切换/软键盘回归）；全套 13 个测试文件回归无回归。

### 关键修复（L3/L4 期间）
- registry 导入路径 `./launcher.js` → `./drapog.launcher.js`（原先会 `ERR_MODULE_NOT_FOUND`）。
- cmd.js 顶层 `await registry.scan(...)` 置于非 async 流程导致 `SyntaxError` → 改 fire-and-forget `registry.scan(...).catch(()=>{})`。
- VFS（drapog.vfs.js 0.3.1）MemoryBackend 的 `write`/`writeBytes` 原先不会自动创建缺失的父目录（FSAccessBackend 会），导致内存模式下写嵌套路径静默失败、scan 因 `System/Apps` 不存在提前返回；现写入前自动 `_mkdir` 父目录，与 FSAccess 行为一致。

### 验证
- test_registry.mjs 16 项全绿：scan 发现 cli/gui 型 .app、必填字段校验跳过、元数据入库、register/unregister、launch host/gui/cli 三分支、无 wm 提示、未知 id 报错、dbyte 预编译入口。
- test_modules.mjs 8 项全绿（文件级模块）。
- test_l4.mjs 20 项全绿：scan 采元数据、CLI 运行、dbyte 入口（验证 BUILTIN 序列化）、shell 的 pack/apps/info/install/uninstall。
- test_api.mjs 接口完整性验证全绿：fs_append/fs_copy/fs_move/fs_size/fs_isdir、time_format/time_sleep、itoa/replace/join/charAt/sin/cos/log/exp、argv 全链路（退出码 42 + 参数透传）。
- 全套 27 个测试文件（含 l6/l7/sdk 等）全绿，无回归。

### L10：项目整理 + 遗留 bug 修复（项目 2.3.2）
- **目录整理（用户授权重构）**：根目录散落的引擎源码与 27 个测试统一归类，避免与 System/ 应用目录混杂。
  - 引擎核心源码（drapas/drapcc/drapdis/drapog.*.js 共 14 个）移入 `src/`，内部 `./` 互相引用不变；外部引用点（System/Boot/gui.js、cmd.js、System/BIOS/settings.js、menu.js、tools/mkapp.mjs）改为 `../src/`（BIOS 层深一级用 `../../src/`）。
  - 27 个 `test_*.mjs` 移入 `tests/`，引擎 import 改为 `../src/`；文件相对读取（`import.meta.url`）校准到 `../examples/`（app_gui/app_paint）与 `../Users/`；新增 `tools/run-tests.mjs` 统一运行器（从根目录跑，保证 `System/` 相对读取有效）。
  - 设计文档（`CONTEXT.md`/`B6-B7 构思.md`/`DECISION-位宽.md`/`DrapLang规范.md`/`tell you.md`/`struct.txt`）移入 `docs/`。
  - 已下线的 `app_gui.drapp`/`app_paint.drapp` 移入 `examples/`（仅供 test_gui/test_paint）。
  - `package.json` 版本 0.2.0 → 2.3.1，加 `test`/`serve` 脚本；删除 `_dev/` 下 0 字节废 `favicon.ico`。
  - 无损往返硬约束校验：全套 27 测试仍全绿（含 test_conv/test_struct/test_b7 往返）。
- **P1-1（drapas 漏 `\0`）**：`drapas.js` 的 `unescape` 补 `e==='0' ? '\0'`，与 `drapcc.js` 双引号字符串路径（已支持 `\0`）对齐，消除汇编/编译的字节分叉。
- **P2-3（启动硬开两窗口）**：`System/Boot/gui.js` 去掉调试期同时开 Terminal 的便利，正式启动只开 Finder，Terminal 从 Dock 启动。
- 未动：P0-1 位宽（按 `DECISION-位宽.md` 搁置）、P2-2 BIOS DPR（用户未选）、P1-2 文档不符（按交接清单先报告不擅改）。
- 验证：全套 27 个测试文件（`npm test`）全绿，无回归。

### L10.1：入口 import 深度回归修复 + 静态 import 校验（项目 2.3.2，已推送）
- **触发**：L10 整理后 GitHub Pages 线上白屏，控制台报 `Failed to fetch dynamically imported module`（两张截图确认）。根因：`System/Boot/gui.js`/`cmd.js` 引擎 import 在 L10 改写时写成 `'../src/'`，而 Boot 层相对仓库根需 `'../../src/'`（少一层），导致线上 404；单测盲区（27 个测试全 mock 引擎、从不加载 `Boot/gui.js`/`cmd.js` 入口）使该错误漏过全绿回归。
- **修复**：`System/Boot/gui.js`、`System/Boot/cmd.js` 各 7 处 `'../src/'` → `'../../src/'`；`System/BIOS/setup.js` JSDoc `@param {import('../../drapog.vfs.js')...}` 漏改处一并修正。
- **新增 `tools/check-imports.mjs`**：扫描全仓 `.js/.mjs`（排除 `node_modules/.workbuddy/.git/Users`）的静态 `from`、动态 `import()`、副作用 import 相对引用，校验目标文件存在；共校验 132 处。`tools/run-tests.mjs` 第一步即跑该静态校验（失败即中止），补上入口层的回归盲区。
- 验证：27/27 测试全绿 + import 校验 132 处通过。

### 推送工作流（git 协议被封，改走 GitHub API）
- **网络事实**：本机代理按主机名放行——`github.com`（git 协议走它）返回 000（`CONNECT tunnel failed, response 502`，被封死）；`api.github.com` 返回 200，可达。故 `git push`/`git fetch` 全部失败，`git fetch origin` 报 `Empty reply from server`。
- **绕过方案**：`tools/push_api.mjs`（PAT 走 `GITHUB_TOKEN` 环境变量，切勿硬编码入仓）用 GitHub Git Data API（`POST /git/blobs`→`/git/trees`→`/git/commits`→`PATCH /git/refs/heads/main`）合成干净 commit。设计要点：
  - 以 API 实时查询到的远程 main 真实 **tree** 为权威基准（本地 `origin/main` 因 `git fetch` 失败而陈旧）。
  - 安全校验：本地 `origin/main` 的 tree 必须与远程 tree 一致，否则中止（防远程被意外推进导致非快进覆盖）。
  - 推送成功后自动 `git update-ref refs/remotes/origin/main HEAD`，使本地 `origin/main` 与远程同步（其 tree 相同，仅 commit SHA 不同），保证后续 `git diff origin/main` 基准正确。
  - 推荐工作流：先本地 `git commit`（确保 HEAD 含本次改动），再 `GITHUB_TOKEN=xxx DOIT=1 node tools/push_api.mjs`。
- **已推送记录**：L10.1 经 API 推成 `bf053a0`（parent `7355c65`）；推送工具本身随后推成 `88ad9ab`（parent `bf053a0`）。作废了基于 git 协议、定在 21:50 的「重试推送」一次性 automation（注定失败）。
- 注：PAT（`ghp_…`）按用户规则保留至整个项目完成后统一注销。

---
最后更新：2026-10-21　当前版本：2.5.1（工程化-M6 构建/发布流水线）

### 四阶段整理目标（用户确认开工）
用户「开始这四个阶段」，经策略确认**工程化优先**（F 系列）。四阶段锚定（基于真实代码状态，非原构思空想）：
- **阶段一 · 内核语言补强**：标准库分层、编译器诊断、类型/字符串补强（STRCMP 等）、系统调用收口。
- **阶段二 · 办公应用深化**：DocEdit 做厚（打开/保存/选择/撤销）、Calc 可用表格、Finder 导航、应用 DrapLang 化。
- **阶段三 · GUI 体验**：WM 主题 token 化收口、Windows 11 主题、窗口/菜单栏/Dock 打磨。
- **阶段四 · 工程化（当前）**：DrapLD 链接器、DrapDebug 调试器、优化器、构建/发布强化。
工程化优先理由：调试器/链接器/优化器是「杠杆最高」的地基——所有语言/应用/GUI 都用 DrapLang 写，工具先行能让后续三阶段少返工。工程化拆为 6 个里程碑 M1–M6（见任务列表）。

### 工程化-M1：DBYTE 可选调试信息段（向后兼容，已推送）
- **动机**：`.dbyte` 格式当前在仓库内**无任何调用**（运行时是 `.drapp`→`DrapCC`→`{instructions,strings}` 内存直跑，不经序列化）。但文档要求「无损往返」硬约束，且调试器（M3）需要源码行/函数符号。故 M1 同时做两路：
  - **编译期（主交付）**：`drapcc.js` 的 `compile({debug:true})` 在返回里附加 `debug = { source, functions:[{name,start,end}] }`；每条指令本就由 `emit()` 打了 `.line`（VM `run()` 已读 `ins.line`）。默认编译不附加，**产物字节零变化**。
  - **序列化（DBYTE 段）**：`drapog.dbyte.js` 新增 `DEBUG_MAGIC('DBG0')` 调试段，接在字符串段之后（`pack` 仅在 `program.debug` 时追加并整体重算 FNV 校验；`unpack` 尾部见 `DBG0` 则解析并回填 `ins.line`）。段布局：魔数+segVersion+行号表(扁平指令下标→u16 行)+函数表(name/start/end)+源码行表。
- **向后兼容（已验证）**：旧 loader 只读 `instrCount`+`stringCount` 指令/字符串，**天然忽略尾部**；校验码覆盖 `[24,len-24]` 全文件（含调试段），故旧 loader 加载带段 `.dbyte` 也不报 checksum 错误。M1 测试明确断言：带段文件的「头部 [0,20)」与「指令/字符串区 [24,len)」字节与无段版**逐字节相同**，仅 4 字节校验码因覆盖尾部而更新。
- **无损往返（已验证）**：默认 `pack` 路径字节完全不变；带段 `pack→unpack` 行号全部回填一致、source/函数一致。
- 验证：新增 `tests/test_dbyte.mjs`（20 项）全绿；全套 28 个测试文件（`npm test`）全绿，import 校验 134 处通过，无回归。

### 工程化-M2：VM 单步/断点支持（可恢复执行，已推送）
- **动机**：M3 调试器需要「暂停/继续/单步 + 可读寄存器/栈/PC」。VM 执行循环是 `run()` 一次性跑完，需加断点与单步且**不影响默认行为**。
- **实现**（`src/drapog.vm.js`）：
  - 抽出 `start()`（入口初始化：定位 main、压虚拟返回地址 -1、建栈底帧、清 curLine/callStack）——**必须是同步方法**，因为 GUI 宿主以「不 await 的 `vm.run()`」启动并依赖入口初始化在首个 `await`（首个 `win_get_event` 系统调用）前同步完成（首个 `win_create` 在事件循环之前）。
  - `run()` = `start()` + `await _continue()`（循环体）。`_continue()` 在循环里加断点检查：到达 `breakpoints` 中的 pc 时 `paused=true` 并 `return`（暂停点）；`resume()` 跳过当前 pc 断点一次后继续，避免恢复时立即重触发。
  - `step()`：执行一条「真实」指令（跳过 LABEL）后暂停，step-into 语义（CALL 进入被调函数）。
  - 断点管理：`setBreakpoint(pc)/clearBreakpoint(pc)/clearBreakpoints()`；`snapshot()` 暴露 `{pc,regs,curLine,halted,paused,stopReason,stopPc,callStack,breakpoints}` 供调试器 inspect。
  - 校验码/无损往返不受影响（仅 VM 行为层改动）。
- **兼容性坑（已踩）**：首次实现把 `start()` 写成 `async`，导致 `await this.start()` 让 `run()` 在任何指令执行前挂起，破坏 GUI 宿主「fire-and-forget `vm.run()`」的同步前缀约定，`test_docedit`/`test_drapps` 报 `win` 为 null。改回同步 `start()` 后两测试恢复全绿。
- 验证：新增 `tests/test_vmdebug.mjs`（13 项）全绿；全套 29 个测试文件（`npm test`）全绿，无回归。
- 注：VM 的 `pc` 是「含 LABEL」的下标（LABEL 作为 no-op 指令占据位置），调试器行→pc 映射直接扫 `instructions[i].line` 即可，与实际执行一致。

### 工程化-M3：DrapDebug CLI 调试器（已推送）
- **动机**：M1（编译期 debug 信息）+ M2（VM 单步/断点）落地后，缺一个「能用」的前端。M3 提供无界面核心 `src/drapdebug.js` + CLI `tools/drapdebug.mjs`，让任何 DrapLang 程序可被行级调试。
- **实现**（`src/drapdebug.js`）：
  - 构造时编译（`debug:true`）并建索引：`lineToPcs`（源码行→真实指令 pc 列表）、`fnLocals`（函数名→局部变量 `{name,offset,type}`）、`sourceLines`。
  - **行断点只落在该行首个真实指令 pc**（关键修正：最初给整行每条指令都打点，导致 `cont` 跨过一个 pc 又被同行下一个 pc 拦住、循环不前进；改为 `Math.min(...pcs)` 单一落点）。
  - 执行控制：`run()`（首跑）、`cont()`（从断点继续，跳过当前 pc 一次）、`step()`（单步一条真实指令，step-into）。调试器维护 `this.status`（loaded→paused→running→halted）门控——**最初漏初始化 `status` 导致 `cont()` 因 `status!=='paused'` 直接 no-op、断点不二次命中**；新增 `_syncStatus()` 在每次执行控制后按 VM 实态同步。
  - 检查：`inspectLocals()`（按 FP+offset 读当前栈帧局部变量，`_valueToString` 区分 int/str 指针）、`listSource()`（断点 `●` + 当前行 `→` 上下文）、`print()`（支持 `r0..r7` 与局部变量名）、`registers()`、`currentFunction()`（取 callStack 顶）。
- **CLI**（`tools/drapdebug.mjs`）：交互式 REPL（readline，支持管道输入），命令 `b/break del/clear r/run c/cont s/step l/list p/print info regs bt/q`。注入极简 `DrapSYS` 宿主（console 输出 + 内存 VFS）使带系统调用的真实程序也能调试。
- 验证：新增 `tests/test_drapdebug.mjs`（7 组 26 项）全绿，含循环断点多次命中（sum 0→1→3、i 0→1→2、t 1→2→3、返回值 6）、嵌套函数调用栈与帧内局部变量（add 帧 a=3,b=4,r=7）；全套 30 个测试文件（`npm test`）全绿，import 校验 134 处通过，无回归。

### 工程化-M4：DrapLD 链接器 + .dbyte 运行器（已推送）
- **动机**：现有 module 机制是「编译期内联」（`DrapCC(source,{modules})` 把模块源码并入一起编译），尚无独立链接步骤；且 `.dbyte` 格式在仓库内**无加载入口**（dead format）。M4 让 `.dbyte` 成为真正可分发格式：把多模块源链接成单一 `.dbyte`，并提供加载运行器。
- **关键发现（修复前）**：`.dbyte` 的 `pack` 把 LABEL 全部压成扁平下标、`unpack` 不再还原 LABEL，`_label()` 已支持 `@N` 数字下标（`name.startsWith('@')` → 返回该整数作 PC），故带 CALL/JMP 的程序 unpack 后可直接被 VM 运行——格式本身可执行，缺的是加载入口。实测 `编译→pack→unpack→VM` 闭环（add(square(3),square(4))=25）通过。
- **链接器 `tools/drapld.mjs`**：`node tools/drapld.mjs main.drap -m utils.drap -m helper=./h.drap -o out.dbyte`。读取主程序 + 各模块源（模块名默认取文件名 stem，或 `name=path` 显式指定），复用 `DrapCC` 的 files 级 import 机制编译成单一 program，再 `pack` 成 `.dbyte`（带 debug 段）。是面向分发的「链接」步骤。
- **运行器 `tools/run_dbyte.mjs`**：加载 `.dbyte`（`unpack` 校验），挂载极简 `DrapSYS`（stdout 输出 + 内存 VFS），运行并打印程序输出与退出码。**坑（已修）**：`term_print` 的 `onOutput` 传的是「累计全串」（宿主应幂等替换），运行器初版每次 `write(s)` 全量写出导致输出重复（如 "2525 done"）；改为只写相对上次新增的增量后正常（"25 done"）。
- 验证：新增 `tests/test_drapld.mjs`（5 组）全绿，覆盖 `.dbyte` 往返运行行为与内存一致、嵌套模块 import 链接运行（mid=leaf+10=17）、CLI 端到端（drapld 产文件 + run_dbyte 运行）、缺失模块引用编译期报错；全套 31 个测试文件（`npm test`）全绿，import 校验 134 处通过，无回归。

### 工程化-M5：优化器（常量折叠 + 死代码消除，已推送）
- **动机**：编译器当前是「栈式求值 + 朴素代码生成」（`LI r0,c; PUSH r0; ...; POP r0; ALU` 模式，常量被压到操作数栈），产物里有明显可优化空间（常量算术、被立即覆盖的死 `LI`）。M5 提供一个**纯 IR 变换**优化器，不改 VM、不改变程序可观察行为——为后续「工程化收口 + 发布」提供体积/性能优化的地基，并验证「优化前后运行输出逐字节一致」这一硬约束。
- **实现**（`src/drapopt.js`，新文件；导出 `foldConstants/eliminateDeadLoads/optimize/stats`）：
  - **常量折叠 `foldConstants`**：栈感知的全局常量传播。除寄存器 `known{r0..r7}` 外，额外维护与运行时操作数栈平行的 `constStack[]`（元素为常量值或 null 未知），因为编译器把常量压栈参与 ALU。处理的指令：`LI`（记 known）、`MOV`（搬运已知值）、`PUSH`（压栈）、`POP`（出栈回填 known）、`ADD/SUB/.../NE`（操作数均已知则就地折叠成 `LI`，值经 `fold()` 求值）、`CALL/SYSCALL`（保守清空 known + constStack，避免经 ABI 误折叠）。`fold()` 语义与 VM 一致：`ADD/SUB` 普通算术、`MUL` 用 `Math.imul`（溢出语义）、`DIV/MOD` 除数为 0 返回 null 不折叠（保留运行期语义）、比较返回 0/1。
  - **死代码消除 `eliminateDeadLoads`**：移除「在首次被读取前即被覆盖」的 `LI`（前向扫描，遇该 reg 被读则 live，被覆盖则死，遇 LABEL/不相关指令则继续）。`readsReg/writesReg` 对 `CALL/SYSCALL/RET/HLT/PRINT*` 保守视为读写全部 r0..r7（宁可少删）。
  - **组合 `optimize`**：`foldConstants → eliminateDeadLoads → eliminateDeadLoads`（消除后可能暴露新的连续死 LI，故二次扫描）。
  - **CLI `tools/drapopt.mjs`**：`node tools/drapopt.mjs src.drap [-o out.dbyte]`，编译并施加 `optimize`，报告优化前后指令数，可选导出 `.dbyte`。
- **三个 bug（已修，均为语义保持类）**：
  1. 初版留了一个从未被调用的 `FOLDABLE` 占位对象，清理掉，改为真正靠 `fold()` 求值。
  2. `fold()` 的 `ADD` 误用 `Math.imul`（导致 `2+3` 被算成 6）；修正为 `a + b`（仅 `MUL` 用 `Math.imul`，与 VM 一致）。
  3. `writesReg` 对 `LOADL offset, rX` 取错参数（原取 `args[0]` 即 offset），导致 `known[r0]` 未被清除、栈模型残留 stale 值，污染后续 `c=a+b`（算成 8 而非 15）；修正为 `case 'LOADL': add(args[1])`。定位时临时用 `DBGOPT=1` 调试日志，已移除。
- **验证**：新增 `tests/test_opt.mjs`（6 用例）全绿：① 语义保持（优化前后 `term_print` 输出逐字节一致）；② `.dbyte` 往返 + 优化运行一致；③ 优化幂等（再跑一次无变化）；④ 含 `CALL` 的程序安全（CALL 后常量未知不被误折叠）；⑤ 死 LI 消除（被覆盖的 `LI r0` 被删）；⑥ 含 `LOADL` 局部变量的程序正确（`c=a+b`=15）。全套 32 个测试文件（`npm test`）全绿，import 校验 134 处通过，无回归。指令数未显著下降属预期：编译器栈式求值需 PUSH/POP 维持栈平衡，死常量不能随意删，优化器采取保守安全策略。

### 工程化-M6：构建/发布流水线强化（已推送）
- **动机**：工程化前五个里程碑（M1–M5）各自独立，`npm test` 虽已含「全量测试 + 静态 import 校验」，但缺少两件把关：（1）**全语料无损往返**——项目硬约束「.drap → .dbyte 字节一致」此前只零散验证，未对仓库内全部 .drapp 应用做覆盖；（2）**GitHub Pages 发布前资产/路径校验**——曾因 `System/Boot/gui.js` 的 `'../src/'` 深度错误导致线上白屏，发布前无自动化兜底。M6 把校验串成一条 `build` 命令，并补一个版本号提升脚本。
- **交付物**：
  - **`tests/test_examples.mjs`（新）**：遍历仓库内所有真实可编译 .drapp（examples/、System/Apps 各 app 的 main.drapp、Users/guest，排除 `_template.app` 占位模板），对每个源做「编译 → pack → unpack → pack」断言两次 pack 字节完全一致，并比对去 LABEL 后的真实指令数、字符串表。覆盖 18 个源文件，把无损往返硬约束扩展到整个应用语料库，纳入 `npm test` 常规回归。编译时自动收集同目录兄弟 .drapp 作为模块源（Calc/Conv 的 `calcutil`/`baseconv`）喂给 `DrapCC`。
  - **`tools/bump-version.mjs`（新）**：统一提升版本号，保持 `package.json` 与 `docs/CONTEXT.md` 的「当前版本」一致。支持显式版本（`node tools/bump-version.mjs 2.5.0`）或 `--major/--minor/--patch`（默认 patch）。仅更新两个权威版本位；源码内 `@version` 按改动内容手动维护。
  - **`tools/build.mjs`（新）**：统一构建/发布校验流水线，依序：① `tools/check-imports.mjs`（全仓相对 import 解析）；② `tools/run-tests.mjs`（全部 test_*.mjs，已含 test_examples 全语料往返）；③ **Pages 发布前资产/路径校验**（解析根 `index.html` 是否指向 `_dev/`、解析 `_dev/index.html` 内 `<script src>`/`<link href>` 相对引用并校验文件存在、校验引擎入口 `System/BIOS/bios.js` 存在）。任一环节失败即非零退出，可作为 CI / 发布前把关。`package.json` 新增 `"build"`/`"bump"` 脚本。
- **M6 顺带修复的两处 DBYTE/编译器不一致（保证 test_examples 能真正往返）**：
  1. **pack 不识别 `@N` 数字下标**：`unpack` 把 LABEL 压成扁平下标后以 `@N` 形式回填跳转目标，但 `pack` 的 `encodeArg` 只认具名标签 → 重新打包报「未知标签: @N」。已让 `encodeArg` 在 `l` 规格下接受 `@N` 直接返回该整数，使 `pack(unpack(pack(p)))` 字节一致（无损往返硬约束）。
  2. **pack 忽略 `program.entry`**：`unpack` 丢弃 LABEL 且只携带数值 `entry`，而 `pack` 用 `labelToIndex.get('main')` 重算入口（丢失 → 退回 0），导致 re-pack 入口字段变化、字节不一致。已让 `pack` 优先采用 `program.entry` 数值入口。
  3. **`ARRSET` 参数规格与编译器不一致（真实 bug）**：`ARG_SPEC` 把 `ARRSET` 下标声明为立即数 `i`（`['r','i','r']`），但编译器在数组元素赋值（`a[i]=v`）处发出**寄存器**下标（`ARRSET r7, r1, r0`），导致 `pack` 报「非法立即数: r1」——DocEdit 等含数组赋值的应用此前**无法被序列化成 .dbyte**（预编译/分发路径会崩）。VM 的 `opnd()` 本就同时接受寄存器与立即数下标，故将 `ARRSET` 规格修正为 `['r','r','r']`，并同步修正 `genArrayLit`（数组字面量原先发立即数下标）改为「`PUSH r0` 暂存元素值 → `LI r1, i` → `POP r0` → `ARRSET r7, r1, r0`」，使所有 `ARRSET` 下标统一为寄存器。该修正让「含数组的程序可预编译为 .dbyte」成为现实，是 M4「.dbyte 分发格式」的必要补全。
- **验证**：`node tools/build.mjs` 三步全过（import 校验 134 处、33 个测试全绿含 18 源文件无损往返、Pages 资产校验通过）。全套 33 个测试文件（`npm test`）全绿，无回归（含 test_draplang/test_struct/test_docedit/test_tools 等数组相关用例）。版本经 `bump-version --minor` 提升至 2.5.0，package.json 与 CONTEXT.md 一致。

### GUI 体验-1：BOIS 偏好设置持久化（已推送）
- **用户报的 bug**：「bois 偏好设置没有保存在仓库里」——`System/BIOS/`（DrapOG 的 BIOS/系统设置层）里，系统设置 App（`Settings.app`）切 macOS/Windows 主题、开关软键盘，只改运行时状态，**从头到尾没读也没写任何存储**；关掉重开、刷新页面，主题就回到默认 macOS。模型层 `settings.js` 的 `DEFAULT_SETTINGS` 也压根没有 `theme` 字段；GUI 启动流程（`bios→menu→gui`）也没把主题偏好传给 GUI。再加 GUI 启动新建的是**内存 VFS**、根本没挂载项目磁盘，即使写了 `bios.json` 也到不了项目文件。
- **根因**：UI 偏好（主题/软键盘）从未被建模、从未被持久化、GUI 启动也未应用任何偏好。
- **修复（全链路）**：
  1. **模型+持久化层 `System/BIOS/settings.js`**：`DEFAULT_SETTINGS` 新增 `theme('macos'|'windows')` 与 `softKeyboard(bool)`；`normalizeSettings` 处理二者；`loadSettings` 在「项目文件读不到」时回退 **IndexedDB**（`bios_prefs` 键），`saveSettings` 在写项目文件之外**兜底写 IndexedDB**（即使不挂载项目磁盘，刷新也能恢复）。向后兼容：旧 seed 无 `theme` 字段不报错。
  2. **WM 偏好存取 `src/drapog.wm.js`**：新增 `async loadPrefs()`（从 IndexedDB 读 `theme/softKeyboard` 并应用：`setTheme` + 设 `softKeyboard.open`）与 `savePrefs()`（写 IndexedDB）。`win_set_theme` / `win_set_softkeyboard` 切换时自动触发 `savePrefs()`。
  3. **系统调用与桥接**：`drapcc.js` 的 `SYS_TABLE` 与参数计数表登记 `win_get_theme(0x5b)`（返回 0=macos 1=windows）与 `win_get_softkeyboard(0x5c)`；`drapog.sys.js` 实现两者并通过新钩子 `onGetThemeName`/`onGetSoftKeyboard` 取宿主状态；`drapog.launcher.js` 在 `onSetTheme`/`onSetSoftKeyboard` 里调用 `wm.savePrefs()` 并暴露 `onGetThemeName`/`onGetSoftKeyboard` 给 `win_get_theme/softkeyboard`。
  4. **GUI 启动应用偏好 + Settings.app 读取当前主题**：`System/Boot/gui.js` 把屏幕初始化、`new WindowManager` 与 `await wm.loadPrefs()` 提到 `new Promise` 之前，确保偏好在首个窗口创建前已生效（原 `wm.loadPrefs()` 未 await 且包在同步执行器里，等于没生效）；`System/Apps/Settings.app/main.drapp` 启动用 `syscall win_get_theme()` / `win_get_softkeyboard()` 读取已保存状态以正确高亮/显示。
- **验证**：`tests/test_bios.mjs` 新增第 6 节覆盖 `theme/softKeyboard` 字段（normalize 接受/拒绝、项目文件 load/save 往返携带、旧 seed 向后兼容），`npm test` 33 项全绿；`npm run build` 全过。

### GUI 体验-2：桌面/坞/开始菜单/AppMgr 采用 emoji 图标（已推送）
- **动机**：此前 WM 所有图标（桌面、`dock`、Windows 开始菜单、AppManager 网格、窗口标题）统一用 `appIcon(id)` 生成的 2 字母 monogram（Fi/Te/Ca/He…）。但 `System/Boot/gui.js` 注册应用时其实传了 macOS 风格 emoji 图标（📁 Finder、🧮 Calc、📝 DocEdit、⚙ 设置、🗑 废纸篓、💻 此电脑、🔟 Conv、◆ AppMgr），却被 `AppRegistry` 三处 `addHost/addDrap/addDrapVfs` 用 `appIcon(id)` 覆盖丢掉。monogram 辨识度低、不像真系统。
- **修复**：`drapog.registry.js` 的 `addHost/addDrap/addDrapVfs` 改为**保留传入的 `icon`**（emoji），仅在未传时退化用 `appIcon(id)`；`drapog.wm.js` 新增 `appGlyph(id, letter)`：渲染时优先取 registry 里**含非 ASCII 字符的图标**（emoji / ◆ 等），否则退回两字母 monogram。桌面图标、坞、`renderStartMenu`、AppManager 网格四处渲染统一改用 `appGlyph` 并随图标类型切换字号（emoji 用大字号 + `"Apple Color Emoji"` 字体回退）。窗口标题栏沿用 monogram 不受影响。纯渲染改动，无 ABI/逻辑变化。
- **验证**：`npm test` 33 项全绿（含 `test_wm.mjs`）；`npm run build` 全过；`node --check` 语法通过。提交前已确认 emoji 在 canvas 走系统 emoji 字体渲染，刷新即生效、无需重编译。

### GUI 体验-3：app 包内手绘 macOS 风格图标（icon.json + drawAppIcon）
- **动机**：用户明确否决 emoji 方案——「emoji 太乱，没法快速表现 app 功能」。改用**每个 app 包内自描述的手绘图标规格** `icon.json`（归一化 0–100 坐标 + 垂直渐变底），由 WM 统一画 macOS squircle（圆角方形 + 渐变 + 顶部玻璃高光 + 白色象形图形），视觉与参考截图一致、辨识度高、纯渲染无 ABI 变化、易回退。
- **规格格式**：`{ "bg": ["#顶色","#底色"], "fg": [ 图形指令... ] }`。图形指令：`r` 圆角矩形 / `c` 圆 / `l` 线段 / `p` 多边形 / `t` 文字，坐标全部 0–100 再乘 `size/100`。
- **落地**：
  - `drapog.wm.js`：新增 `drawAppIcon(id,x,y,size,dim)`（有规格画 squircle 返回 true，无规格返回 false 让调用方退回旧字母渲染）+ `iconSpecOf(id)`（从 registry 取 `rec.iconSpec`）；桌面图标、坞、开始菜单、AppMgr 网格、AppMgr 窗口、坞 minis 共 6 处渲染改用 `drawAppIcon`，加载完成前退回字母。
  - `drapog.registry.js`：`addHost/addDrap` 接受 `iconSpec`；`scan()` 从 `.app` 包读 `icon.json` 存入 `rec.iconSpec`（不再覆盖成 monogram 字母）。
  - `System/Boot/gui.js`：内建 host 应用（finder/terminal/edit/about/appmgr）内联 `iconSpec`；内存模式下对 `hello/calc/conv/docedit/settings/trash/thispc` 异步 `fetch` 各自 `icon.json`（挂载模式由 `scan` 读取）；画布每帧重绘，加载后自动生效。
  - 16 个 `.app` 包新增 `icon.json`：GUI 应用（Calc 计算器网格 / Conv 进制方块 / DocEdit 文档线条 / Settings 齿轮 / Trash 垃圾桶 / ThisPC 显示器）+ CLI 工具（Cat/Grep/Head/Ls/Sub/Tail/Tree/Wc 统一「终端暗底 + 命令名 + 强调色条」）+ Hello（绿底 `>_`）+ `_template`（灰问号）。
- **验证**：`node --check` 四个文件语法通过；`npm test` 33/33 全绿；`npm run build` 全过（Pages 资产校验通过）；16 个 icon.json 均为合法 JSON。

### GUI 体验-4：整体质感对标 CSPS 模拟器（景深/标题栏渐变/图标选中反馈）
- **动机**：用户对比同机另一个项目「CSPS 模拟器」（CSP-S 复赛仿真，Web 应用，生产级视觉语言）后指出：DrapOG 手绘图标不错，但**整体「像真软件」的质感**仍不如它——差距不是 emoji（已弃用），而是：①窗口标题栏是纯平色块（CSPS 用细竖向渐变）；②桌面图标无任何选中/悬停反馈（CSPS 有半透明高亮框+边框+hover）；③窗口边框发虚、缺内高光；④坞/面板缺玻璃高光。
- **落地**（`drapog.wm.js`，均纯渲染/轻交互，无 ABI 变化）：
  - 窗口标题栏：`renderWindow` 由纯平色改为**细竖向渐变**（聚焦顶亮底暗，失焦略暗）+ 顶边 1px 内高光；边框 0.5px→1px 更实，增强景深。
  - 桌面图标：`renderDesktopIcons` 增**选中/悬停高亮框**（选中=蓝调半透明+边框，悬停=白调半透明）；`onMouseMove` 无拖拽时更新 `hoverDesktopIconId`；`onMouseDown` 改「单击选中、双击启动」（仿真实 OS，同时清掉点空白取消选中）。
  - 坞：`renderDock` 边框 0.5px→1px + 顶部 1px 内高光，玻璃质感更明显。
  - 新增 WM 状态：`hoverDesktopIconId` / `selectedDesktopIconId` / `_lastDeskClick`。
- **验证**：`node --check` 通过；`npm test` 33/33；`npm run build` 全过。

---

最后更新：2026-10-22　当前版本：2.5.1（GUI 体验：BOIS 偏好持久化 + 手绘图标 + 整体质感对标 CSPS）
