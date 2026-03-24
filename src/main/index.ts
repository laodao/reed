/**
 * Electron 主进程入口
 * @module main/index
 */

import { app, BrowserWindow, shell, ipcMain, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDatabaseManager } from './database'
import { registerSettingsHandlers } from './ipc/handlers/settings.handler'
import { registerApiKeyHandlers } from './ipc/handlers/api-key.handler'
import { registerDialogHandlers } from './ipc/handlers/dialog.handler'
import { registerMessageHandlers } from './ipc/handlers/message.handler'
import { registerRoleHandlers } from './ipc/handlers/role.handler'
import { registerProviderConfigHandlers } from './ipc/handlers/provider-config.handler'
import { registerChatHandlers } from './ipc/handlers/chat.handler'
import { registerImageHandlers } from './ipc/handlers/image.handler'
import { registerFileHandlers } from './ipc/handlers/file.handler'
import { registerTranslationHandlers } from './ipc/handlers/translation.handler'
import { registerVoiceHandlers } from './ipc/handlers/voice.handler'
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
  }
])

let mainWindow: BrowserWindow | null = null

/**
 * 注册自定义协议以访问本地图像文件
 */
function registerImageProtocol(): void {
  protocol.registerFileProtocol('local-image', (request, callback) => {
    const url = request.url.substr('local-image://'.length)
    // 解码 URL 编码的路径
    const filePath = decodeURIComponent(url)

    console.log('[local-image] 请求文件:', filePath)

    if (fs.existsSync(filePath)) {
      callback({ path: filePath })
    } else {
      console.error('[local-image] 文件不存在:', filePath)
      callback({ error: -2 }) // 文件不存在
    }
  })
}

/**
 * 注册自定义协议以访问本地音频文件
 */
function registerAudioProtocol(): void {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    let url = request.url.substr('local-file://'.length)
    // 移除开头的斜杠（如果有的话，来自 /// 格式）
    if (url.startsWith('/')) {
      url = url.substring(1)
    }
    // 解码 URL 编码的路径
    let filePath = decodeURIComponent(url)
    // 将正斜杠转换回反斜杠（Windows）
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\')
    }

    console.log('[local-file] 请求文件:', filePath)

    if (fs.existsSync(filePath)) {
      callback({ path: filePath })
    } else {
      console.error('[local-file] 文件不存在:', filePath)
      callback({ error: -2 }) // 文件不存在
    }
  })
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
      webSecurity: false  // 允许 file:// 协议访问本地文件
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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
  registerDialogHandlers()
  registerMessageHandlers()
  registerRoleHandlers()
  registerProviderConfigHandlers()
  registerChatHandlers()
  registerImageHandlers()
  registerFileHandlers()
  registerTranslationHandlers()
  registerVoiceHandlers()
}

// 应用就绪
app.whenReady().then(async () => {
  // 设置应用用户模型 ID（Windows）
  electronApp.setAppUserModelId('com.daoge.the_bot')

  // 注册自定义图像协议
  registerImageProtocol()

  // 注册自定义音频协议
  registerAudioProtocol()

  // 开发模式下默认通过 F12 打开开发工具
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化数据库
  try {
    const dbManager = getDatabaseManager()
    await dbManager.initialize()
    console.log('数据库初始化成功')
  } catch (error) {
    console.error('数据库初始化失败:', error)
  }

  // 注册 IPC 处理器
  initIpcHandlers()

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
app.on('before-quit', () => {
  const dbManager = getDatabaseManager()
  dbManager.close()
})
