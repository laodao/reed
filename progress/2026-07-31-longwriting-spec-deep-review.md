# 长文写作优化 Spec/Plan 深度 Review 报告

> 日期：2026-07-31
> 范围：步骤 0/1/2/6 的 spec + plan（共 8 份）+ 总规划
> 方法：事实核查（现有代码）+ 设计审查（接口完整性/验收可量化/跨步骤一致性）
> 目标：确保 spec 能指导开发、验收条件可量化可断言

---

## 一、事实核查结果（spec 引用 vs 现有代码）

逐条核查 spec 中引用的"现有接口/字段"，发现以下不符：

| # | spec 引用 | 实际情况 | 影响 | 修正 |
|---|----------|----------|------|------|
| F1 | HybridSplitter 配置 `CHUNK_SIZE=800/OVERLAP=80` | ❌ HybridSplitter 用 `SplitConfig{strategy,minChunkSize,maxChunkSize,similarityThreshold,structureOnly}`；800/80 是 `fixedSplit` 内部硬编码常量 | 步骤0 indexChapter 切片配置描述错误 | 改为：复用 HybridSplitter + SplitConfig，或直接用 fixedSplit（CHUNK_SIZE=800 内部生效） |
| F2 | `lw-chapter-state-summary.repository` 的 `deleteByChapter` | ❌ 不存在；现有 `deleteByOutlineId` / `deleteByProjectId` / `upsert` | 步骤2 ChapterStateSummaryStep.cleanup 方法名错误 | cleanup 按 outlineId 清理（一章一 outline），复用 `deleteByOutlineId`；若需按 chapterNumber 跨 outline 清理才新增 |
| F3 | LanceDB vectors 表含 userId/dim/model | ❌ LanceDB 表仅 5 列（id/chunkId/knowledgeBaseId/vector/createdAt），userId/dim/model 被 drop；pgvector 表才有 | 步骤0 schema 扩展描述需对齐 LanceDB 实际 | 步骤0 新增 4 列（projectId/entityType/entityId/chapterNumber）到 LanceDB 5 列基础上；复用现有 `recreateTableWithDimension` 重建机制 |
| F4 | ChapterStage.vue 有右侧侧栏可挂载 | ❌ 现有两栏布局（outline-tree-panel + chapters-panel），无右侧侧栏 | 步骤6 挂载 ContextPreviewPanel 需改布局 | 步骤6 改为三栏（大纲树 \| 编辑器 \| 上下文面板）或编辑器内可折叠侧栏；plan 已含"改造布局"任务 |
| F5 | embedding 维度 1024 | ⚠️ 实际由项目 `embeddingConfig` 决定，非固定；pgvector 端写死 8192 | 步骤0 维度描述不准确 | 改为"维度由 embeddingConfig 决定"，LwVectorIndexService 从配置读取，不硬编码 |
| F6 | `getEmbeddingVectors` 签名未明确 | ✅ 实际 `(texts: string[], config: EmbeddingConfig): Promise<number[][]\|null>`，位于 `knowledge-base.service.ts:729` | 步骤0 需明确签名 + EmbeddingConfig 来源 | 补充签名；EmbeddingConfig 从项目配置获取（复用知识库配置或长文独立） |
| F7 | `IVectorStore.searchSimilar` opts | ✅ 现有 `opts?: {distanceMetric?}`；VectorSearchResult 现有 `{chunkId, score}` | 步骤0 扩展 VectorSearchResult 加 metadata 是扩展类型 | 确认为扩展（加 metadata 可选字段），向后兼容 |
| F8 | `ModelDefinition.contextWindow` | ✅ 字段存在 | 步骤1 resolveModelWindow 可行 | 确认，无需改 |
| F9 | extractMemories 签名 | ✅ `(eventId, projectId, outlineId, prewriteContent, chapterNumber, providerConfigId?, modelId?)` | 步骤2 改第4参数为 chapterContent | 确认，签名兼容（参数名语义改） |
| F10 | 现有 e2e `09-longwriting.spec.ts` 覆盖提取功能 | ⚠️ 仅 3 个基础场景（页面加载/getProjects/CSP），未覆盖提取 | 回归测试"通过"标准过弱 | 各步 plan 补充：新增针对该步的 e2e 用例，而非依赖现有薄回归 |

---

## 二、设计完整性问题（接口缺失/歧义）

### 步骤0
- **P0-1** `LwVectorIndexService.search` 的 `preview` 字段（命中片段前200字）取数路径未明确：character 从 lw_characters 取序列化文本？chapter 从 lw_chapters 取对应切片？ -> 需明确每 entityType 的 preview 取数逻辑
- **P0-2** `indexMemory` 序列化策略未定义（memory 文本如何构建） -> 补充
- **P0-3** `rebuildProjectIndex` 的 onProgress 单位未明确（done/total of 实体数？） -> 明确
- **P0-4** `ensureSchema` 持久化标记机制（避免每次启动重跑）未设计 -> 补充 `vectors_schema_version` 标记或 LanceDB 元数据表
- **P0-5** LanceDB 迁移失败回滚的具体步骤（备份表如何回滚）未详 -> 补充：迁移失败保留备份表 + 日志，不自动 drop 备份

### 步骤1
- **P1-1** `BuildContext` 的加载责任未明确（ContextBuilder 加载还是 Provider 自加载？） -> 明确：ContextBuilder 统一加载到 BuildContext，Provider 共享
- **P1-2** `ContextItem.id` 生成规则未定义 -> 明确：`${entityType}:${entityId}` 或 uuid
- **P1-3** `buildFromManifest` 处理 forcedContext 与 manifest.included 冲突的优先级未明确 -> 明确：forcedContext 优先（include 强制 true / exclude 强制 false / edit 替换 content）
- **P1-4** token 估算"中文*1.5"对英文/混合文本不准 -> 明确：统一按 `字符数*1.5`（含中英文），保守估算 + 安全边际兜底
- **P1-5** buildPreview 缓存（同大纲未改时复用）未设计 -> 补充 buildId + 大纲 hash 缓存

### 步骤2
- **P2-1** `completeChapter` 与 `saveChapter` 关系未明确（saveChapter 后自动判断 status？还是 completeChapter 独立？） -> 明确：completeChapter 是独立显式动作；saveChapter 不触发提取
- **P2-2** 提取的 eventId 生成与传递未明确 -> 明确：pipeline 生成 uuid，前端订阅 `longwriting:extraction:<eventId>`
- **P2-3** `PipelineRunReport.failedSteps` 前端用途未明确 -> 明确：前端据 failedSteps 显示重试按钮

### 步骤6
- **P6-1** store state 的 graphData/timelineEvents/currentSnapshot 引用步骤3/4/5 entity 类型（未建） -> 明确：本步用占位类型 `unknown` / `any`，步骤3/4/5 替换为实际类型
- **P6-2** ContextPreviewPanel 的 props/emit 契约不完整 -> 明确：props={outlineId, projectId}，emit={generate(payload), retryStep(stepKey)}
- **P6-3** 生成按钮 emit('generate', payload) 的 payload 结构未定义 -> 明确：`{ outlineId, targetWords, manifest, forcedContext }`

---

## 三、验收条件可量化（重点修正）

原 spec 验收标准多为定性描述（"可用""通过""不截断"），不可断言。重写为可量化版本（每个验收点对应可写测试断言）：

### 步骤0 可量化验收标准

| # | 验收点 | 可量化指标/断言 |
|---|--------|----------------|
| 0.1 | 向后兼容 | knowledge-base 模块现有 `searchSimilar(kbid,vec,topK)` 调用零改动；kb 相关单测/e2e 100% 通过；IVectorStore 接口 diff = 0 删除/0 修改/纯新增方法 |
| 0.2 | 元数据过滤 | 入库 10 角色(P1)+5 章节切片(P1,ch=1..5)；`searchByMetadata(vec,{projectId:'P1',entityType:'character'})` 返回全 entityType='character'，0 条 chapter；`{chapterNumberLte:3}` 返回 ch∈{1,2,3}，0 条 ch>3 |
| 0.3 | LanceDB 迁移 | 迁移前 vectors 列数=5，迁移后=9（+projectId/entityType/entityId/chapterNumber）；迁移前后 `countByKnowledgeBaseId(kbid)` 相等；旧数据 projectId 均 null |
| 0.4 | 入库检索 | indexEntity 角色"林锋"后 `search("林锋",topK=5)` 命中（entityId 匹配，score>0）；indexChapter 第3章后 `search("第3章关键词")` 命中 entityType='chapter'/ch=3 |
| 0.5 | 增量更新 | upsertEntity 同角色连调2次（未变）：`getEmbeddingVectors` 调用1次，contentHash 不变；改名后：调用2次，旧 chunkId 删除/新 chunkId 写入 |
| 0.6 | 隔离 | 知识库数据(projectId=null)+长文数据(P1)共存；`searchByMetadata({projectId:'P1'})` 返回 0 条 knowledgeBaseId 非空 |
| 0.7 | 双端一致 | pgvector 实现通过 0.2/0.4/0.5/0.6 等价测试 |
| 0.8 | 测试覆盖 | 新增单测≥15（repo/service/lance-db）+集成≥5（入库-检索-增量-隔离-迁移），全通过 |

### 步骤1 可量化验收标准

| # | 验收点 | 可量化指标/断言 |
|---|--------|----------------|
| 1.1 | 替代手工拼接 | `longwriting-ai.service.ts:1361-1413` 手工 prompt 删除；systemPrompt/userPrompt 来自 ContextBuilder.build() |
| 1.2 | 向量检索记忆 | 第30章 buildPreview，MemoryProvider items 中 source='vector' 占比≥80%；`getMemoriesBeforeChapter` 调用次数=0 |
| 1.3 | maxTokens 动态 | targetWords=5000 -> maxTokens≥10000；contextWindow=32000 -> reservedForGeneration=10000，availableForContext=21000 |
| 1.4 | 预算压缩 | 100 normal+50 minor 超预算：priority 1-4 items 100% included=true；priority 11(minor) included=false；priority 10(背景) content≤200字 |
| 1.5 | manifest 复用 | 传 manifest 时 `LwVectorIndexService.search` 调用=0；buildFromManifest 耗时 < build 的 20% |
| 1.6 | forcedContext | exclude -> included=false；include -> included=true（低优先级亦然）；edit -> content=editedContent |
| 1.7 | 窗口未知 | ProviderTemplate 无 contextWindow -> resolveModelWindow 返回 16000 |
| 1.8 | 测试覆盖 | 8 Provider 各≥3单测；ContextBuilder≥6单测；集成≥3；回归 09-longwriting.spec.ts 通过 |

### 步骤2 可量化验收标准

| # | 验收点 | 可量化指标/断言 |
|---|--------|----------------|
| 2.1 | 触发时机 | completeChapter 后 4 step 全 success；自动保存（防抖）pipeline.runForChapter 调用=0 |
| 2.2 | 从正文提取 | MemoryStep 调 extractMemories 第4参数=chapterContent；提取的记忆 title/description 在正文中可溯（抽检≥80%相关） |
| 2.3 | 并行隔离 | 4 step 总耗时 ≤ max(单步)*1.5；MemoryStep reject 时其他 3 step success，failedSteps=['memory'] |
| 2.4 | 重写清理 | force=true 重跑：lw_memories(sourceOutlineId=该章) 记录数=新提取数（无重复残留）；lw_vector_indices 该章 chunk 全为新 chunkId |
| 2.5 | 向量联动 | VectorIndexStep 后 ContextBuilder.search 该章内容命中（entityType='chapter'） |
| 2.6 | 单步重跑 | runForChapter({steps:['memory'],force:true}) 仅 memory 执行，其他 step 调用=0 |
| 2.7 | 进度事件 | extraction:progress 事件≥4次（每 step）；extraction:done 事件=1次 |
| 2.8 | 测试覆盖 | 4 step 各≥2单测；pipeline≥6单测；集成≥4；手动按钮等价可用 |

### 步骤6 可量化验收标准

| # | 验收点 | 可量化指标/断言 |
|---|--------|----------------|
| 6.1 | store 建立 | store 含 state/actions/getters；git diff 显示 7 个 Stage 组件仅新增 import+挂载，无 ref 删除（R12 范围限定） |
| 6.2 | 面板渲染 | buildPreview 返回 8 分区 -> 面板渲染 8 section，每 section items 数=manifest.sections[i].items.length |
| 6.3 | forcedContext 交互 | toggle -> forcedContext 含 {itemId,action}；编辑 -> content 替换；重置 -> forcedContext=[] |
| 6.4 | 生成传参 | chapter.generate 参数 manifest.buildId === buildPreview 返回 buildId；forcedContext.length=用户操作数 |
| 6.5 | 完成章节 | completeChapter 后 extractionProgress.totalSteps=4；4 步状态在 badge 可见 |
| 6.6 | 失败重试 | step failed -> badge 显示❌+重试按钮；点击 -> runExtraction({steps:[failedStep],force:true}) |
| 6.7 | 超预算提示 | overBudget 场景进度条红色+提示文案显示 |
| 6.8 | 测试覆盖 | store≥6单测；3组件各≥3单测；集成≥1；E2E≥1（预览-编辑-生成-完成-提取）；回归通过 |

---

## 四、跨步骤一致性问题

| # | 问题 | 修正 |
|---|------|------|
| C1 | ContextManifest 结构在步骤1定义、步骤6消费，字段需完全对齐 | 冻结 ContextManifest 字段（sections/totalTokenEstimate/budgetAllocation/modelContextWindow/reservedForGeneration/availableForContext/buildId），步骤6 按此消费 |
| C2 | LwVectorIndexService 接口在步骤0定义、步骤1/2 调用 | 冻结方法签名（indexEntity/indexChapter/indexMemory/search/upsertEntity/deleteByProject/deleteByChapter/rebuildProjectIndex） |
| C3 | ForcedContextItem 在步骤1定义、步骤6 用 | 冻结 {itemId, action, editedContent} |
| C4 | ExtractionStep 接口在步骤2定义、步骤3/4/5 扩展 | 冻结 {key,name,parallelizable,cleanup,extract} |
| C5 | ContextItem.type 枚举与 ExtractionStep 产物对应 | 明确映射：memory step 产出 'memory' 类型 item，entityState step 产出 'entityState' 等 |
| C6 | 步骤6 store 预留字段与步骤7 可视化消费 | 冻结 graphData/timelineEvents/currentSnapshot 字段名，步骤7 按此填充 |

---

## 五、修正行动项

### 需更新文档
1. **步骤0 spec**：修正 F1(HybridSplitter)/F3(LanceDB列)/F5(维度)/F6(embedding签名)；补充 P0-1~P0-5；验收章节替换为可量化版
2. **步骤1 spec**：补充 P1-1~P1-5；验收章节替换为可量化版
3. **步骤2 spec**：修正 F2(deleteByOutlineId)；补充 P2-1~P2-3；验收章节替换为可量化版
4. **步骤6 spec**：修正 F4(三栏布局)；补充 P6-1~P6-3；验收章节替换为可量化版
5. **各 plan**：验收检查表同步可量化指标；补充 F10（新增 e2e 用例，不依赖薄回归）

### 优先级
- **P0（阻塞开发）**：F1/F2/F3/F4 事实错误（spec 引用不存在的方法/字段，直接误导开发）；验收可量化（用户明确要求）
- **P1（影响开发）**：P0-1~P0-5/P1-1~P1-5/P2-1~P2-3/P6-1~P6-3 接口完整性
- **P2（一致性）**：C1-C6 冻结声明

### 执行方式
本报告作为 review 权威记录。随后逐个更新 4 个 spec 的验收章节（替换为 §三 的可量化版本）+ 修正事实错误 + 补充接口缺失。plan 的验收检查表同步引用 spec 可量化指标。
