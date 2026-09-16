/**
 * 讲义导出纯规则测试（dl-lesson-export.rules）
 *
 * 钉死：单篇讲义 markdown 的骨架与顺序、空清单整段消失、前置合并去重、
 * 区标题回退、元信息开关、文件名清洗与版本后缀。
 * 全部纯函数断言，不碰 IO / 渲染。
 */

import { describe, it, expect } from 'vitest'
import {
  buildLessonMarkdown,
  lessonExportFilename,
  mergePrereqNames,
  sanitizeFilenamePart,
} from '@core/packs/domain-learning/rules/learning-lesson-export.rules'
import type { LessonExportInput } from '@core/packs/domain-learning/rules/learning-lesson-export.rules'

function input(over: Partial<LessonExportInput> = {}): LessonExportInput {
  return {
    concept: {
      name: '指数基金与定投',
      nodeType: 'concept',
      desc: '以跟踪指数为目标的基金，配合定期定额买入。',
      mastery: 'learning',
      prereqs: ['资产配置与分散化'],
      declaredPrereqs: ['资产配置与分散化', '复利与时间价值'],
    },
    card: {
      essenceType: 'K-concept',
      version: 2,
      status: 'draft',
      sections: [
        { key: 'meta', title: '本质与定位', md: '指数基金是把…', takeaway: '先记住：买的是指数，不是基金经理。' },
        { key: 'definition', title: '定义', md: '## 定义\n\n它是一种…' },
        { key: 'selfcheck', title: '检验', md: '' },
      ],
      works: [{ kind: '专著', title: '共同基金常识', authors: 'John Bogle', year: '2007' }],
      evidenceSources: [{ kind: 'kb', title: '指数基金投资指南', url: 'https://example.com/a' }],
    },
    context: { spaceName: '金融理财', goal: '入门', exportedAtLabel: '2026-09-15 10:30' },
    ...over,
  }
}

describe('mergePrereqNames', () => {
  it('图上前置在前、声明前置补后，去空去重保持顺序', () => {
    expect(mergePrereqNames(['A', 'B'], ['B', ' C ', '', 'D'])).toEqual(['A', 'B', 'C', 'D'])
    expect(mergePrereqNames(undefined, undefined)).toEqual([])
  })
})

describe('buildLessonMarkdown', () => {
  it('输出概念名标题 + 元信息 + 各内容区 + 著作 + 证据（顺序钉死）', () => {
    const md = buildLessonMarkdown(input())
    const idx = (s: string) => md.indexOf(s)

    expect(md.startsWith('# 指数基金与定投\n')).toBe(true)
    expect(md).toContain('> 领域：金融理财 · 学习目标：入门')
    expect(md).toContain('> 类型：概念 · 掌握度：学习中 · 讲义：v2（草稿） · 本质：概念')
    expect(md).toContain('> 一句话定义：以跟踪指数为目标的基金，配合定期定额买入。')
    // 前置合并去重（声明里的重复项不重复出现）
    expect(md).toContain('> 前置：资产配置与分散化、复利与时间价值')
    expect(md).toContain('> 导出于 2026-09-15 10:30')

    expect(idx('## 本质与定位')).toBeGreaterThan(idx('> 导出于'))
    expect(idx('## 定义')).toBeGreaterThan(idx('## 本质与定位'))
    expect(idx('## 相关著作')).toBeGreaterThan(idx('## 定义'))
    expect(idx('## 证据来源')).toBeGreaterThan(idx('## 相关著作'))

    // 结论条以引用行渲染在区正文之前
    expect(md).toContain('> 先记住：买的是指数，不是基金经理。')
    // 著作/证据行
    expect(md).toContain('- **共同基金常识** · John Bogle · 2007 · [专著]')
    expect(md).toContain('- [kb] 指数基金投资指南 · https://example.com/a')
  })

  it('空区跳过、空 works/evidence 整段消失（不输出空小节）', () => {
    const md = buildLessonMarkdown(
      input({
        card: {
          essenceType: 'K-concept',
          version: 1,
          status: 'published',
          sections: [{ key: 'meta', title: '本质', md: '内容' }, { key: 'empty', title: '空区', md: '   ' }],
          works: [],
          evidenceSources: null,
        },
      }),
    )
    expect(md).toContain('## 本质')
    expect(md).not.toContain('## 空区')
    expect(md).not.toContain('## 相关著作')
    expect(md).not.toContain('## 证据来源')
    expect(md).toContain('讲义：v1（已发布）')
  })

  it('区无 title 时回退 key；includeMeta=false 时不出元信息', () => {
    const md = buildLessonMarkdown(
      input({
        card: {
          essenceType: 'K-oper',
          version: 3,
          status: 'draft',
          sections: [{ key: 'steps', md: '第一步…' }],
        },
        context: { spaceName: '金融理财', goal: null, exportedAtLabel: '', includeMeta: false },
      }),
    )
    expect(md).toContain('## steps')
    expect(md).not.toContain('> 领域：')
    expect(md).not.toContain('> 导出于')
  })

  it('缺掌握度/类型/定义时不产出空占位（未知掌握度回退「待学」）', () => {
    const md = buildLessonMarkdown(
      input({
        concept: { name: '裸概念', mastery: null, desc: null, prereqs: [], declaredPrereqs: [] },
        card: { essenceType: null, version: 1, status: 'draft', sections: [{ key: 'a', md: 'x' }] },
      }),
    )
    expect(md).toContain('掌握度：待学')
    expect(md).not.toContain('一句话定义')
    expect(md).not.toContain('> 前置：')
    expect(md).not.toContain('本质：')
  })
})

describe('导出文件名', () => {
  it('拼接空间/概念/讲义与版本后缀，非法字符清洗', () => {
    expect(
      lessonExportFilename({ spaceName: '金融理财', conceptName: '指数基金与定投', version: 2, ext: 'md' }),
    ).toBe('金融理财-指数基金与定投-讲义-v2.md')
    expect(
      lessonExportFilename({ spaceName: 'A/B:C', conceptName: 'D*E?F', version: null, ext: '.pdf' }),
    ).toBe('A_B_C-D_E_F-讲义.pdf')
  })

  it('空间名与概念名相同时不重复字段；空名回退「未命名」', () => {
    expect(lessonExportFilename({ spaceName: '深度学习', conceptName: '深度学习', version: 1, ext: 'png' })).toBe(
      '深度学习-讲义-v1.png',
    )
    expect(sanitizeFilenamePart('   ')).toBe('未命名')
  })
})