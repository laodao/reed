/**
 * extract-text 工具单测
 * @module tests/unit/core/extract-text
 *
 * 重点验证 inferFileType（含补全的 pdf/epub/mobi/azw3）+ hasGarbledChars + decodeTextFile
 * 基础编码。mobi/azw3 用手工构造的最小 MOBI 文件跑真实解析全链路（无压缩 PalmDOC，
 * 含 KF8 解析失败回退老 MOBI 入口的路径）；pdf/epub/docx 依赖原生库与真实文件，留给端到端验证。
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { inferFileType, hasGarbledChars, decodeTextFile, extractTextFromFile } from '@core/utils/extract-text'

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

  it('新增电子书格式 mobi / azw3', () => {
    expect(inferFileType('小说.mobi')).toBe('mobi')
    expect(inferFileType('小说.azw3')).toBe('azw3')
    expect(inferFileType('BOOK.MOBI')).toBe('mobi')
    expect(inferFileType('BOOK.AZW3')).toBe('azw3')
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

// ==================== mobi / azw3 文件级解析 ====================

/** 写入 u16/u32 大端 */
function w16(buf: Buffer, offset: number, val: number) {
  buf.writeUInt16BE(val, offset)
}
function w32(buf: Buffer, offset: number, val: number) {
  buf.writeUInt32BE(val, offset)
}

/**
 * 构造最小可解析的老 MOBI（PalmDOC 无压缩 + UTF-8）：
 * PDB 头(78B) + 记录表(2 条) + record0(PalmDOC 头 16B + MOBI 头 232B + EXTH 12B + 书名) + 1 条文本记录。
 * 必须带空 EXTH 且 exthFlag 含 0x40：库在构造器无条件读 exth.boundary，缺了会直接抛错。
 * 正文必须包 <html><body>…</body></html>（老 MOBI 惯例）：库无条件把首章裁到 <body> 后、
 * 末章裁到 </body> 前，缺失时 indexOf 为 -1 会静默丢掉首尾字节。
 */
function buildMinimalMobi(text: string, title = '测试书'): Buffer {
  const titleBytes = Buffer.from(title, 'utf-8')
  const body = `<html><body>${text}</body></html>`
  const textBytes = Buffer.from(body, 'utf-8')

  const record0Len = 16 + 232 + 12 + titleBytes.length
  const record0Offset = 78 + 2 * 8
  const record1Offset = record0Offset + record0Len
  const totalLen = record1Offset + textBytes.length
  const buf = Buffer.alloc(totalLen)

  // PDB 头
  buf.write('test-ebook', 0, 'latin1')
  buf.write('BOOK', 60, 'latin1')
  buf.write('MOBI', 64, 'latin1')
  w32(buf, 68, 1) // uniqueIDseed
  w16(buf, 76, 2) // numRecords
  // 记录表：record0 / record1 偏移
  w32(buf, 78, record0Offset)
  w32(buf, 86, record1Offset)

  // record0 起：PalmDOC 头（compression=1 无压缩）
  const r0 = record0Offset
  w16(buf, r0 + 0, 1) // compression
  w16(buf, r0 + 2, 0) // unused
  w32(buf, r0 + 4, textBytes.length) // textLength
  w16(buf, r0 + 8, 1) // numTextRecords
  w16(buf, r0 + 10, 4096) // recordSize
  w16(buf, r0 + 12, 0) // encryption

  // MOBI 头（偏移相对 record0）
  buf.write('MOBI', r0 + 16, 'latin1')
  w32(buf, r0 + 20, 232) // headerLength
  w32(buf, r0 + 24, 2) // type
  w32(buf, r0 + 28, 65001) // encoding UTF-8
  w32(buf, r0 + 32, 1) // uid
  w32(buf, r0 + 36, 6) // version（<8 = 老 MOPI，非 KF8）
  w32(buf, r0 + 84, 16 + 232 + 12) // titleOffset（紧跟 EXTH 之后）
  w32(buf, r0 + 88, titleBytes.length) // titleLength
  buf[r0 + 94] = 0 // localeRegion
  buf[r0 + 95] = 4 // localeLanguage = zh
  w32(buf, r0 + 108, 2) // resourceStart
  w32(buf, r0 + 128, 0x40) // exthFlag：声明 EXTH 存在
  w32(buf, r0 + 240, 0) // trailingFlags
  w32(buf, r0 + 244, 0xffffffff) // indx（无 INDX）

  // 空 EXTH 头
  const exth = r0 + 16 + 232
  buf.write('EXTH', exth, 'latin1')
  w32(buf, exth + 4, 12) // headerLength
  w32(buf, exth + 8, 0) // recordCount

  // 书名
  titleBytes.copy(buf, r0 + 16 + 232 + 12)

  // 文本记录（record1）
  textBytes.copy(buf, record1Offset)
  return buf
}

describe('extractTextFromFile: mobi / azw3', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-text-spec-'))
  const text = [
    '第一章 风起。北方的城池笼罩在暮色之中。',
    '<mbp:pagebreak/>',
    '第二章 云涌。斥候快马加鞭带回前线的消息。',
  ].join('\n')
  const expected = '第一章 风起。北方的城池笼罩在暮色之中。 第二章 云涌。斥候快马加鞭带回前线的消息。'

  it('.mobi 全链路解析（KF8 入口抛错回退老 MOBI）', async () => {
    const filePath = path.join(dir, 'fixture.mobi')
    fs.writeFileSync(filePath, buildMinimalMobi(text))
    const result = await extractTextFromFile(filePath, 'mobi')
    expect(result.replace(/\s+/g, ' ').trim()).toBe(expected)
  })

  it('.azw3 全链路解析（同一解析函数按扩展名分派）', async () => {
    const filePath = path.join(dir, 'fixture.azw3')
    fs.writeFileSync(filePath, buildMinimalMobi(text))
    const result = await extractTextFromFile(filePath, 'azw3')
    expect(result.replace(/\s+/g, ' ').trim()).toBe(expected)
  })

  it('不含 HTML 标签残留', async () => {
    const htmlText = '<h1>标题</h1><p>正文段落。</p><mbp:pagebreak/><p>第二节内容。</p>'
    const filePath = path.join(dir, 'fixture-html.mobi')
    fs.writeFileSync(filePath, buildMinimalMobi(htmlText))
    const result = await extractTextFromFile(filePath, 'mobi')
    expect(result).not.toMatch(/<[a-z][^>]*>/i)
    expect(result).toContain('标题')
    expect(result).toContain('正文段落。')
    expect(result).toContain('第二节内容。')
  })
})
