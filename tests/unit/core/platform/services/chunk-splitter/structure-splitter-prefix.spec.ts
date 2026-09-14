/**
 * 结构切分「前言内容不丢失」单测
 * @module chunk-splitter/structure-prefix
 *
 * 背景（审计发现）：StructureDetector 按「标题→下一标题」构建 sections，
 * 第一个被识别标题之前的全部内容（书名页/版权/目录/未命中正则的章节）
 * 不落在任何 section 内，会被结构切分整体丢弃。
 * 例：《深度学习》epub 的 md 用「第N章」行触发小说章节检测，但检测到的
 * 第一个章节是「第5章」——版权页 + 第1~4 章约 15.6 万字符全部丢失。
 * 修复：结构切分时把首个 section 之前的前缀作为「无标题前言」chunk 保留。
 */
import { describe, it, expect } from 'vitest'
import { StructureSplitter } from '@core/platform/services/chunk-splitter/structure-splitter'
import type { StructureInfo } from '@core/platform/services/chunk-splitter/types'

const splitter = new StructureSplitter()

describe('StructureSplitter: 前言内容保留', () => {
  it('markdown 结构：首标题前的前言并入输出，不丢失', () => {
    const content = [
      '书名页与版权声明内容。',
      '',
      '# 第一章 开始',
      '',
      '第一章正文。',
      '',
      '# 第二章 深入',
      '',
      '第二章正文。',
    ].join('\n')

    const structure: StructureInfo = {
      hasStructure: true,
      structureType: 'markdown',
      sections: [
        { title: '第一章 开始', level: 1, content: '# 第一章 开始\n\n第一章正文。', startIndex: content.indexOf('# 第一章'), endIndex: content.indexOf('# 第二章') },
        { title: '第二章 深入', level: 1, content: '# 第二章 深入\n\n第二章正文。', startIndex: content.indexOf('# 第二章'), endIndex: content.length },
      ],
    }

    const chunks = splitter.split(content, structure)
    const joined = chunks.map((c) => c.content).join('\n')

    // 前言内容必须被保留（首个 chunk 或合并后）
    expect(joined).toContain('书名页与版权声明内容。')
    expect(joined).toContain('第一章正文。')
    expect(joined).toContain('第二章正文。')
  })

  it('novel 结构：首个「第N章」之前的内容保留（修复《深度学习》式文档丢失）', () => {
    const content = [
      '版权与前言，这里是一长段不匹配章节格式的开头内容，包含目录与著者信息。',
      '',
      '第5章 机器学习基础',
      '',
      '第五章正文。',
      '',
      '第6章 深度前馈网络',
      '',
      '第六章正文。',
    ].join('\n')

    const structure: StructureInfo = {
      hasStructure: true,
      structureType: 'novel',
      sections: [
        { title: '第5章 机器学习基础', level: 1, content: '第5章 机器学习基础\n\n第五章正文。', startIndex: content.indexOf('第5章'), endIndex: content.indexOf('第6章') },
        { title: '第6章 深度前馈网络', level: 1, content: '第6章 深度前馈网络\n\n第六章正文。', startIndex: content.indexOf('第6章'), endIndex: content.length },
      ],
    }

    const chunks = splitter.split(content, structure)
    const joined = chunks.map((c) => c.content).join('\n')

    expect(joined).toContain('版权与前言，这里是一长段不匹配章节格式的开头内容')
    expect(joined).toContain('第五章正文。')
    expect(joined).toContain('第六章正文。')
  })

  it('第一个标题恰好位于文档开头时，不产生空前言 chunk', () => {
    const content = ['# 仅一章', '', '正文内容。'].join('\n')

    const structure: StructureInfo = {
      hasStructure: true,
      structureType: 'markdown',
      sections: [
        { title: '仅一章', level: 1, content: content, startIndex: 0, endIndex: content.length },
      ],
    }

    const chunks = splitter.split(content, structure)
    // 不出现空内容 chunk
    expect(chunks.every((c) => c.content.trim().length > 0)).toBe(true)
  })
})