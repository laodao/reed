# 知识大脑 v2：从「提取管道」到「写作知识服务」（重构方案）

- 日期：2026-10-05
- 版本：**v0.2**（同日深审修订：对 v0.1 做了逐节代码级核查，落实 19 项问题——修订对照见 §11）
- 状态：**P0-P4 已全部落地（2026-10-06）**——原料层/冶炼层/服务层/品类归并/质量闭环，256 项单测全过；深审发现的 3 个跨阶段 bug（合并实体 mention 解析、质量门恢复路径、events 仓储缺失守卫）已随落地修复。未做项（按 §8 声明的可选项）：GEPA prompt 自进化、MCP 对外暴露、Wilson 分桶审批（简化为滚动均门控）。
- 前置文档：[2026-09-16-knowledge-brain-design.md](./2026-09-16-knowledge-brain-design.md)、[2026-09-16-knowledge-brain-detailed-design.md](./2026-09-16-knowledge-brain-detailed-design.md)、[2026-09-18-kb-brain-review-findings.md](./2026-09-18-kb-brain-review-findings.md)

---

## 0. 一句话定位

把知识大脑从「把书拆成论断的提取管道」重构为**面向 agent 的写作知识服务**：同一品类的多本书放进一个库，系统自动消化成品类知识体系；agent 写作时按任务取用成品知识——**全程零人工操作，价值在写作那一刻自动兑现**。

---

## 1. 背景与问题诊断

### 1.1 原始痛点

1. 修真小说库里看不到世界设定、故事线、经典场面、人物设计、写作套路的提炼——各层知识全空，待审提议简陋且分不清是什么类型的知识。
2. 七个提炼动作（续消化/分层补标/书级汇总/目标提炼/归纳整理/垃圾清理/伏笔扫描）大量依赖人工设置和操作，复杂度太高。
3. 已修复项（2026-10-04）：归纳时 API 密钥解密失败（safeStorage/AES 双回退）；后台自动化管线（automation.service 已上线）。

### 1.2 结构性病根（调研 + 代码对照后的诊断）

| 症状 | 病根 |
|---|---|
| 各层知识全空、补标无效 | 「层」是事后补标签的物理桶，不是构建时派生的结构；四层还混用了**抽象粒度 × 叙事功能**两个正交轴 |
| 类型混淆、全塌向 detail | fact/claim/concept 是记忆功能分类，对叙事语料无先验约束力；业界做法是 **schema 驱动的封闭提取**（按叙事功能定类型，每类独立模板） |
| 待审提议简陋 | **价值链断裂**：提取层「剧情最高禁令」把情节/场面这些归纳套路最需要的原料扔了，归纳层无米下锅——不是模型不会归纳，是喂给它的原料里没有情节 |
| 复杂度太高 | 类型/分层/整理全是外挂补丁，用户面对「一堆开关 + 一堆按钮」 |
| 检索价值感低 | 管道里流的是原子论断碎片，不是成品知识 |

### 1.3 v1 已有资产盘点（v2 复用，不推倒重来）

- **消化管线**：document-completed → digest（atomize → adjudicate → entities → book passes），ledger 幂等（passType 'base' / `lens:<id>:v<n>` 先例），断点恢复
- **冶炼雏形（v0.1 盘点遗漏，v0.2 补）**：`distill.service` 已经是「取材（supported atoms 增量）→ 嵌入聚类（簇 8-30，cosine 0.72）→ 两段式反思 → 思想卡/模式卡 proposed」的归纳流水线，含 setting-pattern / character-pattern 产出。**v2 的冶炼层不是从零新建，而是在它旁边补「故事轨」产线并做分工**（见 §8 P1）
- **后台自动化**：automation.service——7 步流水线、冷却记账、成本熔断（口径 = kb_digest_passes 台账 costByKb）、每库单飞锁（2026-10-04 上线）
- **agent 消费通路已有三条**：
  - `kb_brain_query`（chat/agent 工具，`kb-brain-tools.ts`）
  - `writing-brain-tool`（长文写作：章设计卡 + 正文生成两处挂载，2026-09-22 决策**「提供查询工具，不做自动注入」**）
  - `brain-provider`（HostKit 结构化 provider，`[设定事实]` 行注入轮次上下文）
- **检索底座**：`BrainQueryService` = 全命名空间向量召回 + BM25 + 跨类型 RRF 融合 + **PPR 图路（HippoRAG 2 的 PPR 思路已实现，其完整方法——passage 节点入图、recognition-memory 两阶段重排——未实现）** + CRAG 判级；向量池按命名空间前缀组织（`chunk:`/`atom:`/`note:`/`qa:`，vector-namespace.ts）
- **数据底座**：kb_atoms（五态+archived 状态机、双时间线字段、supersede 链、溯源三件套）、kb_entities（别名/软合并）、kb_edges（九种关系、必带 evidence）、kb_notes（pattern_skeleton + pattern_instances 字段**有真实写入方**——distill.service:176/223）
- **书级 pass 已按文档（书）产出**（`runForDocument`，每本书各自的大纲/设定索引/人物表/伏笔账）
- **评测体系已有骨架**：`eval/`（fixtures + run-eval 双模式对比 + 门线先例：综合型 recall@5 ≥ +5pt 且事实型零回退）

**已知缺陷（深审新发现，与 v2 无关也该修）**：`deleteDocument`（knowledge-base.service.ts:467）只级联清向量/倒排/chunk/章节/文档，**不清 kb_atoms / kb_digest_passes 等大脑产物**——删书后其论断仍留在冶炼池。多书品类库会放大此问题（删 1/20 本 → 频率与经典度全部脏掉）。修复记入 §8 P0。

---

## 2. 诉求对齐结论（2026-10-05，三轮对齐）

### 对齐一：定位

不是「更好的提取功能」，而是「不用管的、自己会变聪明的写作参考大脑」。用户只负责把书扔进去，中间的一切加工是系统的家务事；**操作复杂度本身就是缺陷**，不是功能不够多的反面。

### 对齐二：两个关键问题的答案

1. **大脑的第一用户是 AI**：agent（包括其他应用里的 agent）写作时调用大脑获取知识——写修真小说时取套路/方法/设定/经典场面，写大模型科普时取概念体系/讲解方法/例子。UI 面板退化为验收与信任工具。
2. **多书一库**：同一类书籍放一个知识库，系统提取这类书的知识，形成「一类知识的体系」。

### 对齐三：知识价值三原则（最重要）

1. 提取的应该是**什么样的知识**——判据是「对写一本新书有没有用」，不是「书里有什么」；
2. 知识最终**怎么使用**——agent 在写作流程的四个时刻取用（§4）；
3. 知识要有**抽象、总结、归纳**，不能是简单的内容提取（§5）。

---

## 3. 知识观：应该提取什么样的知识

### 3.1 判据：对写一本新书有没有用

用户明天开一本新的修真小说，这条知识能不能改变他的写法？

- ✗ 「韩立已叛出师门」（fact 原子）——那本书的剧情事实，对新书零用途。这是**读书笔记**，不是写作知识。
- ✗ 「以把脉探查弟子真实修炼进度是宗门师长的常用核查手段」（fact 原子，v1 提取 prompt 里的 ✓ 示范案例）——孤立观察，没说什么时候用、为什么有效、是不是用烂了。v1 的标杆本身太低。
- ✓ 见 3.2 的套路卡。

### 3.2 成品形态示例

> **「师长核查弟子隐瞒」场面套路**
> 骨架：日常中埋一处反常细节 → 师长不动声色设局试探 → 揭穿或被化解 → 信任裂痕成为后续情节支点
> 频率：抽样 20 本中出现 14 次，师徒线的标准冲突引擎
> 变体：温情版（裂痕后修复得更紧）/ 权谋版（借局除名）
> 为什么有效：用「制度性猜疑」替代脸谱化冲突，张力来自关系而非事件
> 边界：师徒关系刚建立时别用——读者情感投资不足，裂痕无张力
> 案例：《凡人》ch.XXX 原文片段、《仙逆》ch.XXX

（**示意数据**：频率/案例数字为构造示例，非实态，不构成验收基线。）

差别不在文笔，在**知识的结构**：每条自带「何时用 / 为什么 / 边界 / 证据 / 出处」，是从 N 个实例归纳出来、可迁移到新书的**方法**，不是从一章里抄出来的**事实**。

### 3.3 双层对外形态：书级档案 + 六类知识卡

知识产品分两层，共同构成大脑的对外形态（v0.1「六类卡是唯一形态」的表述**过强**，已修正——书级档案同样是 agent 要消费的形态，且用户原始诉求里的「故事线」「人物设计」归属档案层）：

**素材层——书级档案**（这本书是什么，v1 书级 pass 已产出，保留并继续自动化）：
`book-outline`（故事线）、`character-roster`（人物设计）、`foreshadow-ledger`、`setting-index`。

**方法层——六类知识卡**（怎么用于写新书；对外的 fact/claim/concept 退役为内部管道标签）：

| 类型 | 内容 | 生命周期特点 |
|---|---|---|
| 原理 principle | 为什么有效、何时失效（跨套路归纳） | 稳定，跨品类检验 |
| 套路 pattern | 可复用骨架 + 参数槽 + 变体 + 频率 + 边界 | 随实例增长演化 |
| 设定体系参考 setting-system | 品类通用骨架 + 各书变体（供设计自己的体系，不是抄设定） | 随书入库更新 |
| 案例拆解 craft-case | 经典场面 + 好在哪 + 学什么 + 原文 | 只增不减 |
| 品类认知 genre-insight | 读者期待 / 爽点机制 / 雷点清单 | 品类级汇总 |
| 反面模式 anti-pattern | 常见的写崩方式 | 从反例归纳 |

原始诉求五项的归属对照：世界设定 → setting-system + setting-index；故事线 → book-outline；经典场面 → craft-case；人物设计 → character-roster（档案）+ character-pattern（方法）；写作套路 → pattern + principle。

### 3.4 知识价值三来源

- **压缩比**：20 本书 → 50 条可操作的知识；
- **可迁移性**：对写新书有用，不是对读过旧书的人有用；
- **证据密度**：每条抽象都能落到原文实例，不是编出来的理论。

---

## 4. 使用方式：四个时刻

agent 在写作流程的四个时刻调大脑——这就是「怎么用」的全部，每个时刻反过来定义知识的形态：

| 时刻 | agent 拿什么 | 用途 |
|---|---|---|
| 动笔前搭骨架 | 品类认知 + 设定体系骨架 + 套路组合菜单 + 代表作的书级档案（大纲/人物表） | 生成大纲 / story bible |
| 写到具体场景 | 该场面类型的套路卡 + 2-3 个案例原文片段 + 相关设定惯例 | 即时取材 |
| 修改诊断 | 对应场面类型的原理卡 + 好坏对比案例 | 给修改方向 |
| 对标学习 | 目标作者的书级档案 + 其高频套路卡（按作者聚合） | 参考 |

**硬形态要求**：自包含、prompt-ready、带出处（agent 不能收到「详见第 37 章」，必须直接收到可引用的内容本身）；**按「写作任务 × 场面类型」取包**，不是按关键词搜碎片。

**落地范围声明**（v0.2 修订）：P2 只落地**写前 + 写中**两个时刻（有现成挂载点）；诊断、对标两时刻进 backlog（无现成通路，避免 P2 范围失控）。

---

## 5. 抽象的产生：开采 → 冶炼流水线

简单提取不消灭，而是**降级为原料——从产品变成矿砂**。归纳「师长核查」这个套路，必须先有两百个师徒冲突场面做原料；抽象「期待感 = 突破间隔 × 代价」这条原理，必须先有几十次突破场面的证据。没有原料的归纳是空想。

三级价值链，每层踩在下一层的证据上（套路卡必须链得到实例，原理卡必须链得到套路——抽象才不会飘）：

```
原料层   事件 / 场面 / 设定事实，带证据索引（原文引句 + 章节锚点）——不给用户看
   ↓  聚类归并 → 提出假设 → 频率/反例验证
归纳层   套路卡（骨架 + 参数 + 变体 + 频率 + 边界 + 实例登记）
   ↓  跨套路归纳 → 跨品类迁移检验
抽象层   原理卡（为什么有效 / 何时失效）+ 品类认知卡
```

**多书一库是抽象的前提**：单书只能出「这本书的总结」，跨书才能出「品类的套路」（出现 14 次 vs 出现 1 次，性质完全不同），跨品类才能出「叙事原理」。抽象的每一级都以语料基数为前提——多书库不是规模问题，是抽象能力的前提。

---

## 6. 技术调研结论（2025-2026 SOTA 对照）

| 技术 | 结论 | 说明 |
|---|---|---|
| Microsoft GraphRAG 全家桶 | **拒绝** | 批式、贵、增量不友好；社区摘要用卷/品类级汇总替代；采纳其 claim 提取规范 |
| LazyGraphRAG | 参考 | 索引期零 LLM 的省钱思路；auto schema 思想用于品类 schema 归纳 |
| LightRAG（EMNLP 2025） | 采纳思想 | 增量 merge + 双层检索（具体实体/高层主题）；存储仍是 SQLite |
| HippoRAG 2（ICML 2025） | **PPR 思路已在 v1 实现**（v0.2 修正表述） | brain-query 已有 PPR 检索路径；其完整方法（passage 节点入图、recognition-memory 两阶段重排）未实现，多跳关联查询是其强项 |
| Zep / Graphiti | 改造采纳 | bi-temporal 降为**章节区间**有效性（边带 [起始章, 失效章]）；adjudicate 协议本就是其 dedupe 协议 |
| RAPTOR（ICLR 2024） | 采纳思想 | 层 = 构建时派生的摘要产物（卷级大纲树、品类汇总），不是事后补标签——layer-relabel 环节随之消亡 |
| Mem0（2025） | 部分具备 | ADD/UPDATE/DELETE/NOOP 事实生命周期；supersede 链已有，算子决策前移到提取时 |
| A-Mem（NeurIPS 2025） | 部分具备 | Zettelkasten 笔记互联 + memory evolution；edges + metabolize 已是此思路 |
| Letta sleep-time compute | 已落地 | automation.service 就是该范式；补「读写分层 + 事件+冷却触发」语义 |
| 分层批判证据 | 采纳 | GraphRAG-Bench / HippoRAG 2 评测一致：抽象层只在骨架/主题/多跳查询有收益，细节靠原子事实+链接+rerank → **层从 UI 概念退化为检索路由参数** |
| Schema 封闭提取 + ontology induction | 采纳 | 抽样开放提取 → 聚类归纳 schema → 人工定稿 → 封闭全量；GraphRAG/LightRAG 均要求 entity_types 白名单 |
| 中文叙事坑 | 采纳 | 称谓→canonical 映射（「师尊/那老者」）、对话段强制 speaker、可疑即新建别名节点（过度合并已被证明损伤质量） |
| 自动化 UX 成败案例 | 采纳 | Recall/Smart Connections 成于零配置被动浮现；Tana 败于配置转嫁、Notion AI 败于低质打标 → 收敛为「1 开关 + 1 管线 + 1 收件箱」 |
| 自适应阈值 / 抽样质检 / GEPA | 采纳（P4） | Wilson 下界分桶调 auto-approve；judge 抽样打分 + 类型分布漂移监控；prompt 自进化（攒采纳记录离线优化、可回滚） |

主要来源：HippoRAG 2 (arXiv:2502.14802)、Zep (arXiv:2501.13956)、LightRAG (arXiv:2410.05779)、LazyGraphRAG (MSR blog)、RAPTOR (arXiv:2401.18059)、Mem0 (arXiv:2504.19413)、A-Mem (arXiv:2502.12110)、Sleep-time Compute (arXiv:2504.13171)、GEPA (arXiv:2507.19457)。

---

## 7. 目标架构

```
┌────────────────────────────────────────────────────────────────┐
│ 提取层（schema 按品类归纳；双轨）                                  │
│   设定轨：kb_atoms（长效设定/规则，保持剧情禁令）                    │
│   故事轨：kb_events（场面级事件原料：sceneType/参与者/因果/引句）     │
├────────────────────────────────────────────────────────────────┤
│ 书级整理（v1 已有：per-document passes —— 大纲/设定索引/人物/伏笔）  │
├────────────────────────────────────────────────────────────────┤
│ 品类级归并（新：跨书实体 canonical + scope、corpus rollup）          │
├────────────────────────────────────────────────────────────────┤
│ 冶炼层（新：核心工序；与现有 distill 分工——见 §8 P1）                │
│   pattern-induct   事件聚类→假设→验证→套路卡（pattern_instances 承接实例）│
│   principle-distill 套路簇→原理卡                                   │
│   case-study       经典场面→案例拆解卡                              │
│   corpus-passes    品类 rollup：套路频率表 / 品类认知                │
├────────────────────────────────────────────────────────────────┤
│ 服务层（升级）                                                     │
│   brain-pack：意图路由（写前/写中）→ 类型化取材 → token 预算打包       │
│   kb_brain_query v2 + writing-brain-tool（sceneType 服务端推断）     │
├────────────────────────────────────────────────────────────────┤
│ 质量闭环（新：抽样 QA / 漂移监控 / 自适应 approve / undo log）        │
└────────────────────────────────────────────────────────────────┘
```

数据模型变更（存量不动）：

- **新表 kb_events**（P0）：原料轨；现有 kb_atoms 保留为设定轨继续服役，无需迁移。事件向量**不存表内**——按现有架构走 kb_vectors 命名空间（新增 `event:` 前缀，与 `atom:`/`note:` 同款）
- **KbNoteType 增加** `principle | craft-case | genre-insight | anti-pattern`（P1，含所有类型白名单/渲染标签同步——白名单位置如 kb-note.repository.ts:261 及面板渲染层）
- **kb_entities 增加 scope**（book/corpus）（P3）：跨书概念（境界体系类）归并为品类级，人物保持书级

**平台范围**：全部新工序与 automation 同口径——**Electron-only**（Web 多租户不启用后台整理，检索/工具层两端可用）。

---

## 8. 实施路线（文件级）

顺序逻辑：**P0/P1 是价值产生的地方**（知识价值三原则的全部），P2 让价值可被 agent 消费（写前/写中两时刻），P3/P4 是规模化和免维护。P0 无破坏性（新表新 pass，存量不动）。

### P0 原料层：捕获事件/场面原料

> 目标：修价值链上游——提取时并行产出带证据索引的事件/场面原料。剧情禁令从「扔掉」变为「分流到原料轨」。**范围限小说品类**（科普/文史的「事件轨」语义待定，见 §9）。

**提取与记账（二分模式，v0.2 修订明确）**：
- **新消化章节**：atomize 一次 LLM 调用双轨输出 `{atoms, events}`；ledger 记两条 pass（`base` + `events#1`）但**成本只记一次**（同一调用不双计）
- **存量补采**：独立 events-only prompt（不带 atoms 指令、带已知名词表注入），独立 passKey `events#1`，照 lens pass 先例幂等回填——**已消化章节不重跑 atomize**

改动清单：
- 改 `services/kb-brain/prompts/index.ts`：小说版 ATOMIZE 双轨输出；events 收场面级事件 `{summary, sceneType, participants, cause, outcome, quote}`；sceneType 枚举**初版为临时手定**（冲突/突破/交易/试探/情感/打斗/日常…），P1 schema induction 后修订（见 §9 待定）
- 新 `database/entities/kb-brain/kb-event.entity.ts`（kbId/documentId/chapterId/chapterHash/sceneType/summary/participants JSON/cause/outcome/quote/offsets）
- 新 `database/repositories/kb-event.repository.ts` + `database/migrations/create-kb-brain-events.ts`
- 改 `services/kb-brain/vector-namespace.ts`：新增 `event:` 前缀；事件落库后向量化入池（供 P1 聚类）
- 改 `services/kb-brain/digest-orchestrator.service.ts`：双轨解析 + participants 走现有实体解析 + 两种记账模式
- 改 `services/kb-brain/automation.service.ts`：存量事件回填步骤（冷却 + 成本熔断）
- **修 deleteDocument 级联**（knowledge-base.service.ts:467）：per-document 产物（kb_atoms/kb_events/kb_digest_passes）随删书清理；跨文档产物（kb_notes）只**剔除该 doc 的引用**（evidence 锚点、pattern_instances 实例条目），卡片保留待下次冶炼/代谢重算频率——多书库的正确性问题
- **试点门**：存量回填先抽 200 章试点 → 走 eval 门线（事件原料质量 + 对既有检索零回退）→ 再全量。量级预期：万章级存量 ×（全文输入 + 事件输出）≈ **千万 token 级**，必须由熔断分日推进
- 测试：prompt 双轨解析、两种记账模式、repository、级联清理

### P1 冶炼层：归纳-抽象管线（核心新工序）

> 目标：知识价值在这里产生——聚类→假设→验证→升级，产出方法层六类卡。

**与现有 distill 的分工**（v0.2 补，避免双生产线重复产卡）：
- `distill.service`（保留）= **设定轨**归纳：atoms 上的聚类反思 → 思想卡/设定模式卡，维持现状
- `pattern-induct`（新建）= **故事轨**归纳：events 上的聚类 → 套路卡
- 两轨产物在 note 层汇合；聚类参数沿用 distill 的簇 8-30/cosine 0.72 体系，**成卡门槛**独立（见 §9 阈值）

**产物审批**（v0.2 决策，见 §9）：冶炼产物**默认 published** + 置信度标记 + undo log；distill 等旧产线维持人审不动。P4 自适应审批上线后再统一收紧。

改动清单：
- 新 `services/kb-brain/pattern-induct.service.ts`：按 sceneType × 事件向量 × 实体重叠聚类 kb_events → LLM 提出套路假设（骨架/参数槽/变体）→ 验证 → 写模式卡（pattern_instances 承接实例登记）
- 新 `services/kb-brain/principle-distill.service.ts`：套路卡簇 → 原理卡（链回套路与实例）
- 新 `services/kb-brain/case-study.service.ts`：按场面类型选经典样本（覆盖度×质量）→ 案例拆解卡
- 新 `services/kb-brain/corpus-passes.service.ts`：**不依赖跨书实体对齐的**品类 rollup——跨书套路频率表（按 documentId 统计）、品类认知卡。~~设定「通用骨架 vs 变体矩阵」~~（依赖 P3 实体归并，**挪入 P3**，v0.2 修订）
- 改 `services/kb-brain/schemas.ts` + `database/entities/kb-brain/kb-note.entity.ts`：KbNoteType +4，**并同步所有类型白名单/渲染标签**（repo 查询 In([...])、BrainPanel 类型映射）
- 改 `services/kb-brain/prompts/index.ts`：INDUCE_PATTERN / INDUCE_PRINCIPLE / CASE_STUDY / GENRE_INSIGHT 四套提示词
- 改 `services/kb-brain/automation.service.ts`：冶炼步骤（事件增长阈值触发）+ **所有新 LLM 步骤强制 ensurePass 记账**（新 passType 'smelt'），保证成本熔断可见（v0.2 补）
- **验证策略降级**（v0.2 修订）：P1 验证 = 频率门 + 分布检查 + judge 抽检；「反例扫描」为研究级难题，**不做**，留 P4 评估后再议
- 测试：聚类、验证门控、卡产出、幂等、成本记账

### P2 服务层：从「搜碎片」到「取知识包」

> 目标：对齐**写前 + 写中**两时刻（诊断/对标进 backlog，见 §4 落地范围声明）。

- 新 `services/kb-brain/brain-pack.service.ts`：意图路由（写前/写中）→ 类型化取材（套路卡 + 案例原文 + 设定惯例 + 写前再取书级档案）→ token 预算打包，自包含带出处
- 改 `services/kb-brain/kb-brain-tools.ts`：`kb_brain_query` 入参简化为 `{task, topK?}`——**意图路由/类型选择/预算全部服务端做**（v0.2 修订：不暴露 need/budget 给 LLM 调用者，参数越多调用失败率越高）；库选择从「第一个启用的库」改为按任务品类匹配
- 改 `services/kb-brain/writing-brain-tool.ts`：sceneType 由 **brain-pack 从章设计卡「情节概要」文本推断**（v0.2 修订：章设计卡无场面类型字段——情节概要/开场钩子/爽点/章尾卡点/出场实体——不改上游长文结构）
- 改 `services/kb-brain/brain-query.service.ts`：note 类型过滤加权——成品卡优先于裸原子
- 新 写前 briefing 通路：开卷前 agent 主动调 `kb_brain_query`（task=搭骨架）取品类认知 + 设定骨架 + 套路菜单 + 代表作档案；**触发机制 = 工具描述引导**（agent 读任务描述自判），不加自动注入，遵守 2026-09-22 决策
- 测试：路由、打包预算、出处完整性、sceneType 推断

### P3 品类库：跨书归并

- 改 `database/entities/kb-brain/kb-entity.entity.ts`：+scope（book/corpus）
- 改 adjudicate 协议：按实体类型 × embedding 分桶裁决（不做两两比对，控制成本）
- **设定「通用骨架 vs 各书变体」矩阵**（自 P1 移入，v0.2 修订）：依赖实体归并对齐后由 corpus-passes 产出
- 改 `services/kb-brain/metabolize.service.ts`：classicScore = 跨书频率 × 质量

### P4 质量闭环 + 交互收敛

- 抽样质检（judge 打分入 qa_log）+ 类型分布漂移监控（「又全塌向 detail」类病灶直接报警）
- 自适应 auto-approve（按动作×类型分桶 Wilson 下界，取代静态阈值；冷启动全进收件箱）——**上线后回接 P1 的 published 直发策略，统一收紧**
- undo log + 面板收敛为「开关 + 收件箱」；GEPA 式 prompt 自进化（信号源：agent 调用日志中知识被引用/跳过的比例，非人工采纳）；MCP 对外暴露（可选，最后）

---

## 9. 决策记录

### 已拍板（可否决）

| 决策 | 理由 |
|---|---|
| 事件走**新表 kb_events**，不复用 kb_atoms | 原料与成品不同生命周期；atoms 的裁决/清理逻辑不该碰原料 |
| atoms 保持剧情禁令，剧情**分流**到 events 轨 | 不解除禁令污染设定轨；禁令本身对设定轨是对的 |
| 套路成卡门槛 **max(8, 该类事件数 × 2%)**（v0.2 归一化） | 固定 8 不分库规模：小库冷门场面永远达不到、大库什么都超；2% 保证大库有相对门槛 |
| 现有单书库不迁移 | 直接作为品类库的第一本书，后续书往里加 |
| 接口先内部工具，MCP 后置 | 先让闭环在 app 内跑通（chat/长文/工作流三宿主已接线） |
| **冶炼产物默认 published + 置信标记 + undo log**（v0.2 新增；P4 自适应上线后收紧） | 消费者是 agent，等不起人审；冶炼产物有频率/实例门槛兜底，比 distill 反思卡可信。**注意：这推翻了 v1「AI 产物永不直接 published」铁律，仅适用于带验证门槛的冶炼产物**；distill 等旧产线维持人审 |
| 冶炼双产线分工：distill=设定轨（保留），pattern-induct=故事轨（新建） | distill 已是可用的 atoms 归纳产线；推倒重来浪费且引入回归风险（v0.2 补） |
| 反例扫描**不做**，验证降级为频率+分布+judge 抽检 | 负样本构造是研究级难题；先用可落地的验证拿住下限（v0.2 补） |

### 沿用的历史决策

- 2026-09-22「**提供查询工具，不做自动注入**」——P2 升级保持工具形态，知识按需被 agent 拉取而非推塞。

### 待定（实现时定）

- sceneType 枚举初版为**临时手定**（P0 实现即需一版），P1 后用 schema induction 修订并回填存量事件的重标
- 科普/知识类库的事件轨语义（科普库的「事件」= 论证结构/案例/教程步骤？）与六类卡映射（概念体系/讲解方法/例子）——P1 后期按品类适配，现有 novel/knowledge/history 三套提取变体是雏形

---

## 10. 验收标准

### 目标场景（叙述式验收）

用户建一个「修真小说」库，丢进二十本书，合上电脑。后台自动：逐书消化（双轨）→ 书级整理 → 冶炼归纳（套路库、原理卡、经典场面）→ 全程抽样质检、零点击。之后某天，用户在任意应用里对 agent 说「帮我写一本修真小说」——agent 调大脑，拿回带出处和频率的套路卡、设定体系、三个可学的经典场面；写到具体章节时再按场景细查。**中间没有任何人整理过任何知识。**

### 可度量指标（挂接现有 eval 体系）

复用 `eval/` 的 fixtures + 双模式对比框架，为写前/写中两时刻各构造评测集，沿用门线先例（提升 ≥5pt 且既有能力零回退）：

| 维度 | 指标 |
|---|---|
| 写中取材命中率 | 给定场面类型，top-k 套路/案例与任务的相关性（eval 集 + judge 抽评） |
| 卡片结构完整性 | 带证据率 100%；套路卡有边界字段的比例 |
| 抽象质量 | 原理卡可链回的套路卡数 ≥2；套路卡实例数达门槛比例 |
| 压缩比 | 实例数 / 卡片数（品类库级） |
| 人工操作数 | **分两期**（v0.2 修订）：冷启动期 = 收件箱待处理数趋零即可；稳态（P4 后）= 长期为零，用户操作 = 开关 + 预算 |

---

## 11. 修订记录

### v0.2（2026-10-05 深审修订，19 项）

深审方法：对 v0.1 的关键断言逐条做代码级核查（distill.service 现状、成本熔断口径 costByKb、章设计卡字段、vector-namespace 命名空间、deleteDocument 级联范围、note 类型白名单位置、eval 体系现状）。

| 级别 | 修订 |
|---|---|
| A1 | 「六类卡唯一形态」→ 双层对外形态（书级档案 + 六类卡），原始诉求五项归属补齐（§3.3） |
| A2 | 「设定骨架 vs 变体矩阵」从 P1 挪 P3（依赖实体归并，原路线依赖倒置）（§8） |
| A3 | 冶炼产物审批状态定策：默认 published + 置信标记 + undo log，P4 后收紧；记入决策（§8 P1、§9） |
| A4 | P0 记账二分明确：新章节双轨单调用成本记一次；存量 events-only 独立 prompt/passKey（§8 P0） |
| A5 | 新 LLM 工序强制 ensurePass 记账，成本熔断可见（§8 P1） |
| B1 | 事件向量化落点：kb_vectors 新增 `event:` 命名空间（§7、§8 P0） |
| B2 | 补 distill.service 资产盘点；双产线分工 + 聚类参数/成卡门槛体系统一（§1.3、§8 P1、§9） |
| B3 | sceneType 改为 brain-pack 服务端从情节概要推断，不改章设计卡上游（§8 P2） |
| B4 | 四时刻落地范围声明：P2=写前+写中，诊断/对标进 backlog（§4、§8 P2） |
| B5 | deleteDocument 级联缺失（现网 bug）记入 P0 修复（§1.3、§8 P0） |
| B6 | 成卡门槛归一化 max(8, 2%)；sceneType 标注临时枚举（§9） |
| B7 | 验收挂接 eval 体系 + 冷启动/稳态分期（§10） |
| B8 | 存量回填加 200 章试点门 + 千万 token 量级预期（§8 P0） |
| C1 | 「HippoRAG 2 已实现」→「PPR 思路已实现」（§6） |
| C2 | 示例卡标注示意数据（§3.2） |
| D1 | P0 范围限小说品类，科普/文史事件轨语义入待定（§8 P0、§9） |
| D2 | kb_brain_query v2 参数简化 {task, topK}，路由/预算服务端做（§8 P2） |
| D3 | note 类型白名单/渲染标签同步列入 P1（§7、§8 P1） |
| D4 | 平台范围声明：新工序 Electron-only（§7） |
