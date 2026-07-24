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
import { attachWebSocketServer } from './ws/ws-server'

import { WebPathProvider } from './platform/web-path.provider'
import { WebSocketEventEmitter } from './platform/web-event-emitter'
import { WebSecureStorage } from './platform/web-secure-storage'
import { WebDatabaseManager } from './platform/web-database-manager'

// 这三个必须 static import：tsx 在 ESM/CJS 混合下，static 与 dynamic
// 解析 '@core/...' 可能产生**两份**模块实例，导致 dynamic 端 register 的
// _accessor 在 static 端（auth/routes 等）看不到。统一走 static 即可。
import { createDataSource } from '@core/database/data-source'
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
import { addKeyframeUserPromptOverride } from '@core/database/migrations/add-keyframe-user-prompt-override'
import { addCharacterBindingExtraFields } from '@core/database/migrations/add-character-binding-extra-fields'
import { addCharacterBindingRace } from '@core/database/migrations/add-character-binding-race'
import { addPortraitVariantFraming } from '@core/database/migrations/add-portrait-variant-framing'
import { createPortraitPromptTemplates } from '@core/database/migrations/create-portrait-prompt-templates'
import { addStoryboardKeyframeCount } from '@core/database/migrations/add-storyboard-keyframe-count'
import { addKbDocumentSource } from '@core/database/migrations/add-kb-document-source'
import { addKeyframeReferenceOverrides } from '@core/database/migrations/add-keyframe-reference-overrides'
import { addStoryboardUseKeyframes } from '@core/database/migrations/add-storyboard-use-keyframes'
import { addStoryboardIncludeInFinal } from '@core/database/migrations/add-storyboard-include-in-final'
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
import { LanceDBService } from '@core/services/lance-db.service'
import { initVectorStore } from '@core/services/vector/registry'
import { ensurePgvectorKbVectors } from '@core/database/migrations/ensure-pgvector-kb-vectors'
import { registerAllWebChannels } from './api/register-channels'

interface ServerConfig {
  port: number
  host: string
  rootDataPath: string
  jwtSecret: string
  rendererDir: string | null
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
  }
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
  await initDatabase()

  // 3. 向量库（VECTOR_STORE=pgvector → PgVectorStore，否则 LanceDB 兜底）
  await initWebVectorStore(cfg.rootDataPath)

  // 4. 注册 IPC channel 处理器
  await registerAllWebChannels()

  // 5. Express
  const app = express()
  app.use(express.json({ limit: '50mb' }))
  app.use(cookieParser())
  app.use(attachUser)

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))
  app.use('/api/auth', authRouter)
  app.use('/api/ipc', ipcRouter)
  app.use('/api/upload', uploadRouter)
  // spec 2026-05-09 ep-redesign §3.2 D4 · Agent Skill HTTP API
  app.use('/api/agents', agentsRouter)

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
      '@core/services/voice-clone-job-scheduler'
    )
    VoiceCloneJobScheduler.getInstance().start()
    console.log('[web-server] VoiceCloneJobScheduler 已启动')
  } catch (e: any) {
    console.warn(
      '[web-server] VoiceCloneJobScheduler 启动失败（不致命）:',
      e?.message ?? e,
    )
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
  // 关键帧 reference_overrides：用户精细挑图覆盖
  await addKeyframeReferenceOverrides(ds)
  // 分镜 use_keyframes：是否走关键帧流程（false → 直接用剧本描述 + 资产生成视频）
  await addStoryboardUseKeyframes(ds)
  // 分镜 include_in_final：⑥ 合成时是否入最终成片（默认 1）
  await addStoryboardIncludeInFinal(ds)
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

  const dm = new WebDatabaseManager(ds)
  registerCoreDatabaseManager(() => dm)
  console.log('[web-server] PostgreSQL 数据库初始化完成')
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
