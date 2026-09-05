/**
 * Electron 主进程入口
 * @module main/index
 */

// TypeORM Entity 装饰器元数据所需，必须在任何 Entity 导入前加载
import 'reflect-metadata'

// Windows 终端编码设置：解决中文乱码问题
if (process.platform === 'win32') {
  // 设置 stdout 和 stderr 编码为 UTF-8
  if (process.stdout && process.stdout.isTTY) {
    process.stdout.setDefaultEncoding?.('utf8')
  }
  if (process.stderr && process.stderr.isTTY) {
    process.stderr.setDefaultEncoding?.('utf8')
  }
}

// 全局补丁：处理 EPIPE 错误
// 当 stdout/stderr 管道断开时，console.log/error 会抛出 EPIPE 错误
// 这个补丁在进程启动时尽早应用，避免任何 console 调用导致崩溃
const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

// 使用更健壮的错误处理
function safeConsoleLog(...args: any[]): void {
  try {
    // 直接尝试写入，不预先检查 writable（因为检查和写入之间可能有竞态）
    originalConsoleLog.apply(console, args)
  } catch (err: any) {
    // EPIPE 错误时尝试写入到 stderr 作为备用
    if (err?.code === 'EPIPE') {
      try {
        originalConsoleError.apply(console, ['[EPIPE suppressed]', ...args])
      } catch { /* 完全忽略 */ }
    }
  }
}

function safeConsoleError(...args: any[]): void {
  try {
    originalConsoleError.apply(console, args)
  } catch (err: any) {
    // EPIPE 错误完全忽略
    if (err?.code !== 'EPIPE') {
      // 其他错误尝试用 process.stderr.write 直接写入
      try {
        process.stderr.write(`[Console Error Fallback]: ${args.map(a => String(a)).join(' ')}\n`)
      } catch { /* 完全忽略 */ }
    }
  }
}

function safeConsoleWarn(...args: any[]): void {
  try {
    originalConsoleWarn.apply(console, args)
  } catch (err: any) {
    // EPIPE 错误完全忽略
    if (err?.code !== 'EPIPE') {
      try {
        process.stderr.write(`[Console Warn Fallback]: ${args.map(a => String(a)).join(' ')}\n`)
      } catch { /* 完全忽略 */ }
    }
  }
}

// 替换全局 console 方法
console.log = safeConsoleLog
console.error = safeConsoleError
console.warn = safeConsoleWarn

// 立即注册 EPIPE 处理器，在任何其他代码执行之前
// 这必须在模块加载的最早期设置，防止任何异步错误导致崩溃
process.on('uncaughtException', (err: any) => {
  // 对于 EPIPE 错误，直接忽略不弹出对话框
  if (err?.code === 'EPIPE' || err?.errno === -4047) {
    // 使用原始 console.error 避免递归
    try {
      originalConsoleError.call(console, '[EPIPE] 忽略管道断开错误')
    } catch { /* 完全忽略 */ }
    return
  }
  // 其他未捕获的错误记录到控制台
  try {
    originalConsoleError.call(console, '[Uncaught Exception]', err)
  } catch { /* 完全忽略 */ }
})

// 增加 V8 堆内存限制，解决 PDF 解析等大内存操作的问题
import { setFlagsFromString } from 'v8'
setFlagsFromString('--max-old-space-size=4096')

import { app, BrowserWindow, shell, protocol, dialog } from 'electron'
import { join } from 'path'
import * as path from 'path'
import { DataPathService } from './services/data-path.service'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDatabaseManager } from './database'
import { ElectronPathProvider } from './services/electron-path.provider'
import { ElectronBroadcastEventEmitter } from './services/electron-event-emitter'
import { SecureStorageService } from './services/secure-storage.service'
import { registerSettingsHandlers } from './ipc/handlers/settings.handler'
import { registerApiKeyHandlers } from './ipc/handlers/api-key.handler'
import { registerProviderConfigHandlers } from './ipc/handlers/provider-config.handler'
import { registerImageHandlers } from './ipc/handlers/image.handler'
import { registerFileHandlers } from './ipc/handlers/file.handler'
import { registerTranslationHandlers } from './ipc/handlers/translation.handler'
import { registerDataPathHandlers } from './ipc/handlers/data-path.handler'
import { registerExportHandlers } from './ipc/handlers/export.handler'
import { registerSearchEngineHandlers } from './ipc/handlers/search-engine.handler'
import { registerToolHandlers } from './ipc/handlers/tool.handler'
import { registerEmailHandlers } from './ipc/handlers/email.handler'
import { registerNewsSourceHandlers } from './ipc/handlers/news-source.handler'
import { registerFaviconHandlers } from './ipc/handlers/favicon.handler'
import { registerOSSHandlers } from './ipc/handlers/oss.handler'
import { registerDataSourceHandlers } from './ipc/handlers/datasource.handler'
import { registerPackHandlers } from './ipc/handlers/pack.handler'
import { registerEventAdminHandlers } from './ipc/handlers/event-admin.handler'
import * as fs from 'fs'

// 在 app ready 之前注册协议权限（重要！）
// 必须在 app ready 之前调用，否则协议无法正常工作
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'local-video',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      // 允许媒体流访问
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

/**
 * 把 protocol URL 解析为本地文件绝对路径。
 * 兼容三种历史/当前格式：
 *   1) local-xxx:///abs/posix/path                 → /abs/posix/path
 *   2) local-xxx:///C:/Win/path 或 local-xxx://C:/Win/path → C:\Win\path
 *   3) local-xxx://images/2026/03/x.png（相对路径）→ <dataPath>/images/2026/03/x.png
 *      (路径首段不是 [A-Za-z]: 形式且不以 / 开头视为 dataPath 相对)
 */
function resolveProtocolUrlToFile(url: string, scheme: string): string {
  let raw = url.substr(`${scheme}://`.length)

  // 移除开头的所有斜杠
  while (raw.startsWith('/')) {
    raw = raw.substring(1)
  }

  // 旧 Windows 格式：浏览器把 'C:' 写成 'c'（第二位是 '/' 时是 Windows 盘符 + 缺冒号）
  if (process.platform === 'win32' && raw.length > 1 && raw.charAt(1) === '/') {
    const firstChar = raw.charAt(0).toUpperCase()
    if (firstChar >= 'A' && firstChar <= 'Z') {
      raw = firstChar + ':' + raw.substring(1)
    }
  }

  let decoded = decodeURIComponent(raw)

  // 判断是否绝对路径：Windows 盘符 'C:' 形式
  const isWindowsAbs = /^[A-Za-z]:[\\/]/.test(decoded)
  // POSIX 在去掉前导 / 后这里识别不出，但 dataPath 拼接时如果 raw 还残留绝对路径片段就保留
  const looksAbsolute = isWindowsAbs

  if (!looksAbsolute) {
    // 视为相对 dataPath
    const dataPath = DataPathService.getInstance().getDataPath()
    decoded = path.join(dataPath, decoded)
  }

  // Windows 上将正斜杠转回反斜杠
  if (process.platform === 'win32') {
    decoded = decoded.replace(/\//g, '\\')
  }

  return decoded
}

/**
 * 注册自定义协议以访问本地图像文件
 */
function registerImageProtocol(): void {
  console.log('[local-image] 开始注册协议...')

  // 检查协议是否已注册
  const isRegistered = protocol.isProtocolRegistered('local-image')
  console.log('[local-image] 协议是否已注册:', isRegistered)

  // 使用 protocol.registerFileProtocol 处理本地文件
  protocol.registerFileProtocol('local-image', (request, callback) => {
    const filePath = resolveProtocolUrlToFile(request.url, 'local-image')

    if (fs.existsSync(filePath)) {
      callback({ path: filePath })
    } else {
      console.error('[local-image] 文件不存在:', filePath)
      callback({ error: -2 })
    }
  })

  console.log('[local-image] 协议注册完成')
}

/**
 * 注册自定义协议以访问本地音频文件
 */
function registerAudioProtocol(): void {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const filePath = resolveProtocolUrlToFile(request.url, 'local-file')

    if (fs.existsSync(filePath)) {
      callback({ path: filePath })
    } else {
      console.error('[local-file] 文件不存在:', filePath)
      callback({ error: -2 })
    }
  })
}

/**
 * 注册自定义协议以访问本地视频文件
 */
function registerVideoProtocol(): void {
  console.log('[local-video] 开始注册视频协议...')

  protocol.registerFileProtocol('local-video', (request, callback) => {
    const filePath = resolveProtocolUrlToFile(request.url, 'local-video')

    if (fs.existsSync(filePath)) {
      callback({ path: filePath })
    } else {
      console.error('[local-video] 文件不存在:', filePath)
      callback({ error: -2 })
    }
  })

  console.log('[local-video] 协议注册完成')
}

/**
 * 创建主窗口
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // 允许访问本地文件
    }
  })

  // 修改 CSP 以允许 local-image 协议
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'wasm-unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: local-image: file:; " +
          "media-src 'self' file: local-image: local-file: local-video:; " +
          "connect-src 'self' ws://localhost:* http://localhost:*"
        ]
      }
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 只把真实网页交给系统浏览器；about:blank（报告预览等本应用弹窗）放行——
    // 否则 shell.openExternal('about:blank') 会让 Windows 弹"应用商店"选择器
    if (/^https?:/i.test(details.url)) {
      void shell.openExternal(details.url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // 开发模式下加载开发服务器，生产模式下加载本地文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 初始化 IPC 处理器
 */
function initIpcHandlers(): void {
  registerSettingsHandlers()
  registerApiKeyHandlers()
  registerProviderConfigHandlers()
  registerImageHandlers()
  registerFileHandlers()
  registerTranslationHandlers()
  registerDataPathHandlers()
  registerExportHandlers()
  // skills/diary/portrait/chat/voice-design/longwriting/episode-production/
  // workflow/app/knowledge-base/asset-center 十一个业务的 handler 已迁移为内置业务包
  // （core/packs/builtin-packs），由包内核激活时注册，不再在此平铺（避免重复注册）
  registerSearchEngineHandlers()
  registerToolHandlers()
  registerEmailHandlers()
  registerNewsSourceHandlers()
  registerFaviconHandlers()
  registerOSSHandlers()
  registerDataSourceHandlers()
  registerPackHandlers()
  // 事件系统管理面（10-event-system §5.3/§8）：DLQ 收口 + 消费者水位
  registerEventAdminHandlers()
}

// 应用就绪
app.whenReady().then(async () => {
  // 设置应用用户模型 ID（Windows）
  electronApp.setAppUserModelId('com.daoge.the_bot')

  // 注册自定义图像协议
  registerImageProtocol()

  // 注册自定义音频协议
  registerAudioProtocol()

  // 注册自定义视频协议
  registerVideoProtocol()

  // 开发模式下默认通过 F12 打开开发工具
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化平台抽象层（PathProvider / EventEmitter / SecureStorage）—— 必须早于数据库初始化
  ElectronPathProvider.getInstance()
  ElectronBroadcastEventEmitter.getInstance()
  SecureStorageService.getInstance()

  // 初始化数据库
  try {
    const dbManager = getDatabaseManager()
    await dbManager.initialize()
    console.log('数据库初始化成功')
  } catch (error: any) {
    // 数据库初始化失败会导致所有依赖数据库的功能（对话/图像/角色等）报"数据库未初始化"。
    // 此前仅打印日志、继续创建窗口，用户会看到 UI 正常但功能全坏且毫无提示。
    // 这里改为弹窗明确告知，并记录完整错误栈，避免再次出现"症状与根因脱节"的情况。
    console.error('数据库初始化失败:', error)
    const errMsg = error?.message || String(error)
    const detail =
      (error?.stack || String(error)) +
      '\n\n常见原因：\n' +
      '1) native 模块（better-sqlite3 / lancedb / nodejieba）未正确解包或未针对 Electron 重编译\n' +
      '2) 数据目录无写入权限\n' +
      '3) 数据库文件损坏'
    dialog.showErrorBox(
      'The Bot 数据库初始化失败',
      `应用启动失败：${errMsg}\n\n${detail}`
    )
  }

  // 注册 IPC 处理器
  initIpcHandlers()

  // 启动声音复刻轮询调度器（boot resume + 持续轮询 training 任务）
  // 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.5
  try {
    const { VoiceCloneJobScheduler } = await import(
      '../core/services/voice-clone-job-scheduler'
    )
    VoiceCloneJobScheduler.getInstance().start()
    console.log('[boot] VoiceCloneJobScheduler 已启动')
  } catch (e: any) {
    console.warn('[boot] VoiceCloneJobScheduler 启动失败（不致命）:', e?.message ?? e)
  }

  // 业务包子系统（第一期：包内核——注册表/快照物化/启用态恢复/IPC 守卫；失败不致命）。
  // 不依赖 workflow，放在工作流子系统初始化之前（P4 起业务包的 activate 会复用 workflow 等设施）。
  try {
    const { initPackSubsystem } = await import('@core/packs/kernel')
    const { builtinPacks } = await import('@core/packs/builtin-packs')
    await initPackSubsystem(builtinPacks)
  } catch (e: any) {
    console.warn('[boot] 业务包子系统启动失败（不致命）', e)
  }

  // 工作流子系统：引擎装配 + boot 恢复 + 触发调度器（失败不致命）
  try {
    // 文档工具层：注入 Electron 渲染器（长图/PDF 平台能力）
    const { registerDocumentTools, DocumentToolsService } = await import('@core/services/document-tools/document-tools')
    const { ElectronDocumentRenderer } = await import('./platform/electron-document-renderer')
    registerDocumentTools(new DocumentToolsService(new ElectronDocumentRenderer()))

    const { initWorkflowSubsystem } = await import('@core/modules/workflow/workflow-boot')
    const { IpcEventChannel } = await import('@core/services/event-system/channels/ipc.channel')
    // ipc 通道（10-event-system §5.4）：平台事件 workflow.run.* → wf:run-event 推渲染进程
    await initWorkflowSubsystem({ eventChannels: [new IpcEventChannel()] })
  } catch (e: any) {
    console.warn('[boot] 工作流子系统启动失败（不致命）', e)
  }

  // 创建窗口
  createWindow()

  // macOS 激活应用时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（Windows & Linux）
app.on('window-all-closed', () => {
  // 关闭数据库连接
  const dbManager = getDatabaseManager()
  dbManager.close()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理
app.on('before-quit', async () => {
  const dbManager = getDatabaseManager()
  await dbManager.close()
})
