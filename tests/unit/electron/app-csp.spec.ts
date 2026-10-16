/**
 * 应用 CSP 分流策略（Electron 主进程）
 * @module tests/unit/electron/app-csp
 *
 * 背景（2026-09-15 用户报错「导出的 pdf 中 graph TD 没有渲染成图」）：
 * CSP 装在 session 上，会一并作用到"把本地排版 HTML 渲染成 PDF/长图"的隐藏窗口。
 * 应用界面的严格策略（`script-src 'self'`、无 `font-src`）会拦掉：
 *  - mermaid 运行脚本（内联）→ 图变成 `graph TD` 源码文本；
 *  - KaTeX 内联字体（data:）→ 公式字体退回系统字体；
 * 两者都是静默降级（渲染器等不到就绪标志直接打印）。
 *
 * 这里钉死分流规则：主窗口保持严格，文档渲染窗口放行内联脚本/内联字体但禁止联网。
 */

import { describe, it, expect } from 'vitest'
import { APP_UI_CSP, DOCUMENT_RENDER_CSP, cspForRequest } from '@electron/platform/app-csp'

/** 取某条指令的内容（无该指令时返回 null） */
function directive(csp: string, name: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${name}\\s([^;]+)`).exec(csp)
  return m ? m[1].trim() : null
}

describe('cspForRequest：按 WebContents 分流', () => {
  it('主窗口（id 相符）→ 应用界面严格策略', () => {
    expect(cspForRequest({ webContentsId: 7 }, 7)).toBe(APP_UI_CSP)
  })

  it('其它 WebContents（文档渲染/日记导出隐藏窗口）→ 渲染策略', () => {
    expect(cspForRequest({ webContentsId: 42 }, 7)).toBe(DOCUMENT_RENDER_CSP)
  })

  it('拿不到 webContentsId 时保守按应用界面处理（不放宽）', () => {
    expect(cspForRequest({}, 7)).toBe(APP_UI_CSP)
    expect(cspForRequest({ webContentsId: undefined }, undefined)).toBe(APP_UI_CSP)
  })
})

describe('两条策略的关键指令（防回归）', () => {
  it('应用界面：脚本只允许 self，且不含 unsafe-inline', () => {
    const script = directive(APP_UI_CSP, 'script-src')
    expect(script).toContain("'self'")
    expect(script).not.toContain("'unsafe-inline'")
    // 不显式声明 font-src → 回落 default-src 'self'（data: 字体会被拒，这正是渲染窗口不能沿用它的原因）
    expect(directive(APP_UI_CSP, 'font-src')).toBeNull()
  })

  it('文档渲染窗口：必须放行内联脚本与 data: 字体（否则图/公式静默降级）', () => {
    expect(directive(DOCUMENT_RENDER_CSP, 'script-src')).toContain("'unsafe-inline'")
    expect(directive(DOCUMENT_RENDER_CSP, 'font-src')).toBe('data:')
    expect(directive(DOCUMENT_RENDER_CSP, 'style-src')).toContain("'unsafe-inline'")
  })

  it('文档渲染窗口：仍禁止外部资源与联网（讲义正文来自模型，不得外发）', () => {
    expect(directive(DOCUMENT_RENDER_CSP, 'default-src')).toBe("'none'")
    expect(directive(DOCUMENT_RENDER_CSP, 'connect-src')).toBe("'none'")
    expect(directive(DOCUMENT_RENDER_CSP, 'img-src')).not.toContain('http:')
    expect(directive(DOCUMENT_RENDER_CSP, 'img-src')).not.toContain('https:')
  })
})
