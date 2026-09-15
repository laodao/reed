/**
 * 文档工具层公式 / mermaid 增强测试（markdown-enhance）
 *
 * 钉死：公式只在非代码区提取、货币写法与转义 `$` 不误判、块级/行内区分、
 * 回填失败回退原文不丢内容、mermaid 代码块转容器并反转义、
 * 增强关闭时 HTML 与既有行为一致（零回归）。
 */

import { describe, it, expect } from 'vitest'
import {
  buildEnhanceAssets,
  extractMath,
  fallbackMathText,
  loadKatexStyle,
  loadMermaidScript,
  mermaidBlocksToContainers,
  renderMathInHtml,
} from '@core/platform/services/document-tools/markdown-enhance'
import { renderTemplateHtml, DOCUMENT_TEMPLATES } from '@core/platform/services/document-tools/templates'

describe('extractMath（公式提取）', () => {
  it('行内与块级公式分别抽成占位符，TeX 原样保留', () => {
    const { text, math } = extractMath('前 $a_1 * b_2$ 后\n\n$$\n\\int_0^1 x dx\n$$\n')
    expect(math).toHaveLength(2)
    expect(math[0]).toMatchObject({ tex: 'a_1 * b_2', display: false })
    expect(math[1]).toMatchObject({ tex: '\\int_0^1 x dx', display: true })
    expect(text).toContain('前 @@DLMATH0@@ 后')
    expect(text).toContain('@@DLMATH1@@')
    // 占位符里不能再残留 $，否则 marked 仍会吃掉 `_`/`*`
    expect(text).not.toContain('a_1 * b_2')
  })

  it('fenced code 与行内 code 里的 $ 不当作公式', () => {
    const md = ['```bash', 'echo $HOME $PATH', '```', '', '行内 `$notmath$` 保留', '', '真公式 $x^2$'].join('\n')
    const { text, math } = extractMath(md)
    expect(math).toHaveLength(1)
    expect(math[0].tex).toBe('x^2')
    expect(text).toContain('echo $HOME $PATH')
    expect(text).toContain('`$notmath$`')
  })

  it('货币写法与转义 \\$ 不误判', () => {
    const { math } = extractMath('价格 $5 和 $10 与 \\$20 都不是公式')
    expect(math).toHaveLength(0)
  })

  it('$$ 块级不被行内规则重复吃掉', () => {
    const { math } = extractMath('$$E = mc^2$$')
    expect(math).toHaveLength(1)
    expect(math[0]).toMatchObject({ display: true, tex: 'E = mc^2' })
  })
})

describe('renderMathInHtml（公式回填）', () => {
  it('用渲染函数回填占位符（同 token 多处出现全部替换）', async () => {
    const { text, math } = extractMath('$x$ 与 $x$')
    const html = `<p>${text}</p>`
    const out = await renderMathInHtml(html, math, (m) => `<katex>${m.tex}</katex>`)
    expect(out).toBe('<p><katex>x</katex> 与 <katex>x</katex></p>')
  })

  it('渲染抛错回退公式原文（内容不丢）', async () => {
    const { math } = extractMath('$\\bad$')
    const out = await renderMathInHtml('<p>@@DLMATH0@@</p>', math, () => {
      throw new Error('katex 崩了')
    })
    expect(out).toBe(`<p>${fallbackMathText(math[0])}</p>`)
    expect(out).toContain('\\bad')
  })

  it('无公式时原样返回（零开销）', async () => {
    expect(await renderMathInHtml('<p>x</p>', [])).toBe('<p>x</p>')
  })
})

describe('mermaidBlocksToContainers', () => {
  it('marked 的 mermaid 代码块转成容器并反转义源码', () => {
    const html = '<pre><code class="language-mermaid">graph TD;\n  A--&gt;B;\n  B--&gt;C;</code></pre>'
    const r = mermaidBlocksToContainers(html)
    expect(r.hasMermaid).toBe(true)
    expect(r.html).toContain('<div class="mermaid">')
    expect(r.html).toContain('A-->B;')
    expect(r.html).not.toContain('&gt;')
  })

  it('非 mermaid 代码块不动，且 hasMermaid=false', () => {
    const html = '<pre><code class="language-js">const a = 1;</code></pre>'
    const r = mermaidBlocksToContainers(html)
    expect(r.hasMermaid).toBe(false)
    expect(r.html).toBe(html)
  })
})

describe('增强资源与零回归', () => {
  it('KaTeX 样式与 mermaid 脚本能从依赖解析出来（自包含内联的前提）', () => {
    expect(loadKatexStyle(), 'katex.min.css 未解析到').toBeTruthy()
    expect(loadKatexStyle()).toContain('data:font/woff2;base64,')
    expect(loadMermaidScript(), 'mermaid.min.js 未解析到').toBeTruthy()
  })

  it('未开启增强时不注入任何样式/脚本（既有消费方行为不变）', () => {
    const assets = buildEnhanceAssets({}, false)
    expect(assets.headHtml).toBe('')
    expect(assets.bodyScript).toBe('')
  })

  it('开启 mermaid 且有图时才注入渲染脚本与就绪标志', () => {
    const withMermaid = buildEnhanceAssets({ mermaid: true }, true)
    expect(withMermaid.bodyScript).toContain('window.__docRenderDone = false')
    expect(withMermaid.bodyScript).toContain('window.__docRenderDone = true')
    expect(withMermaid.bodyScript).toContain('mermaid.run')
    expect(withMermaid.headHtml).toContain('.mermaid')

    const withoutMermaid = buildEnhanceAssets({ mermaid: true }, false)
    expect(withoutMermaid.bodyScript).toBe('')
  })

  it('renderTemplateHtml：开启 math 输出 KaTeX HTML，关闭则保持 $ 原文', async () => {
    const md = '公式 $E = mc^2$ 结束'
    const withMath = await renderTemplateHtml(md, {
      template: DOCUMENT_TEMPLATES.generic,
      enhance: { math: true },
    })
    expect(withMath).toContain('katex')
    expect(withMath).not.toContain('$E = mc^2$')
    expect(withMath).toContain('</html>')

    const without = await renderTemplateHtml(md, { template: DOCUMENT_TEMPLATES.generic })
    expect(without).toContain('$E = mc^2$')
    expect(without).not.toContain('katex')
  })

  it('renderTemplateHtml：mermaid 块在开启时转容器并注入脚本，关闭时保持代码块', async () => {
    const md = '```mermaid\ngraph TD;\n  A-->B;\n```'
    const on = await renderTemplateHtml(md, {
      template: DOCUMENT_TEMPLATES.generic,
      enhance: { mermaid: true },
    })
    expect(on).toContain('<div class="mermaid">')
    expect(on).toContain('__docRenderDone')

    const off = await renderTemplateHtml(md, { template: DOCUMENT_TEMPLATES.generic })
    expect(off).toContain('language-mermaid')
    expect(off).not.toContain('__docRenderDone')
  })
})