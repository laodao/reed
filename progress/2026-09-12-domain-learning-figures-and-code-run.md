# 领域共学空间：声明式图形（代码画图）+ JS 代码沙箱运行（2026-09-12 第五轮）

> 日期：2026-09-12 | 前置：同日第四轮（证据外链 + 知识体系完整度诊断）
>
> 用户第 1、2 条需求，方案已拍板：**① 声明式图形规格（AI 给数据、前端画图，非 AI 生图）；② 先只做 JS/TS 运行**。

## 1. 声明式图形（`figure` 代码块 → SVG）

思路：模型只产出**图形规格**（JSON），渲染层用自写 SVG 渲染器画出来——零依赖、离线、确定性（同规格必同图，可测），
且规格里只有数据、没有代码（与"运行代码"是两件独立的事，风险面不同）。

- `views/domain-learning/figure-spec.ts`：
  - 五类规格：`matrix`（矩阵热力网格，行列标签/数值/精度/单色或红蓝发散）、`plot`（曲线/散点/双模，轴范围自动标注）、
    `bar`（对比条）、`shape`（张量形状：每轴一个方块 + 轴长与名称）、`network`（网络结构：层内单元 + 相邻层全连接）；
  - `parseFigureSpec` 宽松容错 + **限幅**（矩阵 ≤24×24、点数 ≤400、序列 ≤6、条 ≤16、轴 ≤8、层 ≤6、单元 ≤16，超限截断并给 warning）；
  - 非法规格给**可读错误**（空/非 JSON/缺字段/非数值/未知类型），渲染层保留原代码块并在下方提示——读者仍能看到规格原文；
  - `renderFigureSvg` 全部文本走 `escapeXml`（规格来自模型，防注入）；`formatNumber` 去尾零/去 -0。
- `MarkdownViewer.vue` 渲染后增强：把 `pre > code.language-figure` 替换为 `div.dl-figure > svg`，
  用 `MutationObserver`（30ms 合并）跟随 bytemd 的 innerHTML 替换重跑，已处理节点打 `data-dl-enhanced` 标记防重复。
- 样式进 `lesson-markdown.scss`：图形框浅底 + 横向滚动 + 5 色序列变量（`--dl-series-N`，主题切换自动跟随）；
  轴/格值/网格/单元的 fill 全部走 Element Plus 变量。
- 生成侧契约（`learning-concept-explainer` 第 10 条 + bootstrap S4）：给出五类规格的**完整 JSON 样例**、
  "必须合法 JSON"、"矩阵 ≤24×24 / 点数 ≤400"、"图形要服务理解（形状→shape/matrix、损失曲线→plot、优化器对比→bar、网络→network），不要为配图而配图"。

## 2. JS 代码沙箱运行（`js` 代码块 → 「▶ 运行」）

- `views/domain-learning/code-runner.ts`：
  - **不依赖 `eval`/`new Function`**：把片段**内联进 Worker 源码**（Blob URL），Worker 顶层执行即可 →
    CSP 只需开 `worker-src blob:`，**不必开 `'unsafe-eval'`**（这是刻意的安全取舍）；
  - 沙箱边界：Worker 内无 DOM（`document`/`window` 不存在），并把 `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/
    `importScripts`/`Worker`/`parent`/`top` 以**函数参数遮蔽为 `undefined`**（片段拿不到网络）；
  - 护栏：3 秒超时（主线程 `terminate()`，死循环只卡 Worker 不卡界面）、输出限 200 行 / 每行 400 字（超出标注截断）；
  - `console.log/info/debug` → 普通输出，`warn` → `⚠️`，`error` → `⛔`，异常 → `✗`；对象值安全格式化（数组美化、循环引用标 `[Circular]`、Error 带名字）；
  - 环境不支持（无 Worker/Blob，如单测的 happy-dom）→ 返回**可读错误**而不是抛错。
- `MarkdownViewer.vue`：`language-js/javascript/mjs` 代码块后插入 `.dl-run`（运行按钮 + 提示 + 输出区），
  点击后禁用按钮显示"运行中…"，结果内联显示并带用时；Python 代码块**不加按钮**（本轮不跑 Python，技能里明确要求"要能跑的演示改写成等价 JS"）。
- CSP（只放宽一处）：`src/renderer/index.html` 与 `src/electron/index.ts` 的 CSP 增加 `worker-src 'self' blob:`
  并加注释说明"不开 unsafe-eval、沙箱内无 DOM/网络/超时"。

## 3. 测试与验证

- 新增 `figure-spec.spec.ts`（16 例：五类解析与规范化、限幅告警、SVG 图元计数（rect/circle/line/path）、
  确定性、**文本转义防注入**、非法输入可读错误、`formatNumber`/`escapeXml`）；
- 新增 `code-runner.spec.ts`（10 例：Worker 源码内联且**不含 eval**、console 分级上报、网络 API 遮蔽、
  异常回报 + done、值格式化要点、输出裁剪（超行/超宽/默认护栏）、环境不支持时返回可读错误）；
- 扩展 `markdown-viewer.spec.ts`（+4 例，真实组件 + happy-dom）：`figure` 块渲染成 `.dl-figure svg` 且原代码块消失、
  非法规格保留代码块并显示错误、`js` 块出现「▶ 运行」且点击后输出区有内容（本环境走可读错误分支）、`python` 块不加按钮；
- 扩展 `builtin-skills-pedagogy.spec.ts`（+1 例）：技能里五类规格样例、合法 JSON、限幅、`▶ 运行`、沙箱无 DOM/网络、python 不运行、200 行限制齐全。
- 相关全量 **34 文件 334 passed**；`eslint` 改动文件 0 error；`vue-tsc` 改动文件 0 新增错误（全量 894 与基线一致）。

## 4. 边界与后续

- **只有 JS 能跑**：Python/numpy/torch 不运行（用户拍板先做 JS）。若以后要真跑 Python，需要引入 Pyodide（约 10-20MB，
  离线需打包进 resources），届时把 `code-runner` 扩成"按语言选运行时"即可（现接口已按 `runJsSnippet` 收口）。
- **沙箱不是虚拟机**：Worker 里拿不到 DOM/网络（已遮蔽），但仍能消耗 CPU（靠 3 秒超时兜底）与内存；片段来自本机产出的讲义，
  风险与"运行用户自己的脚本"同级。若要做成更强的隔离，需要独立进程/沙箱（Electron utilityProcess 或后端容器），另行排期。
- **图形目前是静态 SVG**：没有交互（缩放/悬停数值）、没有 3D；`plot` 的坐标轴只给范围不给刻度线标签（够用但可增强）。
- 讲义里已有内容不会自动重排成 figure/js 块——新技能契约只影响后续生成；老讲义可让助手"按新规范重出这一讲"。
