# 长文写作功能 · 问题修复方案（2026-09-20）

> 依据：`docs/review` 口径的功能评估 + 真实项目（天下捕快）联调实测。
> 每个问题含：根因（代码级）→ 修复方案 → 改动清单 → 验证方案 → 规模。
> 全部通过后统一验证门：`npm run typecheck` 零新增错误 + longwriting 单测全量绿 + 真机 CDP 手动验收。
> Web 端（P2）不并入本轮，见 §10。

---

## §1【P0】审读类调用模型口径统一

**根因**：`chapter-writing-executor.ts:110` `generateChapterReviewText()` 内 `getAgentLoopHarness().resolveModel({})` —— 空参 = 应用默认提供商（当前环境为本地 vLLM 27B）。正文生成走 `resolveStageModelOpts()`（项目 chapters stage 配置），但三处审读（R10 落点复核、写后一致性审读、故事性检查）全部经由该 helper，导致「正文用强模型、审读用弱模型」且 stage 配置对审读不生效。全仓只有这一处裸 `resolveModel({})`（其余三处均为透传形参的委托，已核对）。

**修复方案**：`generateChapterReviewText` 增加 `projectId` 首参，内部 `resolveStageModelOpts(projectId)` 得到 `{providerConfigId, modelId}` 传入 `resolveModel(stageOpts)`；stage 未配置时回退应用默认（现状行为，注释说明）。三个调用点（`verifyUnlandedBeatsWithAI` / 写后一致性审读 / `runStoryQualityCheck`）本就有 projectId，直接透传。

**改动清单**
- `src/core/packs/longwriting/services/chapter-writing-executor.ts`：`generateChapterReviewText` 签名与实现；3 个调用点。

**验证方案**
- 单测（并入现有 `chapter-writing-executor.spec.ts`）：spec 已 mock `getAgentLoopHarness` 与 `getCoreDatabaseManager`——给 fake db 补 `lwProjectModelConfigs.getByProjectAndStage` 返回 stage 配置，调用已导出的 `runStoryQualityCheck`，断言 mocked `generateText` 收到的 `model` 参数携带 stage 的 `providerConfigId/modelId`；stage 未配置时断言入参为 `{}`。
- 真机：把 chapters stage 配为 deepseek → 写一章 → 主进程日志确认审读请求落在 deepseek（provider 调用日志）。

**规模**：S（约 0.5h）

---

## §2【P0】研讨室「完成宣称」硬校验（防编造）

**根因**：主编回复文本中的「已保存/已完成」与真实工具调用无绑定。实测 deepseek 在零工具调用时编造「正文已保存（2454 字）+ 两段检查结论」。现有约束只有工具描述里的提示词，无系统层校验。

**修复方案**（确定性审计，确定性代码兜底原则与章法一致）：
1. **工具调用记录**：`room-session.ts:316` `harness.registry.buildToolDefs(bindings)` 得到本轮工具清单后，用装饰器包裹每个 tool 的 `execute`，把命中的工具名推进本轮 `turnToolLog`。
2. **写工具判定**：优先按 def 上的 `dangerLevel === 'write'` 判定（`lw_write_chapter_full` 等均为 'write'，未来新增写工具自动纳入），硬编码名单仅作兜底：`lw_write_chapter / lw_patch_chapter / lw_save_* / lw_confirm_chapter_card / lw_update_ledger`。
3. **宣称审计**（新文件 `story-room/turn-audit.ts`，纯函数可单测）：宣称模式 `/(已保存|已完成|已生成|已落库|保存成功|已入库|写完了?)/`；`auditCompletionClaims(content, writeToolsUsed)` → 违规 = 命中宣称模式且本轮无写工具。
4. **处置**（runTurn 终态分流处，`:370` 附近）：违规时 ① 自动纠问一轮：以固定质询文案再 `kit.runTurn` 一次（maxSteps 收紧为 3），质询文案明确允许两种诚实回答——「给出本轮工具回执（run id / 章节 id）」或「声明所引为历史事实、本轮无新增写入」；纠问回复追加进同一条 assistant 消息（metadata 标 `systemAudit: true`）。若纠问后仍宣称本轮新完成，② 回复尾注追加系统警告（复用 `formatStopNote` 风格：「⚠️ 系统校验：本回复宣称完成但本轮无任何写工具调用记录，内容不可信，请人工核实」）；③ `emitRoomEvent(task:progress, status:'error')` + `logger.warn`。每轮最多纠问 1 次，不递归。
   > 误报处理（自审补充）：「第1章已完成保存」类对历史事实的合法引用会命中宣称模式——由纠问轮的「历史事实声明」分支消化，声明后不追加警告尾注，只留 metadata 标记，避免把低成本误报变成噪音。

**改动清单**
- 新增 `src/core/packs/longwriting/story-room/turn-audit.ts`（纯函数）。
- `src/core/packs/longwriting/story-room/room-session.ts`：toolMap 包裹记录、runTurn 后审计与纠问、`RoomMessageView` metadata 透传 `systemAudit`。
- `src/renderer/src/components/longwriting/room/MessageBubble.vue`：`systemAudit` 尾注样式（警示色小字）。

**验证方案**
- 单测（turn-audit.spec.ts）：宣称+无写工具=违规；宣称+有写工具=放行；无宣称=放行；宣称模式边界（「写完」/「已完成」命中，「打算写完」不命中）。
- 真机：向主编发「直接告诉我第2章写好了没，不许调用任何工具」诱导违规 → 观察尾注与自动纠问；再正常跑一章确认不误伤。

**规模**：M（约 3h）

---

## §3【P0】疑点噪音治理（三件套）

### 3a. R9 临时角色白名单
**根因**：R9 扫描（`consistency.service.ts` `scanR9UnregisteredNames` + 文本级 `scanPersonNameCandidates`）以圣经名册为唯一白名单，单元案死者（周员外）、路人（锦衣少年）必然反复误报；现有知情保留按 message 哈希逐条登记，同一名字在新章节再次出现会再报。

**修复方案**：项目级人名白名单，存储复用 `lw_projects.wizard_state.rosterWhitelist: string[]`（与 `conflictResolutions` 同层，零 schema 变更，引擎已有读 wizardState 的先例）。R9 两条扫描路径在「排除名册名及其子串」处同步排除白名单名（含去括号核心）。

**改动清单**
- `src/core/platform/services/longwriting/graph/consistency.service.ts`：两条 R9 路径读取并过滤白名单。
- 新增 IPC（`longwriting.handler.ts`）：`longwriting:roster:whitelist:list/add/remove`（读写 wizardState，走 `mutateWizardState` 串行队列）。
- `src/preload/index.ts`：透传三通道。
- `src/renderer/src/views/StoryRoom.vue` 疑点抽屉：R9 条目按钮组增加「加入白名单」（带备注输入），「已保留」分区增加「白名单」子区（可移除）。

**验证方案**：单测 —— fake db 下扫描含「周员外」的项目，白名单为空时报 R9、加入后不报且真实名册外新人仍报；真机 —— 天下捕快疑点抽屉把「周员外」加白 → 41 处疑点数下降且后续扫描不再出现。

### 3b. 疑点抽屉批量处置
**根因**：`StoryRoom.vue` 疑点抽屉逐条「知情保留」，91 章规模一次十几条只能连点。

**修复方案**：抽屉列表加复选框 + 规则筛选 chips（全部/R1…R10）+「全选当前筛选」；新增批量 IPC `longwriting:conflict:batchAcknowledge(projectId, keys[], note)`（循环 `acknowledgeConflictByKey`，返回逐条结果），前端一次调用；「已保留」分区已有撤销，保持不动。

**改动清单**
- `src/core/packs/longwriting/handlers/longwriting.handler.ts`：批量通道。
- `src/preload/index.ts`、`src/renderer/src/composables/useStoryRoom.ts`（batchAcknowledge 方法）、`StoryRoom.vue` 抽屉模板与逻辑。

**验证方案**：单测批量通道（部分 key 失效时返回逐条结果）；真机筛选 R8 → 全选 → 批量保留 → 数量与「已保留」分区一致。

### 3c. R8「超期未回收」降级为非阻断
**根因**：R8 超期提醒（warning）会进入写前门禁的阻断集合（实测第1章被 3 处 R8 拦截）。91 章跨度上伏笔跨 5+ 章是常态，超期罗列属于节奏提醒而非一致性错误；「回收早于埋设（倒置）」才是真错误。

**修复方案**：实际阻断逻辑在 `conflict-gate.ts:56` `filterBlockingConflicts`：未登记 &&（无章号 或 任一引用章号 ≤ 当前章）即拦——**没有严重度概念**，R8 超期（warning）因此与硬冲突同等阻断。修复（自审修正：采用**豁免白名单式**而非「severity+blocking 才阻」的黑名单式，后者会改变 R1-R7 warning 级的现有阻断行为）：
1. 扫描器为 R8 项打结构化标记 `blocking?: boolean`（倒置=true、超期=false；其余规则不标 = 维持现状）。
2. `filterBlockingConflicts` 增加首行判断：`if ((c as any).blocking === false) return false`——显式非阻断优先，未标记字段完全兼容现状。
3. 超期项继续出现在抽屉/台账（见 §6 看板）供人工管理。

**改动清单**
- `consistency.service.ts`（R8 扫描打标 + `ConflictItem` 类型增可选字段）、`conflict-gate.ts`（`filterBlockingConflicts` 首行豁免 + `ConflictLike` 类型同步）。

**验证方案**
- 单测（conflict-gate 现有测试文件或新增）：R8 超期（blocking=false）不阻断、R8 倒置（blocking=true）阻断、未标记的 R1/R2 warning 行为不变（回归断言）。
- 真机 —— 伏笔超期章节再写下一章不再被 R8 拦，抽屉仍可见。

**规模**：3a=M、3b=M、3c=S

---

## §4【P1】大纲结构操作产品化（插入章节 / 章号顺移）

**根因**：「在第一章前插一章」无产品能力，本次是手工 SQL 完成的（重命名 90 节点、order_index、状态摘要顺移）。章号在库里被 9 处引用，手工操作必然漏改。

**修复方案**：
1. 新服务 `story-room` 同级 `services/outline-structure.service.ts`：
   - `shiftChapterNumbers(projectId, fromNumber, delta)`：按**章号引用注册表**在单事务内顺移（列名已逐一核对）——
     `lw_story_outlines`（章节节点名 `第N章·` 前缀 + order_index 归一化 1..N）、
     `lw_chapter_state_summaries.chapter_number`、`lw_events.chapter_number`、
     `lw_entity_state_snapshots.chapter_number`、`lw_memories.chapter_number`、
     `lw_vector_index.chapter_number`（检索侧 chapterNumberLte 为运行时参数，非列）、
     `lw_foreshadows.planted_chapter / payoff_chapter / develop_chapters(JSON数组) / rolled_to`、
     `lw_graph_edges.valid_from_chapter / valid_until_chapter`、
     `wizardState.conflictResolutions[].key` 的章号段与 `chapterNumber` 字段（R10 拍的章号锚点同步）。
     `lw_predicate_registry` 未见章号列（实施时最后核对一遍）。注册表以 `(表, 列, 类型)` 数组维护，便于后续增表。
   - `insertChapterBefore(projectId, { volumeId, beforeOutlineId, title, summary })`：建大纲节点（node_type=chapter，order_index 置于目标前）→ 计算新章号 → `shiftChapterNumbers(from=新章号, +1)` → 回填本章节点名与 order_index。返回新节点。
2. IPC：`longwriting:outline:insertChapterBefore`、`longwriting:outline:normalizeOrder`（卷内 order 归一化，清历史空洞）。
3. UI：`story/OutlineStage.vue`（大纲阶段列表）行级「⋯」菜单加「在此前插入章节」（弹窗：标题/概要，调插入通道后刷新）；卷头加「重排章号」。

**改动清单**
- 新增 `services/outline-structure.service.ts`、`tests/unit/core/packs/longwriting/services/outline-structure.spec.ts`。
- `handlers/longwriting.handler.ts`、`src/preload/index.ts`。
- `src/renderer/src/components/longwriting/story/OutlineStage.vue`。

**验证方案**
- 集成单测（内存库）：建 3 章假项目并预置伏笔（planted=1）/事件（chapter=1）/状态摘要/图边（valid_from=1）→ 在第 1 章前插入 → 断言：后续两章名称+1、全部注册表章号 +1、order 归一为 1..4、伏笔 planted=2；再跑 `normalizeOrder` 断言空洞清除。
- 真机：先 `cp ~/.config/the_bot/the_bot.db /tmp/txk/db_backup_$(date +%s)`，再对《天下捕快》演练一次插入+撤销（手工还原），确认研讨室/编辑器/连续性横幅数字一致。

**已知局限（自审补充，明示不做完美处理）**：知情保留记录的 key 哈希来自疑点 message 文本，而 R8/R9 的 message 内嵌章号文字（如「第 1 章埋下，已写至第 9 章」）——重编号后重新扫描会生成不同哈希的新 key，旧保留记录失配、对应条目会重新出现。哈希主体去章号化属另一个改造，本轮不做；重编号后对重报条目用 §3b 批量保留/§3a 白名单兜底即可。

**规模**：L（约 1 天，含测试）

---

## §5【P1】章法全流程自动化回归

**根因**：章法五步是核心链路，现有单测只盖纯函数；重构执行器只能真跑（烧 token 且慢）。

**修复方案**：集成测试 `tests/integration/longwriting/chapter-writing-method.spec.ts`，沿 `bible.spec.ts` 的 fake-db + vi.mock 模式：
- mock `longwriting-ai.service`（脚本化 `generateChapterCard`→card/markdown/review ok、`generateChapter`→正文、`checkChapterConflictGate`→null）、mock `./longwriting.service`（saveChapter/applyChapterCard/confirmPrewrite/getChapter 内存假实现并记录调用）、mock `ConsistencyService.scanContradictions`→[]、mock `ChapterGraphProcessor`→{newEntitiesNote:'测试实体'}、`getAgentLoopHarness().resolveModel`→捕获入参的桩。
- 正向用例断言：`ok=true`；调用序列 = design→review→confirm→gate→write→save→post-check→story-check；`storyCheck.ran=true`；`postCheck` 存在；保存被调用且版本号 1。
- 反向用例：已有正文且 overwrite=false → 拒绝文案；设计卡自检 issues 非空 → `needsReview` 返回且不落正文。

**改动清单**：仅新增上述 spec；如 mock 面过大，允许把执行器的 AI/存储依赖收敛为构造注入（重构幅度以不改变行为为界）。

**验证方案**：测试本身即验证；纳入 CI 习惯命令 `node scripts/vitest-electron.cjs run tests/integration/longwriting/`。

**规模**：M（约 3h）

---

## §6【P1】节奏看板（伏笔台账 / 卡点分布 / 感情线进度）

**根因**：R8 只在超期时报警，伏笔 promise/payoff 台账（`lw_foreshadows`）没有可视化；概要里设计好的卡点/感情线标记（「卡点：」「感情线：」文本）没有聚合视图。

**修复方案**：
- 聚合 IPC `longwriting:rhythm:board(projectId)`：①伏笔台账 = `lw_foreshadows` 全量（planted/payoff/status/develop），超期判定复用 R8 阈值常量；②卡点分布 = 解析章节大纲 `summary` 中「卡点：」标记 → `[{chapter, text}]`（中文冒号兼容，纯函数）；③感情线 = 解析「感情线：」标记（标注为启发式提取）。
- 前端新组件 `story/RhythmBoard.vue`：伏笔区间列表（埋设→回收，超期标红，未回收排前）、卡点时间轴、感情线列表；入口放 `StoryEditor.vue` 大纲阶段页签「节奏看板」。

**改动清单**：新 IPC + preload；新组件 + StoryEditor 入口；解析纯函数放 `@shared/utils/rhythm-markers.ts`。

**验证方案**：解析器单测（中英冒号、多条卡点、无标记）；真机看天下捕快（预期 27 处卡点、伏笔若干条）与数据抽查一致。

**规模**：M（约 0.5 天）

---

## §7【P2·小】审批单无关联正文的占位文案

**根因**：`StoryRoom.vue` `openApproval` 中 `getChapter` 无内容时 `approvalContent=''`，模板永远显示「（正文加载中…）」。

**修复方案**：三分支——有正文→正文；`success && data` 但无 content→「该审批单暂无关联正文（正文尚未生成或已移除）」；失败→「正文读取失败，可去写作台查看」。

**改动清单**：仅 `StoryRoom.vue` 一处赋值逻辑。

**验证**：真机点联调测试单（假 outlineId）显示新文案；点第1章真实单显示全文。

**规模**：XS

---

## §8【P2·小】顶栏主编模型选择器尊重 stage 配置

**根因**（已定位）：`StoryRoom.vue loadModels()` 的 `pick('story-room')` 要求 stage 配置值必须命中 `providerConfig.list()` 的 `models` 列表；当配置的模型不在列表（如手填的自定义模型 id）时返回空串，兜底链最终落到 `modelOptions[0]`（本环境=本地 vLLM），且 `applyModelOpts()` 把该错误选择写入 modelOpts——用户消息实际发往 vLLM。

**修复方案**：stage 配置权威。`pick` 命中 stage 配置但不在 options 时，向 `modelOptions` 注入合成项（label=`providerName / modelId`）并选中；**注入前校验该 provider 处于已启用列表**（disabled 不注入，继续走回退链）；仅当三个 stage 均无配置时才回退第一个模型。逻辑抽纯函数 `resolveInitialModelSelection(stageCfgs, options, enabledProviders)`（放 `src/renderer/src/utils/`）便于单测。

**改动清单**：`StoryRoom.vue` loadModels、新纯函数 + 单测。

**验证**：单测覆盖「命中/未命中注入/全空回退」三分支；真机把 story-room stage 配为列表外模型 → 重进研讨室顶栏显示该模型，发送走对应 provider。

**规模**：S

---

## §9【P2·小】正文写路径来源标记（可审计）

**根因**：`lw_chapter_versions.version_type` 恒为 'manual'，无法区分章法产物 / 编辑器手写 / 其他来源，审计与一致性提醒无法定向。

**修复方案**：值域扩展（零 schema 变更，复用现有列）：`'workflow'`（章法，executor 保存路径传入）| `'manual'`（编辑器保存，默认值保持兼容）。`LongWritingService.saveChapter` 增可选 `origin` 参数透传到版本行。

**改动清单**：`services/longwriting.service.ts`（saveChapter 签名）、`chapter-writing-executor.ts`（传 'workflow'）、编辑器保存通道（默认 manual 不动）。

**验证**：章法跑完查 `lw_chapter_versions.version_type='workflow'`；编辑器保存一章为 'manual'；既有单测不破。

**规模**：S

---

## §10【P2】Web 端支持（本轮不并入）

Web 端是独立工程（PG datetime 硬阻断、12 模块隔离收口、多租户安全收口），已有完整执行依据：`docs/plan/2026-09-17-web-support-implementation-plan.md`（v2 复核版）+ 三份审计。本轮不并行开工，避免与上述修复在同一批文件上冲突；建议本批 P0/P1 落地并回归后，按该方案单独立项执行。

---

## §11【P2·小】跨章事实表构建增量化

**根因**（评估遗漏，自审补入）：`services/cross-chapter-facts.ts` `buildCrossChapterFactSheet(projectId, chapterNo)` 每次写后审读都全量重建，构建成本随已写章节数线性增长；91 章 × 3000 字规模下每次写章的审读前开销可观。

**修复方案**：按「截至章号」缓存最近一次构建结果（key=`{projectId}`，value=`{uptoChapter, sheet, builtAt}`，存模块级 LRU 即可，单机单用户）；章节保存/`lw_patch_chapter`/重写后失效对应缓存。命中缓存且 `uptoChapter >= chapterNo-1` 直接返回。

**改动清单**：`services/cross-chapter-facts.ts`（缓存层 + 失效钩子）；`chapter-writing-executor.ts` 与 `room-agent-tools.ts` 的 patch 路径调用失效函数。

**验证方案**：单测 —— 同参数两次构建只执行一次底层查询（计数器断言），保存第 N 章后缓存失效并重建。

**规模**：S

---

## 实施顺序与提交切分

| 批次 | 内容 | 提交 |
|---|---|---|
| 一（P0） | §1 → §2 → §3a/3b/3c | `fix(longwriting): 审读模型口径统一`、`feat(story-room): 完成宣称硬校验`、`feat(longwriting): 疑点噪音治理（白名单/批量/R8降级）` |
| 二（P1） | §4 → §5 → §6 | `feat(longwriting): 大纲插入章节与章号顺移`、`test(longwriting): 章法全流程回归`、`feat(longwriting): 节奏看板` |
| 三（P2 小项） | §7 → §8 → §9 → §11 | `fix(story-room): 审批单占位文案`、`fix(story-room): 主编模型选择器尊重 stage 配置`、`feat(longwriting): 版本来源标记`、`perf(longwriting): 跨章事实表缓存` |

统一验收门（每批次结束跑）：`npm run typecheck`（对照基线零新增错误）→ `node scripts/vitest-electron.cjs run tests/unit/core/packs/longwriting/ tests/integration/longwriting/` 全绿（distiller 既有失败除外）→ 真机 CDP 手动验收（本报告 §7~§9 各自的真机步骤）。
