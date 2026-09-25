/**
 * G3 伏笔扫描测试（foreshadow-scan + 未回收伏笔过滤）
 *
 * 覆盖：P-8 判读落 sets-up 边（verified=0，候选生成器定位）；
 * 章序强制（review P1：回收必须晚于埋设——同章/更早的提案在落库前丢弃）；
 * 增量语义（review P2：已有出边 sets-up 的悬念不再进扫描，悬空集合单调收缩）；
 * 幂等重跑（唯一键 deduped）；panel.listAtoms 的 foreshadow='dangling' 过滤。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'
import { LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import { KbForeshadowScanService } from '@core/platform/services/kb-brain/foreshadow-scan.service'
import { getKbBrainPanelService } from '@core/platform/services/kb-brain/brain-panel.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'

type EntityCtor = new (...args: unknown[]) => object

describe('伏笔扫描（sets-up 候选生成 + 章序强制 + 悬空过滤）', () => {
  let ds: DataSource
  const KB = 'kb-fs'
  const DOC = 'doc-fs'

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
    // 三章：ch1(第1章) ch2(第2章) ch3(第3章)
    for (const [id, title, ordering] of [
      ['ch1', '第1章', 1],
      ['ch2', '第2章', 2],
      ['ch3', '第3章', 3],
    ] as const) {
      await ds.query(
        `INSERT INTO kb_chapters (id, user_id, document_id, knowledge_base_id, title, ordering, content_hash)
         VALUES ('${id}', '${LOCAL_DEFAULT_USER_ID}', '${DOC}', '${KB}', '${title}', ${ordering}, 'hash-${id}')`,
      )
    }
    const atoms = new KbAtomRepository(ds)
    const edges = new KbKnowledgeEdgeRepository(ds)
    const chapters = new KbChapterRepository(ds)
    registerCoreDatabaseManager(() => ({ kbAtoms: atoms, kbKnowledgeEdges: edges, kbChapters: chapters }) as never)
    await atoms.createBatch([
      // 悬念（埋设）：S1 在第1章，S2 在第2章
      { knowledgeBaseId: KB, statement: '悬念：古剑的来历未交代', type: 'open-question', sourceDocumentId: DOC, sourceChapterId: 'ch1', sourceQuote: 's1' },
      { knowledgeBaseId: KB, statement: '悬念：铁牌的用途不明', type: 'open-question', sourceDocumentId: DOC, sourceChapterId: 'ch2', sourceQuote: 's2' },
      // 事实（回收候选）：P0 与 S1 同章（章序违规），P1 晚于 S1（合法回收）
      { knowledgeBaseId: KB, statement: '古剑曾封存于祖祠', type: 'fact', sourceDocumentId: DOC, sourceChapterId: 'ch1', sourceQuote: 'p0' },
      { knowledgeBaseId: KB, statement: '古剑为上古魔物残魂所铸', type: 'fact', sourceDocumentId: DOC, sourceChapterId: 'ch3', sourceQuote: 'p1' },
    ])
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('章序强制 + P2 增量 + 幂等 + 悬空过滤', async () => {
    const calls: string[] = []
    let call = 0
    // 第一轮：0→0 同章违规（丢弃）、0→1 合法（创建）；第二轮：0→0 = 铁牌→更早的祖祠（章序违规，丢弃）
    const llm: BrainLlmFn = async ({ user }) => {
      calls.push(user)
      call++
      if (call === 1) {
        return JSON.stringify({ links: [{ setup: 0, payoff: 0, evidence: '同章呼应' }, { setup: 0, payoff: 1, evidence: '后文揭示来历' }] })
      }
      return JSON.stringify({ links: [{ setup: 0, payoff: 0, evidence: '同一异物但更早' }] })
    }
    const scan = new KbForeshadowScanService({ llm })
    const stats = await scan.run(KB)
    // 两条提案中同章那条被章序校验丢弃，只有 1 条过审落库
    expect(stats.setups).toBe(2)
    expect(stats.scannedDocs).toBe(1)
    expect(stats.linksProposed).toBe(1)
    expect(stats.created).toBe(1)
    expect(stats.deduped).toBe(0)

    const edges = new KbKnowledgeEdgeRepository(ds)
    expect((await edges.graphSnapshot(KB)).edges).toHaveLength(1)

    // P2：S1 已连边，第二次扫描只应送 S2（SETUPS 段不再出现古剑）
    const again = await scan.run(KB)
    expect(again.setups).toBe(1)
    expect(again.linksProposed).toBe(0)
    expect(again.created).toBe(0) // 铁牌→祖祠（第1章 vs 第2章）被章序丢弃
    expect(again.deduped).toBe(0)
    expect((await edges.graphSnapshot(KB)).edges).toHaveLength(1) // 图上仍只有第一轮那条边
    expect(calls).toHaveLength(2)
    const setupsSection1 = calls[0]!.split('PAYOFFS')[0]!
    expect(setupsSection1).toContain('古剑的来历')
    expect(setupsSection1).toContain('铁牌的用途')
    const setupsSection2 = calls[1]!.split('PAYOFFS')[0]!
    expect(setupsSection2).not.toContain('古剑')
    expect(setupsSection2).toContain('铁牌的用途')

    // 悬空视图：S1 已连边不再算未回收，S2 仍在
    const panel = getKbBrainPanelService()
    const dangling = await panel.listAtoms({ kbId: KB, foreshadow: 'dangling' })
    expect(dangling.success).toBe(true)
    const rows = dangling.data!.rows as Array<{ statement: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.statement).toBe('悬念：铁牌的用途不明')
  })

  it('无悬念的库 → 零产出不报错', async () => {
    await insertTestKb(ds, { id: 'kb-fs-empty' })
    const scan = new KbForeshadowScanService({ llm: async () => JSON.stringify({ links: [] }) })
    const stats = await scan.run('kb-fs-empty')
    expect(stats.setups).toBe(0)
    expect(stats.created).toBe(0)
  })
})
