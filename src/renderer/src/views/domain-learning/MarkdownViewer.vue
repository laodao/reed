<template>
  <div ref="rootRef" class="markdown-viewer" :class="{ compact }">
    <!-- bytemd 只读渲染：懒加载（模块求值较重，避免阻塞首开）；sanitize 传 schema 变更器 -->
    <component :is="viewerComp" v-if="viewerComp" :value="md" :plugins="plugins" :sanitize="extendSanitizeSchema" />
    <el-skeleton v-else :rows="6" animated />
  </div>
</template>

<script setup lang="ts">
/**
 * 只读 Markdown 渲染（bytemd Viewer 封装，惰性加载）
 * @module views/domain-learning/MarkdownViewer
 * @description 讲义渲染用（图文 / mermaid / 表格 / 公式）。bytemd 模块较重，
 *              故懒加载，避免阻塞页面首开。讲义内容来自研究 Agent（联网/KB/模型产出）。
 *
 * 安全与渲染（2026-09-12 修复）：
 * - bytemd 的 `sanitize` 是 **hast schema 变更器**（`(schema) => schema`），不是
 *   「HTML 字符串消毒器」。此前误传 `(html: string) => string`（DOMPurify），
 *   schema 被替换成字符串，hast-util-sanitize 的 `Object.assign` 丢掉 bytemd 追加的
 *   `className` 白名单 → 所有 class 被剥离 → plugin-math/plugin-mermaid 的
 *   viewerEffect 查不到 `.math.math-inline` / `code.language-mermaid` 锚点，
 *   公式与图表都不渲染。现在按契约传 schema 变更器。
 * - XSS 防线仍是 rehype-sanitize 的 GitHub 默认白名单（script / 事件属性 /
 *   javascript: 协议一律丢弃），由 `extendSanitizeSchema` 显式保住 className 后继续生效。
 *
 * 渲染后增强（2026-09-12 用户需求）：
 * - ```figure 代码块 → 用自写 SVG 渲染器画成图（声明式图形规格，非 AI 生图）；
 * - ```js / ```javascript 代码块 → 加「运行」按钮，在 Web Worker 沙箱里跑并内联看输出。
 *   两者都在 DOM 渲染完成后处理（与 mermaid 插件同一时机），用 MutationObserver
 *   跟随 bytemd 的 innerHTML 变化重跑。
 *
 * 2026-09-15：新增 `compact` 变体——右栏追问回答（QaAnswerView）在窄气泡里复用本渲染器，
 * 用紧凑排版覆盖讲义级首行缩进与大间距（见文件末样式块）。
 */
import { onBeforeUnmount, onMounted, shallowRef, type Component } from 'vue'
import { extendSanitizeSchema } from '@/utils/markdown-sanitize-schema'
import { figureHtml } from './figure-spec'
import { runJsSnippet } from './code-runner'
// CSS 静态副作用引入：随本组件 chunk 懒加载（组件本身已动态 import），且对 typecheck 友好
import 'bytemd/dist/index.css'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.css'

withDefaults(
  defineProps<{
    md: string
    /**
     * 紧凑排版（对话气泡等窄容器）：不套讲义级首行缩进与大段间距。
     * 讲义正文（SectionLesson / LessonSlides）不传，保持原排版。
     */
    compact?: boolean
  }>(),
  { compact: false },
)

const viewerComp = shallowRef<Component | null>(null)
const plugins = shallowRef<unknown[]>([])
const rootRef = shallowRef<HTMLElement | null>(null)
/** 是否已插入运行过的标记（防重复增强 / MutationObserver 自触发） */
const ENHANCED_ATTR = 'data-dl-enhanced'

function loadViewer(): void {
  Promise.all([
    import('@bytemd/vue-next'),
    import('@bytemd/plugin-gfm'),
    import('@bytemd/plugin-highlight'),
    import('@bytemd/plugin-frontmatter'),
    import('@bytemd/plugin-math'),
    import('@bytemd/plugin-mermaid'),
  ]).then(([bytemd, gfm, highlight, frontmatter, math, mermaid]) => {
    plugins.value = [
      gfm.default(),
      highlight.default(),
      frontmatter.default(),
      math.default(),
      mermaid.default(),
    ]
    // 模块形态因构建互操作而异：ESM 命名导出或 CJS default 挂载，二者兜底
    const mod = bytemd as unknown as { Viewer?: Component; default?: { Viewer: Component } }
    viewerComp.value = mod.Viewer ?? mod.default?.Viewer ?? null
  })
}

// ==================== 渲染后增强 ====================

/**
 * ```figure 代码块 → SVG 图形。
 * 规格非法时保留代码块并追加一行可读错误（读者仍能看到规格原文）。
 */
function enhanceFigures(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(`pre > code.language-figure:not([${ENHANCED_ATTR}])`).forEach((code) => {
    const pre = code.parentElement
    if (!pre) return
    code.setAttribute(ENHANCED_ATTR, 'figure')
    const result = figureHtml(code.textContent ?? '')
    const wrap = document.createElement('div')
    wrap.className = 'dl-figure'
    if (result.ok) {
      wrap.innerHTML = result.svg
      if (result.warnings.length) {
        const note = document.createElement('div')
        note.className = 'dl-figure-note'
        note.textContent = result.warnings.join('；')
        wrap.appendChild(note)
      }
      pre.replaceWith(wrap)
    } else {
      const note = document.createElement('div')
      note.className = 'dl-figure-note dl-figure-error'
      note.textContent = `图形规格无法渲染：${result.error}`
      pre.insertAdjacentElement('afterend', note)
    }
  })
}

/** ```js / ```javascript 代码块 → 加「运行」按钮与输出区（Web Worker 沙箱） */
function enhanceRunnableCode(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>(
      [
        `pre > code.language-js:not([${ENHANCED_ATTR}])`,
        `pre > code.language-javascript:not([${ENHANCED_ATTR}])`,
        `pre > code.language-mjs:not([${ENHANCED_ATTR}])`,
      ].join(', '),
    )
    .forEach((code) => {
      const pre = code.parentElement
      if (!pre) return
      code.setAttribute(ENHANCED_ATTR, 'runnable')
      const box = document.createElement('div')
      box.className = 'dl-run'
      const bar = document.createElement('div')
      bar.className = 'dl-run-bar'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'dl-run-btn'
      btn.textContent = '▶ 运行'
      const hint = document.createElement('span')
      hint.className = 'dl-run-hint'
      hint.textContent = '在沙箱里运行（无网络、3 秒超时）'
      bar.append(btn, hint)
      const out = document.createElement('div')
      out.className = 'dl-run-out'
      out.hidden = true
      box.append(bar, out)

      btn.addEventListener('click', () => {
        void (async () => {
          btn.disabled = true
          btn.textContent = '运行中…'
          out.hidden = false
          out.textContent = ''
          const res = await runJsSnippet(code.textContent ?? '')
          const lines = res.output.length ? res.output.map((l) => `> ${l}`) : []
          if (!lines.length && res.ok) lines.push('> （没有 console 输出——用 console.log 打印想看的值）')
          if (res.error) lines.push(`✗ ${res.error}`)
          out.textContent = `${lines.join('\n')}\n— 用时 ${res.durationMs}ms${res.truncated ? '（输出已截断）' : ''}`
          out.classList.toggle('is-error', !res.ok)
          btn.disabled = false
          btn.textContent = '▶ 再运行'
        })()
      })

      pre.insertAdjacentElement('afterend', box)
    })
}

/** 跑一轮增强（figures + 可运行代码块） */
function enhance(root: HTMLElement | null): void {
  if (!root) return
  enhanceFigures(root)
  enhanceRunnableCode(root)
}

let observer: MutationObserver | null = null
let enhanceTimer: number | null = null

/** 合并同一帧内的多次 DOM 变化，避免频繁增强 */
function scheduleEnhance(): void {
  if (enhanceTimer !== null) window.clearTimeout(enhanceTimer)
  enhanceTimer = window.setTimeout(() => {
    enhanceTimer = null
    enhance(rootRef.value)
  }, 30)
}

onMounted(() => {
  loadViewer()
  // bytemd 用 innerHTML 替换内容 → 监听子树变化重跑增强（幂等：已增强的节点带标记）
  observer = new MutationObserver(() => scheduleEnhance())
  if (rootRef.value) observer.observe(rootRef.value, { childList: true, subtree: true })
  scheduleEnhance()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (enhanceTimer !== null) window.clearTimeout(enhanceTimer)
})
</script>

<style scoped lang="scss">
// 讲义正文排版（章节层级/首行缩进/列表缩进/表格边框…）集中在此文件，便于契约测试守护
@use './lesson-markdown.scss';

.markdown-viewer {
  :deep(.bytemd) {
    height: auto;
    border: none;
  }
  :deep(.bytemd-preview) {
    background: transparent;
    padding: 0;
  }
}

/**
 * 紧凑排版（`compact`）：右栏追问气泡等窄容器。
 * 讲义排版（lesson-markdown.scss）按整页阅读设计——段落首行缩进两字、章节大间距、
 * 表格上下的留白；塞进对话气泡后每段都缩进、行又短，读起来反而不像对话。
 * 这里只做"容器变窄"的增量覆盖：`.markdown-viewer.compact` 多一层类名，
 * 特异性高于讲义规则（0,3,1 > 0,2,1），与样式表加载顺序无关。
 */
.markdown-viewer.compact {
  :deep(.markdown-body) {
    font-size: 13px;
    line-height: 1.7;

    p {
      margin: 0 0 6px;
      text-indent: 0; // 对话气泡内不做首行缩进
    }

    h1,
    h2,
    h3 {
      margin: 10px 0 6px;
      font-size: 13.5px;
      padding-left: 8px;
    }

    h4,
    h5,
    h6 {
      margin: 8px 0 4px;
      font-size: 13px;
    }

    ul,
    ol {
      margin: 0 0 6px;
      padding-left: 1.8em;
    }

    table,
    pre,
    blockquote {
      margin: 6px 0;
    }

    // 图（mermaid / figure）在窄栏里允许横向滚动，避免撑破气泡
    .bytemd-mermaid,
    .dl-figure {
      margin: 8px 0;
      padding: 8px;
      overflow-x: auto;
    }

    .katex-display {
      margin: 8px 0;
    }
  }
}
</style>
