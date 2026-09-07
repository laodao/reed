# 评审遗留问题修复计划（2026-08-29）

- **输入**：`docs/review/2026-08-27-commit-review-0817-0827.md` 全部问题总清单中，复核至 HEAD `d25fca29` 仍需处理的 46 条（❌ 34 + ⚠️ 残留缺口 11 + 流程 1）。
- **范围取舍**：#53（prompt 混存，评审定为架构级中期方案）本期不改存储格式，仅留档；#96（巨型提交）属历史无法修复；#8（PC 端文件通道零校验）维持评审认定的信任边界取舍；#39（串行门 13 处存量）作者已声明"匹配 SQLite 单写者"的故意设计，本期不迁移，仅验证 fail-fast 行为有效；#77 的 xlsx CVE 升级依赖 registry 是否可达（npm 上无修复版，修复版只在 sheetjs 官方源），不可达则以导入上限缓解并在文档记录。
- **纪律**：每条修复遵循 TDD（先写/同步补回归测试）、禁写死、修复后跑相关 spec、逐条提交（中文 commit message，标注评审编号）。
- **验收总原则**：每条问题有对应回归测试且通过；不引入新的 ❌（安全边界不回退）；`npm run test:unit:sqlite` 全量绿（PG 测试视环境可用性执行）。

## 一、安全批

### #24 ClickHouse SQL/参数移出 URL
- **修复**：`clickhouse-driver.ts` 的 `buildUrl` 不再把 `query` 与 `param_p{n}` 放进 URL query string；改为 POST body（`application/x-www-form-urlencoded`）：`query` 字段带 SQL，参数值以 `param_pN` form 字段传输（ClickHouse 官方支持的参数化查询方式）。
- **验证**：单测 mock fetch，断言请求 URL 无 query 参数、body 含 query 与参数键值、响应解析不变。
- **验收**：clickhouse-driver spec 全绿；grep 确认 driver 内不再有 `searchParams.set('query'` / `param_` 拼接 URL。

### #100 出向响应体大小上限
- **修复**：http-fetch 增加 `MAX_RESPONSE_BYTES`（默认 50MB，与资产下载上限对齐）：优先检查 `content-length` 头，超限即抛错；无 content-length 时流式读取累计字节超限抛错。`executeHttpFetch` 收口，news-nodes 两处 `res.text()` 同步接入。
- **验证**：单测：超 content-length 拒绝；流式累计超限拒绝；正常响应不受影响。
- **验收**：http-fetch/crawl-news 相关 spec 全绿；`res.text()`/`arrayBuffer()` 在工作流抓取路径无裸调用。

### #16 email passEnc 不回传渲染端
- **修复**：`email-account.repository.ts` 的 `toDto` 删除 `passEnc` 字段（含注释同步）；`email.handler.ts` 的 save-account/update 返回值改走已剥离路径；需要密文的内部路径（IMAP/SMTP 连接）改用 repo 原始实体方法（如 `getRawById`）。
- **验证**：单测断言 toDto/save 响应不含 passEnc；EmailService 连接路径仍能取到密文。
- **验收**：email 相关 spec 全绿；渲染端类型定义（shared types）无 passEnc。

### #75 updateQaPair 原子性
- **修复**：对齐 `addQaPair` 的回滚范式：嵌入失败时恢复原文本行并重建旧向量不可行（旧向量已删），改为**先嵌入新文本、成功后再删旧向量+更新文本**（顺序调整消除中间态）；若更新文本失败则删除刚生成的新向量并抛错。
- **验证**：单测模拟 embedQaPair 抛错：断言 QA 行文本保持原值、旧向量仍在、无孤儿。
- **验收**：kb-qa-pairs spec 新增失败回滚用例通过。

### #77 xlsx 导入上限
- **修复**：`importQaPairs` 增加文件大小上限（10MB）与行数上限（10000），超限抛出带明确文案的错误；`package.json` 若 registry 可达则升级 xlsx 至 sheetjs 修复版，否则保留 0.18.5 并在进度文档记录 CVE 与升级路径。
- **验证**：单测构造超限文件（mock buffer 大小/行数）断言拒绝；正常小文件导入不受影响。
- **验收**：KB 导入相关 spec 全绿；依赖决策有记录。

## 二、引擎批

### #37 定义删除刷新事件索引（半成品修复）
- **修复**：`workflow-trigger-scheduler.service.ts` 的 `recomputeOne` 对已删除定义不再早退，而是先 `refreshEventIndex()`/直接从事件索引移除该定义；或 `workflow-definition.service.delete` 在 affected>0 后调用调度器的 `removeDefinition(id)`。
- **验证**：单测：注册事件触发器 → 删除定义 → 断言事件索引中无该定义（delete 路径，非 update）。
- **验收**：workflow-definition-triggers spec 新增 delete 用例通过。

### #33 resumeRun 补定义级设置与死线
- **修复**：`workflow-run.service.resumeRun` 按 startRun 同款逻辑：`effectiveSettings(def.settings)` 传入 launch、create 运行行时计算并写入 `timeoutAt`。
- **验证**：单测：resume 后运行行含 settings 与 timeoutAt；超时看门狗对续跑运行生效。
- **验收**：run-service spec 新增断言通过。

### #34 cancelRun 原子条件更新
- **修复**：repo 增加 `cancelIfActive(id, patch)`：`update({ id, status: In(非终态) }, patch)` 返回 affected；service 据此判断——affected=0 时重新读取状态并给出明确错误（"运行已结束，无法取消"），消除读-改竞态。
- **验证**：单测：取消运行中→成功；取消已完成→报错不覆盖终态。
- **验收**：run-service spec 全绿。

### #35 重启后未到期审核超时可恢复
- **修复**：`recoverOnBoot` 对未到期 keptWaiting 运行（有 timeoutAt）调用引擎新增的 `armReviewTimeout(runId, timeoutAt)` 注册内存定时器（复用既有超时处理逻辑）。
- **验证**：单测：boot 后模拟到期，断言运行转为 timeout/fail 而非永久挂起。
- **验收**：新增 spec 通过；互斥槽不再被永久占用。

### #32 续跑 + parallel-merge 输出为空
- **修复**：`hydrateCheckpoints` 重放已完成边对 merge 节点的贡献：遍历已完成 edge，若 target 为 parallel-merge，按 `activateEdge` 同款语义补 `scope.mergeArrivals`。
- **验证**：单测：含 parallel-merge 工作流，检查点后续跑，merge 输出非空且顺序一致。
- **验收**：engine spec 新增用例通过。

### #31+#40 同定义互斥原子性
- **修复**：双管齐下——(1) 迁移建 `workflow_runs` 部分唯一索引（`definition_id` WHERE `status IN ('pending','running','waiting_review')`，SQLite/PG 双方言，需先确认 resume 不与旧行并存）；若 resume 语义冲突则改为 (2) create 后二次复核：插入成功后重查互斥持有者，发现他人持有则立即自我取消并报 skipped（补偿式收口，窗口从"无限"缩为"单次回查"）。按代码实际语义择优。
- **验证**：单测模拟并发插入（索引方案：同定义第二个 active 行被 DB 拒绝；补偿方案：后插入者自我取消）。
- **验收**：并发互斥 spec 通过；cron+手动并发不再双跑。

### #36 cron 时区
- **修复**：触发器与工作流 settings 增加 `timezone` 可选字段（校验合法 IANA 名称，默认空=维持进程本地时区，向后兼容）；`computeNext` 传入 `cron-parser` 的 `timeZone` 选项；编辑器触发器配置补时区输入（下拉常用时区）。
- **验证**：单测：同一表达式在 UTC 服务器以 `Asia/Shanghai` 计算的下一次触发时间与本地时区结果差异符合预期。
- **验收**：trigger scheduler spec 通过；不配 timezone 时行为与现状完全一致。

### #25 数据源连接池复用
- **修复**：`datasource/drivers` 增加模块级池缓存：键 = 数据源 id + 配置内容 hash，命中复用，配置变更/删除数据源时关闭旧池；池空闲超时（如 5 分钟）自动回收，避免泄漏。
- **验证**：单测：同配置两次 execute 只 createPool 一次；改配置后旧池关闭、新池创建。
- **验收**：datasource 相关 spec 全绿。

## 三、多租户/应用批

### #72 渠道关闭后 startRun 校验
- **修复**：`app-session.service.startRun` 补 `channelSession` 渠道开关校验（对齐 createSession），渠道关闭时报明确错误。
- **验证**：单测：渠道关闭的已建会话 startRun → 拒绝；开启 → 放行。
- **验收**：app-session spec 新增用例通过。

### #70+#71 内置工作流越权编辑
- **修复**：core 服务层平台门禁（对齐 `requireDesktopCli` 范式）：`updateTriggers` 与 `update`（内容编辑）对 `is_builtin=1` 的定义在 Web 端拒绝（明确错误文案提示"内置模板不可修改，请复制为自定义"）；桌面端单用户维持可编辑（现状能力不回退）。
- **验证**：单测：Web 平台 mock 下内置行 update/updateTriggers 抛错；桌面端放行；非内置行两端正常。
- **验收**：workflow-definition spec 全绿。

### #42 对话式 sendMessage 并发控制
- **修复**：`agent-workflow.service.ts` 增加按 projectId 的互斥（Map<projectId, Promise> 链或占用标记）：同项目上一轮未结束时第二轮直接拒绝并提示，不再覆盖 eventId。
- **验证**：单测：并发两次 sendMessage，第二次被拒/排队且 eventId 不被覆盖。
- **验收**：agent-workflow spec 通过。

### #43 决策/动作生成可打断
- **修复**：`agentDecide`（决策）与各动作生成调用登记 AbortController（复用总结阶段的注册机制），`cancel` 统一可取消全链路。
- **验证**：单测：发起 sendMessage 后立即 cancel，决策调用被 abort（mock callAI 断言 abort 信号）。
- **验收**：打断后无悬挂 AI 调用；既有打断测试不回归。

### #69 pinned 历史污染清理
- **修复**：迁移新增 `UPDATE apps SET pinned = 0`（双方言、幂等）；toDto 的全局 pinned fallback 保留（新用户无偏好行时显示合理默认）。
- **验证**：迁移测试：插入 polluted pinned=1 行 → 迁移后为 0；幂等重跑不报错。
- **验收**：migrations spec 通过。

### #74 分享令牌明文残留清理
- **修复**：迁移将 `share_token` 明文列清空（hash 列已存在的行）；`findByShareToken` 删除 `OR share_token = :token` 明文兼容查找。过期/轮换机制属产品功能，本期不做（留档）。
- **验证**：迁移测试：明文+hash 并存行迁移后明文为空、hash 查找仍命中；旧明文链接（无 hash 行）失效属预期，测试覆盖。
- **验收**：workflow/app 两处一致；share 相关 spec 全绿。

### #78 kb-folder 死代码与测试
- **修复**：删除无人调用的 `countKnowledgeBases`（跨租户死代码）；补 kb-folder repository 单测（目录 CRUD + user 隔离，对齐 ab6f1c81 承诺的 13 项）。
- **验证**：新增 spec 全绿；grep 无残留引用。
- **验收**：测试存在且通过。

## 四、长文批

### #58 plot/outline 名称解析
- **修复**：`GraphService.resolveEntities`/`listByType` 补 plot/outline 两类（从对应表按 projectId 列出参与名称匹配）；同名取第一个时记录 warn 日志。
- **验证**：单测：按名称解析 plot/outline 成功；同名实体解析不抛错且有告警。
- **验收**：agent-actions 相关 spec 通过。

### #62 nameOf 悬空边 UUID 不进 prompt
- **修复**：构建边描述时跳过 node 缺失的悬空边（或以"（已删除实体）"占位并过滤空边）；不再把裸 UUID 注入 AI 上下文。
- **验证**：单测：含悬空边的图谱生成的 edgeLines 不含 UUID。
- **验收**：相关 spec 通过。

### #63 Agent delete_entity 级联补齐
- **修复**：`agent-actions.ts` 删除分支对 faction/skill 调用与 handler 相同的图谱边清理。
- **验证**：单测：Agent 删 faction/skill 后图谱无边残留。
- **验收**：agent-actions spec 通过。

### #66 lw-design-message 多租户
- **修复**：`add()` 的 `MAX(sort_order)` 查询补 user_id 条件（走 scoped 仓库）。
- **验证**：单测：不同 user 同 conversation_id 互不串号。
- **验收**：repository spec 通过。

### #61 图谱流水线保存幂等（减少 AI 调用）
- **修复**：`chapter-graph.processor` 增加内容 hash 缓存（项目+章节+内容 hash → 上次成功运行）：内容未变时保存不再触发 3 次 AI；内容变更才重跑。3 次调用合并属提示词工程改造，风险大，本期不做（留档）。
- **验证**：单测：同内容二次保存 0 次 AI 调用；内容变化后重跑。
- **验收**：processor spec（修掉 mock 吞逻辑问题）通过。

### #64 图谱迁移 user_id 与重复行
- **修复**：`create-lw-graph-tables.ts`：源查询去重（GROUP BY/DISTINCT 消除内部重复行防主键冲突）；user_id 按迁移语义写入（源表含 user_id 则逐行带出；否则写入可被 scoped 查询命中的约定值——以实际 schema 为准，若确实无主则改为查询侧放行 NULL 行并在代码注明）。
- **验证**：迁移测试：含重复源行与 user_id 场景的库上迁移成功且数据可见。
- **验收**：迁移 spec 通过（PG+SQLite 至少 SQLite 实跑）。

## 五、EP 批

### #92 FaceGeometry URL 归一化收口
- **修复**：`FaceGeometryStudio.vue:220`（onAiKeep）与 `FaceCompareDialog.vue:63-66` 手写 `local-image://` 拼接改走 `toImageUrl`。
- **验证**：组件/纯函数测试：Electron 与 Web 两种路径输入产出正确 URL。
- **验收**：grep 两文件无手写拼接；相关 spec 通过。

### #56 批量派生失败可见
- **修复**：`AssetGallery.vue` onBatchDerive 聚合结果：全失败→error 提示（带首个失败原因）；部分失败→warning"成功 X 张，失败 Y 张"；聚合逻辑抽为纯函数便于测试。
- **验证**：纯函数单测 + 组件挂载测试（mock API）。
- **验收**：不再出现"已生成 0 张图"成功提示的场景。

### #57 upload-ref 孤儿文件清理
- **修复**：boot/定期清扫：扫描 ref 文件目录，删除"早于阈值（24h）且不被任何资产 storagePath/sourceRef 引用"的孤儿文件；文件名已带归属信息可定位。
- **验证**：单测：孤儿删除、在引用保留、新文件（<阈值）保留。
- **验收**：清扫 spec 通过；无误删。

### #48 @引用协议 id 化（向后兼容增量）
- **修复**：token 序列化格式扩展为 `@[名字@索引@实体id]`（第三段可选）：ShotPromptEditor 序列化时写入 data-entity-id；`parse-asset-refs` 解析时优先按 id 匹配、失败回退名字（旧格式数据完全兼容）；编辑器渲染 token 不再因改名悬空。
- **验证**：parser 单测：新格式按 id 命中（名字已改）；旧格式按名字命中；编辑器序列化含 id。
- **验收**：parse-asset-refs 与编辑器相关 spec 通过；旧数据不回归。

## 六、工程批

### #91 解除 TS6305 阻断 + missing_variant
- **修复**：`tsconfig.json` 移除对 `tsconfig.node.json` 的 `references`（或改非 composite），使 `vue-tsc --noEmit` 可全量检查；修复 `FaceGeometryStudio.vue:246` 的 `missing_variant` 类型错误（DetectFailure 联合类型补该成员或修正赋值）。
- **验证**：`vue-tsc --noEmit` 退出码 0（或仅剩与本问题无关且已知的历史错误，逐条评估）。
- **验收**：typecheck 命令可运行且不因 TS6305 提前终止。

### #101 form-collect 服务端校验
- **修复**：引擎 `applyReviewDecision` 对 form-collect 节点按 config 校验提交值：必填字段非空、select 值在 options 内；违规抛错保持挂起。
- **验证**：单测：空必填/非法选项被拒；合法值通过。
- **验收**：engine spec 新增用例通过。

### #102 MarkdownEditor 加载失败可见可重试
- **修复**：动态 import 失败时置 error 状态：占位区显示"编辑器加载失败 + 重试按钮"（重试重新触发 import），保留只读降级兜底。
- **验证**：组件测试：mock import 失败显示错误与重试；重试成功后编辑器恢复。
- **验收**：无静默只读场景。

### #82 撤销/重做补洞
- **修复**：WorkflowEditor 接 VueFlow `@nodesChange`/`@edgesChange`（过滤 type=remove 的删除入栈）、`@nodeDragStop`（拖动结束入栈）；`onConfigChanged` 加防抖（如 400ms 合并）后再 pushUndo。
- **验证**：编辑器逻辑抽纯函数/组件测试：删除节点→undo 可恢复；拖动→undo 恢复位置；连续输入合并为一条历史。
- **验收**：撤销可恢复删除/拖动；历史条数不爆炸。

### #89 ShotPromptEditor 测试沉淀
- **修复**：将 `splitEntityRef`/`serializeDesc`/`readLines` 等纯逻辑抽出到可测模块（若内联），补单测覆盖 token 解析/序列化/行处理与边界（空行、多行、非法 token）。
- **验证**：新增 spec 全绿。
- **验收**：组件核心逻辑测试覆盖不再是零。

### #97 CI 与钩子
- **修复**：新增 `.gitea/workflows/ci.yml`（lint + typecheck + `npm run test:unit:sqlite`）；新增仓库根 `lefthook.yml`（pre-commit: lint-staged 式 eslint；commit-msg: 提交信息规范），并安装启用。
- **验证**：本地执行等价命令通过；YAML 语法校验；lefthook 钩子安装后提交触发。
- **验收**：CI 配置存在且本地等价命令绿（远端 Gitea runner 行为留档说明）。

## 执行顺序
安全批 → 引擎批（37→33→34→35→32→31/40→36→25）→ 多租户批 → 数据批 → 长文批 → EP 批 → 工程批 → 全量验证（`npm run test:unit:sqlite` + typecheck）→ 总结报告 + 进度文档。
