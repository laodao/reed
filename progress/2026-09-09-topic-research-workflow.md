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
