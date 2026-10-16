/**
 * Electron 应用测试辅助工具
 * 通过 CDP 协议连接到 Electron 应用进行测试
 */

import { chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'

/**
 * 测试配置
 */
export interface ElectronTestConfig {
  /** CDP 调试端口 */
  debugPort: number
  /** 应用启动超时时间（毫秒） */
  timeout: number
  /** 是否在测试结束后关闭应用 */
  autoClose: boolean
}

/**
 * 默认配置
 */
const defaultConfig: ElectronTestConfig = {
  debugPort: 9222,
  timeout: 30000,
  autoClose: true
}

/**
 * Electron 应用测试助手
 */
export class ElectronTestHelper {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private electronProcess: ChildProcess | null = null
  private config: ElectronTestConfig

  constructor(config: Partial<ElectronTestConfig> = {}) {
    this.config = { ...defaultConfig, ...config }
  }

  /**
   * 启动 Electron 应用并连接
   * 如果应用已经在运行（debugPort 已开启），则直接连接
   */
  async startApp(): Promise<void> {
    const { debugPort, timeout } = this.config

    // 尝试连接已运行的应用
    try {
      console.log(`[ElectronTest] 尝试连接到已运行的应用 (端口: ${debugPort})...`)
      this.browser = await chromium.connectOverCDP(`http://localhost:${debugPort}`, {
        timeout: 5000
      })
      console.log('[ElectronTest] 成功连接到已运行的应用')
    } catch {
      // 应用未运行，启动新应用
      console.log('[ElectronTest] 未找到运行中的应用，正在启动...')
      await this.launchApp()
    }

    // 获取上下文和页面
    const contexts = this.browser!.contexts()
    if (contexts.length === 0) {
      throw new Error('未找到浏览器上下文')
    }
    this.context = contexts[0]

    // 等待页面加载
    const pages = this.context.pages()
    if (pages.length === 0) {
      // 等待页面创建
      this.page = await this.context.waitForEvent('page', { timeout })
    } else {
      this.page = pages[0]
    }

    console.log('[ElectronTest] 应用已准备就绪')
  }

  /**
   * 启动新的 Electron 应用
   */
  private async launchApp(): Promise<void> {
    const { debugPort, timeout } = this.config

    // 获取 electron-vite dev 命令
    const isDev = !process.env.CI
    const cwd = process.cwd()

    if (isDev) {
      // 开发模式：使用 electron-vite dev
      this.electronProcess = spawn('npx', [
        'electron-vite',
        'dev',
        '--',
        `--remote-debugging-port=${debugPort}`
      ], {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      // 输出日志
      this.electronProcess.stdout?.on('data', (data) => {
        console.log(`[Electron stdout] ${data.toString().trim()}`)
      })
      this.electronProcess.stderr?.on('data', (data) => {
        console.error(`[Electron stderr] ${data.toString().trim()}`)
      })
    } else {
      // 生产模式：运行构建后的应用
      const electronPath = path.join(cwd, 'out/main/index.js')
      this.electronProcess = spawn('npx', [
        'electron',
        electronPath,
        `--remote-debugging-port=${debugPort}`
      ], {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    }

    // 等待应用启动并监听端口
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      try {
        this.browser = await chromium.connectOverCDP(`http://localhost:${debugPort}`, {
          timeout: 2000
        })
        console.log('[ElectronTest] 新应用已启动并连接')
        return
      } catch {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    throw new Error(`应用启动超时 (${timeout}ms)`)
  }

  /**
   * 获取页面实例
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error('应用未启动，请先调用 startApp()')
    }
    return this.page
  }

  /**
   * 获取浏览器上下文
   */
  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('应用未启动，请先调用 startApp()')
    }
    return this.context
  }

  /**
   * 获取浏览器实例
   */
  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('应用未启动，请先调用 startApp()')
    }
    return this.browser
  }

  /**
   * 调用 electronAPI
   * @example
   * const providers = await helper.invokeElectronAPI('image.getProviders')
   */
  async invokeElectronAPI<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const page = this.getPage()

    // 解析方法路径，如 'image.getProviders' -> ['image', 'getProviders']
    const parts = method.split('.')
    // 使用普通 function 而非箭头函数，以保留 arguments 对象
    const code = `
      (async function() {
        let obj = window.electronAPI;
        ${parts.map((p, i) => `obj = obj['${p}'];`).join('\n        ')}
        return await obj(${args.map((_, i) => `arguments[${i}]`).join(', ')});
      })()
    `

    return page.evaluate(code, ...args) as Promise<T>
  }

  /**
   * 检查 electronAPI 是否可用
   */
  async isElectronAPIReady(): Promise<boolean> {
    const page = this.getPage()
    return page.evaluate(() => typeof (window as any).electronAPI !== 'undefined')
  }

  /**
   * 等待 electronAPI 准备就绪
   */
  async waitForElectronAPI(timeout: number = 10000): Promise<void> {
    const page = this.getPage()
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const ready = await page.evaluate(() => typeof (window as any).electronAPI !== 'undefined')
      if (ready) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    throw new Error(`electronAPI 未在 ${timeout}ms 内准备就绪`)
  }

  /**
   * 导航到指定路由
   */
  async navigateTo(route: string): Promise<void> {
    const page = this.getPage()
    await page.goto(`http://localhost:5173/#${route}`)
    await page.waitForLoadState('networkidle')
  }

  /**
   * 关闭应用（如果是我们启动的）
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }

    if (this.electronProcess && this.config.autoClose) {
      this.electronProcess.kill()
      this.electronProcess = null
    }

    this.context = null
    this.page = null
  }
}

/**
 * 创建测试助手实例
 */
export function createElectronHelper(config?: Partial<ElectronTestConfig>): ElectronTestHelper {
  return new ElectronTestHelper(config)
}