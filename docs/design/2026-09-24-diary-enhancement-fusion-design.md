# 日记模块增强与知识融合设计方案——从孤岛到知识大脑的第四辐条

- 日期：2026-09-24
- 状态：待评审
- 诉求（用户原话要点）：①「日记模块，我想加强。本项目有很多功能是与知识相关的，因此我想丰富日记功能。先调研目前比较流行的日记系统或知识管理系统，给出完善的建议，有深度、有价值，不要泛泛而谈，也不要钻牛角尖」②「照片日记和普通日记中有图片，有什么区别」③「有没有必要将日记与知识库、长文、领域学习等模块融合，互相赋能？」
- 上游：`2026-09-16-knowledge-brain-design.md`（五层模型与四流水线）、`2026-09-16-detailed-design.md`（DDL/prompt 规格）、`2026-09-23-knowledge-brain-narrative-addendum.md`（人物原型卡/伏笔线，均未与日记耦合）

---

## 0. 结论摘要

1. **诊断一句话：日记的问题不是功能少，而是在一个以知识大脑为核心竞争力的项目里是个孤岛。** 现有与知识系统的连接只有一根单向薄桥：手动「加入知识库」（`KbPickerDialog.vue:128-151`）+ 工作流 `save-diary` 写入节点（`workflow/nodes/diary-nodes.ts:23-83`）。知识大脑的五层体系、混合检索、FSRS 复习、agent 工具对日记全部关着；日记本体 AI 能力为零。
2. **差异化空位（外部调研结论）**：市面日记产品（Day One/Rosebud/Reflection）没有知识大脑，其"AI 洞察"只能基于日记文本做浅层统计；PKM 工具（Obsidian/Logseq）没有观感沉淀层，日记与知识笔记是平级的死文件。**本项目两边都有——kb-brain 设计文档自述"用户第一人称观感是全库最珍贵资产"，而日记正是这个资产的主输入面，目前只有 UI 捕捉通道（capture-reading）、没有日记侧入口。打通即是别人抄不了的卖点。**
3. **拓扑决策：日记做知识大脑的第四条辐条，不做任何点对点专线。** 长文/领域学习/EP 已通过两条标准通道挂在大脑上（拉式 `kb_brain_query` 工具 + 推式 structured-provider/HostKit 注入），日记沿用同一模式。两两融合是 O(n²) 集成复杂度；任何两个域的赋能，正确实现永远是「A 消化进大脑 → B 从大脑拉取」，且论断溯源四件套保证跨域引用可回链到具体日记。
4. **实施分四期，零新表**：P0 断头路收口（软删除/搜索/反链/标签/日历，纯接线，1-2 周）；P1 复盘与重现（周报复盘内置流、那年今日，全用现成积木）；P2 日记 × 大脑（日记消化 pass 走既有文档→消化管线 + `diary:` 向量命名空间 + 侧边灵感条）；P3 附件图片与结构化字段。P2 是核心差异化，P1 是见效最快的价值闭环，故 P1 先行。
5. **三条红线先行**：①隐私 opt-in（日记是最私密模块，消化按目录显式开启、默认关闭，论断带 jumpTo 回链可审计）；②提议制（日记消化产出一律 proposed 进提议箱，人批准才入论断层；跨域建议单项提示、不自动写）；③成本适配（日记高 volume 低密度，轻量消化：字数阈值 + 周批量 + 台账幂等，不照搬 847 行 orchestrator 的全套遍次）。
6. **照片日记不立项**。照片日记与"普通日记贴图"的本质区别在「谁是第一等公民 + 图片上下文由谁提供」：内嵌图上下文免费（周围文字即索引），照片日记每张图都要视觉模型额外生产上下文，且桌面 Electron 无相机流导入前提。落地：P3 做内嵌贴图（粘贴→`.assets`→视觉描述进索引）+ 顺带摘走"图片作写作引子"小机制（Apple Journal 的反转用法）。
7. **跨模块融合四闭环均落在现成积木上**：日记→长文（人生经验经消化变成创作素材，`brain-generation.ts` 拉取管线现成）；领域学习→日记（FSRS 复习后的精细化加工反思落日记）；日记→领域学习（`goal-distill` 跑"困惑收集"目标，生活困惑驱动学习主题）；创作→日记（`save-diary` 节点承接创作复盘）。

---

## 1. 现状盘点：日记今天有什么、缺什么

### 1.1 数据模型：四表齐全，附件只有模型没有功能

| 实体 | 现状 | 关键点 |
|---|---|---|
| `diary_entries` | `entities/diary-entry.entity.ts`；DDL `src/electron/database/index.ts:2265` | id/userId/folderId/title/content/filePath/wordCount/tags(json)/frontmatter/时间戳；**DB + 文件系统双写，正文以 `.md` 文件为准**（`getEntry` 从文件读回） |
| `diary_links` | `entities/diary-link.entity.ts`；DDL `:2281` | Obsidian 风格 `[[标题#锚点\|显示文本]]` 双向链接；单向存储（sourceEntryId→targetTitle/targetEntryId），反查即反链；**targetEntryId 可空 = 未解析链接**；anchor 支持锚点 |
| `diary_attachments` | `entities/diary-attachment.entity.ts` | entryId/fileName/filePath/fileSize/mimeType/createdAt；**repository 存在（`diary-attachment.repository.ts`）但 diary.service 0 调用、16 个 IPC channel 无附件通道、前端无上传 UI——只有模型没有功能** |
| `diary_folders` | `entities/diary-folder.entity.ts` | parentId 自引用→无限层级树；path/sortOrder；目录树 CRUD 完整（含 FS 目录同步与 `.assets` 子目录创建） |

注意：实体层无 TypeORM 关系装饰器，关系全靠 DDL FK + 手动查询（目录 DTO 的 childCount/entryCount 由 QueryBuilder 子查询补齐，`diary-folder.repository.ts:43-101`）。

### 1.2 服务层：CRUD 完整，六条断头路

`DiaryService`（`core/platform/services/diary.service.ts`）已有：目录 CRUD（:49-163）、条目 CRUD（:190-345）、`search`（:382，SQL `LIKE %kw%`，`diary-entry.repository.ts:79-94`）、`getBacklinks`（:398）、`parseAndStoreLinks`（:412，`[[...]]` 正则解析+findByTitle 回填）、默认标题=当天日期（:452）、`getRootPath`（:463）。

**断头路清单（后端已有能力、未上浮到 service/IPC/UI）**：

| # | 断头路 | 证据 |
|---|---|---|
| 1 | 搜索：channel 通了，UI 是 TODO | `Diary.vue:340-346` `// TODO: 实现搜索` |
| 2 | 反链查询：前端 0 调用 | `getBacklinks` channel 存在；`BacklinkInfo.context` 恒 undefined（`diary-link.repository.ts:58`） |
| 3 | 链接延迟解析回填 | `findUnresolvedLinks`/`updateTarget` 已实现（`diary-link.repository.ts:121`），service 未暴露——新建日记命中历史未解析链接时无法自动回填 |
| 4 | tags 字段闲置 | 有列、无编辑 UI、无筛选、无按标签查询 |
| 5 | 附件全套 | 模型+repo 齐，service/IPC/UI 全缺（见 1.1） |
| 6 | `moveEntry` | 前端 0 调用 |

**完全没有**：任何 AI 能力（摘要/追问/复盘/打标/检索问答）、日期范围查询（repo 无对应方法）、统计、**回收站/软删除（`deleteEntry` 是物理 rm -rf + 级联，误删不可恢复——对"记录人生"的模块是当前风险最大的短板）**、"每日一篇"概念。

### 1.3 工作流与 AI：仅写入旁路，日记本体 AI 为零

- 工作流仅 1 个节点：`save-diary`（:23-83），定位"知识提炼存日记"，上游 LLM 产出落为条目；自动创建/复用「AI 提炼」根文件夹（:53-67）。表单 `workflow-node-forms.ts:690-699`，目录 `workflow-node-catalog.ts:1027-1043`，能力卡 `module-capability-catalog.ts:172-178`（diary 仅此一张薄卡）。
- **没有读向节点**：日记不能作为工作流/LLM 的输入上下文。
- 日记模块本体 grep 无任何 LLM/prompt 调用。内置应用「知识提炼存日记」「网页摘要入库」是既有先例（`create-builtin-apps.ts:62,75`）。

### 1.4 前端与导出

- 三栏：目录树（`FolderTreeItem.vue`）→ 条目卡片列表 → 编辑器（`DiaryEditor.vue`：bytemd+CodeMirror 双模式、1 秒防抖自动保存、字数）。路由 `/diary` 由 `renderer/packs/diary/index.ts` 注册。
- 导出（`core/packs/diary/services/diary-export.service.ts`）：HTML(marked)/PDF(printToPDF)/DOCX + 手动「加入知识库」。**两笔技术债**：未迁移到平台统一文档输出层 document-tools（`core/platform/services/document-tools/`，注释明确日记导出是消费方之一）；未启用 markdown-enhance 的 KaTeX/mermaid 增强（`markdown-enhance.ts`）——日记含公式/流程图导出会丢渲染。
- 无：日历视图、标签筛选、`[[` 补全、反链面板、移动日记 UI、附件上传、统计面板。

### 1.5 与知识系统：单向薄桥

- 日记→KB：`KbPickerDialog.vue:128-151` 手动 `addDocument({type:'text', source:{type:'diary', id}})`，按 source 幂等覆盖（`knowledge-base.service.ts:353-450`）；类型定义 `knowledge-base.types.ts:487-492`。
- **反向不存在**：diary_entries 无 kb 字段；diary_links 不指向知识文档；KB/大脑无法回流日记。
- 工作流里 kb-retrieve/kb-query-multi/kb-ingest/kb-qa 与 save-diary 可同图组合，但那是编排不是模块内连接；且知识节点是旧版 RAG 口径，未接 brain 池 `include` 参数。

### 1.6 知识基建"积木"清单（日记增强可直接复用）

| 积木 | 位置 | 对日记的意义 |
|---|---|---|
| 消化管线 + 台账幂等 | `digest-orchestrator.service.ts`（847 行）、`kb_digest_passes` UNIQUE(chapter_id, pass_key) | 日记若注册为 KbDocument（DocumentSource 幂等桥现成），可直接进既有消化管线，**台账无需任何改动** |
| 人类观感入口 | `kb_atoms.origin='human'` + capture-reading 通道（`kb-brain.handler.ts` 约 27 个 `kb:brain:*` 通道） | 日记消化论断的同族入口，提议箱（proposed→人批）现成 |
| 统一检索 | `brain-query.service.ts`（向量+BM25+RRF+软衰减+PPR） | 侧边灵感条/日记问答的检索底座 |
| 向量命名空间注册表 | `vector-namespace.ts`（chunk/qa/atom/note/ent） | **`diary:` 命名空间是预留好的扩展点** |
| 拉式工具双形态 | `kb-brain-tools.ts`（AgentToolRegistry 版）+ `writing-brain-tool.ts`（ai@6 tool 版，永不 throw） | 日记侧边/助手直接复制此模式 |
| 推式装配 | `structured-provider.ts` + HostKit 通道A（`host-kit.ts:264-277`，kb-brain provider 已支持 3 域） | diary provider 的接入面 |
| FSRS 复习 | `fsrs.service.ts` dueNext/grade，kb_notes fsrs_* 缓存列 | "今日到期卡"进日记页 |
| 目标驱动提炼 | `goal-distill.service.ts`（自定义提取目标） | "困惑收集"目标→学习主题 |
| 长文拉取管线 | `brain-generation.ts`（3 处接 kb_brain_query，静默回退） | 日记素材进创作的通道，零改动 |
| 内置流先例 | `create-builtin-apps.ts:62,75` | 周报复盘流的容器 |

---

## 2. 外部调研：两条路线及其盲区

### 2.1 日记类产品：AI 正从"事后摘要"走向"过程追问 + 周期复盘"

| 产品 | 标志能力 | 对本设计的启示 |
|---|---|---|
| Day One（公认第一梯队） | 上下文元数据（天气/地点/照片）自动入条目；AI 条目摘要、标题建议、Daily Chat 引导反思；相册自动导入 | ①上下文元数据零成本提升回忆价值；②"那年今日"靠照片重现唤起力最强 |
| Rosebud（AI 原生） | 对话式日记，AI 按内容提**自适应追问**；情绪分析；按主题扫描周报 | 对话引导有效，但其洞察只能基于日记文本浅层统计——**没有知识大脑** |
| Reflection | 实时个性化 prompt；官方推荐 15-20 分钟**周复盘仪式**（按主题扫一周→AI 总结要点+一条可执行建议） | 复盘是可产品化的仪式，不是功能堆砌 |
| Journey | Coach 多天引导课程 | 结构化复盘程序可模板化 |
| Daylio | 图标打点情绪记录，零写作门槛 | 证明非文字记录有独立价值，但与本项目气质不符（见 §9 不做清单） |

### 2.2 PKM 类工具与方法论：价值取决于"提取"与"重现"

- **Obsidian/Logseq**：daily notes 是一切起点，靠双链+图谱把日记内容长成持久知识；Sébastien Dubois 称之为 "knowledge extraction"——日记是原生材料，提取并链接成笔记才是知识形成过程。
- **Tana（supertags）/ Capacities（对象化）**：结构化 workspace OS 路线，与本项目定位不同，不跟随。
- **方法论**：Bullet Journal 月度 migration（不重要的划掉、重要的迁移）、Tiago Forte weekly review、Andy Matuschak evergreen notes、间隔重复——殊途同归：**日记系统的长期价值不在记录那一刻，在重现（resurfacing）**：那年今日、反链、周报、间隔复习。
- 调研来源：[Reflection vs Rosebud 对比](https://www.reflection.app)、[Rosebud 官网](https://www.rosebud.app)、[Holstee 2026 日记应用横评](https://www.holstee.com)、[Sébastien Dubois: How I use daily notes](https://pkmjournal.com)、[Forte Labs: Weekly Review](https://fortelabs.com)、[XDA: PKM 工具趋势](https://www.xda-developers.com)。

### 2.3 盲区 = 空位

两条路线在市面产品里互不相通：日记产品没有知识大脑；PKM 工具没有观感沉淀层。本项目五层大脑（L0 chunk→L1 论断→L2 实体/边→L3 卡片→L4 技能）+ 日记双链薄底都已在手。**日记 × 大脑的打通是本项目独有卖点，且日记侧消化在概念上与大脑既有机制天然同构（capture-reading 观感捕捉、lens 视角卡、human 论断），不是硬接。**

---

## 3. 总设计判断

### 3.1 定位

> **日记 = 知识大脑的第一人称输入面（消化产出 human 论断/素材）+ 复盘面（周报/重现/复习）。**

记录只是手段；对外，日记经消化成为可检索、可被任何创作域引用的资产；对内，日记是重现与复盘的仪式面。两者都指向同一个飞轮：**记录 → 提取 → 复盘 → 再记录**。

### 3.2 拓扑：第四辐条，不做点对点

```
            ┌── 长文（故事研讨室/章法生成，消费最深，brain-generation 拉取现成）
            │
日记 ──消化──▶ 知识大脑 ◀──拉取/注入── 领域学习（FSRS/goal-distill）
（唯一持续    │  （L1 论断 / L3 卡片 = 通用语言）
 产出人类    │
 原创素材）  └── EP / chat（scope 装配 + kb_brain_query 白名单现成）
```

- 任何两域赋能 = 「A 消化进大脑 → B 从大脑拉取」，杜绝 O(n²) 专线。
- 论断溯源四件套（document/chapter/chunk/quote）+ jumpTo 回链保证跨域引用可审计到"出自你哪天哪篇日记"。
- 日记的特殊地位：**飞轮里唯一持续产出人类原创素材的口**，其余域基本在消费与循环既有素材。

### 3.3 三条红线（设计文档第一节级约束）

| 红线 | 内容 | 落点 |
|---|---|---|
| **隐私先于融合** | 用户若担心日记喂 AI 就不敢写真话，而写真话是全部价值前提。消化**默认关闭、按目录显式 opt-in**；论断带 jumpTo 回链，用户随时可审计"AI 知道你日记里的什么" | `diary_folders` 加 `brain_opt_in` 列（默认 false）；私人目录永不入库 |
| **提议制，不自动跨域写** | 消化产出一律 proposed 进提议箱；日记→学习主题只能是候选、素材卡只能进提议箱。飞轮每圈人批一次，否则错误在环内自我放大（日记幻觉→论断→创作→复盘回日记） | 复用大脑既定哲学"AI 提议、人批准"；对齐大脑对长文"只读供给"红线 |
| **成本适配内容密度** | 书籍逐章消化值得，日记高 volume 低密度不值得全套遍次 | 轻量消化：字数阈值以下跳过、周批量跑（挂机 interval 先例：metabolize）、只提取判断/观察句式、台账 pass_key 幂等 |

---

## 4. P0 地基：断头路收口（纯接线，1-2 周，0 新表 + 1 列）

| # | 事项 | 方案 | 依赖 |
|---|---|---|---|
| P0-1 | **软删除/回收站**（最先做） | `diary_entries` 加 `deletedAt` 列；删除=置列+列表过滤+回收站 UI；30 天后挂机物理清理（ metabolize interval 先例）；FS 文件移入 `.trash/` 目录而非删除 | 1 列 |
| P0-2 | **搜索接 UI + 日期范围** | 前端接 `diary:search`（TODO 处补实现）；repo 增 `findByDateRange(from,to,folderId)`；搜索结果支持标签/日期过滤 | 0 变更 |
| P0-3 | **链接补全 + 反链面板 + 延迟解析回填** | 编辑器输入 `[[` 弹条目选择（数据源 `getEntries` 标题缓存）；右侧反链 tab（`getBacklinks` 现成）；`BacklinkInfo.context` 真实填充（`diary-link.repository.ts:58` 修 undefined）；`createEntry` 后调 `findUnresolvedLinks`+`updateTarget` 回填历史 | 0 变更 |
| P0-4 | **tags 激活** | 条目编辑器标签输入 + 列表按标签筛选（`tags` json 列已存在） | 0 变更 |
| P0-5 | **日历视图** | 列表区可切日历模式（按月视图标记有日记的日期，点击打开/创建当天条目——顺带落地"每日一篇"约束：当天已有日记默认打开）；吃 P0-2 的日期查询 | 0 变更 |
| P0-6 | **导出迁移 document-tools** | `diary-export.service.ts` 迁到平台统一文档输出层并启用 markdown-enhance（KaTeX/mermaid）；同时确认图片资源嵌入（为 P3 贴图铺路，当前裸 marked 实现导出丢图/路径断裂风险） | 0 变更 |

---

## 5. P1 复盘与重现（全用现成积木，约 1 周，0 新表）

### 5.1 周报/月报复盘内置流

- **容器**：内置应用（`create-builtin-apps.ts` 先例「知识提炼存日记」）+ workflow `llm-chat` → `save-diary`，落「复盘」目录。
- **数据聚合**：新增一个查询服务方法：当期日记列表 + 当期大脑新增论断/卡片（`kb_digest_passes` 台账统计现成）+ （可选）当期完成的复习评分（`kb_note_reviews`）。
- **生成规格**：三段式——发生了什么 / 学到了什么 / 下周关注什么；每段引用具体条目与论断（带回链）。周一早晨生成上周报，可手动触发。
- **闭环关键**：周报日记本身进 P2 消化管线——复盘产物也变成论断。
- 对标依据：Reflection 的 15-20 分钟周复盘仪式、Bullet Journal migration、Forte weekly review。

### 5.2 那年今日

- P0-2 日期范围查询做好后成本趋近于零：打开日记时展示 1-3 条历史同日（同年优先）条目卡片。Day One/Roam 标配的留存利器。

### 5.3 侧边灵感条（一期形态）

- 编辑器右侧可收起的"灵感条"，本期呈现两类现成数据：
  1. **今日到期复习卡**：`fsrs.service.ts` dueNext 队列（门槛=learning.enabled），卡片正面直接显示，点击跳复习面板；
  2. **相关论断/卡片**：以当前日记标题/首段为 query 走 `kb_brain_query`（复制 `writing-brain-tool.ts` 的 ai@6 tool 模式：检索面 cap 3、结果收口、永不 throw）。
- **纪律**：呈现为可忽略的侧边条，绝不注入正文、不自动改写。对标 Rosebud 的对话引导，但引导依据是用户自己的知识库。

---

## 6. P2 日记 × 知识大脑（核心差异化，2-3 周，0 新表 + 1 列）

### 6.1 日记消化 pass：human 论断的一等入口

**路线：注册为 KbDocument 走既有管线，不建日记专用管线。**

1. **入口**：opt-in 目录下的条目保存后，异步 `addDocument({type:'text', source:{type:'diary', id}})`（`DocumentSource` 幂等 upsert 现成，`knowledge-base.service.ts:353-450`），触发既有 `kb:document-completed` → digest-orchestrator。
2. **消化变体**：日记文档走**轻量基础遍**——只跑原子化（提取"我的观感/决定/发现"类判断句式的专用 prompt 变体，对齐 detailed-design P-1~P-8 规格族新增 P-diary）+ 实体解析；**不跑**视角遍/观感捕捉等重遍次；跳过字数阈值（建议 <300 字）以下条目。
3. **产出治理**：论断一律 **proposed 进提议箱**（现有 `proposal-inbox/decide-proposal` 通道），人批准后入论断层；论断溯源指向日记文档，jumpTo 回链打开原条目。
4. **幂等**：条目内容 hash 进 pass_key，复用 `kb_digest_passes` UNIQUE 约束，编辑重消化自动去重——台账零改动。
5. **频控**：按周批量（挂机 interval），不做实时；失败进台账重试（既有恢复机制）。
6. **素材 lens**：新增预置视角卡「创作素材」，日记消化论断默认挂此 lens——与大脑"跨视角永不互裁"纪律兼容，创作域按视角取面即可只取素材。
7. **待详设对齐点**：日记论断的 `origin` 字段语义（AI 从人类文本提取 vs capture-reading 的 human 原话）需实现时与 kb_atoms 状态机对齐；建议日记论断标记 sourceType='diary' 并参与正常裁决（supported/contradicted）。

**opt-in 开关交互规格**（= 分类级配置项 `brain_opt_in`，向量化与消化共用这一个总开关）：

| 动作 | 行为 |
|---|---|
| 开关位置 | 目录树右键/目录设置对话框「纳入知识大脑」；**默认关**，任何分类都可开（与名称无关） |
| 开启 | 新条目保存即异步注册（第 1 条路径）；附一次性「回填存量」动作，对目录内既有条目批量走同一幂等 upsert，带进度提示 |
| 关闭 | 停止新条目注册，并对已注册文档**出库清理**：按 source(type='diary', id) 反查 KbDocument 删除，级联其 chunk 向量（`diary:` 命名空间）；级联范围详设确认——未批准的 proposed 论断直接删，已批准论断归档而非物理删（对齐大脑"不物理删除"红线） |
| 条目级排除 | frontmatter `brain: false` 或条目菜单「本篇不入库」；向量化与消化入口统一检查此标记 |

一个开关管到底（而非向量化/消化各一个子开关）的理由：①技术上向量化与消化共用同一条 KbDocument→管线，拆开要分叉；②隐私暴露面上两级等价——都要把文本发给 embedding/LLM 服务，且消化产出被人批闸门挡着；③UI 只有一个心智概念。若后续确有"可被提醒但不愿被提炼"的诉求（灵感条要历史日记召回、但拒绝出论断），再升级为总开关+消化子开关，预留语义是"子开关默认跟随总开关"。

**评测**：参照 kb-brain eval runner 骨架 + narrative addendum 的 13 张金标准卡先例，先手写 10-20 篇样本日记的金标准论断集再调 prompt。日记口语化、论断密度低于书籍，**预期提议箱噪音高于书籍消化——人批闸门就是为此设计的，不要追求全自动**。

### 6.2 `diary:` 向量命名空间

- `vector-namespace.ts` 注册 `diary:` 前缀（opt-in 条目的向量入池），复用 kb_vectors 池与 embedding 配置（云端/Ollama 双路现成）；`brain-query` 命名空间分流表加一行。
- **不建独立向量库、不起新引擎**（kb-brain M0 红线）。

### 6.3 侧边灵感条（二期形态）

在 P1-5.3 基础上追加第三类数据：**相关历史日记**——以 `diary:` 命名空间向量召回（"你在这天写过相关的事"），每条带日期与摘要、点击跳转。这是 Obsidian 双链的自动版：用户不用记得去链，系统替你链。

### 6.4 push 侧（可选，远期）

diary provider 注册进 structured-provider（scope 匹配注入"个人背景事实"段），供 chat/长文宿主被动装配。**默认不做**：日记是最私密模块，推式注入的暴露面大于拉式，待 P2 消化稳定后单独立项评审。

---

## 7. 跨模块融合：四个赋能闭环

| # | 闭环 | 机制 | 现成积木 |
|---|---|---|---|
| F1 | **日记→长文**（最值钱） | 写作者日记里的人生观察/对话/情绪经消化变成「创作素材」lens 论断/素材卡；章法生成拉取检索到"你某月写过的便利店店员"——作品带着作者自己的人生 | 消化（6.1）+ `brain-generation.ts` 拉取管线（3 处已接，零改动）+ 按视角取面纪律 |
| F2 | **领域学习→日记** | 复习卡揭示后提示"用两句话写写这个概念让你联想到什么"，反思落日记；补上学习闭环缺的**精细化加工**（elaboration，学习科学中巩固效果最强的环节） | dueNext 进日记页（5.3）+ save-diary 节点 + 消化回写论断 |
| F3 | **日记→领域学习** | goal-distill 跑"困惑收集"目标：从日记提取反复出现的"我不懂/想搞明白 X"，产出候选学习主题进 domain-learning（**候选**，人批后入学习流） | `goal-distill.service.ts` 自定义目标机制现成 |
| F4 | **创作→日记** | 章节写完自动落创作复盘（"本章卡在哪/用了什么套路"）进日记；大脑从日记提炼的 plot-pattern 卡回流指导下一章（模式卡注入骨架不注入血肉，纪律已有） | save-diary 节点 + 周报流的创作域特例 |

F1-F4 全部经由大脑枢纽，互相独立可分期上线；上线顺序建议 F4（零新机制）→ F2 → F1（依赖 P2 消化+素材 lens）→ F3。

---

## 8. 照片与附件：内嵌贴图优先，照片日记不立项

### 8.1 辨析：差别不在"有没有图片"，在"谁是第一等公民 + 上下文由谁提供"

| 维度 | 普通日记 + 内嵌图片 | 照片日记（photo-first） |
|---|---|---|
| 信息主从 | 文字是叙事主线，图片是证据/插图 | 图片是记录本体，文字退化为配文 |
| 数据模型 | markdown 一处引用，位置即语义 | 每图独立对象：拍摄时间/EXIF/顺序/单独描述 |
| 上下文来源 | **免费**——周围文字天然是检索上下文 | **必须额外生产**——视觉描述/EXIF/OCR，否则是检索黑洞 |
| 记录动线 | 写作驱动，偶尔配图 | 捕捉驱动、零写作门槛（Day One 相册导入、Daylio 打点） |
| 重现语义 | 那年今日=那天的文字 | 那年今日=那天的**画面**，视觉怀旧唤起力最强 |

### 8.2 决策依据

- **上下文经济学**：内嵌图的检索边际成本为零（正文 atomize 即覆盖）；照片日记每张图要过一遍视觉模型生产上下文，是持续成本，本质是"放弃检索换记录门槛"——只有移动端相机流场景才划算。
- **前提不具备**：Electron 桌面、无相册流导入、用户自然动线是写文字+贴截图/资料图。照片日记立项的两个前提（移动端、life-log 习惯）均不存在。
- **数据模型无需二选一**：`diary_attachments` 现有模型两种都撑得住（照片日记≈"attachments 以图为主、正文极短"的条目，前端按此渲染网格即可）。**这不是现在要做的架构决策。**

### 8.3 落地（P3）

1. **内嵌贴图**：粘贴/拖拽 → 上传 `diary_attachments` → 存 `.assets`（目录创建时已建）→ markdown 引用插入；图片过视觉模型生成一句描述，写进附件表 `description` 列（+1 列）并作为 alt text——进检索索引。桌面场景 90% 需求（截图/资料图/图表）覆盖。
2. **图片作写作引子**（Apple Journal 的反转，顺路摘走）：灵感条增加一类——从最近附件图片生成一条写作 prompt（"写写这张照片里的事"），一次视觉调用，绕开照片日记全部重模型问题。
3. **前置依赖**：P0-6 导出迁移必须先行（资源嵌入），否则贴图导出丢图。

---

## 9. 明确不做清单（防钻牛角尖）

| # | 不做 | 理由 |
|---|---|---|
| 1 | 日记独立向量库/新检索引擎 | 复用 kb_vectors 池加 `diary:` 命名空间即可；kb-brain M0 红线"无新引擎" |
| 2 | Daylio 式情绪打点克隆 | icon 打点与项目气质不符。若做心情，做成 frontmatter 结构化字段（心情/精力 1-5）+ 周报聚合趋势，服务复盘不服务打卡——**情绪与产出的相关性**才有价值 |
| 3 | Tana/Notion 式结构化数据库 | workspace OS 是另一物种，越界 |
| 4 | 社交分享/端到端加密/多人协作 | 与定位无关 |
| 5 | 照片日记独立形态 | 见 §8；只摘"图片作写作引子" |
| 6 | 语音日记 | 多模态重功能，附件先把图片做扎实；有移动端再议 |
| 7 | diary push 式 structured-provider 注入（近期） | 暴露面大于拉式，待消化稳定单独立项（见 6.4） |
| 8 | character-pattern/sets-up 落地与日记混做 | 叙事域增订（narrative addendum），与日记零耦合，混做互相拖进度 |
| 9 | 日记全自动消化免审批 | 提议箱人批是飞轮防自激的闸门，日记口语化噪音更高，更不能免 |

---

## 10. 路线图

| 期 | 内容 | 变更量 | 预估 | 特征 |
|---|---|---|---|---|
| **P0** | 软删除回收站、搜索接 UI+日期查询、链接补全+反链+回填、tags、日历视图、导出迁移 | 1 列（deletedAt）+ repo 查询 | 1-2 周 | 纯接线，清工程债 |
| **P1** | 周报/月报复盘内置流、那年今日、侧边灵感条一期（到期卡+大脑池检索） | 0 新表 | 1 周 | 全现成积木，最快见效的价值闭环 |
| **P2** | 日记消化 pass（opt-in→KbDocument→轻量遍→提议箱）、`diary:` 命名空间、灵感条二期（历史日记召回）、素材 lens | 1 列（brain_opt_in）+ prompt 变体 | 2-3 周 | 核心差异化；含金标准评测 |
| **P3** | 内嵌贴图+视觉描述、图片写作引子、FSRS 精细化加工反思流（F2）、frontmatter 结构化字段 | 1 列（attachment.description） | 按需 | 锦上添花 |
| 远期 | F1 全链打磨、F3 困惑驱动学习、diary push provider、创作复盘流（F4 可提前至 P1 后任意时点） | — | — | 单独立项评审 |

**排序理由**：P1 先于 P2——周报复盘完全复用内置流模式，一周内看到完整"记录→复盘"价值；P2 涉及论断质量评测，值得慢工。P0 的软删除最先做——它是唯一的风险项，其余是体验项。

**总原则**：融合本身不是目标，"所有域经由大脑互为供需"才是；日记的特殊地位在于它是飞轮里唯一持续产出人类原创素材的口。守住三条红线（隐私 opt-in、提议制、成本适配），日记就从孤岛变成整个知识系统的第一人称引擎。
