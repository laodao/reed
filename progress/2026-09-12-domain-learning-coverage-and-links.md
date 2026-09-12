# 领域共学空间：证据外链 + 知识体系完整度诊断（2026-09-12 第四轮）

> 日期：2026-09-12 | 前置：同日第一/二/三轮（排版与内容质量、前置要求体系、用户建点与 AI 补全）
>
> 用户四条反馈中的第 3、4 条本轮落地；第 1、2 条（代码生成图形 / 在线运行代码）已做可行性核查与方案设计，待拍板。

## 1. 「研究此概念」后端链路核查（回答第 4 条"检查一下后端怎么做的"）

前端 `researchConcept()` → `dl:agent-send { mode:'research', spaceId, conceptId, message }` →
`DlAgentHarnessService.sendMessage('research', …)`：

1. 快照 `computeDlSpaceSnapshot(db, spaceId, conceptId)`：空间概览 + 当前概念现状 + 讲义前 6 区各 300 字 +
   相关概念 + 目录分组 + 知识库绑定 + 【主题前置要求】+【各知识点前置】；
2. 系统提示词 `dlResearchSystemPrompt()`（14 条纪律：技能调用、证据、采集、归属、难度/循序渐进门禁、数值回算…）；
3. 工具绑定 `buildDlBindings({mode:'research'})` = 动作工具（`dl_save_concept/relation/card/space_prereqs/answer_question`）
   + 读工具（`wf_kb_retrieve` / `wf_web_extract` / `http_get`[/`web_search`]）+ `discover_capabilities`/`invoke_skill`；
4. 收尾：`dl_save_card` 的 `expectedConceptId` **锁死当前概念**（研究轮不能给别人写讲义）→ 自动核验 + card-ready 通知。

**关键结论：研究模式一次只保证"给当前概念一张讲义"，从来没有"把整个领域骨架补完整"的职责。**
地图扩张只能靠四条路：① 空空间 bootstrap 的首批 3-8 个概念；② 难度/循序渐进门禁在缺前置时逼它建前置概念；
③ 用户手工建点；④ 显式「AI 补全」。这解释了为什么逐概念研究并不会让体系变完整。

**真机数据核对**（`C:\Users\daoge\the-bot\the_bot.db`）：

| 空间 | 知识点 | 前置边 | 讲义 | 创建时间 |
|---|---|---|---|---|
| 验收·贝叶斯入门 | 228 | 336 | 142 | 2026-09-08 |
| 深度学习 | 8 | 9 | 2 | 2026-09-10 |
| 量子物理 | 6 | 7 | 1 | 2026-09-09 |
| 走查起步主题 | 5 | 4 | 5 | 2026-09-09 |
| M7技能验证 | 5 | 4 | 1 | 2026-09-09 |

用户记忆里"知识点体系很丰富"的那个是 **验收·贝叶斯入门（228 概念/336 关系/142 讲义，2026-09-08 验收期产物）**，
深度学习空间从建空间起就是 7 个，现在 8 个（新增「导数与链式法则」「偏导数与梯度」，带 Colah/arXiv 证据 →
由研究会话按前置门禁补出来的，不是手工建点）。

## 2. 第 4 条的修复：把"体系完不完整"变成可测量、可注入、可展示的诊断

新增 `rules/learning-map-coverage.rules.ts`（纯函数，20 例测试）：

- **确定性缺口判定**（只判能确定判的，不假装能枚举"缺了哪些领域概念"）：
  `no-entry`（无起点）/ `unreachable`（前置漏建导致学不到）/ `flat-trunk`（层数<3 且叶≥5 = 平铺一层）/
  `funnel`（≥2 个起点直接汇入一个 ≥2 层的概念 → 中间缺台阶，正是"张量+导数 → 自动微分"）/ `declared-only`
  （声明了前置没落边）/ `no-lesson`（有骨架没讲义）/ `coarse`（整块领域当知识点、把空间名当知识点、超长名）/
  `flat-branches`（只有领域根、概念平铺根层）/ `no-space-prereq`（主题前置未声明）；
- **0-100 评分**（口径写在注释里：基础 100 分按缺口扣分并夹紧），附 `summary` 一行摘要；
- `levelsOf` / `reachableFrom` 图算法（环、孤立子图、前置漏建都覆盖；空地图直接 0 分，避免"干净的空地图"骗高分）；
- `mapCoverageBriefing()` 生成注入提示词的简报（high 优先、带涉及概念、可限条数）。

接入四处：

1. **快照**（`computeDlSpaceSnapshot` 新增 `coverage` + 【地图完整度】段落）：每轮研究都看得到体系缺口；
2. **研究提示词第 14 条**「补齐知识体系」：每轮研究除讲义外**顺手补 1-3 个结构性缺口**（有界，别把一轮做成大工程），
   优先 high → medium；明确"不要为了拉高分数而堆无意义概念"；
3. **空间视图**（`DlSpaceView.coverage`）：左栏标题行新增「体系 60」徽标（≥85 绿 / ≥60 橙 / 其余红），
   悬停列出缺口清单（优先/建议分级）；
4. **「AI 补全」指令**：把后端诊断出的缺口逐条带进任务指令（"从已知缺口起步"，而不是让模型自由发挥）。

## 3. 第 3 条：证据来源与相关著作的 URL 可点击

- 新增 `shared/utils/external-link.ts`：`isSafeExternalUrl`（只放行 http(s)）、`openExternalUrl`
  （`window.open(url,'_blank','noopener,noreferrer')` —— Electron 主进程 `setWindowOpenHandler` 只放行 http(s)
  并转 `shell.openExternal`，弹窗 deny；Web 开新标签）、`externalHostLabel`（去 `www.` 的站点名）。
- `SectionLesson.vue`：「证据来源」每条带 url 时渲染 `站点名` 链接（配 KB 文档标记 + 引文），
  「相关著作」的 url 同样可点；`javascript:`/`data:`/相对路径一律不渲染成链接（有测试钉死）。
- 真机数据里确实有 url（如 `deeplearningbook.org`、`arxiv.org/abs/...`），此前只是没渲染出来。

## 4. 测试与验证

- 新增 `learning-map-coverage.rules.spec.ts`（20 例：真机深度学习空间形状作为"体系不完善"基线、
  图算法、九类缺口、简报、完整地图防误报 ≥90 分）、`external-link.spec.ts`（6 例）；
  扩展 `section-lesson.spec.ts`（+4 例：证据/著作链接、非法 url 不渲染、点击走 window.open）、
  `learning-view.service.spec.ts`（+1 例 coverage 透出）、`dl-agent-deps.spec.ts`（+2 例：快照含完整度、提示词纪律）、
  `domain-learning-mission.spec.ts`（+2 例：诊断入指令）。
- 相关全量 **32 文件 303 passed**；`eslint` 改动文件 0 error；`vue-tsc` 改动文件 0 新增错误（全量 894 未变）。
- 规则首轮写出来被自己的测试抓出 5 个真 bug：可达性把"前置漏建节点"当入口、`lessons` 误用 researchState、
  funnel 判定漏掉"含中间层前置"的情形、空地图拿 92 分、"基础"后缀被误判粒度太粗 —— 均已修并留用例。

## 5. 补充（同日）：知识地图栏顶部改为图标

用户反馈「知识地图栏顶部的体系、+知识点、AI 补全，换成 icon」。左栏 `pane-title` 右侧三个入口改为图标形态：

- **体系完整度** → `DataAnalysis` 图标 + 分数徽标（11px 数字，非文字按钮），档位色仍为 绿/橙/红；
  悬停仍是完整度摘要 + 缺口清单（优先/建议分级）；非按钮形态（`cursor: default`），不伪造成可点击；
- **追加知识点** → `Plus` 纯图标按钮（`aria-label="追加知识点"`，tooltip 说明"落库后出现在地图里，尚无讲义"）；
- **AI 补全** → `MagicStick` 纯图标按钮（保留 loading 态；tooltip 说明"按缺口清单补齐知识点与前置关系，只补结构"）；
- 样式：`.map-icon-btn` 去掉 el-button 的内边距/最小宽度压成纯图标（16px，hover 变主色），
  `.coverage-btn` 为图标 + 数字的小胶囊；三者间距 6px。

## 6. 待拍板（第 1、2 条）

第 1 条「代码生成图形（非 AI 生图）」与第 2 条「代码在线运行」有成本/安全上的取舍，已给出方案与代价
（见下），等用户选择后实施。仓库现状：无 echarts/plotly/pyodide；已有 mermaid（流程图）、katex（公式）、
node `canvas`（主进程，可画基础图形）。
