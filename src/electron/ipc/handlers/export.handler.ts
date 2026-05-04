/**
 * 导出功能 IPC 处理器
 * @module ipc/handlers/export
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { markdownToDocx } from '@core/utils/markdown-to-docx'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

function loadElectron(): { app?: any; dialog?: any; BrowserWindow?: any; shell?: any } {
  if (!isElectron) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const e = require('electron')
  return { app: e.app, dialog: e.dialog, BrowserWindow: e.BrowserWindow, shell: e.shell }
}

/**
 * Obsidian 保管库信息
 */
interface ObsidianVault {
  path: string
  name: string
  ts?: number  // 最后打开时间
}

/**
 * Obsidian 配置文件结构
 */
interface ObsidianConfig {
  vaults?: Record<string, { path: string; ts?: number }>
}

/**
 * 获取 Obsidian 配置文件路径
 */
function getObsidianConfigPath(): string {
  const platform = os.platform()
  const { app } = loadElectron()
  const homeDir = app?.getPath('home') ?? os.homedir()

  switch (platform) {
    case 'win32':
      return path.join(app?.getPath('appData') ?? path.join(homeDir, 'AppData', 'Roaming'), 'obsidian', 'obsidian.json')
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'obsidian', 'obsidian.json')
    case 'linux':
      return path.join(homeDir, '.config', 'obsidian', 'obsidian.json')
    default:
      return path.join(app?.getPath('appData') ?? path.join(homeDir, '.config'), 'obsidian', 'obsidian.json')
  }
}

/**
 * 获取 Obsidian 保管库列表
 */
function getObsidianVaults(): ObsidianVault[] {
  try {
    const configPath = getObsidianConfigPath()

    if (!fs.existsSync(configPath)) {
      console.log('[Obsidian] 配置文件不存在:', configPath)
      return []
    }

    const content = fs.readFileSync(configPath, 'utf-8')
    const config: ObsidianConfig = JSON.parse(content)

    if (!config.vaults) {
      return []
    }

    const vaults: ObsidianVault[] = []
    for (const [, vaultData] of Object.entries(config.vaults)) {
      const vaultPath = vaultData.path
      if (vaultPath && fs.existsSync(vaultPath)) {
        vaults.push({
          path: vaultPath,
          name: path.basename(vaultPath),
          ts: vaultData.ts
        })
      }
    }

    // 按最后打开时间排序
    vaults.sort((a, b) => (b.ts || 0) - (a.ts || 0))

    return vaults
  } catch (error) {
    console.error('[Obsidian] 读取配置失败:', error)
    return []
  }
}

/**
 * 获取保管库目录结构
 */
function getVaultDirectories(vaultPath: string, basePath: string = ''): string[] {
  const result: string[] = []
  const targetPath = basePath ? path.join(vaultPath, basePath) : vaultPath

  try {
    const items = fs.readdirSync(targetPath, { withFileTypes: true })

    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith('.')) {
        const relativePath = basePath ? path.join(basePath, item.name) : item.name
        result.push(relativePath)
        // 递归获取子目录
        const subDirs = getVaultDirectories(vaultPath, relativePath)
        result.push(...subDirs)
      }
    }
  } catch (error) {
    console.error('[Obsidian] 读取目录失败:', error)
  }

  return result
}

/**
 * 获取保管库指定目录下的文件列表
 */
function getVaultFiles(vaultPath: string, subPath: string = ''): { files: string[]; dirs: string[] } {
  const files: string[] = []
  const dirs: string[] = []
  const targetPath = subPath ? path.join(vaultPath, subPath) : vaultPath

  try {
    const items = fs.readdirSync(targetPath, { withFileTypes: true })

    for (const item of items) {
      if (item.name.startsWith('.')) continue

      if (item.isDirectory()) {
        dirs.push(item.name)
      } else if (item.name.endsWith('.md')) {
        files.push(item.name)
      }
    }
  } catch (error) {
    console.error('[Obsidian] 读取文件列表失败:', error)
  }

  return { files, dirs }
}

/**
 * 注册导出相关的 IPC 处理器
 */
export function registerExportHandlers(): void {
  /**
   * 获取 Obsidian 保管库列表
   */
  ipcBridge.handle('export:get-obsidian-vaults', async () => {
    try {
      const vaults = getObsidianVaults()
      return { success: true, data: vaults }
    } catch (error: any) {
      console.error('[export:get-obsidian-vaults] 错误:', error)
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取保管库目录列表
   */
  ipcBridge.handle('export:get-vault-directories', async (_event: any, vaultPath: string) => {
    try {
      const dirs = getVaultDirectories(vaultPath)
      return { success: true, data: dirs }
    } catch (error: any) {
      console.error('[export:get-vault-directories] 错误:', error)
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取保管库文件列表
   */
  ipcBridge.handle('export:get-vault-files', async (_event: any, vaultPath: string, subPath?: string) => {
    try {
      const result = getVaultFiles(vaultPath, subPath)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[export:get-vault-files] 错误:', error)
      return { success: false, error: error.message }
    }
  })
  /**
   * 导出消息为图片
   */
  ipcBridge.handle('export:message-image', async (_event: any, data: {
    imageBase64: string
    fileName?: string
  }) => {
    try {
      if (!isElectron) {
        return { success: false, error: '该功能仅在桌面端可用' }
      }
      const { dialog, BrowserWindow } = loadElectron()
      const defaultName = data.fileName || `AI回答_${Date.now()}.png`

      const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
        defaultPath: defaultName,
        filters: [
          { name: 'PNG 图片', extensions: ['png'] },
          { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: true, message: '用户取消' }
      }

      const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')

      fs.writeFileSync(result.filePath, buffer)

      return { success: true, filePath: result.filePath }
    } catch (error: any) {
      console.error('[export:message-image] 错误:', error)
      return { success: false, error: error.message }
    }
  })

  /**
   * 把消息渲染为 Word 文档 buffer（base64），不直接写盘 —— 由前端
   * （saveBlobAs）决定保存到本地（PC 走 dialog，Web 走浏览器下载）。
   *
   * 双端共用：core 端只负责"markdown → docx 字节流"，落盘行为下沉到前端。
   */
  ipcBridge.handle('export:message-word', async (_event: any, data: { content: string; modelId?: string }) => {
    try {
      if (!data?.content) {
        return { success: false, error: '消息内容为空' }
      }
      const buffer = await markdownToDocx(data.content, { title: 'AI 回答' })
      // Buffer → base64（前端用 atob/Uint8Array 还原成 Blob 再触发下载）
      const base64 = Buffer.from(buffer).toString('base64')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const defaultName = `AI回答_${timestamp}.docx`
      return {
        success: true,
        data: { base64, defaultName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      }
    } catch (error: any) {
      console.error('[export:message-word] 错误:', error)
      return { success: false, error: error.message }
    }
  })

  /**
   * 导出到 Obsidian
   */
  ipcBridge.handle('export:to-obsidian', async (_event: any, data: {
    content: string
    thinkingChain?: string
    title: string
    vaultPath: string
    subPath?: string
    tags?: string[]
    createdAt?: string
    source?: string
    mode: 'new' | 'append'
    appendFile?: string
  }) => {
    try {
      const { content, thinkingChain, title, vaultPath, subPath, tags, createdAt, source, mode, appendFile } = data

      // 验证保管库路径
      if (!fs.existsSync(vaultPath)) {
        return { success: false, error: '保管库目录不存在' }
      }

      // 安全文件名
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_')
      const vaultName = path.basename(vaultPath)

      let filePath: string
      let fileContent: string

      // 构建 Markdown 内容
      const frontMatter: Record<string, any> = {}
      if (createdAt) frontMatter.created = createdAt
      if (source) frontMatter.source = source
      if (tags && tags.length > 0) frontMatter.tags = tags

      // 构建正文
      let body = ''

      // 添加思维链（如果有且启用）
      if (thinkingChain) {
        body += `## 思维链\n\n${thinkingChain}\n\n---\n\n`
      }

      // 添加主要内容
      body += content

      if (mode === 'append' && appendFile) {
        // 追加模式
        if (!fs.existsSync(appendFile)) {
          return { success: false, error: '要追加的文件不存在' }
        }

        const existingContent = fs.readFileSync(appendFile, 'utf-8')
        fileContent = existingContent + '\n\n---\n\n' + `## ${title}\n\n` + body
        filePath = appendFile
      } else {
        // 新建模式
        // 构建完整文件路径
        const targetDir = subPath ? path.join(vaultPath, subPath) : vaultPath

        // 确保目录存在
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
        }

        filePath = path.join(targetDir, `${safeTitle}.md`)

        // 检查文件是否已存在
        if (fs.existsSync(filePath)) {
          // 添加时间戳后缀
          const timestamp = Date.now()
          filePath = path.join(targetDir, `${safeTitle}_${timestamp}.md`)
        }

        // 构建完整内容（带 frontmatter）
        fileContent = ''
        if (Object.keys(frontMatter).length > 0) {
          fileContent = '---\n'
          for (const [key, value] of Object.entries(frontMatter)) {
            if (Array.isArray(value)) {
              fileContent += `${key}: [${value.map(t => `"${t}"`).join(', ')}]\n`
            } else {
              fileContent += `${key}: "${value}"\n`
            }
          }
          fileContent += '---\n\n'
        }
        fileContent += body
      }

      // 写入文件
      fs.writeFileSync(filePath, fileContent, 'utf-8')

      // 使用 Obsidian URI 打开文件（仅 Electron 端）
      if (isElectron) {
        const { shell } = loadElectron()
        const relativePath = path.relative(vaultPath, filePath).replace(/\\/g, '/')
        const encodedVault = encodeURIComponent(vaultName)
        const encodedFile = encodeURIComponent(relativePath)
        const obsidianUri = `obsidian://open?vault=${encodedVault}&file=${encodedFile}`
        await shell?.openExternal(obsidianUri)
      }

      return { success: true, filePath }
    } catch (error: any) {
      console.error('[export:to-obsidian] 错误:', error)
      return { success: false, error: error.message }
    }
  })
}