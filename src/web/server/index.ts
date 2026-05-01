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
 * 启动流程：
 * 1. 读环境变量（PORT / JWT_SECRET / DATA_ROOT 等）
 * 2. 注册 4 个全局访问器（PathProvider / EventEmitter / SecureStorage / DatabaseManager）
 * 3. 初始化数据库（共用 src/core/database 的 DataSource，但 PathProvider 已是 Web 版）
 * 4. 启动 HTTP / WS
 */

import 'reflect-metadata'
import * as http from 'http'
import * as path from 'path'
import * as fs from 'fs'
import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'

import { configureJwtSecret } from './auth/jwt'
import { attachUser } from './auth/middleware'
import authRouter from './auth/routes'
import ipcRouter from './api/ipc-router'
import assetsRouter from './api/assets-router'
import { attachWebSocketServer } from './ws/ws-server'

import { WebPathProvider } from './platform/web-path.provider'
import { WebSocketEventEmitter } from './platform/web-event-emitter'
import { WebSecureStorage } from './platform/web-secure-storage'

interface ServerConfig {
  port: number
  rootDataPath: string
  jwtSecret: string
  rendererDir: string | null  // 静态资源目录；为 null 时不挂静态服务
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
  // 开发模式给一个固定值，方便本地刷新仍保留登录态
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

  // 1. 平台抽象层
  WebPathProvider.getInstance({ rootDataPath: cfg.rootDataPath })
  WebSocketEventEmitter.getInstance()
  const secureStorage = WebSecureStorage.getInstance({ rootDataPath: cfg.rootDataPath })
  await secureStorage.initialize()

  configureJwtSecret(cfg.jwtSecret)

  // 2. 数据库初始化（用 web 版 PathProvider，所以 dataPath 是 <root>/users/_anonymous）
  //    注意：这里数据库是全局单实例（所有用户共享一个 SQLite/PG），用 user_id 列做行级隔离。
  //    用户专属文件目录由 PathProvider 隔离。
  await initWebDatabase()

  // 2.5 注册 IPC channel 处理器（与 Electron handler 等价的逻辑）
  const { registerAllWebChannels } = await import('./api/register-channels')
  await registerAllWebChannels()

  // 3. Express
  const app = express()
  app.use(express.json({ limit: '50mb' }))
  app.use(cookieParser())
  app.use(attachUser)

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))
  app.use('/api/auth', authRouter)
  app.use('/api/ipc', ipcRouter)
  app.use('/assets', assetsRouter)

  // 静态前端
  if (cfg.rendererDir) {
    app.use(express.static(cfg.rendererDir))
    // SPA fallback：除 /api / /assets / /events 之外的 GET 都返回 index.html
    app.get('/*splat', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/events')) {
        return next()
      }
      res.sendFile(path.join(cfg.rendererDir!, 'index.html'))
    })
  }

  // 4. HTTP + WS
  const server = http.createServer(app)
  attachWebSocketServer(server)

  server.listen(cfg.port, () => {
    console.log(`[web-server] 监听 http://localhost:${cfg.port}`)
  })
}

/**
 * 初始化数据库（不依赖 Electron 的 DatabaseManager）。
 * 这里用最小代码：直接构造 DataSource + 注册到 ICoreDatabaseManager。
 *
 * 数据库路径优先级：
 *   1. DB_TYPE=postgres → 使用 PG 环境变量
 *   2. 默认 → SQLite，文件位置 <rootDataPath>/the_bot.db
 */
type DbConfig =
  | { type: 'sqlite'; database: string; enableWal?: boolean }
  | { type: 'postgres'; host: string; port?: number; username: string; password: string; database: string; schema?: string }

async function initWebDatabase(): Promise<void> {
  const { createDataSource } = await import('@core/database/data-source')
  const { loadDbConfigFromEnv } = await import('@core/database/config')
  const { ensureUsersTable } = await import('@core/database/migrations/ensure-users-table')
  const { registerCoreDatabaseManager } = await import(
    '@core/database/database-manager.interface'
  )
  const { WebDatabaseManager } = await import('./platform/web-database-manager')

  // 从环境变量读 DbConfig；未设置则用 SQLite 文件
  let cfg: DbConfig | null = loadDbConfigFromEnv()
  if (!cfg) {
    const root = path.resolve(process.env.DATA_ROOT ?? './data')
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
    cfg = {
      type: 'sqlite' as const,
      database: path.join(root, 'the_bot.db'),
      enableWal: true,
    }
  }

  const ds = await createDataSource({ config: cfg })
  // Web 端首次启动用 synchronize 让 TypeORM 按 entity metadata 建全表（幂等）。
  // 与 Electron 不同：Electron 由 initTables() raw SQL 建表，drift check 把关；
  // Web 端不维护两份 DDL，统一走 TypeORM 自身的 schema 同步。
  await ds.synchronize()
  await ensureUsersTable(ds)

  // 注册 DatabaseManager（生成所有 Repository 实例）
  const dm = new WebDatabaseManager(ds)
  registerCoreDatabaseManager(() => dm)
  console.log('[web-server] 数据库初始化完成')
}

bootstrap().catch(err => {
  console.error('[web-server] 启动失败:', err)
  process.exit(1)
})
