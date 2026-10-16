# 领域学习「右栏追问答疑」：模型输出改为渲染呈现 + 可切源文件

日期：2026-09-15
类型：功能补全（用户需求）+ 真机验收
用户原话：「领域学习模块，主题学习界面，右侧追问答疑部分，模型输出内容应该要显示为渲染后的，支持切换到源文件」

## 一、现状与根因

右栏「追问 · 答疑」气泡把 `dl_question.answerMd`（**markdown**）当纯文本直出：

```html
<!-- 改前（DomainLearningSpace.vue） -->
<div class="qa-text">{{ t.text || '…' }}</div>
```

`.qa-text { white-space: pre-wrap }` → `**加粗**`、`## 标题`、表格管道符、代码围栏、公式
全部以原始字符示人；而同模块的讲义（`SectionLesson` → `MarkdownViewer`）早已有完整渲染管线
（bytemd + gfm/highlight/math/mermaid + ```figure 图形 + ```js 沙箱运行）。
同一份 markdown，在讲义里是排版好的正文，在答疑里却是源码 —— 用户看到的就是这个落差。

数据侧确认「answerMd 就是 markdown」：`dl-agent-actions.ts` 的 `answerQuestion()` 落库字段为
`answerMd`，右栏历史由 `learning-view.service.ts` 直接映射为 `DlChatTurn.text`。

## 二、方案

**新增组件 `QaAnswerView.vue`**（逐答案粒度：渲染 ↔ 源码），而不是在 3000 行的视图里再堆条件分支：

| 关注点 | 做法 |
| --- | --- |
| 渲染态（默认） | 复用 `MarkdownViewer`（与讲义同一套管线：KaTeX 公式 / mermaid / 代码高亮 / 表格），新增 `compact` 变体解决窄气泡排版 |
| 源码态 | `<pre class="qa-src">` 原文直出（Vue 插值自动转义），等宽字体、保留换行、可横向滚动 |
| 切换入口 | 按钮 `.qa-mode-toggle` 文案在「源码 ↔ 渲染」间切换，带 `title` 说明；平时半透明、悬停/聚焦变实 |
| 空文本 | 流式首包未到 → `…` 占位，不渲染空文档、也不给无意义入口 |
| 流式性能 | 增量**合并刷新**（180ms 窗口）：bytemd 每次 value 变化都全量重解析 + 各插件客户端渲染（KaTeX 逐元素、mermaid 逐图），逐 chunk 重渲染会明显拖慢右栏；`streaming` 转 false 时立即补齐全文，不留滞后尾巴 |
| 提问轮 | 仍是纯文本直出（用户输入不当富文本渲染），样式 `.qa-text` → `.qa-text-user` |

**`MarkdownViewer` 新增 `compact` 变体**：讲义排版按整页阅读设计（段落首行缩进两字、章节大间距、
表格大留白），塞进 300px 宽的气泡里每段都缩进、行又短，反而不像对话。compact 只做「容器变窄」的
增量覆盖（缩进归零、间距收紧、标题降到 13.5px、图块横向可滚），选择器用 `.markdown-viewer.compact`
多一层类名（特异性 0,3,1 > 讲义的 0,2,1），与样式表加载顺序无关。讲义侧不传该 prop，排版不变。

**装配**（`DomainLearningSpace.vue`）：assistant 轮改用 `<QaAnswerView :md="t.text" :streaming="isTurnStreaming(i, t)" />`；
抽出 `isTurnStreaming(index, turn)`（末轮 + assistant + `tutorStreaming`），流式提示「正在组织回答…」
与组件节流共用同一个判定，避免两处条件各写一遍走偏。

## 三、测试（TDD：先红后绿）

`tests/unit/renderer/domain-learning/qa-answer-view.spec.ts`（新增，14 例全绿）：

- 渲染态默认：markdown 原文交给 `MarkdownViewer`，且带 `compact`；源码块不存在；
- 切源码：`**结论**`、表格管道符逐字可见，渲染器退场；再点切回渲染；
- 切换按钮有可读文字标签（窄栏里不靠猜图标）；
- 空文本：占位符、无渲染器、无切换入口；
- 源码态随流式增长保持最新；
- 流式节流：同一窗口内三个增量只重渲染一次，窗口到点补齐，`streaming=false` 立即跟上；非流式不节流；
- **真渲染器集成**（不 stub）：`**结论**` → `<strong>`、表格 → `<table>`，切源码后 HTML 语义消失、回到原文；
- 装配契约（源码级断言，该视图体量大不便 mount，沿用本仓 `lesson-export-command.spec.ts` 的做法）：
  引入并使用 `QaAnswerView`、assistant 轮不再纯文本直出、提问轮仍纯文本、`isTurnStreaming` 三个条件齐全。

回归：`tests/unit/renderer/domain-learning/` 全套 —— 新增 14 例全绿；`markdown-viewer.spec.ts`
（MarkdownViewer 契约，`compact` 未破坏讲义渲染）与 `section-lesson.spec.ts` 全绿。
`lesson-typography.spec.ts` 的 3 例失败为**既有**（该 spec 用 `'h1,\n  h2 {'` 这类 LF 字面量去匹配
CRLF 文件，HEAD 起就红，见 `progress/2026-09-15-domain-learning-export-mermaid-csp-fix.md` 同一记录）。

`vue-tsc`：改动文件（`QaAnswerView.vue` / `MarkdownViewer.vue` / `DomainLearningSpace.vue`）0 报错；
过滤出的 `dl-concept-audit.service.ts` 两处 `dlConceptLogs` 缺失为**既有**（本轮未触碰该文件）。

## 四、真机验收（运行中的应用 + CDP，只读）

应用当时正停在该空间的答疑页（`#/domain-learning/5d586839-…`），HMR 已自动生效。

`progress/_qa_render_probe.cjs`：

```
turns: 19, assistantTurns: 6, answers: 6, renderedBodies: 6, srcBlocks: 0
firstAnswerClass: qa-answer is-render    toggleLabels: ["源码"×6]
firstAnswerHtml: <div class="markdown-viewer compact"> → <div class="markdown-body">
                 <h2>结论</h2><p>…<strong>股权</strong>…</p>      ← 真 HTML，不是格式字符

点第 1 条的「源码」→ is-source, srcBlocks: 1, renderedBodies: 5（只影响这一条）
  文本片段: "## 结论\n…**股权**这一类。\n\n来源句出自本卡…"
再点「渲染」→ renderedBodies 回到 6, srcBlocks 归 0
```

`progress/_qa_layout_probe.cjs`（6 条回答全部渲染态时）：

```
bubbleW 323 / bubbleScrollW 323 ；bodyClientW 301 / bodyScrollW 301（无横向溢出）
fontSize 13px, lineHeight 22.1px, pTextIndent 0px, pMarginBottom 6px, headingFontSize 13.5px
（讲义排版下会是 14px/1.85/2em 缩进/15.5px 标题——证明 compact 真的生效）
overflowing: []（每条都是空数组）
```

截图产物：`progress/_qa_render_pane.png`（渲染态）、`progress/_qa_render_pane_src.png`（源码态）。
探针脚本只点击切换按钮、不改任何数据。

## 五、顺带发现（本轮不改，记录备查）

`MarkdownViewer.vue` 的 scoped 样式里 `:deep(.bytemd)` 与 `:deep(.bytemd-preview)` 是**死选择器**：
`@bytemd/vue-next` 的 `Viewer` 渲染出来的根节点就是 `<div class="markdown-body">`，没有 `.bytemd` 外层壳
（`node_modules/@bytemd/vue-next/dist/index.js` 的 `_sfc_render` 可证）。因为讲义排版本来就挂在
`.markdown-body` 上，视觉无影响；`markdown-viewer.spec.ts` 里 `waitFor(() => w.find('.bytemd').exists())`
同样是空等（该 spec 的断言落在内容选择器上，所以一直是绿的）。需要清理时要连同该 spec 的就绪锚点一起改。
