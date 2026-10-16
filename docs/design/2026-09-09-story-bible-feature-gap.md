# 设定功能（Story Bible）对标调研与补充方案

- 日期：2026-09-09
- 状态：提案（配套《长文写作整体优化方案》）
- 问题：当前设定功能够用吗？缺什么？

## 0. 结论先行

**不够用，但底盘比想象的好。** 我们的差距不在数据层——实体状态快照、图谱时间线边、章节事件、关系边这些"行业高阶能力"的数据我们早就在存，只是**沉睡在库里没有 UI、没有闭环**。真正的差距集中在四件事：

1. **可定义性**（最大差距）：分类和字段全部硬编码（8 组固定列），而 Novelcrafter 的核心卖点就是自定义分类+自定义字段；**我们自己的原型 v3.1 也承诺了「要素随题材动态生长——说'设计一个国别'就新建分组」**，实现没兑现（架空历史的国别/阵营两个分组直接缺失）。
2. **引用可观测**：NovelAI 有 Context Viewer 让你看到每个设定如何落进上下文；我们的设定在章节生成时「被没被引用、为什么」是黑盒。
3. **溯源与演进 UI**：实体状态（第 3 章受伤第 7 章痊愈）和时间线数据在库沉睡；详情抽屉只显示静态字段。
4. **网文特有概念缺失**：**伏笔追踪**（第 3 章埋、第 12 章收，国内产品蛙趣拼文已做成卖点）、人物**别名/称呼**（林晓/晓哥/林师妹——中文网文描写的刚需，也是提及检测的准确性前提）。

## 1. 对标矩阵

| 能力 | Novelcrafter Codex | NovelAI Lorebook | Campfire | 蛙蛙/彩云/笔灵等 | 我们 | 差距 |
|---|---|---|---|---|---|---|
| 实体分类 | ✅ 自定义分类 | ✅ 分类模板 | ✅ ~18 模块（物种/宗教/文化/魔法系统…） | ✅ 世界观/人物卡/CP线 | ❌ 8 组硬编码 | **大** |
| 字段自定义 | ✅ 每分类自定义字段 | ✅ 模板字段 | ✅ panels 自由面板 | 部分 | ❌ 固定列（字典仅类型/等级） | **大** |
| 动态分组 | ✅ | — | ✅ 按需买模块 | ✅ | ❌（原型承诺过） | **大** |
| 状态演进 progression | ✅ 斜杠命令按章节增改 | — | — | 蛙蛙有时间线 | ⭕ **数据全有**（lw_entity_states+图谱时间线边），无 UI 无研讨写入 | 中（睡资产） |
| 关系 | ✅ 自动链接 | — | ✅ 关系可视化 web | 笔灵 CP/感情线 | ⭕ 图谱边有数据，GraphView 独立页，详情内无关系小节 | 中 |
| 触发式引用（keys） | ✅ 自动提及检测+每场可见性 | ✅ 关键词触发+插入顺序/优先级 | — | 彩云「词条锁规则」 | ⭕ recognizeChapterEntities 有；无别名、无注入控制 | 中 |
| 引用可观测 | ⭕ 每场可见性列表 | ✅ **Context Viewer** | — | — | ❌ 黑盒 | 中 |
| 时间线 | — | — | ✅ 多时间线 | ✅（蛙蛙） | ⭕ lw_events+story_time 有数据无视图 | 中 |
| **伏笔追踪** | ❌ | ❌ | ❌ | ✅（蛙趣拼文） | ❌ | 差异化机会 |
| 层级归属 | ⭕ tags | — | ⭕ 部分 | — | ❌（地点无包含层级） | 小 |
| 条目版本快照 | — | ⭕ | — | — | ⭕ 章节有版本、实体无 | 小 |
| 系列级共享 | ✅ series | ✅ 多 lorebook | ✅ | — | ❌ 项目隔离 | 小 |
| 溯源（设定从哪来） | — | — | — | — | ✅ **42 号已做**（轮次回看） | 领先 |
| 对话中生长（研讨→采纳） | — | ✅ lorebook 生成 | — | ⭕ 一键生成角色 | ✅ 卡片+账本 | 领先 |
| 待讨论引导 | — | — | — | — | ✅ 空组提示 | 领先 |

（⭕=部分/数据在但 UI 缺；我们"领先"的两项是 42 号刚做的对话原生能力，行业多数产品设定与生成是割裂的。）

## 2. 补充清单（按优先级）

### P0（研讨室本轮迭代即可做，小改）
1. **别名/称呼**：人物加 `aliases` 字段（详情抽屉可编辑）；提及检测、上下文检索、设定集搜索全部吃别名——中文网文描写的刚需，也是引用准确性的地基。
2. **动态分组最小版**：自定义 kind 走**字典驱动**（复用 lw_dictionaries：`bible-kinds` 分类下建"国别/阵营/组织…"项，含图标与字段模板 JSON）；设定集分组、`设计一个X` 引导、卡片提炼范围随之动态化。兑现原型承诺；架空历史题材立即可用。数据落点：新 kind 落 `lw_custom_entities`（name/kind/fields JSON/origin），不动既有表。
3. **详情抽屉补「关系」小节**：数据在 `lw_graph_edges`，按实体查边列表（谁↔谁、什么关系、第几章起）——纯 UI。

### P1（下一轮，配合写作台 P1/P2）
4. **状态时间线（progression）**：详情抽屉加「演进」tab——读 `lw_entity_states` + 时间线边，按章节列"从第 N 章起：状态 X"；研讨室改设定时加「从第 ? 章起生效」可选输入，写入即闭环。
5. **引用可观测**：38 号上下文预览面板给每个条目标注「来自哪个设定/为什么入选」（检索得分/提及命中）；设定详情反向显示「被哪些章引用」。把 NovelAI Context Viewer 的可信感抄过来。
6. **伏笔追踪**：新表 `lw_foreshadows`（planted_chapter/payoff_chapter/status/content）——研讨室对话与章节提取双通道写入；大纲/章节队列上挂徽标（"第 12 章该收伏笔了"）。国内竞品的显性卖点，且我们的事件/图谱管线提取成本低。

### P2
7. **自定义字段**：分类级字段模板（JSON Schema 存字典），实体 fields JSON 列；先在新自定义分类上支持，既有 8 类保持强列（避免迁移阵痛）。
8. **地点/势力层级**：parent_id + 树视图（世界→大陆→国家→城市）。
9. **时间线视图**：story_time 排序的事件轴（lw_events），挂洞察 tab。

### P3（观察需求）
10. 系列级设定共享（多书共用宇宙）；实体版本快照；per-scene 可见性（被自动引用+相关度覆盖大半后按需）。

## 3. 一个原则

**设定不是"填完的表"，是"活的引用源"**：每一条设定都应该能回答三个问题——它从哪来（溯源✅）、它现在怎样（演进 P1）、它被用在哪（引用可观测 P1）。行业产品验证了这三是用户信任设定集的前提；信任了，AI 的生成一致性才有地基。

Sources: [Novelcrafter Codex](https://www.novelcrafter.com/features/codex)、[Codex 条目结构](https://www.novelcrafter.com/help/docs/codex/anatomy-codex-entry)、[Codex 自定义分类](https://www.novelcrafter.com/help/docs/codex/codex-categories)、[Progressions](https://www.novelcrafter.com/help/docs/codex/progressions-codex-details)、[NovelAI Lorebook 文档](https://docs.novelai.net/en/text/lorebook/)、[NovelAI 上下文查看器](https://docs.novelai.net/en/text/editor/advancedsettings/)、[Kindlepreneur: Campfire vs World Anvil](https://kindlepreneur.com/campfire-vs-world-anvil/)、[World Anvil 模板](https://www.worldanvil.com/pricing)、[蛙蛙写作](https://ai-bot.cn/sites/8204.html)、[2026 AI 写小说工具横评](https://zhuanlan.zhihu.com/p/2079213193512096372)
