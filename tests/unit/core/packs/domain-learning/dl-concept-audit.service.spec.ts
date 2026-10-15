/**
 * 知识点节点字段变更审计服务测试（DlConceptAuditService）
 *
 * 钉死：diffAndLog 自动对比受监控字段、值相等跳过、attrs 整体 JSON 比较、
 * 未注册仓储时静默跳过不抛错、logChange 直接写入。
 */

import { describe, it, expect } from 'vitest'
import { DlConceptAuditService } from '@core/packs/domain-learning/services/dl-concept-audit.service'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { DlConceptLogRow } from '@core/database/repositories/dl-concept-log.repository'

interface FakeLogRepo {
  rows: DlConceptLogRow[]
  create: (input: any) => Promise<DlConceptLogRow>
}

function fakeDb(withRepo = true): { db: ICoreDatabaseManager; repo: FakeLogRepo | null } {
  const repo: FakeLogRepo = {
    rows: [],
    async create(input: any) {
      const row: DlConceptLogRow = {
        id: input.id,
        userId: null,
        projectId: input.projectId,
        conceptId: input.conceptId,
        field: input.field,
        fromValue: input.fromValue ?? null,
        toValue: input.toValue ?? null,
        trigger: input.trigger,
        at: new Date(),
      }
      this.rows.push(row)
      return row
    },
  }
  const db = withRepo ? ({ dlConceptLogs: repo } as unknown as ICoreDatabaseManager) : ({} as ICoreDatabaseManager)
  return { db, repo: withRepo ? repo : null }
}

describe('DlConceptAuditService.diffAndLog', () => {
  it('只记录差异字段，值相等跳过', async () => {
    const { db, repo } = fakeDb()
    const svc = new DlConceptAuditService(db)
    const n = await svc.diffAndLog({
      projectId: 's1',
      conceptId: 'c1',
      before: { name: '旧名', definitionShort: '相同', attrs: { prerequisites: ['A'] } },
      after: { name: '新名', definitionShort: '相同', attrs: { prerequisites: ['A', 'B'] } },
      trigger: 'agent',
    })
    expect(n).toBe(2)
    expect(repo!.rows.map((r) => r.field).sort()).toEqual(['attrs', 'name'])
    const nameRow = repo!.rows.find((r) => r.field === 'name')!
    expect(nameRow.fromValue).toBe('旧名')
    expect(nameRow.toValue).toBe('新名')
    expect(nameRow.trigger).toBe('agent')
  })

  it('attrs 作为整体 JSON 比较（结构相同则跳过）', async () => {
    const { db, repo } = fakeDb()
    const svc = new DlConceptAuditService(db)
    const n = await svc.diffAndLog({
      projectId: 's1',
      conceptId: 'c1',
      before: { attrs: { a: 1, b: [1, 2] } },
      after: { attrs: { a: 1, b: [1, 2] } },
      trigger: 'manual',
    })
    expect(n).toBe(0)
    expect(repo!.rows).toHaveLength(0)
  })

  it('null ↔ undefined 视为相同（都序列化为 null）', async () => {
    const { db, repo } = fakeDb()
    const svc = new DlConceptAuditService(db)
    const n = await svc.diffAndLog({
      projectId: 's1',
      conceptId: 'c1',
      before: { en: null },
      after: { en: undefined },
      trigger: 'agent',
    })
    expect(n).toBe(0)
    expect(repo!.rows).toHaveLength(0)
  })

  it('可限定只对比指定字段', async () => {
    const { db, repo } = fakeDb()
    const svc = new DlConceptAuditService(db)
    const n = await svc.diffAndLog({
      projectId: 's1',
      conceptId: 'c1',
      before: { name: 'A', note: '旧' },
      after: { name: 'B', note: '新' },
      trigger: 'manual',
      fields: ['name'],
    })
    expect(n).toBe(1)
    expect(repo!.rows[0].field).toBe('name')
  })

  it('未注册仓储时静默返回 0，不抛错', async () => {
    const { db } = fakeDb(false)
    const svc = new DlConceptAuditService(db)
    const n = await svc.diffAndLog({
      projectId: 's1',
      conceptId: 'c1',
      before: { name: 'A' },
      after: { name: 'B' },
      trigger: 'agent',
    })
    expect(n).toBe(0)
  })
})

describe('DlConceptAuditService.logChange', () => {
  it('直接写入一条日志', async () => {
    const { db, repo } = fakeDb()
    const svc = new DlConceptAuditService(db)
    await svc.logChange({
      projectId: 's1',
      conceptId: 'c1',
      field: 'definitionShort',
      from: '旧定义',
      to: '新定义',
      trigger: 'restore',
    })
    expect(repo!.rows).toHaveLength(1)
    expect(repo!.rows[0]).toMatchObject({
      field: 'definitionShort',
      fromValue: '旧定义',
      toValue: '新定义',
      trigger: 'restore',
    })
  })
})