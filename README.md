# DrapOG

一个自包含的计算系统原型（BIOS → Boot → VM → Compiler → Shell → GUI），语言与运行时全部自研（DrapLang → DrapCC → DrapVM）。详细的架构、设计决策与进度见 [`docs/CONTEXT.md`](docs/CONTEXT.md)；接手前必读 [`docs/tell you.md`](docs/tell you.md)。

## 目录结构

```
DrapOG/
├── index.html          # 入口：跳转到 _dev/ 下的真实页面
├── _dev/               # 真实运行入口（_dev/index.html → System/BIOS/bios.js）+ 本地静态服务器 serve.py
├── src/                # 引擎核心：drapas/drapcc/drapdis + drapog.*.js（VM/SYS/Shell/WM/VFS/Registry…）
├── System/             # 应用与系统组件：Apps/（.app 包）、BIOS/、Boot/、Lib/、Themes/、Settings/
├── tests/              # 27 个 test_*.mjs 冒烟/回归测试
├── tools/              # 脚手架（mkapp.mjs 生成器）+ run-tests.mjs 统一运行器
├── docs/               # 设计文档（CONTEXT/B6-B7 构思/DECISION-位宽/DrapLang规范/tell you/struct）
├── examples/           # 已下线的遗留 drapp（供 test_gui/test_paint 用）
└── Users/              # 运行时 VFS 用户目录（gitignore，浏览器内存重建，勿入库）
```

## 常用命令

```bash
npm test        # 跑 tests/ 下全部测试（从项目根目录）
npm run serve   # 本地静态服务器预览（_dev/ 入口）
```

## 约定

- 双主题（macOS / Windows）内容级适配：应用用 `win_theme(slot)` 读语义色，不要硬编码颜色。
- 新增 GUI 应用：用 `node tools/mkapp.mjs <id> [name] [--title "标题"] [--stdlib]` 生成，再在 `src/drapog.wm.js` 的 dock/桌面图标里注册。
- **无损往返是硬约束**：`.drap → cc → .dbyte → dis → .dasm → asm → .dbyte` 两次字节必须一致。改 VM 指令/编译器/汇编/反汇编后必须跑测试。
- 位宽（P0-1）已拍板搁置，勿动（`DECISION-位宽.md`）。
