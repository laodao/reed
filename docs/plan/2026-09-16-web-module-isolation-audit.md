# Web 端业务模块兼容性与多租户隔离审计（2026-09-16）

> 承接 `2026-09-16-web-compat-findings.md`（架构现状与硬阻断）。本文是逐模块审计：4 个并行只读 agent 覆盖核心隔离机制 + 全部 12 个业务包 + 壳层 handler。
> 所有结论以"P0（PG datetime 阻断）修复后"为口径。

## 0. 总体结论

**隔离基座是 fail-closed 的（好）**：ALS 丢失时 `BaseRepository.scoped` 退化为 `user_id IS NULL`（`src/core/database/base-repository.ts:51`），读不到他人数据而非读到全部——主要代价是功能静默失效与孤儿数据，不是泄露。**真正的越权面集中在绕过 BaseRepository 的裸 Repository/QueryBuilder/SQL 使用点**（77 个文件 257 处 `this.repo` 裸用，多数正确但有系统性漏网）。

| 模块 | 结论 | 隔离/安全漏洞 | 主要降级 |
|---|---|---|---|
| knowledge-base | 降级可用 | 无直接漏洞（向量层/倒排索引无用户级强制过滤，纵深缺口） | 文件型文档上传无 Web 入口 |
| longwriting | **存在隔离漏洞** | 8 个仓库 IDOR 裸查；replaceAll 家族写 NULL user_id；向量索引 search/rebuild 无归属校验 | 素材导入、md/word 导出、迁移工具 |
| domain-learning | **Web 可用（最完备）** | 无 | pace 调度器不运行（设计如此）；PDF 导出降级 HTML |
| episode-production | **存在隔离漏洞** | export-mp4 任意路径写；startup-recovery 落 `_anonymous`；平台服务层系统性 IDOR；asset-import 写 NULL user_id | 5 条旧 render 通道不可用；参考视频无上传 |
| portrait | Web 可用（小降级） | 无 | 内置模板不可见（seed 租户错）；导出返回绝对路径 |
| voice-design | **存在安全漏洞** | cloneVoice 样本路径 LFI（可读 `data/secure-key`）；删音色跨租户解绑；voice-asset 绑定 IDOR | 调度器 Web 空转；样本无上传通道 |
| asset-center | Web 可用（最干净） | 无（LFI/SSRF 均有显式防线） | 长图渲染/下载/打开目录仅桌面 |
| chat | 降级可用 | 附件 filePath 任意文件读 | provider 配置全租户共用（配额） |
| diary | **存在隔离漏洞** | DiaryService 单例路径缓存串租户；backlinks 裸查询；导出任意路径写 | PDF 导出桌面专属（已门禁） |
| workflow | Web 可用（隔离最好） | 无（share/webhook 设计达标） | app 会话 boot 恢复失效；事件桥写卡 user_id=NULL |
| skills | 降级可用 | import/export 任意服务器路径读写 | — |
| app | Web 可用 | 无 | 受 workflow 两处降级拖累 |
| 壳层配置（settings/api-key/provider/oss/datasource/search-engine） | **存在隔离漏洞（最大面）** | 六组配置表全租户共享（含 API key 互用/互删）；oss:upload / translation:file / export:to-obsidian 任意文件读写；event-admin 无管理员门 | — |

## 1. 高危漏洞清单（建议优先修复）

### 1.1 任意文件读写（Web 端登录即可利用，P0 级安全项）
| 位置 | 问题 |
|---|---|
| `src/core/platform/services/voice-clone.service.ts:451-463` | `persistSampleAudio` 无条件 copy 任意服务器路径进用户 `/assets` 可下载目录——可读 `data/secure-key` 主密钥 |
| `src/core/platform/services/oss.service.ts:103,143,198` | `oss:upload-file` 读 `localPath` 上传到自己控制的 OSS bucket——主密钥外带通道，拿到后可离线解密全库 API key |
| `src/core/platform/services/file.service.ts:53-61` | chat 附件 `filePath` 无 dataPath 内校验，任意文件读进 LLM 上下文 |
| `src/core/packs/translation/.../translation.service.ts:269-275,351-354` | `translation:file` 任意读 + 译文写到源文件同目录（任意写） |
| `src/electron/ipc/handlers/export.handler.ts:171-192,260-349` | Obsidian 导出列/写任意服务器路径，无 isElectron 门禁 |
| `src/core/packs/skills/skill.service.ts:198-247` | `skill:import`/`skill:export` 任意路径读写 |
| `src/core/packs/diary/services/diary-export.service.ts:50-51,115-116` | `diary:export-html/docx` 的 `outputPath` 任意写 |
| `src/core/packs/episode-production/handlers/compose.handler.ts:84-156` | `ep:export-mp4` 接受任意绝对路径/`~` 展开（agent 通道已收口 `ep-agent-actions.ts:1311-1319`，IPC 通道没收口） |
| `src/core/packs/voice-design/handlers/voice.handler.ts:149-155` | `voice:analyze-audio` 任意路径存在性探测 |

统一修复模式已有范本：`asset-storage.service.ts:182-187`（Web 端显式拒绝裸本地路径）。

### 1.2 配置/密钥全租户共享（多租户语义级问题）
- `api_keys` / `provider_configs` / `settings` / `oss_configs` / `search_engine_configs` / `data_sources` 六张表 entity 无 user_id、仓储 `useRawRepo()`——任何登录用户可 list/create/update/delete 全部租户配置。
- 后果：A 可用 B 的 API key 消费配额（chat 提供商链 `chat.service.ts:70-85` 接受前端传 `providerConfigId`）；A 可删 B 的配置、改全站默认提供商；`settings:set` 可改进程级限额；配合 workflow datasource 节点 = 用 B 的库凭据执行任意 SQL（`datasource-executor.service.ts:52-60` 无只读限制）。
- 加密体系实际强度：单主密钥 + 共享密文表，只防"拿到 DB dump"的人，不防租户互用。
- 修复方向：配置表加 user_id 列改回 scoped，或 Web 端改为管理员独占（需补角色鉴权）。
- 对照范本（做对的）：email（entity 有 user_id + Web 端整组不注册）、info-source（三层「自有 OR 内置」+ 内置禁删改）。

### 1.3 IDOR（知道 id 即可跨租户读/写，靠随机 id 不可枚举兜底）
- longwriting（系统性）：`lw-faction/lw-plot/lw-memory/lw-map/lw-outline/lw-chapter-state-summary/lw-entity-state` 等 8 个仓库的 `getByProjectId*` 裸 qb 无 user_id 条件，handler 不验项目归属（`longwriting.handler.ts:592-608,663,773,1059,1153` 等）；`lw-faction/lw-map` 的 `updateSortOrder` 跨租户改序。已修样本：`lw-plot.repository.ts:186-191`、`lw-plot-character/location`，按此模式全量清扫。
- episode-production（系统性）：`src/core/platform/episode-production/**` 服务层 145 处 `ds.getRepository` 裸用，覆盖不均——`analysis.service.ts:179,195`（读/删他人视频解析）、`character-asset.service.ts:103-113,384`、`asset-image.service.ts:147-260`、`timeline-builder.service.ts:89-96`、`video-episode.repository.ts:112-127` 等。
- voice-design：`voice-asset.service.ts:91,98` 绑定/查询无 user 过滤；删音色裸 QB 解绑无 user_id 条件（`voice-design.service.ts:300-308`、`voice-clone.service.ts:357-365`）。
- diary：`diary-link.repository.ts:41-52` findIncomingLinks 裸查（泄露他人日记标题）、`:121-128` updateTarget 裸更新。
- chat：`chat:stop` 只凭 dialogId 可 abort 他人流（DoS，`chat.handler.ts:50-58`）。
- longwriting story-room：`ROOM_CANCEL` 可取消他人会话（低危，`room.handler.ts:58-66`）。

### 1.4 写 NULL user_id 的功能性 bug（双端受影响，Web 端必现）
- `lw-design-document.repository.ts:83-97` create() **硬编码 `userId: null`** + 裸 save（今日提交 8cbeb02d 引入）——新建设计文档读不回，story-room 设计包流程直接受影响。
- replaceAll 家族（`lw-outline-character/location/item`、`lw-skill-character`）删+插不带 user，插入行 user_id=NULL 后 scoped 读不到。
- `asset-import.service.ts:139-148` writeImported → addImage 不传 userId，Web 端导入后看不到自己的图。
- `diary-link.repository.ts:99-114` createMany 事务内不注入 userId，Web 端日记链接功能失效。
- `app-session-bridge` 写卡经事件总线投递（无 ALS）→ user_id=NULL，Web 端看不到运行卡片（`event-bus.service.ts:661-670` 投递不重建 ALS）。
- 内置数据 seed 在无 ALS 时写入 → user_id=NULL：portrait 内置模板 Web 用户不可见（`portrait-template-seeder.service.ts:64-77`）。

### 1.5 ALS 覆盖面问题（后台任务）
- **VoiceCloneJobScheduler 完全无 ALS 包裹**（`voice-clone-job-scheduler.ts:130,205-262`）：Web 端扫不到任何用户的 training 任务、状态永不自动刷新、终态事件全丢——功能整体失效（不越权）。
- `startup-recovery.ts`（episode-production）：boot 恢复无 ALS，文件落 `users/_anonymous/`，各用户恢复产物混进匿名目录且 `/assets` 404。
- `appSessionService.recoverOnBoot()`（`workflow-boot.ts:418`）：Web 重启后运行中会话永久卡 running（run 侧有跨租户扫描+逐用户重建，会话侧漏了）。
- `memory-flywheel.ts:259-261,326` 用字符串字面量 `'local'` 兜底（与 `LOCAL_DEFAULT_USER_ID` 不一致），多用户背景任务互相污染记忆命名空间。
- 结构性脆弱：`attachUser` 不注入 ALS（`auth/middleware.ts:19-26`），依赖每个 router 自觉 `runWithUserAsync`——新增路由忘记包裹即静默退化。
- 做得对的范本：workflow 引擎/触发器/长任务续驱全部显式 `runWithUserAsync(run.userId)`（`workflow-run.service.ts:329-348,615,690` 等），注释纪律严明。

## 2. 向量库与文件资产隔离

- **向量库两种模式都没有用户级强制隔离**：pgvector 写入 user_id 但查询不过滤，且 `KbVectorRepository.create` 不传 userId（列恒 NULL）；LanceDB 的 `VectorRecord` 无 userId 字段，Web lance 模式全用户共享一个目录一张表。隔离完全依赖上层按 kbId/projectId 过滤 + service 层 ownership 校验（纵深缺口，配合 1.3 的 IDOR 即实际可利用）。
- longwriting 向量索引：`VECTOR_INDEX_REBUILD`/`VECTOR_INDEX_SEARCH` handler 不验归属，知道 projectId 可跨用户检索/重建/删除向量（`longwriting.handler.ts:3016-3047` → `lw-vector-index.service.ts` 全文无校验）。
- 文件资产主路径健康：DB 存相对 dataPath 路径、`/assets` 路由防 `../` 严密（`assets-router.ts:31-37`，不校验 symlink 为低危残留）、asset-center 有 SSRF 防护。
- 残留：DB 混入绝对路径时 `toAssetUrl` 无法转换（`web-path.provider.ts:109-112`）；`user-asset.service.ts:107` 兼容绝对路径的拷贝是隐患入口。

## 3. Web 端事件推送

- 路由机制正确：emit 时取 ALS userId 定向推送，无 ALS 静默丢弃不广播（`web-event-emitter.ts:92`）——**不会串用户**，代价是无上下文的后台事件用户收不到。
- 各模块进度/流式事件（chat stream、KB 进度、ep 生成、dl agent、room 事件）均在请求 ALS 内 emit ✓。
- 降级面：VoiceClone 调度器事件全丢；旧 ep handler 用 `webContents.send` 直推的进度事件 Web 端丢失（storyboard 生成进度静默跳过）或整通道不可用（`render/video.handler.ts:75-77,186-189,432-434`、`render/keyframe.handler.ts:300-304`、`render/audio.handler.ts:121-124` 五条旧通道 Web 直接报"窗口不存在"）。

## 4. 其他 Web 兼容性缺口（功能降级面）

- **上传通道不足**：`/api/upload` 只有 panorama/main-image 两条——KB 文件型文档、longwriting 素材文件、voice 克隆样本、ep 参考视频均无 Web 上传入口（且这恰是 1.1 多个 LFI 的成因：只收服务器路径）。
- **长 HTTP 请求**：`dl:agent-send`、ep agent 循环整轮 await，Web 上分钟级长连接，无断线续传。
- **event-admin 越权**：死信列表/重投对任何登录用户开放，死信载荷含其他租户事件（`event-admin.handler.ts:25-51`）。
- **pack 全局开关**：`pack:setEnabled` 改进程级包启停，跨租户 DoS（`pack.handler.ts:30-37`）。
- diary `DiaryService` 单例构造时缓存路径（`diary.service.ts:27-31`）——Web 下第一个用户决定所有用户的日记文件根目录，"行是自己的、文件是别人的"错位；对照 skills 的 `root()` 每次现取是正确模式。

## 5. 修复优先级建议

1. **P0 安全**：1.1 全部任意文件读写点加"路径必须位于当前用户 dataPath 内"或桌面端门禁（对齐 asset-storage 范本）；voice-clone 样本改走 multipart 上传。
2. **P0 多租户语义决策**：配置六表加 user_id 或 Web 端管理员独占——这取决于 Web 端定位（单团队自用 vs 多租户服务），需产品决策。
3. **P0 功能**：修完全局 PG datetime 阻断后，修 1.4 的 NULL user_id 写入点（含今日引入的 lw-design-document bug）。
4. **P1**：IDOR 清扫（按 lw-plot 已修样本）；VoiceClone 调度器与 startup-recovery 逐租户 `runWithUserAsync`；DiaryService 路径改每次现取；diary-link 补 user 条件；event-admin 加管理员判定。
5. **P2**：向量库用户级隔离（pgvector 查询补 user_id 过滤 + create 传 userId）；事件总线投递重建 ALS；`attachUser` 层统一注入 ALS 消除结构性脆弱；上传通道补齐四类文件。
