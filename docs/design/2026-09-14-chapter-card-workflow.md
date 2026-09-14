# 长文核心概要质量 + 章节写作章法（章节卡工作流）

日期：2026-09-14
来源：用户对《大宋女捕·复测》的两条意见
关联：docs/design/2026-09-14-longrange-consistency-r10.md（前情事实表+R10）、49 号写作质量优化

## 用户意见 → 改动映射

### 意见一：概要只有一句话，没有核心故事；故事线/人物/地点设定太简单

**根因（读码证据）**：`IdeaInputStep.vue` 的蓝图指令要求输出"一句话概念"，确认时把
这一句话直接写入 `story_overviews.summary`——概要单薄是流程设计使然；后端
`generateStoryOverview` 的 500 字要求被前端指令覆盖。更严重的是：正文生成的
overview 段只注入标题/类型/核心冲突，**概要与风格从未进入任何一章的写作上下文**。

改动：
1. `generateStoryOverview` 提示词重写：summary 必须是 400-600 字核心故事，
   硬性覆盖五环——主角起点→欲望与转机→两个关键转折→终局方向，紧扣主角命运；
   新增 `styleTone`（风格基调 80-150 字）；角色 brief 要求"身份+欲望+与主线纠缠"
   80-150 字。以用户给出的两种模式（寒门弱体获秘籍成一代宗师 / 两小无猜历经
   苦难终成眷属）作为"合格概要"示范。
2. `IdeaInputStep.vue` 蓝图流程：新增「核心故事概要」「风格基调」编辑区，
   确认时 `summary = 核心故事全文 + 【风格基调】`；一句话概念降级为可选宣传语。
3. **核心基调注入每一章**：`assembleChapterGeneration` 的 overviewText 补入
   核心故事概要（截断 900 字）与风格基调，标注"全书总纲，本章写作不得偏离"。
4. 质量条：
   - 人物：background ≥80 字四层（出身/欲望/障碍/秘密反差）；majorEvents 必须
     挂主线节点；personality 要内在张力；反派要动机链。
   - 故事线：summary 100-200 字四拍（起因→升级→转折→本线终点）+ 与主线纠缠点；
     第一条必须是主线。
   - 地点：description 80-150 字三层（场景特征/氛围/故事功能）。

### 意见二：写章节没有章法，应先设计情节概要/爽点钩子→自检→设计出场实体→一致性检查→再写

**现状澄清**：正文生成原是"按钮→一次性 LLM 调用"，既非 agent 自主，也无结构化
设计步骤；大纲概要直接进写手提示词。

改动（向导写作流程固化为五步章法）：

```
设计本章（generateChapterCard：情节概要/开场钩子/爽点/章尾卡点+钩型/出场实体/伏笔动作）
  → 自检（结构校验硬伤打回 + LLM 对照全书总纲与前情审卡 → issues 清单展示）
  → 人确认（confirmPrewrite，未确认前正文按钮禁用）
  → 一致性门禁（既有 conflict-gate：R1-R10 未处理疑点直接拒绝生成）
  → 写正文（设计卡经【预写提纲】注入 + 全书概要/风格 + 前情事实表）
```

实现：
- 新模块 `chapter-card.ts`（纯函数）：ChapterCardData 类型、markdown 构建与
  钩型解析（相邻章钩型轮换约束进生成提示）、结构校验。
- `LongWritingAIService.generateChapterCard`：过圣经门+冲突门后生成卡片，
  注入全书概要/相关故事线/上一章状态摘要/上一章钩型，随后一次 LLM 自检。
- handler `GENERATE_CHAPTER_CARD`：生成→落库未确认 prewrite（按 outlineId
  upsert 幂等）→出场实体名→id 解析并入大纲 involved（解析失败名单返回前端提示，
  不入册）。
- **章节卡门禁**：`generateChapter` / `generateChapterWithContext` 默认要求存在
  已确认设计卡，否则拒绝正文生成；script 分集项目不设此门；自由工作台
  （ChapterStage）显式传 `skipChapterCardGate` 跳过。
- `ChapterWizardStep.vue`：章节编辑器新增设计卡区（设计/重新设计、自检问题
  展示、未登记人名提示、确认设计），未确认前"生成本章"按钮禁用。

## 验证

- 单测 25/25（新增 chapter-card.spec 5 例：markdown 往返/钩型解析/结构校验）。
- vue-tsc 基线对比：改动前后长文相关告警数量持平（新增告警已清零）。

## 后续项

- 概要丰富度门（summary 长度/五环关键词检测→自动回炉一次）未做，靠提示词硬性
  要求 + 蓝图 UI 可编辑兜底。
- 章节卡的 LLM 自检当前单轮；可与 R10 大纲落点校验联动（设计卡先行声明落点）。
- 研讨室 agent（story-room）设计阶段的卡片质量条可复用本套提示词要求。
