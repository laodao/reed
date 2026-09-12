# 长文写作质量优化方案与实施记录（49 号）

- 日期：2026-09-09
- 状态：已实施（含 10 集剧本端到端验收）
- 背景：用户反馈"针对短剧平台调研做过优化后，长文写作效果还是不太好"，要求：①重审/深化行业调研 ②harness 层广泛调研 ③评估后实施 ④用长文功能实写一部 10 集剧本 ⑤全程记录。本文即第⑤条的交付物之一。

---

## 0. 结论先行

上一轮优化（42 号研讨室、设定集 P0-P3、40 号上下文治理）解决的是"**上下文对不对**"的问题；本轮诊断发现效果瓶颈在"**写得好不好**"——生成链路三条提示词（大纲/正文/剧本）全部是**零方法论的泛型写手**，且没有生成后的质量闭环。本轮以三路深度调研（含 9+6 个开源仓库 clone 读码取证）为依据，落地 5 项优化（F1-F5），并用优化后的管线端到端实写了 10 集短剧剧本《金瞳》。

## 1. 三路调研摘要（完整报告见 /tmp/research/，随附仓库在 /tmp/research/repos*/）

### R1 内容方法论（短剧平台/编剧方法论，19 组搜索+12 篇原文）
- **爽点硬配额**：每集≥1 小爽点；每 3 集 1 中爽点；每 10 集 1 终极爽点；憋屈不过夜（高潮点后移 2 分钟留存降 23%）。
- **单集四拍引擎**：Hook 0-15s（3 秒定格测试）→ Friction 15-60s（三句对白内浮出冲突）→ Spike 60-90s（消音测试）→ Button 最后 5-10s（**切在问题上不切在答案上**）。
- **钩子类型学**：情绪 30-40%/悬念 20-30%/危机 10-20%/信息 10-20%/反转 5-15%，须轮换防审美疲劳。
- **卡点公式**：情绪最高点+极致悬念；10 集制卡点位=第 8 集；重大揭露放卡点后 1-2 集。
- **打脸四步法**：羞辱 40%→隐忍→反击 30%→释放 30%，缺一不可；反派台词要留打脸漏洞。
- **10 集逐集节拍模板**（E1 黄金三秒→E3 首个大反转→E5 公开反击→E7-8 波谷/卡点→E9 揭露→E10 终极清算）可直接进提示词。
- 主要来源：红果官方编剧教程、听花岛《情绪印钞机》、Filmustage、GitHub short-drama（2646 行方法论）、StoryPlay 8 维评估等。

### R2 通用 harness 调研（codex/gemini-cli/deepagents/letta/goose/smolagents，clone 读码）
- **质量闭环是行业标准**：Anthropic 三层验证（规则→视觉→LLM judge）+ deepagents RubricMiddleware（完成即评审、不过注入反馈续写）。
- **防跑偏**：codex update_plan 单 in_progress 纪律；压缩快照必须保留已批准计划与步骤状态（gemini `<state_snapshot>`）。
- **上下文工程三路线**：结构化压缩快照 / 文件系统即记忆（letta 已 git 化）/ memory blocks。
- **断点续跑**：JSONL 事件流+消息级 resume（codex rollout/resume_session_at）——我们 47 号能力面对齐，粒度可后续升级。
- 其余（steering 队列、子代理结构化回传、水位参数化）我们已有同构实现（43/40 号），本轮不动。

### R3 开源长文/剧本生成项目（9 仓库 clone 读码）
- **AI_NovelGenerator（最值得抄）**：写第 N 章配方含**下一章卡片（钩子）**；定稿回写三件套（摘要/角色状态树/向量库）；蓝图章卡含悬念密度/伏笔操作字段；节奏规则"每 3-5 章一个悬念单元、2 紧张+1 缓冲"。
- **story-skills**：伏笔 promise/payoff 台账+确定性 CLI 检查；"beat 细纲先经用户批准再写正文"的门。
- **Long-Novel-GPT**：块级"主编审阅→按意见重写"闭环；xy_pairs 滑窗对齐。
- **AgentWrite/LongWriter**：按段拆字数预算；字数与质量分开评测。
- **共同教训**：字数不足时 **enrich（扩写）优于整章重生成**；正文不回写圣经是 Sudowrite 用户最大痛点（我们的图谱回写链路已具备，是优势项）。

## 2. 根因诊断（代码证据）

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| 1 | 大纲生成是泛型"小说创作顾问"，无任何节拍/爽点/钩子指令 | `longwriting-ai.service.ts` generateOneLevelOutline："生成 5-15 章，概要 50-100 字" | 大纲无戏剧结构，正文自然平 |
| 2 | 章节生成只有衔接/一致性纪律，无钩子/爽点/字数纪律 | chapter-context.ts SYSTEM_PROMPT_TEMPLATE | 章尾无钩子，中段注水 |
| 3 | 上下文配方缺"下一章去向"——模型不知道本章要把故事落到哪里 | assembleChapterGeneration 只有上一章结尾，无下一章卡 | 收尾随意，集与集/章与章咬合松 |
| 4 | 剧本生成器是纯"正文→场景 JSON"转换器，无短剧改编规范 | script-generator.ts SCRIPT_GENERATION_PROMPT | 剧本不像能直接拍的短剧 |
| 5 | 生成后零质量闭环：字数不足不处理、正文截断不续写 | generateChapter 直落库；generateFullScript 用一次性 callAI(16000) | "效果不好"最直观的来源 |
| 6 | 大纲无 script 形态：经典管线不知道"集"的存在 | generateOutlineStory 只有卷/章/节三级 | 短剧只能靠研讨室分集卡，写作台路径缺位 |

## 3. 本轮实施（F1-F5）

| # | 内容 | 落点 | 要点 |
|---|---|---|---|
| F1 | **写作方法论模块**（纯函数、双消费方共用） | `src/core/platform/services/writing-methodology.ts` | 分集大纲纪律/章节四拍引擎/novel 钩子纪律+黄金三章/剧本改编纪律；R1 结论全部结构化为提示词素材 |
| F2 | **分集大纲 script 模式** | generateOutlineStory 加 `opts{contentTarget,episodeCount}`（handler/preload 透传，channel-map 自动透传） | script 模式输出 hook/highlight/cliffhanger/hookType 字段，并以【开场钩子】【本集爽点】【集尾卡点】结构化后缀并入 summary——**零迁移落库**，天然流入章节生成与转短剧桥 |
| F3 | **章节纪律注入+去向卡** | assembleChapterGeneration | contentTarget 决议链：显式参>项目 room 状态>summary 前缀探测；script 注入四拍引擎，novel 注入钩子纪律（前三章追加黄金三章）；注入下一章去向卡（R3 配方） |
| F4 | **剧本生成器升级** | script-generator.ts | 注入改编纪律；正文截断检测+续写一次（fail-soft）；顺带移除全量响应 console.log |
| F5 | **章节字数质量门** | `chapter-quality-gate.ts` + generateChapter/WithContext 接线 | <70% 目标字数 → 一次扩写 pass（R3：enrich 优于重生成），取更长结果，fail-soft；gate 结果随 data.qualityGate 透出 |

**测试**：新增 2 个 spec 共 11 例全绿；既有 EP script-generator + chapter-graph 23 例全绿；eslint 0 error；vue-tsc 基线不增。

## 4. R2 harness 借鉴的后续登记（本轮不做，按收益/成本排序）

> 归属标注（49 号补充）：**[RT]** = agent-runtime 通用机制层；**[LW]** = 长文业务域（platform/services/longwriting，消费方注册策略，runtime 保持通用）。

1. **[RT] Rubric 完成门**——**机制已存在**（26 号 M3 `agent-runtime/verify/verifier.ts` 四层验证：规则→沙箱→LLM rubric→人工灰区，VerdictDecision 带缺陷反馈回注=Reflexion 回路）。本轮调研确认无需新建；剩余工作是把字数门（F5）与 R7/R8 以 validator 形式注册进任务 spec。
2. **[RT] 结构化压缩快照模板**（gemini `<state_snapshot>` / goose JSON schema / codex handoff 四段式）：改 ContextManager 压缩提示词即可落地——保证计划/伏笔/人物状态在压缩后存活（"压缩保留计划状态"同源）。
3. **[RT] 前文外置+按需读取**（deepagents/letta MemFS）：数万字前文不进上下文，只注入路径+摘要块；与既有分层记忆（40 号）直接融合。
4. **[RT] memory blocks+git 化记忆库**（letta memory-git.ts）：可编辑记忆块带字符预算，写回带 reason、可回滚。
5. **[RT] saveState JSONL 化+消息级 resume/fork**（codex rollout + SDK `resume_session_at`/`drops_turn`）：47 号能力面升级——支持"从第 N 步重写"这一写作刚需。
6. **[RT] steering 统一队列**（codex tasks/regular.rs:92）：运行中插话在回合边界注入；审批请求本身入队。
7. **[RT] 子代理结构化回传 schema**：章节写手回传 `{章节,字数,POV,伏笔,TODO}`（≤2k token），全文走文件（deepagents TASK_TOOL_DESCRIPTION）。
8. **[LW] 钩子类型配额检查——✅ 已落地（49 号）**：ConsistencyService R7——script 分集项目（卡点标记过半）检查"缺集尾卡点/卡点未标钩型/相邻集同型"，单测钉死三类违规；《金瞳》实跑大纲 10/10 标注钩型且相邻全异 → 0 告警（干净通过）。
9. **[LW] 伏笔 promise/payoff 台账——✅ 已落地（49 号）**：ConsistencyService R8——回收早于埋设→error；open 状态超过埋设章+5 章未收→warning。《金瞳》实跑出 5 条超期告警（第 1-5 集埋的伏笔写至第 10 章未收——正是第二季钩子，告警真实有效）。
10. **[RT] 审批 Granular 化+无人值守降级**（codex GranularApprovalConfig / goose headless）：长跑预授权+自动降级+可回滚，绝不卡死。

## 5. 端到端验收：10 集剧本《金瞳》

- 路径：长文项目（概要→分集大纲 script 模式→逐集正文+质量门）→ EP 项目（outline 关联模式建 10 集）→ 逐集 generateScript → 导出 markdown。
- 脚本：`scripts/lw10-episode-script.cjs`（断点续跑）；前提与逐集节拍：`/tmp/lw10-premise.json`（金瞳鉴宝+身世复仇双爽点线，按 R1 节拍模板设计）。
- 产出与质量评估见 `docs/design/2026-09-09-writing-quality-run-report.md`。
