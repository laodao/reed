# 长文写作 · 深评修复方案（A–G，2026-09-20）

> 依据：`docs/review/2026-09-20-longwriting-deep-evaluation.md`（勘误后定稿）。
> 与既有批次的关系：`docs/plan/2026-09-20-longwriting-fix-plan.md` 的 §4–§11 不变，本文新增深评发现的 A–G 七项，并在文末给出合并后的推荐执行序列。
> 每项含：根因（代码级，已核对源码）→ 修复方案 → 改动清单 → 验证方案 → 规模。
> 统一验收门：`npm run typecheck` 零新增错误 + longwriting 单测全量绿（distiller 既有失败除外）+ 各项真机验收步骤。

---

## A. 快速路径治理：内置「长文写作」挂成稿审校 + 能力卡披露（P1，规模 S-M）

**根因（源码级）**：内置工作流种子模板 `src/core/database/migrations/builtin-apps/long-form-writing.json`（经 `create-builtin-apps.ts` 同步入库，id=`builtin_def_long-form-writing`）的节点序列为 `start → storyline(llm-chat) → outline(llm-chat) → loop(chapter llm-chat) → concat(code) → cond(condition) → saveKb1(kb-ingest) → save1(save-asset) → end`——**无任何审校/一致性节点**；`module-capability-catalog.ts` 长文卡将其列为 workflow 优先路径且未披露「无一致性检查」。当前 0 次运行（预防性），但模板版本机制意味着一旦引流即成默认漏斗。

**修复方案**：
1. **模板加「成稿审校」节点**：`concat` 之后、`cond` 之前插入 `llm-chat` 节点（`review`）——系统提示词：全书连贯性审校员，逐章核对「前后矛盾/大纲未落点/人物设定漂移」，输出审校报告（JSON：issues + 总评）；审校报告并入 `save-asset` 的产物正文尾部与 `kb-ingest` 入库内容。不阻断产出（快速定位=草稿机，报告随稿交付）。
2. **能力卡披露**：`module-capability-catalog.ts` 长文卡 tagline 与 workflow invocation note 追加「快速草稿：无一致性门禁，产物在资产/知识库；需一致性保障/深度共创用研讨室」；工作流卡同步一句。
3. 模板改动经**模板版本重同步机制**生效（`create-builtin-apps.ts` 的 `BUILTIN_TEMPLATE_VERSION`：递增即重同步所有未被用户接管的内置定义，幂等已有）。

**实施细节（开发交接，JSON 已实测核对）**：模板顶层为 `kind/formatVersion/name/description/category/graph/triggers/settings`；节点引用语法 `{{节点id.字段}}`（chapter 节点已有多引用先例）。具体改法：
- 新节点放 `concat1` 与 `cond1` 之间：`{ id:'review', type:'llm-chat', position 顺延, config:{ systemPrompt:'全书连贯性审校员…只输出 JSON：{issues:[{chapter,where,what}],summary}', prompt:'故事线：{{storyline.content}}\n章节大纲：{{outline.parsed}}\n全书正文：\n{{concat1.result}}', jsonMode:true, providerConfigId:'{{start.providerConfigId}}', modelId:'{{start.model.modelId}}' } }`；
- 连线：删 `concat1→cond1`，加 `concat1→review`、`review→cond1`；
- 产物并报告：`save1.content`（现值 `{{concat1.result}}`）与 `saveKb1.content` 的表达式改为 `{{concat1.result}}

---

【审校报告】
{{review.content}}`。

**改动清单**
- `src/core/database/migrations/builtin-apps/long-form-writing.json`（+审校节点与连线、产物引用）
- `src/core/database/migrations/create-builtin-apps.ts`（模板版本 +1）
- `src/core/platform/workflow/tools/module-capability-catalog.ts`（两张卡文案）

**验证方案**
- 结构断言（node 脚本）：加载改后的 JSON，断言 review 节点存在、`concat1→cond1` 边已移除、save1 内容表达式含 `{{review.content}}`。
- 迁移：本地把该定义 `template_version` 触发重同步（或清库重初始化），断言新图含 review 节点且用户已接管定义不被重置（幂等既有断言路径）。
- 真机：`run_workflow` 跑一次微小说（2 章），确认审校报告出现在资产产物与知识库文档中。
- 能力卡：`discover_capabilities` 返回包含披露文案。

---

## B. 大纲删除级联清理 + FK 异常人话化（P1，规模 M）

**根因（源码级）**：①`LongWritingService.deleteOutline`（`:899`）= 裸 `lwOutlines.delete(id)`，无级联——`lw_story_chapters`（FK 指向 outline）、`lw_chapter_versions`、`lw_chapter_prewrites`、`lw_chapter_state_summaries`、`lw_outline_characters/items/locations` 残留或令删除/再写炸 FK（实测 3 次失败）；②`chapter-writing` 节点对 SqliteError 无翻译。handler 侧（`:1224`）删后已有 `purge.purgeChapterDerivedData` 钩子（按章号清图谱派生），但救不了 FK。

**修复方案**：
1. **前置级联（事务内）**：`deleteOutline(id, force=false)` → 收集该节点及其后代章节节点（沿 `parent_id` 递归，限本项目）→ 若任一后代章节有非空正文且 `!force`，返回 `{needsConfirm:true, chapters:[名称]}`（不删）；否则事务（`db.dataSource.transaction`）内按序删：`lw_chapter_versions`（按 chapter_id，**仓库需新增 `deleteVersionsByChapterId`**——现仅有按 id/lock/unlock）→ `lw_story_chapters`（仓库已有 `delete(id)`）→ `lw_chapter_prewrites` → `lw_chapter_state_summaries` → `lw_outline_characters/items/locations`（按 outline_id）→ 大纲节点本身；对有正文的已删章节逐个调 `purge.purgeChapterDerivedData(projectId, chapterNo)`（沿用 handler 既有钩子）。
2. **章法人话化**：`runChapterWritingMethod` 开头校验大纲节点存在性（`lwOutlines.getById`，不存在 → `{ok:false, error:'该章节大纲已被删除，请刷新大纲后重试'}`）；整方法 catch `SqliteError` 且 message 含 FOREIGN KEY → 同文案返回。
3. handler `DELETE_OUTLINE` 透传 `force`；**返回契约变更**：`data` 由布尔改为 `{ needsConfirm?, chapters?, result? }`。renderer 共 **4 个调用点**必须同步适配：`story/OutlineStage.vue:672`、`comment/OutlineStage.vue:158` 与 `:266`、`wizard/OutlineDesignStep.vue:287`——`needsConfirm=true` 时弹确认（列出将删除的章节数/字数），确认后带 `force=true` 重发。

**改动清单**
- `src/core/packs/longwriting/services/longwriting.service.ts`（deleteOutline 级联 + force）
- `src/core/database/repositories/lw-chapter.repository.ts`（新增 `deleteVersionsByChapterId`）
- `src/core/packs/longwriting/services/chapter-writing-executor.ts`（前置校验 + FK catch）
- `src/core/packs/longwriting/handlers/longwriting.handler.ts`（透传 force/needsConfirm）
- renderer 4 个调用点：`story/OutlineStage.vue`、`comment/OutlineStage.vue`、`wizard/OutlineDesignStep.vue`（needsConfirm 确认弹窗）
- 集成单测 `outline-delete-cascade.spec.ts`

**验证方案**
- 集成单测（内存库）：建卷→章（有正文）→ 删卷：`force=false` 返回 needsConfirm 且各表仍在；`force=true` 后 chapters/versions/prewrites/summaries/outline_characters 全空、大纲节点删除。
- 执行器单测：大纲不存在时 `runChapterWritingMethod` 返回人话错误（不发 LLM 调用）。
- 真机：建临时大纲→制造同场景→观察人话错误；对真实项目删空卷无回归。

---

## C. R9 排除集扩容：地点名册 + 泛称停用词（P1，规模 S）

**根因（源码级）**：`consistency.service.ts` 的 R9 v2 文本扫描 `scanNameCandidates(chapters, known, 3)` 的 `known` 只含人物名册（+§3a 白名单）——地点（白鹿城/金堤城）与泛称（校尉/刺客/老捕快/黑衣人/神秘黑衣人/神秘黑影/黑衣劫匪/押车哑巴）大量误报（18 个去重名中 14 个为噪音，78-89%）。

**修复方案**：
1. `known` 并入**地点名册**：`lw_story_locations.getByProjectId(projectId)` 的 name（地点是圣经实体，天然排除集）。
2. `NAME_SCAN_STOPWORDS` 增补泛称词表（实测来源标注）：校尉、刺客、老捕快、黑衣人、神秘黑衣人、神秘黑影、黑衣劫匪、押车哑巴、路人、侍卫、官兵、掌柜、老者、捕快、差役、更夫、乞丐、和尚、道人、婢女、小厮。
3. 白名单并入已知集（§3a 已完成，不动）。

**改动清单**
- `src/core/platform/services/longwriting/graph/consistency.service.ts`（scanR9 的 known 组装并入地点名册 + STOPWORDS 增补）
- 测试：`scanNameCandidates` 为该模块导出的纯函数，但模块引入了 db 依赖——spec 需携带与 `chapter-writing-executor.spec.ts` 相同的 vi.mock 块（后续可考虑把人名扫描抽到纯 utils，本轮不做）

**验证方案**
- 单测：`scanNameCandidates` 用含「白鹿城」「校尉」「张轻薄」的语料——传入地点 known + 新停用词后，白鹿城/校尉不再候选、张轻薄仍报。
- 真机：天下捕快重扫，R9 待处理从 18 降至 ≤6，且新增章节不回潮。

---

## D. 伏笔回收操作：补齐 promise/payoff 的 payoff 半环（P1，入口1 规模 S / 含看板 M）

**根因（源码级）**：`LwForeshadowRepository.setStatus(id, 'open'|'paid'|'dropped', payoffChapter?)` **已存在但零调用方**——埋设由图谱提取自动进账（154 条），回收无任何入口，台账只增不减（R8 噪音根因）。

**修复方案**：
1. IPC：`longwriting:foreshadow:setStatus(projectId, id, status, payoffChapter?)` → 透传 repo（handler CHANNELS 增条目 + preload）。`payoffChapter` 省略且 status='paid' 时由后端取当前已写最大章号（复用 R8 扫描同款 `outline-order` 文档序口径）。
2. **前置改造（自审发现的关键缺口）**：R8 疑点条目目前**不含伏笔 id**——抽屉按钮无从定位台账行。需：`ConflictItem` 增可选 `foreshadowId?: string`，`scanR8ForeshadowLedger` 两处 push 附 `foreshadowId: f.id`（annotateConflicts 展开透传，扫描 IPC 原样带出）；`useStoryRoom.ConflictView` 增同名可选字段。
3. **入口1（先行）**：疑点抽屉 R8（超期）条目加「已回收」「弃置」按钮——用 `c.foreshadowId` 调 IPC；回收弹章号输入（默认=当前已写最大章号），弃置直接落 `dropped`。
4. **入口2（随批次二 §6）**：RhythmBoard 台账行内同款操作（看板数据源即 `lw_foreshadows`）。

**改动清单**
- `src/core/platform/services/longwriting/graph/consistency.service.ts`（ConflictItem.foreshadowId + R8 扫描附带）
- `src/core/packs/longwriting/handlers/longwriting.handler.ts`（foreshadow:setStatus 通道）、`src/preload/index.ts`
- `src/renderer/src/views/StoryRoom.vue`（R8 条目按钮）、`src/renderer/src/composables/useStoryRoom.ts`（ConflictView.foreshadowId + setForeshadowStatus 方法）
- `src/renderer/src/components/longwriting/story/RhythmBoard.vue`（§6 落地时复用同 IPC）

**验证方案**
- IPC 单测：假 db 断言透传 `setStatus`（status/payoffChapter 原样；省略章号且 status='paid' 时回填已写最大章号）。
- 真机：对天下捕快任一超期伏笔在抽屉点「已回收」（章号=当前）→ 重扫该 R8 消失、台账 `paid`+1；弃置同理。

---

## E. embedding 兜底链修正 + 配置显式化（P2，规模 S-M）

**根因（源码级）**：`lw-vector-index.service.ts` `resolveEmbeddingConfig` 兜底链 `stage='embedding' → stage='chapters'`——chapters 配的是**对话模型**（deepseek），拿它调嵌入接口必败；且失败报错文案在兜底后才出现，误导排障。全局无任何项目配置 embedding，向量索引/记忆全局休眠。

**修复方案**：
1. **删除 chapters 兜底**：`stage='embedding'` 无配置 → 抛专用错误类 `EmbeddingNotConfiguredError extends Error`（带指引文案：`向量索引未配置嵌入模型。请在 项目设置→模型治理 配置「向量化」模型（如 text-embedding-v3），聊天模型不可替代。`）。
2. **调用方降级**：`resolveEmbeddingConfig` 共 4 个内部调用点（`:94/:157/:219/:263`，对应索引构建/检索入口）逐一 `catch (e) { if (e instanceof EmbeddingNotConfiguredError) { logger.warn(...); return 空结果/跳过 } throw e }`——**不阻断写作主链路**（状态摘要/跨章事实表不受影响）。
3. **能力校验**：provider models 元数据含 features 时，校验所选模型非 chat 类（警告日志，不硬阻）。
4. **配置显式化（已核对设置页）**：`ProjectSettingsDialog.vue:422` 的 `storyStages` 数组当前**不含 embedding**——增 `{ key: 'embedding', label: '向量化' }`；该 stage 的模型下拉需按类型过滤只列嵌入类模型（复用/扩展现有 `isTextModel` 的反向逻辑）；`setStageModelConfig` 已支持任意 stage key，无需改。

**改动清单**
- `src/core/platform/services/longwriting/lw-vector-index.service.ts`
- `src/renderer/src/components/longwriting/ProjectSettingsDialog.vue`
- 单测

**验证方案**
- 单测：无 embedding 配置 → 抛指引错误（不再回退 chapters）；有配置 → 原样返回。
- 真机：天下捕快触发索引路径 → 日志「跳过向量索引」且写作正常；配置真实嵌入模型（如百炼 text-embedding）后重跑索引产生行、语义检索可用。

---

## F. wizard_state 多实例写守卫：CAS + 重试（P2，规模 S-M）

**根因（源码级）**：`wizard-state-rmw.ts` `mutateWizardState` = 进程内 per-project 队列 + `getById`/`update` 裸读改写——**无事务、无乐观锁**。跨进程（多 App 实例/并行会话）交错会丢更新；评估期间观察到一次瞬时异常写（未能复现，列为观察项）。

**修复方案**：队列保留（同进程串行，减少 CAS 空转），把「读-写」升级为** Compare-And-Swap + 重试**：
1. 读 `current` → mutator 得 `next`；
2. **CAS 走仓库方法而非裸 SQL**（保留 BaseRepository 的租户 scoping 与 updated_at 维护）：`lw-project.repository.ts` 新增 `compareAndSetWizardState(id, next, expected)`——`update({ id, wizardState: expected } as any, { wizardState: next })`，返回 affected>0；
3. 0 行受影响 = 并发写发生 → 重读重试（退避 50/150/450ms，最多 3 次），仍失败抛「wizard_state 并发冲突，请重试」；
4. 所有写方 API 不变（mutateWizardState/patchRoomState 等自动获益）。SQLite/PG 的 `update ... where` 均支持字段条件，双端同构。

**改动清单**：`src/core/database/repositories/lw-project.repository.ts`（新增 CAS 方法）+ `src/core/platform/services/longwriting/wizard-state-rmw.ts`（重试循环，替换裸 update）。

**验证方案**
- 单测：模拟并发——第一次 update 返回 affected=0（值已被改）→ 重读后第二次成功，断言 mutator 以最新值重放且结果不丢；连续 3 次冲突 → 抛错。
- 压力小测：两个连接同项目并发 mutate ×50 次，最终状态含双方全部增量。

---

## G. 项目创建默认初始化 wizard_state（P2·XS）

**根因（源码级）**：`LongWritingService.createProject`（`:108`）不写 `wizardState` → 新项目 NULL（实例：「天下女捕-小师妹」）。读方均容错，但属隐式契约。

**修复方案**：①`createProject` 落库带 `wizardState: {}`；②一次性数据修复迁移：`UPDATE lw_projects SET wizard_state='{}' WHERE wizard_state IS NULL`（幂等）。**迁移注册**：新迁移文件放 `src/core/database/migrations/`（如 `init-null-wizard-state.ts`），并在迁移注册表登记（`src/electron/database/index.ts:826` 一带的列表式注册，Web 侧 `web-database-manager` 同表注册需一并核对）。

**改动清单**：`longwriting.service.ts`（createProject）、新迁移文件 + 注册。

**验证方案**：单测——createProject 后 `wizard_state='{}'`；真机/库检查 NULL 计数=0。

---

## 合并后的推荐执行序列

| 序 | 内容 | 来源 | 规模 |
|---|---|---|---|
| 1 | C（R9 排除集）+ G（NULL 初始化）——两个 S，立竿见影降噪 | 深评 | 0.5 天 |
| 2 | D 入口1（伏笔回收按钮） | 深评 | 0.5 天 |
| 3 | §5 章法全流程回归测试（保护后续所有改动） | 既有批次二 | 0.5 天 |
| 4 | B（大纲级联 + FK 人话化） | 深评 | 1 天 |
| 5 | §6 节奏看板 + D 入口2（台账操作随看板落地） | 既有批次二 + 深评 | 1 天 |
| 6 | A（快速路径审校 + 能力卡披露） | 深评 | 0.5 天 |
| 7 | §4 大纲插入章节/章号顺移（依赖 §5 回归护栏） | 既有批次二 | 1 天 |
| 8 | 批次三小项：§7 占位文案、§8 选择器、§9 版本来源标记、§11 事实表缓存、E、F | 既有批次三 + 深评 | 1 天 |

提交切分：每序一个独立提交（feat/fix/test/docs 前缀按内容），统一验收门同前（typecheck 零新增 + longwriting 单测全量 + 各项真机验收步骤）。
