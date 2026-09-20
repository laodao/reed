/**
 * 大脑面板列表服务测试：listAtoms 的 origin 过滤 + 来源文档名批量解析
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'
import { LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getKbBrainPanelService } from '@core/platform/services/kb-brain/brain-panel.service'

type EntityCtor = new (...args: unknown[]) => object

describe('brain-panel listAtoms（origin 过滤 + documentName 解析）', () => {
  let ds: DataSource
  const KB = 'kb-panel'
  const DOC_A = 'doc-aaa'
  const DOC_B = 'doc-bbb'

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter((v) => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false,
    })
    await ds.initialize()
    await createKbBrainTestTables(ds)
    await insertTestKb(ds, { id: KB })
    // 两份来源文档（名称带扩展名/括注噪音，前端负责缩短；user_id 对齐 scoped 查询的默认用户）
    await ds.query(
      `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type)
       VALUES ('${DOC_A}', '${LOCAL_DEFAULT_USER_ID}', '${KB}', '凡人修仙传(忘语) (z-lib.sk).epub', '/a.epub', 'epub')`,
    )
    await ds.query(
      `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type)
       VALUES ('${DOC_B}', '${LOCAL_DEFAULT_USER_ID}', '${KB}', '诛仙(萧鼎).epub', '/b.epub', 'epub')`,
    )
    const atoms = new KbAtomRepository(ds)
    const docs = new KbDocumentRepository(ds)
    registerCoreDatabaseManager(() => ({ kbAtoms: atoms, kbDocuments: docs }) as never)
    // 种子：A 文档 2 条（1 条 human）+ B 文档 1 条 + open-question 1 条 + 指向已删除文档 1 条
    await atoms.createBatch([
      { knowledgeBaseId: KB, statement: 'A-事实论断', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q1' },
      { knowledgeBaseId: KB, statement: 'A-我的观感', type: 'insight', sourceDocumentId: DOC_A, sourceQuote: 'q2', origin: 'human' },
      { knowledgeBaseId: KB, statement: 'B-事实论断', type: 'fact', sourceDocumentId: DOC_B, sourceQuote: 'q3' },
      { knowledgeBaseId: KB, statement: '悬置点：古剑来历', type: 'open-question', sourceDocumentId: DOC_A, sourceQuote: 'q4' },
      { knowledgeBaseId: KB, statement: '孤儿论断（文档已删）', type: 'fact', sourceDocumentId: 'doc-deleted', sourceQuote: 'q5' },
    ])
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('documentName 批量解析：行带来源文档名，未知文档回退 null', async () => {
    const svc = getKbBrainPanelService()
    const res = await svc.listAtoms({ kbId: KB, page: 1, pageSize: 50 })
    expect(res.success).toBe(true)
    const rows = res.data!.rows as Array<{ statement: string; documentName: string | null }>
    expect(res.data!.total).toBe(5)
    const byStmt = new Map(rows.map((r) => [r.statement, r.documentName]))
    expect(byStmt.get('A-事实论断')).toBe('凡人修仙传(忘语) (z-lib.sk).epub')
    expect(byStmt.get('B-事实论断')).toBe('诛仙(萧鼎).epub')
    // 文档已删除：documentName 回退 null（前端显示 —）
    expect(byStmt.get('孤儿论断（文档已删）')).toBeNull()
  })

  it('origin=human 过滤：只回我的观感', async () => {
    const svc = getKbBrainPanelService()
    const res = await svc.listAtoms({ kbId: KB, origin: 'human', page: 1, pageSize: 50 })
    const rows = res.data!.rows as Array<{ statement: string }>
    expect(res.data!.total).toBe(1)
    expect(rows[0]!.statement).toBe('A-我的观感')
  })

  it('type=open-question 过滤照常生效（与 origin 正交）', async () => {
    const svc = getKbBrainPanelService()
    const res = await svc.listAtoms({ kbId: KB, type: 'open-question', page: 1, pageSize: 50 })
    expect(res.data!.total).toBe(1)
    const rows = res.data!.rows as Array<{ documentName: string | null }>
    expect(rows[0]!.documentName).toBe('凡人修仙传(忘语) (z-lib.sk).epub')
  })

  it('分页仍正常：pageSize=2 第 1 页 2 条，total 不变', async () => {
    const svc = getKbBrainPanelService()
    const res = await svc.listAtoms({ kbId: KB, page: 1, pageSize: 2 })
    expect(res.data!.rows).toHaveLength(2)
    expect(res.data!.total).toBe(5)
  })

  it('缺省状态=工作集：superseded/archived 不入列表，显式 status 可查', async () => {
    const atoms = new KbAtomRepository(ds)
    const [archived] = await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '已归档碎片', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q6' },
    ])
    await atoms.updateStatus(archived!.id, { status: 'superseded' })
    const svc = getKbBrainPanelService()
    const def = await svc.listAtoms({ kbId: KB, page: 1, pageSize: 50 })
    const stmts = (def.data!.rows as Array<{ statement: string }>).map((r) => r.statement)
    expect(stmts).not.toContain('已归档碎片')
    expect(def.data!.total).toBe(5)
    const all = await svc.listAtoms({ kbId: KB, page: 1, pageSize: 50, status: 'superseded' })
    expect((all.data!.rows as Array<{ statement: string }>).map((r) => r.statement)).toContain('已归档碎片')
  })
})
