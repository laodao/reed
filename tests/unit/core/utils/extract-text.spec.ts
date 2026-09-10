/**
 * 文件 → 纯文本提取 单测
 * @module tests/unit/core/utils/extract-text
 *
 * 背景：epub 分支此前用 epub-parser 0.2.5 的错误 API（EPub.parse 不存在、
 * 返回结构也没有 sections），任何 epub 上传都会报 "EPub.parse is not a function"。
 * 本测试用真实最小 EPUB3 夹具（fixtures/minibook.epub，生成脚本见 build-minibook.mjs）
 * 锁定修复后的行为：正常提取全部章节纯文本、剥离 HTML 标签、保留阅读顺序。
 *
 * 注意：stripHtmlToText 会把 <b> 等行内标签替换为空白（合并后为单个空格），
 * 中文词组可能因此出现空格（如「这是<b>测试之书</b>的…」→「这是 测试之书 的…」）。
 * 因此正文断言统一按「去空白」口径（compact）比对，避免断言与剥离语义耦合。
 */
import { describe, it, expect } from 'vitest'
import path from 'path'
import { extractTextFromFile } from '@core/utils/extract-text'

const miniBookPath = path.join(__dirname, 'fixtures', 'minibook.epub')
const miniBook2Path = path.join(__dirname, 'fixtures', 'minibook2.epub')

/** 去除全部空白后比对（剥离行内标签产生的空格不影响语料检索） */
function compact(s: string): string {
  return s.replace(/\s+/g, '')
}

describe('extractTextFromFile: epub', () => {
  it('解析真实 epub（EPUB3 + nav + 两章中文正文）成功', async () => {
    const text = await extractTextFromFile(miniBookPath, 'epub')
    const c = compact(text)

    // 标题与正文完整提取（中文 + 章节拼接）
    expect(c).toContain('第一章引子')
    expect(c).toContain('这是测试之书的第一章正文，包含中文与样式标签。')
    expect(c).toContain('第二段：验证多段合并后依旧保留段落分隔。')
    expect(c).toContain('第二章图片')
    expect(c).toContain('本章包含一个自闭合图片引用与空段落。')
    expect(c).toContain('结尾段落。')
  })

  it('剥离章节 HTML 标签与样式，不残留标签文本', async () => {
    const text = await extractTextFromFile(miniBookPath, 'epub')

    // 不应出现标签字符残留（<b>、<style>、<img> 等全被清除）
    expect(text).not.toMatch(/<[a-zA-Z/][^>]*>/)
    expect(text).not.toContain('body { color: #333; }')
    expect(text).not.toContain('logo.svg')
  })

  it('保留 epub spine 的阅读顺序（第一章正文在第二章正文之前）', async () => {
    const text = await extractTextFromFile(miniBookPath, 'epub')
    const c = compact(text)

    const firstChapterBody = c.indexOf('这是测试之书的第一章正文')
    const secondChapterBody = c.indexOf('本章包含一个自闭合图片引用')
    expect(firstChapterBody).toBeGreaterThanOrEqual(0)
    expect(secondChapterBody).toBeGreaterThan(firstChapterBody)
  })
})

describe('extractTextFromFile: epub2（NCX 目录老格式）', () => {
  it('解析 EPUB2 epub 成功：正文完整、标签剥离、按 spine 顺序拼接', async () => {
    const text = await extractTextFromFile(miniBook2Path, 'epub')
    const c = compact(text)

    expect(c).toContain('这是测试之书的第一章正文，包含中文与样式标签。')
    expect(c).toContain('第二段：验证多段合并后依旧保留段落分隔。')
    expect(c).toContain('结尾段落。')
    expect(text).not.toMatch(/<[a-zA-Z/][^>]*>/)

    const first = c.indexOf('这是测试之书的第一章正文')
    const second = c.indexOf('本章包含一个自闭合图片引用')
    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThan(first)
  })
})

describe('extractTextFromFile: 其他类型', () => {
  it('不支持的类型抛错', async () => {
    await expect(
      extractTextFromFile(miniBookPath, 'doc' as never),
    ).rejects.toThrow('不支持的文件类型: doc')
  })
})