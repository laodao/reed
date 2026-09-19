# 知识大脑·开发对抗 Review 登记与修复（2026-09-18）

- 对象：feat/kb-brain 分支 28b085da / c5a7d6f2 / 14ed1a18 三个实现提交（T01-T02 / T03+T06 / T09+T10）
- 方法：主审自查 + 双盲审 subagent 交叉（方案符合性 / 代码正确性），全部发现经行级验证后分级
- 结论：数据层与检索层骨架符合度高；但发现 **P0×1（装配链断裂，流水线整体不可达）**、实现粗心 bug×5、方案承诺未落地×9、有意偏差×6。P0 与全部代码级 P1/P2 **已在本轮修复**，里程碑级遗留（T04/T05/T11/T12/M0 门线）登记在案。

## 一、已修复（本轮 commit）

| # | 级别 | 问题 | 修复 |
|---|---|---|---|
| 1 | **P0** | `installKbBrainDigest` 零调用方——P1 消化流水线整体为死代码，事件无人消费 | knowledge-base pack `activate()` 接线（动态 import + 传入宿主 KBService） |
| 2 | **P0** | 生产 embed 恒 null（install 不组 deps）——向量入池必失败 | install 内缺省组装 embed（绑 `KnowledgeBaseService.getEmbeddingVectors`） |
| 3 | **P1** | **atom 倒排行 chunkId 漏 `atom:` 前缀**（digest-orchestrator:332 用裸 UUID）——击穿 T09 防污染修复：存量 BM25 统计仍被污染、brain 词法把 atom 行当 chunk 解析后全丢 | 加前缀；测试断言同步改为 `atom:<id>` |
| 4 | **P1** | 存量**向量**检索只剔 `qa:` 不剔 `atom:`/`note:`——消化后 topK 名额被 brain 行占据再丢弃，存量结果变少（T09 只修了 BM25 半边） | 存量向量召回同跳三前缀（`qa:` padding=10 可吸收） |
| 5 | **P1** | 裁决三件套缺失：落库无"关旧开新"血缘（superseded 不带 supersededByAtomId）、duplicates 未 incUse、候选集不含 superseded | 全部落地；落库顺序改"先开新后关旧"（崩溃失败方向安全：最多重复不丢失），血缘可查 |
| 6 | **P1** | `autoApproveThreshold` 零消费——低置信论断无门槛直入检索池 | `digestChapter` 落库后低于阈值 → `suspected`（待人审/冲突面），测试覆盖 |
| 7 | **P1** | 裁决 LLM 误接 atomize 档位——`KB_ADJUDICATE_MODEL` 架空、日志错标 | constructor 分离 `adjudicateLlm`；测试注入时同步复用 |
| 8 | **P1** | 僵死 running 台账永不复位（recoverPending 查回后被 `filter(pending)` 丢弃）→ 章节被 ensurePass 永久封死 | recover 对 stale running 执行 `resetToPending`（新仓储方法） |
| 9 | **P1** | `ensurePass` 文档级（chapterId=null）判重漏 documentId——跨文档同 passKey 误判 | chapterId null 时按 `(documentId, passKey)` 判重（对齐 §1.5） |
| 10 | **P1** | ensurePass 并发兜底递归重判——双方都拿到 run，整章重复消化 | 改原子抢占（`UPDATE ... WHERE status='pending'`，抢不到=skip） |
| 11 | **P1** | `failed≥3` 的 skip reason 误标 `done-same-hash` → 上游谎报 digested 且 error 清空 | reason 改 `exhausted`；digestDocument 据此把文档标 failed 留线索 |
| 12 | **P1** | 消化任务的 unhandled rejection 可致进程崩溃（enqueue 返回的 task 无人接；digestDocument 前奏段不在 try 内） | 两个调用点 `.catch(...)` 落日志 |
| 13 | **P1** | `validFrom`/`validUntil` 萃取后丢弃——双时间线 M1 数据面断链 | 传入 KbAtomInput 落库 |
| 14 | **P2** | F1 修正的 quote 定位器：events 映射同一 quote 被消耗两次错位 | from/to 各用独立定位器实例（atom 定位与 event 定位分离） |
| 15 | **P2** | statement 文本对位在重复 statement 时错配；同批重复 statement 双双入库 | 改 `keptIdx↔inserted` 顺序对位（createBatch 保序）；同批 statement 去重 |
| 16 | **P2** | staleUncovered 会误杀 lens 论断；hash 为 null 的 AI 论断永久免疫 stale | 豁免 `lens:` 前缀（视角遍自管生命周期）；hash null 视为失源 → stale |
| 17 | **P2** | knownEntityNames 用 `pendingSummaries(kbId,50)`——摘要完成的实体退出词表，驱动实体碎片化 | 新增 `listActiveNames`（active 全量，稳定排序，cap 200） |
| 18 | **P2** | `stitchContinuation` 重开头时"拼接"（半截+整份必解析失败）；未重复时把续写前导散文拼进 JSON 流 | 重开头→替换；正常→剥前导只拼 JSON 主体（对齐 ai-call 原版语义） |
| 19 | **P2** | ajv `additionalProperties:false` 全量严格——模型多吐一个字段整章致命 | `removeAdditional` 宽容化（剥未知字段再校验；必需键缺失仍响亮失败） |
| 20 | **P2** | brain 检索静默丢 `documentIds`/`threshold`（类型合法组合，结果静默变全库） | BrainSearchRequest 透传并在解析层执行 |
| 21 | **P2** | docLen N+1 无界（截断发生在打分后，高频词大库数千次串行查询） | 先按命中词数粗裁候选（CAP=500）再并行取长度 |
| 22 | **P2** | 同源去重在截断后执行 → 结果可能不足 topK | 先解析（3*topK 上限）→ 去重 → 截断 |
| 23 | **P2** | note 结果 `documentId` 误填 kbId（下游跳转会拿到库 id） | 置空 + 注释判别约定 |
| 24 | **P2** | brainQuerySingleton 闭包捕获首次 db 引用（陈旧风险） | inverted/vectors deps 内每次现取 manager |
| 25 | **P2** | 迁移 `information_schema` 无 schema 过滤（跨 schema 同名列误报） | 加 `AND table_schema = current_schema()` |
| 26 | **P3** | `import nodejieba` 残留（分词抽取后未清） | 已清 |

## 二、登记不改（里程碑级遗留，含决策）

| # | 事项 | 归属 | 说明 |
|---|---|---|---|
| L1 | **T04/T05 M0 门线未执行**（评测集/runner/五项 POC/基线报告） | M0 补做 | 设计 §9.1"无基线不进 M1 批量"被跳过——诚实登记：当前消费产出（视角遍/批量消化）仍应视为未过闸；评测集骨架下轮补，跑基线需真机 LLM |
| L2 | T11 重链（relinkChunk 有方法无调用方，reprocess 后出处跳转不恢复；stale 兜底已做） | M2 | 设计本就把 chunk 区间重链依赖 kbChunks 查询，随 M2 检索上下文一起做 |
| L3 | T12 全缺（13 个 `kb:brain:*` IPC 通道、渲染四组件、brainConfig 写 UI） | M1 剩余 | 下一轮施工主体 |
| L4 | 成本熔断 `KB_BRAIN_DAILY_COST_LIMIT` 未接（costByKb 已备）；costCalls 计数粗糙（分窗/重试按 1 计）、tokens 恒 0 | M2 | 台账结构已支持，接 cron/编排器判断即可 |
| L5 | 实体摘要生成、视角遍、distill/模式卡、PPR、CRAG、FSRS | M2-M4 | 按里程碑 |
| L6 | `intent='synthesize'` 与 detectKeywordIntent 延伸（综合型查询自动加层） | M2/M3 | 与 T13 一起 |
| L7 | web 多租户下 recover 以 LOCAL 用户入队 + ALS null 查询——恢复链路双向失效 | M2（web 端启用前必修） | 修法：恢复扫描按用户分组重放 |
| L8 | 存量 bm25Scores 加 exclude 前缀：严格说违反 D4"一行不改"字面 | 已接受 | 保护性偏差——不加才会真正改变行为（污染）；无 brain 行时逐字节等价 |
| L9 | 进度事件用独立 `kb:brain:progress` 通道，v2 §7.1 说复用 `kb:document-progress` | 已接受 | 两文档冲突，取独立通道（不混用存量消费者）；v2 需登记 D6 |
| L10 | RRF 实为通道内混排而非"类型内归一"；score 回填首次入榜通道原始分（跨 kind 量纲不可比） | M2 评估 | 展示层加 scoreKind 标注或回填 fused |
| L11 | 同源去重直接丢弃 chunk（设计说降级 context 字段）；`contradicted` 未从检索剔除；topK 截断与去重顺序已修但 context 未做 | M2 | 轻量 |
| L12 | P-2 ENTITY prompt 缺失，实体类型硬编码 'concept' | M2（T13 前） | 危及 M3 setting-pattern 的分组上游，登记为依赖 |

## 三、流程纪律

- 两路盲审 + 主审交叉的发现**全部经行级验证**才进修复清单（防止 reviewer 幻觉）；"看似有问题其实没问题"清单 16 条也已归档（如 recoverPending 的 qb 代理租户重挂正确、markChapterStale 空数组守卫正确、chain 吞错机制本身正确）。
- 存量回归：修复后重跑 repositories+KB 存量套件，失败清单与 A/B 基线**完全一致**（9 文件/23 例，lw 关联表/multi-tenant/排序敏感等存量红灯），零新增破坏。
- 大脑测试 60 例全绿（config 11 / atomize+adjudicate 13 / 迁移 5 / 仓储 19 / 编排器 6 / brain-query 6）。


---

# 第二轮：53be0f0b（承诺项落地+T12+T04）的对抗 review（2026-09-19，b96861b6 修复）

自查+盲审交叉。修复 11 项：

| 级别 | 问题 | 修复 |
|---|---|---|
| P1 | **T11 重链坐标系错配**：论断 offset 是章内相对，chunk offset 是文档全局——直接比较多章文档必错挂出处；且重链范围用旧 pass 的 chapterId（reprocess 后章节 id 全新失配），重链从不生效 | 按章节文档全局 startOffset 平移后匹配；范围改为本轮 skipped-same 章 |
| P1 | resetToPending 走 scoped——boot 无 ALS 时按 IS NULL 过滤，跨租户 running 行复位静默 no-op，章节永久封死且文档被误标 failed | 改跨租户裸仓库版（与扫描同款豁免） |
| P1 | listAtoms 忽略 kbId 且缺省 documentId=''——面板论断列表恒空 | 仓储加 findByKb；documentId 可选分流 |
| P2 | context 降级查错 key（atom.id ≠ chunk id），context 恒 undefined | atomId→sourceChunkId 映射 |
| P2 | scoreKind 对 atom/note 恒判 bm25（vecIds 存裸 id，结果 chunkId 带前缀） | 用 entry.id（裸 id）对齐 |
| P2 | doc-status 恒 null：KbDocument DTO/shared 类型没有 brain 三字段，handler 强转读取 | DTO+类型补字段，删强转与死代码 |
| P2 | **web channel-map 缺 13 条 brain 映射**——web 端面板整体不可达（fallback 拼出不存在的 channel） | 补齐 13 条 |
| P2 | updateConfig 浅合并——嵌套 partial 丢 required 字段 → ajv 校验炸；configDraft 缺段 | 按段深合并 |
| P2 | digestChapter 'done' 语义混杂（真跑 vs 跳过）；'running' 瞬态被误标 exhausted→文档 failed | 四态返回（digested/skipped-same/busy/exhausted），busy 不触发 failed |
| P3 | synthesize 降权用名次偏移在 K=60 下仅 ~3% 无效 | 改乘法权重 ×0.5；threshold 作用于 BM25；成本熔断 NaN 告警+calls 语义注明；eval 判据统一；BrainPanel 竞态守卫+错误处理；preload 补 onProgress/onStatus |
| P3 | decideProposal 可复活 archived | 加状态守卫 |

登记不改：run-eval CLI 需在宿主进程 bootstrap（registerCoreDatabaseManager）才能直跑——真机基线随导库一并处理；intent/scoreKind/context 已补集成用例。
