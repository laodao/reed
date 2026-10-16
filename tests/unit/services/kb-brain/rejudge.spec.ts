/**
 * 存量论断重判测试（v3 M1）：三档处置落库（knowledge 保留+重分层 / evidence 降档 /
 * junk 归档）、选择集排除（human/视角/evidence 不进重判）、输出解析收编。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbRejudgeService, parseRejudgeOutput } from '@core/platform/services/kb-brain/rejudge.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

const REJUDGE_LLM: BrainLlmFn = async ({ user }) => {
  // 按语句关键词回判（编号对应用户输入顺序）
  const lines = user.split('\n').slice(1)
  const items = lines.map((line, i) => {
    if (line.includes('四大宗派')) return { idx: i, verdict: 'knowledge', layer: 'setting' }
    if (line.includes('以把脉探查')) return { idx: i, verdict: 'knowledge', layer: 'craft' }
    if (line.includes('立下')) return { idx: i, verdict: 'evidence' }
    if (line.includes('无题诗')) return { idx: i, verdict: 'junk' }
    return { idx: i, verdict: 'knowledge' }
  })
  return JSON.stringify({ items })
}

describe('存量论断重判（v3 M1）', () => {
  let ds: DataSource
  let atoms: KbAtomRepository

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
    await insertTestKb(ds, { id: 'kb-rj' })
    atoms = new KbAtomRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  async function mkAtom(id: string, over: Partial<Parameters<KbAtomRepository['createBatch']>[0][number]> = {}) {
    const [row] = await atoms.createBatch([{
      id,
      knowledgeBaseId: 'kb-rj',
      statement: `s-${id}`,
      type: 'fact',
      sourceDocumentId: 'doc-rj',
      sourceQuote: 'q',
      ...over,
    }])
    return row!
  }

  it('三档处置：knowledge 重分层、evidence 降档、junk 归档', async () => {
    await mkAtom('rj-1', { statement: '魔教四大宗派为鬼王宗、合欢派、长生堂、万毒门', layer: 'detail' })
    await mkAtom('rj-2', { statement: '以把脉探查弟子修为是宗门师长常用核查手段', type: 'method', layer: 'detail' })
    await mkAtom('rj-3', { statement: '陆某败于某人后立下再见即死敌之誓', layer: 'detail' })
    await mkAtom('rj-4', { statement: '书中有一首无题诗描写朱雀', layer: 'detail' })

    const svc = new KbRejudgeService({ llm: REJUDGE_LLM, atoms })
    const p = await svc.run('kb-rj')

    expect(p.knowledgeCount).toBe(2)
    expect(p.evidenceCount).toBe(1)
    expect(p.junkCount).toBe(1)
    expect(p.failedBatches).toBe(0)

    expect((await atoms.findById('rj-1'))!.layer).toBe('setting')
    expect((await atoms.findById('rj-1'))!.role).toBe('knowledge')
    expect((await atoms.findById('rj-2'))!.layer).toBe('craft')
    expect((await atoms.findById('rj-3'))!.role).toBe('evidence')
    expect((await atoms.findById('rj-3'))!.status).toBe('supported')
    expect((await atoms.findById('rj-4'))!.status).toBe('archived')
  })

  it('选择集排除：human 来源、视角论断、已降证据的不再进重判', async () => {
    await mkAtom('rj-h', { statement: '无题诗引用一', origin: 'human' })
    await mkAtom('rj-e', { statement: '立下之誓二', role: 'evidence' })
    const svc = new KbRejudgeService({
      llm: async () => { throw new Error('不应有选择集内的论断') },
      atoms,
    })
    // 选择集为空 → 0 批、无 LLM 调用
    const p = await svc.run('kb-rj2')
    expect(p.totalBatches).toBe(0)
  })

  it('parseRejudgeOutput：坏 idx/非法 verdict/非法 layer 过滤；knowledge 缺 layer 视为无修正', () => {
    const raw = JSON.stringify({
      items: [
        { idx: 0, verdict: 'knowledge', layer: 'setting' },
        { idx: 0, verdict: 'evidence' },
        { idx: 1, verdict: 'bogus' },
        { idx: 2, verdict: 'knowledge', layer: 'plot' },
        { idx: 9, verdict: 'junk' },
        { idx: 3, verdict: 'junk' },
      ],
    })
    const out = parseRejudgeOutput(raw, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
    expect(out).toEqual([
      { id: 'a', verdict: 'knowledge', layer: 'setting' },
      { id: 'c', verdict: 'knowledge', layer: undefined },
      { id: 'd', verdict: 'junk', layer: undefined },
    ])
  })
})
