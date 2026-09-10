# 「主题深度研究」工作流重设计 v2（方法论层，草稿）

日期：2026-09-09
分支：feat/domain-learning
文档目录：tasks/2026-09-09-topic-research-workflow/
关联：design.md（v1，线性版，已被用户否定）；tasks/2026-09-07-domain-research-workflow/design.md（KB 落库线，未实现）

> 状态：本文先落「方法论内核」；「产品原语映射 / 实现路线 / 平台增强清单 / 验收」各节等执行原语调研报告返回后补全。
> 用户原话（驱动本轮重设计）："这是网上搜几篇网页就可以搞定的吗？……是一个不断循环提升的过程，先基于模型的认知，针对用户输入的主题，规划研究的步骤（不同领域的主题可能不太一样）和验收标准（要达到怎样的深度），然后逐步执行，过程中可能需要模型自身的知识，也可能需要联网搜索，也可能需要检索知识库（……看系统有哪些知识库……自行检索），也不是一轮就结束，应该每轮结束后让另一个 AI 模型做评估，如果认为达不到目标就继续回头研究，而且整个执行过程中是允许与用户交互、向用户确认信息的。……先仔细思考这个主题研究到底要怎么做才能做好（是做好，不是做个样子）。"

---

## 0. 复盘：为什么 v1（搜索→综述→成文）不合格

v1 的本质是一条"**一次采样即定稿**"的流水线：规划子问题→逐问搜一次→摘要→合并成文。对照用户批评逐条认账：

| v1 的缺陷 | 表现 |
|---|---|
| 起点错误：不澄清就开工 | 把"研究主题"当成自明的输入，不问用户要解决什么问题、在什么背景（地区/身份/预算/已有基础）下研究——TikTok 开店在美区/东南亚、个人/企业、有/无货源，结论完全不同 |
| 无验收标准 | 模型没有"做到什么程度算好"的标尺，摘要凑齐就"完成"，深度全凭运气 |
| 无领域适配 | 所有主题套同一模板；而"做法/概念/决策/行业"类主题的查法、信息源、验证方式不同 |
| 无迭代 | 单程；检索到的表面信息不足/矛盾/有缺口时不会回头补查；幻觉与漏洞无人复核 |
| 知识源单一 | 只用联网搜索一次；没有把"模型自身认知"当作可标注的起点假设，没有检索用户私有知识库（很可能早有相关沉淀），没有对高价值网页做正文级深读 |
| 无独立评估 | 写作者与审查者是同一次调用同一个模型，自说自话；用户要求"另一个 AI 模型"做评估正是要砍掉这种自评偏差 |
| 无用户交互 | 全程无确认；关键背景信息靠猜 |
| 无溯源与可信度 | 输出无法回答"这句话能信吗/依据是什么"，来源是转述不是锚 |

结论：主题研究不是"内容生成任务"，是**研究运筹任务**——它需要一个"研究执行体"按 澄清→规划→分轮执行(多源)→独立评估→差距驱动迭代→用户协同→收敛沉淀 的协议工作，并受预算与质量护栏约束。

---

## 1. 方法论内核：「主题深度研究」= 受控的研究运筹

### 1.1 目标澄清与契约（起点，人与模型共同定标）

先对齐再动手，产出《研究契约》：
- **真问题**：用户想通过这次研究达成什么（做决定？照做？学会？汇报？写方案？）；一句话版本与追问版本。
- **背景变量**（随主题类型不同，做法类必含示例）：地区/市场、身份（个人/企业/新手/从业者）、资源与预算、时间窗口、已有基础与已有资料、语言与格式偏好、禁区（不想研究的）。
- **验收标准（操作化）**：①必须回答的问题清单（must-answer，每个问题写明需要到多深）；②覆盖维度；③证据要求（哪些关键论断需要 ≥N 个独立来源/官方一手资料）；④交付形态与篇幅档；⑤预算（最大轮数/工具调用数/时长）。
- 用户可"跳过澄清直接研究"（用默认档），但契约仍要生成并展示。

### 1.2 规划（以模型认知为起点，按主题类型定步骤）

- 先让模型**凭自身认知写"已知地图"**（K-map）：这个主题下已经知道什么、有哪些关键概念/主体/环节/分歧、哪些是常识哪些可能已过时——这些是"先验假设"，随后的执行负责验证或修正，而不是假装不知道。
- **主题类型判别 → 步骤模板**（模板只是骨架，允许模型按具体主题增删改序）：

| 类型 | 典型主题 | 默认研究步骤 |
|---|---|---|
| 做法/流程类 | TikTok 开店、跨境电商起步 | 目标与结果拆解 → 全环节步骤（每步：做什么/需要什么/卡点）→ 资质/合规/费用 → 运营与获客方法 → 工具与资源 → 常见坑与规避 → 执行优先级与验收 |
| 概念/领域知识类 | 量子纠错、注意力机制 | 定义与边界 → 原理/机制 → 主要流派与分歧 → 关键人物/成果 → 证据与实验 → 反例与局限 → 最新进展 → 开放问题 |
| 决策/选型类 | 买什么 ERP、选哪个市场 | 选项清单 → 每项成本/收益/风险/适用条件 → 对比维度与权重 → 打分 → 推荐 + 备选 + 适用边界 |
| 行业/趋势类 | 某赛道怎么样 | 市场规模与数据 → 竞争格局 → 主要玩家 → 政策与监管 → 供需与成本结构 → 趋势与信号 → 风险清单 |
| 技能/方法类 | 如何提高口语 | 原理与路径 → 分阶段练法 → 常见错误 → 评估方法 → 资源 |

- 每个规划步骤给出：目标、**首选信息源策略**（先验自答→私有知识库→网络搜索/深读→问用户）、大致预算分配、怎么算"这步完成"。
- **验收标准从契约带进来**：规划与验收绑定，而不是到最后才想起来。

### 1.3 执行：分轮、多源、笔记驱动（不直接写正文）

- 信息分四层，各带标签与可信度规则：
  - **A 模型先验**：直接可用但要显式标注"先验、未验证/可能过时"，随后必须有检索或用户证据托底才升级为结论；
  - **B 用户私有知识库**：先"发现系统里有哪些知识库、是否有与主题相关的"，命中才检索，引用到**文档名/片段**；私有库是个人积累，价值最高也最不该漏；
  - **C 公开网络**：搜索→筛选权威/一手→必要时抓正文深读（只看标题列表等于没读）；结论必须锚到实际抓到的内容；
  - **D 用户澄清**：凡"只有用户知道的信息"（自己的地区/资质/预算/目标）不猜测，去问。
- 过程产物是**研究笔记条目**，不是正文：`{子问题, 阶段结论, 证据(带来源锚), 置信度, 矛盾/缺口, 状态(草稿/已验证/放弃)}`。缺口的子问题登记进"待研队列"。
- 来源纪律贯穿：不编造 URL/数字/引用；结论可溯源；时效与地区适用标注；冲突并列不掩盖；"没查到"与"不存在"区分。
- 工具调用要**有预算感**：一次搜索只花一次，先想清楚查什么、去哪查、查多深；重复/停滞要能被检测。

### 1.4 独立评估（另一个 AI 模型，按验收标准审稿）

每轮（或每达成一个里程碑）之后：
- 评估器拿到的是：**验收标准 + 本轮研究报告/笔记 + 证据锚摘要**，独立输出：
  - 逐 must-answer 判定：覆盖(有/部分/无)、深度(够/不够)、证据强度(强/中/弱/无据)、来源质量；
  - 幻觉嫌疑清单（哪些论断在证据里找不到支撑）、时效风险、地区误用、遗漏维度；
  - 总体：`通过` 或 `不通过`，并给出**差距清单**（每项：差距→建议下一步查什么/问谁）。
- 为什么用另一个模型：作者容易自我背书；换一个视角按契约审，能抓住"看起来完整实则空洞"。
- 评估结果进入下一轮规划（差距→新子问题入队），并同步给用户可见。

### 1.5 差距驱动迭代（有界，不无限空转）

- 未通过 → 把差距清单转成下一轮研究任务（带目标源与优先级）→ 回到执行；通过 → 进收敛。
- **停止规则（多闸并取先到）**：①验收通过；②达最大轮数/预算（输出"尽力而为+剩余差距"并如实说明）；③连续停滞（多轮无新证据/重复检索）→ 建议收尾或换策略；④用户中途叫停/改方向。
- 每轮结束允许向用户简报：已覆盖/仍未决/预算使用，并给"继续/调整/收尾"选项——由用户在关键路口把关，而不是每步都打断。

### 1.6 人机协同点（克制地交互）

不是全程聊天，而是三类点必问：
1. **起点澄清**：研究契约里的关键缺口（1~3 问，可跳过）；
2. **途中事实缺口属用户私有**：背景变量缺失影响结论方向时提问（如"你做 TikTok 想进哪个市场/是个人还是企业"），不猜；
3. **轮间把关与终稿复核**：里程碑给用户选择 + 终稿 human-review（可编辑、通过才存档）。

### 1.7 收敛成稿与沉淀

- 终稿结构：**执行摘要（含"结论可信度"总评）→ 正文（按规划章节；关键论断带证据锚与来源）→ 方法说明（查了什么、没查到什么）→ 局限与未决 → 后续可研究清单 → 参考来源（网络 + 私有知识库文档分开列）**。
- 沉淀（用户确认后）：①文本资产（既有能力）；②可选：把研究结论以"文档/条目"形式写回知识库——让本次研究成为未来研究的私有语料（飞轮），落库走确定性路由与幂等键，不重复堆积。

### 1.8 质量护栏（贯穿全流程的硬纪律）

1. 禁编造证据、URL、数字、引文；不确定必须标注"需核实/可能"。
2. 先验与证据冲突 → 以证据为准并说明"模型原认知被修正"。
3. 每条关键结论至少一个**证据锚**；"看起来完整"不是目标，"可核实"才是。
4. 诚实承认"该点资料不足/无权威来源"，而不是补一段貌似专业的废话。
5. 大额/外部动作（发请求、抓全站、写库）前有审批；耗时有预算闸。
6. 涉及费率/政策/资质等易变信息 → 标注采集时间并提示以官方最新为准。

---

## 2. 验收示例剧本（做法类：「在 TikTok 上开店怎么做」）

好的研究工作流跑起来应大致是：

1. **澄清（≤3 问，可跳过）**：目标市场（美/英/东南亚…）？个人还是企业主体？已有 TikTok 账号与货源吗？预算与期望时间？
   ——答案决定后面所有检索方向（各站点入驻资质、回款与税务差异巨大）。
2. **先验地图 + 规划**：模型先自述认知（TikTok Shop 地区版图/入驻方式/流量逻辑…，标注哪些可能已过时），按"做法类"骨架规划：站点与入驻资质→店铺搭建与商品上架→内容与达人带货运营→物流与回款→税务与合规→成本与风险→常见坑；
3. **执行（多源、分轮）**：web 搜官方卖家中心/政策页并深读；检索用户私有知识库（如用户已收藏的跨境资料）；关键差异点（如美区 ACCU 店铺/本土店区别、回款周期、税务登记）逐个落笔记并带来源；背景变量缺时中途问用户；
4. **独立评估**：另一个模型对照"验收标准"审稿——"入驻资质是否分站点说清？官方依据有几条？回款/税务是否遗漏？有没有无据断言？"
5. **迭代**：若评估指出"东南亚各站点门槛未区分/来源偏自媒体"→ 下一轮定向补官方页与当地合规要求；
6. **收敛**：通过 → 成稿（执行摘要含可信度 → 分站点步骤与门槛 → 运营方法 → 费用与合规 → 风险 → 来源与局限）→ 用户复核 → 存档/（可选）沉淀入知识库。

---

## 3. 产品原语映射（已逐条代码核实）

| 方法论需要 | 产品原语 | 证据 |
|---|---|---|
| 研究执行体：自主多轮决策 + 工具调用 | **agent-loop 节点**（config: task/systemPrompt/toolWhitelist/maxIterations/maxToolCalls/maxDurationMs/providerConfigId/modelId；输出 answer/iterations/usage/trajectoriesSummary） | nodes/agent-loop-node.ts:584-663；workflow.types.ts:491-504；目录 workflow-node-catalog.ts:254-257（编辑器可配，workflow-node-forms.ts:207） |
| 每轮挂什么工具 | agent-loop `toolWhitelist`：`web_search`（内置读）、`wf_web_extract`（正文深读，node 读工具 autoApprovable）、`wf_kb_retrieve`（私有知识库检索，node 读工具，参数 knowledgeBaseId/query/topK/threshold）、`http_get`；读工具在 workflow 内免审批（autoApprovableInWorkflow） | tools/node-tool-adapter.ts:31-124；boot 注册清单见运行日志 |
| "看系统有哪些知识库→挑相关→自行检索" | **缺口（平台增强 P1，见 §4）**：现无"列知识库"工具/节点；wf_kb_retrieve 需要调用方已知道 knowledgeBaseId。P1 落地前用 start 的 `select-dynamic(source=knowledgeBases, multi)` 让用户先勾选允许检索的库，agent 只能检索这些 | node-tool-adapter.ts:94-124；start 动态源 workflow.types.ts:125-134 |
| 向用户澄清/确认（起点、轮间、终稿） | **form-collect 节点**：运行中挂起弹声明式表单（string/number/boolean/select/file/list-check），提交值进 `{{form.values.xxx}}`，approve 继续 / reject 取消——恰是"向用户确认信息"通道；**message 节点**：向运行时间线输出说明 | nodes/interaction-nodes.ts:5-9,40-112；表单类型 FormFieldDef:18-38 |
| "每轮结束后另一个 AI 模型评估" | 每个 llm-chat 节点独立 `providerConfigId/modelId` → 评估节点用 start 输入的 **evaluatorModel**（默认可与研究模型不同；模板把"第二模型"做成显式输入，用户可各选一个） | 参考 industry-research.json:44-46（逐节点模型配置即现成用法） |
| "不达标带差距继续研究"（while 再入） | **引擎暂无 while/循环再入**（control-semantics.ts:8 注释：V2 扩展路径才考虑）→ 采用**有界轮次级联**：K=3 轮研究-评估对，前向边 + condition 闸，通过即提前进终稿，不通过带差距进下一轮；第 3 轮后无论是否通过都进终稿（未收敛差距如实写入报告）。**替代"无限回圈"用"有界多闸"**（预算可控），深度不是靠圈数而是靠每轮 agent 的 maxToolCalls/maxDurationMs 与差距清单质量 | engine/control-semantics.ts:8,19-30；nodes/control-nodes.ts:123-163（condition 分支） |
| 验收标准 / 计划 / 类型适配 | planner = llm-chat(jsonMode)，任务=以模型认知写"已知地图"+判主题类型+出步骤骨架+验收清单；契约经 form-collect 与用户对齐后注入 | llm-chat jsonMode 输出 parsed：task-nodes.ts:130-236 |
| 检索多条私有库一次合并 | kb-query-multi（knowledgeBaseIds 多选→逐库检索→按分合并去重，输出含 documentName）——评估/终稿前可选"对存疑点回库复核" | nodes/ai-nodes.ts:120-203；catalog:299-305 |
| 过程产物/跨轮传递 | 各研究轮 agent 的 answer = "研究笔记（浓缩，带证据锚与缺口）"，下一轮 task 模板注入 `{{rN.answer}}` 与上轮评估 `{{eN.parsed.gaps}}`；**编辑可配**（表单齐全） | workflow-node-forms.ts（condition/human-review/agent-loop/form-collect/message 均有表单） |
| 终稿复核后落库 | form-collect 终稿闸（textarea 默认值 = 终稿全文 → 用户可改 → `{{final.values.content}}`）→ save-asset；取消走 reject 边不落库 | interaction-nodes.ts FormFieldDef（defaultValue 支持模板） |

### 3.1 图结构（K=3 有界轮次级联；约 15 节点）

```
start
  inputs: topic(textarea 必填) / focus(多选:总体认识|详细步骤|注意事项|运营方法|工具与资源|常见问题,可空=按主题自适应)
          / depth(quick|standard|deep：提示词口径与篇幅档) / kbs(select-dynamic knowledgeBases multi 可空——允许检索的私有库)
          / researcherModel(model 必填) / evaluatorModel(model 必填,可与研究者不同=第二模型)
  （迭代用固定 3 轮级联表达，评估通过即提前进终稿；无 maxRounds 输入）
  │
  ▼
clarify(form-collect)  研究契约：goal(想达成什么/怎么做用), context(背景/地区/身份/预算/已有基础，可空=跳过)
  │ approve
  ▼
plan1(llm-chat jsonMode, researcherModel)
  任务=凭自身认知写【已知地图(标注哪些可能过时)】→【主题类型】→【研究步骤(按类型骨架裁剪)】
  →【验收标准(必须回答的问题+深度+证据要求)】→【信息源策略(先验/私有库/网络/问用户)】
  输出 parsed: { type, knownMap, steps[], acceptance, sourcePlan }
  │
  ▼
r1(agent-loop, researcherModel)
  toolWhitelist: web_search / wf_web_extract / wf_kb_retrieve / wf_kb_list
  （P1 已落地：先 wf_kb_list 看系统有哪些库→挑相关→wf_kb_retrieve；read 工具 workflow 内免审批）
  systemPrompt = 研究执行体契约（§1.3+§1.8）：先验标注、证据锚、禁编造、缺口入队、预算感、多源交叉
  task = 契约(goal/context) + plan1(parsed) + 第 1 轮指令：按步骤执行，输出浓缩研究笔记
  │
  ▼
e1(llm-chat jsonMode, evaluatorModel)  独立评估
  输入=契约+验收标准+{{r1.answer}}（+可检索到的证据摘要）
  输出 parsed: { verdict: pass|revise, perAcceptance[], gaps:[{issue,action,priority}], hallucinationRisk[], overall }
  │
  ▼
c1(condition)
  ├─ e1 通过(pass) ──────────────► writer
  └─ 未通过 ─► r2(同上, task 注入 {{r1.answer}}+{{e1.parsed.gaps}}，按差距定向补查)
                 │
                 ▼
               e2(同上) ─► c2(condition)
                 ├─ 通过 ──────────────► writer
                 └─ 未通过 ─► r3(task 注入前两轮笔记与 e2 gaps)
                                │
                                ▼
                              e3(同上，第 3 轮评估) ──► writer（无论通过与否，未收敛差距如实写入）
  │
  ▼
writer(llm-chat jsonMode, researcherModel)
  结构：title/execSummary(含可信度总评)/body(按规划章节,关键论断带证据锚)/method(查了什么/没查到什么)
        /limits(局限与未决)/sourcesMd(网络来源+私有库文档分开列)/disclaimer
  │
  ▼
report1(report: 拼装 writer.parsed 各字段为整篇 Markdown 全文)
  │
  ▼
final1(human-review)  终稿人工确认：payload=全文，editableFields=[content]（可改全文，改后保存改版）
  ├─ approve ─► save1(save-asset: kind=text category=text subCategory=研究简报
  │                content={{final1.content}} name={{start.topic}}深度研究 tags=主题研究,{{start.topic}})
  │                ─► end
  └─ reject ────► end（不落库，用户可改后重跑）
```

## 4. 实现路线与平台增强清单

**结论：无需改引擎；主体是 1 份内置模板 JSON（升级替换原 topic-research.json，同 id 同 appId）。** 已按用户评审确认全部落地（2026-09-09）：
1. `src/core/database/migrations/builtin-apps/topic-research.json` 重写为 v2：16 节点 19 边（比 §3.1 草图多一个 `report1` 拼装节点，位于 writer 与 final1 之间），研究/评估提示词内联 §1.8 全部纪律；
2. `create-builtin-apps.ts`：注册条目升级改名「主题深度研究」（升级替换，非并存）；**迁移 UPDATE 分支补同步 name/description/category**——未接管定义（template_version≠0）在模板改名时随启动同步，接管定义不受影响（spec 已覆盖改名同步与接管保护）；
3. **平台增强 P1 已实施**：`wf_kb_list` 只读工具（tools/node-tool-adapter.ts，source=node / danger=read / workflow 内免审批 / 无入参，返回 `{kbs:[{id,name,description,documentCount}],count}`）——研究执行体可"先看系统有哪些库→挑相关→wf_kb_retrieve"；
4. 测试：topic-research-graph.spec（v2 图断言 11 例）+ builtin-app-templates（全量校验）+ create-builtin-apps（改名同步）+ agent-tool-adapters（wf_kb_list）→ 4 files 39 passed；eslint 0。

**明确不做（诚实边界）：**
- **P2（后续，中）**：引擎 while/再入 loop（control-semantics V2）——支持"直到达标"的无限有界迭代而不是固定 3 轮级联。本任务不实施，当前以"≤3 轮级联 + 每轮 agent 预算护栏"表达有界迭代，评估通过即提前进终稿、第 3 轮后未收敛差距如实写入报告。
- 同一轮内"研究 agent 内嵌第二模型评估"（agent-loop 单模型约束）不做——评估用图级独立 llm-chat 节点并显式使用 evaluatorModel 满足"另一个模型"要求。

## 5. 验收口径

- G1 自动：新模板过 validateGraph/目录存在性；图 spec 断言：start 含 topic 必填/kbs(select-dynamic knowledgeBases)/双模型(researcherModel+evaluatorModel)、clarify(form-collect goal/context)在 plan 前(approve/reject 边)、plan1 jsonMode、r1..r3 为 agent-loop 且 toolWhitelist 含 web_search/wf_web_extract/wf_kb_retrieve/wf_kb_list、e1..e3 用 evaluatorModel 引用且 jsonMode 输出 pass/revise、c1/c2 条件分支 pass→writer / revise→下一轮、e3→writer 直连、writer→report1→final1(human-review, editable content)→approve:save1(content={{final1.content}})/reject:end、agent-loop 均有 maxIterations/maxToolCalls/maxDurationMs 护栏、提示词含§1.8 纪律关键句（禁编造/证据锚/未查到/以官方最新为准）。
- G2 真机剧本（TikTok 开店）：运行→弹出契约表单（用户可填市场/主体/背景）→plan 输出类型"做法类"与验收清单→R1 联网+（勾库后）检索私有库→E1(另一模型)评估指出差距（如"各站点入驻门槛未区分、回款/税务未覆盖、来源偏自媒体"）→未通过→R2 定向补官方卖家中心/合规页→E2→（必要时 R3）→writer 成稿（执行摘要含可信度、分站点步骤、费用合规、来源分开列网络/私有库、局限与未决）→final 表单可改全文→保存资产。
- G3 停止与预算：任一轮 agent 触顶（maxToolCalls/maxDurationMs）不崩流程且如实汇报；e 未通过到第 3 轮后照常进终稿并标注"未收敛项"。
- G4 可编辑：编辑器打开该模板，所有节点表单可改（不是黑盒）。
- G5 回归：既有模板全量校验绿；eslint 0。

## 6. 状态
- §0-§5 齐备并**已通过用户评审**；v2 模板 + P1 + 迁移改名同步 + 测试全部落地（2026-09-09）。
- 定向 spec 4 files 39 passed；eslint 0；本地提交（push 待用户指令）。
- 待用户：应用内真机验收（重启后「工作流」页应见改名后的「主题深度研究」，运行 TikTok 开店剧本：澄清表单 → 研究轮带联网/私有库 → 另一模型评估 → 必要时第二轮 → 成稿人工确认可改 → 存档；dl run_workflow 触发复验）。
