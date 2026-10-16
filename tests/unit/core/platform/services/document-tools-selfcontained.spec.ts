/**
 * 讲义导出 HTML 的「自包含」契约（mermaid / KaTeX）
 * @module tests/unit/core/platform/services/document-tools-selfcontained
 *
 * 背景（2026-09-15 用户报错「导出的 pdf 中 graph TD 没有渲染成图」）：
 * 排版 HTML 要在**隐藏窗口**里渲染成 PDF/长图，页面必须自带两样东西——
 *  1. `<div class="mermaid">` 容器 + **内联** mermaid 运行脚本（含就绪标志 `__docRenderDone`）；
 *  2. KaTeX 样式里以 **data: 内联**的字体（隐藏窗口没有本地字体目录）。
 * 一旦它们缺失，或是被 CSP 拦掉（见 tests/unit/electron/app-csp.spec.ts），导出会"静默少图"。
 * 这里钉死 HTML 侧的自包含契约（浏览器渲染侧由 progress/_mermaid_renderer_e2e.cjs 端到端复验）。
 *
 * 附带：把两份样本写到 progress/，供 `progress/_mermaid_renderer_e2e.cjs` 端到端脚本使用。
 */

import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderTemplateHtml, DOCUMENT_TEMPLATES } from '@core/platform/services/document-tools/templates'

/** 一段真实形态的讲义正文（含 graph TD 图、flowchart 图、行内/块级公式、表格） */
const LESSON_MD = `# 金融资产的基本类型

> 一句话定义：按「权利性质」把可交易的东西分成股权 / 债权 / 商品 / 外汇 / 衍生品。

## 组成/结构

### 分类骨架
\`\`\`mermaid
graph TD
  A[金融资产] --> B[原生资产 / 现货]
  A --> C[衍生品：合约]
  B --> B1[股权：普通股/优先股]
  C --> C1[按标的：股权类、利率类]
\`\`\`

### 载体对照
| 类别 | 常见载体 |
| --- | --- |
| 股权 | 直接买股票 / 股票基金 |
| 债权 | 直接买债 / 债券基金 |

## 机制

### 折现
今天 P 元、年利率 r，n 年后：$FV = P(1+r)^n$。

\`\`\`mermaid
flowchart LR
  A["今天的 P 元"] -- "乘 (1+r)^n" --> B["n 年后的钱"]
\`\`\`
`

/** 小样本（只含一张 mermaid 图）：写盘给隐藏窗口端到端脚本做可视验证 */
const MINI_MD = '# 图渲染验证\n\n```mermaid\ngraph TD\n  A[开始] --> B{判断}\n  B -->|是| C[结束]\n  B -->|否| A\n```\n'

async function buildHtml(md: string): Promise<string> {
  return await renderTemplateHtml(md, {
    template: DOCUMENT_TEMPLATES.learningLesson,
    title: '金融资产的基本类型',
    enhance: { math: true, mermaid: true },
  })
}

describe('讲义导出 HTML 自包含契约', () => {
  it('mermaid 代码块转成容器（不留 language-mermaid 代码块），并内联渲染脚本与就绪标志', async () => {
    const html = await buildHtml(LESSON_MD)

    expect(html).toContain('<div class="mermaid">')
    expect(html).not.toContain('language-mermaid')
    // 内联渲染脚本 + 就绪标志（渲染器据此等待）
    expect(html).toContain('window.__docRenderDone = false;')
    expect(html).toContain('window.__docRenderDone = true;')
    // mermaid 运行库确实内联进来了（不是外链 <script src>）
    expect(html).not.toMatch(/<script[^>]+src=/i)
    // 内联库体量本身就超过 ElectronDocumentRenderer 的 data: URL 阈值（1.5MB）→ 走临时文件分支
    expect(html.length).toBeGreaterThan(1_500_000)
  })

  it('公式渲染成 KaTeX HTML，字体以 data: 内联（隐藏窗口无本地字体目录）', async () => {
    const html = await buildHtml(LESSON_MD)

    expect(html).toContain('class="katex"')
    expect(html).toContain('data:font/woff2;base64,')
    expect(html).toContain('.katex-display')
  })

  it('落盘小样本，供 progress/_mermaid_renderer_e2e.cjs 做隐藏窗口端到端复验', async () => {
    const mini = await buildHtml(MINI_MD)
    expect(mini).toContain('<div class="mermaid">')
    writeFileSync(resolve(process.cwd(), 'progress/_dl_mermaid_only.html'), mini, 'utf-8')
  })
})
