/**
 * 单篇讲义导出服务测试（DlLessonExportService）
 *
 * 钉死：md 双端同源；pdf/image 走平台文档工具（注入假渲染器验证契约）；
 * 无渲染器时降级 HTML（Web 端打印口径）；可导出指定历史版本；
 * 概念归属/目录节点/无讲义/版本不属于该概念等错误路径全部拦下。
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  DlLessonExportService,
  formatExportStamp,
} from '@core/packs/domain-learning/services/dl-lesson-export.service'
import {
  DocumentToolsService,
  registerDocumentTools,
  type IHtmlRenderer,
} from '@core/platform/services/document-tools/document-tools'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { DlCardRow } from '@core/database/repositories/dl-card.repository'
import type { DlConceptRow } from '@core/database/repositories/dl-concept.repository'

interface FakeRenderer extends IHtmlRenderer {
  pdfCalls: string[]
  imageCalls: string[]
}

function fakeRenderer(): FakeRenderer {
  return {
    pdfCalls: [],
    imageCalls: [],
    async htmlToPdf(html: string) {
      this.pdfCalls.push(html)
      return Buffer.from('%PDF-fake', 'utf-8')
    },
    async htmlToImage(html: string) {
      this.imageCalls.push(html)
      return Buffer.from('PNG-fake', 'utf-8')
    },
  }
}

function conceptRow(over: Partial<DlConceptRow> = {}): DlConceptRow {
  return {
    id: 'c1',
    userId: 'u1',
    projectId: 's1',
    nodeType: 'concept',
    name: '指数基金与定投',
    en: null,
    parentId: null,
    definitionShort: '以跟踪指数为目标的基金。',
    researchState: 'extracted',
    mastery: 'learning',
    source: 'ai_verified',
    attrs: { prerequisites: ['资产配置与分散化'] },
    cardId: 'card2',
    note: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  }
}

function cardRow(over: Partial<DlCardRow> = {}): DlCardRow {
  return {
    id: 'card2',
    userId: 'u1',
    projectId: 's1',
    conceptId: 'c1',
    essenceType: 'K-concept',
    sections: [{ key: 'meta', title: '本质与定位', md: '指数基金是…', takeaway: '买的是指数。' }],
    works: [{ kind: '专著', title: '共同基金常识' }],
    contentMd: null,
    evidenceSources: [{ kind: 'kb', title: '投资指南' }],
    version: 2,
    status: 'draft',
    verification: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  }
}

interface FakeDbOptions {
  project?: Record<string, unknown> | null
  concepts?: DlConceptRow[]
  cards?: DlCardRow[]
  relations?: Array<{ sourceId: string; targetId: string; relationType: string }>
}

function fakeDb(opts: FakeDbOptions = {}): ICoreDatabaseManager {
  const concepts = opts.concepts ?? [conceptRow()]
  const cards = opts.cards ?? [cardRow()]
  const relations = opts.relations ?? []
  return {
    dlProjects: {
      getById: async (id: string) =>
        opts.project === null ? null : (opts.project ?? { id, name: '金融理财', goal: '入门' }),
    },
    dlConcepts: {
      getById: async (id: string) => concepts.find((c) => c.id === id) ?? null,
      listByProject: async () => concepts,
    },
    dlCards: {
      getById: async (id: string) => cards.find((c) => c.id === id) ?? null,
      getCurrentByConcept: async (_p: string, conceptId: string) =>
        cards.filter((c) => c.conceptId === conceptId).sort((a, b) => b.version - a.version)[0] ?? null,
    },
    dlRelations: {
      listByProject: async () => relations,
    },
  } as unknown as ICoreDatabaseManager
}

const FIXED_NOW = new Date(2026, 8, 15, 10, 30) // 2026-09-15 10:30 本地时间

afterEach(() => {
  // 还原为无渲染器的降级实例，避免污染其他测试文件
  registerDocumentTools(new DocumentToolsService(null))
})

describe('formatExportStamp', () => {
  it('输出 YYYY-MM-DD HH:mm（本地时间）', () => {
    expect(formatExportStamp(FIXED_NOW)).toBe('2026-09-15 10:30')
  })
})

describe('DlLessonExportService.export（markdown）', () => {
  it('返回讲义正文与文件名，且不触碰平台渲染器', async () => {
    const renderer = fakeRenderer()
    registerDocumentTools(new DocumentToolsService(renderer))
    const svc = new DlLessonExportService(fakeDb())

    const r = await svc.export({ spaceId: 's1', conceptId: 'c1', format: 'md', now: FIXED_NOW })

    expect(r.format).toBe('md')
    expect(r.filename).toBe('金融理财-指数基金与定投-讲义-v2.md')
    expect(r.mime).toContain('text/markdown')
    expect(r.version).toBe(2)
    expect(r.markdown).toContain('# 指数基金与定投')
    expect(r.markdown).toContain('## 本质与定位')
    expect(r.markdown).toContain('> 买的是指数。')
    expect(r.markdown).toContain('相关著作')
    // 元信息：空间/目标/版本/导出时间 + 一句定义
    expect(r.markdown).toContain('> 领域：金融理财 · 学习目标：入门')
    expect(r.markdown).toContain('讲义：v2（草稿）')
    expect(r.markdown).toContain('> 导出于 2026-09-15 10:30')
    expect(r.markdown).toContain('一句话定义：以跟踪指数为目标的基金。')
    expect(renderer.pdfCalls).toHaveLength(0)
    expect(renderer.imageCalls).toHaveLength(0)
  })

  it('前置取图上的 prerequisite 边（source→本概念）并译成名字、与声明合并去重', async () => {
    const svc = new DlLessonExportService(
      fakeDb({
        concepts: [conceptRow(), conceptRow({ id: 'c0', name: '资产配置与分散化', cardId: null })],
        relations: [
          { sourceId: 'c0', targetId: 'c1', relationType: 'prerequisite' },
          { sourceId: 'c1', targetId: 'c0', relationType: 'related' },
        ],
      }),
    )
    const r = await svc.export({ spaceId: 's1', conceptId: 'c1', format: 'md', now: FIXED_NOW })
    expect(r.markdown).toContain('> 前置：资产配置与分散化')
  })
})

describe('DlLessonExportService.export（PDF / 长图）', () => {
  it('pdf：走平台渲染器，回传 base64 与 .pdf 文件名，HTML 内含公式增强', async () => {
    const renderer = fakeRenderer()
    registerDocumentTools(new DocumentToolsService(renderer))
    const svc = new DlLessonExportService(
      fakeDb({ cards: [cardRow({ sections: [{ key: 'mechanism', title: '机制', md: '收益 $r = 1 + x$ 元' }] })] }),
    )
    const r = await svc.export({ spaceId: 's1', conceptId: 'c1', format: 'pdf', now: FIXED_NOW })

    expect(r.format).toBe('pdf')
    expect(r.filename).toBe('金融理财-指数基金与定投-讲义-v2.pdf')
    expect(r.mime).toBe('application/pdf')
    expect(Buffer.from(r.contentBase64!, 'base64').toString('utf-8')).toBe('%PDF-fake')
    expect(renderer.pdfCalls).toHaveLength(1)
    // 讲义模板 + KaTeX 公式已渲染（不是 $…$ 原文）
    expect(renderer.pdfCalls[0]).toContain('doc-title')
    expect(renderer.pdfCalls[0]).toContain('katex')
    expect(renderer.pdfCalls[0]).not.toContain('$r = 1 + x$')
  })

  it('image：回传 PNG base64 与 .png 文件名', async () => {
    const renderer = fakeRenderer()
    registerDocumentTools(new DocumentToolsService(renderer))
    const svc = new DlLessonExportService(fakeDb())
    const r = await svc.export({ spaceId: 's1', conceptId: 'c1', format: 'image', now: FIXED_NOW })

    expect(r.format).toBe('image')
    expect(r.filename).toBe('金融理财-指数基金与定投-讲义-v2.png')
    expect(r.mime).toBe('image/png')
    expect(Buffer.from(r.contentBase64!, 'base64').toString('utf-8')).toBe('PNG-fake')
    expect(renderer.imageCalls).toHaveLength(1)
  })

  it('无平台渲染器（Web）时降级为排版 HTML，并保留 markdown 兜底', async () => {
    registerDocumentTools(new DocumentToolsService(null))
    const svc = new DlLessonExportService(fakeDb())
    const r = await svc.export({ spaceId: 's1', conceptId: 'c1', format: 'image', now: FIXED_NOW })

    expect(r.format).toBe('html')
    expect(r.filename).toBe('金融理财-指数基金与定投-讲义-v2.html')
    expect(r.mime).toContain('text/html')
    expect(r.html).toContain('指数基金与定投')
    expect(r.markdown).toContain('# 指数基金与定投')
    expect(r.contentBase64).toBeUndefined()
  })

  it('指定历史版本 cardId 导出：版本号与内容用该版本（版本管理联动）', async () => {
    const renderer = fakeRenderer()
    registerDocumentTools(new DocumentToolsService(renderer))
    const svc = new DlLessonExportService(
      fakeDb({
        cards: [
          cardRow({ id: 'card1', version: 1, status: 'published', sections: [{ key: 'meta', title: '旧版本质', md: '旧内容' }] }),
          cardRow({ id: 'card2', version: 2, sections: [{ key: 'meta', title: '新版本质', md: '新内容' }] }),
        ],
      }),
    )
    const r = await svc.export({ spaceId: 's1', conceptId: 'c1', format: 'md', cardId: 'card1', now: FIXED_NOW })

    expect(r.version).toBe(1)
    expect(r.filename).toContain('-v1.md')
    expect(r.markdown).toContain('旧内容')
    expect(r.markdown).not.toContain('新内容')
  })
})

describe('DlLessonExportService.export（错误路径）', () => {
  const cases: Array<[string, () => Promise<unknown>, string]> = [
    ['空间不存在', () => new DlLessonExportService(fakeDb({ project: null })).export({ spaceId: 's1', conceptId: 'c1', format: 'md' }), '学习空间不存在'],
    ['概念不存在', () => new DlLessonExportService(fakeDb()).export({ spaceId: 's1', conceptId: 'nope', format: 'md' }), '知识点不存在于该空间'],
    [
      '跨空间概念',
      () => new DlLessonExportService(fakeDb({ concepts: [conceptRow({ projectId: 's2' })] })).export({ spaceId: 's1', conceptId: 'c1', format: 'md' }),
      '知识点不存在于该空间',
    ],
    [
      '目录节点',
      () => new DlLessonExportService(fakeDb({ concepts: [conceptRow({ nodeType: 'group' })] })).export({ spaceId: 's1', conceptId: 'c1', format: 'md' }),
      '目录节点',
    ],
    [
      '无讲义',
      () => new DlLessonExportService(fakeDb({ concepts: [conceptRow({ cardId: null })], cards: [] })).export({ spaceId: 's1', conceptId: 'c1', format: 'md' }),
      '还没有讲义',
    ],
    [
      '版本不属于该概念',
      () => new DlLessonExportService(fakeDb({ cards: [cardRow({ id: 'cardX', conceptId: 'c9' })] })).export({ spaceId: 's1', conceptId: 'c1', format: 'md', cardId: 'cardX' }),
      '指定的讲义版本不存在',
    ],
  ]

  for (const [name, run, msg] of cases) {
    it(`${name} → 抛错「${msg}」`, async () => {
      await expect(run()).rejects.toThrow(msg)
    })
  }
})