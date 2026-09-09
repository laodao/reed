/**
 * 概念笔记仓储契约测试（dl-note，M4-UX1 #3/#6）
 * @module tests/unit/core/database/dl-note.repository.spec
 *
 * 钉死:选区笔记/答疑收藏同表 source 区分;listByConcept 按概念;findByQuestion 去重;
 * 多租户 ALS 隔离;delete/patch 可用。真实 better-sqlite3 + 迁移。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlNoteRepository } from '@core/database/repositories/dl-note.repository'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/domain-learning/dl-project.entity'),
  () => import('@core/database/entities/domain-learning/dl-concept.entity'),
  () => import('@core/database/entities/domain-learning/dl-relation.entity'),
  () => import('@core/database/entities/domain-learning/dl-mastery-log.entity'),
  () => import('@core/database/entities/domain-learning/dl-card.entity'),
  () => import('@core/database/entities/domain-learning/dl-doc.entity'),
  () => import('@core/database/entities/domain-learning/dl-question.entity'),
  () => import('@core/database/entities/domain-learning/dl-note.entity'),
]

async function buildDs(): Promise<DataSource> {
  const entities = []
  for (const imp of ENTITY_IMPORTS) {
    const mod = await imp()
    entities.push(Object.values(mod)[0] as new () => object)
  }
  const d = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: false })
  await d.initialize()
  await createDomainLearningTables(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('DlNoteRepository（M4-UX1）', () => {
  it('selection/qna 笔记落库；按项目/概念查询；qna 同问题幂等唯一（2026-09-09 复盘）', async () => {
    ds = await buildDs()
    const db = { dlProjects: new DlProjectRepository(ds), dlNotes: new DlNoteRepository(ds) }
    await runWithUserAsync('u1', async () => {
      await db.dlProjects!.create({ id: 'sp1', name: '笔记域', goal: '入门' })
      await db.dlNotes!.create({
        id: 'n1', projectId: 'sp1', conceptId: 'c1', source: 'selection',
        anchorText: 'P(B) 是归一化常数', anchorStart: 12, anchorEnd: 28, contentMd: '重点：分母保证后验和=1',
      })
      await db.dlNotes!.create({ id: 'n2', projectId: 'sp1', conceptId: 'c1', source: 'qna', questionId: 'q_x', contentMd: '问答要点的收藏评注' })
      // qna 同问题二次收藏 → create 幂等返回既有行（不双行；库级唯一 uniq_dl_note_question 兜底）
      const dup = await db.dlNotes!.create({ id: 'n3', projectId: 'sp1', conceptId: 'c1', source: 'qna', questionId: 'q_x', contentMd: 'dup' })
      expect(dup.id).toBe('n2')
      expect((await db.dlNotes!.findByQuestion('sp1', 'q_x'))?.id).toBe('n2')

      const all = await db.dlNotes!.listByProject('sp1')
      expect(all).toHaveLength(2)
      const concept = await db.dlNotes!.listByConcept('sp1', 'c1')
      expect(concept.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
    })
  })

  it('多租户隔离与删除/改内容', async () => {
    ds = await buildDs()
    const db = { dlProjects: new DlProjectRepository(ds), dlNotes: new DlNoteRepository(ds) }
    await runWithUserAsync('u1', () => db.dlProjects!.create({ id: 'sp1', name: '笔记域', goal: '入门' }))
    await runWithUserAsync('u1', () =>
      db.dlNotes!.create({ id: 'n1', projectId: 'sp1', conceptId: 'c1', source: 'selection', contentMd: '原文' }))
    await runWithUserAsync('u2', async () => {
      expect(await db.dlNotes!.listByProject('sp1')).toHaveLength(0)
      // 删除自己可见的(先造一条 u2)
      await db.dlNotes!.create({ id: 'n2', projectId: 'sp1', conceptId: null, source: 'selection', contentMd: 'u2' })
      expect(await db.dlNotes!.deleteById('n2')).toBe(1)
      expect(await db.dlNotes!.deleteById('n1')).toBe(0) // u1 的不可删
    })
    await runWithUserAsync('u1', async () => {
      await db.dlNotes!.patch('n1', { contentMd: '改后' })
      expect((await db.dlNotes!.getById('n1'))?.contentMd).toBe('改后')
    })
  })
})
