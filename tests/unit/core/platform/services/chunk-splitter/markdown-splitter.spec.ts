/**
 * Markdown 段落感知子切 单测
 * @module chunk-splitter/markdown-splitter
 *
 * 背景：pdf/epub 经 pdf-inspector / anydoc 转成 Markdown 后，长章节不再走
 * embedding 语义切分（依赖外部 API + 8000 字符硬切会把句子切断），
 * 改为按「段落（空行分隔）」边界子切：切点永远落在段落边界，
 * 只有单个段落超过上限时才按句子边界兜底。
 */
import { describe, it, expect } from 'vitest'
import { splitSectionByParagraphs } from '@core/platform/services/chunk-splitter/markdown-splitter'

const SPLIT_OPTS = { maxChunkSize: 1500, minChunkSize: 200 }
const PARENT = { title: '测试章节', level: 1, sectionPath: ['测试章节'], sectionIndex: 0 }

/** 生成 n 段、每段约 len 字符的段落数组（句子以句号结尾） */
function makeParagraphs(n: number, len: number): string[] {
  const paras: string[] = []
  for (let i = 0; i < n; i++) {
    const sentence = `这是第${i}段的故事内容，讲述一些连续的情节发展，并带有足够的信息量供切分器判断。`
    const repeat = Math.max(1, Math.floor(len / sentence.length))
    paras.push(`段落${i} ` + sentence.repeat(repeat).slice(0, len - 10) + '。')
  }
  return paras
}

describe('splitSectionByParagraphs', () => {
  it('短内容（未超上限）整体作为一个块，段落完整保留', () => {
    const paras = makeParagraphs(2, 200)
    const chunks = splitSectionByParagraphs(paras.join('\n\n'), SPLIT_OPTS, PARENT)

    expect(chunks.length).toBe(1)
    expect(chunks[0].content).toContain('段落0')
    expect(chunks[0].content).toContain('段落1')
  })

  it('超上限时在段落边界切分，任何段落都不被切开', () => {
    // 10 段 × 400 字符 ≈ 4000 字符，够切 3 块
    const paras = makeParagraphs(10, 400)
    const chunks = splitSectionByParagraphs(paras.join('\n\n'), SPLIT_OPTS, PARENT)

    expect(chunks.length).toBeGreaterThan(1)
    // 每个 chunk 的长度不超过上限（允许尾块）
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(SPLIT_OPTS.maxChunkSize + 10)
    }
    // 每个 chunk 由「完整段落」组成：按空行切开的每一段都在原始段落集合中
    const allParas = new Set(paras)
    for (const c of chunks) {
      for (const block of c.content.split('\n\n')) {
        expect(allParas.has(block)).toBe(true)
      }
    }
    // 全部段落都被覆盖且不重复
    const joined = chunks.map(c => c.content).join('\n\n')
    for (const p of paras) {
      expect(joined).toContain(p)
    }
  })

  it('单个超长段落（无空行）按句子边界切，不把句子拦腰截断', () => {
    // 约 3060 字符、以句号结尾、无空行分隔的超长段落（整句重复，避免截断在半句）
    const sentence = '这是由许多完整句子组成的超长段落。'
    const longPara = sentence.repeat(Math.ceil(3000 / sentence.length))
    expect(longPara.includes('\n\n')).toBe(false)
    expect(longPara.trim().endsWith('。')).toBe(true)

    const chunks = splitSectionByParagraphs(longPara, SPLIT_OPTS, PARENT)
    expect(chunks.length).toBeGreaterThan(1)

    for (const c of chunks) {
      // 长度约束（句子切分后有 ±句号 余量）
      expect(c.content.length).toBeLessThanOrEqual(SPLIT_OPTS.maxChunkSize + sentence.length + 2)
      // 除最后一块外，每块应以句号结尾（句子边界）
      const endsProper = /[。！？.!?]$/.test(c.content.trim())
      expect(endsProper).toBe(true)
    }
  })

  it('剥离章节标题行（标题由父 chunk 承载，不重复进入正文）', () => {
    const paras = ['正文内容第一段。', '正文内容第二段。']
    const content = `# 章节标题\n\n${paras.join('\n\n')}`
    const chunks = splitSectionByParagraphs(content, SPLIT_OPTS, PARENT)

    expect(chunks.length).toBe(1)
    expect(chunks[0].content).not.toContain('# 章节标题')
    expect(chunks[0].content).toContain('正文内容第一段。')
  })
})