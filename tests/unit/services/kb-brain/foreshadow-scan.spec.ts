/**
 * G3 伏笔扫描测试（foreshadow-scan + 未回收伏笔过滤）
 *
 * 覆盖：P-8 判读落 sets-up 边（verified=0，候选生成器定位）；
 * 幂等重跑（唯一键 deduped，不重复落边）；
 * panel.listAtoms 的 foreshadow='dangling' 过滤（无出边 sets-up 的悬念才算未回收）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'
import { LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import { KbForeshadowScanService } from '@core/platform/services/kb-brain/foreshadow-scan.service'
import { getKbBrainPanelService } from '@core/platform/services/kb-brain/brain-panel.service'

type EntityCtor = new (...args: unknown[]) => object

describe('伏笔扫描（sets-up 候选生成 + 悬空过滤）', () => {
  let ds: DataSource
  const KB = 'kb-fs'
  const DOC = 'doc-fs'

  /** 悬念0→事实0 构成回收；悬念1 无回收（应出现在悬空视图） */
  const scanLlm = async (): Promise<string> =>
    JSON.stringify({ links: [{ setup: 0, payoff: 0, evidence: '后文揭示了古剑的来历' }] })

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
    await ds.query(
      `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type)
       VALUES ('${DOC}', '${LOCAL_DEFAULT_USER_ID}', '${KB}', '测试书.txt', '/t.txt', 'txt')`,
    )
    const atoms = new KbAtomRepository(ds)
    const edges = new KbKnowledgeEdgeRepository(ds)
    registerCoreDatabaseManager(() => ({ kbAtoms: atoms, kbKnowledgeEdges: edges }) as never)
    await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '悬念：古剑的来历未交代', type: 'open-question', sourceDocumentId: DOC, sourceQuote: 's1' },
      { knowledgeBaseId: KB, statement: '悬念：铁牌的用途不明', type: 'open-question', sourceDocumentId: DOC, sourceQuote: 's2' },
      { knowledgeBaseId: KB, statement: '古剑为上古魔物残魂所铸', type: 'fact', sourceDocumentId: DOC, sourceQuote: 'p1' },
      { knowledgeBaseId: KB, statement: '主角实力冠绝同辈', type: 'fact', sourceDocumentId: DOC, sourceQuote: 'p2' },
    ])
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('P-8 判读落边（verified=0）+ 幂等重跑去重 + 悬空过滤', async () => {
    const scan = new KbForeshadowScanService({ llm: scanLlm })
    const stats = await scan.run(KB)
    expect(stats.setups).toBe(2)
    expect(stats.linksProposed).toBe(1)
    expect(stats.created).toBe(1)
    expect(stats.deduped).toBe(0)

    // 落库校验：relation/verified/origin
    const edges = new KbKnowledgeEdgeRepository(ds)
    const snapshot = await edges.graphSnapshot(KB)
    expect(snapshot.edges).toHaveLength(1)

    // 幂等：同输入重跑 → 唯一键去重
    const again = await scan.run(KB)
    expect(again.linksProposed).toBe(1)
    expect(again.created).toBe(0)
    expect(again.deduped).toBe(1)

    // 悬空视图：有出边 sets-up 的悬念（古剑）不再算未回收
    const panel = getKbBrainPanelService()
    const dangling = await panel.listAtoms({ kbId: KB, foreshadow: 'dangling' })
    expect(dangling.success).toBe(true)
    const rows = dangling.data!.rows as Array<{ statement: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.statement).toBe('悬念：铁牌的用途不明')
  })

  it('无悬念的库 → 零产出不报错', async () => {
    await insertTestKb(ds, { id: 'kb-fs-empty' })
    const scan = new KbForeshadowScanService({ llm: scanLlm })
    const stats = await scan.run('kb-fs-empty')
    expect(stats.setups).toBe(0)
    expect(stats.created).toBe(0)
  })
})
