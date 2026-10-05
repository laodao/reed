# 按用户数据隔离审计报告（v2 · 经证伪复核修订）

- 日期：2026-10-04（v1）/ 2026-10-04（v2 深度复核）
- 范围：src/core（database/context/packs/platform）、src/web/server、src/web/client、src/electron、src/renderer（抽查）
- 方法：4 路并行代码审计 + 两轮证伪复核（P0 全链路追踪、P1 逐条核实、机制层验证、假阴性机械化扫描），关键结论经人工源码抽查
- 结论速览：**机制层设计完备且主干正确（ALS 行级隔离 + users/<uid> 目录隔离 + fail-closed），Electron 单用户形态总体安全；Web 多租户形态存在 1 个系统性缺口（episode-production 整模块绕过 scoped 层）+ 4 个确证的 P0 越权/破坏点 + 一批功能性故障。** 复核推翻了 v1 两个 P0 家族的大部分可利用性主张（上游 scoped 校验拦截），新增了 v1 未报的模块级系统性缺口与机制层语义冲突。

---

## 1. 隔离机制现状（复核后确认）

### 1.1 用户上下文
- `src/core/context/user-context.ts`：ALS 携带当前 userId。
  - Web：JWT cookie（HS256、7 天 TTL、httpOnly）→ `requireAuth` + `runWithUserAsync(req.user.userId)` 统一双包裹（ipc-router.ts:20-33、upload-router.ts:66/133、agents router.ts:51、workflow-api-router.ts:244 等）——复核确认无漏包的业务路由。
  - Electron：`src/electron/database/index.ts:369-372` 启动时 `setDefaultUser('local-default-user')`（全仓唯一生产调用点），进程级默认值使异步逃逸天然安全。
- Fail-closed：无 ALS 时 scoped 查询退化为 `user_id IS NULL`（真实用户数据不泄露）；事件推送 uid=null 直接丢弃（web-event-emitter.ts:92）。
- Web 端**强制 PostgreSQL**（`web/server/index.ts:272-284` 硬编码，`synchronize` 建表），Electron 用 SQLite（raw DDL + `synchronize:false`）。这一事实是多条结论的语境基础。

### 1.2 行级隔离
- 135 个实体文件带 `user_id` 列；16 个无 userId 实体中 13 个为有意共享配置（useRawRepo 或注释声明），2 个经父表间接隔离成立（kb-inverted-index→knowledge_base_id、workflow-definition-version→definitionId 且入口先过 scoped 校验），lw-dictionary/category 为"业务数据漏 userId"。
- `BaseRepository.scoped`：qb() Proxy 防 `.where()/orWhere()` 冲掉租户条件（base-repository.ts:139-163）；`scopedTx()` 事务内保持 scope；`scopedFor()` 多表 scoped。
- 迁移兜底：`ensure-user-id-columns.ts` 补列+回填。**复核新发现——NULL 双语义冲突**：PC 端每次启动把所有 `user_id IS NULL` 行回填为默认用户（electron/database/index.ts:547），role 仓库被迫打"启动时把内置角色重置回 NULL"的反向补丁（role.repository.ts:158-166）；Web 端不回填（index.ts:287 无参调用），NULL 行永久孤儿。即 user_id=NULL 同时承担"内置共享行"与"孤儿坏数据"两种语义，靠各表自觉消歧。

### 1.3 文件落盘
- Web `WebPathProvider.getDataPath() = <root>/users/<当前userId>`；`/assets` 路由在请求者目录内 resolve + startsWith 防穿越（**人工复核确认跨用户读取被 403 拦截，v1 审计中的相反结论系误报，已剔除**）。
- 上传/工作流/参考图等 handler 白名单样板齐全；残留绕过见 P0-1、P1-4。

### 1.4 账号体系
- 开放注册（bcrypt cost 10、注册即自动登录发 cookie）、**全服无限流**（无 express-rate-limit）、默认 `HOST=0.0.0.0`——匿名可批量开户并立即触达全部下列攻击面（放大器，P1）。

---

## 2. 各模块判定一览（v2 修订）

| 模块 | DB 设计 | 实现 | 判定 |
|---|---|---|---|
| 核心机制（user-context / base-repository / 迁移） | ✅ | ✅（Proxy 防冲、scopedTx、fail-closed）；NULL 双语义冲突、旧 scope 死代码 | 支撑良好，机制层有小债 |
| longwriting 主体 | ✅ | ✅ 走 scoped；update* 先 scoped.findOne（复核确认安全）；缺口：type-config 裸读写、dictionary 全局 CRUD、world-binding.setPrimary、收养家族、裸 SQL | 基本支持，多个缺口 |
| **episode-production（ep）** | 部分（ai_call_stats 无 userId） | ❌ **整模块系统性裸仓库（~45 文件），不依赖 scoped 层**：少数文件手工注入 userId 正确（storyboard-insert / script-scene-rebuild / script-append / user-asset 复核通过），其余裸奔（AssetImageService、timeline、video-episode、compose、keyframe 等）；叠加 Web PG 上裸 SQL 方言故障 | **Web 下不支持，需模块级改造** |
| diary（主体） | ✅ | ✅；diary-link 事务漏注、folder 穿越为独立缺口 | 基本支持 |
| kb / kb-brain | ✅ | ✅；Web PG 上部分裸 SQL 表无 user_id 索引（性能债） | 支持 |
| workflow / agent | ✅ | ✅ 为主；内置模板 saveDraft/publish/restoreVersion/importDefinition 门禁缺口 | 支持，有一个门禁缺口 |
| voice / portrait / asset | ✅ | ✅（"me OR is_builtin" 手工作用域正确；VoiceClone 调度器 Web 失效） | 支持 |
| lw-dictionary(+category) | ❌ 无 userId | ❌ 全局表开放全量用户 CRUD | **不支持（需产品裁决）** |
| 共享配置（provider/api-key/oss/search/settings/datasource/pack） | 有意无 userId | useRawRepo 声明；Web 形态=全员互写（datasource 不回明文——复核确认） | Electron 合理，Web 需收敛 |
| 后台任务 | — | ❌ VoiceClone ALS 失效；event-bus '*' 消费者跨租户写 | Web 下失效或越权写 |
| 文件落盘 | — | 主体隔离；compose 任意路径写、diary folder 穿越两处绕过 | 基本支持 |

---

## 3. 确证问题清单（v2 复核后）

### P0（Web 任意登录用户可达，全链路复核坐实）

1. **episode-production 模块系统性绕过 scoped 层（模块级定性）**：`src/core/platform/episode-production/` 约 45 个文件直接 `this.ds.getRepository(...)`。确证破坏点：
   - **AssetImageService 整服务裸仓库**（asset-image.service.ts:75-78，实体有 user_id 列被无视 asset-image.entity.ts:46-47）：`ep:asset:image:*` 全通道 17 个（asset-image.handler.ts:45-62），assetId/imageId 客户端直达、上游无归属校验 → 跨租户读图集、改/删（deleteImage 连磁盘文件一起删 :177-182）；keyframe.handler.ts:119、:526 同款裸查。
   - **timeline-builder 全裸查询**（P0-1 的前置）→ episodeScriptId 无归属校验，可把他人剧集导出为 MP4（跨租户数据窃取通道）。
   - **video-episode 裸读 + 收养**（:112-116 裸 getById、:201→:252 scoped.save 覆盖 user_id）经 `ep:get-episode`/`ep:update-episode` 可达。
2. **compose.handler 任意路径写 MP4**（compose.handler.ts:186-216）：`path.isAbsolute(outputPath)` 原样接受 + `mkdirSync -p`，经 `ep:export-mp4` 可在服务器任意路径创建/覆盖文件。同款问题 `ep-agent-actions.ts:1504-1518` 已修（注释自证"模型被对话注入即可覆盖任意可写文件"），IPC 通道漏修。
3. **event-admin 管理面无角色校验**（event-admin.handler.ts:27-50，register-channels.ts:61 注册到 Web）：user 表有 role 列但全链未使用；死信列表返回任意用户事件全文（event-admin.service.ts:117-124 ← platform-event.repository.ts:411-416 裸 find）；requeue/discard 跨租户重放/丢弃。
4. **event-bus '*' 消费者跨租户写**（Web 特有，代码序坐实）：boot 期 `workflow-boot.ts:404-409` 无 ALS → `event-bus.service.ts:370` userScope='*' → `platform-event.repository.ts:128-141` 扫全量；deliver（:669）不按 event.userId 重包，handler 写库走**触发者 ALS**（app-session-message.repository.ts:64 scoped.save 注入当前 ALS）。后果：B 的会话事件被 A 的请求 kickPump 处理 → 卡片写成 user_id=A（B 永远读不到）、B 会话终态更新 0 行命中**卡死 running**；sweep 定时器（无 ALS）路径写 NULL 孤儿行。

### P0/P1 边界（需产品裁决）

5. **lw-dictionary / lw-dictionary-category 全局 CRUD**：实体无任何隔离字段（lw-dictionary.entity.ts），`longwriting:createDictionaryItem` 等全量 IPC Web 可达（longwriting.handler.ts:1986-2096 → service:1219-1313 → 裸仓库）。设计上即无租户边界（与 lw-global-settings 同类），危害是**跨租户完整性破坏**（A 删字典影响所有人）而非机密性。二选一：加租户列，或 admin-only。
6. **lw-type-config 整文件裸读写**（lw-type-config.repository.ts，不继承 BaseRepository，裸管 4 张有 userId 的表）：读也裸（仅 WHERE project_id）+ `longwriting.handler.ts:2110-2122` 对 projectId 零归属校验 → 跨租户读写他人项目类型配置。

### P1

7. **共享配置 Web 全员互写**：`provider-config:update` 可改共享 baseUrl/apiKey（apiKey 非 '******' 即重加密写入，provider-config.handler.ts:293-303）→ 劫持全体用户 LLM 出口/窃取 prompt；`api-key:set/delete`、`pack:setEnabled`（写全局 NULL binding 行 + 翻转进程 registry）、settings/oss/search-engine/datasource 同理。~~datasource 回明文~~ 复核推翻（toView 剥离 passwordEnc，datasource.handler.ts:25-32），仅存共享写问题。
8. **workflow 内置模板接管（波及面比 v1 更宽）**：门禁只在 update()/updateTriggers()；**saveDraft（:122-124）、publish（:256-305）、restoreVersion（:316-335）、importDefinition overwrite（:390-403）均无门禁** → 任意用户改写/发布全体共享内置模板并持久接管（templateVersion=0），还可给 NULL 行挂 cron → 喂幽灵租户（见 #15）。repo 层裸 update 自认（:292-301）。
9. **"收养"家族（裸读 + scoped.save 覆盖他人行 user_id）+ 跨租户读写**（复核坐实三个客户端 id 直达入口）：
   - `longwriting:upsertEntityStateSnapshot` → lw-entity-state upsert（:231-246，且 getByProjectId 等裸读跨租户）；
   - `longwriting:setStageModelConfig(s)` → lw-project-model-config upsert（:55-57→:62）；
   - `ep:get-episode`/`ep:update-episode` → video-episode（并入 P0-1）。
10. **事务内 create 不注 userId 家族（v1 误标 P0，复核降级为双端功能事故）**：scene-character/dialogue/action、lw-outline-character/location/item、lw-memory-entity、lw-skill-character、diary-link、lw-design-document（显式 `userId: null`）。NULL 行任何用户都读不到（**无泄密**）：Electron 端重启被回填治愈（暂时不可见），**Web 端永久孤儿**；design-document 全链断（创建即丢失）。修复方向 scopedTx。
11. **lw-world-binding.setPrimary 跨租户完整性破坏**（library.handler.ts:246-249 → binding.service.ts:72 → 裸事务）：project_id 是普通索引列非唯一（lw-world-binding.entity.ts:19），传他人 projectId 清空其全部主绑定标记、bindingId 直达翻转他人 is_primary。
12. **diary 路径穿越（比 v1 加重）**：createFolder/updateFolder 的 name 无任何过滤（diary.service.ts:95-101、:140-144 rename），`../..` 可爬出 dataPath 至进程权限内任意目录（建目录/改名）；`diary-attachment.service.ts:80-86` 用 folder.path 拼 assetsDir → **任意目录写文件**。
13. **Web(PG) 裸 SQL 方言故障（真实功能 bug，非理论）**：Web 强制 PG。
    - `storyboard-dialogue-links.ts`（`?` 占位 + `INSERT OR REPLACE`）且该表 Web 上根本不存在（仅 Electron initTables 建）→ `storyboard-cogen.service.ts:910` 在事务内无 catch → **`ep:cogen-storyboards` 分镜联合生成整事务回滚（Web 功能坏死）**；
    - `subtitle.service.ts:153-190` PG 抛错被吞 → 字幕静默退化为均分；
    - `library-sync.service.ts:365` 裸 UPDATE 抛错 → 库同步半途而废。
14. **VoiceCloneJobScheduler Web 端 100% 无效**（web/server/index.ts:221-226 自启、无 runWithUser）：scoped 查询退化 IS NULL 恒空、markTimeoutFailed 0 行命中、事件被 emitter 丢弃。用户手动 `voice:clone-refresh-status`（请求 ALS 内）仍可用。
15. **注册开放 + 无限流 + 0.0.0.0**（auth/routes.ts:18-52；全服无 rate limit 中间件）：匿名批量开户即获得上述全部攻击面（放大器）。

### P2

16. `ep:list-export-history` 裸读（compose.handler.ts:47-61，表有 user_id 列未用）→ 跨租户枚举他人导出记录/路径。
17. `ai_call_stats` 无 user_id（create-ai-call-stats.ts）→ `ep:ai-usage-stats` 全租户用量互见（可推断他人活动强度）。
18. 幽灵租户兜底（`?? LOCAL_DEFAULT_USER_ID`：digest-orchestrator:143、workflow-run:615、trigger-scheduler:151,252）——复核降级：正常数据 userId 非空不触发，仅 NULL 行；经 #8 挂 cron 后变宽。
19. 机制层：base-repository.ts:256-280 旧 scope 实现死代码（无引用，复核确认）；scopeEntity 无条件覆盖 userId（收养根源）+ null 落盘无告警（:56-59）；qb() join 到其他租户表时被 join 表不过滤（固有局限，未见实际踩中）；"NULL=内置共享 vs NULL=孤儿"双语义冲突（PC 回填 vs Web 不回填）。
20. lw-world.bumpVersion / lw-world-entry.reorder 客户端 id 裸写（低危害血缘/排序扰动）。
21. user_id 索引缺口（三种建表路径矩阵）：Web PG 上无 entity 的裸 SQL 表（kb_atoms/kb_entities/kb_notes/kb_knowledge_edges/kb_digest_passes）与 app_session_messages 每查询全表扫；Electron 端 synchronize:false → entity 声明的 user_id 索引从不创建（面更广，单用户纯性能）；ensure-user-id-columns 不建索引、schema-drift 不查索引。
22. JWT 无 isActive 回查（停用 ≤7 天仍可用，当前无停用 API 暴露、风险潜伏）；WS 连接 7 天不重验、logout 不踢线。
23. 客户端 localStorage 键不分用户命名空间（ep project/episode、guide、obsidian tags）——切号残留混淆，非越权。
24. 共享目录：Web `getTempPath()=<root>/tmp` 全员共用；email 附件落 `os.tmpdir()`（email.service.ts:371）；Lance 模式向量库全局一份（pgvector 为推荐配置）。
25. Electron：DB 初始化失败弹窗告知后仍继续 initIpcHandlers + 建窗（electron/index.ts:448-470，无 return/exit）——此时 setDefaultUser 未执行，若部分功能可用则写 NULL 行（v1 结论实质成立，轻微降级：用户有弹窗提示）。
26. lw-bible-kind / lw-predicate-registry / PackBindingRepository："共享/内置"语义靠注释与 NULL 约定而非机制声明（useRawRepo 缺位或半租户表）。
27. 裸 update({id}) 存量中复核确认为纵深防御问题的（id 均来自当次 create 或 scoped 读，不可跨租户直达，建议统一换 scoped.update 消除纪律依赖）：applyLibraryLineage 5 处（lw-character:96 等）、lw-ip-character:171、lw-world-entry:136、agent-task patchFromStatus、lw-material:154-160（无 IPC 通道）、lw-ip-binding:76 setRolePosition（死代码）。

---

## 4. 复核修订对照（v1 → v2）

| v1 结论 | v2 判定 | 关键依据 |
|---|---|---|
| /assets 任意用户可读他人文件（P1） | **误报剔除**（v1 已排除） | assets-router 在请求者 users/<uid> 内 resolve |
| create 不注 userId 家族（P0） | **降 P1**：双端功能事故，非越权泄露 | NULL 行无人可读；Electron 重启回填治愈、Web 永久孤儿；scene-* 三仓库部分无调用方 |
| 裸 update({id}) 家族（P0） | **大部分推翻/降 P2**，仅 setPrimary（P1）+ bumpVersion/reorder（P2）真实可达 | id 来自当次 create 或 scoped findOne；incrementRetryCount 无通道；setRolePosition 死代码 |
| lw-type-config（P0-3 子项） | **维持**且读也裸 → 跨租户读写 | 长链路复核 |
| datasource 明文回显 | **子项推翻** | toView 剥离 passwordEnc |
| 幽灵租户兜底（P1） | **降 P2**（条件触发） | 正常数据 userId 非空；仅 NULL 行触发 |
| Electron init 吞错 | 维持，轻微降级 | 有 showErrorBox 弹窗但仍继续执行 |
| 内置模板门禁缺口（P1） | **维持且加宽** | restoreVersion / importDefinition 也无门禁 |
| Web 裸 SQL"PG 下会抛错" | **维持且加重为真实故障** | Web 强制 PG + cogen 事务回滚 + links 表不存在 |
| compose 任意路径写 / AssetImage / event-admin / event-bus '*'（P0） | **全部维持** | 全链路追踪坐实 |

## 5. 复核新增发现（v1 未报）

- **ep 模块级定性**：系统性裸仓库（~45 文件），不依赖 scoped 机制，靠文件级自觉；部分修复批次文件（storyboard-insert.ts:13-14 注释自证、script-scene-rebuild、script-append、user-asset）手工注入 userId 正确（user-asset.handler 核实为服务端 getCurrentUserId，排除嫌疑）。
- **user_id NULL 双语义冲突**：PC 启动回填 NULL→默认用户（role 仓库被迫反向补丁）vs Web 不回填（NULL 永久孤儿）；内置共享行与坏数据共用同一列语义。
- **三种建表路径覆盖矩阵**（migration / Web synchronize / Electron initTables+ensure）各补一部分，user_id 索引无人负责。
- **register-channels.ts / builtin-packs 激活链确认**：12 个内置包默认全启（registry.ts:76），全部 ep:* / longwriting:* 通道 Web 可达；ipc-guard 只是包启停守卫，无租户校验。

## 6. 修复优先级建议（v2）

1. **P0-2** compose.handler 输出路径收口（对齐 ep-agent-actions 已有修法：只收文件名 + 限定 exports 目录）；顺带补 episodeScriptId 归属校验。
2. **P0-1** ep 模块专项改造：AssetImageService/keyframe/video-episode/timeline 改 scoped 或统一"handler 层传服务端 userId"纪律（user-asset.handler 是现成样板）；bare-SQL 表补 Web 侧建表迁移。
3. **P0-4** event-bus deliver 前 `runWithUserAsync(event.userId)` 重包（event-bridge.ts:149 已有样板）；'*' 消费者注册挪进请求级上下文或显式声明系统租户。
4. **P0-3** event-admin 加 role 校验（user.role 列已存在，只差中间件）。
5. **P1-8** workflow 门禁补齐 4 个入口（saveDraft/publish/restoreVersion/importDefinition）。
6. **P1-7** 共享配置 Web 形态收敛为 admin-only channel（成本最低）或按用户隔离；注册加开关/邀请码 + 全局限流。
7. **P1-9/P2-19** 机制层：scoped.save 不覆盖已有 userId + null 落盘告警；收养家族裸 findOne 改 scoped。
8. **P1-12** diary folder name 白名单/resolve+startsWith（参照 assets-router）；**P1-13** 裸 SQL 改 entity/repository 或 queryBuilder（顺带修复 PG 方言）。
9. **P1-10 家族**统一 scopedTx；lw-type-config 继承 BaseRepository；lw-dictionary 加租户列或 admin-only。
10. 清理：base-repository 死代码、user_id 索引迁移、JWT isActive 回查。
