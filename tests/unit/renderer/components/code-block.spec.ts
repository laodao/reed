/**
 * 代码块占位符工具单测
 *
 * 覆盖场景：
 * - 闭合/未闭合（流式）代码块提取
 * - CRLF 行尾、无语言、特殊语言名（c++/c#）
 * - 多个代码块 + 中间正文
 * - 占位符不被 marked GFM 粗体/斜体语法破坏（bug 根因回归）
 * - 还原时代码 HTML 含 $、$& 等特殊序列不被错误展开
 */
import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import {
  extractCodeBlocks,
  makeCodeBlockPlaceholder,
  restoreCodeBlocks,
  hasOpenCodeBlock,
  escapeHtmlKeepPlaceholders
} from '../../../../src/renderer/src/components/chat/code-block'

const F = '```'

describe('extractCodeBlocks', () => {
  it('提取闭合代码块（带语言）', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(
      `前置文字\n${F}js\nconsole.log(1)\n${F}\n后置文字`
    )
    expect(blocks).toEqual([
      { language: 'js', code: 'console.log(1)', closed: true }
    ])
    expect(contentWithPlaceholders).toBe(
      `前置文字\n${makeCodeBlockPlaceholder(0)}\n后置文字`
    )
  })

  it('提取闭合代码块（无语言）', () => {
    const { blocks } = extractCodeBlocks(`${F}\nplain text\n${F}`)
    expect(blocks).toEqual([{ language: '', code: 'plain text', closed: true }])
  })

  it('提取闭合代码块（特殊语言名 c++ / c#）', () => {
    const { blocks } = extractCodeBlocks(`${F}c++\nint x;\n${F}`)
    expect(blocks[0].language).toBe('c++')

    const r2 = extractCodeBlocks(`${F}c#\nint y;\n${F}`)
    expect(r2.blocks[0].language).toBe('c#')
  })

  it('兼容 CRLF 行尾', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(
      `文字\r\n${F}python\r\nx = 1\r\n${F}\r\n结尾`
    )
    expect(blocks).toEqual([{ language: 'python', code: 'x = 1', closed: true }])
    expect(contentWithPlaceholders).toContain(makeCodeBlockPlaceholder(0))
    expect(contentWithPlaceholders).toContain('结尾')
  })

  it('提取未闭合代码块（流式输出中）', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(
      `前面文字\n${F}js\nconsole.log(1)`
    )
    expect(blocks).toEqual([
      { language: 'js', code: 'console.log(1)', closed: false }
    ])
    expect(contentWithPlaceholders).toBe(
      `前面文字\n${makeCodeBlockPlaceholder(0)}`
    )
  })

  it('闭合代码块 + 尾部未闭合代码块混合', () => {
    const { blocks } = extractCodeBlocks(
      `intro\n${F}js\na\n${F}\nmid\n${F}py\nb`
    )
    expect(blocks).toEqual([
      { language: 'js', code: 'a', closed: true },
      { language: 'py', code: 'b', closed: false }
    ])
  })

  it('多个闭合代码块按顺序编号', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(
      `${F}js\none\n${F}\n中间文字\n${F}py\ntwo\n${F}`
    )
    expect(blocks.map(b => b.language)).toEqual(['js', 'py'])
    expect(contentWithPlaceholders).toBe(
      `${makeCodeBlockPlaceholder(0)}\n中间文字\n${makeCodeBlockPlaceholder(1)}`
    )
  })

  it('代码块内部再出现 fence 样式字符串不会被错误拆分（非贪婪闭合）', () => {
    const { blocks } = extractCodeBlocks(`${F}md\n# 标题\n正文\n${F}`)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe('# 标题\n正文')
  })

  it('保留代码内部空行', () => {
    const { blocks } = extractCodeBlocks(`${F}js\na\n\nb\n${F}`)
    expect(blocks[0].code).toBe('a\n\nb')
  })

  it('无代码块时原样返回', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks('普通文字\n没有代码')
    expect(blocks).toEqual([])
    expect(contentWithPlaceholders).toBe('普通文字\n没有代码')
  })
})

describe('占位符与 marked 的兼容性（bug 回归）', () => {
  it('占位符经 marked 解析后保持原样（不被 GFM 粗体/斜体吃掉）', () => {
    const { contentWithPlaceholders, blocks } = extractCodeBlocks(
      `前置文字\n${F}js\nconsole.log(1)\n${F}\n后置文字`
    )
    const parsed = marked.parse(contentWithPlaceholders, {
      breaks: true,
      gfm: true
    }) as string

    // 占位符必须原样存在于解析结果中，否则还原失败 → 页面显示 CLOSED_CODE_BLOCK_0
    expect(parsed).toContain(makeCodeBlockPlaceholder(0))

    // 还原成功
    const restored = restoreCodeBlocks(parsed, blocks, b =>
      `<div class="code-block-wrapper">${b.code}</div>`
    )
    expect(restored).toContain('console.log(1)')
    expect(restored).not.toContain(makeCodeBlockPlaceholder(0))
    // 不能再出现旧的粗体解析残留
    expect(restored).not.toContain('<strong>')
  })

  it('未闭合代码块场景：占位符同样能安全经过 marked', () => {
    const { contentWithPlaceholders, blocks } = extractCodeBlocks(
      `前面\n${F}js\npartial`
    )
    const parsed = marked.parse(contentWithPlaceholders, {
      breaks: true,
      gfm: true
    }) as string
    expect(parsed).toContain(makeCodeBlockPlaceholder(0))
    const restored = restoreCodeBlocks(parsed, blocks, b => `[OPEN:${b.code}]`)
    expect(restored).toContain('[OPEN:partial]')
  })
})

describe('restoreCodeBlocks', () => {
  it('代码 HTML 含 $、$& 等特殊序列时不被 replace 展开语义破坏', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(
      `${F}bash\necho "$& $1 $$"\n${F}`
    )
    const restored = restoreCodeBlocks(contentWithPlaceholders, blocks, b =>
      `<pre>${b.code}</pre>`
    )
    expect(restored).toContain('echo "$& $1 $$"')
  })

  it('还原所有占位符', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(
      `${F}js\na\n${F}\n文字\n${F}py\nb\n${F}`
    )
    const restored = restoreCodeBlocks(contentWithPlaceholders, blocks, b =>
      `[${b.language}]`
    )
    expect(restored).toBe('[js]\n文字\n[py]')
  })
})

describe('escapeHtmlKeepPlaceholders', () => {
  it('转义 HTML 字符但保留占位符可被 restore 匹配', () => {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(
      `a < b & c\n${F}js\nx\n${F}`
    )
    const escaped = escapeHtmlKeepPlaceholders(contentWithPlaceholders)
    expect(escaped).toContain('a &lt; b &amp; c')
    const restored = restoreCodeBlocks(escaped, blocks, b => `<pre>${b.code}</pre>`)
    expect(restored).toContain('<pre>x</pre>')
  })
})

describe('hasOpenCodeBlock', () => {
  it('奇数个 fence 判定为未闭合', () => {
    expect(hasOpenCodeBlock(`text\n${F}js\ncode`)).toBe(true)
    expect(hasOpenCodeBlock('``')).toBe(false) // 两个反引号不算 fence
    expect(hasOpenCodeBlock(`${F}js\nx\n${F}`)).toBe(false)
    expect(hasOpenCodeBlock('')).toBe(false)
  })
})
