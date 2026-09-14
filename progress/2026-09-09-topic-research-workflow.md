# 内置「主题实操研究」工作流模板 落地记录（2026-09-09）

分支：feat/domain-learning。设计文档：tasks/2026-09-09-topic-research-workflow/design.md。

## 需求
用户要一个"研究某个主题"的工作流：例如了解跨境电商做法、在 TikTok 上开店怎么做，产出要含
详细步骤、注意事项、运营方法等。已确认形态 = the-bot **内置工作流模板**；示例验收主题 = 「在 TikTok 上开店怎么做」。

## 裁决（详见 design.md §0-§2）
- 形态 = 新增 1 份内置模板 JSON + `BUILTIN_APPS` 注册，**引擎/节点/技能/前端零改动**
  （复用 industry-research.json 同款节点组合：llm-chat jsonMode/loop/web-search/report/human-review/save-asset）。
- 产出 = Markdown 实操指南文本资产；human-review 人工确认后才落资产；不做知识库落库（属
  tasks/2026-09-07-domain-research-workflow 另一条未评审设计线，不抢跑）。
- 通用模板：章节由"规划节点"按主题与勾选维度拆解；提示词强制覆盖做法型骨架（步骤/注意/运营方法），
  防幻觉纪律（来源只取搜索结果、禁编造 URL、需核实、以官方最新为准）写进摘要/成稿两处提示词。

## 改动
1. `src/core/database/migrations/builtin-apps/topic-research.json`（新增）：10 节点 11 边
   （start→plan1→loop1{search1→summ1}→compose1→report1→review1→approve:save1/end，reject:end）。
   start 输入：topic(textarea 必填)/focus(维度多选：总体认识·详细步骤·注意事项·运营方法·工具与资源·常见问题)
   /depth(quick/standard/deep 默认 standard)/model(必填)。
2. `src/core/database/migrations/create-builtin-apps.ts`：import + `BUILTIN_APPS` 追加 1 条
   （appId=builtin_app_topic_research，defId=builtin_def_topic-research，category=调研，tags=主题研究/实操/指南）。
3. 测试：
   - 新增 `tests/unit/core/platform/workflow/topic-research-graph.spec.ts`（11 例图断言）。
   - `builtin-app-templates.spec.ts` / `create-builtin-apps.spec.ts`：**修陈旧基线**（改造前已红：
     模板数断言 19 实际 23、定义/应用行数断言 21 实际 23、select-dynamic source 白名单缺 `assets:*`
     前缀而运行时 RunInputForm 实为前缀通配）→ 对齐 23 后随本模板 →24。

## 验证
- 定向 spec 全绿：3 files / 29 passed（topic-research-graph 11 + builtin-app-templates 8 + create-builtin-apps 10）。
- eslint：改动文件 0 errors。
- 未跑全目录单测（范围过大超时，属误操作，已改为定向跑）。

## 真机验收（待用户在应用内执行，design.md §7）
1. 重启应用 → 「应用/工作流」出现「主题实操研究」；运行"在 TikTok 上开店怎么做" →
   逐问搜索摘要 → waiting_review → 审核页指南含步骤/注意/运营方法/来源 → approve 落资产 / reject 不落。
2. dl task 会话 run_workflow 触发复验（补 dl 收口遗留③"待有模板后复验"，progress/2026-09-09-domain-learning-task-exec.md）。
3. 换主题（如"跨境电商怎么做"）确认章节随主题自适应。

## 提交
本地提交待 push 指令。

---

## v2 升级（2026-09-09，design-v2.md）

用户评审否定 v1"搜索→综述→成文"（太简单）：要求**迭代式主题研究**——以模型认知为起点规划(不同领域不同步骤+验收标准)、执行中自驱调度(模型知识/联网/知识库发现与检索)、每轮由**另一 AI 模型按验收标准评估**、不达标带差距回头再研究、全程可与用户交互澄清。设计见 `tasks/2026-09-09-topic-research-workflow/design-v2.md`，用户评审通过并批准 P1。

### 落地
1. `topic-research.json` 重写为 v2（16 节点 19 边，升级替换同 id）：
   澄清契约(form-collect goal/context) → 规划(plan1 jsonMode：已知地图/主题类型/步骤/验收标准) →
   r1(agent-loop：web_search/wf_web_extract/wf_kb_retrieve/wf_kb_list，每轮预算护栏) → e1(llm-chat jsonMode，
   **evaluatorModel=另一模型**，pass/revise+gaps) → c1(condition) pass→writer / revise→r2 →(e2/c2)→ r3 → e3 →
   writer(溯源报告：execSummary 可信度/正文证据锚/method/limits/sourcesMd 分网络与私有库) → report1 拼装 →
   final1(human-review，content 可编辑) → approve:save1(content={{final1.content}}) / reject:end。
2. P1 实施：`wf_kb_list` 只读工具（node-tool-adapter.ts，无参，返回 kbs[{id,name,description,documentCount}]）——
   研究执行体先发现知识库再自行检索。
3. create-builtin-apps.ts：注册名升级「主题深度研究」；迁移 UPDATE 分支补同步 name/description/category
   （未接管定义改名生效；接管保护不变）。
4. 测试 4 files 39 passed（topic-research-graph v2 图断言 / builtin-app-templates / create-builtin-apps 改名同步 /
   agent-tool-adapters wf_kb_list）；eslint 0。

### 真机验收（待用户，design-v2 §5）
重启应用后「工作流」应见改名后的「主题深度研究」；运行 TikTok 开店剧本：契约表单 → 规划(做法类+验收) →
研究轮(联网+私有库发现检索) → 另一模型评估 → 必要时第二轮定向补查 → 成稿含来源/局限 → 人工确认(可改全文) → 存档；
dl run_workflow 触发复验。

---

## v2.1 深度契约（2026-09-09，参照元宝版《TikTok 跨境电商从零开店实操指南》校准）

用户以一份 49KB/860+ 行的深度实操研究作参照，要求"比它更深入"。拆解其深度要素为 6 条可度量契约，已内联进 v2 模板提示词（图结构不变，16 节点 19 边）：

1. **决策化**：plan1 验收标准强制含 分场景/分主体/分地区的路径与决策树或对比矩阵；
2. **证据分层**：研究执行体每条结论标注证据层级（官方一手 / 平台后台需复核 / 二手估算 / 未查到），数字与费率给量级/区间与出处，查不到写「未查到，需官方/后台确认」，禁止编造；
3. **可执行颗粒度**：做法类给时间线/SOP/检查清单/模板/公式（研究轮主动收集条目化信息）；
4. **风险与合规红线**成节；5. **不确定性清单**（哪些须用户后台/官方确认）单列；6. **门槛式行动**：writer 新增 `actionPlan` 字段（何时可做/该停/能扩）+ 报告模板新增「下一步行动」节；评估器按新增「深度档质量」核对（量级/证据层级/诚实标注/可执行颗粒度/分场景路径）决定 pass/revise。
改动：topic-research.json 提示词与模板 + topic-research-graph.spec 关键词断言；spec 3 files 28 passed；eslint 0。

---

## v3：引擎 until 研究轮循环落地（2026-09-09，engine-while-loop-design.md）

用户立项批准。设计评审+自查后实现：
- 引擎 loop 新增 mode='until'：repeat body until stopValue；maxIterations 上限必收尾；每轮独立作用域 + 伪变量 {index, prev}（prev=上一轮结果供增量研究）；输出 {results,count,iterations,last}；foreach 零回归。
- 改动：workflow.types/catalog/forms、graph-validator（until stopExpression 允许引用 body 节点输出）、control-nodes validateConfig、engine(executeLoopNode 分流 + driveUntil/completeLoopUntil + 序列化)、journal-replay(until 元数据/driver 重建)。
- 模板 v3：topic-research.json 重构为 until 循环（12 节点 14 边）：start(+maxRounds) → 澄清 → 规划 → round1(until: r→e→pack→loop-back, errorPolicy=skip) → writer(用 round1.last.result.*) → report → 人工确认 → 保存。
- 测试：loop-until.spec 4 例 + 回归（9 files 94 passed）、eslint 0、本批 vue-tsc 零新增；本地提交待 push。
- 待用户：真机（动态轮次/评估提前收尾/达上限收尾）、until+挂起恢复专项 spec（后续）。

---

## v4：运行级总预算落地（2026-09-09，run-budget-design.md）

用户立项（"应该设置工作流的总预算，而不是工具的预算；每轮数据量不同，等额不合理"）。设计自查修订后 TDD 实现：

- 新增运行级设置 `maxTotalToolCalls`（0/缺省=不启用；normalize：有限正数取整并封顶 `WORKFLOW_LIMITS.maxTotalToolCalls=10000`，NaN/负数→0）；`ResolvedExecutionSettings` 增字段。
- 引擎：`RunExecution.toolBudget {max,used}` 恒建对象、跨节点/跨轮共享；`buildContext` 注入 `ctx.toolBudget`（max>0 才有；含只读 remaining + tryConsume）；快照序列化 toolBudget，journal-replay 快照恢复重建（旧快照无该字段则保持初值）。
- agent-loop：`assembleTools` 支持运行级预算句柄——先查节点级（设了且耗尽→报节点级、不白扣运行级）再查运行级（耗尽→报运行级提示），双预算各自计数；模型 task 追加「运行级总预算：共 N 次，当前剩余 M 次」提示，引导按需分配。
- 模板：`topic-research.json` `settings.maxTotalToolCalls = 120`（8 轮共享总额，不再每轮等额 16）。
- 测试：agent-loop-node.spec 新增 7 例（normalize/直通/节点级优先/运行级耗尽/双预算并存/引擎级跨节点累计/剩余预算注入 prompt）；topic-research-graph 增 1 例（settings=120）；回归 batch1 8 文件 52 passed、batch2 5 文件 62 passed；eslint 0。
- 待用户：真机复跑（重启 App → 主题深度研究 8 轮，观察总调用 ≤120、每轮不再整齐触 16 天花板、prompt 含剩余预算）。

---

## v4 真机验证 + 质量评估（2026-09-09，带运行级总预算）

运行：`wmrun` runId `wfrun_1789128599106_e8giud8y0`（topic=TikTok 开店；问卷=cn-individual/无执照/MY,TH,PH,US/家居收纳+宠物/video-only/3-5万；maxRounds=8；研究 deepseek-v4-flash、评估 deepseek-v4-pro；默认搜索必应免Key）。

### 流程验证（全部通过）
- until 循环 8 轮全自动（澄清表单/终稿确认由脚本提交），每轮"研究→另一模型评估→打包"链路完整；8 轮评估全 revise → 达上限收尾（不失败）。
- **运行级总预算精确生效**：执行工具调用合计 **120 = 预算**；第 8 轮仅剩 8 次可用；另有 8 次尝试被**节点级 16 次/轮**护栏拒绝（轮 0/2/6 各 1/3/4 次）→ 双层预算各自正确、不互相污染。
- 每轮工具调用分布 17/16/19/16/16/16/20/8，末轮被总额压缩（符合预期，但也暴露单轮上限偏紧）。

### 质量评估（对比元宝参照样本，指标脚本 progress/_topic_quality.js）
- 结构：本次 12,861 字/49 标题/12 表 93 行/86 列表；元宝 22,619 字/13 表 115 行 → 篇幅约 57%，表格密度接近。
- **强于参照**：证据分级（官方一手 19 处、未查到 42 处、先验显式标注）、门槛/停损量化（"门槛"23 处 vs 7）、清单（8 vs 7）、个性化（完全按用户问卷定制，元宝为自设场景）、诚实性（明确"预算与单位经济为模型先验，不可当事实"）。
- **弱于参照**：URL 可点击来源 **0 vs 18**（只写域名/文章号）、公式 0 vs 3、时间线颗粒度 2 vs 42（缺 D1-D90 甘特）、止损 0 vs 2、篇幅约 57%。
- 通道约束（非逻辑缺陷）：官方 SPA/后台不可达 + 必应免Key 搜索噪声大 → 费率/保证金/回款/物流/禁入清单等 42 处"未查到"，预算与单均模型只能建在假设上。

### 待改进（ROI 排序）
1. 模板把 r1 的节点级 `maxToolCalls` 留空（只由运行级总预算约束）→ 彻底实现"总额按需分配"，末轮不再只剩 8 次。
2. 提示词契约补：来源必须输出 Markdown 链接 `[标题](URL)`；deep 档强制"贡献利润/采购倒推公式"与"D1–D90 逐日时间线"。
3. 搜索质量是深度外部上限：建议有额度时换博查/Tavily/Perplexity；并在 clarify 提示用户提前准备 Seller Center 后台截图。

---

## v5：研究规格分层（产出要求交由用户，不写死进内核）

用户质疑：「贡献利润/采购倒推公式 + D1–D90 逐日时间线」这类要求写进提示词，会不会让其它领域研究偏差？是否该由用户提供？
结论：认同。实现 L1–L4 分层（详见 tasks/2026-09-09-topic-research-workflow/research-brief-design.md）：

- **L1 通用纪律**留在内核（领域无关）；**L2 类型化深度模板**下沉到 plan1「做法/商业类」骨架（单位经济公式、逐日时间线、SOP、清单），只对命中类型生效；**L3 用户产出规格/要求**新增 start 输入 `outputSpecs`（7 项多选）+ `outputRequirements`（自由文本）；**L4 参照样本**新增 `referenceSample`（只对标结构与密度，禁止照抄结论）。
- **闭环**：用户规格/要求 → plan1 逐条转成 acceptance → e1（另一模型）逐条核对（可检索/可执行未满足判 revise；通道不可达记非阻塞）→ writer 按 acceptance 成稿并落实公式/时间线/可点击链接/反方回应。
- 验证：topic-research-graph spec 断言新输入与三处引用（12 例）、builtin-app-templates 过全量校验（7 例）→ 19 passed；未改动引擎/其它模板，未设置这些输入时行为不变。

---

## v6：调研经验固化为内置技能 research-method（2026-09-09，research-skill-design.md）

用户纠偏：「你应该纠结某个细节，你需要总结的是经验——一个调研报告应该包含哪些内容、应该从哪些方面做分析、
应该从哪些地方获取数据，这些经验可以作为调研某个领域的 skill」。即：停止在模板提示词里逐条调参，
把调研这门手艺沉淀成可复用技能。用户批准范围：技能 + 模板改造 + 测试全做；经验只放一个技能。

### 1. 新增内置技能 `research-method`（category 调研，modelInvocable）
`src/core/platform/workflow/skills/builtin-skills.ts` 追加 SKILL.md（内置只读，可复制为用户技能），
frontmatter inputs：topic/goal/domainType/depth/constraints/requiredOutputs/knownContext；正文六节＝经验本体：
1. **范围与决策目标**：must-answer 逐条写颗粒度、明确不回答什么与口径、约束分主体/分地区落地；
2. **报告骨架（报告应包含哪些内容）**：执行摘要→口径→现状→主体分析→数据与证据（表格/矩阵/公式/时间线）→
   路径与方案（决策树）→成本与单位经济→风险与合规红线→行动清单与门槛条件→局限与待核验→分层参考来源→附录，
   按主题类型裁剪 + 速览/标准/深度取裁口径；
3. **分析维度矩阵（从哪些方面分析）**：18 项通用维度库（定义边界/主体角色/全流程环节/准入资质合规/成本与单位经济/
   定价收益/需求规模/竞争替代/供给供应链/渠道流量/运营节奏/工具技术/人才组织/风险红线/门槛退出/时效趋势/分歧不确定/
   失败模式），每项给"要回答的问题 × 关键指标 × 常见误区"；
4. **数据来源路由（从哪些地方获取数据）**：8 类来源（官方一手/平台后台需复核/行业与市场数据/公开财报公告/学术与专利/
   从业者与社区/竞品与实测/工具与数据库）× 去哪取 × 取哪些字段 × 可靠性 × 时效 × **取不到时的降级路径**，
   附中英双语检索、站点与时间限定、双源交叉、登录墙与反爬的现实预期；
5. **取证与呈现纪律**：三态标注（已验证/先验-待验证/未查到）、禁止编造、矛盾并列、采集时间、证据层级、反方与边界、可点击来源；
6. **执行计划与验收标准**：步骤依赖、轮次节奏、逐条可判定验收、停手条件（非阻塞项即收尾）、深度档差异。
关键纪律：公式/时间线/矩阵在技能里只是**类别 + 示例**，由模型按当前领域实例化；技能不含任何单一领域结论（测试断言无 TikTok/抖音/亚马逊等词）。

### 2. 模板改造：经验出模板，只留编排与用户契约（v4，13 节点 15 边）
`topic-research.json`：`start → clarify → method1(skill-call: research-method) → plan1(llm-chat 契约编译器) →
round1(until: r1→e1→pack1→loop-back) → writer → report1 → final1 → save1/end`。
- 新增 `method1`：技能参数由 start/clarify 注入（topic(含 focus)/goal/domainType=自适应/depth/constraints/requiredOutputs/knownContext），
  用研究模型执行；`skillId` 与内置技能清单交叉断言防漂移。
- `plan1` 瘦身为契约编译器：删除内联的主题类型骨架、验收深度化细则、信息源策略（已在技能里），
  改为引用 `{{method1.content}}`，只做 先验地图 + 方案落地 + 用户契约转 acceptance + JSON 输出。
- `writer` 按 `{{method1.content}}` 的骨架组织正文，删除内联的公式/时间线形状清单，保留用户规格硬契约与引用纪律。
- `r1`/`e1` 执行与评审纪律不变（本轮验证过的部分不动）。
- 分层边界由测试钉死：模板提示词（method1/plan1/r1/e1/writer）不得出现「贡献利润/采购倒推/D1–D90/逐日」，
  而技能正文必须含这些经验（以类别+示例形式）；用户仍可在 outputSpecs 选项里点名具体形态。

### 3. 验证
- 新增 `builtin-skills-research-method.spec.ts` 11 例（frontmatter/参数/六节/报告内容/维度/来源+降级/纪律/验收/领域无关/可解析）；
- `topic-research-graph.spec.ts` 扩到 14 例（13 节点 15 边、method1 绑定与参数、plan1/writer 引用技能、分层边界、可达性）；
- 定向回归 9 文件 **118 passed**（skill-call/skill.service/builtin-skills×3/topic-research-graph/builtin-app-templates/
  node-registry-consistency/graph-validator）；eslint 0；未改引擎、技能解析器、技能节点与其它模板。
- 注：`tests/unit/core/platform/workflow` 全目录一次跑超 600s 上限（用例多），改为定向文件串行跑。
- 待用户：真机复跑观察技能方案是否让报告结构/来源密度提升（技能产出→契约→循环→成稿链路）。

