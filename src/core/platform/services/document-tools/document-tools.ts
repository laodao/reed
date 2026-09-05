/**
 * 文档工具层（底层能力沉淀，2026-08-19 架构指示）
 * @module core/platform/services/document-tools
 * @description 生成图片（长图）/ PDF / Word / HTML 是系统级文档输出能力：
 *              - 接口与模板渲染放 core（双端共用的纯逻辑）
 *              - 页面渲染（BrowserWindow printToPDF / capturePage）是平台能力，
 *                由各端注入 IHtmlRenderer 实现（Electron 隐藏窗口；Web V1 降级
 *                返回 HTML 由前端打印）
 *              - 消费方：工作流 report / report-image 节点、对话导出、日记导出、
 *                未来 harness 工具注册——同一套实现，严禁各建一套
 */

import { markdownToDocx } from '@core/utils/markdown-to-docx'
import type { DocumentTemplate } from './templates'
import { renderTemplateHtml, DOCUMENT_TEMPLATES } from './templates'

/** HTML→二进制产物的平台渲染器（Electron 注入；Web 端可缺省降级） */
export interface IHtmlRenderer {
  /** HTML → PDF Buffer（A4 分页排版） */
  htmlToPdf(html: string, opts?: { width?: number }): Promise<Buffer>
  /** HTML → PNG 长图 Buffer（按内容高度整页截图，不分页） */
  htmlToImage(html: string, opts?: { width?: number }): Promise<Buffer>
}

export interface RenderDocumentInput {
  /** markdown 正文（模板负责转 HTML 与排版） */
  markdown: string
  /** 排版模板（决定字体/配色/页眉页脚）；缺省 generic */
  template?: DocumentTemplate
  /** 文档标题（页眉/文件名用） */
  title?: string
}

export interface RenderedDocument {
  /** 产物 Buffer（对应 format） */
  buffer: Buffer
  /** 完整排版 HTML（前端打印兜底 / 预览复用） */
  html: string
}

export type DocumentOutputFormat = 'image' | 'pdf' | 'docx' | 'html'

/**
 * 长图截图专用样式：隐藏滚动条 + 防内容横向撑破。
 * 长图按内容实际高度整页截图，超长 URL/表格若不换行会撑出横向滚动条并被打进截图，
 * 或 window 高度与内容差几像素时出现纵向滚动条。此 CSS 从布局层根治（仅用于截图，
 * 不影响 HTML 预览/PDF——预览仍需可滚动）。
 * @param html 排版 HTML（renderTemplateHtml 输出）
 * @returns 注入样式后的 HTML
 */
export const LONG_IMAGE_FIX_CSS = `
  html, body { overflow-x: hidden !important; overflow-y: hidden !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
  /* 防内容横向撑破：覆盖块级容器与列表项（长标题/长 URL 在 li 里也会撑破容器） */
  img, table, pre, code, a, blockquote, td, th, strong, em, li, ol, ul, p, h1, h2, h3, h4 {
    max-width: 100% !important; overflow-wrap: anywhere !important; word-break: break-word !important; box-sizing: border-box !important;
  }
`

/** 把长图滚动条修复样式注入排版 HTML（在 </head> 前追加） */
export function applyLongImageFix(html: string): string {
  const injected = `<style>${LONG_IMAGE_FIX_CSS}</style>`
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${injected}</head>`)
  return html + injected
}

/**
 * 文档工具服务：markdown/HTML → 排版产物。
 * docx/html 为纯 core 能力；image/pdf 依赖注入的平台渲染器。
 */
export class DocumentToolsService {
  constructor(private readonly renderer: IHtmlRenderer | null) {}

  /** 平台渲染器是否可用（Web 端未注入时 image/pdf 走 HTML 降级） */
  canRenderBinary(): boolean {
    return this.renderer !== null
  }

  /** markdown → 完整排版 HTML（双端纯函数；前端预览/打印兜底共用） */
  async renderHtml(input: RenderDocumentInput): Promise<string> {
    return await renderTemplateHtml(input.markdown, {
      template: input.template ?? DOCUMENT_TEMPLATES.generic,
      title: input.title,
    })
  }

  /** markdown → PNG 长图（无平台渲染器时降级返回 HTML，格式标 html） */
  async renderImage(input: RenderDocumentInput & { width?: number }): Promise<RenderedDocument & { format: DocumentOutputFormat }> {
    const html = await this.renderHtml(input)
    if (!this.renderer) return { buffer: Buffer.from(html, 'utf-8'), html, format: 'html' }
    return { buffer: await this.renderer.htmlToImage(html, { width: input.width }), html, format: 'image' }
  }

  /** markdown → PDF（无平台渲染器时降级返回 HTML） */
  async renderPdf(input: RenderDocumentInput & { width?: number }): Promise<RenderedDocument & { format: DocumentOutputFormat }> {
    const html = await this.renderHtml(input)
    if (!this.renderer) return { buffer: Buffer.from(html, 'utf-8'), html, format: 'html' }
    return { buffer: await this.renderer.htmlToPdf(html, { width: input.width }), html, format: 'pdf' }
  }

  /** markdown → docx（core 纯能力，双端一致） */
  async renderDocx(input: RenderDocumentInput): Promise<RenderedDocument & { format: DocumentOutputFormat }> {
    const buffer = await markdownToDocx(input.markdown, { title: input.title })
    return { buffer, html: await this.renderHtml(input), format: 'docx' }
  }
}

// ==================== 全局访问器（各端 boot 时注入平台渲染器） ====================

let _instance: DocumentToolsService | null = null

/** 注册全局文档工具实例（Electron boot 传 ElectronDocumentRenderer；Web 端传 null 走降级） */
export function registerDocumentTools(instance: DocumentToolsService): void {
  _instance = instance
}

/** 取全局文档工具（未注册时返回仅 html/docx 能力的降级实例——renderImage/renderPdf 产出 HTML） */
export function getDocumentTools(): DocumentToolsService {
  if (!_instance) _instance = new DocumentToolsService(null)
  return _instance
}
