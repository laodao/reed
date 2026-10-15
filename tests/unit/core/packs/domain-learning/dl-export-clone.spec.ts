/**
 * 导出功能 IPC 可克隆性测试
 * 用 structuredClone（Electron IPC 用的算法）验证导出和版本服务的返回值
 */
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { createUnifiedGraphTables } from '@core/database/migrations/create-unified-graph-tables'
import { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlRelationRepository } from '@core/database/repositories/dl-relation.repository'
import { DlLessonExportService } from '@core/packs/domain-learning/services/dl-lesson-export.service'
import { DlLessonVersionService } from '@core/packs/domain-learning/services/dl-lesson-version.service'
import { DocumentToolsService, registerDocumentTools } from '@core/platform/services/document-tools/document-tools'

let ds: DataSource | null = null

async function setup() {
  const entities = []
  for (const imp of [
    () => import('@core/database/entities/domain-learning/dl-project.entity'),
    () => import('@core/database/entities/domain-learning/dl-concept.entity'),
    () => import('@core/database/entities/domain-learning/dl-relation.entity'),
    () => import('@core/database/entities/domain-learning/dl-mastery-log.entity'),
    () => import('@core/database/entities/domain-learning/dl-card.entity'),
    () => import('@core/database/entities/domain-learning/dl-doc.entity'),
    () => import('@core/database/entities/domain-learning/dl-question.entity'),
    () => import('@core/database/entities/domain-learning/dl-concept-log.entity'),
    // 关系仓储已是统一图存储 facade——graph_edges 实体必须注册
    () => import('@core/database/entities/graph/graph-edge.entity'),
  ]) {
    const mod = await imp()
    entities.push(Object.values(mod)[0] as new () => object)
  }
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: false })
  await ds.initialize()
  await createDomainLearningTables(ds)
  await createUnifiedGraphTables(ds)

  const projects = new DlProjectRepository(ds)
  const concepts = new DlConceptRepository(ds)
  const cards = new DlCardRepository(ds)
  const relations = new DlRelationRepository(ds)

  await projects.create({ id: 'p1', name: '测试空间', goal: '入门' })
  await concepts.create({ id: 'c1', projectId: 'p1', nodeType: 'concept', name: '测试概念', definitionShort: '一句话定义', mastery: 'learning' })
  await cards.create({
    id: 'card1', projectId: 'p1', conceptId: 'c1', essenceType: 'K-concept',
    sections: [{ key: 'meta', title: '本质', md: '测试内容 $E=mc^2$' }],
    works: [{ kind: '专著', title: '书A' }],
    evidenceSources: [{ kind: 'kb', title: '来源A' }],
    version: 1, status: 'draft',
  })
  await concepts.patch('c1', { cardId: 'card1' })

  registerDocumentTools(new DocumentToolsService(null))
  const db = { dlProjects: projects, dlConcepts: concepts, dlCards: cards, dlRelations: relations } as any
  return { db, projects, concepts, cards, relations }
}

/** 逐字段找出不可克隆的属性 */
function assertCloneable(obj: unknown, label: string) {
  try {
    structuredClone(obj)
  } catch (e) {
    // 找出具体哪个字段
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        try { structuredClone(v) } catch (e2) {
          throw new Error(`[${label}] 字段 "${k}" 不可克隆: ${(e as Error).message}\n  字段类型: ${typeof v}\n  是否 Date: ${v instanceof Date}\n  是否有原型: ${Object.getPrototypeOf(v)?.constructor?.name}`)
        }
      }
    }
    throw new Error(`[${label}] 不可克隆: ${(e as Error).message}`)
  }
}

describe('导出返回值 IPC 可克隆性', () => {
  it('md 格式返回值可被 structuredClone', async () => {
    const { db } = await setup()
    const svc = new DlLessonExportService(db)
    const result = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'md' })
    // 打印每个字段的类型
    for (const [k, v] of Object.entries(result)) {
      console.log(`  md.${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}${Array.isArray(v) ? ' [Array]' : ''}`)
    }
    assertCloneable(result, 'md')
    expect(result.format).toBe('md')
    await ds?.destroy()
  })

  it('image 格式返回值可被 structuredClone（无渲染器→降级 html）', async () => {
    const { db } = await setup()
    const svc = new DlLessonExportService(db)
    const result = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'image' })
    for (const [k, v] of Object.entries(result)) {
      const len = typeof v === 'string' ? ` (${v.length} chars)` : ''
      console.log(`  image.${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}${len}`)
    }
    assertCloneable(result, 'image')
    expect(result.format).toBe('html')
    await ds?.destroy()
  })

  it('pdf 格式返回值可被 structuredClone', async () => {
    const { db } = await setup()
    const svc = new DlLessonExportService(db)
    const result = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'pdf' })
    assertCloneable(result, 'pdf')
    await ds?.destroy()
  })

  it('IpcResponse 包装后的导出结果可克隆', async () => {
    const { db } = await setup()
    const svc = new DlLessonExportService(db)
    const result = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'md' })
    const wrapped = { success: true, data: result }
    assertCloneable(wrapped, 'IpcResponse(md)')
    await ds?.destroy()
  })
})

describe('版本管理返回值 IPC 可克隆性', () => {
  it('listVersions 返回值可被 structuredClone', async () => {
    const { db } = await setup()
    const svc = new DlLessonVersionService(db)
    const list = await svc.listVersions('p1', 'c1')
    for (const item of list) {
      for (const [k, v] of Object.entries(item)) {
        console.log(`  list.${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}`)
      }
    }
    assertCloneable(list, 'listVersions')
    await ds?.destroy()
  })

  it('getVersion 返回值可被 structuredClone', async () => {
    const { db } = await setup()
    const svc = new DlLessonVersionService(db)
    const card = await svc.getVersion('p1', 'card1')
    expect(card).not.toBeNull()
    if (card) {
      for (const [k, v] of Object.entries(card)) {
        console.log(`  getVersion.${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}${Array.isArray(v) ? ' [Array]' : ''}`)
      }
      assertCloneable(card, 'getVersion')
    }
    await ds?.destroy()
  })

  it('restore 返回值可被 structuredClone', async () => {
    const { db } = await setup()
    const svc = new DlLessonVersionService(db)
    const result = await svc.restore('p1', 'c1', 'card1')
    assertCloneable(result, 'restore')
    await ds?.destroy()
  })
})