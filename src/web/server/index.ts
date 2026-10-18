/**
 * Web Server 入口
 * @module web/server/index
 * @description 启动一个 Node HTTP 服务，提供：
 *              - /api/auth/*       注册 / 登录 / 退出 / 获取当前用户
 *              - /api/ipc/<ch>     通用 IPC 桥，要求登录
 *              - /assets/*         用户文件，要求登录，按 userId 隔离
 *              - /events           WebSocket，订阅业务事件
 *              - /                 静态资源（生产模式 dist/renderer-web）
 *
 * 数据库：单 PostgreSQL 库（DB_TYPE=postgres），多租户用 user_id 列做行级隔离。
 *        每张业务表都有 user_id 列，BaseRepository 在所有查询/写入前自动按
 *        当前 ALS userId 过滤 / 填充。
 */

import 'reflect-metadata'
// 加载 .env.local 环境变量（开发环境）
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as http from 'http'
import * as path from 'path'
import * as fs from 'fs'
import express from 'express'
import cookieParser from 'cookie-parser'

import { configureJwtSecret } from './auth/jwt'
import { attachUser } from './auth/middleware'
import authRouter from './auth/routes'
import ipcRouter from './api/ipc-router'
import assetsRouter from './api/assets-router'
import uploadRouter from './api/upload-router'
// spec 2026-05-09 ep-redesign §3.2 D4 · Agent / Skill HTTP API
import agentsRouter from '../../agents/api/router'
import { isModuleEnabled } from '@shared/constants/features'
// C3 工作流 REST API（invoke/stop/SSE）
import workflowApiRouter, { createWebhookTriggerRouter } from './api/workflow-api-router'
import { attachWebSocketServer } from './ws/ws-server'

import { WebPathProvider } from './platform/web-path.provider'
import { WebSocketEventEmitter } from './platform/web-event-emitter'
import { WebSecureStorage } from './platform/web-secure-storage'
import { WebDatabaseManager } from './platform/web-database-manager'

// 这三个必须 static import：tsx 在 ESM/CJS 混合下，static 与 dynamic
// 解析 '@core/...' 可能产生**两份**模块实例，导致 dynamic 端 register 的
// _accessor 在 static 端（auth/routes 等）看不到。统一走 static 即可。
import { createDataSource } from '@core/database/data-source'
import { setStrictTenantWrites } from '@core/database/base-repository'
import { ensureUsersTable } from '@core/database/migrations/ensure-users-table'
import { ensureUserIdColumns } from '@core/database/migrations/ensure-user-id-columns'
import { ensureAssetBindingSourceType } from '@core/database/migrations/ensure-asset-binding-source-type'
import { createAssetImage } from '@core/database/migrations/create-asset-image'
import { createStoryboardKeyframe } from '@core/database/migrations/create-storyboard-keyframe'
import { ensureScenePropItemBinding } from '@core/database/migrations/scene-prop-item-binding'
import { expandEpisodeStatus } from '@core/database/migrations/expand-episode-status'
import { stripLwImageFields } from '@core/database/migrations/strip-lw-image-fields'
import { addStoryboardBackgroundRef } from '@core/database/migrations/add-storyboard-background-ref'
import { relaxBindingLwIdNullable } from '@core/database/migrations/relax-binding-lw-id-nullable'
import { addNarrativeBindingFks } from '@core/database/migrations/add-narrative-binding-fks'
import { relaxEpisodeScriptOutlineId } from '@core/database/migrations/relax-episode-script-outline-id'
import { relaxVideoEpisodeOutlineId } from '@core/database/migrations/relax-video-episode-outline-id'
import { addKeyframeUserPromptOverride } from '@core/database/migrations/add-keyframe-user-prompt-override'
import { addCharacterBindingExtraFields } from '@core/database/migrations/add-character-binding-extra-fields'
import { addCharacterBindingRace } from '@core/database/migrations/add-character-binding-race'
import { addPortraitVariantFraming } from '@core/database/migrations/add-portrait-variant-framing'
import { createPortraitPromptTemplates } from '@core/database/migrations/create-portrait-prompt-templates'
import { PortraitTemplateSeederService } from '@core/platform/services/portrait-template-seeder.service'
import { addStoryboardKeyframeCount } from '@core/database/migrations/add-storyboard-keyframe-count'
import { addKbDocumentSource } from '@core/database/migrations/add-kb-document-source'
import { addDiaryDeletedAt } from '@core/database/migrations/add-diary-deleted-at'
import { addDiaryFolderBrainOptIn } from '@core/database/migrations/add-diary-folder-brain-opt-in'
import { addDiaryAttachmentDescription } from '@core/database/migrations/add-diary-attachment-description'
import { addKeyframeReferenceOverrides } from '@core/database/migrations/add-keyframe-reference-overrides'
import { addStoryboardUseKeyframes } from '@core/database/migrations/add-storyboard-use-keyframes'
import { addEpisodeScriptMetadata } from '@core/database/migrations/add-episode-script-metadata'
import { addStoryboardIncludeInFinal } from '@core/database/migrations/add-storyboard-include-in-final'
import { addEpComposeClosure } from '@core/database/migrations/add-ep-compose-closure'
import { addStoryboardReferenceImageIds } from '@core/database/migrations/add-storyboard-reference-image-ids'
import { addBindingReferenceImagePath } from '@core/database/migrations/add-binding-reference-image-path'
import { addStoryboardMetadata } from '@core/database/migrations/add-storyboard-metadata'
import { addCharacterBindingReferenceSet } from '@core/database/migrations/add-character-binding-reference-set'
import { addCharacterBindingPreset } from '@core/database/migrations/add-character-binding-preset'
import { seedPresetDigitalHumans } from '@core/database/migrations/seed-preset-digital-humans'
import { addUserAssets } from '@core/database/migrations/add-user-assets'
import { addReferenceVideoAnalyses } from '@core/database/migrations/add-reference-video-analyses'
import { addStoryboardLocationItemBindings } from '@core/database/migrations/add-storyboard-location-item-bindings'
import { addAssetImageVariantCategoryAndMigrate } from '@core/database/migrations/add-asset-image-variant-category-and-migrate'
import { addLocationBindingExtraFields } from '@core/database/migrations/add-location-binding-extra-fields'
import { addItemBindingStyleAnchors } from '@core/database/migrations/add-item-binding-style-anchors'
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import { LanceDBService } from '@core/platform/services/lance-db.service'
import { initVectorStore } from '@core/platform/services/vector/registry'
import { ensurePgvectorKbVectors } from '@core/database/migrations/ensure-pgvector-kb-vectors'
import { registerAllWebChannels } from './api/register-channels'

interface ServerConfig {
  port: number
  host: string
  rootDataPath: string
  jwtSecret: string
  rendererDir: string | null
  /**
   * Express trust proxy 设置（review M2）：反代部署（nginx 等）不设置时 req.ip
   * 恒为代理地址——全体用户共享限流桶，单 IP 即可打满登录/注册限流（自我 DoS）。
   * WEB_TRUST_PROXY：'true'/'1' 信任所有代理头（仅当流量入口就是本服务）、
   * 'loopback' 仅信任本机反代、'uniquelocal' 私网反代、数字 = 信任的代理跳数；
   * 缺省 false（直连部署，行为不变）。多实例部署的限流需换 Redis（内存桶不共享）。
   */
  trustProxy: boolean | number | string
}

function readConfig(): ServerConfig {
  return {
    // 默认 0.0.0.0：局域网设备可直接访问 4201 端口（可被 vite 代理或 mobile 直连）
    // 私网部署可设 HOST=127.0.0.1 收回到仅本机
    host: process.env.HOST ?? '0.0.0.0',
    port: Number(process.env.PORT ?? 4201),
    rootDataPath: path.resolve(process.env.DATA_ROOT ?? './data'),
    jwtSecret: process.env.JWT_SECRET ?? defaultDevSecret(),
    rendererDir: resolveRendererDir(),
    trustProxy: parseTrustProxy(process.env.WEB_TRUST_PROXY),
  }
}

function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw === '') return false
  if (/^(true|1)$/i.test(raw)) return true
  if (/^[0-9]+$/.test(raw)) return Number(raw)
  return raw // 'loopback' | 'uniquelocal' | 具体 IP/CIDR
}

function defaultDevSecret(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产模式必须设置 JWT_SECRET 环境变量')
  }
  return 'dev-only-secret-do-not-use-in-prod'
}

function resolveRendererDir(): string | null {
  const candidates = [
    path.resolve('./out/renderer-web'),
    path.resolve('./out/renderer'),
    path.resolve('./dist/renderer-web'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

async function bootstrap(): Promise<void> {
  const cfg = readConfig()
  console.log('[web-server] 启动配置:', {
    host: cfg.host,
    port: cfg.port,
    rootDataPath: cfg.rootDataPath,
    rendererDir: cfg.rendererDir,
  })

  if (!fs.existsSync(cfg.rootDataPath)) {
    fs.mkdirSync(cfg.rootDataPath, { recursive: true })
  }

  // 1. 平台抽象层
  WebPathProvider.getInstance({ rootDataPath: cfg.rootDataPath })
  WebSocketEventEmitter.getInstance()
  // 全局 logger（spec 2026-05-10 e2e 阶段补充）— 初始化后所有模块用 createLogger 拿
  const { initLogger } = await import('@core/utils/logger')
  initLogger({ logDir: path.join(cfg.rootDataPath, 'logs'), level: 'info' })
  const secureStorage = WebSecureStorage.getInstance({ rootDataPath: cfg.rootDataPath })
  await secureStorage.initialize()

  configureJwtSecret(cfg.jwtSecret)

  // 2. 单 PG DataSource（多租户行级隔离：user_id 列 + BaseRepository ALS 注入）
  //
  // 复核修复：Web 是多租户部署，写入路径必须 fail-closed——此前无 ALS userId 时
  // 只 console.warn 并静默把 user_id 落 NULL（孤儿行，读路径又按 scope 过滤，
  // 数据会静默"隐身"）。这里开启严格模式：漏包 runWithUser 直接抛错暴露调用链。
  // （Electron 单用户不开启，行为不变，见 base-repository 的 strictTenantWrites。）
  setStrictTenantWrites(true)
  await initDatabase()

  // 3. 向量库（VECTOR_STORE=pgvector → PgVectorStore，否则 LanceDB 兜底）
  await initWebVectorStore(cfg.rootDataPath)

  // 4. 注册 IPC channel 处理器
  await registerAllWebChannels()

  // 5. Express
  const app = express()
  if (cfg.trustProxy !== false) {
    app.set('trust proxy', cfg.trustProxy)
    console.log(
      `[web] trust proxy = ${String(cfg.trustProxy)}（WEB_TRUST_PROXY；限流/日志按 X-Forwarded-For 取真实来源）`
    )
  }
  app.use(express.json({ limit: '50mb' }))
  app.use(cookieParser())
  app.use(attachUser)

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))
  app.use('/api/auth', authRouter)
  app.use('/api/ipc', ipcRouter)
  app.use('/api/upload', uploadRouter)
  // spec 2026-05-09 ep-redesign §3.2 D4 · Agent Skill HTTP API（EP 技能门面；EP 裁剪时不挂载）
  if (isModuleEnabled('episode-production')) {
    app.use('/api/agents', agentsRouter)
  }
  // C3 spec v2 §6 · 工作流 REST API
  app.use('/api/workflow', workflowApiRouter())
  // P0 片5 · Webhook 免签触发（POST /api/workflow/webhook/:token，token 即鉴权）
  app.use('/api/workflow/webhook', createWebhookTriggerRouter({
    definitions: {
      findByWebhookToken: async (token) => {
        const { getWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
        return getWorkflowSubsystem().definitionService.findByWebhookToken(token)
      },
    },
    runService: {
      startRun: async (input) => {
        const { getWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
        return getWorkflowSubsystem().runService.startRun(input as never)
      },
    },
  }))
  // 顺序关键：vite 构建产物（/assets/index-*.js 等哈希命名 chunk）必须先于
  // /assets 用户文件路由匹配——否则前端入口 JS 被 assetsRouter 401 拦截，
  // 浏览器收到 application/json 拒绝当 module 加载，整个页面空白。
  // express.static 命中的走静态返回；未命中（比如 /assets/<userId>/xxx 用户文件）
  // 会 next() 给 assetsRouter 接管。
  if (cfg.rendererDir) {
    app.use(express.static(cfg.rendererDir))
  }

  app.use('/assets', assetsRouter)

  if (cfg.rendererDir) {
    app.get('/*splat', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/events')) {
        return next()
      }
      res.sendFile(path.join(cfg.rendererDir!, 'index.html'))
    })
  }

  // 6. HTTP + WS
  const server = http.createServer(app)
  attachWebSocketServer(server)

  // 7. 启动声音复刻轮询调度器（boot resume + 持续轮询 training 任务）
  // 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.5
  try {
    const { VoiceCloneJobScheduler } = await import(
      '@core/platform/services/voice-clone-job-scheduler'
    )
    VoiceCloneJobScheduler.getInstance().start()
    console.log('[web-server] VoiceCloneJobScheduler 已启动')
  } catch (e: any) {
    console.warn(
      '[web-server] VoiceCloneJobScheduler 启动失败（不致命）:',
      e?.message ?? e,
    )
  }

  // 业务包子系统（第一期：包内核；失败不致命，与 Electron 端平级）。
  // 不依赖 workflow，放在工作流子系统初始化之前（P4 起业务包的 activate 会复用 workflow 等设施）。
  try {
    const { initPackSubsystem } = await import('@core/packs/kernel')
    const { loadBuiltinPacks } = await import('@core/packs/builtin-packs')
    await initPackSubsystem(await loadBuiltinPacks())
  } catch (e: any) {
    console.warn('[web-server] 业务包子系统启动失败（不致命）', e)
  }

  // 工作流子系统：引擎装配 + boot 恢复 + 触发调度器（失败不致命，与 Electron 端平级）
  try {
    const { initWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
    const { WsEventChannel } = await import('@core/platform/services/event-system/channels/ws.channel')
    // ws 通道（10-event-system §5.4）：平台事件 workflow.run.* → wf:run-event，
    // 按事件自带 userId 路由到目标用户的 WS 连接（不再依赖 emit 时刻 ALS 上下文）
    await initWorkflowSubsystem({ eventChannels: [new WsEventChannel()] })
  } catch (e: any) {
    console.warn('[web-server] 工作流子系统启动失败（不致命）', e)
  }

  server.listen(cfg.port, cfg.host, () => {
    console.log(`[web-server] 监听 http://${cfg.host}:${cfg.port}`)
  })

  const shutdown = async (signal: string) => {
    console.log(`[web-server] 收到 ${signal}，关闭...`)
    server.close()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

/**
 * 初始化单 PG DataSource。Web 端强制使用 PostgreSQL（与 Electron 端 SQLite 形成对比，
 * 但 entity / Repository 完全共用，TypeORM 自动适配方言）。
 */
async function initDatabase(): Promise<void> {
  const dbCfg = {
    type: 'postgres' as const,
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    username: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'the_bot_web',
    poolSize: Number(process.env.PG_POOL_SIZE ?? 10),
  }

  const ds = await createDataSource({ config: dbCfg })
  await ds.synchronize()  // 自动建表 + 加 user_id 列
  await ensureUsersTable(ds)
  // Web 多用户：仅保证 user_id 列存在；旧数据归属由迁移脚本处理
  await ensureUserIdColumns(ds)
  await ensureAssetBindingSourceType(ds)
  // P2 task 2: 新建 asset_image 表 + 把 *_binding.image_paths JSON 数据搬过来
  await createAssetImage(ds)
  // P2 task 3: 新建 storyboard_keyframe 表 + storyboard 多模式字段 + 搬 frame_image_id
  await createStoryboardKeyframe(ds)
  // P2 task 4: scene_props 加 item_binding_id + 按 prop_name 匹配 item_bindings.item_name 自动回填
  await ensureScenePropItemBinding(ds)
  // P2 task 5: EpisodeStatus 扩展：reviewing→composing + pending 按要素分流到 asset_prep
  await expandEpisodeStatus(ds)
  // P2 task 6: 长文图字段移除 —— portrait_id → character_bindings，generated_image_id → asset_image
  await stripLwImageFields(ds)
  // P3c task 1: storyboards 加 background_ref_image_id（spec §4.8）
  await addStoryboardBackgroundRef(ds)
  // P3c follow-up #60: character/location/item bindings 的 long_writing_*_id 改 nullable
  await relaxBindingLwIdNullable(ds)
  // P4-T1: 叙事域强约束 — scene_script/character/dialogue/action 加 binding_id FK
  await addNarrativeBindingFks(ds)
  // P7-bug-1: episode_scripts.outline_id 改 nullable（uploaded 模式无 outlineId）
  await relaxEpisodeScriptOutlineId(ds)
  // video_episodes.outline_id 改 nullable（uploaded 建集无 outlineId）
  await relaxVideoEpisodeOutlineId(ds)
  // FU5-A9-L4: storyboard_keyframe 加 user_prompt_override（spec §4.5.7 持久化用户提示词）
  await addKeyframeUserPromptOverride(ds)
  // FU5-C2: character_bindings 加身份块 + 声音情感 + 风格锚点字段（spec §3.1/3.4/3.6）
  await addCharacterBindingExtraFields(ds)
  // 角色资产 race（人种）字段：用于 AI 主图 / 派生图 prompt 拼接
  await addCharacterBindingRace(ds)
  // 人像变体 framing（取景范围 half/full）字段：新版人像设计（spec 2026-07-24）
  await addPortraitVariantFraming(ds)
  // 人像提示词模板表：新版人像设计（spec 2026-07-24）
  await createPortraitPromptTemplates(ds)
  // 分镜 keyframe_count 字段（前端编辑面板有按钮组但保存链路缺）
  await addStoryboardKeyframeCount(ds)
  // 知识库文档来源字段
  await addKbDocumentSource(ds)
  // 日记软删除列（spec 2026-09-24 日记增强 P0-1）：回收站依赖
  await addDiaryDeletedAt(ds)
  // 日记目录 brain_opt_in（spec 2026-09-24 日记增强 P2-1）：日记消化 opt-in 红线
  await addDiaryFolderBrainOptIn(ds)
  // 日记附件描述列（spec 2026-09-24 日记增强 P3-1）：贴图检索上下文
  await addDiaryAttachmentDescription(ds)
  // 关键帧 reference_overrides：用户精细挑图覆盖
  await addKeyframeReferenceOverrides(ds)
  // 分镜 use_keyframes：是否走关键帧流程（false → 直接用剧本描述 + 资产生成视频）
  await addStoryboardUseKeyframes(ds)
  // 剧本 metadata 列（提示词优化方案 §4.5）：保真覆盖度报告落库，UI 可见
  await addEpisodeScriptMetadata(ds)
  // 分镜 include_in_final：⑥ 合成时是否入最终成片（默认 1）
  await addStoryboardIncludeInFinal(ds)
  // 剧集状态闭环：video_episodes.composed_video_path + scene_scripts.narration_audio_path
  // （2026-09-16 review P0-CM2/P0-CM1）
  await addEpComposeClosure(ds)
  // S-07 导出留档：ep_export_history 表
  const { createEpExportHistory } = await import(
    '@core/database/migrations/create-ep-export-history'
  )
  await createEpExportHistory(ds)
  // S-09 用量落库：ai_call_stats 表
  const { createAiCallStats } = await import(
    '@core/database/migrations/create-ai-call-stats'
  )
  await createAiCallStats(ds)
  // 分镜 reference_image_ids：⑤ 制作 stage 用户为本分镜挑选资产参考图
  await addStoryboardReferenceImageIds(ds)
  // 资产 binding（character/location/item）reference_image_path：用户上传的参考图，主图生成时作为 reference
  await addBindingReferenceImagePath(ds)
  // 分镜 metadata：spec 2026-05-09 ep-redesign §3.2 B5 镜头语言层（焦距 / 光圈 / 相机风格 / 打光预设）
  await addStoryboardMetadata(ds)
  // 资产 binding 形象组：spec 2026-05-09 ep-redesign §3.2 D1 · multi-reference 替代 LoRA
  await addCharacterBindingReferenceSet(ds)
  // 数字人池：spec 2026-05-09 ep-redesign §3.2 D3 · 12 个预设角色
  await addCharacterBindingPreset(ds)
  await seedPresetDigitalHumans(ds)
  // 跨项目角色库：spec 2026-05-09 ep-redesign §3.2 D2 · user_assets 表
  await addUserAssets(ds)
  // 视频解析：spec 2026-05-09 ep-redesign §3.2 D5 · reference_video_analyses 表
  await addReferenceVideoAnalyses(ds)
  // 分镜 location_binding_ids + item_binding_ids：④ 分镜界面手动添加分镜内地点 / 物品（覆盖 scene 级推导）
  await addStoryboardLocationItemBindings(ds)
  // 地点资产图谱重设计（spec 2026-05-09）：location 旧三类变体合并到统一 'variant' category
  await addAssetImageVariantCategoryAndMigrate(ds)
  // FU5-C3: location_bindings 加场景类型 + 规模 + 氛围 + 风格锚点字段（spec §3.2/3.3）
  await addLocationBindingExtraFields(ds)
  // spec 2026-05-08: item_bindings 加 style_anchors（与 character/location 对齐）
  await addItemBindingStyleAnchors(ds)
  // spec 2026-05-08: video_episodes 加 story_era / story_region / story_background_extra
  const { addEpisodeStoryBackground } = await import(
    '@core/database/migrations/add-episode-story-background'
  )
  await addEpisodeStoryBackground(ds)
  // spec 2026-05-08：上传模式 binding 从伪 linked_lw 转 standalone
  const { repairUploadedBindingToStandalone } = await import(
    '@core/database/migrations/repair-uploaded-binding-to-standalone'
  )
  await repairUploadedBindingToStandalone(ds)

  // spec 2026-05-09 ep-redesign · e2e Bug C：老 storyboard.characters[].characterId
  // 修复（名字/长文 ID 反查 + expression 兜底；幂等）
  const { normalizeStoryboardCharacterIds } = await import(
    '@core/database/migrations/normalize-storyboard-character-ids'
  )
  await normalizeStoryboardCharacterIds(ds)
  // 2026-09-21 去重归一：合并同名重复资产 binding（角色/地点/物品），重指向引用后删多余行
  const { mergeDuplicateBindings } = await import(
    '@core/database/migrations/merge-duplicate-bindings'
  )
  await mergeDuplicateBindings(ds)
  // 2026-09-21 地点层级：location_bindings.parent_id（子区域挂父级，幂等）
  const { addLocationParentId } = await import(
    '@core/database/migrations/add-location-parent-id'
  )
  await addLocationParentId(ds)

  // 工作流引擎：definitions / runs / node_runs 三表（synchronize 已建表，此处幂等补索引；
  // 与 Electron 端 runMultiTenantMigrations 的调用保持同构）
  const { createWorkflowTables } = await import(
    '@core/database/migrations/create-workflow-tables'
  )
  await createWorkflowTables(ds)

  // Agent 公共运行时：agent_sessions / agent_memories 两表（与 Electron 端同构；23 号 §6）
  const { createAgentTables } = await import(
    '@core/database/migrations/create-agent-tables'
  )
  await createAgentTables(ds)

  // 设定集动态分组两表 + 人物别名列（P0-2026-09-09）
  const { createBibleTables } = await import('@core/database/migrations/create-bible-tables')
  await createBibleTables(ds)

  // 设定资产库：世界观库 + 角色 IP 库 8 表 + 既有实体血缘列（2026-09-24 P0；与 Electron 端同构）
  const { createLwLibraryTables } = await import(
    '@core/database/migrations/create-lw-library-tables'
  )
  await createLwLibraryTables(ds)

  // Run Journal（11 号 §4.1 E1）：运行事件日志（与 Electron 端同构）
  const { createWorkflowRunEvents } = await import(
    '@core/database/migrations/create-workflow-run-events'
  )
  await createWorkflowRunEvents(ds)

  // E2：workflow_node_runs.state_json（与 Electron 端同构）
  const { addWorkflowNodeRunStateJson } = await import(
    '@core/database/migrations/add-workflow-node-run-state-json'
  )
  await addWorkflowNodeRunStateJson(ds)

  // agent 轨迹 + 工具调用审计（25 号 M2 批1；与 Electron 端同构）
  const { createAgentTrajectories } = await import(
    '@core/database/migrations/create-agent-trajectories'
  )
  await createAgentTrajectories(ds)
  const { createAgentToolCalls } = await import(
    '@core/database/migrations/create-agent-tool-calls'
  )
  await createAgentToolCalls(ds)

  // M3 任务树 + 运行森林镜像列 + 知识飞轮（26 号批1；与 Electron 端同构）
  const { createAgentTasks } = await import('@core/database/migrations/create-agent-tasks')
  await createAgentTasks(ds)
  const { addWorkflowRunTaskColumns } = await import('@core/database/migrations/add-workflow-run-task-columns')
  await addWorkflowRunTaskColumns(ds)
  const { createAgentMemoryEntries } = await import('@core/database/migrations/create-agent-memory-entries')
  await createAgentMemoryEntries(ds)

  // KE-1 分层知识（34 号 v2）：scope 两列 + 嵌入增量/漂移列（与 Electron 端同构）
  const { addAgentMemoryScopeColumns } = await import('@core/database/migrations/add-agent-memory-scope-columns')
  await addAgentMemoryScopeColumns(ds)

  // 39 号：会话原始流水（append-only 审计）+ 工具产物归档（与 Electron 端同构）
  const { createAgentSessionEvents } = await import('@core/database/migrations/create-agent-session-events')
  await createAgentSessionEvents(ds)
  const { createAgentToolArtifacts } = await import('@core/database/migrations/create-agent-tool-artifacts')
  await createAgentToolArtifacts(ds)

  // M5 系统 agent（28 号批2）：对话级 Agent 模式开关（与 Electron 端同构）
  const { addDialogAgentEnabled } = await import('@core/database/migrations/add-dialog-agent-enabled')
  await addDialogAgentEnabled(ds)

  // 通用事件系统：platform_events / cursors / dead_letters 三表（与 Electron 端同构；10-event-system §4）
  const { createPlatformEventTables } = await import(
    '@core/database/migrations/create-platform-event-tables'
  )
  await createPlatformEventTables(ds)

  // 通知中心：user_notification_reads 用户已读状态表（与 Electron 端同构；已读独立落表）
  const { createUserNotificationReads } = await import(
    '@core/database/migrations/create-user-notification-reads'
  )
  await createUserNotificationReads(ds)

  // C3 免登录独立页：definitions 加 share_token 列 + 唯一索引（与 Electron 端同构）
  const { addWorkflowShareToken } = await import(
    '@core/database/migrations/add-workflow-share-token'
  )
  await addWorkflowShareToken(ds)

  // 评审 #74：分享令牌存量明文清理（回填 hash + 清明文，幂等双语种）
  const { sanitizeShareTokens } = await import(
    '@core/database/migrations/sanitize-share-tokens'
  )
  await sanitizeShareTokens(ds)

  // 内置模板接管标记 + 版本历史表（与 Electron 端同构）
  const { addWorkflowTemplateVersion } = await import(
    '@core/database/migrations/add-workflow-template-version'
  )
  await addWorkflowTemplateVersion(ds)

  // §G（2026-09-20）：历史项目 wizard_state NULL → '{}'（与 Electron 端同构）
  const { initNullWizardState } = await import(
    '@core/database/migrations/init-null-wizard-state'
  )
  await initNullWizardState(ds)
  const { createWorkflowDefinitionVersionsTable } = await import(
    '@core/database/migrations/create-workflow-definition-versions'
  )
  await createWorkflowDefinitionVersionsTable(ds)

  // 工作流内部定义标记：definitions 加 internal 列（业务包运行载体，列表默认过滤）
  const { addWorkflowDefinitionInternal } = await import(
    '@core/database/migrations/add-workflow-definition-internal'
  )
  await addWorkflowDefinitionInternal(ds)

  // D1 QA 知识库：kb_qa_pairs 问答对表（与 Electron 端同构）
  const { createKbQaPairs } = await import(
    '@core/database/migrations/create-kb-qa-pairs'
  )
  await createKbQaPairs(ds)
  // 知识库目录：kb_folders 表 + knowledge_bases.folder_id（与 Electron 端同构）
  const { createKbFolders } = await import(
    '@core/database/migrations/create-kb-folders'
  )
  await createKbFolders(ds)
  // 知识库章节树：kb_chapters 表（与 Electron 端同构，幂等双语种）
  const { createKbChapters } = await import(
    '@core/database/migrations/create-kb-chapters'
  )
  await createKbChapters(ds)
  // 统一知识池：kb_inverted_index 去过期 FK（与 Electron 端同构）
  const { fixKbInvertedIndexFk } = await import(
    '@core/database/migrations/fix-kb-inverted-index-fk'
  )
  await fixKbInvertedIndexFk(ds)
  // 设计会话容器表去 project_id 过期 FK（standalone EP 项目 Agent 首条消息建会话被旧外键拒绝；与 Electron 端同构）
  const { fixLwDesignConversationsProjectFk } = await import(
    '@core/database/migrations/fix-lw-design-conversations-project-fk'
  )
  await fixLwDesignConversationsProjectFk(ds)
  // 应用模块：apps / app_sessions 表（幂等，双语种；消息复用 messages 无需建表）
  const { createAppsTables } = await import(
    '@core/database/migrations/create-apps-tables'
  )
  await createAppsTables(ds)
  // 应用会话独立消息表（隔离 AI 对话表；与 Electron 端同构）
  const { createAppSessionMessages } = await import(
    '@core/database/migrations/create-app-session-messages'
  )
  await createAppSessionMessages(ds)
  // 通用资产库：assets 表（与 Electron 端同构；文件型资产落盘 rootDataPath/assets）
  const { createAssetsTables } = await import(
    '@core/database/migrations/create-assets-tables'
  )
  await createAssetsTables(ds)
  // 资产分类定义：asset_categories 表 + 内置业务分类种子（与 Electron 端同构）
  const { createAssetCategories } = await import(
    '@core/database/migrations/create-asset-categories'
  )
  await createAssetCategories(ds)
  // 内置高频应用（迁移直接内置：8 工作流 + 8 应用 + 默认模板资产；与 Electron 端同构）
  const { createBuiltinApps } = await import(
    '@core/database/migrations/create-builtin-apps'
  )
  await createBuiltinApps(ds)
  // 信息来源库：info_source_* 三表 + 预置内置类别「新闻来源」（与 Electron 端同构）
  const { createInfoSources } = await import(
    '@core/database/migrations/create-info-sources'
  )
  await createInfoSources(ds)

  // 邮件收发：email_accounts 表（synchronize 已建表，此处幂等补索引；与 Electron 端同构）
  const { createEmailTables } = await import(
    '@core/database/migrations/create-email-tables'
  )
  await createEmailTables(ds)

  // D2 rerank：knowledge_bases 加 rerank_config 列（幂等，双语种）
  const { addKbRerankConfig } = await import(
      '@core/database/migrations/add-kb-rerank-config'
    )
  await addKbRerankConfig(ds)

  // 长文图谱表（lw_events + lw_graph_edges + lw_projects.wizard_state + character_relation 收编，幂等，双语种）
  const { createLwGraphTables } = await import(
    '@core/database/migrations/create-lw-graph-tables'
  )
  await createLwGraphTables(ds)
  // W3.2：token 用量表（幂等）
  const { createLwTokenUsages } = await import('@core/database/migrations/create-lw-token-usages')
  await createLwTokenUsages(ds)
  // W5.1：地点/物品别名列（幂等）
  const { addLocationItemAliases } = await import('@core/database/migrations/add-location-item-aliases')
  await addLocationItemAliases(ds)
  // W6.6：概要风格样章列（幂等）
  const { addStyleSampleToOverview } = await import('@core/database/migrations/add-style-sample-to-overview')
  await addStyleSampleToOverview(ds)

  // 谓词受控词表 + 存量关系归一（2026-09-16 结构化设定方案 M0；必须在图谱表之后——归一扫描 lw_graph_edges）
  const { createLwPredicateRegistry } = await import(
    '@core/database/migrations/create-lw-predicate-registry'
  )
  await createLwPredicateRegistry(ds)

  // 设计文档表 + 暗线关联列 + 大纲设计锁级别（2026-09-16 结构化设定方案 M1；与 Electron 端同构）
  const { addLwDesignDocuments } = await import('@core/database/migrations/add-lw-design-documents')
  await addLwDesignDocuments(ds)

  // 飞轮记忆存量回填（按源任务 scopeTag 补 biz_module/project_id，幂等，双语种）
  const { backfillAgentMemoryScope } = await import(
    '@core/database/migrations/backfill-agent-memory-scope'
  )
  await backfillAgentMemoryScope(ds)

  // provider_configs 补 default_model 列（与 Electron 端 runMultiTenantMigrations 同构登记）
  const { addProviderConfigDefaultModel } = await import(
    '@core/database/migrations/add-provider-config-default-model'
  )
  await addProviderConfigDefaultModel(ds)

  // 业务包内核（第一期）：business_packs / business_pack_bindings 两表
  // （synchronize 已按 entity 建表，此处幂等补索引；与 Electron 端 runMultiTenantMigrations 同构）
  const { createPackTables } = await import(
    '@core/database/migrations/create-pack-tables'
  )
  await createPackTables(ds)

  // 视频片段制（tasks/2026-09-04-ep-video-segment-redesign §4/§7）：
  // ep_video_segments 表 + storyboards.segment_id/segment_seq + 存量有视频分镜迁成单镜片段
  // （幂等，双语种；与 Electron 端 runMultiTenantMigrations 同构登记）
  const { createEpVideoSegments } = await import(
    '@core/database/migrations/create-ep-video-segments'
  )
  await createEpVideoSegments(ds)

  // 领域共学空间（tasks/2026-09-07-domain-learning-space/design-v3.md §9）：7 张 dl_* 表
  // （幂等，双语种；与 Electron 端 runMultiTenantMigrations 同构登记）
  const { createDomainLearningTables } = await import(
    '@core/database/migrations/create-domain-learning-tables'
  )
  await createDomainLearningTables(ds)

  // 信息搜集（docs/design/2026-10-07-info-collection-design.md §2.3）：5 张 ic_* 表
  // （幂等，双语种；与 Electron 端 runMultiTenantMigrations 同构登记）
  const { createInfoCollectionTables } = await import(
    '@core/database/migrations/create-info-collection-tables'
  )
  await createInfoCollectionTables(ds)

  // H5 视频任务崩溃恢复（2026-09-16 ep-hardening）：storyboards / ep_video_segments
  // 加 provider_task_id（幂等，双语种；与 Electron 端 runMultiTenantMigrations 同构登记）
  const { addVideoProviderTaskId } = await import(
    '@core/database/migrations/add-video-provider-task-id'
  )
  await addVideoProviderTaskId(ds)

  // S-05 定妆图确认闸门（2026-09-17）：asset_image 加 confirmed 列 +
  // 存量 is_main=1 行回填 confirmed=1（幂等，双语种；与 Electron 端 runMultiTenantMigrations 同构登记）
  const { addAssetImageConfirmed } = await import(
    '@core/database/migrations/add-asset-image-confirmed'
  )
  await addAssetImageConfirmed(ds)

  // 长文项目封面：lw_projects 加 cover_path 列（幂等，双语种；与 Electron 端 runMultiTenantMigrations 同构登记）
  const { addLwProjectCoverPath } = await import(
    '@core/database/migrations/add-lw-project-cover-path'
  )
  await addLwProjectCoverPath(ds)

  // 统一图存储（docs/design/2026-10-10-unified-graph-store-design.md）：graph_edges 单表
  // + 五套存量图边回填，幂等双语种；与 Electron 端 runMultiTenantMigrations 同构登记，
  // 必须挂在全部源表迁移之后
  const { createUnifiedGraphTables } = await import(
    '@core/database/migrations/create-unified-graph-tables'
  )
  await createUnifiedGraphTables(ds)

  const dm = new WebDatabaseManager(ds)
  registerCoreDatabaseManager(() => dm)
  console.log('[web-server] PostgreSQL 数据库初始化完成')

  // 人像内置提示词模板 seeder（幂等）：新版人像设计（spec 2026-07-24）。
  // 依赖 portraitPromptTemplates 仓库与 core dbManager 注册，必须在此之后。
  await PortraitTemplateSeederService.seed()
}

/**
 * 向量库初始化（plan 2026-05-03 web-vector-store-pgvector-migration）：
 * - VECTOR_STORE=pgvector：先跑 ensurePgvectorKbVectors 迁移建表 / 索引，
 *   再注册 PgVectorStore（halfvec(8192) + HNSW），Web 容器可水平扩展（无本地 lancedb 状态）
 * - 默认 / VECTOR_STORE=lance：仍用 LanceDBService 本地实现（向后兼容旧 staging）
 *
 * 任意一个失败都不阻塞 web-server 启动 —— KB 向量功能会降级（搜索抛错），
 * 其他业务（chat / 项目 / 资产）不受影响。
 */
async function initWebVectorStore(rootDataPath: string): Promise<void> {
  const mode = process.env.VECTOR_STORE === 'pgvector' ? 'pgvector' : 'lance'
  try {
    if (mode === 'pgvector') {
      const { getCoreDatabaseManager } = await import(
        '@core/database/database-manager.interface'
      )
      const ds = getCoreDatabaseManager().dataSource
      if (!ds) throw new Error('PG DataSource 尚未初始化')
      await ensurePgvectorKbVectors(ds)
      // 步骤0：kb_vectors 加长文元数据列 + 建 lw_vector_indices 表（PG 端，幂等）
      const { extendKbVectorsMetadata } = await import(
        '@core/database/migrations/extend-kb-vectors-metadata'
      )
      const { createLwVectorIndices } = await import(
        '@core/database/migrations/create-lw-vector-indices'
      )
      await extendKbVectorsMetadata(ds)
      await createLwVectorIndices(ds)
      await initVectorStore({ mode: 'pgvector' })
      // 标识全局已切换（其他模块如有自检逻辑可读此 flag）
      ;(globalThis as any).__VECTOR_STORE__ = 'pgvector'
      console.log('[web-server] VECTOR_STORE=pgvector 初始化完成')
      return
    }
    // lance 模式（默认 / 向后兼容）
    const lancePath = path.join(rootDataPath, 'lancedb')
    if (!fs.existsSync(lancePath)) fs.mkdirSync(lancePath, { recursive: true })
    await initVectorStore({ mode: 'lance', dataPath: lancePath })
    ;(globalThis as any).__VECTOR_STORE__ = 'lance'
    console.log('[web-server] LanceDB 向量库初始化完成')
  } catch (e) {
    console.error(
      `[web-server] 向量库初始化失败（mode=${mode}，KB 向量功能将不可用）:`,
      e,
    )
  }
}

// LanceDBService 仍保留 import 让 tsx 不抛 unused（PC 端继续用，dev hot-reload 安全）
void LanceDBService

bootstrap().catch((err) => {
  console.error('[web-server] 启动失败:', err)
  process.exit(1)
})
