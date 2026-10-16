/**
 * 标题层级推导与元信息标题识别 单测
 * @module heading-level
 *
 * 背景（真实文档实证）：
 * - 《深度学习》epub 的 NCX 目录是扁平的（363 项无嵌套），但标题文本自带编号
 *   （「第1章 引言」「1.1 本书面向的读者」「1.2.1 神经网络的众多名称…」）→
 *   层级应由编号模式推导，而不是只用目录深度（否则 363 项全平铺）
 * - numpy PDF 的字体分层把「Release 2.5.0」「Written by the NumPy community」这类
 *   元信息行判成标题，导致小节全部挂到元信息下（层级错挂）
 */
import { describe, it, expect } from 'vitest'
import { inferHeadingLevel, isMetadataHeading } from '@core/utils/heading-level'

describe('inferHeadingLevel', () => {
  it('中文章节编号：第N章/篇 → 1 级，第N节 → 2 级', () => {
    expect(inferHeadingLevel('第1章　引言', 2)).toBe(1)
    expect(inferHeadingLevel('第十二章 法律责任', 2)).toBe(1)
    expect(inferHeadingLevel('第2节　公司登记', 2)).toBe(2)
    expect(inferHeadingLevel('第二部分 深度网络', 2)).toBe(1)
  })

  it('阿拉伯数字编号：N → 1 级，N.N → 2 级，N.N.N → 3 级', () => {
    expect(inferHeadingLevel('1. What is NumPy?', 3)).toBe(1)
    expect(inferHeadingLevel('1.1 Why is NumPy fast?', 3)).toBe(2)
    expect(inferHeadingLevel('2.6 Advanced indexing and index tricks', 3)).toBe(2)
    expect(inferHeadingLevel('2.6.1 Indexing with arrays of indices', 3)).toBe(3)
    expect(inferHeadingLevel('12.4.6 历史展望', 2)).toBe(3)
  })

  it('全大写部件标题（篇/部） → 2 级', () => {
    expect(inferHeadingLevel('GETTING STARTED', 3)).toBe(2)
    expect(inferHeadingLevel('NUMPY QUICKSTART', 3)).toBe(2)
  })

  it('无编号标题保留 fallback（目录深度或原层级）', () => {
    expect(inferHeadingLevel('书名页', 1)).toBe(1)
    expect(inferHeadingLevel('译者序', 2)).toBe(2)
    expect(inferHeadingLevel('深度学习', 1)).toBe(1)
  })
})

describe('isMetadataHeading', () => {
  it('版本/发布信息与署名行 → 元信息（应降级为正文）', () => {
    expect(isMetadataHeading('Release 2.5.0')).toBe(true)
    expect(isMetadataHeading('Written by the NumPy community')).toBe(true)
    expect(isMetadataHeading('June 28, 2026')).toBe(true)
    expect(isMetadataHeading('© 2016 Massachusetts Institute of Technology')).toBe(true)
  })

  it('真实章节标题不误判', () => {
    for (const t of [
      'NumPy User Guide',
      'WHAT IS NUMPY?',
      '1.1 Why is NumPy fast?',
      '第1章　引言',
      'GETTING STARTED',
      '深度学习',
      '第二章　　公司登记',
    ]) {
      expect(isMetadataHeading(t), t).toBe(false)
    }
  })
})