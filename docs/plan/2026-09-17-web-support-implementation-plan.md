# Web 端完善实施方案（v2 复核修订版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **v2 说明**：本版经 3 个独立复核 agent 逐条对照真实代码验证后修订（修正 5 处路径错误、1 处行号错误、1 处核心技术路线错误及若干偏差，补入 6 项审计遗漏），修订记录见文末。

**Goal:** 恢复并完善 Web 端（Express + PostgreSQL 多租户）支持，使其达到"多用户可安全上线"的水平。

**Architecture:** PC/Web 共用 `src/renderer` 前端源码（入口替换 `main-web.ts` + `src/web/client/bridge.ts` Proxy 桥）与 `src/core` 业务层（`ipcBridge` 双注册，约 803 条 channel 两端同构）；多租户靠 ALS（`src/core/context/user-context.ts`）+ `BaseRepository.scoped` 行级隔离 + `WebPathProvider` 按 `DATA_ROOT/users/<userId>/` 文件隔离。本方案不改架构，只修回归、收口安全、补齐隔离与并发控制。

**Tech Stack:** Electron 28 / Vue 3 / Express 5 / TypeORM 0.3 / PostgreSQL（Web 强制）/ better-sqlite3（PC）/ vitest / playwright。

**Spec:** 依据三份审计文档（执行者必须先读）：
- `docs/plan/2026-09-16-web-compat-findings.md`（架构现状、PG datetime 硬阻断、工作清单 P0–P3）
- `docs/plan/2026-09-16-web-module-isolation-audit.md`（12 个业务模块隔离审计）
- `docs/plan/2026-09-16-web-infra-concurrency-audit.md`（agent 运行时/工作流引擎/事件总线并发审计）

## Global Constraints

- **双端不得回退**：每个修改必须保证 Electron 端行为不变（PC 单用户，`LOCAL_DEFAULT_USER_ID='local-default-user'`，`src/core/context/user-context.ts:17`）。所有 Web 分支用 `isElectron` 守卫或 `window.__APP_PLATFORM__` 判断，不得改变 PC 默认路径。
- **ALS 纪律**：任何后台任务/定时器/事件回调，入口捕获 userId、回调内 `runWithUserAsync(userId, ...)` 包裹（范本：`src/core/platform/workflow/trigger/workflow-trigger-scheduler.service.ts:151`，已验证精确）。禁止新增无 ALS 的后台任务。
- **BaseRepository 纪律**：业务读写走 `this.scoped.*`（`src/core/database/base-repository.ts:70-165`）；事务内用 `scopedTx()`（`:232-241`）。裸 `this.repo`/`ds.getRepository()`/`createQueryBuilder` 仅限两类场景：①跨租户管理工具（注释显式声明）；②**「自有 OR 共享/内置」查询**——注意 `scoped.qb()` 的 where 代理会在每次 `where()/orWhere()` 后以 AND 重挂租户条件（`base-repository.ts:128-148`），**无法表达 OR 语义**（OR 组会被 AND 包夹抵消），此类查询必须用裸 qb + 手工 `getCurrentUserId()`（范本：`app.repository.ts:98-103`、`info-source.repository.ts:52-57`）。新增裸操作为评审红线。
- **entity 双方言**：禁止新增 `type: 'datetime'`（PG 不支持）；日期时间列统一 `type: 'timestamp'`（SQLite/PG 双方言兼容）。
- **路径安全**：Web 端凡是接受客户端路径参数的入口，必须经 Task 1.1 的路径守卫；裸本地路径在 Web 端一律拒绝（范本：`src/core/platform/assets/asset-storage.service.ts:182-187`，已验证精确）。
- **环境判断**：服务端用 `!!process.versions.electron`；渲染端用 `window.__APP_PLATFORM__ === 'electron'`（`isElectronRenderer()`，`src/renderer/src/utils/asset-url.ts:24`）。
- 测试命令：单元 `npm run test:unit`；Web e2e `npm run test:e2e:web`（需先 `npm run pg:up` + web server(4201) + vite(5174)，测试账号见 `tests/e2e/web/README.md`：alice@example.com/password123）；类型检查 `npm run typecheck`；lint `npm run lint`。以上 script 已全部核实存在。
- 提交纪律：每个 Task 独立 commit，message 前缀 `fix(web):` / `feat(web):` / `chore(web):`。

## 验证基础设施（所有 Task 共用）

**Web 联调环境**（每个 Phase 验收都依赖）：

```bash
npm run pg:up                                        # 起 PG 容器（5434，容器名 the-bot-test-pg）
DATA_ROOT=./data-web-mt npm run web:server:dev       # 终端1：Express :4201
npm run web:client:dev                               # 终端2：vite :5174
```

**安全验证通用手法**：注册两个用户 A、B，用各自 cookie 交叉访问对方资源 id，期望 404/403/空结果而非数据：

```bash
curl -c a.jar -X POST localhost:4201/api/auth/register -H 'Content-Type: application/json' -d '{"email":"a@t.com","password":"123456"}'
curl -c b.jar -X POST localhost:4201/api/auth/register -H 'Content-Type: application/json' -d '{"email":"b@t.com","password":"123456"}'
curl -b a.jar -X POST localhost:4201/api/ipc/<channel> -H 'Content-Type: application/json' -d '{"args":[...]}'
```

---

# Phase 0 — 恢复可启动（唯一硬阻断）

## Task 0.1: entity `datetime` → `timestamp` 双方言修复

- [ ] **问题**：实测 42 个 entity 文件、92 处 `type: 'datetime'`（复核已确认数字精确），PG metadata 校验即抛 `DataTypeNotSupportedError`（首例 `src/core/database/entities/platform-event.entities.ts:68,75`），web server 起不来。

**文件：**
- Modify: `src/core/database/entities/` 下全部含 `datetime` 的文件（`grep -rl "type: 'datetime'" src/core/database/entities/` 取清单）
- Create: `scripts/check-entity-pg-compat.cjs`（防回归扫描）
- Modify: `package.json`（scripts 加 `check:entity`）

**修改：**
1. 批量替换前先人工抽查 3 个文件确认无 `datetime` 的其他语义用法（注释、字符串值），然后：
   `grep -rl "type: 'datetime'" src/core/database/entities/ | xargs sed -i "s/type: 'datetime'/type: 'timestamp'/g"`；替换后 `git diff --stat` 应约 92 处。
2. TypeORM 的 `timestamp` 在 SQLite 驱动下合法（NUMERIC affinity，与 datetime 等价），PC 端既有库**无需数据迁移**；Web 端 `synchronize()` 建新表即为 `timestamp`。
3. `scripts/check-entity-pg-compat.cjs`：扫描 `src/core/database/entities/**/*.ts`，发现 `type: 'datetime'`、`type: 'enum'` 即非零退出并打印文件:行号。`package.json` 加 `"check:entity": "node scripts/check-entity-pg-compat.cjs"`，并在 `test:unit` 前置调用。

**验证：**
- `npm run check:entity` 通过。
- `npm run pg:up && DATA_ROOT=./data-web-mt npm run web:server:dev`：不再抛 `DataTypeNotSupportedError`，表创建成功。
- PC 端回归：`npm run test:unit:sqlite` 通过；`npm run pc:dev` 启动后打开已有数据库，设置/聊天/知识库各读写一次。

## Task 0.2: 启动链路实测与修漏

- [ ] **问题**：DB 初始化之后的 packs/workflow 动态加载段从未被运行验证；已知风险点 `src/core/packs/longwriting/services/lw-migration.service.ts:7`（已验证精确）直接 `import '@electron/database/index'`（拉入 better-sqlite3 原生模块，Web 容器缺绑定时炸）。

**文件：**
- Modify: `src/core/packs/longwriting/services/lw-migration.service.ts:7`
- Modify: `src/core/packs/longwriting/handlers/longwriting.handler.ts:2701-2754`（5 条迁移 channel：BACKUP_DATABASE/MIGRATE_PROJECT/MIGRATE_ALL/CHECK_NEEDS/GET_STATS）
- Modify: `src/web/server/index.ts`（视实测发现）

**修改：**
1. `lw-migration.service.ts` 改经 `getCoreDatabaseManager()`（`@core/database/database-manager.interface`）取 DataSource；better-sqlite3 特有的 `db.db.backup` 与 `?` 占位符 raw SQL 部分加平台守卫：Web/PG 下 5 条迁移 channel 返回"迁移工具仅桌面端可用"。
2. 实测启动，逐个修掉后续暴露的断裂（预期集中在 packs kernel 动态 import 段）。

**验证：** web server 启动日志无 error、12 个业务包注册成功；`curl localhost:4201/api/health` 200；浏览器注册/登录后各业务包页面可打开不白屏；PC 端长文项目打开正常。

## Task 0.3: Web e2e 基线摸底

- [ ] **问题**：`tests/e2e/web/` 实测 21 个 spec、62 个 `test()`（复核确认），近 4 个月无留档结果。注意现状瑕疵：spec 编号 11 重复（`11-story-room.spec.ts` 与 `11-voice.spec.ts` 并存）；README 清单停在 14 号且 `10-story-to-video` 已改名 `10-episode-production`；**当前没有任何 workflow 模块的 Web e2e spec**（grep 零命中），后续 Phase 5 的验收不能只靠 e2e。

**文件：**
- Modify: `tests/e2e/web/`（修编号重复、更新 README、按失败修测试或标记已知失败）
- Create: `progress/2026-09-XX-web-e2e-baseline/report.md`

**修改：** 跑 `npm run test:e2e:web`，结果分为：通过 / 产品 bug（挂到本方案对应 Task）/ 测试过时（修测试）；基线报告落盘。

**验证：** 基线报告落盘；后续每个 Phase 完成后重跑，不得比基线差。

---

# Phase 1 — 安全收口：任意文件读写（9+1 处）

统一修复模式：**Task 1.1 先做共享守卫**，后续 Task 逐个接入。范本：`src/core/platform/assets/asset-storage.service.ts:182-187`。

## Task 1.1: 统一路径守卫工具 `path-guard.ts`

- [ ] **文件：**
- Create: `src/core/platform/services/path-guard.ts`
- Test: `tests/unit/core/platform/services/path-guard.test.ts`（目录已存在）

**Interfaces（Task 1.2–1.10 全部消费）：**
- Produces:
  - `assertPathWithinUserDataPath(inputPath: string): string` — 解析为绝对路径并校验在当前用户 dataPath（`getPathProvider().getDataPath()`）内，越界抛错；返回解析后路径。
  - `assertDesktopOnly(featureName: string): void` — 非 electron 运行时抛 `Error('<featureName> 仅桌面端可用')`。
  - `isWebRuntime(): boolean` — `!process.versions.electron`。

**修改：** `resolveAssetPath` 可从 `@core/utils/asset-path` 直接复用（复核确认已导出）；`isWithinDataPath` 目前是 `asset-storage.service.ts:211` 的模块私有函数，上移到本文件并让 asset-storage 改为引用。实现要点：`path.resolve(input)` → `path.relative(dataPath, resolved)` 以 `..` 开头或为绝对路径即抛错；读场景用 `fs.realpathSync` 防 symlink 逃逸，写场景校验父目录 realpath。单测覆盖：dataPath 内相对/绝对路径放行；`../` 逃逸拒绝；`/etc/passwd` 拒绝；symlink 逃逸拒绝；`assertDesktopOnly` 在模拟 Web 运行时抛错。

**验证：** `npm run test:unit -- path-guard` 全绿。

## Task 1.2: voice-clone 样本上传改为 multipart（最高危 LFI）

- [ ] **问题**：`src/core/platform/services/voice-clone.service.ts:451-463`（copyFileSync 在 :461）`persistSampleAudio(req.samplePath)` 无条件复制任意服务器路径进用户可下载目录——可读 `data/secure-key` 主密钥。根因：Web 端无样本音频上传通道。

**文件：**
- Modify: `src/core/platform/services/voice-clone.service.ts:451-463,494`（:494 为 validateCreateRequest 的 existsSync）
- Modify: `src/web/server/api/upload-router.ts`（新增 `/voice-sample`，模板为现有 `/panorama` 端点 `:46-100`）
- Create: `src/renderer/src/api/voice-sample-upload.ts`（对齐 `main-image-upload.ts:23` 平台分叉模式）
- Modify: `src/renderer/src/composables/useVoice.ts:282` 附近（Web 端改 `<input type=file>` + 上传）
- Test: 扩展 `tests/e2e/web/20-voice-tts.spec.ts`

**修改：**
1. `persistSampleAudio`：Web 运行时下仅接受 `voice/sample-inbox/` 内的相对路径（经 `assertPathWithinUserDataPath`），裸路径拒绝；桌面端行为不变。
2. `POST /api/upload/voice-sample`：复用 multer + requireAuth + runWithUserAsync 模式；音频 MIME 白名单（wav/mp3/m4a/ogg）+ 20MB 上限；落 `<dataPath>/voice/sample-inbox/<uuid>.<ext>`，返回相对路径。
3. 克隆流程改为"先上传拿相对路径 → `voice:clone` 传相对路径"。
4. 渲染端 `useVoice.ts:282`：Web 分支用 `<input type="file" accept="audio/*">` + 新 helper。

**验证：** 单测 `persistSampleAudio('/etc/passwd')` 在 Web 运行时抛错；curl 走上传端点传真实音频克隆走通；e2e 20-voice 通过；PC 端文件对话框选样本回归。

## Task 1.3: oss:upload-file 路径限制

- [ ] **问题**：`src/core/platform/services/oss.service.ts:103`（existsSync）、`:143`（aliyun readFileSync）、`:198`（volcengine readFileSync）读 `request.localPath` 上传——可把 `data/secure-key` 上传到自己控制的 OSS，拿到主密钥即可离线解密全库 API key。（行号复核全部精确）

**文件：** Modify `src/core/platform/services/oss.service.ts:103,143,198` + 单测

**修改：** 三处读文件前统一 `assertPathWithinUserDataPath(request.localPath)`；桌面端保留任意本机路径放行（isElectron 分支，对齐 asset-storage 语义）。

**验证：** 单测：Web 运行时传 `/etc/passwd`、`../../secure-key` 抛错；传用户目录内文件放行；PC 回归。

## Task 1.4: chat 附件 filePath 限制

- [ ] **问题**：`src/core/platform/services/file.service.ts:53-61`（readFileSync 在 :61）`readAttachment` 直接读客户端传入路径，Web 登录用户可经 `chat:send` 读服务器任意文件进 LLM 上下文。

**文件：**
- Modify: `src/core/platform/services/file.service.ts:53-61`
- Modify: `src/renderer/src/components/chat/ChatInput.vue:698-713`（openDialog :698、readAsBase64 :713，行号复核精确）
- Test: file.service 单测

**修改：** `readAttachment`：Web 运行时裸路径抛错（`assertDesktopOnly`），仅允许 dataPath 内相对路径经守卫放行；渲染端 Web 分支附件改读 File 对象转 base64 随消息上行（先确认消息协议对 base64 附件的支持面，不支持的格式在 Web 端禁用附件按钮并提示）。

**验证：** curl Web 端 `chat:send` 附件 `filePath=/etc/passwd` 报错；单测覆盖；PC 附件回归。

## Task 1.5: translation:file 任意读写收口

- [ ] **问题**：`src/core/platform/services/translation.service.ts:269-275,351-354,395-398`（**注意路径在 platform/services 下，非 packs**；译文写源文件同目录确认在 :354-357）任意读+任意写。handler：`src/electron/ipc/handlers/translation.handler.ts:74-80`。

**文件：**
- Modify: `src/core/platform/services/translation.service.ts:269-275,351-354,395-398`
- Modify: `src/electron/ipc/handlers/translation.handler.ts:74-80`
- Modify: 渲染端翻译文件选择 UI（Web 分支改上传）

**修改（推荐保留 Web 功能）**：Web 运行时源文件经 `assertPathWithinUserDataPath`；译文输出改写 `<dataPath>/translations/`（`WebPathProvider` 已有 `translations` 子目录，`web-path.provider.ts:17`）；桌面端行为不变。备选：整体 `assertDesktopOnly('文件翻译')` + Web 走"上传→翻译→浏览器下载"。

**验证：** Web curl 传 `/etc/passwd` 拒绝；上传后翻译走通且译文经 `/assets` 可下载；PC 回归。

## Task 1.6: export:to-obsidian 系列桌面门禁

- [ ] **问题**：`src/electron/ipc/handlers/export.handler.ts:171-192`（get-vault-directories :171-179、get-vault-files :184-192）列任意目录、`:260-349`（to-obsidian，writeFileSync 在 :349）写/追加任意路径，均无 isElectron 门禁；既有门禁范本 `:201-203`（export:message-image）。（行号复核全部精确）

**文件：** Modify `src/electron/ipc/handlers/export.handler.ts:171-192,260-349`

**修改：** 三个 channel 开头加 `assertDesktopOnly('Obsidian 导出')`。

**验证：** Web curl 三通道返回"仅桌面端可用"；PC Obsidian 导出回归。

## Task 1.7: skill import/export 路径限制

- [ ] **问题**：`src/core/platform/workflow/skills/skill.service.ts:198-231`（importFromPath 读任意目录）、`:234-247`（exportToPath 写任意目录）。（**注意路径在 platform/workflow/skills 下，非 packs**；行号复核精确）

**文件：**
- Modify: `src/core/platform/workflow/skills/skill.service.ts:198-231,234-247`
- Modify: `src/core/packs/skills/handlers/skill.handler.ts:43-47`

**修改：** Web 运行时 path/destDir 经 `assertPathWithinUserDataPath`；进一步改造（上传 zip/下载）并入 Task 7.1。

**验证：** Web curl 传 `/etc` 拒绝；PC 技能导入导出回归。

## Task 1.8: diary 导出 outputPath 限制

- [ ] **问题**：`src/core/packs/diary/services/diary-export.service.ts:50-51,115-116,144-145` 对客户端 `outputPath` 直接 `fs.writeFileSync`；缺省分支 `:211-225` 写用户 exports 目录已正确。（行号复核精确）

**文件：**
- Modify: `src/core/packs/diary/services/diary-export.service.ts:50-51,115-116,144-145`
- Modify: `src/core/packs/diary/handlers/diary.handler.ts:134-157`

**修改：** Web 运行时忽略客户端 `outputPath`，强制走缺省分支；桌面端"另存为"放行（isElectron 分支）。

**验证：** Web curl `diary:export-html` 传 `outputPath=/tmp/x` → 文件仍落用户 exports 目录；PC 另存为回归。

## Task 1.9: ep:export-mp4 输出路径收口

- [ ] **问题**：`src/core/packs/episode-production/handlers/compose.handler.ts`（文件共 155 行）`resolveOutputPath` 在 **:134-155**，绝对路径/`~` 放行确认在 :142-149。agent 通道同款能力已收口：**真正的路径校验在 `src/core/platform/episode-production/agent/ep-agent-actions.ts:1495-1507`**（`path.isAbsolute` 拒绝 :1501-1503、`..` 拒绝 :1504-1506，属 :1461 起的 export-mp4 action）——复核修正：方案初稿引用的 :1311-1319 是分镜视频返回块，不是路径校验。

**文件：** Modify `src/core/packs/episode-production/handlers/compose.handler.ts:134-155`

**修改：** 把 `ep-agent-actions.ts:1495-1507` 的校验逻辑提取为共享函数，compose.handler 复用；Web 运行时额外强制输出到用户 dataPath 内（`assertPathWithinUserDataPath`）。

**验证：** Web curl `ep:export-mp4` 传绝对路径/`~`/`..` 拒绝；正常导出落用户目录；PC 导出到自选目录回归。

## Task 1.10: voice:analyze-audio 路径探测收口

- [ ] **问题**：`src/core/packs/voice-design/handlers/voice.handler.ts:149-155`（existsSync :153、ffprobe :160+）无守卫，任意服务器路径存在性 oracle。（行号复核精确）

**文件：** Modify `src/core/packs/voice-design/handlers/voice.handler.ts:149-155`

**修改：** Web 运行时路径经 `assertPathWithinUserDataPath`。

**验证：** Web curl 传 `/etc/passwd` 报错；传用户目录内音频正常；PC 回归。

**Phase 1 验收**：`grep -rn "readFileSync\|writeFileSync\|copyFileSync" src/core src/electron --include=*.ts | grep -v test` 逐条确认剩余点要么在 dataPath 内、要么有桌面门禁；`npm run test:e2e:web` 不低于基线。

---

# Phase 2 — 多租户正确性：NULL user_id 写入 + ALS 覆盖

统一模式：写入走 `scoped.*` 自动填充 userId；后台任务入口捕获 userId、回调 `runWithUserAsync` 包裹。**每项修复都附带 PC 端回归验证**（PC 的 ALS 是 `local-default-user`，scoped 语义不变）。

## Task 2.1: lw-design-document create 硬编码 userId:null

- [ ] **问题**：`src/core/database/repositories/lw-design-document.repository.ts:83-97`（复核精确：`userId: null` 在 :85、裸 `this.repo.save` 在 :97），读路径全走 scoped——任何用户新建设计文档读不回，story-room 设计包流程直接坏。

**文件：** Modify `src/core/database/repositories/lw-design-document.repository.ts:83-97`

**修改：** create() 改 `this.scoped.save(...)`，删除硬编码 `userId: null`。

**验证：** 单测 create 后 getById 读回；Web story-room 设计包流程新建→刷新仍在；PC 回归。

## Task 2.2: longwriting replaceAll 家族 NULL 写入

- [ ] **问题**（复核修正行号）：`lw-outline-character.repository.ts:73-82`、`lw-outline-location.repository.ts:73-82`、`lw-outline-item.repository.ts:73-82`、`lw-skill-character.repository.ts:99-113`——删除按外键 id 无用户过滤，插入行 user_id=NULL（双端 bug）。已修范本：`lw-plot-character.repository.ts:76-85`、`lw-plot-location.repository.ts:76-84`。

**文件：** Modify 上述 4 个 repository（`src/core/database/repositories/`）

**修改：** 对照范本：删除用 `scopedTx` + `tx.for(Entity).delete({ outlineId })`，插入走同一 tx 的 `save`（scopedTx API 已验证与 base-repository.ts:232-241 匹配）。同文件其他裸写点一并收口。

**验证：** 单测 replaceAll 后读回且 user_id 正确；双端手工：大纲角色/地点/物品编辑保存→刷新不丢。

## Task 2.3: asset-import 写 NULL user_id

- [ ] **问题**：`src/core/platform/episode-production/assets/services/asset-import.service.ts:73`（variantRepo.findOne 无过滤）、`:96`（imageRepo.findOne 无过滤）、`:139-148`（writeImported 调 addImage 不传 userId）。（复核精确；`addImage` input 确有 `userId?: string|null` 参数，`asset-image.service.ts:54`，缺省落 null :82）

**文件：** Modify `src/core/platform/episode-production/assets/services/asset-import.service.ts:73,96,139-148`

**修改：** 读侧改 scoped 查询；写侧 `addImage` 的 userId 从 ALS/入参透传。

**验证：** Web：A 从人像导入图片到剧集资产→立刻可见；A 传 B 的 portrait imageId → 查不到；PC 回归。

## Task 2.4: diary-link 三处裸操作

- [ ] **问题**：`src/core/database/repositories/diary-link.repository.ts:41-52`（findIncomingLinks 裸 QB join 泄露标题）、`:99-114`（createMany 事务内不注入 userId）、`:121-128`（updateTarget 裸更新）。（复核全部精确）

**文件：** Modify `src/core/database/repositories/diary-link.repository.ts:41-52,99-114,121-128`

**修改：** findIncomingLinks/updateTarget 改 scoped.qb 补 user 条件；createMany 改 `scopedTx`。

**验证：** 单测三方法；Web：B 请求 A 的 entryId backlinks 返回空；A 正常；PC 日记双链回归。

## Task 2.5: 事件总线 deliver 重建 ALS（基础设施 P0）

- [ ] **问题**：`src/core/platform/services/event-system/event-bus.service.ts:669` `await consumer.handler(event)` 不重建 ALS（deliver 方法实际跨 :661-720）。Web 端唯一命名消费者 `app-session-bridge`：sweep 定时器（`:191`）驱动时卡片写 `user_id=NULL`（会话卡 running）；被用户 A 的 publish 同步驱动时若批内混入 B 的事件，B 的卡片以 user_id=A 落库。

**文件：**
- Modify: `src/core/platform/services/event-system/event-bus.service.ts:661-720`（deliver 方法）
- Test: `tests/unit/core/platform/services/event-system/`（复核修正：测试目录带 event-system 子目录）新增跨租户投递用例

**修改：** deliver 内包裹（`event.userId` 字段已确认存在于 :272,305,451；`runWithoutUser` 存在于 `user-context.ts:86`）：

```ts
import { runWithUserAsync, runWithoutUser } from '@core/context/user-context'
// deliver() 内，替换 `await consumer.handler(event)`：
if (event.userId) {
  await runWithUserAsync(event.userId, () => consumer.handler(event))
} else {
  await runWithoutUser(() => consumer.handler(event))
}
```

**验证：** 单测：A 发布事件、消费者内写 scoped 行，断言 user_id=A；无 userId 事件断言 NULL 语义。Web：跑产生会话卡片的 workflow run→卡片可见、会话正常终态（修复前先复现：卡片不出现/卡 running）。

## Task 2.6: 视频生成轮询 ALS 包裹（基础设施 P0）

- [ ] **问题**：`src/core/platform/episode-production/render/video/video-generation.service.ts`（**复核修正路径：在 episode-production/render/video 下，非 platform/services**）轮询注册 :217（startPollingTask，由 generateVideo 在请求 ALS 内调用）、pollTask :249-352——回调无 ALS：`video:generation-event` emit（`:599`）Web 端全静默丢弃；`onCompleted` 回写（`src/core/packs/episode-production/handlers/render/video.handler.ts:307-330`）按 `user_id IS NULL` 恒 0 行命中，**Web 端异步出片永久卡 generating**。

**文件：**
- Modify: `src/core/platform/episode-production/render/video/video-generation.service.ts:217,249-352`
- 核查同款：`src/core/platform/services/image.service.ts:471`（setInterval 与模块级 activePollingTasks 已确认存在；async_hooks 继承基本正确，确认无串扰即可）

**修改：** 启动轮询处 `const userId = getCurrentUserId()` 捕获；pollTask 回调体 `runWithUserAsync(userId, ...)` 包裹（null 时保持现状 + warn 日志）。

**验证：** Web：分镜视频生成（可 mock provider）→ 前端收到进度/完成事件、分镜状态流转完成（修复前先复现卡 generating）；PC 回归。

## Task 2.7: VoiceCloneJobScheduler 逐用户重建 ALS

- [ ] **问题**：`src/core/platform/services/voice-clone-job-scheduler.ts` 全文无 `runWithUserAsync`（复核确认）：bootScan（`:130` 调用、`:176` scoped getByStatus）、tick（`:205-245`）、markTimeoutFailed（`:247-262`）——Web 端按 `user_id IS NULL` 永远扫不到 training 任务，状态永不刷新、事件全丢。（`clonedVoices.getByStatus` 走 scoped 已确认，`cloned-voice.repository.ts:45-47`）

**文件：** Modify `src/core/platform/services/voice-clone-job-scheduler.ts`（bootScan/tick/markTimeoutFailed）

**修改：** 对照范本 `workflow-trigger-scheduler.service.ts:151`：扫描用跨租户裸查（repository 加显式 `*Raw` 方法 + 注释声明），逐行 `runWithUserAsync(row.userId, ...)` 处理；终态 emit 在包裹内发出；行 userId 为 null 跳过并 warn。

**验证：** Web：提交声音克隆→状态自动刷新、收到完成事件（修复前先复现永远 training）；PC 回归。

## Task 2.8: startup-recovery 与 app 会话 boot 恢复

- [ ] **问题**：a) `src/core/platform/episode-production/startup-recovery.ts`（调用点 `src/core/packs/episode-production/handlers/index.ts:47-49` fire-and-forget）无 ALS——恢复产物落 `users/_anonymous/`（`web-path.provider.ts:56` 回落），各用户混目录且 `/assets` 404，temp 清扫只扫匿名目录；b) `appSessionService.recoverOnBoot()`（`src/core/platform/workflow/workflow-boot.ts:418`，复核精确）无 ALS——Web 重启后运行中应用会话永久卡 running。

**文件：**
- Modify: `src/core/platform/episode-production/startup-recovery.ts`
- Modify: `src/core/platform/workflow/workflow-boot.ts:418` 附近 + app-session 恢复路径

**修改：** 两处同一模式：跨租户裸扫（显式 Raw 方法 + 注释）→ 按 userId 分组 → 逐用户 `runWithUserAsync` 执行恢复/落盘/清扫。范本：`workflow-run.service.ts:679-715`（scanBootRecoverable :679、按 user 分组 + runWithUserAsync :689-714，复核精确）。

**验证：** Web：制造中断中的视频下载/运行中会话→重启 server→恢复产物落对应用户目录、会话状态正确收敛；PC 回归。

## Task 2.9: portrait 内置模板 seed 租户修复

- [ ] **问题**：`src/core/platform/services/portrait-template-seeder.service.ts:64-77`（repo.create 在 :75）boot 无 ALS seed → 内置模板 user_id=NULL；Web 请求内 scoped `list()` 按当前 uid 过滤 → Web 用户永远看不到内置模板。

**文件：** Modify `src/core/platform/services/portrait-template-seeder.service.ts:64-77` + `src/core/database/repositories/portrait-prompt-template.repository.ts`（list 查询）

**修改（复核修正）**：entity **已有 `builtin` 列**（repository :23,49,82），无需加列/迁移。list 改「自有 OR 内置」：**注意不能用 scoped.qb + OR 组**（where 代理会以 AND 重挂租户条件抵消 OR，见 Global Constraints）——用裸 `this.repo.createQueryBuilder` + 手工 `getCurrentUserId()` 拼 `(user_id = :uid OR builtin = true)`（范本：`app.repository.ts:98-103`、`info-source.repository.ts:52-57`）。同步回归确认 workflow-definition/app/asset 的同款查询在 Web 正确（审计显示已手工做对）。

**验证：** Web：人像页内置模板可见、禁改禁删正常；PC 回归。

## Task 2.10: memory-flywheel 'local' 字面量兜底

- [ ] **问题**：`src/core/platform/agent-runtime/memory/memory-flywheel.ts:259-261,326`（**复核修正路径：在 agent-runtime/memory 下**；四处 `'local'` 字面量精确命中）兜底与 `LOCAL_DEFAULT_USER_ID` 不一致，Web 端 ALS 缺失时记忆 tag 退化为 `mem:local:*`，多用户背景任务互相污染记忆命名空间。

**文件：** Modify `src/core/platform/agent-runtime/memory/memory-flywheel.ts:259-261,326`

**修改：** 兜底改 `getCurrentUserId() ?? LOCAL_DEFAULT_USER_ID`；核查调用方是否可能处于无 ALS 上下文，是则入口补 `runWithUserAsync` 包裹。

**验证：** 单测兜底分支；grep 确认不再有 `'local'` 字面量作 userId 兜底。

## Task 2.11: DiaryService 单例路径缓存串租户（复核补入，原审计遗漏项）

- [ ] **问题**：`src/core/platform/services/diary.service.ts:27-31` 在**构造时**缓存 `diaryRootPath = getPathProvider().getUserDataPath()`，而 `src/core/packs/diary/handlers/diary.handler.ts:16-21` 把 DiaryService 做成进程级单例——Web 下第一个触发构造的用户决定所有用户的日记文件根目录：DB 行按各自 user_id 隔离，但 .md 正文文件写进/读自别人目录（"行是自己的、文件是别人的"错位）。对照正确模式：skills 的 `root()` 每次调用现取路径。

**文件：** Modify `src/core/platform/services/diary.service.ts:27-31`（及全部 `this.diaryRootPath` 使用点，10+ 处）

**修改：** 删除构造时缓存，改为每次调用现取 `getPathProvider().getUserDataPath()`（getter 方法）；PC 端语义不变（单用户路径恒定）。

**验证：** Web 双用户：A、B 各写日记→正文分别落各自 `users/<uid>/diary/` 目录、互不可见；PC 日记读写回归。

**Phase 2 验收**：Web 双用户交叉验证上述全部场景；`npm run test:unit` 与 `npm run test:e2e:web` 不低于基线；PC `npm run test:unit:sqlite` 全绿。

---

# Phase 3 — 配置/密钥多租户化

> **决策点 D1（动手前需产品确认）**：`api_keys` / `provider_configs` / `settings` / `oss_configs` / `search_engine_configs` / `data_sources` 六表当前全租户共享（复核确认：六个 entity 均无 user_id 列；六个 repository 均 `useRawRepo()`——api-key.repository.ts:21、provider-config.repository.ts:22、settings.repository.ts:27、oss-config.repository.ts:24、search-engine-config.repository.ts:23、datasource.repository.ts:25）。
> **推荐方案（本方案按此编写）**：加 `user_id` 列按用户隔离 + 保留"系统默认"语义——现有行迁移后保持 `user_id=NULL`（系统默认），查询走「自有 OR 系统默认」，用户首次修改某项配置时 copy-on-write 为自己的行。
> 备选方案：Web 端管理员独占（依赖 Task 3.3 角色鉴权），普通用户只读系统默认——实现量小但所有用户仍共用同一套 key 配额。

## Task 3.1: 六表 user_id 化 + copy-on-write

- [ ] **文件：**
- Modify: 六 entity（`src/core/database/entities/`：`api-key.entity.ts`、`provider-config.entity.ts`、`settings.entity.ts`、`oss-config.entity.ts`、`search-engine-config.entity.ts`、`datasource.entity.ts`）加 `userId` 列（nullable + 索引）
- Create: `src/core/database/migrations/add-user-id-to-config-tables.ts`（加列+索引；现有行保持 NULL=系统默认）
- 登记迁移**两处**（项目既有手工同步纪律）：`src/electron/database/index.ts:515` `runMultiTenantMigrations()` + `src/web/server/index.ts`（静态 import :48-84 + 动态登记段 ~:340-580）
- Modify: 对应 6 个 repository 与 6 个 handler（`src/electron/ipc/handlers/`：api-key/provider-config/settings/oss/search-engine/datasource .handler.ts，复核确认全部存在）

**修改要点（复核重大修正——初稿"去 useRawRepo + scoped.qb 括号 OR 组"的写法不成立）：**
1. **读侧**：scoped API 无法表达「自有 OR 系统默认」（qb where 代理以 AND 重挂租户条件会抵消 OR；find/findOne 的 scopeWhere 直接并入 where 对象无 OR 能力）。因此读查询**保留裸 qb + 手工 `getCurrentUserId()` 拼 `(user_id = :uid OR user_id IS NULL)`**，对齐 app/info-source 既有范本。`getDefault`/`getEnabled` 优先自有行、回落系统默认。
2. **写侧**：走 scoped（save 自动注入当前 userId）；update/delete 仅作用于自有行；对系统默认行的修改转为 copy-on-write 插入自有行；`setDefault` per-user 化（只清自己行的 default 标记）。
3. `settings` 特殊：影响进程级参数的键（`src/shared/utils/workflow-runtime-params.ts:52`、`asset-params.ts:31`、`portrait-params.ts:30`，复核补全路径）在 Web 端仅管理员可写（Task 3.3），普通用户键正常 per-user 化。
4. PC 端兼容：PC ALS 固定 `local-default-user`，迁移后 NULL 行作为系统默认继续可见，行为不变。

**验证：** 迁移单测（PG+SQLite 两侧）；Web 双用户：A 配 key → B 不可见、聊天用不到；A 删系统默认仅对 A 生效；chat 提供商链（`src/core/packs/chat/services/chat.service.ts:70-85`）：A 传 B 的 providerConfigId → 查不到即报错；PC 既有配置全部可见可用。

## Task 3.2: datasource 节点只读约束

- [ ] **问题**：`src/core/platform/workflow/datasource/datasource-executor.service.ts:52-60`（**复核修正路径：在 workflow/datasource 下，非 workflow/nodes**）`executeDataSourceSql` 经 driver 适配器执行任意 SQL——配合配置共享等于用他人库凭据跑任意 SQL。

**文件：** Modify `src/core/platform/workflow/datasource/datasource-executor.service.ts:52-60`

**修改：** Web 运行时 SQL 首关键字白名单（SELECT/WITH/EXPLAIN），写操作语句拒绝；文档建议生产用只读库账号。

**验证：** Web：datasource 节点执行 `DROP TABLE`/`UPDATE` 被拒；SELECT 正常；PC 不变。

## Task 3.3: 角色鉴权 + 管理面收口

- [ ] **问题**：users.role 存在（`user.entity.ts:29-30`，default 'user'）但 `requireAuth` 只查登录（`src/web/server/auth/middleware.ts:31-37`），注册硬编码 `role:'user'`（`auth/routes.ts:44`）；`src/electron/ipc/handlers/event-admin.handler.ts:25-51`（**复核修正路径：在 electron/ipc/handlers 下**；死信含其他租户载荷）、`src/electron/ipc/handlers/pack.handler.ts:30-37`（全局包启停）对任何登录用户开放。

**文件：**
- Modify: `src/web/server/auth/middleware.ts`（新增 `requireAdmin`）
- Modify: `src/web/server/api/ipc-router.ts:20-33`（单一 `/:channel` 捕获路由，在 invokeIpc 前插 channel→权限映射，复核确认结构方便插入）
- Modify: `src/electron/ipc/handlers/event-admin.handler.ts:25-51`、`pack.handler.ts:30-37`（handler 层双保险）
- Modify: `src/web/server/auth/routes.ts:44`（首注册用户=admin 引导）

**修改：** `requireAdmin` 验 JWT 后查 role==='admin'；admin channel 清单（`event-admin:*`、`pack:setEnabled`、进程级 settings 键）命中即 requireAdmin；handler 层同样校验；注册可加可选邀请码 env `WEB_INVITE_CODE`。

**验证：** 普通用户调 `event-admin:list-dead-letters`/`pack:setEnabled` → 403；admin 正常；PC 无 role 概念行为不变。

**Phase 3 验收**：双用户 + 管理员三角色配置隔离/密钥使用/管理面交叉验证；e2e 不低于基线。

---

# Phase 4 — IDOR 与越权清扫

统一模式：**读**——按 id/projectId 查询先经 scoped 校验属主（查不到即"不存在"，范本 `src/core/packs/domain-learning/services/learning-project.service.ts:83-87` 的 `ensureOwned`）；**写**——条件带 user_id；**控制面**——先 scoped 校验属主再操作内存表。

## Task 4.1: longwriting 仓库族裸查询收口

- [ ] **问题**（复核全部抽查通过，行号精确到 ±2 行）：8 个仓库的 `getByProjectId*` 裸 qb 无 user_id 条件——`lw-faction.repository.ts:41-62`（2 个方法）、`lw-plot.repository.ts:53-61,71-77`、`lw-memory.repository.ts:45-108`（4 个方法）、`lw-map.repository.ts:48-56`、`lw-outline.repository.ts:62-70,289-302`、`lw-chapter-state-summary.repository.ts:39-46,59-71,73-81`、`lw-entity-state.repository.ts:41-50,52-68,88-100,106-120`；裸写 `lw-faction.repository.ts:124-138`、`lw-map.repository.ts:136-150`（updateSortOrder 跨租户改序）；零散裸读 `lw-project-model-config.repository.ts:55-57`、`lw-entity-state.repository.ts:231-238`、`lw-skill-character.repository.ts:80-82`。已修范本：`lw-plot.repository.ts:181-195`（reorderPlots，userId 条件在 :191）。

**文件：** Modify 上述 repository（`src/core/database/repositories/`）

**修改：** 逐方法对照范本改造：getByProjectId* 改 scoped.find/scoped.qb；updateSortOrder 类裸写加 user 条件或改 scopedTx。收尾：`grep -n "this\.repo\.\|createQueryBuilder" src/core/database/repositories/lw-*.ts` 剩余裸操作逐条登记为"已修复/显式跨租户（注释声明）"。

**验证：** 单测越权读写用例（A 建项目 B 上下文查空）；Web 双用户 curl 抽查 factions/maps/plots/outline；PC 长文全功能回归。

## Task 4.2: longwriting handler 归属校验 + 向量索引

- [ ] **问题**：handler 直接透传 projectId 不验归属（`longwriting.handler.ts` 共 201 条 channel，复核精确），抽查确认 `592-608`（GET_FACTIONS）、`663`（GET_MAPS）、`773`（GET_PLOTS）、`1059`（GET_MATERIALS）、`1153`（GET_OUTLINE_TREE）、`2813/2874/2891`（stage-model-config/chapter-state-summary）；向量索引 `VECTOR_INDEX_REBUILD`（`:3016-3047`）/`VECTOR_INDEX_SEARCH`（`:3050-3068`）→ `src/core/platform/services/longwriting/lw-vector-index.service.ts`（**复核修正路径：在 platform/services/longwriting 下**）全文仅按 projectId 过滤，无任何归属校验。

**文件：**
- Modify: `src/core/packs/longwriting/handlers/longwriting.handler.ts`（加统一 `ensureOwnedProject(projectId)` 私有助手并接入上述 channel）
- Modify: `src/core/platform/services/longwriting/lw-vector-index.service.ts`（search/rebuild/delete 入口加项目归属校验）

**修改：** 助手实现：`const p = await db.lwProjects.getById(projectId); if (!p) throw new Error('项目不存在或无权访问')`（scoped 语义下非属主即 null）。所有接受 projectId 的 channel 入口统一调用；向量 service 三入口同。

**验证：** Web 双用户：B 拿 A 的 projectId 调 lw:get-factions/get-outline-tree/向量 search/rebuild → 全部"项目不存在"；A 正常；PC 回归。

## Task 4.3: episode-production 平台服务层 IDOR 清扫

- [ ] **问题**：`src/core/platform/episode-production/**` 服务层 `ds.getRepository` 裸用实测 147 处（方案初稿"约 145"复核修正为 147），覆盖不均。复核确认的高危点：
- `reference-video/analysis.service.ts:178-180`（getById 无校验）、`:192-196`（delete 裸删）
- `assets/services/character-asset.service.ts:103-105`（getById）、`:108-113`（listByProject）、`:383-385`（delete）（bindingRepo=ds.getRepository :90 裸）；location/item 两个同构 service 一并处理
- `assets/services/asset-image.service.ts:147-174,182-188,199-226`（setAsMain/deleteImage/switchDefaultMain）
- `assets/services/asset-project-summary.service.ts:91-94,119`
- `compose/timeline-builder.service.ts:89-96`、`compose/subtitle.service.ts:59-61,125-127`
- `assets/services/main-image-generator.service.ts:181-189`
- `user-asset/user-asset.service.ts:85`（addToLibrary 按 bindingId 裸 findOne）；**同文件 :107 对绝对路径原样 copy 的兼容逻辑是隐患入口**（DB 混入绝对路径时 Web 端 `toAssetUrl` 无法转换）——一并处理：Web 端拒绝绝对路径源
- `src/core/database/repositories/video-episode.repository.ts:111-116,118-126`（getById/getByOutlineId 裸 findOne）
- `narrative/services/storyboard-cogen.service.ts:188-197,228-245,710-713`（**复核修正：路径含 services/，真实裸查询在这三段**；初稿写的 :119-136 是 cogen 循环体）
- `video-segment.service.ts:90`
- handler 层：`compose.handler.ts:57`（list-export-history 裸 SQL 仅按 episode_id）、`handlers/narrative/reference-video.handler.ts:82-94`（handleGet）、`:120-131`（handleDelete，复核修正行号）

**文件：** Modify 上述全部 + `grep -rn "getRepository(" src/core/platform/episode-production/` 全量过剩余点

**修改：** 两档处理：a) 有 scoped repository 的改经 dbManager scoped 仓储；b) 必须跨表/高性能的补显式 `user_id` 条件（`getCurrentUserId()` 注入，null 时 IsNull 语义）。公共入口（getById/delete/setAsMain 类）改"先 scoped 查属主再操作"。

**验证：** 单测覆盖各 service 越权用例；Web 双用户交叉（assetId/imageId/analysisId/episodeId）；PC 剧集制作全流程回归（资产主图、参考视频、合成）。

## Task 4.4: voice-design 跨租户写收口

- [ ] **问题**（复核全部精确）：a) 删音色裸 QB 解绑无 user_id 条件——`src/core/packs/voice-design/services/voice-design.service.ts:300-308`、`src/core/platform/services/voice-clone.service.ts:357-365`（均为 `update(CharacterBindingEntity).where('voice_id=:v')`）；b) `src/core/platform/episode-production/assets/services/voice-asset.service.ts:91`（bindToCharacter 裸 update）、`:98`（listCharactersByVoice 裸 find）。

**文件：** Modify 上述 3 个文件

**修改：** 解绑 QB 补 `AND user_id = :uid`（或 scopedTx）；voice-asset 两方法补 user 条件/属主校验。

**验证：** 单测：两用户同 voice_id 行，A 删音色不影响 B；Web 交叉 bind；PC 回归。

## Task 4.5: 控制面 stop/cancel/decide 属主校验（4+1 处）

- [ ] **问题**（复核全部确认）：
- `chat:stop`：`src/core/packs/chat/handlers/chat.handler.ts:50-63` → `chat.service.ts:403-411`、`src/core/packs/chat/services/system-agent/system-agent.service.ts:444-451`（复核补全路径），只凭 dialogId 无属主校验
- `ac:stop` task 分支：`src/core/packs/workflow/handlers/agent-console.handler.ts:99-113`（路径已确认）拿到 scopeKey 直接 `cancelTree`；`task-service.ts:592-596` 证实**内存 abort 先于任何 DB 校验**（:593-596 先 abort controller，:597 才查行）——跨租户 DoS 成立
- `ep:agent:cancel`/`ep:agent:decide`：`src/core/packs/episode-production/handlers/agent.handler.ts:52-82`（decide :52-60、cancel :71-82）→ `ep-agent-harness.service.ts:172-194`（cancel :172-176、decideChoice :179-194，纯内存 Map 无属主比对）
- `ROOM_CANCEL`：`src/core/packs/longwriting/story-room/room.handler.ts:62-69`（复核修正行号）无属主校验

**文件：** Modify 上述 5 处 handler + `task-service.ts:592-596`

**修改：** 每个入口先 scoped 属主查询（dialog/run/project 查不到即拒绝）；`cancelTree` 入口先查库校验行属主再 abort 内存 controller。

**验证：** 单测/手工：B 拿 A 的 dialogId/rootId/projectId 调 stop/cancel/decide → 拒绝且 A 任务不受影响；正常停止自身任务双端回归。

## Task 4.6: KB 向量库与倒排索引用户级隔离（复核补入，原方案遗漏）

- [ ] **问题**（模块审计 §2 + 复核实测确认）：
- pgvector 模式：向量表写入 user_id 但查询不过滤，且 `KbVectorRepository.create` 压根不传 userId（`kb-vector.repository.ts:37-48`，该列恒 NULL）
- LanceDB 模式：`VectorRecord` 无 userId 字段（`lance-db.service.ts:16-27,119`），Web lance 模式全用户共享一个目录一张表
- `kb-inverted-index.entity.ts:14-38` 无 user_id 列（`kb-inverted-index.repository.ts:142-189` 多处裸 qb 仅按 kbId/chunkId）
- 现状隔离完全依赖上层按 knowledgeBaseId 过滤 + service 层 ownership 校验（`knowledge-base.service.ts:989-990` 等已做）——纵深缺口，配合任何一处归属校验遗漏即实际可利用。

**文件：**
- Modify: `src/core/database/repositories/kb-vector.repository.ts:37-48`（create 传 userId）
- Modify: pgvector 查询实现（`pg-vector-store.ts`，查询补 user_id 条件；存量 NULL 行迁移回填或按 kbId 关联回填）
- Modify: `src/core/platform/services/lance-db.service.ts`（VectorRecord 加 userId 字段 + 写入/查询过滤；或 Web 端按 userId 分表/分目录——二选一，推荐加字段过滤，改动小）
- Modify: `src/core/database/entities/kb-inverted-index.entity.ts` + 新迁移（加 user_id 列，存量行按 chunk→document→kb 关联回填）+ `kb-inverted-index.repository.ts` 查询补条件

**验证：** 单测：A 的向量/BM25 检索在 B 的上下文返回空（即使知道 kbId 且绕过 service 校验直接调 store）；Web 双用户 KB 检索互不可见；PC 回归知识库检索。

**Phase 4 验收**：`grep -rn "this\.repo\.\|ds\.getRepository\|dataSource\.getRepository" src/core --include=*.ts | grep -v test` 输出逐条登记为"已修复 / 显式跨租户（注释声明）"；双用户交叉用例全过；e2e 不低于基线。

---

# Phase 5 — 工作流引擎并发竞态与公平性

> **复核修正**：`workflow-engine.service.ts` 实际在 `src/core/platform/workflow/engine/`（初稿全文缺 `engine/`）；`workflow-run.service.ts` 路径正确。依据：审计文档 §2。**注意：当前无 workflow 模块的 Web e2e spec**，本 Phase 验收以新增并发单测 + 手工为主，e2e 补建在 Task 8.3。

## Task 5.1: 队列饿死/插队修复

- [ ] **问题**（复核精确）：`drainQueue` 只在 `executeRun` finally 触发（`workflow-run.service.ts:352`）；`launch` 低于上限时绕过队列直启插队（`:319-323`）；`cancelRun`（`:372-397`）成功路径与 `resumeSuspended` 续驱终态路径都不出队。

**文件：** Modify `src/core/platform/workflow/workflow-run.service.ts:319-323,352,372-397` + `src/core/platform/workflow/engine/workflow-engine.service.ts`（resumeSuspended 终态路径，:1075 附近）

**修改：**
1. `launch`：队列非空时一律入队（不直启），保持 FIFO。
2. 引擎侧通过 deps 回调暴露 `onRunFinished` 钩子，服务层统一挂 drainQueue（避免引擎反向依赖）；resumeSuspended 到终态与 cancelRun 成功路径均触发。
3. 排队 run 的 `timeoutAt`：排队期间不应流逝超时（出队时重置计时起点）。

**验证：** 单测：maxConcurrentRuns=1 提交 3 个 run，第 1 个挂起→决策→终态后第 2 个自动出队；取消活动 run 后队列推进；FIFO 顺序保持。

## Task 5.2: 决策双跑窗口

- [ ] **问题**（复核精确）：`tickReviewTimeouts`（`engine/workflow-engine.service.ts:1127-1177`，确无 `state.deciding` 检查，仅过滤 suspended/waiting_review/waitExpiresAt :1130-1137）；`resumeReview`（函数起于 `:836`，deciding 守卫在 :856-860）不检查 `waitExpiresAt`。

**文件：** Modify `src/core/platform/workflow/engine/workflow-engine.service.ts:836-860,1127-1177`

**修改：** `tickReviewTimeouts` 跳过 `deciding=true` 的 run；`resumeReview` 入口检查 `waitExpiresAt` 已过期则返回"已由超时处理"；`applyReviewDecision` 加幂等守卫（同 run+node 已有 reviewDecided journal 则跳过）。

**验证：** 单测：决策与超时同时触发，断言 journal 单份 reviewDecided、run 状态一致。

## Task 5.3: cancel vs rehydrate 竞态

- [ ] **问题**（复核精确）：`ensureActive` 的 rehydrate 读行校验状态在 `:697`、注册 `activeExecutions` 在 `:772`——读与注册之间存在窗口；`cancelRun`（`workflow-run.service.ts:372-397`）判定引擎非活动后条件取消，rehydrate 在飞时内存复活已取消的 run。

**文件：** Modify `src/core/platform/workflow/engine/workflow-engine.service.ts:669-772` + `src/core/platform/workflow/workflow-run.service.ts:372-397`

**修改（推荐 a）**：a) rehydrate 注册 `activeExecutions` 前复查 run 行状态，已 cancelled 则放弃并清理；b) 备选：cancelRun 等待 `rehydrating` 在飞 Promise settle 后再判定。

**验证：** 单测：rehydrate 进行中发起 cancel，断言最终 cancelled 不复活。

## Task 5.4: 引擎终态写条件化

- [ ] **问题**（复核精确）：引擎 `patchRun` 直通 `runs.update` 无条件（`workflow-run.service.ts:760-761`；repository update `:176-193`）；`finalize`（engine `:2635-2667`，patchRun 在 :2658）/`resumeSuspended`（:1075）无条件写会覆盖 cancelled/interrupted 终态。

**文件：** Modify `src/core/platform/workflow/workflow-run.service.ts:760-761`、`src/core/database/repositories/workflow-run.repository.ts:176-193,200-215`

**修改（复核技术提醒已并入）**：`transitionIfStatus`（`:200-215`）现有 patch 类型仅支持 status/finishedAt/error/cancelRequestedAt，而 finalize 还要写 durationMs/stats——**需扩展其签名或新增条件更新方法**，不能直接复用。终态落库改条件更新：`WHERE id=:id AND status NOT IN ('succeeded','failed','cancelled','timed_out')`；affected=0 时 warn 并跳过内存收尾。

**验证：** 单测：先条件取消再触发 finalize，断言终态不覆盖；workflow 手工全流程（运行/挂起/审批/完成）回归。

## Task 5.5: 内置定义事件触发器 Web 端永不命中

- [ ] **问题**（复核精确）：`workflow-trigger-scheduler.service.ts:243` 的 `t.userId !== event.userId` 过滤使内置共享定义（user_id=NULL）的事件触发器在 Web 端永不命中；事件限流 `allowEventTrigger`（`:266-274`）只按 definitionId，内置定义被多用户互相消耗配额。

**文件：** Modify `src/core/platform/workflow/trigger/workflow-trigger-scheduler.service.ts:240-278`

**修改：** 匹配条件改「`t.userId === event.userId` 或 t 为内置定义（userId 为 null）」；内置定义触发时以事件属主 userId 建 ALS（复用 `:151` 包裹）；限流配额键改 `definitionId:userId`。

**验证：** 单测：内置定义 + Web 用户事件 → 触发成功且限流按用户隔离；PC 回归 cron/事件触发。

## Task 5.6: workflow run 每用户配额 + 队列有界（复核补入，原方案遗漏）

- [ ] **问题**（infra 审计 §2）：仅全局 `maxConcurrentRuns`（默认 3），无每用户配额、队列无界——单用户可提交大量 run 填满全局槽位与队列挤占他人；挂起 run 不占并发槽但内存无上限（全图快照+变量常驻，`activeExecutions` :391、suspended 不占槽 :572-578）。

**文件：** Modify `src/core/platform/workflow/workflow-run.service.ts`（launch/queue 处）+ 配置项

**修改：** 新增每用户并发上限（默认 2，env 可调）与队列总长度上限（默认 100，超限拒绝新提交返回明确错误）；挂起 run 内存上限（默认 50，超出时最久挂起的转 interrupted 落库释放内存）。

**验证：** 单测：A 提交 100+ run → B 的 run 仍能获得槽位；队列超限拒绝；挂起上限触发转 interrupted。

**Phase 5 验收**：新增并发单测全绿；混沌脚本（连续 20 次"提交→挂起→决策/超时/取消"）无状态错乱；手工 workflow 全流程（含审批、cron、事件触发）双端通过。

**已登记不修（本 Phase 范围）**：`EventAdmin.requeue` 游标回拨与在途 pump 竞态（低概率运维竞态，infra 审计 §3 P2）——登记到 Phase 8 的已知问题清单。

---

# Phase 6 — 容量治理与资源安全

## Task 6.1: 登录/注册限流与失败锁定

- [ ] **问题**：`src/web/server/auth/routes.ts:58-94` 登录无限流（复核精确），bcrypt ~100ms/次 CPU——暴力破解 + CPU DoS 双暴露；注册 409"该邮箱已注册"可枚举用户（`:34-38`）。

**文件：**
- Modify: `src/web/server/auth/routes.ts`
- Create: `src/web/server/auth/rate-limit.ts`（内存滑窗，直接抽用现有实现 `src/web/server/api/workflow-api-router.ts:87-100` 的 `SHARE_RATE_LIMIT`/`shareRateLimited`，复核确认存在）

**修改：** 登录/注册：每 IP 每分钟 10 次、每邮箱每小时 20 次；登录连续失败 5 次锁 15 分钟（内存 Map，单实例语义注释声明）。注册响应统一为"如邮箱可用将收到确认"式文案（消除枚举）或保留 409 但依赖限流（推荐改文案）。

**验证：** curl 循环 15 次登录 → 第 11 次起 429；锁定生效；正常登录回归；01-auth spec 更新后通过。

## Task 6.2: 上传内存风险收敛

- [ ] **问题**（复核精确）：multer 内存存储 50MB 无并发闸（`upload-router.ts:41-44`），叠加 `express.json({limit:'50mb'})`（`src/web/server/index.ts:165`）。

**文件：** Modify `src/web/server/api/upload-router.ts:41-44`、`src/web/server/index.ts:165`

**修改：** multer 改 disk storage（落 `<DATA_ROOT>/tmp/uploads/`，用后删除）或保留内存 + 进程级信号量（并发 ≤4，超出 429）；`express.json` 限额收紧到业务实际值（评估后定，如 5MB），大文件一律 multipart。

**验证：** 并发 10 个 50MB 上传进程内存平稳或正确 429；既有上传 e2e 通过。

## Task 6.3: SSE/WS 连接上限与 WS 背压

- [ ] **问题**（复核确认）：SSE 无连接数控制（`workflow-api-router.ts:129-217`，免登录 share 面 :417+）；WS 无 per-user 上限、无出站背压（`web-event-emitter.ts:96-104` 直调 `client.send`）。**复核技术提醒**：`WsClient` 接口（`web-event-emitter.ts:19-23`）只有 `send/isAlive`，无 `bufferedAmount`——背压需扩展该接口并改 `ws-server.ts:26-30` 的包装层（两个文件方案已列）。

**文件：**
- Modify: `src/web/server/api/workflow-api-router.ts:129-217,417+`
- Modify: `src/web/server/platform/web-event-emitter.ts:19-23,96-104`、`src/web/server/ws/ws-server.ts:26-30`

**修改：**
1. SSE：每 token/每 IP 连接上限 5，超限 429。
2. WS：每用户连接上限 10（超出踢最旧）；`WsClient` 接口加 `bufferedAmount(): number`，发送前检查高水位（4MB），超限丢弃非关键 delta 并记日志。
3. 断线补偿：WS 重连后前端对进行中的 run 主动拉一次快照（复用 SSE replay 的只读快照接口）。

**验证：** 压测：单用户 15 个 WS 连接→第 11 个起被拒/踢旧；慢客户端下内存不持续上涨；e2e tab-bar/chat 流式用例通过。

## Task 6.4: LLM 并发信号量与 provider 限流

- [ ] **问题**：LLM 调用无队列/信号量/熔断；agent 轮次无全局/每用户并发上限。复核确认调用点：`simple-llm.ts:49`（generateText）、`src/core/platform/services/ai-call.ts`、`src/core/packs/chat/services/chat.service.ts`（经 createProvider）；信号量范本真实存在：`src/core/platform/services/favicon.service.ts:46-67` Semaphore 类。三 harness 入口：`src/core/packs/chat/services/system-agent/system-agent.service.ts`、`src/core/platform/episode-production/agent/ep-agent-harness.service.ts`、`src/core/packs/domain-learning/services/dl-agent-harness.service.ts`。

**文件：**
- Create: `src/core/platform/services/llm-concurrency.ts`（信号量：per-user N1、全局 N2）
- Modify: 上述 LLM 调用点与三 harness 入口

**修改：** 默认值：per-user LLM 并发 4、全局 32（env 可调）；agent 轮次 per-user 1、全局 10。超限：LLM 调用排队（60s 超时），agent 轮次返回"当前任务过多"。

**验证：** 单测信号量语义；压测双用户各 10 并发 LLM 请求→全局不超上限、无 429 风暴；chat/agent 回归。

## Task 6.5: ffmpeg 子进程队列

- [ ] **问题**：compose/analysis 各自直接起 ffmpeg，N 用户同时导出 = N 个 ffmpeg 抢 CPU。复核确认的调用点：`compose/ffmpeg-assembler.service.ts:11`、`audio-mix.service.ts:9`、`transition.service.ts:8`、`scene-video.service.ts:10`、`shot-video.service.ts:10`、`reference-video/ffmpeg-helpers.ts:20`；`episode-mp4-exporter.runner.ts:16` 实际在 `src/core/packs/episode-production/handlers/compose/`（复核修正路径）。**实现提示**：audio-mix/transition/scene-video/shot-video 四家都委托 `FfmpegAssemblerService.runFFmpegCommand`——包装 assembler 一点即可覆盖四处；keyframe 目录无 ffmpeg 调用（初稿误列）。

**文件：**
- Create: `src/core/platform/services/process-queue.ts`（通用子进程并发队列，全局并发默认 2，env 可调）
- Modify: `FfmpegAssemblerService.runFFmpegCommand`（一处包装覆盖四 service）+ `ffmpeg-helpers.ts:20` + `episode-mp4-exporter.runner.ts:16`

**注意**：runner 文件头自述"Web 端不该 import 此文件（需 server-side ffmpeg-static 实现作 follow-up）"——Web 端 MP4 导出 runner 本身尚缺适配，排队包装不解决该缺口；Web 导出可用性在 Task 7.6 登记跟踪。

**验证：** 并发 4 个合成任务→同时运行 ffmpeg ≤2，其余排队；结果正确；PC 导出回归。

## Task 6.6: JWT 停用用户即时生效 + attachUser 统一注入 ALS

- [ ] **问题**：a) `src/web/server/auth/middleware.ts:19-26`（复核精确）attachUser 只验签不查库，`isActive=false` 用户老 token 在 7 天 TTL 内仍可用；b)（复核补入，模块审计 §1.5"结构性脆弱"）attachUser 不注入 ALS，租户上下文靠每个 router 自觉 `runWithUserAsync`——新增路由漏包即静默退化为 `user_id IS NULL`。

**文件：** Modify `src/web/server/auth/middleware.ts`

**修改：**
1. attachUser 查库校验 isActive（主键查询，可加 60s 内存缓存）；停用用户 requireAuth 返回 401。
2. attachUser 解析出 user 后直接 `runWithUser(userId, () => next())`（ALS 贯穿后续整条 middleware/handler 链），使全链路默认有租户上下文；保留各 router 的显式 `runWithUserAsync` 作为双保险（嵌套 run 语义相同无副作用）。改造后抽查三条路由确认无回归。

**验证：** 停用用户旧 token 调 `/api/ipc` → 401；正常用户无感；新增一条测试路由不包 runWithUserAsync 也能拿到正确租户（验证兜底生效）。

## Task 6.7: CacheService 租户前缀

- [ ] **问题**（复核精确）：`src/core/platform/services/cache.service.ts:64`（清理定时器）、`:80`（`static createKey`）——缓存键不含租户，串缓存取决于调用方自觉。

**文件：** Modify `src/core/platform/services/cache.service.ts:64-80` + 全量核查调用方

**修改：** `createKey` 注入当前 ALS userId 前缀（无 ALS 时 `_global`）；确属全局共享的缓存显式传 `scope:'global'` 豁免。

**验证：** 单测：A 写入 B 读不到；global 声明双端可见。

## Task 6.8: EP 审批持久化与重启恢复（复核修正设计）

- [ ] **问题**：EP 审批卡内存 ApprovalStore（`ep-agent-harness.service.ts:317` ApprovalCoordinator 未传 store），Web 重启后挂起选择卡蒸发，靠 30min 超时收敛。背景（复核确认）：`ApprovalStore` 接口在 `agent-runtime/approval.ts:46`；`agent-service.ts:836-849` 的 `recoverOrphanApprovals` 已在 agent-service 构造时调用（:248），但整个 `AgentRuntimeImpl` 门面 `initAgentRuntime` 无调用方，EP harness 直驱 LoopRunner 享受不到。

**文件：**
- Create: DB 持久 ApprovalStore 实现（`src/core/platform/agent-runtime/`）
- Modify: `src/core/platform/episode-production/agent/ep-agent-harness.service.ts:317-335`

**修改（复核重大提醒已并入）**：仅 DB store **不足以**实现"重启后卡可决策"——挂起轮的 Promise resolve 随进程消亡。完整设计：①DB 存挂起审批（run/scope/payload/deadline）；②boot 时把残留审批重新 emit `choice:request` 事件让前端重新展示选择卡（而非 recoverOrphanApprovals 的"按忽略清理"语义——两者相反，勿直接移植）；③用户决策经新审批 id 路由重启后继续轮次（续跑走 agent_sessions 落盘历史重放，`host-kit.ts:432-459` 已有机制）。若工期紧张，可分两期：一期 DB store + 重启后明确标记"已过期请重新发起"（诚实失败）；二期续跑恢复。

**验证：** Web：审批挂起中重启 server→选择卡按设计重现/标记；超时回收正常；PC 回归审批流。

**Phase 6 验收**：压测脚本（并发上传/LLM/WS/合成）通过；认证与管理面 e2e 更新后全绿。

---

# Phase 7 — Web 功能补全（降级面）

## Task 7.1: 通用上传通道

- [ ] **问题**：`/api/upload` 只有 panorama/main-image 两条——KB 文件型文档（`knowledge-base.service.ts:331` `fs.copyFile(file.path, …)`）、longwriting 素材（`material-processor.service.ts:31-33` extractFromFile）、ep 参考视频（`handlers/narrative/reference-video.handler.ts:38-68` handleAnalyze 只收服务器路径）均无 Web 上传入口（复核全部确认）。voice 样本已在 Task 1.2 单列。

**文件：**
- Modify: `src/web/server/api/upload-router.ts`（抽象 `/api/upload/:category` 白名单）
- Modify: 上述 3 个 service/handler 增加"从相对路径处理"分支
- Create: 渲染端上传 helper（`src/renderer/src/api/`）

**修改：** 白名单表 `UPLOAD_CATEGORIES = { document: {mimes, maxMB:50, dest:'knowledge-base/inbox'}, material: {...}, 'reference-video': {mimes:视频, maxMB:200, dest:'episode-production/reference-videos'} }`；落盘 `<dataPath>/<dest>/<uuid>.<ext>` 返回相对路径；业务 service Web 分支从相对路径处理，桌面分支保留本地路径。

**验证：** 四类文件 Web 上传→处理→可见全链路手工通过；PC 本地文件选择回归。

## Task 7.2: 文件选择器 Web 替代交互

- [ ] **问题**（复核全部精确）：`voice.selectFile`（`useVoice.ts:282`）、`image.selectFile`（`useImage.ts:695`）、`knowledgeBase.selectFiles`（`stores/knowledge-base.ts:520`）Web 端返回"仅桌面端可用"。

**文件：** Modify 上述 3 个渲染端文件 + Create `src/renderer/src/composables/use-pick-upload.ts`

**修改：** 统一封装 `pickAndUpload(accept, category)` composable：Web 端 `<input type="file">` 选文件→上传→走相对路径分支；桌面端保持原生对话框。三个调用点接入。

**验证：** Web 端三处选择文件可用；PC 原生对话框回归。

## Task 7.3: diary PDF 导出 Web 替代

- [ ] **问题**（复核确认）：`diary-export.service.ts:6`（import type BrowserWindow）、`:82-96`（运行期 require electron + printToPDF）；handler 门禁已在 `diary.handler.ts:145-148`。范本：`dl-lesson-export.service.ts:150-160` 的 HTML 降级（复核确认真实）。

**文件：** Modify `src/core/packs/diary/services/diary-export.service.ts`、`src/core/packs/diary/handlers/diary.handler.ts:145-148`

**修改（推荐 b）**：a) 服务端 puppeteer（重，增依赖与容器字体）；b) Web 端复用 HTML 导出 + 前端新窗口 `window.print()`。**动工前确认选型**（puppeteer 显著增大部署镜像）。

**验证：** Web 端日记导出 PDF（打印面板）可用；PC printToPDF 回归。

## Task 7.4: 桌面语义 UI 的 Web 降级 + 杂项修复

- [ ] **文件与修改（复核全部确认/修正）：**
1. `src/renderer/src/views/Settings.vue:1695-1787`：dataPath 整组 UI（openFolder/getConfig/数据大小，复核确认 :1695 起）Web 端隐藏（`isElectronRenderer()` 分叉）。
2. `src/renderer/src/components/common/ErrorToast.vue:80`：`invoke('error:retry')`——复核确认**全仓 grep `error:retry` 无任何服务端 handler 注册**（仅 `src/electron/services/error.service.ts:203` 的 webContents.send 反向使用），即该调用双端都是死调用。修法：移除该死调用或实现真正的 `error:retry` channel（建议先移除重试按钮的 invoke，改为前端重渲染重试）。
3. 旧 render 五通道（`render/video.handler.ts:75-77,186-189,432-434`、`render/keyframe.handler.ts:300-304`、`render/audio.handler.ts:121-124`，均 `getBrowserWindowFromEvent` + "窗口不存在"，复核精确）：评估是否仍活跃——已被新链路取代则 Web 端隐藏对应按钮；仍需则改走 `getEventEmitter()`。
4. storyboard 进度事件（`narrative/storyboard.handler.ts:246-263` `ep:storyboard-progress`、`:421-428` `ep:cogen-progress`，均 `window.webContents.send`，复核精确）：改走 `getEventEmitter().emit`。
5. `src/core/packs/portrait/services/portrait.service.ts:1497-1499`：editImage 直接 `fs.readFileSync(variant.imagePath)` 未过 resolveAssetPath（双端 bug，顺带修）。
6. `portrait.service.ts:1596,1685,1695`：三处 `return { success: true, filePath: outputPath }` 绝对路径——Web 端改返回 `/assets/` URL 或触发浏览器下载。

**验证：** Web 设置页无桌面区块、错误重试可用、分镜生成有进度、人像导出可下载；PC 全回归。

## Task 7.5: 上传/下载语义杂项

- [ ] **文件与修改：**
1. `src/electron/ipc/handlers/image.handler.ts:281-283` `image:download`：**复核确认该问题已被修过**（当前已是 `if (!isElectron) return { success: true, data: image.filePath }` 并注释走 /assets）——降级为回归确认项；残留风险：历史数据行若存绝对路径仍原样返回（在 Task 4.3 的 user-asset :107 一并处理）。
2. `src/renderer/src/components/chat/ExportToObsidianDialog.vue`（electronAPI 调用恰好 5 处：232/263/291/341/403；唯一使用方 MessageItem.vue:369）：Web 端隐藏入口（配合 Task 1.6 服务端门禁）。
3. 打开本地文件夹：`src/renderer/src/views/asset/AssetCenter.vue:941`（api.assets.openFolder，复核精确）、`StageComposeTab.vue`（**复核修正：打开目录逻辑在 :341-345 onOpenFolder + 模板按钮 :107**，初稿 :327 已漂移）——Web 端隐藏或改"下载"。
4. 回归确认（复核结论：已修）：`asset.handler.ts` 的 `asset:download`/`open-folder`/`group-open-folder` 三处现均已有 isElectron 守卫（:135-137,170-172,185-187），原审计 compat P1-4 记录已过时——双端回归确认即可。

**验证：** Web 端 UI 无死按钮；PC 回归。

## Task 7.6: 其余降级面登记处理（复核补入）

- [ ] **文件与修改：**
1. **全局快捷键等直推事件无 Web 通道**（`shortcut:triggered`/`autosave:status`/`error:show`，`webContents.send` 直推）：Web 端快捷键改为浏览器内 keydown 监听（renderer 层实现），autosave 状态走 `getEventEmitter()`，error:show 走现有 ErrorToast 本地逻辑。逐点确认后改造或隐藏。
2. **`local-image://` 绝对路径无法转换**（`web-path.provider.ts:91-115` 三斜杠形式原样返回）：前端图片加载失败兜底（占位图 + 提示）；治本靠 DB 路径清洗迁移（存量绝对路径转相对，评估数据量后决定）。
3. **asset-center 长图渲染/固化、下载仅桌面**：Web 端隐藏或降级（renderAssetPreview report 模式已有 HTML 降级 `asset.service.ts:463-470`，materializeTextAsImage Web 返回 null :505——确认 UI 对 null 的兜底）。
4. **longwriting md/word 导出**：桌面专属已有守卫（`longwriting.handler.ts:1759-1761,1831-1833`），Web 端改"导出到用户目录 + /assets 下载"或隐藏按钮。
5. **长 HTTP IPC**（`dl:agent-send`、ep agent 整轮 await，分钟级无断线续传）：登记为已知限制；Web 部署文档注明反向代理超时需 ≥ 35min 或逐个改造为"异步启动 + 事件推送"模式（大改，排期到后续迭代）。

**验证：** 逐项双端走查；部署文档同步。

**Phase 7 验收**：Web 端 12 个业务包逐页走查无"仅桌面端可用"死按钮（或已隐藏）；e2e 全量通过。

---

# Phase 8 — 治理、清理与防回归

## Task 8.1: 删除 admin-vben 残骸

- [ ] **复核确认**：目录实测 2.0G；`git ls-files` 仅跟踪 `.eslintcache` 一个文件；grep 全仓代码零引用（仅命中审计/方案文档）。

**文件：** Delete `src/web/admin-vben/`

**验证：** 删除后 `npm run web:client:build` 与 `npm run build` 均通过。

## Task 8.2: channel-map 生成器接入 CI

- [ ] **问题**：`src/web/client/channel-map.ts`（复核确认现 914 行、映射约 780+ 条）靠人工与 preload 同步。复核确认 `scripts/` 下**目前没有任何 channel-map 生成脚本**——纯新建。

**文件：**
- Create: `scripts/gen-channel-map.cjs`（从 `src/preload/index.ts` 静态分析 namespace.method → channel 推导，与 channel-map 对拍）
- Modify: CI 配置（对拍不一致即失败）

**验证：** 人为删一条映射→CI 红；恢复→绿。

## Task 8.3: web e2e 接入 CI + 补 workflow spec

- [ ] **文件：** CI 配置（起 PG 服务容器 + web server + vite + `npm run test:e2e:web`）；Create `tests/e2e/web/21-workflow.spec.ts`（**复核发现当前无任何 workflow Web spec**，Phase 5 的验收缺口在此补齐：run 提交/挂起/审批/取消/队列语义各一条）

**验证：** CI 全量 spec 通过；失败有截图/视频留档。

## Task 8.4: 文档与认知修正

- [ ] **文件与修改：**
1. `src/web/server/index.ts:592` 注释（原文语境是向量库选型"Web 容器可水平扩展（无本地 lancedb 状态）"，复核确认）——**改写整段**而非单句替换：说明当前仅支持单实例部署（事件总线无 SKIP LOCKED、限流为单实例内存、WS 需亲和性），多实例路线图见审计 §2.7。
2. `docs/` 新增 Web 部署/运维文档：PG 要求、env 清单（DATA_ROOT/JWT_SECRET/SECURE_STORAGE_KEY/VECTOR_STORE/WEB_INVITE_CODE）、反向代理超时要求（Task 7.6.5）、备份策略。
3. AGENTS.md 若涉及双端约定，同步更新。

**验证：** 文档与代码行为逐条对照一致。

## Task 8.5: 顺手项与显式 out-of-scope 声明

- [ ] **顺手小项：**
1. `isElectronRenderer()` 在 4 处重复定义（`asset-url.ts:24`、`file-saver.ts:24`、`main-image-upload.ts:23`、`panorama-upload.ts:23`）——收敛到 `asset-url.ts` 一处导出。
2. 零引用残留依赖评估清理：`tesseract.js`、`canvas`、`electron-log`、`electron-store`（src 下零引用；注意 `canvas`/`tesseract.js` 可能有运行期动态 require，删除前先 grep 确认并跑双端构建）。
3. `assets-router.ts` 不校验 symlink（低危残留）——登记或顺手加 realpath 校验。
4. `/api/agents/skills` 当前免登录（`src/agents/api/router.ts:23-24`）——加 requireAuth 或显式声明公开。
- [ ] **显式 out-of-scope（本期不做，声明原因）：**
1. **契约治理**（113 文件 665 处直调 electronAPI、隐式 any、IPC_CHANNELS 覆盖 ~40%）：工作量大且不阻塞上线，列为独立专项。
2. **迁移双写负担**（Electron/Web 两处手工同构）：Phase 3 起每次迁移需两处登记，纪律维持；收敛为单一注册表列为后续重构。
3. **多实例部署**（审计 §2.7 清单：跨实例取消、boot fencing、cron lease、事件/WS 外置总线）：单实例先行，文档声明。
4. **token 用量配额闭环**（有统计无配额）：依赖 D1 落地后的计费设计。
5. **运行时参数 reload hook**（boot 读一次）：维持"改完需重启" + 设置页提示。
6. **`AgentRuntimeImpl` 门面未接线**（ownerUserId 校验为死代码）：本期按 Task 4.5 在各 harness 入口补校验；门面接线/下沉为 HostKit 强制骨架列为后续架构项。
- [ ] **决策点 D2（需产品确认）**：多租户密钥为服务端单主密钥集中托管（`WebSecureStorage`），加密只防 DB dump 不防租户互用——Task 3.1 的配置隔离落地后风险面大幅收敛；是否进一步做按用户加密（信封加密）列为 D2，建议本期不做。

---

# 全量验收矩阵（最终 DoD）

| 维度 | 验收项 | 命令/手法 |
|---|---|---|
| 启动 | web server + client 冷启动全链路 | Phase 0 验证节 |
| 单元 | 全部单测 | `npm run test:unit` |
| e2e | Web 21+1 spec 全绿 | `npm run test:e2e:web` |
| PC 回归 | PC 单测 + 手工核心流程 | `npm run test:unit:sqlite` + pc:dev 走查 |
| 安全 | 双用户交叉越权测试矩阵（Phase 1/3/4 全部场景） | curl 矩阵脚本（固化为 `scripts/web-security-matrix.sh`） |
| 并发 | Phase 5 混沌脚本 + Phase 6 压测 | 各 Task 验证节 |
| 类型/lint | 无新增错误 | `npm run typecheck && npm run lint` |

# 执行顺序与依赖

```
Phase 0（启动阻断）→ 一切的前提
Phase 1（安全收口）→ Task 1.2 与 7.1 的上传抽象可合并实施
Phase 2（多租户正确性）→ Phase 4 的校验依赖其 scoped 语义
Phase 3（配置隔离）→ 依赖 D1 决策；Task 3.3 角色鉴权是 Phase 6 部分项前提
Phase 4（IDOR + 向量隔离）→ 可与 3 并行
Phase 5（引擎竞态与公平性）→ 独立
Phase 6（容量）→ 上线前必须
Phase 7（功能补全）→ 可与 3-6 并行（前端为主）
Phase 8（治理）→ 收尾，CI 防回归兜底
```

# 风险与回滚

- **Task 0.1 entity 类型替换**：SQLite 侧 timestamp/datetime 同为 NUMERIC affinity，无表重建；回滚 git revert。PC 升级前建议自动备份用户 DB。
- **Task 3.1 配置六表迁移**：既有行变"系统默认"需公告；迁移幂等可重入、不删数据，可回滚。读侧务必用"裸 qb + 手工 OR"（scoped 无法表达 OR，见 Global Constraints）。
- **Phase 5 引擎竞态修复**：核心调度路径，每项独立 commit + 独立并发单测，可单项 revert。
- **Phase 1 路径守卫**：误伤合法路径的风险——每个 Task 的 PC 回归验证执行后再合并。

---

# 附：v2 复核修订记录

复核方式：3 个独立只读 agent 逐条对照真实代码验证（Phase 0-2 / 3-5 / 6-8+完整性），结论已合并入正文。主要修订：

**硬错误修正（7 处）**：
1. Task 1.5：translation.service.ts 路径 → `src/core/platform/services/`（非 packs 下）；handler 在 `src/electron/ipc/handlers/`
2. Task 1.7：skill.service.ts 路径 → `src/core/platform/workflow/skills/`
3. Task 1.9：agent 侧路径校验真实位置 `ep-agent-actions.ts:1495-1507`（初稿 :1311-1319 是分镜视频代码）；resolveOutputPath :134-155
4. Task 2.6：video-generation.service.ts 路径 → `src/core/platform/episode-production/render/video/`
5. Task 2.10：memory-flywheel.ts 路径 → `src/core/platform/agent-runtime/memory/`
6. Task 3.2：datasource-executor.service.ts 路径 → `src/core/platform/workflow/datasource/`
7. Phase 5：workflow-engine.service.ts 全文路径补 `engine/` 层级

**技术路线修正（2 处）**：
8. Task 3.1 / 2.9：初稿"scoped.qb + 括号 OR 组"写法不成立（where 代理以 AND 重挂租户条件会抵消 OR，系统默认行将对全员不可见）——改为对齐 app/info-source 范本的"裸 qb + 手工 OR"；Global Constraints 已写入该约束
9. Task 6.8：初稿"移植 recoverOrphanApprovals"语义与目标相反（boot 清理 ≠ 恢复可决策）——重写为"DB store + 重启重新 emit 选择卡"两期设计

**事实修正（若干）**：Task 2.9 entity 已有 builtin 列无需迁移；Task 2.5 测试目录为 event-system；Task 4.3 裸用实测 147 处、storyboard-cogen 真实裸查询行号；Task 4.5 room.handler :62-69；Task 6.5 runner 路径与"assembler 一处包装覆盖四 service"提示；Task 7.5.1 image:download 问题已被修过降级为回归确认；Task 7.5.3 StageComposeTab 行号 :341-345；Task 8.2 channel-map 现 914 行且生成器不存在；asset.handler 三处守卫已存在（原审计记录过时）；e2e 编号 11 重复、无 workflow spec、README 过时。

**遗漏补入（6 项，全部来自审计文档）**：
10. Task 2.11 DiaryService 单例路径缓存串租户（模块审计 §4）
11. Task 4.6 KB 向量库与倒排索引用户级隔离（模块审计 §2）
12. Task 5.6 workflow run 每用户配额 + 队列有界 + 挂起内存上限（infra 审计 §2）
13. Task 6.6 合并 attachUser 统一注入 ALS（模块审计 §1.5 结构性脆弱）
14. Task 7.6 杂项降级面（快捷键直推、local-image 绝对路径、asset-center 长图、longwriting 导出、长 HTTP 限制）
15. Task 8.5 顺手项与 out-of-scope 显式声明（含 /api/agents 免登录、单主密钥 D2、契约治理/迁移双写/多实例 defer）
