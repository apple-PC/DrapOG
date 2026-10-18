# DrapLang 语言规范（v1.0）

> DrapOG 的系统源语言。**源文件后缀：`.drapp`**。  
> 编译器 `DrapCC` 把 `.drapp` 编译为 DBYTE 字节码（`.dbyte`），由 `DrapVM` 执行；宿主层（`DrapSYS`）把**操作系统服务**以「系统调用」形式暴露给程序。  
> 本规范即「编写软件」所需的完整接口清单。

---

## 1. 一句话模型

```
.drapp  ──DrapCC──▶  { instructions, strings }  ──pack──▶  .dbyte  ──DrapVM──▶  运行
                                                  ▲
                                          （也可直接 load .dbyte 运行）
```

- 程序入口：`entry fn main() -> i32 { ... }`，`main` 的返回值作为 **CLI 退出码**（0 成功）。
- 类型系统精简：**`i32`**（32 位整数，默认数值类型）、**`str`**（堆字符串）、**数组**、**结构体**、**对象**。
- 一切与「操作系统」的交互都通过 **系统调用（syscall）**；纯计算走 **标准库内建函数（builtin）**。

---

## 2. 词法

| 类别 | 写法 | 示例 |
|------|------|------|
| 注释 | `//` 到行尾 | `// 这是注释` |
| 标识符 | 字母/下划线开头 | `count`, `my_var`, `Point` |
| 整数 | 十进制 | `0`, `42`, `-7`（负号是运算符） |
| 字符串 | 双引号 | `"hello\n"`（`\n` 转义） |
| 字符 | 单引号 | `'A'`（值为其码点整数） |
| 布尔 | 关键字 | `true`(=1) / `false`(=0) |
| 数组字面量 | 方括号 | `[1, 2, 3]`, `["a", "b"]` |
| 结构体字面量 | 名字 + 花括号 | `Point{ x: 3, y: 4 }` |

---

## 3. 类型

| 类型 | 说明 | 字面量 / 构造 |
|------|------|---------------|
| `i32` | 32 位整数（默认） | `42`, `x + y` |
| `str` | 堆字符串（不可变，赋值即新指针） | `"..."`, `substr(s, 1)`, `itoa(n)` |
| 数组 | 同构元素容器 | `[1,2,3]`；`.push()`, `len()`, `[i]`, `a[i]=v` |
| 结构体 | 命名字段集合 | `struct Point { x: i32, y: i32 }` |
| 对象 | 匿名字段集合（运行时 `newobj`/`fldget`/`fldset`） | 通常由底层工具产生 |

局部变量**类型可推断**，也可显式标注：`let x: i32 = 0;`。  
字符串 / 数组 / 结构体 / 对象的赋值都是**引用/指针语义**（同一堆对象）。

---

## 4. 声明

```drapp
// 常量/变量
let pi = 3;
let s = "hello";
let arr = [1, 2, 3];

// 普通函数（需先声明后调用；参数按值传入）
fn add(a: i32, b: i32) -> i32 {
  return a + b;
}

// 程序入口（整型返回值即退出码）
entry fn main() -> i32 {
  return 0;
}

// 结构体
struct Point { x: i32, y: i32 }

// 导入标准库模块（core 自动导入，无需写）
import math        // abs/min/max/sqrt/pow/floor/ceil/round/rand/clamp/sin/cos/log/exp
import str         // toUpper/toLower/trim/contains/indexOf/startsWith/endsWith/repeat/replace/join/charAt

// 文件级模块（多文件 app）：把兄弟 .drapp 作为模块合并进来
import "utils"     // 需 Info.json 的 modules: ["utils"]
```

> 函数必须先定义后调用（编译器单遍收集声明）。

---

## 5. 语句

| 语句 | 说明 |
|------|------|
| `let name = expr;` | 定义局部变量（类型可推断） |
| `name = expr;` | 赋值（变量 / 成员 / 下标均可作左值） |
| `name += expr;`（`-= *= /= %=`） | 复合赋值 |
| `if (cond) { } else { }` | 条件；`else` 可选 |
| `while (cond) { }` | 循环 |
| `break;` / `continue;` | 跳出 / 跳过本次循环 |
| `return expr;` | 从函数返回（无参 `return;` 返回 0） |
| `term_print(expr);` `term_println(expr);` | **输出语句**：自动按类型打印（整数→数字，字符串→原样）；`term_println` 末尾追加换行 |
| `{ ... }` | 块作用域 |

> 比较/逻辑表达式结果为 `i32`：`1` 真 / `0` 假。`&&` `||` **短路求值**（左操作数已能定结果时右操作数不被求值）。

---

## 6. 表达式

- 算术：`+ - * / %`（`/` `//` `%` 均为整数运算，向零取整）
- 比较：`< > <= >= == !=`（字符串按内容比较，`==` 同类型比较）
- 逻辑：`&&` `||` `!`
- 一元：`-x`，`!x`
- 字符串：`s[i]`（第 i 个码点，整数）、`substr(s, start)`（`s[start:]`）、`len(s)`
- 拆分：`split(s, delim)`（按单字符 `delim` 拆分为字符串数组；`delim` 可为字符字面量或单字符字符串）
- 数组/结构体：`a[i]`、`p.x`、`p.x = 5`
- 调用：`foo(args)`（用户函数 / 标准库内建）
- **系统调用**：`syscall name(args)` —— 见第 8 节
- 优先使用括号明确优先级。

---

## 7. 标准库（builtin）

按模块划分；使用前提：`core` 自动可用，**`math` / `str` 需先 `import`**。  
返回值：标★为**字符串（堆指针）**，其余为 `i32`。

### core（自动）
| 函数 | 签名 | 说明 |
|------|------|------|
| `atoi(s)` | `(str) -> i32` | 字符串→整数（解析失败返回 0） |
| `itoa(n)` ★ | `(i32) -> str` | 整数→十进制字符串 |

### math（需 `import math`）
| 函数 | 签名 | 说明 |
|------|------|------|
| `abs(x)` `min(a,b)` `max(a,b)` | `(i32/i32) -> i32` | 基础代数 |
| `sqrt(x)` `pow(x,y)` `floor(x)` `ceil(x)` `round(x)` | `(f/f) -> f` | 幂与取整（参数为实数，结果取整返回） |
| `rand()` | `() -> i32` | 伪随机整数 `[0, 32767]` |
| `clamp(x, lo, hi)` | `(i32,i32,i32) -> i32` | 夹到区间 |
| `sin(x)` `cos(x)` `log(x)` `exp(x)` | `(f) -> f` | 三角函数 / 对数 / 指数（弧度） |

### str（需 `import str`）
| 函数 | 签名 | 说明 |
|------|------|------|
| `toUpper(s)` ★ `toLower(s)` ★ `trim(s)` ★ | `(str) -> str` | 大小写 / 去首尾空白 |
| `contains(s, sub)` `(str,str) -> i32` | 是否包含（1/0） |
| `indexOf(s, sub)` `(str,str) -> i32` | 首次出现位置（未命中 -1） |
| `startsWith(s, pre)` `endsWith(s, suf)` | `(str,str) -> i32` |
| `repeat(s, n)` ★ | `(str,i32) -> str` | 重复 n 次 |
| `replace(s, from, to)` ★ | `(str,str,str) -> str` | 替换**全部**匹配 |
| `join(arr, sep)` ★ | `(arr,str) -> str` | 用 sep 连接字符串数组（元素可为字符串指针或整数） |
| `charAt(s, i)` ★ | `(str,i32) -> str` | 第 i 个字符（越界返回空串） |

---

## 8. 系统调用（syscall）

**所有操作系统服务都通过 `syscall 名字(参数)` 调用**（除 `term_print`/`term_println` 是输出语句外）。  
参数按 `r1, r2, r3, r6, r7` 顺序传递（最多 5 个）。返回值：标注★为字符串指针，其余为 `i32`。

### 文件 `fs_*`
| 调用 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `syscall fs_read(path)` | str | ★str | 读文件全文；不存在返回空串 |
| `syscall fs_write(path, content)` | str,str | i32 | 覆盖写；成功 1 / 失败 0 |
| `syscall fs_append(path, content)` | str,str | i32 | 追加（不存在则创建） |
| `syscall fs_exists(path)` | str | i32 | 存在 1 / 否则 0 |
| `syscall fs_ls(path)` | str | ★str | 列目录，条目以 `\n` 分隔（`dir/` 表示目录）；非目录返回空串 |
| `syscall fs_mkdir(path)` | str | i32 | 建目录 |
| `syscall fs_rm(path)` | str | i32 | 删除文件或**空**目录 |
| `syscall fs_copy(src, dst)` | str,str | i32 | 复制文件（src 不存在返回 0） |
| `syscall fs_move(src, dst)` | str,str | i32 | 移动 / 重命名 |
| `syscall fs_size(path)` | str | i32 | 字节数；不存在返回 -1 |
| `syscall fs_isdir(path)` | str | i32 | 是目录 1 / 否则 0 |
| `syscall fs_chdir(path)` | str | ★str | 切换工作目录，返回绝对路径 |
| `syscall fs_realpath(base, path)` | str,str | ★str | 把 `(base, path)` 归一化为绝对路径 |

### 终端 `term_*`
| 调用 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `term_print(expr)` / `term_println(expr)` | —— | —— | **语句**：输出（整数或字符串自动判别），`ln` 追加换行 |
| `syscall term_read()` | —— | ★str | 读入一行（无输入源时返回空串） |
| `syscall term_clear()` | —— | i32 | 清屏 |
| `syscall term_exit()` | —— | i32 | 退出 Shell（置终止标志，VM 自然停机后宿主收尾） |
| `syscall term_gui()` | —— | i32 | 切换到 GUI 桌面 |
| `syscall term_hostcmd(line)` | str | i32 | 把一行委托给宿主执行（`mount`/`cc`/`load`/`save`/`asm`/`dis`/`dump`/`run`/`apps`/`install`/`uninstall`/`pack` 等宿主命令） |
| `syscall term_setcwd(cwd)` | str | i32 | 把当前目录同步给宿主提示符 |

### 时间 `time_*`
| 调用 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `syscall time_now()` | —— | i32 | 当前 Unix 秒级时间戳 |
| `syscall time_sleep(ms)` | i32 | i32 | 休眠指定毫秒（异步让出，不阻塞 VM） |
| `syscall time_format(ts)` | i32 | ★str | 把秒级时间戳格式化为 `"YYYY-MM-DD HH:MM:SS"`（`ts==0` 用当前时间） |

### 进程参数 `args_*`（CLI 工具读取命令行）
| 调用 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `syscall args_count()` | —— | i32 | 参数个数（含 `argv[0]`=程序名） |
| `syscall args_get(i)` | i32 | ★str | 第 i 个参数；越界返回空串 |

### 窗口 / 绘制 / 输入 `win_*`（GUI 自举底层工具）
> GUI 程序在 VM 里跑事件循环：`while (true) { e = syscall win_get_event(); ... }`，通过下列调用绘制与收事件；宿主负责建真实窗口、重放绘制、注入真实输入。

| 调用 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `syscall win_create(title, w, h)` | str,i32,i32 | i32 | 创建窗口，返回 id（同时设为当前窗口） |
| `syscall win_close(winId)` | i32 | i32 | 关闭窗口 |
| `syscall win_set_title(winId, title)` | i32,str | i32 | 改标题 |
| `syscall win_focus(winId)` | i32 | i32 | 设当前绘制/输入目标窗口 |
| `syscall win_text(x, y, s)` | i32,i32,str | i32 | 绘制文本 |
| `syscall win_fill_rect(x,y,w,h)` | i32×4 | i32 | 填充矩形 |
| `syscall win_stroke_rect(x,y,w,h)` | i32×4 | i32 | 描边矩形 |
| `syscall win_set_color(r,g,b)` | i32×3 | i32 | 设置绘制颜色（0–255） |
| `syscall win_set_font(size)` | i32 | i32 | 设置字体大小 |
| `syscall win_get_event()` | —— | ★str | 取下一个事件（`paint`/`close`/`click x y`/`key K`/`input id val`）；队列空则阻塞等待 |
| `syscall win_invalidate(winId)` | i32 | i32 | 请求重绘（注入 `paint`） |
| `syscall win_atoi(s)` | str | i32 | 字符串→整数（解析 GUI 事件坐标等） |
| `itoa(n)` | i32 | ★str | 整数→字符串（GUI 显示数字） |
| `syscall win_w()` / `syscall win_h()` | —— | i32 | 当前窗口宽 / 高 |
| `syscall win_button(id, x,y,w,h)` | str,i32×4 | i32 | 声明按钮（命中事件 `click <id>`） |
| `syscall win_label(x, y, text)` | i32,i32,str | i32 | 声明静态标签 |
| `syscall win_input(id, x,y,w,h)` | str,i32×4 | i32 | 声明输入框（值跨帧保留） |
| `syscall win_input_get(id)` | str | ★str | 读输入框当前值 |

---

## 9. 应用格式（`.app` 包）

一个可分发、可安装的应用 = **目录** `Name.app/`：

```
Name.app/
├── Info.json      // 元数据（必填：id / name / type(gui|cli) / entry；可选：version/icon/author/description/category/minVersion/permissions/modules）
├── main.drapp     // DrapLang 入口源（或与 entry 同名）
├── main.dbyte     // 可选：预编译产物（entry 指向 .dbyte 时免运行时编译）
└── utils.drapp    // 可选：兄弟模块（需在 Info.json 的 modules 列出）
```

- `type: "cli"`：无窗口，由 `runDrapCli` 直接跑，输出收敛到终端。
- `type: "gui"`：由 `launchDrapApp` 起真实窗口跑事件循环。
- `entry` 指向入口源/字节码（如 `main.drapp` 或 `main.dbyte`）。
- `modules`：`["utils"]` 表示从同目录拉取 `utils.drapp`，供 `import "utils"` 使用。
- 安装：`install <src.app>` 复制进 `System/Apps/` 并注册；`uninstall <id>` 删除并注销；`pack <in.drapp> [name] [-gui]` 把单文件打包成 `.app`。

---

## 10. 工具链（宿主命令，在 Shell 里用）

| 命令 | 作用 |
|------|------|
| `cc <in.drapp> [-o <out.dbyte>]` | 编译 `.drapp` → `.dbyte` |
| `load <path.dbyte>` | 加载并运行 `.dbyte` |
| `save <path>` | 编译内置 demo 保存为 `.dbyte` |
| `dump <path.dbyte>` | 十六进制显示 `.dbyte` |
| `asm <in.dasm> [-o <out.dbyte>]` | 汇编 `.dasm` → `.dbyte` |
| `dis <in.dbyte> [-o <out.dasm>]` | 反汇编 `.dbyte` → `.dasm` |
| `run <app> [参数...]` | 启动应用（host/gui 进桌面，cli 直接跑）；CLI 应用可接命令行参数 |
| `apps` | 列出已注册应用 |
| `info <id>` | 显示某应用元数据 |
| `install <src.app>` / `uninstall <id>` | 安装 / 卸载 `.app` |
| `pack <in.drapp> [name] [-gui]` | 把单文件打包成 `.app` |
| `mount` / `umount` / `remount` / `df` | 真实磁盘挂载管理 |

**嵌入 API**（在 JS 里调用）：`new DrapCC(src, { modules }).compile()` → `{instructions, strings}`；`new VM().load(program)`；`new DrapSYS({ vm, vfs, ... })` 后 `vm.run()`。`runDrapCli(vfs, io, src, { modules, argv })` / `launchDrapApp(wm, vfs, src, { modules })` 是封装好的快捷入口。

---

## 11. 示例

### 例 1：CLI 工具（读取命令行参数 + 文件处理）

```drapp
import str

entry fn main() -> i32 {
  // argv[0] 是程序名；后面是用户参数
  let n = syscall args_count()
  if (n < 2) {
    term_println("用法: cat <文件>")
    return 1
  }
  let path = syscall args_get(1)
  let content = syscall fs_read(path)
  if (len(content) == 0) {
    term_println("无法读取: " + path)
    return 2
  }
  term_print(content)
  return 0
}
```
运行：`run cat readme.txt`（在 Shell 中，`run` 会把 `readme.txt` 作为 `argv[1]` 传入）。

### 例 2：计数并输出（数字→字符串）

```drapp
import math
import str

entry fn main() -> i32 {
  let sum = 0
  let i = 1
  while (i <= 10) {
    sum = sum + i
    i = i + 1
  }
  term_print("1..10 之和 = ")
  term_println(itoa(sum))          // itoa 把整数转成字符串再打印
  return 0
}
```

### 例 3：GUI 应用（事件循环 + 点击变色）

```drapp
event fn on_paint() {
  win_set_color(10, 132, 255)
  win_fill_rect(40, 40, win_w() - 80, win_h() - 80)
}
event fn on_click() {
  win_invalidate(0)   // 请求重绘
}
entry fn main() -> i32 {
  syscall win_create("示例", 400, 300)
  return 0
}
```

### 例 4：多文件应用（文件级模块）

`Info.json`：`{ "id":"app", "name":"App", "type":"cli", "entry":"main.drapp", "modules":["utils"] }`  
`main.drapp`：
```drapp
import "utils"
entry fn main() -> i32 {
  term_println(utils.greet("DrapOG"))
  return 0
}
```
`utils.drapp`：
```drapp
export fn greet(name: str) -> str {
  return "Hello, " + name
}
```
（`import "name"` 在编译期 BFS 合并 `name.drapp` 的函数/结构体；模块内禁止 `entry`/`event`。）

---

## 12. 设计约定速记

- **OS 服务用 `syscall` 前缀；标准库用普通调用**。这是有意为之的「显式系统接口」设计。
- 数值默认 `i32`；字符串/数组/结构体/对象是**堆对象**，函数传参是值（指针值）传递。
- `main` 返回 `i32` 即 CLI 退出码；GUI 程序通常 `return 0`。
- 与宿主交换文本一律走 `term_print` / `term_read` 或 `fs_*`；不要假设底层是文件还是内存文件系统（VFS 统一抽象）。
