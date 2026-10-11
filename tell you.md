# DrapOG —— AI 接手须知（务必先读完）

> 本文件由一位已经通读过 DrapOG 全部源码的 AI 撰写，用于**警告下一个 AI 不要踩同样的坑**。
> 请在动手改任何代码之前，先把本文件从头到尾读完。

---

## 〇、给你（AI）的叮嘱

1. **这是一个"作品"，不是"产品"。** 项目主人不是在找一个更快的 Python，他在做一整套自包含的计算系统（BIOS→Boot→VM→Compiler→Shell→GUI）。不要用"这不如用 X 语言"来劝他，那没有意义。你的角色是**修 bug、补一致性、推进路线图**，不是评审"要不要做"。

2. **不要重写，不要"顺手重构"。** 主人明确要求：**永远整段替换，不要"在某行下面加一行"**。定位容易出错。给代码时把整个文件贴全。

3. **一次给一批功能，不要零碎。** 不要每个小改动都单独测一遍。一批一起给，一起测。

4. **遵守代码约定**（CONTEXT.md 第十节）：
   - ES Module，`import`/`export`
   - 文件头 JSDoc：`@file @module @summary @version`
   - 缩进 2 空格，单引号，分号结尾，不用 `var`
   - 类名 PascalCase，函数/变量 camelCase，常量 UPPER_SNAKE_CASE，私有方法 `_` 开头

5. **文档和实现已经分叉了。** CONTEXT.md 里写的"64 位"、"f0-f7 浮点寄存器"、"INT 0x81 事件"、"i64 时间戳"等**现在都还没实现**。改代码前先 `grep` 一遍确认，不要相信文档字面。

6. **改动涉及跨文件时，先列出所有要改的文件。** 例如"改 VM 指令集"必然连带改：`drapog.dbyte.js`（OPCODE/ARG_SPEC）、`drapog.vm.js`、`drapcc.js`（代码生成）、`drapdis.js`（反汇编）、CONTEXT.md。漏一个就字节不一致。

7. **改完必须验证无损往返**：`.drap → cc → .dbyte → dis → .dasm → asm → .dbyte` 字节一致。这是这个项目的硬约束。

8. **不要在没被要求时修改 CONTEXT.md 的"已确认的设计决策"**。那些是主人拍板过的。发现文档和实现不符，先报告，别自作主张改设计。

---

## 一、项目现状速览

- 起点：浏览器打开 `_dev/index.html`
- 启动链：BIOS（Whetstone）→ POST → 启动菜单 → CMD 或 GUI
- 语言链：DrapLang（.drap）→ DrapCC → 指令数组 → DrapAS/pack → DBYTE（.dbyte）→ DrapVM
- 反链：.dbyte → DrapDis → .dasm → DrapAS → .dbyte
- 系统调用：VM 遇 SYSCALL 指令 → await DrapSYS.dispatch → VFS/Canvas/宿主
- 已完成：见 CONTEXT.md 第十五节，B.1-B.5 全部 ✅
- 下一步应该做的：**不是 B6（事件）**，而是先补字符串索引/切片（理由见第四节）

---

## 二、必须优先修的 Bug（按严重程度）

### 🔴 P0-1：VM 号称 64 位，实际是 32 位截断

**状态：已拍板搁置（2026-10-11）。详见 `DECISION-位宽.md`。**

**现状**：
- `MUL` 用 `Math.imul(...)`，结果截断到 32 位
- 位运算 `& | ^ << >>` 只支持 32 位
- `ADD / SUB / DIV` 用普通 JS Number，2^53 内精确，超界静默丢精度
- 立即数在 `drapog.dbyte.js` 的 `encodeArg` 里只有 16 位
- 栈/堆是 JS 数组，没有 8 字节对齐概念
- 浮点寄存器 f0-f7 不存在

**决策**：当前**不做**位宽扩展（B：实现层双 32 / C：指令集层双字），也**暂不改** CONTEXT.md 的"64 位"表述。理由：B7 自举的瓶颈是字符串能力，与位宽无关；推迟做反而更便宜。

**⚠️ 不要动这一块。** 除非主人明确要求，不要修 `MUL`、不要改位运算、不要改文档里的"64 位"。将来重新评估的触发条件写在 `DECISION-位宽.md` 第四节。

---

### 🔴 P0-2：term_print 双路径行为不一致

**文件**：`drapcc.js`（内置 term_print）+ `drapog.sys.js`（syscall term_print）
**问题**：
- 编译器内置的 `term_print` → `PRINTSTR`/`PRINTINT` → 写 `vm.out`，通过 `vm.onOutput(vm.out)` 回调
- syscall `term_print` → `DrapSYS.term_print` → **直接调 `this.out(s)`，绕过 vm.out**

**影响**：同一次运行里两路输出的缓冲、顺序、`vm.out` 累积值都不一致。`drapog.shell.js`、`drapog.apps.js`、`System/Boot/cmd.js` 里**三处**独立的 `lastLen`/`pending` 拼接逻辑都建立在这个假设上，非常脆。

**建议**：让 `DrapSYS.term_print` 也走 `vm.out += s; vm.onOutput(vm.out)`，只留一条路。抽一个 `makeLineWriter(pushLine)` 工具函数（新增 `drapog.stream.js`），三处共用。

---

### 🔴 P0-3：Shell `_split` 吃引号、不支持转义

**文件**：`drapog.shell.js`
**问题**：
```js
if (c === '"') { inQuote = !inQuote; continue; }
```
引号本身被吞掉，且不支持 `\"`。`echo "a\"b"` 会炸。
**影响**：一旦 `fs_write` 从 Shell 走（比如 `echo "..." > file`），立刻出问题。
**建议**：改成带转义支持的 tokenizer，或直接调用 DrapLang 的词法器（未来自举时统一）。

---

### 🔴 P0-4：VM `maxSteps = 100000000` 太大

**文件**：`drapog.vm.js`
**问题**：死循环要跑一亿步才报错，用户 `load` 一个坏程序浏览器会卡死数秒。
**建议**：降到 `1e6 ~ 1e7`，或在循环里加"每 N 步 await 一次事件循环"，让浏览器有机会响应。

---

### 🟡 P1-1：drapas.js 与 drapcc.js 的 unescape 语义分叉

**文件**：`drapas.js` vs `drapcc.js` 的 tokenizer
**问题**：
- `drapas.js` 的 `unescape` 处理 `\n \t \r \\ \"`，**不处理 `\0`**
- `drapcc.js` 的 tokenizer 处理了 `\0`

**影响**：同一个字符串经汇编和经编译产生不同字节，无损往返承诺被破坏。
**建议**：抽成一个共享模块，两边 import 同一份。

---

### 🟡 P1-2：CONTEXT.md 与实现多处不符

**清单**：

| 文档说 | 实际 |
|---|---|
| 64 位 | 32 位截断 / 53 位精确（已搁置，见 P0-1） |
| f0-f7 浮点寄存器 | VM 里只有 r0-r7，没有 f 寄存器 |
| INT 0x81 事件 | 未实现 |
| time_now 返回 i64 | `SYS_RET` 写的是 i32，实际返回 JS number（秒级） |
| VM 45 条指令（含 SYSCALL/ADDSP） | 对，但 OPCODE 表里 SYSCALL=44、ADDSP=43，需要确认 pack/unpack 有没有漏 |

**建议**：先不改文档，先报告给主人，由他决定是"改文档"还是"改实现"。

---

### 🟡 P1-3：Finder 双击进目录后标题栏不更新

**文件**：`drapog.apps.js`
**问题**：`onDoubleClick` 里 `s.cwd = vfs.normalize(...)` 之后没更新 `win.title`。
**建议**：进目录时同步改 `win.title`，或在 `render` 里动态显示 `s.cwd.split('/').pop()`。

---

### 🟡 P1-4：drapog.wm.js 里的死代码

**文件**：`drapog.wm.js`，`drawIcon` 内：
```js
const runningWin = this.windows.find(w => w.appId === letter);
// 用 app.id 更准，这里不深究
```
**建议**：直接删除。这段没被使用，且注释暴露了未完成意图。

---

### 🟢 P2-1：drapog.apps.js 的 Terminal runDemo 里有旧 API 残留

**文件**：`drapog.apps.js`
**问题**：`runDemo` 里 `push('编译完成，' + program.instructions.length + ' 条指令')`，然后构建 VM。但 `DrapCC.compile()` 的返回格式是 `{ instructions, strings }`，跟 `cmd.js` 里一致。看起来还行，但**注意**：这里没给 `vm.onOutput` 设置增量逻辑（直接全量 push），跟 `cmd.js` 的写法不一致。

**建议**：抽一个 `makeStreamingWriter(push)` 工具函数，三处（cmd.js / apps.js / shell.js）共用，统一增量逻辑。

---

### 🟢 P2-2：bios.js 没考虑 DPR

**文件**：`System/BIOS/bios.js`
**问题**：`screen.width = window.innerWidth` 直接用 CSS 像素，没乘 devicePixelRatio。GUI 模式（gui.js）做了 DPR 处理，BIOS 没有，导致高分屏下 BIOS 画面模糊。
**建议**：BIOS 也走 DPR，或统一抽一个 `resizeCanvas()` 工具。

---

### 🟢 P2-3：gui.js 启动时硬编码开两个窗口

**文件**：`System/Boot/gui.js`
```js
wm.launchApp({ id: 'finder', letter: 'F', title: 'Finder' });
wm.launchApp({ id: 'terminal', letter: '>', title: 'Terminal' });
```
**问题**：这是 v0.1 的调试便利，正式体验应该只开 Finder，Terminal 从 Dock 启动。
**建议**：改为只开 Finder，或读配置。

---

## 三、架构层面需要主人拍板的问题

1. **~~"64 位"这个承诺要不要兑现？~~** ✅ 已拍板：**搁置**。详见 `DECISION-位宽.md`。

2. **浮点寄存器 f0-f7 要不要做？** CONTEXT.md 写了"允许浮点 f32/f64"，但 VM、编译器、dbyte 全链路都没有浮点支持。要做就是大工程。

3. **`syscall fs_read` 返回的配置文本怎么解析？** 没有 `json_parse`、没有字符串索引/切片。现在 demo 只是"把配置文件当纯文本打印"，**真正的配置消费链路是断的**。这是 B7 自举之前最大的洞。

4. **DrapSYS 的 syscall 错误约定**：失败返回 0，但空字符串哨兵也是堆索引 0。**无法区分"失败"和"空字符串"**。建议 v2 引入负值错误码，或返回 `[status, ptr]` 双值。

---

## 四、强烈建议的下一步：先补字符串索引/切片

> 详细设计见 `B6-B7 构思.md` 第二节。本节只给结论和理由。

**不要先做 B6（事件）**。理由：

1. `syscall fs_read` 返回的配置没法解析（见三-3）
2. B7 用 DrapLang 重写 Shell 要处理命令行参数，没有切片会写得很痛
3. B6 事件机制传结构体，也依赖更完整的类型系统

**建议加的东西**：
- `STRGET`：`s[i]` → 返回 i32 码点
- `STRSUB`：`substr(s, start)` → `src[start:]`
- `STRSPLIT`：`split(s, ' ')` → 数组（最关键，Shell 重写必需）
- 暂不做 `STRCMP`（字符串 `<` `>`），看 Shell 重写有没有排序需求

**验证方式**：把 `drapog.shell.js` 里的 `_split` 逻辑用 DrapLang 表达一遍，看语言够不够用。够用才动手做 B6。

---

## 五、改动时的文件联动清单

| 改什么 | 必连带改 |
|---|---|
| 加/改 VM 指令 | `drapog.dbyte.js`（OPCODE + ARG_SPEC + VERSION）、`drapog.vm.js`（execute）、`drapcc.js`（代码生成）、`drapdis.js`（自动）、`drapas.js`（自动）、CONTEXT.md |
| 加/改 syscall | `drapcc.js`（SYS_TABLE/SYS_RET/SYS_ARGS）、`drapog.sys.js`、CONTEXT.md 第十四节 |
| 改 DBYTE 格式 | `drapog.dbyte.js`（pack/unpack/hexdump）、`drapas.js`、`drapdis.js`、`drapog.vm.js`（loadFromBytes） |
| 改类型推断 | `drapcc.js`（inferType + scanLocals + isStrType）、可能连带 VM 指令语义 |
| 改 VFS 接口 | `drapog.vfs.js`（两个 backend）、`drapog.sys.js`、`drapog.shell.js`、`drapog.apps.js`（Finder） |
| 统一输出 | 新增 `drapog.stream.js`、改 `drapog.sys.js`、`drapog.shell.js`、`drapog.apps.js`、`System/Boot/cmd.js` |

**改完必须跑无损往返测试**：
```
.drap → cc → .dbyte → dis → .dasm → asm → .dbyte
```
两次 `.dbyte` 必须字节一致。

---

## 六、写代码给主人的格式要求

1. **整段替换**，贴全文件，文件头保留 JSDoc（`@file @module @summary @version`，version 记得递增）
2. **一次给一批**相关改动，不要一个文件一个文件挤牙膏
3. **改动前先列清单**：本次改了哪些文件、每个文件改了什么、为什么
4. **不要用 `// ... 省略 ...` 偷懒**，主人明确说定位容易出错
5. **改完自检**：import/export 是否闭环、有没有引用未定义变量、版本号是否一致

---

## 七、快速自检清单（改完代码前自查）

- [ ] 新增的 OPCODE 是否在 `OPCODE` 和 `ARG_SPEC` 都登记了？
- [ ] 新增的 syscall 是否在 `SYS_TABLE`、`SYS_RET`、`SYS_ARGS` 和 `DrapSYS.table` 都登记了？
- [ ] `.drap → .dbyte → .dasm → .dbyte` 是否字节一致？
- [ ] 字符串输出是否统一走 `vm.out`？（P0-2）
- [ ] 所有 `await vm.run()` 调用点是否都改成了 `await`？grep 一遍 `vm.run()`。
- [ ] 新增的局部变量是否在 `scanLocals` 里分配了 offset？
- [ ] 改动是否跨文件？对照第五节的联动清单。
- [ ] CONTEXT.md 的"当前进度"是否需要更新？
- [ ] 版本号是否递增？
- [ ] **有没有误碰 P0-1 搁置的位宽代码？**（不要动 `MUL`、位运算、文档里的"64 位"）

---

## 八、绝对不要做的事

1. ❌ 不要"顺手重构"没让你改的文件
2. ❌ 不要改 CONTEXT.md 的"已确认的设计决策"
3. ❌ 不要用 `var`、不要用双引号字符串、不要 4 空格缩进
4. ❌ 不要建议主人"改用 Python / 改用 Lua / 放弃自研"
5. ❌ 不要在没有测试无损往返的情况下说"改好了"
6. ❌ 不要一次性给太多文件让主人难以 review，但也别一次只改一行
7. ❌ 不要相信 CONTEXT.md 字面，先 grep 代码确认
8. ❌ **不要动 P0-1 位宽相关的代码和文档**（已拍板搁置，见 `DECISION-位宽.md`）

---

## 九、一句话总结给下一个 AI

**DrapOG 是一个"作品"而非"产品"。你的任务是修 bug、补一致性、推进 B6/B7，不要评审它的意义，不要重写架构，整段替换，一批一批给，改完跑无损往返。位宽已搁置不要碰。先修 P0-2 / P0-3 / P0-4 三个 bug（term_print、Shell split、maxSteps），再加字符串指令（STRGET/STRSUB/STRSPLIT），然后 B7 自举。**

---

最后更新：2026-10-11
作者：前任接手 AI