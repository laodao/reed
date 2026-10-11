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

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, protocol, dialog } from 'electron'

// 多实例数据隔离（dev 设施）：THE_BOT_USER_DATA 指定时重定向 userData——
// 供并行会话/特性分支实例与主实例共存（否则共写同一 SQLite/LanceDB/9222 端口）。
// 必须在 app ready 前调用；隔离目录为全新环境（secure-key 不随迁，提供商需重新配置）。
if (process.env.THE_BOT_USER_DATA) {
  app.setPath('userData', process.env.THE_BOT_USER_DATA)
  // eslint-disable-next-line no-console
  console.log(`[isolate] userData → ${process.env.THE_BOT_USER_DATA}`)
}
import { join } from 'path'
import * as path from 'path'
import { DataPathService } from './services/data-path.service'
import { cspForRequest } from './platform/app-csp'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDatabaseManager } from './database'
import { createBootTrace } from '@core/utils/boot-trace'
import { ElectronPathProvider } from './services/electron-path.provider'
import { ElectronBroadcastEventEmitter } from './services/electron-event-emitter'
import { SecureStorageService } from './services/secure-storage.service'
import { registerSettingsHandlers } from './ipc/handlers/settings.handler'
import { registerApiKeyHandlers } from './ipc/handlers/api-key.handler'
import { registerProviderConfigHandlers } from './ipc/handlers/provider-config.handler'
import { registerAihubHandlers } from '@core/platform/aihub/aihub.handler'
import { registerImageHandlers } from './ipc/handlers/image.handler'
import { registerFileHandlers } from './ipc/handlers/file.handler'
import { registerTranslationHandlers } from './ipc/handlers/translation.handler'
import { registerDataPathHandlers } from './ipc/handlers/data-path.handler'
import { registerExportHandlers } from './ipc/handlers/export.handler'
import { registerSearchEngineHandlers } from './ipc/handlers/search-engine.handler'
import { registerToolHandlers } from './ipc/handlers/tool.handler'
import { registerEmailHandlers } from './ipc/handlers/email.handler'
import { registerInfoSourceHandlers } from './ipc/handlers/info-source.handler'
import { registerFaviconHandlers } from './ipc/handlers/favicon.handler'
import { registerOSSHandlers } from './ipc/handlers/oss.handler'
import { registerDataSourceHandlers } from './ipc/handlers/datasource.handler'
import { registerPackHandlers } from './ipc/handlers/pack.handler'
import { registerEventAdminHandlers } from './ipc/handlers/event-admin.handler'
import { registerNotificationHandlers } from './ipc/handlers/notification.handler'
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
/** 真退出标志（close 拦截据它放行——29 号 M5.5 批3 托盘最小化） */
let isQuitting = false
let tray: Tray | null = null

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
 * 创建托盘（29 号 M5.5 批3）：关闭=最小化到托盘的前提——托盘不可用时不拦截
 * close（否则窗口隐藏后无任何途径找回/退出）。
 */
function createTray(): boolean {
  try {
    // dev: out/main → 项目根 resources/；打包：extraResources 落 process.resourcesPath
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'tray.png')
      : join(__dirname, '../../resources/tray.png')
    const icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      console.warn('[tray] 托盘图标加载失败（不启用关窗最小化）:', iconPath)
      return false
    }
    tray = new Tray(icon)
    tray.setToolTip('The Bot')
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]))
    tray.on('double-click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
    return true
  } catch (e) {
    console.warn('[tray] 托盘创建失败（不启用关窗最小化）:', e)
    return false
  }
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

  // 修改 CSP 以允许 local-image 协议 + 讲义代码运行沙箱（worker-src blob:）
  // 注：worker-src 放开 blob: 供「运行 JS」用 Worker 沙箱（片段内联为 Worker 顶层代码，
  //     因此不需要 'unsafe-eval'；沙箱内无 DOM、网络 API 被遮蔽、3 秒超时）
  //
  // ⚠️ CSP 装在 session 上 → 会作用于该 session 的所有 WebContents，包括"把本地排版 HTML
  //    渲染成 PDF/长图"的隐藏窗口。那种页面必须能跑内联脚本（mermaid）与 data: 字体（KaTeX），
  //    被应用界面的严格策略拦住会**静默**少图（2026-09-15 实测：导出 PDF 里只剩 `graph TD` 源码）。
  //    故按 WebContents 分流，策略与理由见 electron/platform/app-csp.ts。
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspForRequest(details, mainWindow?.webContents.id)],
      }
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 关闭=最小化到托盘（29 号 M5.5 批3）：主进程在途工作（聊天 agent/任务树/工作流运行）
  // 不随窗口关闭被 app.quit 杀掉；托盘菜单「退出」才是真退出。
  // 托盘不可用时不拦截（否则窗口隐藏后无途径找回）
  mainWindow.on('close', (e) => {
    // macOS 保持现状（红叉=关窗走 darwin 惯例）；Win/Linux 关窗=隐藏到托盘
    if (isQuitting || tray === null || process.platform === 'darwin') return
    e.preventDefault()
    mainWindow?.hide()
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
  // 逐个计时：注册本身只是 ipcBridge.handle 登记，耗时主要在**模块求值**（各 handler
  // 顶层 import 的服务/原生依赖），必须知道是哪一个，才能判断能不能推迟或拆开
  const t = createBootTrace('main.initIpcHandlers')
  const step = <T>(label: string, fn: () => T): T => {
    const r = fn()
    t.mark(label)
    return r
  }
  step('settings', registerSettingsHandlers)
  step('apiKey', registerApiKeyHandlers)
  step('providerConfig', registerProviderConfigHandlers)
  // AI Hub 统一网关（账号会话/模型刷新/计费）：平台基础设施，非业务包
  step('aihub', registerAihubHandlers)
  step('image', registerImageHandlers)
  step('file', registerFileHandlers)
  step('translation', registerTranslationHandlers)
  step('dataPath', registerDataPathHandlers)
  step('export', registerExportHandlers)
  // skills/diary/portrait/chat/voice-design/longwriting/episode-production/
  // workflow/app/knowledge-base/asset-center 十一个业务的 handler 已迁移为内置业务包
  // （core/packs/builtin-packs），由包内核激活时注册，不再在此平铺（避免重复注册）
  step('searchEngine', registerSearchEngineHandlers)
  step('tool', registerToolHandlers)
  step('email', registerEmailHandlers)
  step('infoSource', registerInfoSourceHandlers)
  step('favicon', registerFaviconHandlers)
  step('oss', registerOSSHandlers)
  step('dataSource', registerDataSourceHandlers)
  step('pack', registerPackHandlers)
  // 事件系统管理面（10-event-system §5.3/§8）：DLQ 收口 + 消费者水位
  step('eventAdmin', registerEventAdminHandlers)
  // 通知中心（顶栏铃铛 + 历史列表 + 点击跳转）：平台事件翻译 + 已读独立落表
  step('notification', registerNotificationHandlers)
  t.report(undefined, 20)
}

// 应用就绪
app.whenReady().then(async () => {
  // 启动分段计时：这条链路全部串行，决定了"窗口出现 → 界面可用"的等待时长。
  // 分段数据写入日志（boot-trace），便于定位回归（见 progress/2026-09-16-*）。
  const bootTrace = createBootTrace('main.boot')

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
  bootTrace.mark('platformServices')

  // 初始化数据库
  try {
    const dbManager = getDatabaseManager()
    await dbManager.initialize()
    bootTrace.mark('database')
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
  bootTrace.mark('beforeIpcHandlers')
  initIpcHandlers()
  bootTrace.mark('afterIpcHandlers')
  bootTrace.mark('initIpcHandlers')

  // 启动声音复刻轮询调度器（boot resume + 持续轮询 training 任务）
  // 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.5
  try {
    const { VoiceCloneJobScheduler } = await import(
      '../core/platform/services/voice-clone-job-scheduler'
    )
    bootTrace.mark('import:voiceCloneScheduler')
    VoiceCloneJobScheduler.getInstance().start()
    console.log('[boot] VoiceCloneJobScheduler 已启动')
  } catch (e: any) {
    console.warn('[boot] VoiceCloneJobScheduler 启动失败（不致命）:', e?.message ?? e)
  }
  bootTrace.mark('voiceCloneScheduler')

  // 业务包子系统（第一期：包内核——注册表/快照物化/启用态恢复/IPC 守卫；失败不致命）。
  // 不依赖 workflow，放在工作流子系统初始化之前（P4 起业务包的 activate 会复用 workflow 等设施）。
  try {
    const { initPackSubsystem } = await import('@core/packs/kernel')
    bootTrace.mark('import:packKernel')
    const { builtinPacks } = await import('@core/packs/builtin-packs')
    bootTrace.mark('import:builtinPacks')
    await initPackSubsystem(builtinPacks)
  } catch (e: any) {
    console.warn('[boot] 业务包子系统启动失败（不致命）', e)
  }
  bootTrace.mark('packSubsystem')

  // 工作流子系统：引擎装配 + boot 恢复 + 触发调度器（失败不致命）
  try {
    // 文档工具层：注入 Electron 渲染器（长图/PDF 平台能力）
    const { registerDocumentTools, DocumentToolsService } = await import('@core/platform/services/document-tools/document-tools')
    const { ElectronDocumentRenderer } = await import('./platform/electron-document-renderer')
    registerDocumentTools(new DocumentToolsService(new ElectronDocumentRenderer()))
    bootTrace.mark('documentTools')

    const { initWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
    bootTrace.mark('import:workflowBoot')
    const { IpcEventChannel } = await import('@core/platform/services/event-system/channels/ipc.channel')
    // ipc 通道（10-event-system §5.4）：平台事件 workflow.run.* → wf:run-event 推渲染进程
    await initWorkflowSubsystem({ eventChannels: [new IpcEventChannel()] })
  } catch (e: any) {
    console.warn('[boot] 工作流子系统启动失败（不致命）', e)
  }
  bootTrace.mark('workflowSubsystem')

  // 创建窗口 + 托盘（托盘先建：close 拦截以 tray 就位为前提；托盘失败=关窗直接退出的旧行为）
  createTray()
  createWindow()
  bootTrace.mark('createWindow')
  bootTrace.report(undefined, 100)

  // macOS 激活应用：无窗重建，有窗（被隐藏）恢复显示
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

// 窗口全部关闭：托盘可用（Win/Linux）时最小化存活，在途工作跑完；否则回旧行为退出
// （29 号 M5.5 review P0-2：兜底缺失曾致"无窗无托盘僵尸进程"）
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return // macOS 惯例
  if (tray === null) app.quit() // 无托盘：保留进程没有任何 UI 途径找回，直接退出
})

// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true
  // 复核修复：disposeSharpWorker 此前定义了却从不调用（全项目零引用），
  // sharp 子进程不会随应用退出回收。这里显式关停（幂等，失败不阻断退出）。
  try {
    // 动态 import：避免在非 episode-production 场景把 sharp-worker 提前拉进启动路径
    void import('@core/platform/episode-production/common/sharp-worker')
      .then((m) => m.disposeSharpWorker())
      .catch(() => undefined)
  } catch {
    /* 不阻断退出 */
  }
})

let dbClosed = false
// 退出前清理数据库（close 被拦截后唯一到达路径 = 托盘退出/cmd-q）。
// 超时兜底（review P2-4）：close 挂死也不能把进程留在"点了退出却退不出"的状态
app.on('will-quit', (e) => {
  if (dbClosed) return
  e.preventDefault()
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000))
  const close = Promise.resolve(getDatabaseManager().close()).catch(() => undefined)
  void Promise.race([close, timeout]).then(() => {
    dbClosed = true
    app.exit(0)
  })
})
