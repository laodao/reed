/**
 * G4 人物原型卡测试（distillCharacterPatterns，跨书嵌入聚类）
 *
 * 覆盖：跨书簇（≥2 本书）出 character-pattern 卡（骨架/实例落库）；
 * 单书簇零产出（单书是角色分析不是原型——防角色卡混入，设计验收项）；
 * 主聚类池为空时人物分支仍可达（早退分支回归——人物论断多为 fact）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'
import { LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbDistillService } from '@core/platform/services/kb-brain/distill.service'

type EntityCtor = new (...args: unknown[]) => object

const DOC_A = 'doc-chr-a'
const DOC_B = 'doc-chr-b'

describe('distill 人物原型卡（跨书聚类）', () => {
  let ds: DataSource
  const KB = 'kb-chr'

  async function seed(ds2: DataSource): Promise<{ atoms: KbAtomRepository; notes: KbNoteRepository; ents: KbEntityRepository }> {
    await insertTestKb(ds2, { id: KB })
    await ds2.query(
      `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type)
       VALUES ('${DOC_A}', '${LOCAL_DEFAULT_USER_ID}', '${KB}', '甲书.txt', '/a.txt', 'txt')`,
    )
    await ds2.query(
      `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type)
       VALUES ('${DOC_B}', '${LOCAL_DEFAULT_USER_ID}', '${KB}', '乙书.txt', '/b.txt', 'txt')`,
    )
    const ents = new KbEntityRepository(ds2)
    const atoms = new KbAtomRepository(ds2)
    const notes = new KbNoteRepository(ds2)
    // 两个 character 实体（分属两书，名字不同——实体名跨书不相同是本机制的出发点）
    for (const name of ['程野', '韩烛']) {
      await ents.upsertMention(KB, { name, type: 'character', aliases: [] })
    }
    const all = await ents.listActiveWithAliases(KB, 10)
    const idByName = new Map(all.map((e) => [e.name, e.id]))
    // 簇甲：同款论断跨两书（应出卡）；簇乙：≥4 条但仅 A 书（应被单书分支跳过）
    await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '甲簇-A书-1', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q1', subjectEntityId: idByName.get('程野') ?? null },
      { knowledgeBaseId: KB, statement: '甲簇-A书-2', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q2', subjectEntityId: idByName.get('程野') ?? null },
      { knowledgeBaseId: KB, statement: '甲簇-B书-1', type: 'fact', sourceDocumentId: DOC_B, sourceQuote: 'q3', subjectEntityId: idByName.get('韩烛') ?? null },
      { knowledgeBaseId: KB, statement: '甲簇-B书-2', type: 'fact', sourceDocumentId: DOC_B, sourceQuote: 'q4', subjectEntityId: idByName.get('韩烛') ?? null },
      { knowledgeBaseId: KB, statement: '乙簇-A书-1', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q5', subjectEntityId: idByName.get('程野') ?? null },
      { knowledgeBaseId: KB, statement: '乙簇-A书-2', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q6', subjectEntityId: idByName.get('程野') ?? null },
      { knowledgeBaseId: KB, statement: '乙簇-A书-3', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q7', subjectEntityId: idByName.get('程野') ?? null },
      { knowledgeBaseId: KB, statement: '乙簇-A书-4', type: 'fact', sourceDocumentId: DOC_A, sourceQuote: 'q8', subjectEntityId: idByName.get('程野') ?? null },
    ])
    return { atoms, notes, ents }
  }

  /** 嵌入按语句前缀分簇：甲→[1,0]，乙→[0,1]（余弦 0 < 阈值 0.72，必分两簇） */
  const embed = async (texts: string[]): Promise<number[][]> => texts.map((t) => (t.includes('甲簇') ? [1, 0] : [0, 1]))

  const characterLlm = async (): Promise<string> =>
    JSON.stringify({
      title: '谨慎坚韧型底层主角的缺陷社会化形态决定抉择走向',
      description: '设计底层主角时使用，判断其缺陷如何驱动关键抉择。',
      body: '## 五维骨架\n…',
      skeleton: [{ dim: '缺陷的社会化形态', values: ['道德纯度型木讷', '生存理性型多疑'] }],
      instances: [
        { label: '甲书', values: { 缺陷: '木讷' }, note: '赤子型' },
        { label: '乙书', values: { 缺陷: '多疑' }, note: '理性型' },
      ],
    })

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
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('跨书簇出卡、单书簇跳过、卡载荷完整（type/skeleton/instances/evidence）', async () => {
    const { atoms, notes, ents } = await seed(ds)
    const svc = new KbDistillService({
      llm: characterLlm,
      embed,
      repos: () => ({ atoms, notes, entities: ents }),
      settingPatternEnabled: false,
      characterPatternEnabled: true,
    })
    const out = await svc.distill(KB, null)
    expect(out.cardsProposed).toBe(1)

    const proposed = await notes.listByStatus(KB, 'proposed', 1, 10)
    expect(proposed.total).toBe(1)
    const card = proposed.rows[0] as unknown as {
      type: string
      title: string
      patternSkeleton: string | null
      patternInstances: string | null
      evidence: string
    }
    expect(card.type).toBe('character-pattern')
    expect(card.patternSkeleton).toContain('缺陷的社会化形态')
    expect(card.patternInstances).toContain('乙书')
    const evidence = JSON.parse(card.evidence) as Array<{ atomId: string }>
    expect(evidence.length).toBeGreaterThan(0)
  })

  it('仅单书论断 → 零产出（单书簇是角色分析不是原型）', async () => {
    await insertTestKb(ds, { id: 'kb-chr-single' })
    await ds.query(
      `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type)
       VALUES ('doc-single', '${LOCAL_DEFAULT_USER_ID}', 'kb-chr-single', '丙书.txt', '/c.txt', 'txt')`,
    )
    const ents = new KbEntityRepository(ds)
    const atoms = new KbAtomRepository(ds)
    const notes = new KbNoteRepository(ds)
    await ents.upsertMention('kb-chr-single', { name: '独行侠', type: 'character', aliases: [] })
    const ent = (await ents.listActiveWithAliases('kb-chr-single', 10))[0]
    await atoms.createBatch([
      { knowledgeBaseId: 'kb-chr-single', statement: '单书-1', type: 'fact', sourceDocumentId: 'doc-single', sourceQuote: 'q1', subjectEntityId: ent.id },
      { knowledgeBaseId: 'kb-chr-single', statement: '单书-2', type: 'fact', sourceDocumentId: 'doc-single', sourceQuote: 'q2', subjectEntityId: ent.id },
      { knowledgeBaseId: 'kb-chr-single', statement: '单书-3', type: 'fact', sourceDocumentId: 'doc-single', sourceQuote: 'q3', subjectEntityId: ent.id },
      { knowledgeBaseId: 'kb-chr-single', statement: '单书-4', type: 'fact', sourceDocumentId: 'doc-single', sourceQuote: 'q4', subjectEntityId: ent.id },
    ])
    const svc = new KbDistillService({
      llm: characterLlm,
      embed: async (texts) => texts.map(() => [1, 0]), // 全部同簇——但只有一本书
      repos: () => ({ atoms, notes, entities: ents }),
      settingPatternEnabled: false,
      characterPatternEnabled: true,
    })
    const out = await svc.distill('kb-chr-single', null)
    expect(out.cardsProposed).toBe(0)
  })
})
