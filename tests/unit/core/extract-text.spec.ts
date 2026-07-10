/**
 * extract-text 工具单测
 * @module tests/unit/core/extract-text
 *
 * 重点验证 inferFileType（含补全的 pdf/epub）+ hasGarbledChars + decodeTextFile 基础编码。
 * 文件级解析（pdf/epub/docx）依赖原生库与真实文件，留给端到端验证。
 */

import { describe, it, expect } from 'vitest'
import { inferFileType, hasGarbledChars, decodeTextFile } from '@core/utils/extract-text'

describe('inferFileType', () => {
  it('常见扩展名正确推断', () => {
    expect(inferFileType('script.txt')).toBe('txt')
    expect(inferFileType('script.md')).toBe('md')
    expect(inferFileType('script.docx')).toBe('docx')
    expect(inferFileType('script.doc')).toBe('doc')
    expect(inferFileType('script.xlsx')).toBe('xlsx')
    expect(inferFileType('script.xls')).toBe('xls')
  })

  it('补全 pdf / epub（knowledge-base.getFileType 原本漏掉的）', () => {
    expect(inferFileType('剧本.pdf')).toBe('pdf')
    expect(inferFileType('剧本.epub')).toBe('epub')
  })

  it('大写扩展名兼容', () => {
    expect(inferFileType('A.PDF')).toBe('pdf')
    expect(inferFileType('A.EPUB')).toBe('epub')
    expect(inferFileType('A.DOCX')).toBe('docx')
  })

  it('未知扩展名 / 无扩展名 → null', () => {
    expect(inferFileType('a.unknown')).toBeNull()
    expect(inferFileType('noext')).toBeNull()
    expect(inferFileType('')).toBeNull()
  })
})

describe('hasGarbledChars', () => {
  it('正常中文 / 英文 → false', () => {
    expect(hasGarbledChars('你好世界 hello')).toBe(false)
    expect(hasGarbledChars('plain ascii')).toBe(false)
  })

  it('含 Unicode 替换字符 → true', () => {
    expect(hasGarbledChars('abc�def')).toBe(true)
  })
})

describe('decodeTextFile', () => {
  it('UTF-8 文本正确解码', () => {
    const buf = Buffer.from('你好剧本', 'utf-8')
    expect(decodeTextFile(buf)).toBe('你好剧本')
  })

  it('UTF-8 BOM 被正确去除', () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('你好', 'utf-8'),
    ])
    expect(decodeTextFile(buf)).toBe('你好')
  })
})
