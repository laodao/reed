# 调研经验固化为技能（research-method）设计

> 日期：2026-09-09 ｜ 关联：`design-v2.md`、`research-brief-design.md`、`run-budget-design.md`
> 状态：已实现（用户批准：技能 + 模板改造 + 测试全做；经验只放一个技能）——落地记录见
> `progress/2026-09-09-topic-research-workflow.md` v6

## 1. 问题：经验长在提示词里，所以只能一次次调参

前面几轮的弯路是同一个：把「一份调研报告该有什么」直接写进模板节点的 `systemPrompt`。
结果是——写少了报告单薄，写多了就变成领域硬编码（贡献利润公式、D1–D90 时间线），
换个主题（比如「学吉他」「选 ERP」）这些当量纲塞进去就跑偏，只能再改提示词、再跑一轮、
再看指标。**这类内容不是工作流的编排逻辑，是调研这门手艺的经验**，应该独立存在、
可复用、可被别的调研任务（聊天 Agent、其它工作流）取用、可由用户复制后自行改。

本仓已有承载物：技能库（`SKILL.md`）。技能 = 目录包（YAML frontmatter 清单 + markdown
任务正文），内置技能在 `src/core/platform/workflow/skills/builtin-skills.ts`，
可被两处使用：

- 聊天 Agent：`discover_capabilities` 发现 → `invoke_skill` 调用（`system-agent-tools.ts`，注册进 agent-loop 同一 registry）；
- 工作流：`skill-call` 节点按技能 `inputs` schema 参数化执行（`nodes/skill-nodes.ts`）。

## 2. 结论：新增内置技能 `research-method`

把用户点名的三件事，加上验收口径，一起固化成一个**领域无关**的方法技能：

| 用户的问题 | 技能里对应的经验 |
| --- | --- |
| 一个调研报告应该包含哪些内容 | 报告骨架：章节 × 每章要回答什么 × 呈现形态（含执行摘要/口径/证据/风险/行动/局限/来源/附录） |
| 应该从哪些方面做分析 | 分析维度矩阵：维度 × 要回答的问题 × 关键指标 × 常见误区（按主题类型裁剪，不硬凑） |
| 应该从哪些地方获取数据 | 数据来源路由：来源类型 × 去哪取/取哪些字段 × 可靠性分级 × 时效 × **取不到时的降级路径** |
| （隐含）怎么算做完 | 取证与呈现纪律 + 执行计划与验收标准（must-answer、证据规则、停手条件） |

关键纪律：技能里出现的一切具体形式（公式、时间线、矩阵）都是**类别 + 示例**，
由模型按当前领域实例化；技能自身不含任何单一领域的结论。

## 3. 技能规格

- id：`research-method`（kebab-case，符合 `SKILL_NAME_PATTERN`）
- title：调研方法（报告内容 · 分析维度 · 数据来源）
- category：调研
- when_to_use：要调研一个领域/主题/做法，需要先定「报告写什么、从哪几个方面分析、去哪里取数、什么算做完」时
- inputs（同时服务聊天调度与工作流节点）：

| key | label | type | 说明 |
| --- | --- | --- | --- |
| topic | 调研主题/领域 | textarea | 必填 |
| goal | 决策目标/交付物 | string | 研究为哪个决定服务 |
| domainType | 主题类型 | select | 自适应/做法流程/概念知识/决策选型/行业趋势/技能方法 |
| depth | 深度档 | select | 速览/标准/深度 |
| constraints | 已知约束 | textarea | 主体/地区/时间/预算/已有资源/合规限制 |
| requiredOutputs | 必达产出 | textarea | 例如必须给单位经济公式、逐日时间线、可点击来源 |
| knownContext | 已知信息与已有材料 | textarea | 先验地图与去重依据（可选） |

- output_desc：markdown 调研方案，固定六节 ——
  ① 范围与决策目标（含不回答什么）② 报告骨架 ③ 分析维度矩阵
  ④ 数据来源路由 ⑤ 取证与呈现纪律 ⑥ 执行计划与验收标准
- 正文（技能主体，即经验本身）要点：
  - 报告骨架：结论先行的执行摘要 → 口径与范围 → 现状/背景 → 主体分析章节 → 数据与证据（表格/矩阵/公式/时间线）→ 方案与路径（分场景/分主体/分地区 + 决策树）→ 风险与合规红线 → 行动清单与门槛条件（何时做/停/扩）→ 局限与待核验清单 → 参考来源（分层 + 可点击 + 采集时间）→ 附录（术语/工具/模板）
  - 分析维度库（约 18 项）：定义与边界、主体与角色、全流程环节、准入与资质合规、成本与单位经济、定价与收益、需求与规模、竞争与替代、供给与供应链、渠道与流量、运营节奏与时间线、工具与技术、人才与组织、风险与红线、门槛与退出条件、时效与趋势、分歧与不确定性、常见失败模式
  - 数据来源路由（约 8 类）：官方一手（监管法规原文/平台官方文档与费率页/政府与统计口径）、平台后台与账户内（需登录复核，标注为非阻塞项）、行业与市场数据（研究机构/协会/统计年鉴/招投标）、公开财务与公告（上市公司财报/年报/公告）、学术与专利（论文库/专利库）、从业者与社区（垂直论坛/问答/评论区/访谈）、竞品与实测（公开页面抓取/自行试用/第三方流量与广告库）、工具与数据库（关键词/广告库/海关/店铺数据）；每类给「去哪、取哪些字段、可靠性级别、时效、取不到时怎么降级」
  - 检索策略：中英双语关键词、站点限定与时间限定、一手优先、关键论断至少两个独立来源交叉、SPA 登录墙与反爬的现实预期
  - 取证纪律：先验/已验证/未查到三态标注；禁止编造标题、URL、数字、引文；矛盾并列；费率政策标采集时间与「以官方最新为准」；反方观点与回应
  - 验收口径：must-answer 逐条给颗粒度、证据层级（官方一手/后台需复核/二手估算/未查到）、深度档要求、非阻塞项（只能靠用户后台或官方核验的）不算未完成
- `disable_model_invocation` 不设置：允许聊天 Agent 自主调用。

## 4. 模板如何消费技能（关键：删掉内联经验，保留编排）

`builtin-apps/topic-research.json` 改造为「技能出方案 → 节点把方案编译成契约 → 循环执行」：

```
start → clarify → method1(skill-call: research-method) → plan1(llm-chat, jsonMode)
      → round1(until 循环: r1 → e1 → pack1 → loop-back) → writer → report1 → final1 → save1 → end
```

- 新增 `method1`（skill-call）：`skillId: research-method`，参数由 start/clarify 注入
  （topic/focus 并入 topic、goal/constraints/requiredOutputs/depth），模型用研究模型。
- `plan1` 瘦身成「契约编译器」：删除内联的主题类型骨架、验收标准深度化细则、信息源策略
  （这些已进技能），改为引用 `{{method1.content}}`，只负责：先验地图、把技能方案落到本主题、
  把用户契约（outputSpecs/outputRequirements/参照样本）转成可逐条判定的 acceptance、输出 JSON。
- `writer` 引用 `{{method1.content}}` 的骨架组织正文；保留用户规格硬契约与纪律两句，删除内联的
  领域特定形状清单（公式/时间线/D1–D90 等由技能按类别 + 用户契约决定）。
- `r1`/`e1` 保持执行体与独立评审的纪律（工具用法、增量、预算感、verdict 判定口径），不动。
- 不填 `outputSpecs`/`outputRequirements` 时，报告形态完全由技能按主题类型决定 —— 这正是本次要的「不偏」。

边界一句话：**技能=跨任务经验；模板=编排 + 用户契约；节点提示词=该节点的执行/评审纪律。**

## 5. 测试与验收（TDD）

1. 新增 `tests/unit/core/platform/workflow/builtin-skills-research-method.spec.ts`
   - frontmatter 可解析、`name=research-method`、category/when_to_use/inputs 齐全；
   - 正文含六节骨架与三类经验（报告内容/分析维度/数据来源）；
   - 来源路由覆盖官方一手、平台后台、行业数据、财务公告、学术专利、从业者社区、竞品实测、
     工具数据库，且每类有降级路径；
   - 含取证纪律关键词（未查到、禁止编造、可点击来源、反方、采集时间）；
   - 领域无关自检：不得出现单一领域专有名词（如 TikTok/抖音/亚马逊）作为硬结论。
2. 扩展 `tests/unit/core/platform/workflow/topic-research-graph.spec.ts`
   - 节点数 13、`method1` 为 skill-call 且 `skillId` 必须存在于 `BUILTIN_SKILLS`（防漂移）；
   - `plan1`/`writer` 的提示词引用 `{{method1.content}}`；
   - 模板内联提示词不再包含领域特定硬要求（断言 `plan1`/`writer` 的 systemPrompt 不含
     「贡献利润」「D1–D90」——它们已移入技能，且仅在 outputSpecs 选项标签里以用户可选形式出现）。
3. `builtin-app-templates.spec.ts` 全量模板校验保持通过（graph 校验 + 节点配置校验）。

## 6. 不做

- 不改引擎、技能解析器、技能节点：现有 `skill-call` + `invoke_skill` 已足够。
- 不动 `learning-*` 技能与其它模板。
- 不把主题专属澄清项（主体/执照/市场/亏损承受）搬进通用技能：那是具体工作流的用户契约，
  不是调研经验。
