/**
 * 长图滚动条修复测试（applyLongImageFix）
 * @module tests/unit/core/services/document-tools
 * @description 长图截图必须无滚动条：注入样式要隐藏滚动条、防超长 URL/表格横向撑破、
 *              且覆盖所有排版模板生成的 HTML。防止"生成图带滚动条"问题回归。
 */
import { describe, it, expect } from 'vitest'
import { applyLongImageFix, LONG_IMAGE_FIX_CSS } from '@core/services/document-tools/document-tools'
import { renderTemplateHtml, DOCUMENT_TEMPLATES } from '@core/services/document-tools/templates'

describe('applyLongImageFix（长图无滚动条）', () => {
  it('在 </head> 前注入隐藏滚动条与防溢宽样式', async () => {
    const html = await renderTemplateHtml('# 标题\n\n正文', { template: DOCUMENT_TEMPLATES.generic })
    expect(html).toContain('</head>')
    const fixed = applyLongImageFix(html)
    expect(fixed).toContain('::-webkit-scrollbar')
    expect(fixed).toContain('overflow-wrap: anywhere')
    expect(fixed).toContain('word-break: break-word')
    // 注入的样式必须位于 <head> 区（</head> 之前），不能落进正文
    const [head, body] = fixed.split('</head>')
    expect(head).toContain('::-webkit-scrollbar')
    expect(body).toContain('正文')
    // 只注入一次（不存在重复 </head> 产生的重复样式）
    expect(fixed.match(/::-webkit-scrollbar/g)?.length).toBe(1)
  })

  it('无 </head> 的 HTML 也兜底注入（不炸）', () => {
    const fixed = applyLongImageFix('<html><body>x</body></html>')
    expect(fixed).toContain('::-webkit-scrollbar')
  })

  it('对全部内置排版模板生成的 HTML 都可注入且不丢内容', async () => {
    const md = '# 标题\n\n正文\n\n## 章节\n\n- 列表项很长的内容\n\n> 引用很长\n\n[超长链接](http://www.baidu.com/link?url=' + 'a'.repeat(300) + ')'
    for (const id of Object.keys(DOCUMENT_TEMPLATES)) {
      const html = await renderTemplateHtml(md, { template: DOCUMENT_TEMPLATES[id], title: 'T' })
      const fixed = applyLongImageFix(html)
      expect(fixed, id).toContain('::-webkit-scrollbar')
      expect(fixed, id).toContain('overflow-wrap: anywhere')
      expect(fixed, id).toContain('超长链接')
      // 注入不破坏结构：仍以 </html> 收尾
      expect(fixed.trimEnd(), id).toMatch(/<\/html>$/i)
    }
  })

  it('关键防溢宽选择器覆盖长 URL/表格/图片/代码/列表项（长图横滚与裁切根因）', () => {
    for (const sel of ['a', 'table', 'img', 'pre', 'code', 'blockquote', 'td', 'th', 'li', 'ol', 'ul', 'p', 'h2', 'h3']) {
      expect(LONG_IMAGE_FIX_CSS, `缺 ${sel}`).toContain(sel)
    }
  })
})
