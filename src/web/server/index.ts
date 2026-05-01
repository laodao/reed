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
 * 3. 初始化全局数据库（仅 users 表）
 * 4. 注册 WebDatabaseRegistry：登录后每个用户使用独立 SQLite 文件
 * 5. 启动 HTTP / WS
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
import { attachWebSocketServer } from './ws/ws-server'

import { WebPathProvider } from './platform/web-path.provider'
import { WebSocketEventEmitter } from './platform/web-event-emitter'
import { WebSecureStorage } from './platform/web-secure-storage'
import { WebDatabaseRegistry } from './platform/web-database-registry'

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

  // 2. 多租户数据库初始化
  //    - 全局 SQLite：<root>/global.db，仅承载 users 表用于鉴权
  //    - 每用户 SQLite：<root>/users/<userId>/the_bot.db（懒创建）
  await initWebDatabaseRegistry(cfg.rootDataPath)

  // 2.5 注册 IPC channel 处理器
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

  if (cfg.rendererDir) {
    app.use(express.static(cfg.rendererDir))
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

  // 优雅停机
  const shutdown = async (signal: string) => {
    console.log(`[web-server] 收到 ${signal}，开始关闭...`)
    server.close()
    await WebDatabaseRegistry.getInstance().shutdown()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

/**
 * 初始化全局 DataSource（users 表）+ 注册 WebDatabaseRegistry
 */
async function initWebDatabaseRegistry(rootDataPath: string): Promise<void> {
  const { createDataSource } = await import('@core/database/data-source')
  const { ensureUsersTable } = await import('@core/database/migrations/ensure-users-table')
  const { registerCoreDatabaseManager } = await import(
    '@core/database/database-manager.interface'
  )

  const globalDbFile = path.join(rootDataPath, 'global.db')
  const globalDs = await createDataSource({
    config: { type: 'sqlite', database: globalDbFile, enableWal: true },
  })
  // 全局库只用 users 表；synchronize 会按 entity metadata 建全表（其他表为空，可忽略）
  await globalDs.synchronize()
  await ensureUsersTable(globalDs)

  const registry = WebDatabaseRegistry.getInstance({
    rootDataPath,
    globalDataSource: globalDs,
  })

  // core 层访问器：未登录 → 全局 DM；登录后 → 该用户专属 DM
  registerCoreDatabaseManager(() => registry.getCurrentUserDm())
  console.log('[web-server] 数据库注册表初始化完成（多租户 SQLite）')
}

bootstrap().catch((err) => {
  console.error('[web-server] 启动失败:', err)
  process.exit(1)
})
