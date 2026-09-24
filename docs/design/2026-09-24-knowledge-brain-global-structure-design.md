# 知识大脑·全局结构提取增强设计——结构视角卡、结构目标模板、伏笔边与未竟项落地

- 日期：2026-09-24
- 状态：待评审
- 上游：`2026-09-16-knowledge-brain-design.md`（v2）、`2026-09-16-knowledge-brain-detailed-design.md`、`2026-09-23-knowledge-brain-narrative-addendum.md`（人物原型卡/伏笔边提案 + 修仙双书样张）
- 背景：kb-brain 已完成 M0-M4 实现并合并（feat/kb-brain → feat/story-room，2026-09-24，40+ 提交）。用户提出关键问题：**提取基于文档切片还是全文？全局的设计、思路、结构能否提取到？** 本文基于合并后代码实态回答，并给出四项增强的实施方案。
- 定位：实施级增补设计。四项增强全部复用既有机制（视角遍 / goal-distill / kb_knowledge_edges），**零新表、零新流水线**。

---

## 0. 结论摘要

1. **提取单元是章节窗口，不是切片**：基础遍按章工作、章内 ~6000 字分窗（`atomize.service.ts` MAX_WINDOW_CHARS）；kb_chunks 只是检索侧产物，不作为提取输入。「切片提取丢全局」的担忧在字面上不成立，但**「章节窗口是局部视野」的担忧成立**——基础遍天然看不到跨章的全局设计。
2. **全局能力已有主通道**：goal-distill（实现期新增，0916 设计里没有）= 章节摘要分批通读全书（12 章/批，百万字≈十几次调用）→ 初筛提名精读 ≤20 章全文 → reduce 汇成经验卡人审。外加 P2 全库论断聚类、实体演化摘要、leads-to 事件链、PPR 多跳。
3. **三处真实缺口**：①技法层论断以微观为主（现有 prompt 的 method 例句是「人物诗立内核」级），缺「章节功能」粒度，P2 聚不出「每章末尾留钩子」这类全局规律；②全书结构骨架没有结构化产物（goal-distill 只出散文经验卡）；③远距离伏笔无显式连边（leads-to 是句级相邻因果）。
4. **四项增强，按成本升序**：G1 结构视角卡（≈半天，纯数据零代码）→ G2 goal-distill 内置「叙事结构」目标 + 结构卡产物（1-2 天）→ G3 sets-up 伏笔边（1-2 天）→ G4 人物原型卡落地（≈1 天）。全部有明确验收口径。

---

## 1. 现状核实：合并后实态 vs 既有文档口径

| 机制 | 文档口径（0916/0923） | 合并后实态 |
|---|---|---|
| 提取单元 | 章节分窗、每章一个工作单元 | ✅ 章内分窗顺序处理（atomize.service） |
| 技法层论断 | P-1 鼓励 method/insight | ✅ 已鼓励，但粒度偏微观；无「本章在全局的功能」类观察 |
| 视角遍（lens pass） | T15 | ✅ 已实现：published 的 lens 卡 + `lensAttention{attendTo,questions}` → 观感论断，按 lensNoteId 分域裁决（digest-orchestrator `runLensPasses`） |
| 设定模式卡 | T19 | ✅ `SETTING_PATTERN_SYSTEM` 进 distill.service |
| goal-distill | 0916 无此设计（实现期新增） | ✅ map(章节摘要)→精读(≤20 章)→reduce；`KbBrainGoal={id,name,hint,enabled}` 自由 hint |
| 人物原型卡 character-pattern | 0923 增订 §2 | ❌ 未实现（KbNoteType 现有 7 类，无此成员） |
| sets-up 伏笔边 | 0923 增订 §3 | ❌ 未实现（KbEdgeRelation 现有 9 条：supports/refutes/refines/exemplifies/same-as/depends-on/applies-to/leads-to/instance-of） |

> 0923 增订文档「诉求映射表」中「已设计未实现」的判定基于合并前状态，以本表为准。

---

## 2. G1 结构视角卡（优先级最高：零新代码路径）

### 2.1 思路

视角遍机制已完整落地，缺的只是一张**结构视角卡**的数据。以它为透镜对已消化书籍重萃取，产出的「章节功能」观感论断进库后，P2 聚类即可涌现全局规律（「每章末尾留钩」「每 N 章一次线交汇」），并进一步凝为思想卡/模式卡——把「技法/结构」从基础遍的弱项变为视角遍的主场。

### 2.2 视角卡内容（可直接入库的实例）

```json
{
  "type": "lens", "title": "章节功能与叙事结构视角",
  "description": "用我看书当你关心：全书结构如何由章节功能搭建、节奏如何起伏、线索如何交织。",
  "lensAttention": {
    "attendTo": [
      "章末钩子（悬念句/断点及其指向）",
      "场景与视角切换（换线/换 POV 的位置与频率）",
      "铺垫与回收（本章埋设或兑现了什么）",
      "节奏节拍（压抑-释放的循环位置）",
      "本章功能位（开局钩子/铺垫/推进/转折/高潮/过渡）"
    ],
    "questions": [
      "这一章在全书结构中承担什么功能？判断依据是本章哪些文本特征？",
      "章末是否留钩、钩向哪里（事件/悬念/情绪）？",
      "本章是否切换叙事线或视角？切换点在哪？",
      "本章埋设或回收了哪些前文/后文的呼应？"
    ]
  }
}
```

### 2.3 超视野推断的约束（本项唯一的真风险）

章级输入下让 LLM 判断「全局功能」存在超视野推断风险。约束写进 LENS_PASS 变体（不新写 prompt 文件，在视角卡 questions 里即已体现，必要时在 `buildLensPassSystem` 追加一行通用规约）：

> 「只对能从本章文本特征推断的全局功能下判断，并在 evidence 引句中给出依据；无法判断时宁缺毋滥。」

观感论断走既有分域（lensNoteId 隔离），不污染公共层裁决——即使结构判断错了也不影响事实层。

### 2.4 改动与验收

- 改动：`buildLensPassSystem` 追加超视野约束一行 + 渲染层「新建视角」提供预设模板（结构视角/伏笔与回收视角，渲染层常量，与提取目标预设同模式）。**零核心代码路径新增**。
- 触发：视角遍随文档消化执行；对已消化的存量书，启用视角后点「补消化」（`kb:brain:digest-document`）——base 遍按台账跳过（同 hash），仅补跑 lens 遍。
- 验收：对一本已消化书籍启用后，①产出结构观感论断且 evidence 引句非空率 ≥80%；②P2 对其聚类产出 ≥1 张结构类思想卡（如「章末钩子规律」）；③公共层论断零变化（分域回归）。

---

## 3. G2 goal-distill「全书叙事结构」目标 + evidence 溯源升级

> **review 修正（实态核查后本项大幅缩水）**：①目标模板库已存在——`shared/constants/kb-brain-goal-presets.ts` + 设置抽屉「从模板添加」UI；②goal-distill 的 reduce 本来就「按提炼目标 hint 指定的结构分小节组织」出卡（`buildThemeCardUser` 指令 1），结构卡无需特化 reduce——**hint 即模板**；③卡类型已是 `type: 'synthesis'`。故本项落地只剩：加一条预设数据 + evidence 溯源升级。

### 3.1 预设「全书叙事结构」（加入 kb-brain-goal-presets.ts 小说组）

hint 约定「找什么 + 怎么组织」，结构卡的三段式直接写进 hint：

```text
梳理本书的叙事骨架，每本书单独成卡（素材标签含书名，按书分组），每卡按三段组织：
1) 骨架分段：把全书分为 ≤10 段，每段给章号区间 + 功能标签（入世/铺垫/推进/转折/高潮/收束等）；
2) 线索交汇：主线与副线各是什么、在哪几章交汇；
3) 转折点清单：重大转折的章号 + 事件 + 前文铺垫位置。
每项注明依据章号；摘要层看不出的不要编。
```

### 3.2 evidence 溯源升级（chapterId/documentId 入卡）

现状：goal-distill 的 evidence 只存 `[{quote: 章节标签, note}]`（人类可读但不可程序跳转）。升级：`MapFragment` 透传 `chapterId/documentId`（map 与精读两阶段均已有该信息），evidence 条目变为 `{quote, note, documentId?, chapterId?}`——后续「证据点击跳原文」的前置。零 schema 变更（evidence 本就是自由 JSON 列）。

### 3.3 改动与验收

- 改动：预设数据一条 + goal-distill fragment/evidence 透传；预计半天。
- 验收：对一百万字书跑「全书叙事结构」目标，产出结构卡满足：骨架分段 ≤10 段且每段有章号区间；转折点 ≥3 个且带章号；人工抽检章号区间可用率 ≥60%（对照原文目录）。
- 成本：与现有 goal-distill 同量级（map ≈十几次 + 精读 ≤20 章）。

---

## 4. G3 sets-up 伏笔边（0923 增订的实现级细化）

0923 增订 §3 的 schema 提案维持不变，本文按合并后代码落点细化：

| 落点 | 内容 |
|---|---|
| `kb-knowledge-edge.entity.ts` | `KbEdgeRelation` 增 `'sets-up'`（源=伏笔论断/承诺，目标=回收论断/兑现）；唯一键复用 `(sourceKind,sourceId,relation,targetKind,targetId)`，零 DDL 变更 |
| 候选池 | P1 已产出的 `open-question` 论断（schema 现支持该 type）——前置过滤：仅「具备承诺形态」（具体异物/异常行为/未解事件）者进候选 |
| 扫描器 | 新增 `foreshadow-scan.service.ts`（独立于 distill，避免 P-4 聚类职责膨胀）：输入=该书悬念论断（时序）+ 候选回收论断，P-8 单次调用输出 sets-up 边提案（带 evidence） |
| prompt | `prompts/index.ts` 增 `FORESHADOW_SYSTEM`：判例写死「因果相邻=leads-to（已有边，不重复产）；呼应不相邻=sets-up」 |
| 触发与台账 | **仅手动触发**（`kb:brain:foreshadow-run` + `foreshadow-status`，照 consolidate/cleanup 的 fire-and-forget 动线）。review 修正：原设计「metabolize 周期顺带」取消——cron 自动跑 LLM 扫描需要独立的成本核算与闸门，后置 |
| 治理 | confidence 压低、`verified=0` 进人审；批准置 1。**按候选生成器验收，不按自动连线正确率验收** |
| 消费 | list-atoms 增「未回收伏笔」过滤（悬念论断中无出边 sets-up 的集合，`neighborsOf` 一跳查询）；research.service 深度研究流可将悬空伏笔作为「作者没填的坑」素材（后置）；AtomListPanel 增伏笔过滤视图 |
| 接线清单 | `kb-brain.handler.ts`（ipcBridge 双端自动覆盖）+ `preload/index.ts` brain 命名空间 + `web/client/channel-map.ts` + BrainPanel 按钮 |

- 验收：对样张 §4.4 卡 F-2 类已知对称实例（青云苍松内奸 / 灵兽山倒戈），P-8 候选命中进前 5 即达标。
- 预期管理：跨距连边错误率天然高（比事件链对齐更难），此功能的价值是**把候选摆到人面前**，不是自动完成归纳。

---

## 5. G4 人物原型卡（0923 增订未竟项，直接落地）

0923 增订 §2 的 schema 提案维持不变（`character-pattern` 类型 + 配置开关 + 样张 §4.3 金标准），**review 修正归纳机制**：

- ❌ 不能照抄设定模式卡的按实体分组——实体名跨书不相同（张小凡≠韩立），按实体分组只能产出**单书角色卡**，不是跨书原型卡；
- ✅ 改走**跨书嵌入聚类**：取 character 实体的论断（fact/claim）入池 → 复用 distill 的嵌入聚类 → **簇内覆盖 ≥2 本书才成卡**（单书簇跳过——单书的是角色分析不是原型）→ `CHARACTER_PATTERN_SYSTEM` 逐簇归纳：五维骨架（欲望×缺陷×能力来路×关系位×弧线终点）+ 参数槽 + 按书登记实例（patternInstances）+ evidence 挂 atomId。

与合并后代码对齐的 diff：

- `kb-note.entity.ts` KbNoteType 增 `'character-pattern'`；`kb-brain-labels.ts` 增中文标签；
- `distill.service.ts` 增 `distillCharacterPatterns` 分支（与 `distillSettingPatterns` 平级，独立开关）；
- `brain-config.ts` patterns 增 `characterEnabled`（schema/缺省/merge 三处同步）+ 设置抽屉开关；
- `kb-brain.handler.ts` distill 通道透传开关；
- 装配红线照旧：注入骨架+参数+反例，不注入原文段落。

验收沿用 0923 §5：同骨架异参数识别人工抽检 ≥60%；新增回归：单书簇零产出（防角色卡混入）。

---

## 6. 实施顺序与总账

| 项 | 内容 | 量级 | 依赖 |
|---|---|---|---|
| G1 | 结构视角卡 + 超视野约束 | ≈半天（纯数据） | 无（视角遍已上线） |
| G2 | seed goals「叙事结构」+ reduce 结构卡模板 | 1-2 天 | G1 可选（提名信号后置） |
| G3 | sets-up 边 + foreshadow-scan + P-8 | 1-2 天 | 无 |
| G4 | character-pattern + P-7 | ≈1 天 | 无 |

每项独立可上、独立可关（G2/G3/G4 各有配置开关，缺省关），失败回退=关开关，不影响消化主链路——沿用 brainConfig 总闸语义。

## 7. 边界与不做的事

1. **不做全书逐字通读**：goal-distill 注释已写明成本红线（百万字 ≈ 十几次调用而非几百次）；全局视图一律走「摘要通读 + 定点精读」。
2. **不做 GraphRAG 式全库社区摘要**（0916 §12 既定）。
3. **不动 P1 基础遍粒度**：章节窗口是事实层的正确粒度（溯源锚点、幂等台账、成本模型都建在其上）；全局归上层归纳，不在基础遍里塞全书上下文。
4. **不做跨视角裁决**：结构观感论断与其他视角一样分域隔离，永不互裁（防平均化既定红线）。
5. **结构卡不自动 published**：AI 产物一律 proposed 起步，人审后才可被装配通道引用。
