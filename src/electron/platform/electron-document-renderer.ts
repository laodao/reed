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

import type { IHtmlRenderer } from '@core/platform/services/document-tools/document-tools'
import { applyLongImageFix } from '@core/platform/services/document-tools/document-tools'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('DocumentRenderer')

/** 渲染并发保护：隐藏窗口逐次创建销毁，简单串行即可（避免同时开多窗口） */
let renderLock: Promise<unknown> = Promise.resolve()

export class ElectronDocumentRenderer implements IHtmlRenderer {
  async htmlToPdf(html: string, opts?: { width?: number }): Promise<Buffer> {
    return this.withWindow(html, opts?.width ?? 800, async (win) => {
      // 页面内异步渲染（mermaid 图等）完成后再打印，否则图会缺失
      await this.prepareForCapture(win)
      return await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      })
    })
  }

  async htmlToImage(html: string, opts?: { width?: number }): Promise<Buffer> {
    // 注入滚动条修复 + 防溢宽样式（超长 URL/表格不再撑出滚动条、不挤窄内容）
    const fixedHtml = applyLongImageFix(html)
    // 长图：宽度按模板（默认 750），高度取内容实际高度。
    // 上限 100000（原 20000 会把长报告截断成半张图）；等渲染稳定后测两帧取稳定高度再截图
    return this.withWindow(fixedHtml, opts?.width ?? 750, async (win) => {
      // 页面内异步渲染（mermaid 图等）完成后再测量高度，避免按未渲染的占位高度截图
      await this.prepareForCapture(win)
      const measure = () =>
        win.webContents.executeJavaScript(
          'Math.min(100000, Math.ceil(document.documentElement.scrollHeight))'
        )
      // 首帧测量（隐藏滚动条后的布局高度）
      const h1 = await measure()
      // 等字体/图片加载完再测，取高度较大值，避免底部被裁
      await new Promise<void>(r => setTimeout(r, 250))
      const h2 = await measure()
      const height = Math.min(100000, Math.max(200, h1, h2))
      win.setBounds({ height })
      // 等窗口重排稳定后再截图
      await new Promise<void>(r => setTimeout(r, 300))
      return await this.captureLongImage(win)
    })
  }

  /**
   * 长图截图（空图兜底）。
   *
   * 实测（2026-09-15，重启应用后第一次导出）：隐藏窗口首帧还没合成出来时
   * `capturePage()` 会返回**空图** → base64 为空 → 前端只好提示"导出产物异常"，
   * 紧接着再导一次就正常。这里按「催重绘 → 重试 → 屏幕外显示后强拍」逐级兜底，
   * 仍拍不到就明确抛错——绝不把空产物交给上层。
   */
  private async captureLongImage(win: Electron.BrowserWindow): Promise<Buffer> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const image = await win.webContents.capturePage()
      if (!image.isEmpty()) return image.toPNG()
      logger.warn(`[document-render] 第 ${attempt} 次截图得到空图（隐藏窗口首帧未合成？）——催一次重绘再试`)
      win.webContents.invalidate()
      await new Promise<void>((r) => setTimeout(r, 300))
    }
    // 兜底：挪到屏幕外显示一次，强制合成后再拍（showInactive 不抢焦点）
    try {
      win.setBounds({ x: -10_000, y: -10_000 })
      win.showInactive()
      await new Promise<void>((r) => setTimeout(r, 400))
      const image = await win.webContents.capturePage()
      if (!image.isEmpty()) {
        logger.info('[document-render] 空图兜底生效：离屏显示后截图成功')
        return image.toPNG()
      }
    } catch (e) {
      logger.warn(`[document-render] 离屏显示兜底失败：${(e as Error)?.message ?? e}`)
    }
    throw new Error('长图渲染失败：隐藏窗口未合成出可截图画面，请重试（持续失败请查看日志）')
  }

  /**
   * 截图/打印前的统一准备：等页面声明的异步渲染就绪，再检查图表是否真的渲染出来了。
   *
   * 后者是"静默降级"的兜底探针（2026-09-15 实测教训）：页面若因 CSP/脚本被拦等原因
   * 没能渲染 mermaid，等不到就绪标志也会照常产出——导出的 PDF/长图里只剩 `graph TD` 源码，
   * 用户只会看到"图没了"。这里把这种情况写进日志，别再悄悄少图。
   */
  private async prepareForCapture(win: Electron.BrowserWindow): Promise<void> {
    await this.waitForRenderReady(win)
    const pending = await this.countUnrenderedMermaid(win)
    if (pending > 0) {
      logger.warn(
        `[document-render] 仍有 ${pending} 个 mermaid 容器没渲染出图（内联脚本被 CSP 拦截或 mermaid 渲染失败）——本次产物会缺图`,
      )
    }
  }

  /** 尚未渲染出 <svg> 的 mermaid 容器数量（取不到 DOM 时按 0 处理，不影响出图） */
  private async countUnrenderedMermaid(win: Electron.BrowserWindow): Promise<number> {
    try {
      const n = await win.webContents.executeJavaScript(
        "[...document.querySelectorAll('.mermaid')].filter((el) => !el.querySelector('svg')).length"
      )
      return typeof n === 'number' ? n : 0
    } catch {
      return 0
    }
  }

  /**
   * 等页面声明的异步渲染就绪标志（`window.__docRenderDone`）。
   * 页面未使用该标志（既有消费方）时立即返回——零等待、零回归；
   * 超时则照常产出（宁可少一张图，也不能让导出挂死）。
   */
  private async waitForRenderReady(win: Electron.BrowserWindow, timeoutMs = 15_000): Promise<void> {
    const probe = 'window.__docRenderDone !== false'
    const start = Date.now()
    for (;;) {
      let ready = true
      try {
        ready = (await win.webContents.executeJavaScript(probe)) === true
      } catch {
        ready = true // 取不到就当就绪（老页面/已销毁）
      }
      if (ready) return
      if (Date.now() - start > timeoutMs) return
      await new Promise<void>((r) => setTimeout(r, 200))
    }
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
