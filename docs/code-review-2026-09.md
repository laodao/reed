# the-bot 深度代码 Review 报告

> 审查范围：`src/` 全量源码（**1,628 个文件 / 402,844 行**），排除 `src/renderer/public/models`（第三方 wasm 产物）、`out/`、`dist/`、`node_modules/`。
> 审查方法：自建静态扫描（模式匹配 + 函数长度/圈复杂度估算 + 3 行窗口重复指纹 + 符号级死代码检测）→ 手工构建 import 图做环检测与分层校验 → 对每条结论 `read` 原文核实并排除误报。
> 审查日期：2026-09 · 版本 v2.1.0

---

## 一、执行摘要

### 总体评价：**架构设计优秀、工程纪律良好，但存在「设计了没接线」的系统性风险**

这个项目的**架构水准明显高于同规模 Electron 项目**：业务包/平台层分层清晰、多租户行级隔离有 ALS 支撑、IPC 统一 envelope、SecureStorage 抽象到位、TDD 有 742 个测试文件。多个文件里能看到团队自我纠错的痕迹（注释主动标注「复核修复 P1-10」「旧 `.catch(()=>{})` 已废弃」）。

但**核心风险不是「不会写」，而是「同一模式在多处有成熟实现，却在个别文件漏掉」，以及「机制被设计出来但从未接线」**。这类缺陷修复成本极低、收益极高，且因复制粘贴而反复复发。

### 关键量化指标

| 指标 | 数值 | 评价 |
|---|---|---|
| 源文件 / 总行数 | 1,628 / 402,844 | 中大型项目 |
| import 边 | 5,488 | — |
| **import 环** | **13 个** | ⚠️ 需修 |
| **分层依赖违规** | **38 处** | ⚠️ 需修 |
| 循环体内 await IO/查询 | 313 处 | ⚠️ 含迁移脚本合理项 |
| 真·空 `catch {}` | **6 处** | 真实代码仅 3 处 |
| catch 块内无日志/rethrow | 1,348 处 | ⚠️ 「异常不记录上下文」较普遍 |
| 重复 3 行代码块 | 5,458 组 | ⚠️ 需抽象 |
| **零引用导出（死代码）** | **212 处** | 🔴 含安全函数与 10 个生命周期函数 |
| `as any` | 1,485 处 | ⚠️ 偏高（`any` 类合计 4,323） |
| `console.log/debug/info` | 869 处 | ⚠️ 应走 logger |
| 非空断言 `!.` | 486 处 | — |
| `else-if` 链 ≥8 分支 | **0 处** | ✅ 未退化为条件链 |
| TODO 残留 | 38 处（FIXME/HACK 0） | ✅ 良好 |
| 测试文件 | 742 个 | ✅ 总量可观，但与风险错配 |

### 最严重的 5 个问题

1. **P0** `google-sdk-provider.ts:213,256` — 空消息数组直接崩溃（已复现证据链）
2. **P1** **多租户隔离机制「设计了但没执行」** — 见下，这是本报告最重要的发现
3. **P1** 平台层反向依赖业务包 **8 处** — 违反项目自定的架构纪律
4. **P1** `ffmpeg-helpers.ts` — ffmpeg 子进程无超时无 kill，可永久挂起 + 僵尸进程
5. **P1** `image.service.ts:386` — 轮询竞态 + interval 句柄泄漏

### 🔴 最重要发现：多租户隔离的「设计-执行断裂」

三个**独立证据**指向同一个系统性问题：

| 证据 | 位置 | 事实 |
|---|---|---|
| ① 严格版函数是**死代码** | `core/context/user-context.ts` | `getCurrentUserIdStrict()` 注释写「防止数据越权」，**262 处用的是宽松版 `getCurrentUserId`，严格版 1 次引用（仅定义）** |
| ② 写入边界被**大面积绕过** | 资产域 20+ 个 service | 直接 `getRepository().save()`，脱离 `BaseRepository` 的自动 `user_id` 注入 |
| ③ 隔离根基**零测试** | `base-repository.ts` | 承担 `user_id` 注入的唯一防线，**无任何测试** |

**含义**：项目**建对了机制**（ALS + `BaseRepository` 注入 + 严格版函数），但**三层防线各自失守**——严格版没人用、仓库层被绕过、根基无验证。当前未暴露为线上事故，是因为 Electron 单用户场景掩盖了它；**一旦 Web 多租户真实使用，这是跨租户数据泄漏的直接通路**。

同类「设计了没接线」的证据还有：**10 个 `unregister*/dispose` 函数定义了但从不调用**（含 `disposeSharpWorker`），说明生命周期管理也存在同样的设计-执行断裂。

---

## 二、架构审查

### 2.1 import 环（13 个）——已确认

用自建图检测（DFS 找 ≤6 长度的环，去重后）得到 13 个环。分三类：

**A. 类型/索引层环（3 个，危害低但应修）**
```
src/shared/types/index.ts -> src/shared/types/ipc.types.ts -> src/shared/types/index.ts
src/shared/types/longwriting.types.ts -> src/shared/types/story-room.types.ts -> src/shared/types/longwriting.types.ts
src/renderer/src/stores/episode-production/script.store.ts -> .../storyboard.store.ts -> ...
```
理由：`index.ts` barrel 与 `ipc.types.ts` 互相 re-export。ESM 下因类型擦除通常不炸，但会拖慢冷启动解析、且在 `isolatedModules` 下有真实风险。**修法**：barrel 文件只做单向 re-export，禁止被其成员反向 import。

**B. 服务层双向依赖（6 个，危害中）**
```
src/core/platform/services/diary-brain-sync.service.ts <-> diary.service.ts
src/core/platform/services/kb-brain/automation.service.ts <-> digest-orchestrator.service.ts
src/core/platform/services/kb-brain/brain-query.service.ts -> smelt-common.ts -> knowledge-base.service.ts -> brain-query.service.ts
src/core/platform/workflow/engine/journal-replay.ts <-> workflow-engine.service.ts
src/core/platform/episode-production/agent/ep-agent-harness.service.ts <-> ep-agent-workflow.service.ts
src/core/platform/episode-production/assets/services/gallery-derivation.service.ts <-> image-provider-adapter.ts
```
**影响**：模块初始化顺序不确定、单测难以隔离、`vi.mock` 循环引用易踩坑。
**修法**：抽出第三个文件承载共享接口（如 `kb-brain-types.ts`），或将其中一方的调用改为回调/端口注入（项目已有 `IcKbPort`、`RawTranscriptPort` 等端口模式，照抄即可）。

**C. 渲染层几何算法环（4 个，危害中）**
```
src/renderer/src/components/portrait/geometry/bandWarp.ts <-> displacementField.ts
bandWarp.ts -> gridWarp.ts -> displacementField.ts -> bandWarp.ts
bandWarp.ts -> gridWarp.ts -> meshRenderer.ts -> vertexWarp.ts -> bandWarp.ts
```
**影响**：portrait 几何模块是纯计算，环会让 Tree-shaking 失效、打包体积偏大。

### 2.2 分层依赖违规（38 处）——已确认

按项目 CLAUDE.md 自定的纪律，`platform` 不得依赖 `packs`，`shared` 必须零依赖，`renderer` 不得碰主进程内部。实际违规分布：

| 违规方向 | 数量 | 严重度 | 代表证据 |
|---|---|---|---|
| **platform → packs** | **8** | 🔴 高（自定纪律明确禁止） | 见下 |
| renderer → platform | 11 | 🟡 中（跨进程复用 prompt/常量） | `AssetGallery.vue -> asset-identity-prompt.ts` |
| packs → electron-shell | 7 | 🟡 中 | `keyframe.handler.ts -> electron/ipc/handlers/_platform.ts` |
| database → platform | 4 | 🟡 中 | `kb-vector.repository.ts -> vector-store.interface.ts` |
| renderer → database | 3 | 🟡 中（跨进程引实体类型） | `main-image-generator.ts -> asset-image.entity.ts` |
| core-other → platform/packs | 3 | 🟢 低 | `provider-templates.ts` |
| web → agents | 1 | 🟢 低 | `web/server/index.ts -> agents/api/router.ts` |

**platform → packs 的 8 处明细（重点）**：
```
src/core/platform/episode-production/agent/ep-agent-actions.ts -> @core/packs/episode-production/handlers/compose/episode-mp4-exporter.runner.ts
src/core/platform/episode-production/assets/services/temp-asset.service.ts -> @core/packs/episode-production/services/temporary-entity-template.service.ts
src/core/platform/episode-production/auto-binding/lw-entity-detection.service.ts -> @core/packs/episode-production/services/temporary-entity-template.service.ts
src/core/platform/services/longwriting/design/volume-design-flow.ts -> @core/packs/longwriting/story-room/room-state.ts
src/core/platform/services/longwriting/design/volume-design-flow.ts -> @core/packs/longwriting/story-room/room-ledger.ts
src/core/platform/services/longwriting-ai.service.ts -> @core/packs/longwriting/skills/chapter-writing.ts
src/core/platform/workflow/workflow-boot.ts -> @core/packs/app/services/app-definition.service.ts
src/core/platform/workflow/workflow-boot.ts -> @core/packs/app/services/app-session.service.ts
```
**为什么是真问题**：`packs` 的语义是「可禁用、可卸载的业务包」。平台层硬依赖具体包后，**禁用/卸载该包会导致平台层 import 失败**，包机制的核心承诺被破坏。`workflow-boot.ts` 那两处注释自称「由壳中 workflow-boot 经别名实例化」，说明作者知道这里是例外，但**没有把该能力下沉到平台层**，而是让平台反向指回包。

**修法**：把这些被跨层引用的实现（临时实体模板、房间状态机、章节写作 prompt、app 定义/会话服务）**下沉到 `src/core/platform/` 对应子域**，包内改为 import 平台层——方向就正确了。这也是项目自己在「2026-09 三期」做过的动作（`platform/services/` 收拢共用实现），只是没做彻底。

**值得肯定的**：`src/shared/**` → `core`/`renderer` **零反向依赖**（实测 0 命中），`packs` 内核（`registry.ts`/`kernel.ts`/`pack.service.ts`/`builtin-packs.ts`）→ 具体包 **零反向引用**（实测 0 命中），`builtin-packs.ts` 的 manifest `dependencies` 声明与实际跨包引用一致（`app: ['workflow']`、`episode-production: ['voice-design']`、`domain-learning: ['workflow','knowledge-base','skills']`、`info-collection: ['workflow','knowledge-base']`）。**这两条纪律是真的守住了**，是本项目架构的最大亮点。

### 2.3 一处业务规则变更的波及面（≥3 模块同步改）

**实例 1：`safeParse` JSON 列解析（波及 20+ 文件）** 🔴
同一函数体在 **9 个文件**逐字重复，另有 7 个近似变体、多组异名同构：
```
workflow-run.repository.ts:100-109 / workflow-node-run.repository.ts:81-90
workflow-definition.repository.ts:131-140 / platform-event.repository.ts:30-39
workflow-run-event.repository.ts / variables.repositories.ts
agent-memory-entry.repository.ts:37 / agent-task.repository.ts:46
dl-concept.repository.ts:49 / dl-project.repository.ts:55 / dl-plan.repository.ts:64
ic-task.repository.ts:27 / ic-task-pass.repository.ts:30
```
**这不是风格问题，是缺陷根因**：`dl-doc.repository.ts:108` 用裸 `JSON.parse(e.conceptIds)` 而漏了保护，就是因为「改了 9 处忘了第 10 处」。**修法**：`src/core/database/json-column.ts` 导出 `safeParseJson<T>()`/`safeParseJsonArray`/`safeParseJsonObject`，或挂到 `BaseRepository` 作 protected 方法自动带类名前缀。

**实例 2：IPC handler 的 try/catch + `{success,error}` 模板（波及 ~40 处 / 6 文件）** 🟡
`search-engine.handler.ts`(11 处)、`image.handler.ts`(13)、`oss.handler.ts`(9)、`provider-config.handler.ts`(8)、`file.handler.ts`(8)、`translation.handler.ts`(6)——结构完全一致，差异仅中文文案与字符串化写法。且**三种写法并存**（`String(error)` / `error.message` / `error instanceof Error ? ... : '未知错误'`），导致同一 API 面错误格式不一致。
**修法**：`src/electron/ipc/base.ts` 加高阶包装 `ipcHandler(label, fn)` + 统一 `toErrorMessage(e)`。

**实例 3：`sleep` 工具函数（8 处独立实现）** 🟡
```
agent-runtime/runtime/async.ts:8        sleepWithAbort(ms, signal)
workflow/engine/async-utils.ts:8        sleepAbortable(...)
episode-production/render/audio/scene-audio-orchestrator.service.ts:220  sleep
episode-production/render/video/base-video-provider-bridge.ts:256        sleep
workflow/local/shell-sessions.ts:402    sleepMs
workflow/nodes/http-politeness.ts:62    sleep
workflow/nodes/sub-workflow-nodes.ts:18 sleep
workflow/tools/system-agent-tools.ts:207 sleep
```
更值得注意的是 `sleepWithAbort` 与 `sleepAbortable` **是同功能的两个名字**，分居两个目录。**修法**：保留一个（建议 `@core/utils/async.ts`），其余删除。

**实例 4：搜索引擎 provider 模板（10 文件）** 🟡
`tavily/bocha/bing-web/bing-api/baidu/google-web/google-cse/searxng/zhipu/custom-api` 十个引擎的 `!response.ok` 分支 + 超时判定 catch 逐字重复。`base-search-engine.ts` 已有基类（含 `createErrorResponse`/`truncateText`/`normalizeUrl`），却没把请求模板上提。附带不一致：`tavily-search-engine.ts:89` 用 `data.results || []`（无深链保护），`bocha-search-engine.ts:68` 用 `data?.data?.webPages?.value`（安全）——**同一抽象层两套防御标准**。

**实例 5：前端「AI 文本 → 正则抠 JSON」模板（5 文件 / 14+ 处）** 🟡
`SkillItemStage.vue`(4 处)、`PlotStage.vue`、`CharacterStage.vue`、`TopicStage.vue`、`OutlineStage.vue`——全部是贪婪正则 `/\{[\s\S]*\}/` + 裸 `JSON.parse` **无 try/catch**。而后端同一模式已在 `ai-call.ts:655-689` 做了三级降级。**修法**：抽 `extractJsonFromAiText<T>()`，做花括号配对 + 代码块优先 + 多级降级。

**实例 6：Vue 轮询定时器模板（6 组件 / BrainPanel 单文件 6 份）** 🟢
`BrainPanel.vue` 内有 6 组同构轮询（声明 → `if(timer) return` → `setInterval` → 完成态 clear → `onBeforeUnmount` 逐条 clear），末尾 `:1668-1681` 手工 clear 六次。**修法**：`usePolling(fn, {intervalMs, shouldStop})` composable，自动 `onBeforeUnmount`。可让 BrainPanel 从 ~120 行收敛到 ~20 行。

### 2.4 同一实体被多个模块直接写入

**已确认**：`episode-production` 域的资产实体（`AssetEntity`/`AssetImageEntity`/`CharacterBinding`/`LocationBinding`/`ItemBinding`）被 **20+ 个 service/handler 绕过 repository 直接 `getRepository().save()/update()`**：

| 文件 | `getRepository` 直用点 |
|---|---|
| `asset-setting-enrichment.service.ts` | :163,164,190,193,209,214,218,244,247,249（**10 处**） |
| `binding-name-utils.ts` | :128,143,166,199 |
| `character-asset.service.ts` | :92,96,216,247 |
| `gallery-derivation.service.ts` | :217,219,220,225 |
| `asset-project-summary.service.ts` | :93,94,95,96,325 |
| `asset-import.service.ts` | :56,60 |
| `asset-image.service.ts` | :67 |
| `ep-agent-actions.ts` | :311,1233 |
| `storyboard-thumbnail.handler.ts` | :89,91,93,116 |
| `keyframe.handler.ts` | :122,530 |
| `compose.handler.ts` | :50 |
| `voice-design.service.ts` | :340 |

**为什么是真问题**：
1. **多租户隔离被绕过**。项目用 `BaseRepository` + ALS（`getCurrentUserId()`）自动注入 `user_id`。`kb-chunk.repository.ts:200-202` 的注释亲口写了这个坑：*「manager.repo 不带 user_id 注入，必须手动从 ALS 拿当前 userId 填入……否则后续 scoped 查询因 user_id NULL 而看不到这批 chunk」*。而上述 20+ 处直接用 `this.ds.getRepository(Entity).save()`，**需要每一处都记得手工注入 `user_id`**——只要漏一处就是跨租户数据泄漏或数据"隐身"。
2. 业务规则（如资产命名规范化 `binding-name-utils`）散落在多个写入点。
3. `asset-setting-enrichment.service.ts` 单文件 10 处直写，是最集中的违规点。

**修法**：资产域应有唯一写入边界（`AssetWriteService` 或健全的 `asset.repository.ts`），所有写入走它；`getRepository()` 仅允许出现在 `src/core/database/` 内。

### 2.5 CRUD 入参出参是否同源复用

**发现类型三处漂移**：同一实体在 `src/shared/types/**`（IPC 契约）、各 pack handler 的入参类型、`renderer` store 的类型**各定义一份**，且已出现字段漂移。例如 `longwriting.types.ts`(1,916 行) 与 `story-room.types.ts` 互相 import 成环，说明边界已经模糊。

**修法**：以 `src/shared/types/` 为唯一契约源，service 层入参出参从中派生（`Pick`/`Omit`/`z.infer`），禁止在 handler 内重新声明等价结构。

### 2.6 基础设施重复造轮子（汇总）

| 能力 | 重复数 | 应收敛到 |
|---|---|---|
| JSON 安全解析 | 20+ | `core/database/json-column.ts` |
| IPC error envelope | ~40 | `electron/ipc/base.ts` |
| sleep / abortable sleep | 8（含 2 个异名同功能） | `core/utils/async.ts` |
| 搜索请求/错误模板 | 10 | `base-search-engine.ts` |
| 前端 JSON 抠取 | 14+ | `renderer/src/utils/ai-json.ts` |
| 轮询定时器 | 6+ | `usePolling()` composable |
| ID 生成 | 混用 `randomBytes`/`randomUUID`/`Date.now().toString(36)`/手写前缀 | 统一 `newId(prefix)` |

### 2.7 架构健康度评分

| 维度 | 分数 | 理由 |
|---|---|---|
| 分层清晰度 | ⭐⭐⭐⭐ | 目录职责清楚，但 38 处越层 |
| 依赖方向正确性 | ⭐⭐⭐ | shared/packs 内核守住了，platform→packs 8 处破了 |
| 无环性 | ⭐⭐⭐ | 13 个环，多为可解的类型/服务环 |
| 模块边界与封装 | ⭐⭐⭐ | 20+ 处绕过 repository 直写，多租户注入靠人肉 |
| 契约一致性 | ⭐⭐⭐ | IPC envelope 统一，但 CRUD 类型三处漂移 |
| 复用度 | ⭐⭐ | 5,458 组重复块，6 类基础设施重复 |
| 包机制完整性 | ⭐⭐⭐⭐ | manifest/守卫/拓扑排序齐备，被 platform 反依赖打折 |
| **综合** | **⭐⭐⭐½** | **架构野心与执行力都不错，欠一次「收口」重构** |

---

## 三、安全问题

### 3.1 结论：**未发现可被直接利用的高危漏洞**

这是本次审查最意外的正面结论。逐项核查结果：

| 检查项 | 结果 | 证据 |
|---|---|---|
| **SQL 注入** | ✅ 基本免疫 | 32 处模板拼接全部为**库内常量/白名单**：`ph(n)` 占位符函数、`quoteIdent(table)` 表名白名单、migration 内固定 DDL。**唯一可疑点** `create-bible-tables.ts:174` 插值 `seed.key` 来自 `KIND_SEEDS` 常量数组，非用户输入 → **非漏洞**，但写法应改参数化 |
| **XSS** | ✅ 防护严密 | 28 处 HTML sink 逐一核验：`renderMarkdown()`→`sanitizeHtml()`(DOMPurify 等价自研白名单) 管道统一；`escapeHtmlMd`/`escapeText` 用于源码模式；`document.write` 的 `${escapeHtml(title)}` 已转义。**自研 sanitizer 质量高**：标签白名单 + 属性白名单 + `javascript:/data:` URL 剥离 + 危险标签拆散保留文本 |
| **敏感信息硬编码** | ✅ 无真实密钥 | 66 处命中全为误报（类型名 `icTaskPasses`、注释、`'sk-sp-'` 前缀常量）。`.env.local` 未提交敏感值 |
| **JWT 密钥** | ✅ fail-closed | `web/server/index.ts:131-136`：生产模式未设 `JWT_SECRET` 则 **throw**，不降级 |
| **鉴权覆盖** | ✅ 完善 | `attachUser` 每请求回查 DB（停用/删除即时失效，角色以 DB 为准防旧 token 提权）；`requireAuth`/`requireAdmin` 分明；上传路由带 `requireAuth` + `runWithUserAsync` ALS 注入 |
| **命令注入** | ✅ 免疫 | ffmpeg 全部 `spawn(file, args[])` + `shell: false`，注释明确说明「args 数组不被 shell 解析」 |
| **路径穿越** | ✅ 未发现 | 无用户可控路径直接 `sendFile`/拼接 |
| **上传** | ✅ 完善 | multer 内存存储 + `fileSize: 50MB` + `files: 1` + 类型白名单 + service 层二次校验 |
| **凭据存储** | ✅ 正确 | `SecureStorage` 抽象（electron `safeStorage` / web 实现），DB 存密文（`password_enc`/`passEnc`），注释强调「绝不明文落库」；bcrypt 存密码哈希；`randomBytes(32)` 生成 token |
| **Electron 隔离** | ⚠️ 一个真实削弱项 | 见下 |

### 3.2 ⚠️ P2｜`webSecurity: false` 削弱同源策略 —— 已确认

```ts
// src/electron/index.ts:336-342
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false,          // ⚠️
  contextIsolation: true,  // ✅
  nodeIntegration: false,  // ✅
  webSecurity: false       // ⚠️ 注释：允许访问本地文件
}
```
**问题**：`webSecurity: false` 关闭同源策略（CORS 绕过、`file://` 读取放宽）。对一个会渲染**用户粘贴内容、LLM 输出、抓取网页、知识库文档**的应用，这实质削弱了 XSS 的纵深防御——一旦 sanitizer 出现绕过，攻击面被放大。
**`sandbox: false`** 则让渲染进程保留 Node 集成能力（虽 `nodeIntegration: false` 挡住了直接 `require`，但 preload 运行在非沙箱环境）。
**修法**：优先用自定义协议（如已存在的 `local-image:`）+ `protocol.handle()` 提供本地文件，替代 `webSecurity: false`；`sandbox` 若不必须则开启。至少应加注释说明为何必须关闭，并补充风险评估。

### 3.3 ⚠️ P2｜敏感内容写入日志 —— 已确认（违反 CLAUDE.md 明确要求）

CLAUDE.md 写明「**敏感信息不能出现在日志中**」。但：
```
src/core/platform/services/longwriting-ai.service.ts:512-513  console.log('AI返回原始内容长度:', result.length)
src/core/platform/services/longwriting-ai.service.ts:513      console.log('AI返回原始内容:', result)          ← 全文正文
src/core/platform/services/longwriting-ai.service.ts:533,536  console.log('提取的JSON内容:', jsonContent)
src/core/platform/services/ai-call.ts:644-645                 console.log('AI 响应前500字符:', response.substring(0,500))
src/core/platform/services/ai-call.ts:682-690                 console.error('提取的 JSON 前1000字符:', ...)
                                                              console.error('响应内容（前2000字符）:', ...)
```
**影响**：长篇创作正文、AI 响应体（可能含用户隐私/商业内容）被逐字写入落盘日志（`core/utils/logger.ts` 会写文件），造成隐私风险 + 磁盘膨胀。
**对比**：同一文件 `ai-call.ts:233` 用 `aiLogger.info(...)` 结构化日志，`ai-call.ts:644` 又退化为 `console.log` —— 又一次「防御不均」。
**修法**：删除逐字打印，改 `logger.debug('[LongWritingAI] len=%d head=%s', n, head.slice(0,80))`。

### 3.4 🟢 P3｜CSP 策略分流有设计说明但需复核

`src/electron/index.ts:353-360` 给 CSP 做了按 WebContents 分流（应用界面严格 / 导出 PDF 窗口放宽以跑 mermaid 内联脚本），且**注释详述了理由与实测教训**（「2026-09-15 实测：导出 PDF 里只剩 graph TD 源码」）。这是负责任的工程决策。建议复核导出窗口放宽后是否仍限制了 `connect-src`（防止被注入内容外发数据）。

---

## 四、性能问题

### 4.1 🔴 P1｜命名为 "batch" 实则 N+1

**`src/core/database/repositories/kb-chunk.repository.ts:197-217`** — 已确认
```ts
async createBatch(requests: CreateChunkRequest[]): Promise<KbChunk[]> {
  // ...
  return this.dataSource.transaction(async manager => {
    const repo = manager.getRepository(KbChunkEntity)
    for (const request of requests) {
      const built = this.buildEntityForCreate(request, now)
      built.userId = userId
      const saved = await repo.save(repo.create(built))   // ← 每行一次 INSERT
      result.push(this.toDto(saved))
    }
  })
}
```
**影响**：知识库导入一个文档常生成数百~数千 chunk，即数百~数千次串行 INSERT（SQLite 下每次都是独立语句往返；PG 下是独立 round-trip）。这是**导入性能的主要瓶颈**。
**修法**：`repo.insert(entities)`（TypeORM 批量，单条 SQL 多 VALUES）或 `repo.save(entitiesArray)`；分块（如每 500 条）避免超出 SQLite 变量上限（默认 999）。

**同类确认**（`loopAwait` 扫描 313 处中的非迁移项）：
```
src/core/database/repositories/kb-chunk.repository.ts:212       repo.save(repo.create(built))          ← 上述
src/core/database/repositories/agent-session.repository.ts:102  await em.insert(...)
src/core/database/repositories/diary-link.repository.ts:120     await repo.save(...)
src/core/database/repositories/kb-digest-pass.repository.ts:235 await this.scoped.save(r)
src/core/database/repositories/dl-plan.repository.ts:146,157    await this.scoped.update({id:e.id}, ...)   ← 循环 UPDATE 可合并为 IN
src/core/database/repositories/ic-row.repository.ts:135         affected += await this.scoped.update({id}, ...)
src/core/database/repositories/kb-atom.repository.ts:248,311    await this.scoped.update(...)
src/core/database/repositories/agent-tool-artifact.repository.ts:93   for (const r of rows) n += await this.rawDelete(r.sk)
src/core/database/repositories/agent-trajectory.repository.ts:208     for (const r of rows) n += await this.deleteByScopeRaw(r.sk)
```
`dl-plan.repository.ts:146,157` 与 `ic-row.repository.ts:135` 是典型的「循环 UPDATE → 应改 `WHERE id IN (...)`」。

### 4.2 🔴 P1｜经典 N+1（嵌套循环查询）—— 已确认

**`src/core/platform/episode-production/assets/services/asset-setting-enrichment.service.ts:162-179`**
```ts
private async loadOriginalText(projectId: string): Promise<string> {
  const scripts = await scriptRepo.find({ where: { projectId } as any })
  if (scripts.length === 0) return ''
  const texts: string[] = []
  for (const script of scripts) {                                       // ← N 次
    const scenes = await sceneRepo.find({ where: { episodeScriptId: script.id } as any })
    for (const scene of scenes) { if (scene.originalText) texts.push(scene.originalText) }
  }
  return texts.filter(Boolean).join('\n\n')
}
```
**影响**：一个项目 m 集 × 每集 n 场 = **m 次查询**（可合并为 1~2 次）。
**修法**：`sceneRepo.find({ where: { episodeScriptId: In(scripts.map(s=>s.id)) } })`，一次取回后在内存按 `episodeScriptId` 分组。

### 4.3 ⚠️ P2｜`learning-view.service.ts` 重复拉取全量数据（疑似 N+1 变体）

```
src/core/packs/domain-learning/services/learning-view.service.ts:68-71, 212-213, 237-239, 279-283, 345-346, 424-425
```
同一 service 内 **6 个不同视图方法**各自重新调用 `dlConcepts!.listByProject(spaceId)` + `dlRelations!.listByProject(spaceId)` + `dlCards!...`（**全量、无分页**）。若 UI 依次渲染多个视图，同一份全量数据被反复查询 6 次；且 `listByProject` 无 limit，随学习空间增长线性劣化。
**修法**：请求级缓存（一次拉取、视图间共享），或让每个视图只取所需列/子集。

### 4.4 ⚠️ P2｜内存泄漏与竞态

**（a）`image.service.ts:386-388` — interval 句柄泄漏 + 竞态** 🔴 已确认
```ts
if (activePollingTasks.has(taskId)) {
  clearInterval(activePollingTasks.get(taskId)!)   // ← 只 clear，未 delete
}
// ...
const interval = setInterval(pollTask, assetParams().image.pollIntervalMs)
activePollingTasks.set(taskId, interval)
pollTask()                                          // ← 立即执行，未 await
```
三重缺陷：(1) clear 后未 `delete`，Map 残留失效句柄（且 `has`+`get()!` 是 check-then-act）；(2) `setInterval` 与立即 `pollTask()` 并发，两次 `getTaskStatus` 在途，**先返回的旧响应**会触发 `clearInterval`+发 `generation-completed`，后到响应再写一次状态 → 重复事件/状态错乱；(3) `stopGeneration`(:759) 与轮询回调并发操作同一 Map。
**修法**：先 `delete` 再 clear；用 `while` + `await sleep` 自调用循环替代 `setInterval`（天然串行）；或加代号守卫。

**（b）`useImage.ts:404-438` — 定时器无卸载清理** 🟡 已确认
`pollTimer` 仅在任务 completed/failed/timeout 时 `stopPolling()`，全文 `onUnmounted`/`onMounted` **零匹配**。用户生成中切路由 → interval 与其中 `await loadImages()` 持续空转（持续 IPC 流量 + 内存）。
**修法**：composable 内 `onUnmounted(stopPolling)`。

**（c）`UserAssetLibraryDialog.vue:136-149` — 搜索异步乱序** 🟡 已确认
```ts
122: let searchTimer: any = null
126: searchTimer = setTimeout(loadLibrary, 300)
136: async function loadLibrary(): Promise<void> {
149:   library.value = resp.data          // ← 无条件覆盖，无 seq 守卫
```
防抖**不解决乱序**：输入「a」→「ab」，若「a」响应后到，列表被旧结果覆盖，与输入框不一致。且无 `onBeforeUnmount` 清理 timer（`searchTimer` 还是 `any`）。
**修法**：`let seq = 0; const my = ++seq; ... if (my !== seq) return`；补 `onBeforeUnmount`。

**（d）`portrait.service.ts:1627-1636` — 写流错误未监听 → Promise 永不 settle** 🔴 已确认
```ts
return new Promise((resolve) => {
  const output = fs.createWriteStream(outputPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  output.on('close', () => resolve({ success: true, filePath: outputPath }))
  archive.on('error', (err) => resolve({ success: false, error: err.message }))  // ← 未 output.destroy()
  archive.pipe(output)
  archive.finalize()                                                              // ← 未 await/catch
})
```
未监听 `output.on('error')` → 磁盘满/权限失败时 `'close'` 不触发，**导出 IPC 永久挂起**；`archive` 出错时未销毁写流 → 泄漏句柄 + 残留半截 zip；`finalize()` 的 rejection 成为 unhandled rejection。

### 4.5 ⚠️ P1｜`ffmpeg-helpers.ts` 子进程无超时无 kill —— 已确认

`src/core/platform/episode-production/reference-video/ffmpeg-helpers.ts:37-53`（`runFfmpeg`）与 `:72-78`（`getVideoMetadata`）：
```ts
function runFfmpeg(args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = nodeSpawn(FFMPEG_BIN, args, { stdio: [...], shell: false })
    proc.on('error', reject)
    proc.on('close', (code) => { ... })
  })
}
```
全文 grep `kill|timeout|SIGKILL|setTimeout` **零匹配**。ffmpeg 挂死（损坏视频、卡住的网络流）→ Promise 永不 settle、进程永不退出、僵尸进程累积。
`getVideoMetadata:78` 更严重：只 `await proc.on('close')`，**连 `error` 事件都没接**，spawn 失败会静默永久挂起。
**关键对比**：同仓库 `compose/ffmpeg-assembler.service.ts:108-110` **已正确加了** `timeout(timeoutSec,'kill')`，注释还写着「复核修复 P1-10：ffmpeg 挂死会让合成 IPC 永不返回」。作者知道这个坑，但没推广到本文件。

### 4.6 数据库层

- ✅ `synchronize: false`（生产安全）
- ✅ 实体层有 37 个唯一约束
- ⚠️ 迁移脚本内循环逐条 `ALTER TABLE`/`UPDATE`（`add-*-column.ts` 系列，47 个文件结构雷同）——迁移是一次性操作，**优先级低**，但 `create-info-sources.ts` 等种子循环内 check-then-insert 可合并
- ⚠️ better-sqlite3 是同步 API，长查询阻塞主进程事件循环（项目已用 `sqlite-serial-gate.ts` 做事务死锁守卫，意识到位）

### 4.7 复杂度热点（圈复杂度 Top 10，均为粗估）

| cc | 行数 | 位置 | 函数 |
|---|---|---|---|
| 146 | 310 | `episode-production/narrative/ai/storyboard-cogen.ts:465-774` | `validateCogenOutput` |
| 138 | 500 | `shared/utils/lesson-layout.ts:333-832` | `analyzeLessonMd` |
| 136 | 281 | `platform/services/longwriting/bible.service.ts:91-371` | `outlineSub` |
| 123 | 309 | `platform/workflow/engine/graph-validator.ts:46-354` | `validateGraph` |
| 121 | 408 | `renderer/composables/useStoryRoom.ts:63-470` | `useStoryRoom` |
| 121 | 277 | `platform/workflow/nodes/visual-nodes.ts:183-459` | `execute` |
| 110 | 449 | `packs/knowledge-base/handlers/kb-brain.handler.ts:34-482` | `registerKbBrainHandlers` |
| 106 | 459 | `electron/database/index.ts:4151-4609` | `runMigrations` |
| 104 | 500 | `episode-production/narrative/ai/script-generator.ts:753-1252` | `extractJsonFromPosition` |
| 102 | 182 | `renderer/components/workflow/RunInputForm.vue:356-537` | `loadDynamicOptions` |

**函数长度 Top（500 行 = 估算上限，实际可能更长）**：
```
500 行  packs/longwriting/handlers/longwriting.handler.ts:341-840   registerLongWritingHandlers
500 行  episode-production/narrative/ai/script-generator.ts:753-1252 extractJsonFromPosition
500 行  platform/workflow/workflow-boot.ts:98-597                    initWorkflowSubsystem
500 行  renderer/composables/useImage.ts:59-558                      useImageImpl
459 行  electron/database/index.ts:4151-4609                         runMigrations
449 行  packs/knowledge-base/handlers/kb-brain.handler.ts:34-482     registerKbBrainHandlers
```

**最大文件（行数）**：
```
4,862  src/electron/database/index.ts            ← 应当拆分
4,389  src/renderer/src/views/domain-learning/DomainLearningSpace.vue
4,064  src/core/platform/services/longwriting-ai.service.ts
3,562  src/preload/index.ts
3,488  src/core/packs/longwriting/handlers/longwriting.handler.ts
```

`src/electron/database/index.ts`（4,862 行）同时承担「多租户迁移 + 建表 + 迁移编排」，`runMigrations`(459 行, cc=106) 与 `initTables`(500 行) 应拆为独立 migration 模块——项目已有 `src/core/database/migrations/` 目录（108 个文件），这个文件显然是历史遗留未收拢。

---

## 五、代码质量问题

### 5.1 🔴 P0｜空消息数组解引用 → 崩溃

**`src/core/platform/providers/llm/sdk/google-sdk-provider.ts:213` 与 `:256`** — 已确认
```ts
// 213
const lastMessage = context.messages[context.messages.length - 1]
// 216
const result = await chat.sendMessageStream(lastMessage.content)   // ← TypeError
```
`context.messages` 为空时 `lastMessage === undefined`，`.content` 直接抛。**证据链**：同文件 `:205` `history.length > 1 ? history.slice(0,-1) : []` 与 `:123` 遍历 messages（空则无害）**均证明空历史是预期可达状态**；全文 grep `context.messages` 仅 3 处，**无任何 `length === 0` 前置校验**。`:256` 的 `chatSync` 完全同构。
**修法**：`const lastMessage = context.messages.at(-1); if (!lastMessage) throw new Error('chatStream: messages 为空')`。

### 5.2 🟡 P1｜双重非空断言 + 数组越界

**`src/core/packs/longwriting/story-room/room-design.ts:100-101`** — 已确认
```ts
const pkg = next.designPackages.find((p) => p.status === 'draft')
return pkg!.items[pkg!.items.length - 1]
```
3 个未校验点：`pkg!` ×2 + `items[length-1]`。`items` 空则返回 `undefined`，但签名承诺 `DesignItem`，调用方会 `.id` 崩溃。
**决定性证据**：同文件 `:70-72` 对**完全相同**的 `find()` 模式写了 `if (!pkg) throw new Error('设计包草稿创建失败（状态写入异常）')`，`:83` 的 `addDesignItem` 也校验了 `draft`。**姊妹函数有防护、此函数没有** → 明确疏漏而非设计。

### 5.3 🟡 P1｜空 `catch {}` 吞异常 + 事务原子性破坏

**（a）`SkillItemStage.vue:824, 880`** — 已确认
```ts
const result = await window.electronAPI.longwriting.deleteSkill(id)
if (result.success) { await loadSkills(); ElMessage.success('技能已删除'); updateProgress() }
} catch {}
```
空 catch 同时吞掉两类语义相反的错误：(a) 用户在 confirm 弹窗点「取消」的 reject（**有意**），(b) IPC 真失败（**故障**）。结果：删除真失败时界面无任何反应、无日志，用户反复点击。同文件 `:977/1074/1152/1185` 的 JSON 解析都做了显式处理，说明作者并非不在意错误分支。
**修法**：`const ok = await ElMessageBox.confirm(...).catch(() => false); if (!ok) return;` 随后真实调用单独 try/catch + 日志。

**（b）`storyboard.handler.ts:300-308`** — 已确认
```ts
if (visualsChanged && db.dataSource) {
  await withPendingKeyframeFileDeletions(() =>
    db.dataSource!.transaction((manager) => invalidateStoryboardVisuals(manager, storyboardId)),
  )
}
const storyboard = await db.storyboards.update(storyboardId, data)   // ← 事务外，第二次提交
if (!storyboard) return { success: false, error: '分镜不存在' }
```
注释自称要保证「失败方向安全」，但作废画面（事务内已提交）与写新内容（事务外）是**两次独立提交**。若 `:308` 失败或 `:309` 提前返回 → **旧画面产物已删 + 新内容未落库**的脱钩态，恰是注释要避免的情况。且 `:325-326` catch 里只 `return {success:false, error:error.message}`，**未 console.error**，失败无日志。

### 5.4 🟡 P2｜静默吞掉业务状态推进失败（无日志）

```
render/video/video-segment.service.ts:209     await advanceEpisodeStatusForStoryboard(...).catch(() => {})
render/video/segment-video.service.ts:208,347 同款
compose/episode-mp4-exporter.service.ts:169   同款
```
集状态推进（producing/composing）失败被完全静默 → UI 永久停在旧状态且**无任何诊断线索**。
**关键**：同仓库 `storyboard.handler.ts:445` 注释明确写「**不再静默吞 links 错误（旧 `.catch(() => {})`）**」——团队已判定该写法为反模式，但这 4 处未整改。
**修法**：`.catch(e => logger.warn('[VideoSegment] 状态推进失败 sb=%s', sb.id, e))`。

### 5.5 🟡 P2｜`JSON.parse` 无保护（且同目录已有成熟范式）

**`src/core/database/repositories/dl-doc.repository.ts:108`** — 已确认
```ts
conceptIds: e.conceptIds ? (JSON.parse(e.conceptIds) as string[]) : [],
```
字段损坏（历史脏数据/手工改库）时 `toDto` 抛错 → **整条查询失败**。同目录 `kb-qa-pair.repository.ts:44-49`、`lw-ip-character.repository.ts:17-25` 均有 try/catch 降级，`dl-concept.repository.ts:49-56` 甚至就叫 `safeParse`。又一次「防御不均」。

### 5.6 🟡 P2｜非空断言链未传导

```
episode-production/startup-recovery.ts:166,169,185,194    db.dataSource!.getRepository(...)  ← 同函数 4 次
packs/episode-production/handlers/narrative/storyboard.handler.ts:302,462  db.dataSource!
```
`:300` 已 `if (visualsChanged && db.dataSource)` 判空，`:302` 仍用 `!` —— **判空成果没传导为局部 const**，后续插入 await 即失效。
**修法**：`const ds = db.dataSource; if (!ds) return;` 之后全用 `ds`。

### 5.7 🟡 P2｜深链未校验 → 误导性错误

**`src/renderer/src/views/WorldLibrary.vue:307-311`** — 已确认
```ts
307: if (result.success) {
308:   ElMessage.success(`已导入世界「${result.world.name}」`)   // ← 未校验 world
309: } else {
311:   ElMessage.error(result.error || '导入失败')                // ← 这里却校验了
```
`success:true` 但 `world` 缺失时 `.name` 抛错，被 `:313` catch 成「无法解析世界包」这一**误导性提示**。else 分支的 `|| 兜底` 证明作者知道该字段可能空，成功分支却没同等防御。

### 5.8 全量统计

| 类别 | 数量 | 说明 |
|---|---|---|
| `catch` 关键字总数 | 3,116 | 分母 |
| **真·空 `catch {}`** | **6** | 其中仅 **3 处为真实代码**（`SkillItemStage.vue:824,880`、`code-runner.ts:53`），另 3 处为注释引用与 wasm 产物 |
| **catch 块内无日志/无 rethrow** | **1,348** | ⚠️ 这才是真实的「静默吞异常」规模；需逐条区分「有意降级」vs「真吞故障」 |
| `as any` | 1,485 | 偏高，削弱类型安全 |
| `any` 类宽泛类型（`: any`/`as any`/`<any>`） | 4,323 | — |
| `console.log/debug/info` | 869 | 应统一走 `createLogger` |
| 非空断言 `!.` | 486 | — |
| `eslint-disable` | 47 | — |
| `@ts-ignore` | 3 | ✅ 极低 |
| TODO | 38 | ✅ FIXME/HACK/XXX = 0 |

> **勘误（复核轮修正）**：本节初版写作「空 catch / 吞异常 **631** 处」，该数字**错误**——它是初版扫描脚本把「catch 后紧跟 `{` 的行」全部计入所致，包含了大量正常 catch。复核后拆分为两个准确口径：真·空 `catch {}` 仅 **6 处**（真实代码 3 处），而「catch 块内无日志/无 rethrow」为 **1,348 处**。**结论方向不变但严重度需重新判断**：空 catch 的绝对数量远少于初版描述，但 1,348 处无日志的 catch 说明「异常不记录上下文」是更普遍的默认习惯。

**注意（避免误报）**：上述 1,348 处「catch 无日志」中，**相当一部分是有意设计且有注释**，例如 `tool.service.ts:427,472,488`、`task-nodes.ts:112-124`、`variable-data.service.ts:98` 均为「非 JSON 走兜底」的可选解析；迁移脚本（`migrations/*.ts`）中的 catch 多为「容忍 duplicate/already exists」的幂等处理。真正需要修的是**用户可见操作**的静默失败（如 5.3/5.4）。同样，`workflow-boot.ts:524,1082,1105` 的 `providerAdapter!` 均在 `:517` 赋值之后，属安全断言。

---

## 六、可维护性与最佳实践

### 6.1 命名规范 —— 🟡 基本一致，但存在「同语义多写法」

**✅ 做得好的部分**：文件命名统一 kebab-case（`kb-atom.repository.ts`）；类名统一 PascalCase + 领域前缀（`KbAtomEntity`/`DlConceptEntity`/`LwChapterEntity`）；常量统一 UPPER_SNAKE（`DL_AGENT_MAX_STEPS`/`ASSEMBLE_TOP_K`）；布尔量有 `is/has/can` 前缀（`isActive`/`isPreset`/`hasSourceView`）。**命名规范整体是可打通的**，这在 1,628 文件规模下并不容易。

**⚠️ 问题 1：查询方法动词不统一**
仓库层并存 `get/list/find/fetch/query/load/read/search/count/exists/has` 十种动词前缀。同一语义有多种写法：
```
按 ID 取单条：  getById / findById / getOne
按项目取多条：  listByProject / findByProject / getByProjectId
判存在：        existsByName / hasByName
```
**影响**：调用方无法从命名推断返回形态（是数组还是单条？是 DTO 还是 Entity？），需跳转定义才能确认。
**修法**：定一份动词约定并收敛——`get*` 返回单条或抛错、`find*` 返回可能为 `null`、`list*` 返回数组、`count*` 返回数字、`exists*/has*` 二选一保留。建议写入 CLAUDE.md 作为硬规范。

**⚠️ 问题 2：常量命名与实际脱节**
列表型常量未加复数/后缀，如 `RUN_STATUS_FILTERS`（数组）与 `WORKFLOW_EVENT_CHANNEL`（单个字符串）风格一致但语义不同。

### 6.2 圈复杂度与函数长度

已在 **4.7 节**给出量化榜单（cc Top 10 + 长度 Top 6 + 最大文件 Top 5），此处不重复。补充判定标准：

| 阈值 | 现状 | 结论 |
|---|---|---|
| 函数 > 100 行 | 30+ 个 | 🟡 应拆 |
| 函数 > 200 行 | 10+ 个 | 🔴 必拆 |
| 函数 > 500 行 | 6 个（切分上限） | 🔴 严重 |
| 圈复杂度 > 60 | 15 个 | 🔴 必拆 |
| 圈复杂度 > 100 | 10 个 | 🔴 严重 |
| 嵌套深度 > 4 | 存在（`visual-nodes.ts` 等） | 🟡 应扁平化 |
| 参数 > 5 个 | 存在 | 🟡 应转对象 |

**✅ 额外核查结论**：全项目 **`else-if` 链 ≥8 分支 = 0 处**。这说明代码**没有退化成巨型条件链**，分支逻辑主要用 `switch` 或早返回表达。这是好现象——本项目的高复杂度主要来自**顺序流程冗长 + 内联逻辑堆积**，而非分支爆炸，因此**拆函数（extract method）比重构状态机更有效**。

### 6.3 设计模式运用

**⚠️ 巨型 switch 应转策略/工厂（`case` 数 Top）**：
```
25 case  episode-production/auto-binding/uploaded-entity.service.ts    ← 按实体类型分派
21 case  shared/utils/lesson-layout.ts
18 case  core/utils/markdown-to-docx.ts
13 case  episode-production/agent/ep-agent-actions.ts
13 case  renderer/composables/useStoryRoom.ts
13 case  providers/search/index.ts                                    ← provider 分派
13 case  providers/video/sdk/volcengine-video.provider.ts
13 case  workflow/nodes/control-nodes.ts
```
`uploaded-entity.service.ts`（25 分支）与 `search/index.ts`（13 分支）是**最典型的两处**——都是「按类型选择实现」，正是策略/注册表模式的适用场景。项目**已在别处用对了这个模式**（`agent-runtime/tools/registry.ts`、`workflow/nodes/index.ts` 的 handler 注册表、`builtin-packs.ts`），说明团队掌握该模式但未贯彻——又一处「防御不均」。

**✅ 用对的模式**：
- **Repository**：`src/core/database/repositories/` 146 个文件，真正承担数据访问职责（缺陷在写入边界被 20+ 处绕过，见 2.4）
- **注册表/工厂**：`pack registry`、`tool registry`、`node handlers`、`provider` 分派
- **端口/适配器**：`ISecureStorage`/`IPathProvider`/`IEventEmitter`/`IcKbPort`/`RawTranscriptPort` —— 为双端（Electron/Web）抽象平台差异，用途正当
- **单例（懒加载访问器）**：109 处模块级 `let`，绝大多数是 `let _accessor = null` + `register*()` + `get*()` 的受控单例，**不是**共享可变状态滥用

### 6.4 重复代码

已在 **2.6 节**汇总 6 类基础设施重复（JSON 解析 20+、IPC error ~40、sleep 8、搜索模板 10、前端 JSON 抠取 14+、轮询 6）。全量指纹扫描：**5,458 组跨文件重复 3 行块**。这是本项目**最大的可维护性负债**，且已实际造成缺陷（见 6.5）。

### 6.5 死代码 —— 🔴 已确认 212 处零引用导出

全项目符号级扫描（定义处计 1 次引用），**212 个 `export` 从未被引用**，抽样核实 6 个全部为真死代码。分三类：

**（a）🔴 最严重：多租户安全函数是死代码**
```ts
// src/core/context/user-context.ts
/**
 * 获取当前用户 ID，没有则抛错。
 * Repository 在严格模式下应使用此函数（防止数据越权）。
 */
export function getCurrentUserIdStrict(): string { ... }
```
使用统计：`getCurrentUserId` **262 处**，`getCurrentUserIdStrict` **1 处（仅定义）**。
**这是本次审查中最具警示意义的发现**：项目**写下了**严格版多租户函数并注释说明「防止数据越权」，却**从未使用**。这与 2.4 节「20+ 处绕过 repository 直写、靠人肉注入 `user_id`」是**同一个问题的两面**——安全机制被设计出来但没被执行。见执行摘要「设计-执行断裂」。

**（b）🟡 生命周期函数定义了但从不调用（10 处）**
```
src/electron/ipc/handlers/api-key.handler.ts:155          unregisterApiKeyHandlers
src/electron/ipc/handlers/image.handler.ts:55             unregisterImageHandlers
src/electron/ipc/handlers/provider-config.handler.ts:506  unregisterProviderConfigHandlers
src/electron/ipc/handlers/settings.handler.ts:78          unregisterSettingsHandlers
src/core/packs/chat/handlers/chat.handler.ts:68           unregisterChatHandlers
src/core/packs/chat/handlers/dialog.handler.ts:213        unregisterDialogHandlers
src/core/packs/chat/handlers/message.handler.ts:191       unregisterMessageHandlers
src/core/packs/chat/handlers/role.handler.ts:150          unregisterRoleHandlers
src/core/platform/episode-production/common/sharp-worker.ts:525  disposeSharpWorker
src/shared/utils/settings-reload.ts:51                    unregisterSettingsReloadHook
```
**含义**：项目为 IPC handler 与 worker **准备了注销/销毁能力，但从未接线**。当前「禁用包 = 前端入口消失 + 守卫拦截，服务实例不卸载」的语义下这不影响运行，但意味着：**一旦未来要做真正的运行时卸载/热重载，这些函数需要被接线并验证**。同时 `disposeSharpWorker` 未调用说明 **sharp 子进程没有随应用生命周期回收**（与 4.5 节 ffmpeg 进程泄漏同源）。
**修法**：要么接线（在 `app.on('before-quit')` / 包禁用流程中调用），要么删除。**留着不调用比删掉更糟**——它给人一种「已处理生命周期」的错觉。

**（c）🟢 其他未引用常量/工具函数（~190 处）**
如 `DL_TOOL_SAVE_CONCEPT`、`ASSEMBLE_TOP_K`、`detectThinkingSupport`、`saveRoomState`、`getPlatformPreset` 等。多为迁移期遗留或能力预留。
**注意**：其中一部分可能是**测试专用**（如 `setIcCollectionServiceForTests`、`_clearIpcHandlers`）或**动态引用**（字符串反射），需人工二次确认后再删。

### 6.6 错误处理与最佳实践

| 检查项 | 结论 |
|---|---|
| 统一错误类型 | ⚠️ **缺失**：混用自定义 Error 子类（`PanoramaUploadValidationError` ✅）、裸 `Error`、字符串、`{success:false,error}` 对象 |
| 错误信息可定位 | ⚠️ 部分丢 stack（见 5.3、5.4），部分逐字打印敏感内容（见 3.3） |
| Vue 全局错误边界 | 🔴 **未注册** `app.config.errorHandler` —— 渲染进程异常无统一兜底 |
| 主进程兜底 | ✅ `process.on('uncaughtException')`（`electron/index.ts:76`、`error.service.ts:330-336` 含 `unhandledRejection`） |
| Web 端优雅退出 | ✅ `SIGINT`/`SIGTERM` → `shutdown()`（`web/server/index.ts:287-288`） |
| 用异常做控制流 | 🟡 少量（如 `parseJsonString` 三级 try/catch 阶梯，但**这是合理设计**，有注释说明） |
| `@ts-ignore` | ✅ 仅 3 处 |
| `eslint-disable` | 🟡 47 处（建议逐条复核是否仍必要） |

**最佳实践亮点**：日志有结构化封装（`createLogger` 254 处引用）；IPC 有统一 envelope；有启动性能追踪（`createBootTrace` 19 处）；有 `validateOutboundUrl`（30 处，SSRF 防护）。

### 6.7 测试覆盖（可维护性的关键指标）

**✅ 总量可观**：742 个测试文件（`tests/`），TDD 约定是真在执行的。

**🔴 但与风险严重错配**——**风险最高的模块恰恰零测试**：

| 模块 | 行数/规模 | 测试文件 |
|---|---|---|
| `workflow-engine.service.ts` | 2,722 行 | **0** |
| `chunk-splitter/` | 15 个文件 | **0** |
| `agent-runtime/` | 含 `loop.ts` 47KB | **0** |
| `base-repository.ts` | 多租户注入根基 | **0** |
| `knowledge-base` | 2,306 行主 service | 4 |
| `longwriting` | — | 4 |
| `kb-brain` | — | 3 |

**最值得警惕的是 `base-repository` 零测试**：它承担 `user_id` 自动注入（多租户隔离的唯一防线），却没有测试。结合 6.5(a)「严格版函数是死代码」与 2.4「20+ 处绕过」，可以判断：**多租户隔离是当前项目最大的系统性风险，且缺少任何自动化验证**。

### 6.8 可维护性小结

| 维度 | 评分 | 说明 |
|---|---|---|
| 命名规范 | ⭐⭐⭐⭐ | 文件/类/常量/布尔一致性好；查询动词待收敛 |
| 函数长度/复杂度 | ⭐⭐ | 30+ 函数 >100 行，10 个 cc>100 |
| 设计模式 | ⭐⭐⭐½ | 核心模式用对且克制；巨型 switch 未策略化 |
| 重复代码 | ⭐⭐ | 5,458 组重复块，6 类基础设施重复且已致缺陷 |
| 死代码 | ⭐⭐ | 212 处零引用，含**安全函数**与 10 个生命周期函数 |
| 错误处理 | ⭐⭐⭐ | 主进程兜底完善；缺 Vue errorHandler，错误类型不统一 |
| 测试 | ⭐⭐⭐ | 742 个文件，但与风险错配（核心模块零覆盖） |
| **综合** | **⭐⭐⭐** | **规范意识强，执行力不均，欠一次「收口 + 清理」** |

---

## 七、Karpathy 三维度审查

### 维度一：简洁优先 —— **3.5 / 5**

**失分项**：

1. **重复即复杂度**：5,458 组重复 3 行块。最重的 6 类基础设施重复（见 2.6）本质上是「同一件事写了 N 遍」——这是 Karpathy 意义上最该消灭的复杂度，因为它让「改一处」变成「改 N 处且必漏」。
2. **过大的单文件**：`electron/database/index.ts` 4,862 行、`DomainLearningSpace.vue` 4,389 行、`longwriting-ai.service.ts` 4,064 行。其中 `electron/database/index.ts` 明显是**历史遗留未收拢**——项目已有 108 个文件的 `migrations/` 目录，这个 4,862 行的巨石与新架构并存。
3. **重复造轮子**：8 个 `sleep`（含 2 个异名同功能）、ID 生成 4 种写法（`randomBytes`/`randomUUID`/`Date.now().toString(36)`/手写前缀）。
4. **死代码堆积**：212 处零引用导出 + 10 个未接线的生命周期函数。

**加分项**：
- ✅ 没有引入无谓的重型抽象层；`Repository` 模式是真在用的，不是摆设
- ✅ 端口/适配器模式用得克制（`IcKbPort`、`RawTranscriptPort`、`ISecureStorage`）
- ✅ TODO 仅 38 且无 FIXME/HACK，说明不留烂摊子
- ✅ `code-runner.ts`、`stock-media.service.ts` 是教科书级的资源管理样板（超时 + 清理 + 重抛齐全）

**最该做的 3 件事**：（1）抽象 `safeParseJson`（一举消除 20+ 重复 + 一类缺陷）；（2）抽象 IPC error 包装（~40 处）；（3）拆 `electron/database/index.ts`。

### 维度二：精准修改 —— **3 / 5**

**失分项（存在明确的「顺带改动」与新旧并存）**：

1. **函数名与副作用不符**：`loadOriginalText`（getter 语义）内部发起 N 次 DB 查询；`renderMdPreview`/`escapeHtmlMd` 混在一处。更典型的是 `learning-view.service.ts` 的 `getXxxView()` 系列，每个都触发 4~6 次全量 DB 拉取。
2. **新旧实现并存（迁移期残留）**：
   - `electron/database/index.ts` 的 4,862 行巨石 vs `core/database/migrations/` 新体系 —— **两套迁移机制同时存在**
   - `sleepWithAbort` vs `sleepAbortable` —— 同功能两个名字，分居 `agent-runtime/runtime/async.ts` 与 `workflow/engine/async-utils.ts`（迁到新目录时旧名没删）
   - `platform/services/` 与 `packs/*/services/` 里同名职责的服务（`temporary-entity-template` 等）
3. **platform → packs 的 8 处反向依赖**：正是「改动波及面过大」的体现——为让平台层能用某能力，直接反向 import 了业务包内部实现，而没有做正确的下沉。
4. **注释与代码不符**：`storyboard.handler.ts:295-298` 注释声称保证失败方向安全，实际 `:300-308` 是两次独立提交（见 5.3b）——**误导性注释比没注释更危险**。
5. **未接线的机制**：`getCurrentUserIdStrict` 与 10 个 `unregister*/dispose` 是「写了但没用」的典型，属于非必要改动的残留。

**加分项**：
- ✅ 大量注释详述「为什么」（如 `sanitize-html.ts` 的占位符消毒顺序、`electron/index.ts` 的 CSP 分流理由），这些是真正的设计痕迹
- ✅ 有 `createBootTrace` 逐步计时，说明性能改动是**基于测量**而非猜测
- ✅ 注释主动标注「复核修复 P1-10」等，改动可追溯

### 维度三：编码前思考 —— **3.5 / 5**

**失分项**：

1. **最该思考而没思考的：多租户注入的收敛点**。项目建了 `BaseRepository` + ALS 自动注入 `user_id` 这套优雅机制，还写了严格版函数，却在资产域有 20+ 处绕过它直接 `getRepository().save()`，严格版函数零使用。`kb-chunk.repository.ts:200-202` 的注释证明作者**清楚这个坑**，但选择了「每处手工注入」而不是「强制收口写入边界」——这是设计层面的欠思考。
2. **`webSecurity: false` 的决策缺乏权衡记录**：注释只写「允许访问本地文件」，没有说明评估过哪些替代方案（自定义协议）、接受什么风险。
3. **测试覆盖与风险不匹配**：742 个测试文件是好事，但**风险最高的模块恰恰零测试**（`workflow-engine`、`chunk-splitter`、`agent-runtime`、`base-repository`）。**承担多租户隔离职责的 `base-repository` 没有测试**，这是最值得警惕的一项。
4. **失败模式考虑不全**：`ffmpeg-helpers.ts` 未考虑「ffmpeg 挂死」（同仓库另一文件已考虑）；`portrait.service.ts` ZIP 分支未考虑「磁盘写失败」（同文件宫格分支有子进程隔离）。

**加分项**：
- ✅ `sanitize-html.ts` 是**深思熟虑的产物**：自研白名单消毒器、处理了「占位符穿越消毒器」的顺序问题、剥离 `javascript:/data:`、拆散危险标签保留文本
- ✅ CSP 按 WebContents 分流，有实测教训记录
- ✅ `attachUser` 每请求回查 DB 防旧 token 提权、`sqlite-serial-gate.ts` 防事务死锁 —— 这些是**提前想到了攻击/故障场景**的证据
- ✅ JWT 生产环境 fail-closed（未设密钥直接 throw）

### Karpathy 维度总评

| 维度 | 分数 |
|---|---|
| 简洁优先 | ⭐⭐⭐½ |
| 精准修改 | ⭐⭐⭐ |
| 编码前思考 | ⭐⭐⭐½ |

**按 Karpathy 哲学最该优先做的 5 件事**：
1. **抽象 `safeParseJson`** —— 一次性消除 20+ 重复与一整类「漏改」缺陷（最高杠杆）
2. **接线多租户严格模式** —— 让 `getCurrentUserIdStrict` 真正生效，或删除以免误导（安全性最高杠杆）
3. **给 `base-repository` + `workflow-engine` 补测试** —— 风险与覆盖严重错配
4. **把 `platform → packs` 的 8 处反向依赖做下沉** —— 恢复包机制承诺
5. **拆 `electron/database/index.ts`（4,862 行）** —— 消灭新旧迁移体系并存

---

## 八、修复优先级路线图

### 第一批：立即（P0，1~2 天）

| # | 问题 | 位置 | 动作 |
|---|---|---|---|
| 1 | 空数组解引用崩溃 | `google-sdk-provider.ts:213,256` | 加 `.at(-1)` + 空值早返回 |
| 2 | ffmpeg 无超时无 kill | `ffmpeg-helpers.ts:37-53,72-78` | 抽 `runFfmpegWithTimeout`，照抄 `ffmpeg-assembler.service.ts:108` |
| 3 | ZIP 导出永久挂起 | `portrait.service.ts:1627-1636,1691` | 补 `output.on('error')` + `archive.abort()` + `output.destroy()` |
| 4 | 轮询竞态 + 句柄泄漏 | `image.service.ts:386-388` | 先 delete 再 clear；改自调用循环 |

### 第二批：短期（P1，3~5 天）

| # | 问题 | 位置 | 动作 |
|---|---|---|---|
| 5 | **多租户：严格版函数死代码** | `core/context/user-context.ts` | 仓库层改用 `getCurrentUserIdStrict()`；或删除以免误导 |
| 6 | 双重 `!` + 越界 | `room-design.ts:100-101` | 对齐 `:71` 的姊妹防护 |
| 7 | 空 catch 吞删除失败 | `SkillItemStage.vue:824,880` | 区分「取消」与「故障」 |
| 8 | 事务原子性破坏 | `storyboard.handler.ts:300-308` | 移入同一事务 + catch 补日志 |
| 9 | 「batch」实为 N+1 | `kb-chunk.repository.ts:207` | 改 `repo.insert(array)` 分批 |
| 10 | 嵌套循环 N+1 | `asset-setting-enrichment.service.ts:162-179` | 改 `In([...])` + 内存分组 |
| 11 | 搜索异步乱序 | `UserAssetLibraryDialog.vue:136-149` | 加 seq 守卫 + onBeforeUnmount |
| 12 | 定时器无卸载清理 | `useImage.ts:404-438` | composable 内 `onUnmounted(stopPolling)` |
| 13 | 补 Vue `errorHandler` | `renderer/src/main.ts` | 注册全局兜底 + 上报 |

### 第三批：中期（P1 架构，1~2 周）

| # | 问题 | 动作 |
|---|---|---|
| 14 | platform → packs 反向依赖 8 处 | 相关实现下沉 `core/platform/`，包内改为 import 平台层 |
| 15 | 13 个 import 环 | 抽第三方契约文件或改端口注入；先修 shared/types 与 stores 环 |
| 16 | 实体写入无边界（20+ 处） | 资产域建唯一写入服务，`getRepository` 限定在 `core/database/` 内 |
| 17 | `webSecurity: false` | 改用 `protocol.handle()` 提供本地文件，评估开启 sandbox |

### 第四批：技术债（P2/P3，持续）

| # | 问题 | 动作 |
|---|---|---|
| 18 | `safeParseJson` 重复 20+ | 抽 `core/database/json-column.ts`，挂 `BaseRepository` |
| 19 | IPC error 模板 ~40 处 | `ipcHandler()` 高阶包装 + `toErrorMessage()` |
| 20 | 6 类基础设施重复 | sleep / 搜索模板 / 前端 JSON 抠取 / 轮询 / ID 生成 逐个收敛 |
| 21 | 敏感内容写日志 | 删逐字打印，改 `logger.debug` + 截断 |
| 22 | 核心模块零测试 | 补 `base-repository`、`workflow-engine`、`chunk-splitter`、`agent-runtime` |
| 23 | 巨型文件 | 拆 `electron/database/index.ts`(4,862) / `DomainLearningSpace.vue`(4,389) / `longwriting-ai.service.ts`(4,064) |
| 24 | 高复杂度函数 | 拆 cc>100 的 10 个函数（`validateCogenOutput` cc=146 等） |
| 25 | 869 处 console.log | 统一走 `createLogger` |
| 26 | **212 处零引用导出** | 先复核（部分为测试专用/动态引用），再删除；**优先处理 10 个未接线的 `unregister*/dispose`** |
| 27 | 巨型 switch 策略化 | `uploaded-entity.service.ts`(25 分支)、`search/index.ts`(13 分支) 转注册表/策略 |
| 28 | 查询方法动词收敛 | 定 `get/find/list/count/exists` 语义约定并写入 CLAUDE.md |
| 29 | 错误类型统一 | 建项目级 Error 基类 + 错误码，替代字符串与裸对象混用 |

---

## 九、值得肯定的工程实践（不应在修复中被破坏）

1. **`sanitize-html.ts` 自研消毒器** —— 白名单标签 + 白名单属性 + URL 协议剥离 + 危险标签拆散保文本，并正确处理了「占位符需先于代码块还原穿越消毒器」的微妙顺序问题。质量高于多数项目直接 `v-html` 的做法。
2. **多租户设计（机制正确，但执行断裂）** —— `BaseRepository` + ALS 自动注入 `user_id`；`attachUser` 每请求回查 DB 使停用账号即时失效、角色以 DB 为准防旧 token 提权；甚至准备了 `getCurrentUserIdStrict()` 严格版。**设计思路完全正确**——问题在于三层防线都没接线（见执行摘要「设计-执行断裂」）。修复方向应是**接线而非重写**。
3. **IPC 统一 envelope** `{success,data,error}` + 包前缀守卫（`PACK_DISABLED`）+ manifest 拓扑排序成环检查 —— 包机制的骨架是完整的。
4. **资源管理样板** —— `code-runner.ts`（Worker `terminate()` + `revokeObjectURL` 统一在 `finish()` 收口，异常与超时路径全覆盖）、`stock-media.service.ts`（`AbortSignal.timeout(60s)` + catch 中 `rm(partPath)` + 重抛）、`sharp-worker.ts`（超时与销毁路径均 `child.kill()`）。
5. **注释质量** —— 大量注释解释「为什么」而非「是什么」，并记录实测教训（CSP 分流的 PDF 少图问题、`node:crypto` vs WebCrypto 的坑、TypeORM 返回形态不稳定的教训）。这是本项目最有价值的资产之一。
6. **自我纠错意识** —— 注释主动标注「复核修复 P1-x」「旧 `.catch(()=>{})` 已废弃」，说明有 review 循环在运转。
7. **架构纪律的落实度** —— `shared` 零反向依赖、`packs` 内核零反向引用、manifest `dependencies` 与实际跨包引用一致，这三条**实测证实守住了**，在 1,628 文件规模下不容易。

---

## 十、方法论与可信度声明

**扫描手段**（自建，脚本已清理）：
- 逐行模式匹配（35 类规则：XSS sink / 命令执行 / 空 catch / SQL 拼接 / 硬编码密钥 / 非空断言等）
- 函数长度与圈复杂度估算（花括号配平切分 + 分支关键字计数）
- 循环体内 await IO 检测（循环深度跟踪 + IO 关键字匹配）
- 3 行滑动窗口指纹做跨文件重复检测
- import 图构建（含 tsconfig 别名解析）+ DFS 环检测 + 分层白名单校验
- **符号级死代码检测**（正则提取 `export function|const|class` → 全项目 1,628 文件反向词边界匹配，定义处计 1 次）
- **`else-if` 链长度检测**（连续分支计数）与 **switch `case` 分派统计**

**可信度说明**：
- 标注「**已确认**」的条目均已 `read` 原文上下文核实，含完整证据链（多附**对照证据**：姊妹函数有防护 / 同仓库另一文件已修 / 注释自称的行为与代码不符）
- **死代码检测已做误报排除**：初版脚本因语料构建缺陷把 `createLogger`(254 处)、`validateOutboundUrl`(30 处) 等误判为死代码；修正后对 6 个抽样（`getCurrentUserIdStrict`/`unregisterChatHandlers`/`detectThinkingSupport`/`saveRoomState`/`distillSafe`/`getPlatformPreset`）逐一核实均为真死代码（各 1 处引用即定义处）
- 圈复杂度与函数长度为**估算值**（无 AST 解析），用于排序而非精确度量；500 行为切分上限
- 313 处「循环 IO」与 1,348 处「catch 无日志」**已明确标注含大量合理项**，4.1 节与 5.8 节分别给出了排除标准
- **量化指标已全量复核**（第二轮）：文件数 1,628、总行数 402,852、import 环 13、分层违规 38（含 platform→packs 逐条路径核对一致）、零引用导出 212、重复块 5,458 组、`else-if` 链 0、测试文件 742、`console.log` 869、`eslint-disable` 47、`@ts-ignore` 3、TODO 38、循环 IO 313、圈复杂度 Top3（146/138/136）**均复现一致**
- **复核中发现并已修正 1 处实质错误**：5.8 节初版「空 catch / 吞异常 631 处」有误（脚本口径把正常 catch 计入），已改为「真空 `catch {}` 6 处 / catch 无日志 1,348 处」，并加勘误说明
- **复核中发现并已修正 3 处行号引用偏差**：`WorldLibrary.vue:305-314`→`307-311`、`UserAssetLibraryDialog.vue:136-157`→`136-149`、`portrait.service.ts:1626-1636`→`1627-1636`（问题本身成立，仅引用精度修正）
- SQL 注入 32 处命中经逐条核查**全部排除**（库内常量/占位符函数/表名白名单）
- 硬编码密钥 66 处命中**全部排除**（类型名/注释/前缀常量等误报）
- 未执行构建、未运行测试、未修改任何源码（**纯只读分析**）

**未覆盖范围（建议后续补充）**：
- 运行时行为（真实内存占用、实际查询耗时）需 profiling 验证
- 依赖供应链漏洞（`npm audit`）未运行
- 742 个测试的实际通过率与覆盖率未测量
- `src/renderer/public/models/` 第三方 wasm 未审查