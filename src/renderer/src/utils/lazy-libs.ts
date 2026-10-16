/**
 * 重型第三方库按需加载
 * @module renderer/utils/lazy-libs
 *
 * 背景：html2canvas / mermaid 体积大、模块求值慢（html2canvas 单模块求值实测约 400ms）。
 * 若在组件顶层静态 import，会阻塞聊天页首次打开的主线程（实测进入 /chat 长任务累计 ~966ms，
 * html2canvas 一项约占 400ms）。统一走动态 import + 单例缓存：
 * 只在真正使用（导出图片 / 渲染 mermaid 图表）时才加载，且整个应用生命周期只加载一次。
 *
 * 注意：mermaid 的 initialize 是模块级副作用，必须放在首次加载时执行且仅执行一次，
 * 与历史 MessageItem 顶层 `mermaid.initialize({...})` 的配置保持一致。
 */

// type-only import：编译期擦除，零运行时成本，只为获得类型
import type html2canvas from 'html2canvas'
import type mermaid from 'mermaid'

let html2canvasPromise: Promise<typeof html2canvas> | null = null

/**
 * 按需加载 html2canvas（导出图片/长图时使用）
 * @returns 单例 Promise，多次调用只动态 import 一次
 */
export function loadHtml2Canvas(): Promise<typeof html2canvas> {
  html2canvasPromise ??= import('html2canvas').then(
    m => (m.default ?? m) as typeof html2canvas
  )
  return html2canvasPromise
}

/**
 * mermaid 一次性初始化配置（与历史 MessageItem 模块级 initialize 完全一致）
 */
const MERMAID_INIT_OPTIONS = {
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  suppressErrorRendering: true, // 禁用默认错误渲染，由组件自行处理
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
    padding: 15
  },
  sequence: {
    useMaxWidth: true,
    diagramMarginX: 10,
    diagramMarginY: 10,
    actorMargin: 40,
    width: 120,
    height: 50
  },
  gantt: {
    useMaxWidth: true,
    leftPadding: 50,
    gridLineStartPadding: 25,
    fontSize: 12,
    sectionFontSize: 12
  },
  class: { useMaxWidth: true },
  state: { useMaxWidth: true },
  er: { useMaxWidth: true },
  pie: { useMaxWidth: true }
} as const

let mermaidPromise: Promise<typeof mermaid> | null = null

/**
 * 按需加载 mermaid（渲染图表时使用），首次加载时执行 initialize（仅一次）
 * @returns 单例 Promise，多次调用只动态 import + initialize 一次
 */
export function loadMermaid(): Promise<typeof mermaid> {
  mermaidPromise ??= import('mermaid').then(m => {
    const mm = (m.default ?? m) as typeof mermaid
    mm.initialize(MERMAID_INIT_OPTIONS)
    return mm
  })
  return mermaidPromise
}

/**
 * 把重型加载推迟到浏览器空闲时执行（如 MarkdownEditor 的 bytemd 模块）。
 * 页面先渲染轻量占位保证立即可交互，空闲后再加载重型模块。
 * 带超时上限：空闲迟迟不来时也会在 timeout 后强制执行，避免无限推迟。
 * @param fn 空闲时执行的回调
 * @param timeout 超时上限（ms），默认 1200
 */
export function scheduleIdleLoad(fn: () => void, timeout = 1200): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout })
  } else {
    setTimeout(fn, 150)
  }
}
