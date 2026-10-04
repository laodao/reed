/**
 * 内容画像服务测试（§类型化提取）
 *
 * 覆盖：采样策略（摘要优先/正文兜底/均匀铺开）、类型解析、每文档只探测一次
 * （成功与失败都落 detectedAt，幂等重跑零新增调用）、已有画像/用户手改不覆盖、
 * 检测失败不阻塞（fail-soft 返回未识别）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbBrainProfileService, resetProfileDetectMemoForTests, type KbProfileRepos } from '@core/platform/services/kb-brain/profile.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { defaultBrainConfig, parseBrainConfig } from '@core/platform/services/kb-brain/brain-config'
import { createKbBrainTestTables, insertTestKb, insertTestDoc } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

const PROFILE_JSON = (ct: string, genre: string): string =>
  JSON.stringify({ contentType: ct, genre })

describe('KbBrainProfileService', () => {
  let ds: DataSource
  let llmCalls: Array<{ system: string; user: string }>

  const makeSvc = (llmReply: string): { svc: KbBrainProfileService; repos: KbProfileRepos } => {
    llmCalls = []
    const repos: KbProfileRepos = {
      chapters: new KbChapterRepository(ds),
      kbs: new KnowledgeBaseRepository(ds),
    }
    const svc = new KbBrainProfileService({
      llm: (async (req) => {
        llmCalls.push({ system: req.system, user: req.user })
        return llmReply
      }) as BrainLlmFn,
      repos: () => repos,
    })
    return { svc, repos }
  }

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

  async function plantDoc(docId: string, kbId: string, withSummary: boolean): Promise<void> {
    await insertTestDoc(ds, { id: docId, kbId })
    const chapters = new KbChapterRepository(ds)
    const inputs = [1, 2, 3].map((i) => ({
      id: `${docId}-ch${i}`,
      documentId: docId,
      knowledgeBaseId: kbId,
      title: `第${i}章`,
      level: 1,
      ordering: i,
      content: `这是第${i}章的正文内容，讲述修炼体系的运转规则与人物冲突。`,
    }))
    await chapters.replaceByDocument(docId, inputs)
    // 摘要与章节插入是两条写路径（KbChapterInput 不带 summary）——单独回写
    if (withSummary) {
      for (const inp of inputs) {
        await chapters.updateSummary(inp.id, { summary: `${inp.title}梗概：主角突破境界。`, status: 'done' })
      }
    }
  }

  it('检测成功：解析类型+体裁并写回 brainConfig.profile', async () => {
    await insertTestKb(ds, { id: 'kb-p1', brainConfig: JSON.stringify(defaultBrainConfig(true)) })
    await plantDoc('doc-p1', 'kb-p1', true)
    const { svc } = makeSvc(PROFILE_JSON('novel', '修真'))
    const cfg = parseBrainConfig((await new KnowledgeBaseRepository(ds).findById('kb-p1'))!.brainConfig)!
    const profile = await svc.ensureProfile('kb-p1', 'doc-p1', cfg)
    expect(profile.contentType).toBe('novel')
    expect(profile.genre).toBe('修真')
    expect(profile.detectedAt).toBeTruthy()
    const raw = JSON.parse((await new KnowledgeBaseRepository(ds).findById('kb-p1'))!.brainConfig!)
    expect(raw.profile.contentType).toBe('novel')
    expect(llmCalls.length).toBe(1)
    // 采样走的是章节摘要
    expect(llmCalls[0].user).toContain('第1章梗概')
  })

  it('幂等：同文档二次 ensureProfile 不再调 LLM（成功已落画像）', async () => {
    await insertTestKb(ds, { id: 'kb-p2', brainConfig: JSON.stringify(defaultBrainConfig(true)) })
    await plantDoc('doc-p2', 'kb-p2', true)
    const { svc } = makeSvc(PROFILE_JSON('knowledge', ''))
    const kbRepo = new KnowledgeBaseRepository(ds)
    const cfg1 = parseBrainConfig((await kbRepo.findById('kb-p2'))!.brainConfig)!
    await svc.ensureProfile('kb-p2', 'doc-p2', cfg1)
    const callsAfterFirst = llmCalls.length
    const cfg2 = parseBrainConfig((await kbRepo.findById('kb-p2'))!.brainConfig)!
    await svc.ensureProfile('kb-p2', 'doc-p2', cfg2)
    expect(llmCalls.length).toBe(callsAfterFirst)
  })

  it('检测失败：不落标记、同实例短路、跨实例（重启语义）自动重试', async () => {
    await insertTestKb(ds, { id: 'kb-p3', brainConfig: JSON.stringify(defaultBrainConfig(true)) })
    await plantDoc('doc-p3', 'kb-p3', false)
    // 回复是 atomize 形态 JSON（无 contentType 字段）→ 检测不出
    const { svc } = makeSvc(JSON.stringify({ atoms: [{ statement: 'x', type: 'fact', quote: 'y' }] }))
    const kbRepo = new KnowledgeBaseRepository(ds)
    const cfg1 = parseBrainConfig((await kbRepo.findById('kb-p3'))!.brainConfig)!
    const p1 = await svc.ensureProfile('kb-p3', 'doc-p3', cfg1)
    expect(p1.contentType).toBe('')
    expect(p1.detectedAt).toBeUndefined() // 失败不落标记（成功才有 detectedAt）
    const calls = llmCalls.length
    await svc.ensureProfile('kb-p3', 'doc-p3', cfg1)
    expect(llmCalls.length).toBe(calls) // 同一应用运行内：进程内记忆短路，零重复探测
    // 新实例 + 清记忆（模拟应用重启）→ 自动重试
    // （makeSvc 会重置 llmCalls——重置后的 1 次调用即本次重试）
    resetProfileDetectMemoForTests()
    const retry = makeSvc(PROFILE_JSON('novel', '修真'))
    expect(llmCalls.length).toBe(0)
    const cfg2 = parseBrainConfig((await kbRepo.findById('kb-p3'))!.brainConfig)!
    const p3 = await retry.svc.ensureProfile('kb-p3', 'doc-p3', cfg2)
    expect(llmCalls.length).toBe(1)
    expect(p3.contentType).toBe('novel')
  })

  it('用户已指定内容类型 → 不检测、不覆盖', async () => {
    await insertTestKb(ds, { id: 'kb-p4', brainConfig: JSON.stringify({ ...defaultBrainConfig(true), profile: { contentType: 'history', genre: '明清史' } }) })
    await plantDoc('doc-p4', 'kb-p4', true)
    const { svc } = makeSvc(PROFILE_JSON('novel', ''))
    const cfg = parseBrainConfig((await new KnowledgeBaseRepository(ds).findById('kb-p4'))!.brainConfig)!
    const profile = await svc.ensureProfile('kb-p4', 'doc-p4', cfg)
    expect(profile.contentType).toBe('history')
    expect(llmCalls.length).toBe(0)
  })

  it('无章节样本 → 返回未识别且不炸', async () => {
    await insertTestKb(ds, { id: 'kb-p5', brainConfig: JSON.stringify(defaultBrainConfig(true)) })
    await insertTestDoc(ds, { id: 'doc-p5', kbId: 'kb-p5' })
    const { svc } = makeSvc(PROFILE_JSON('novel', ''))
    const cfg = parseBrainConfig((await new KnowledgeBaseRepository(ds).findById('kb-p5'))!.brainConfig)!
    const profile = await svc.ensureProfile('kb-p5', 'doc-p5', cfg)
    expect(profile.contentType).toBe('')
  })

  it('采样均匀铺开：大量章节只取上限个样本', async () => {
    await insertTestKb(ds, { id: 'kb-p6', brainConfig: JSON.stringify(defaultBrainConfig(true)) })
    await insertTestDoc(ds, { id: 'doc-p6', kbId: 'kb-p6' })
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-p6', Array.from({ length: 60 }, (_, i) => ({
      id: `doc-p6-ch${i}`,
      documentId: 'doc-p6',
      knowledgeBaseId: 'kb-p6',
      title: `第${i + 1}章`,
      level: 1,
      ordering: i,
      content: `第${i + 1}章正文`,
      summary: `第${i + 1}章梗概`,
    })))
    const { svc } = makeSvc(PROFILE_JSON('novel', ''))
    await svc.detect('doc-p6')
    const sampleCount = (llmCalls[0].user.match(/《第\d+章》/g) ?? []).length
    expect(sampleCount).toBeLessThanOrEqual(12)
  })
})
