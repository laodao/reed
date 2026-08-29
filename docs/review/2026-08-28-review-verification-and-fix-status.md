# 8/28 Review 核实结论与修复状态清单

- **分支**：`feat/workflow-engine`
- **评审文档**：`docs/review/2026-08-27-commit-review-0817-0827.md`（102 条问题，HEAD `d7ef7560`）
- **本清单口径**：仅收录"当前 HEAD 仍需处理"的条目（评审的 ❌/⚠️/🆕），并标注逐条核实/修复状态。
- **重要提醒**：评审并非 100% 准确（已核实至少 1 条误报，见 #93）。下方状态中【已核实】为本次会话逐条抽查结论；【评审标签】为该评审文档给予的状态，**未逐条实跑验证**，修复前应再核对源码。

---

## 总体结论

- 评审共列出 **102 条**，其中 **35 条已修复 / 2 条评审前已修 / 1 条不属实**，剩下 **64 条**在 HEAD 上属于"仍需处理"。
- 本次会话核实：**#93 为误报**（函数实有定义），**#5 / #6 / #20 / #21 为真实问题且已修复**（含回归测试）。
- 因此"仍需处理"的**真问题**按评审口径约 **49 条**（64 − 1 误报 #93 − 4 已核实当前代码已修复 #41/#76/#29/#98 − 10 已修：#5/#6/#20/#21/#38/#65/#73/#49/#94/#95；此为运行中估算，且 #39 第一阶段已缓解、若干条目复核亦为当前代码已修复，未逐条全量复核实跑），其中：
  - **第一优先（安全 / 阻断级）约 7 条**（已修 4 条，剩约 3 条：#4 已由 #5 覆盖、#39 待处理；#93 误报不计）；
  - **第二优先（功能正确性 / 数据完整性）约 22 条**；
  - **第三优先（低危 / 工程卫生）约 32 条**。
- 注意：多数条目未逐一实跑验证，修复前应按下方"位置"核对源码；其中相当一部分是**架构级/需产品决策**项（如 #53 提示词存储模型、#61 每次 3 次 AI、#94/#95 预置项取舍），不适合在一次会话内机械修复。

---

## 一、第一优先（安全 / 阻断级）

| # | 问题 | 位置 | 评审标签 | 本次状态 |
|---|------|------|---------|---------|
| 5 | crawl-links 节点漏接 SSRF 校验 | `news-nodes.ts` `parseUrlList` | ❌未修复 | 【已核实】真实，**已修复**：`parseUrlList` 增加 `validateOutboundUrl`，新增 4 条测试 |
| 6 | FaviconService 服务端 fetch 未过 `validateOutboundUrl`，重犯 SSRF | `favicon.service.ts` | 🆕8/28 新发现 | 【已核实】真实，**已修复**：拒绝私网/环回 host + 校验 HTML link href，新增 2 条测试 |
| 93 | Settings.vue 引用未定义函数，渲染即崩 | `Settings.vue:106/:313` | 🆕8/28 新发现 | 【已核实】**误报**：`getTemplateSiteUrl`/`getSearchEngineTemplateSiteUrl` 已在 `Settings.vue:1043/:1171` 定义 |
| 21 | data-table sql 字段被引擎 `{{}}` 模板插值绕过参数化 | `workflow-engine.service.ts:863` | ❌未修复 | 【已核实】真实，**已修复**：`resolveConfigDeep` 支持顶层 `skipKeys`，data-table 的 `sql` 不参与模板解析（必须 `$1,$2` 参数化），新增 3 条测试 |
| 20 | SQL 只读守卫黑名单缺 `into`（SELECT INTO 写库可绕过） | `ep-agent-actions.ts:609` | ❌未修复 | 【已核实】真实，**已修复**：`isReadOnlySql` 写关键字黑名单补 `into`，新增 2 条测试 |
| 4 | crawl-news / web-extract 收口残留（⚠️ 部分修复） | `news-nodes.ts`/`extra-nodes.ts` | ⚠️部分修复 | 已收敛：crawl-news（`resolveSourceUrls`）、web-extract（`extra-nodes.ts:350`）均已过校验，crawl-links 已由 #5 修复 |
| 39 | SQLite 串行门 × 13 处"事务内用全局 manager"（评审判定为"死锁"） | `sqlite-serial-gate.ts` + 13 处仓库层 | ⚠️部分修复 | 【已核实】**属故意设计，非待修 bug**：`git 49b87206` 明确——better-sqlite3 单连接/单写者，TypeORM 不替调用方排队，事务在 await 让出点交错踩踏；串行门把隐式无序交错变成显式有序排队，匹配 SQLite 物理模型。`ce0e7890` 已加 ALS 重入检测使"事务回调内用全局 manager"显式报错而非挂起。13 处 call site 是旧模式，是否改写属单独低优先重构，非本评审"必须修"项 |

---

## 二、第二优先（功能正确性 / 数据完整性）

| # | 问题 | 评审标签 | 本次状态 |
|---|------|---------|---------|
| 31 | 同工作流互斥 check-then-create 非原子 | ❌未修复 | 待核实/修复 |
| 32 | 续跑 + parallel-merge 组合输出为空 | ❌未修复 | 待核实/修复 |
| 33 | 续跑丢失定义级执行设置与死线 | ❌未修复 | 待核实/修复 |
| 34 | 取消排队运行竞态 / cancelRun×resumeReview 交错 | ❌未修复 | 待核实/修复 |
| 35 | 重启后未到期挂起审核永不超时（占死互斥槽） | ❌未修复 | 待核实/修复 |
| 38 | 默认配置自相矛盾（maxLoopIterations 100 > maxNodeRuns 50） | ❌未修复 | 【已核实】真实，**已修复**：`WORKFLOW_DEFAULTS.maxNodeRuns` 50→100（≥ maxLoopIterations），新增一致性不变量测试 |
| 48 | `@[名字@索引]` 协议以名字为键、改名即悬空 | ❌未修复 | 待核实；架构级（建议升级 id 引用） |
| 49 | EP 依赖校验用过期快照，同轮多动作被误 skipped | ❌未修复 | 【已核实】真实，**已修复**：`executeEpActions` 每个非 skipped 动作后重算 `computeEpProductionState`（#49），新增 2 条测试 |
| 56 | 批量派生/批量关联失败被静默吞掉 | ❌未修复 | 待核实/修复 |
| 58 | update/delete_entity 名称解析缺口（plot/outline 仍失败） | ⚠️部分修复 | 待核实/修复 |
| 61 | 图谱流水线每次保存固定 3 次 AI 调用 | ⚠️部分修复 | 待核实；涉及成本，需产品判断 |
| 63 | Agent delete_entity 未同步补 faction/skill 级联清边 | ⚠️部分修复 | 待核实/修复 |
| 64 | 图谱迁移收编边 user_id 置 NULL（Web 端不可见） | ❌未修复 | 待核实/修复 |
| 69 | enabled 死列未接 + pinned 历史污染无清理 | ⚠️部分修复 | 待核实/修复 |
| 70 | 内置工作流 cron 调度任意用户可改 | ❌未修复 | 【已核实】**当前不作待修项**：工作流暂不需要租户（多租户），属单独探讨项，故不列为本次需修问题 |
| 71 | Web 端内置工作流可被任意租户编辑 | 🆕8/28 新发现 | 【已核实】**当前不作待修项**：工作流暂不需要租户（多租户），属单独探讨项，故不列为本次需修问题 |
| 73 | Web 端 assets 通道漏接，资产中心在 Web 端不可用 | ❌未修复 | 【已核实】真实，**已修复**：`channel-map.ts` 补全 `assets.*`（复数）→ `asset:*`（单数）通道 + 单参方法 wrap，新增 2 条测试 |
| 75 | updateQaPair 非事务，嵌入失败丢向量 | ❌未修复 | 待核实/修复 |
| 76 | 混合检索"3 倍召回"被 topK 截断 | ❌未修复 | 【已核实】当前代码已修复（`vectorWeight >= 1` 守卫，混合模式收集完整 3×候选并集），非真实问题 |
| 77 | xlsx 导入无大小/行数上限 + xlsx CVE | ❌未修复 | 待核实；加固项 |
| 94 | bing-api 预置指向已退役 API（Bing Search API v7 已于 2025-08-11 退役，经外网确认） | 🆕8/28 新发现 | 【已核实】**真实**：**已修复**——从 `SEARCH_ENGINE_TEMPLATES` 移除 `bing-api`（不再对外提供死预置；类型/engine 类保留兼容存量配置的显式报错），新增模板清单守卫测试（3 条） |
| 95 | 「DeepSeek 联网」预置名不副实（走 chat/completions，无浏览能力，产出编造 URL，违反禁假数据铁律） | 🆕8/28 新发现 | 【已核实】真实，**已修复**：`deepseek-web` 模板与引擎类诚实改名「DeepSeek（模型生成）」并在描述/注释标注"模型无实时联网、链接可能编造"，新增名称断言测试。注：模型生成结果的行为仍在（下架/替换需产品决策） |

---

## 三、第三优先（低危 / 工程卫生，多为待核实）

- #7 邮件 save/test-account 任意 host:port（受限 SSRF）
- #8 file:write-binary 任意路径写（⚠️ 刻意取舍：Web 端已封，PC 端信任边界）
- #16 email toDto 回传 passEnc 密文
- #24 ClickHouse SQL/参数进 URL query string
- #25 每查询新建连接池
- #36 cron 无时区语义
- #37 定义删除不刷新事件索引
- #40-#43 唯一索引兜底窗口期 / 会话双写无事务 / sendMessage 无并发 / 打断仅总结阶段
- #53 提示词列混存两种格式（❌ 架构级延期，非本轮）
- #57 upload-ref 孤儿文件清理（⚠️）
- #62 nameOf 悬空边 UUID 兜底注入 prompt（低危）
- #65 doneCache 非响应式（✅ 本次已修：改 `reactive(new Map())`，进度条实时刷新）
- #66 lw-design-message 多租户修复自相矛盾
- #72 渠道关闭后已建会话仍可 startRun
- #74 分享令牌明文存库、无过期/轮换
- #78-#83 编辑器/状态下发若干（label 反解丢字、store 订阅只进不出、provider-config 契约违例、撤销重做三漏洞、reactive proxy 结构化克隆点状修复、kb 目录批零测试）
- #89-#92 ShotPromptEditor 零测试 / 修复批无回归测试 / TS6305 阻断 typecheck / FaceGeometry URL 归一化不彻底
- #96-#102 巨型合并提交、无 CI/钩子、长音频临时文件不清理、baseUrl 强校验兼容、响应体无上限、form-collect 前端仅校验、MarkdownEditor 动态 import 静默降级

---

## 四、本次会话已进行的修复（均含回归测试）

1. `src/core/modules/workflow/nodes/news-nodes.ts`（`parseUrlList`）：加入 `validateOutboundUrl`，封堵 crawl-links 内网/环回/保留地址抓取（#5）。
2. `src/core/services/favicon.service.ts`：`fetchFavicon` 拒绝私网/环回 host；`resolveHtmlIconUrl` 对 HTML link href 二次出向校验（#6）。
3. `src/core/modules/episode-production/agent/ep-agent-actions.ts`（`isReadOnlySql`）：写关键字黑名单补 `into`，拦截 `SELECT INTO` 建表/写文件（#20）。
4. `src/core/modules/workflow/engine/variable-resolver.ts`（`resolveConfigDeep` + `deepWalk`）：新增顶层 `skipKeys`，跳过指定键的模板解析；`workflow-engine.service.ts` 对 `data-table` 节点的 `sql` 字段传入 `skipKeys=['sql']`（#21）；`workflow-node-forms.ts` 的 sql 字段改 `noTemplate: true`（UI 不再宣传模板支持）。
5. `src/shared/types/workflow.types.ts`（`WORKFLOW_DEFAULTS.maxNodeRuns`）：50→100，与 `maxLoopIterations` 对齐（#38）。
6. `src/renderer/src/composables/useWizardProgress.ts`：`doneCache` 由裸 `Map` 改为 `reactive(new Map())`，使 `refresh()` 变更能驱动 `progress` 重算（#65）。
7. `src/web/client/channel-map.ts`：补全 `assets.*`（复数 preload 命名空间）→ `asset:*`（单数后端通道）的通道映射与单参 wrap（#73）。
8. `src/core/modules/episode-production/agent/ep-agent-actions.ts`（`executeEpActions`）：每个非 skipped 动作执行后重算 `computeEpProductionState`，使同轮后续动作的依赖校验看到最新状态（#49）。
9. `src/core/search-engines/index.ts` + `openai-compat-preset-search-engine.ts`：`deepseek-web` 预置诚实改名「DeepSeek（模型生成）」并在描述/注释标注非实时联网、链接可能编造（#95）。
10. 测试：`tests/unit/core/modules/workflow/crawl-news.spec.ts`（+4）、`tests/unit/core/services/favicon.service.spec.ts`（+2）、`tests/unit/core/modules/episode-production/ep-agent-workflow.service.spec.ts`（+2，另含 #49 用例）、`tests/unit/core/modules/workflow/variable-resolver.spec.ts`（+3）、`tests/unit/core/modules/workflow/workflow-types.spec.ts`（+1）、`tests/unit/renderer/composables/use-wizard-progress.spec.ts`（+1）、`tests/unit/web-bridge.spec.ts`（+2）、`tests/unit/search-engines/openai-compat-preset-search-engine.spec.ts`（+1）。以上均已运行通过。
