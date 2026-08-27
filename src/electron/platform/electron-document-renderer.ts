/**
 * Electron 文档渲染器（IHtmlRenderer 平台实现）
 * @module electron/platform/electron-document-renderer
 * @description 隐藏 BrowserWindow 加载排版 HTML：
 *              - htmlToPdf：webContents.printToPDF（A4 分页；中文字体走系统）
 *              - htmlToImage：按内容实际高度整页截图（capturePage）——长图
 *              从 DiaryExportService 的 printToPDF 流程下沉而来（能力层唯一实现）。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import type { IHtmlRenderer } from '@core/services/document-tools/document-tools'

/** 渲染并发保护：隐藏窗口逐次创建销毁，简单串行即可（避免同时开多窗口） */
let renderLock: Promise<unknown> = Promise.resolve()

export class ElectronDocumentRenderer implements IHtmlRenderer {
  async htmlToPdf(html: string, opts?: { width?: number }): Promise<Buffer> {
    return this.withWindow(html, opts?.width ?? 800, async (win) => {
      return await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      })
    })
  }

  async htmlToImage(html: string, opts?: { width?: number }): Promise<Buffer> {
    // 长图：宽度按模板（默认 750），高度取内容实际高度。
    // 上限 100000（原 20000 会把长报告截断成半张图）；等渲染稳定后再截图
    return this.withWindow(html, opts?.width ?? 750, async (win) => {
      const height = await win.webContents.executeJavaScript(
        'Math.min(100000, Math.ceil(document.documentElement.scrollHeight))'
      )
      win.setBounds({ height: Math.max(200, height) })
      // 等两帧渲染稳定（图片/字体加载后高度可能再变）
      await new Promise<void>(r => setTimeout(r, 250))
      const image = await win.webContents.capturePage()
      return image.toPNG()
    })
  }

  /** 串行化 + 生命周期兜底（异常必关窗） */
  private async withWindow<T>(
    html: string,
    width: number,
    fn: (win: Electron.BrowserWindow) => Promise<T>
  ): Promise<T> {
    const run = async (): Promise<T> => {
      // 运行期 require：避免模块加载期依赖 electron（与 diary-export 同策略）
      const electron = require('electron') as typeof import('electron')
      let win: Electron.BrowserWindow | null = null
      try {
        win = new electron.BrowserWindow({
          width,
          height: 800,
          show: false,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        })
        // data: URL 有长度上限（约 2MB），超长内容走临时文件
        if (html.length < 1_500_000) {
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        } else {
          const tmp = path.join(os.tmpdir(), `the-bot-render-${Date.now()}.html`)
          fs.writeFileSync(tmp, html, 'utf-8')
          try { await win.loadFile(tmp) } finally { fs.unlinkSync(tmp) }
        }
        return await fn(win)
      } finally {
        win?.destroy()
      }
    }
    const prev = renderLock
    let release: () => void = () => {}
    renderLock = new Promise<void>(r => { release = () => r() })
    await prev
    try {
      return await run()
    } finally {
      release()
    }
  }
}
