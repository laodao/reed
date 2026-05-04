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
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import { LanceDBService } from '@core/services/lance-db.service'
import { registerAllWebChannels } from './api/register-channels'

interface ServerConfig {
  port: number
  rootDataPath: string
  jwtSecret: string
  rendererDir: string | null
}

function readConfig(): ServerConfig {
  return {
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
  const secureStorage = WebSecureStorage.getInstance({ rootDataPath: cfg.rootDataPath })
  await secureStorage.initialize()

  configureJwtSecret(cfg.jwtSecret)

  // 2. 单 PG DataSource（多租户行级隔离：user_id 列 + BaseRepository ALS 注入）
  await initDatabase()

  // 3. LanceDB（与 Electron 等价）
  await initLanceDB(cfg.rootDataPath)

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

  server.listen(cfg.port, () => {
    console.log(`[web-server] 监听 http://localhost:${cfg.port}`)
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

  const dm = new WebDatabaseManager(ds)
  registerCoreDatabaseManager(() => dm)
  console.log('[web-server] PostgreSQL 数据库初始化完成')
}

/**
 * LanceDB 向量库（与 Electron 等价）。多租户在 chunk 表里按 knowledge_base_id 隔离，
 * KB 自身已带 user_id，天然安全。
 */
async function initLanceDB(rootDataPath: string): Promise<void> {
  try {
    const lancePath = path.join(rootDataPath, 'lancedb')
    if (!fs.existsSync(lancePath)) fs.mkdirSync(lancePath, { recursive: true })
    await LanceDBService.getInstance().initialize(lancePath)
    console.log('[web-server] LanceDB 初始化完成')
  } catch (e) {
    console.error('[web-server] LanceDB 初始化失败（KB 向量功能将不可用）:', e)
  }
}

bootstrap().catch((err) => {
  console.error('[web-server] 启动失败:', err)
  process.exit(1)
})
