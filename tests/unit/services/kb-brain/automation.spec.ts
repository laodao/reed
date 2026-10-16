/**
 * 后台自动化流水线测试
 *
 * 流程序（续消化优先/消化中让位/全 detail 触发补标/目标首跑必跑+重跑需冷却与
 * 论断增长/冷却记账防重复/配置关停/成本熔断/单飞锁）。fake 依赖，无 DB。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { KbBrainAutomationService, type KbBrainAutomationDeps } from '@core/platform/services/kb-brain/automation.service'
import { markDigestLive, markDigestDone } from '@core/platform/services/kb-brain/liveness'

interface KbRow {
  id: string
  brainConfig: string
  brainState: string | null
}
interface DocRow {
  id: string
  brainStatus: string | null
}

function makeDeps(overrides: Partial<KbBrainAutomationDeps> = {}) {
  const calls: string[] = []
  const kbs: KbRow[] = [
    {
      id: 'kb1',
      brainConfig: JSON.stringify({
        enabled: true,
        profile: { contentType: 'novel' },
        models: { atomize: '', adjudicate: 'prov:adj-model' },
        goals: [
          { id: 'g1', name: '世界观设定集', hint: 'h1', enabled: true },
          { id: 'g2', name: '写作套路', hint: 'h2', enabled: false },
        ],
      }),
      brainState: null,
    },
  ]
  const docs: DocRow[] = [{ id: 'doc1', brainStatus: 'digested' }]
  const stats = {
    byStatus: { supported: 100 } as Record<string, number>,
    byLayer: { detail: 100 } as Record<string, number>,
    byType: {} as Record<string, number>,
    total: 100,
    humanOrigin: 0,
    cited: 0,
    openQuestions: 0,
  }
  const savedStates: Array<Record<string, unknown>> = []
  /** 僵死看护数据源：文档 → 台账行（缺省空 = 无在跑台账） */
  const passesByDocument: Record<string, Array<{ status: string; updatedAt: Date | null }>> = {}
  /** 冶炼增长门的事件量（测试可改） */
  let eventsCount = 100
  const deps: KbBrainAutomationDeps & {
    calls: string[]
    kbs: KbRow[]
    docs: DocRow[]
    stats: typeof stats
    savedStates: Array<Record<string, unknown>>
    passesByDocument: Record<string, Array<{ status: string; updatedAt: Date | null }>>
    setEventsCount(n: number): void
  } = {
    calls,
    kbs,
    docs,
    stats,
    savedStates,
    passesByDocument,
    setEventsCount: (n: number) => (eventsCount = n),
    now: () => Date.now(),
    repos: () => ({
      kbs: {
        findAll: async () => kbs,
        findById: async (id: string) => kbs.find((k) => k.id === id) ?? null,
        updateBrainState: async (_id: string, raw: string) => {
          savedStates.push(JSON.parse(raw) as Record<string, unknown>)
          const kb = kbs.find((k) => k.id === _id)
          if (kb) kb.brainState = raw
          return true
        },
      },
      docs: {
        findByKnowledgeBaseId: async () => docs,
        updateBrainStatus: async (docId: string, patch: { status?: string }) => {
          const doc = docs.find((d) => d.id === docId)
          if (doc && patch.status) doc.brainStatus = patch.status
          calls.push(`docs-update-status:${docId}:${patch.status ?? ''}`)
          return true
        },
      },
      atoms: { statsByKb: async () => stats },
      passes: {
        costByKb: async () => ({ calls: 0 }),
        listByDocument: async (docId: string) => passesByDocument[docId] ?? [],
        resetToPending: async () => {
          calls.push('passes-reset-to-pending')
          return true
        },
      },
      events: { countByKb: async () => eventsCount },
    }),
    digest: {
      enqueue: async (docId: string) => {
        calls.push(`digest-enqueue:${docId}`)
        return true
      },
      reviveExhausted: async (docId: string) => {
        calls.push(`digest-revive:${docId}`)
        return 3
      },
    },
    sceneBackfill: async (kbId: string, batch?: number) => {
      calls.push(`scene-backfill:${kbId}:${batch ?? 'default'}`)
      return { processed: 0, scenes: 0 }
    },
    smelt: {
      isRunning: () => false,
      runAll: async (kbId: string, modelRef?: string) => {
        calls.push(`smelt:${kbId}:${modelRef ?? 'default'}`)
        return { stages: [], llmCalls: 0, noteIds: ['n1', 'n2'], gate: 'publish' }
      },
    },
    corpus: {
      isRunning: () => false,
      run: async (kbId: string, modelRef?: string) => {
        calls.push(`corpus:${kbId}:${modelRef ?? 'default'}`)
        return { merged: 2, corpusMarked: 3, matrixNoteIds: ['n3'] }
      },
    },
    autoLog: {
      record: async (kbId: string, action: string, detail: Record<string, unknown>) => {
        calls.push(`autolog:${action}:${(detail.noteIds as string[]).length}`)
      },
    },
    relabel: {
      isRunning: () => false,
      setModelOverride: () => calls.push('relabel:model'),
      run: async (kbId: string) => {
        calls.push(`relabel:${kbId}`)
        return { running: false, totalBatches: 2, processedBatches: 2, relabeledCount: 90, failedBatches: 0 }
      },
    },
    rejudge: {
      isRunning: () => false,
      run: async () => ({ knowledgeCount: 10, evidenceCount: 5, junkCount: 2, failedBatches: 0 }),
    },
    quartet: {
      isRunning: () => false,
      reading: async () => ({}),
      graph: async () => ({}),
      review: async () => ({}),
      summary: async () => ({}),
    },
    dimensionInduct: {
      isRunning: () => false,
      propose: async () => ({ seeded: 0, proposed: 2, skipped: false }),
    },
    systemAggregate: {
      isRunning: () => true,
      run: async () => ({ systemsBuilt: 0, nodesCreated: 0, edgesCreated: 0, notesCreated: 0 }),
    },
    bookPasses: {
      isRunningKb: () => false,
      setModelOverride: () => calls.push('bookpass:model'),
      runForKnowledgeBase: async (kbId: string, ct: string, docIds: string[]) => {
        calls.push(`bookpass:${kbId}:${ct}:${docIds.join(',')}`)
        return { running: false, totalDocs: docIds.length, processedDocs: docIds.length }
      },
    },
    goals: {
      isRunning: () => false,
      setModelOverride: () => calls.push('goal:model'),
      runGoal: async (_kbId: string, goal: { id: string }) => {
        calls.push(`goal:${goal.id}`)
        return { batches: 1, fragments: 5, proposed: true, skippedDuplicate: false, cardTitle: 't', cards: 1 }
      },
    },
    consolidate: {
      isRunning: () => false,
      run: async () => {
        calls.push('consolidate')
        return {}
      },
    },
    cleanup: {
      isRunning: () => false,
      run: async () => {
        calls.push('cleanup')
        return {}
      },
    },
    foreshadow: {
      isRunning: () => false,
      run: async () => {
        calls.push('foreshadow')
        return {}
      },
    },
    ...overrides,
  }
  const svc = new KbBrainAutomationService(deps)
  return { svc, deps }
}

describe('KbBrainAutomationService', () => {
  beforeEach(() => {
    delete process.env.KB_BRAIN_DAILY_COST_LIMIT
  })

  it('全消化完成的老库：一轮跑完 场面补采→补标→书级→目标(仅启用的)→归纳→清理→伏笔，记账落 brain_state', async () => {
    const { svc, deps } = makeDeps()
    const result = await svc.runCycle('kb1')
    expect(result.skipped).toBeUndefined()
    expect(deps.calls).toEqual([
      'scene-backfill:kb1:default',
      'smelt:kb1:prov:adj-model',
      'autolog:smelt:2',
      'corpus:kb1:prov:adj-model',
      'autolog:corpus:1',
      'relabel:model',
      'relabel:kb1',
      'bookpass:model',
      'bookpass:kb1:novel:doc1',
      'goal:model',
      'goal:g1',
      'consolidate',
      'cleanup',
      'foreshadow',
    ])
    expect(result.ran).toEqual(['scene-backfill', 'smelt', 'corpus-merge', 'layer-relabel', 'rejudge', 'dimension-induct', 'book-passes', 'quartet', 'goal:世界观设定集', 'consolidate', 'cleanup', 'foreshadow'])
    // 记账：目标运行时间 + 论断基线、补标基线、场面补采冷却、冶炼基线
    const auto = deps.savedStates.at(-1)?.automation as Record<string, unknown>
    const goalRuns = auto.goalRuns as Record<string, { at: string; atoms: number }>
    expect(goalRuns.g1.atoms).toBe(100)
    expect(goalRuns.g2).toBeUndefined() // 未启用的目标不跑不记
    expect(auto.relabelAtoms).toBe(100)
    expect(auto.lastLayerRelabelAt).toBeTruthy()
    expect(auto.quartetRuns?.doc1).toBeTruthy()
    expect(auto.lastSceneBackfillAt).toBeTruthy()
    expect(auto.lastSmeltAt).toBeTruthy()
    expect(auto.smeltEvents).toBe(100)
  })

  it('冶炼增长门：冷却已过但事件量没长 → 不重跑；事件明显增长 → 重跑', async () => {
    const { svc, deps } = makeDeps()
    await svc.runCycle('kb1')
    deps.calls.length = 0
    // 冷却改 25h 前（已过）但事件量不变 → 不跑
    const kb = deps.kbs[0]!
    const st = JSON.parse(kb.brainState!) as { automation: Record<string, unknown> }
    ;(st.automation.lastSmeltAt as string) = new Date(Date.now() - 25 * 3600_000).toISOString()
    kb.brainState = JSON.stringify(st)
    const r2 = await svc.runCycle('kb1')
    expect(r2.ran).not.toContain('smelt')
    expect(deps.calls).not.toContain('smelt:kb1:prov:adj-model')
    // 事件 +30% → 重跑
    deps.setEventsCount(130)
    const r3 = await svc.runCycle('kb1')
    expect(r3.ran).toContain('smelt')
  })

  it('冶炼开关关（automation.smelt=false）→ 步骤跳过', async () => {
    const { svc, deps } = makeDeps()
    deps.kbs[0]!.brainConfig = JSON.stringify({
      enabled: true,
      profile: { contentType: 'novel' },
      models: { atomize: '', adjudicate: '' },
      goals: [],
      automation: { enabled: true, smelt: false },
    })
    const result = await svc.runCycle('kb1')
    expect(result.ran).not.toContain('smelt')
    expect(deps.calls.filter((c) => c.startsWith('smelt:'))).toHaveLength(0)
  })

  it('事件不足（<16）→ 冶炼不触发', async () => {
    const { svc, deps } = makeDeps()
    deps.setEventsCount(10)
    const result = await svc.runCycle('kb1')
    expect(result.ran).not.toContain('smelt')
  })

  it('场面补采开关关（automation.sceneBackfill=false）→ 步骤跳过', async () => {
    const { svc, deps } = makeDeps()
    deps.kbs[0]!.brainConfig = JSON.stringify({
      enabled: true,
      profile: { contentType: 'novel' },
      models: { atomize: '', adjudicate: '' },
      goals: [],
      automation: { enabled: true, sceneBackfill: false },
    })
    const result = await svc.runCycle('kb1')
    expect(result.ran).not.toContain('scene-backfill')
    expect(deps.calls).not.toContain('scene-backfill:kb1:default')
  })

  it('有 failed/pending 文档 → 续消化排队（不排队更多书），下游提炼并行推进（v3 放宽让位）', async () => {
    const { svc, deps } = makeDeps()
    deps.docs.push({ id: 'doc2', brainStatus: 'failed' })
    const result = await svc.runCycle('kb1')
    // 只有非 digested/digesting/skipped 的 doc2 进续消化
    expect(deps.calls).toContain('digest-revive:doc2')
    expect(deps.calls).toContain('digest-enqueue:doc2')
    // v3：消化排队不再阻塞下游——book-passes 等提炼照常执行
    expect(result.ran).toContain('digest')
    expect(result.ran).toContain('book-passes')
  })

  it('消化中（台账有新鲜 running 章）→ 聚焦消化不排队新书，但下游提炼并行（v3 放宽让位）', async () => {
    const { svc, deps } = makeDeps()
    deps.docs[0]!.brainStatus = 'digesting'
    deps.passesByDocument['doc1'] = [{ status: 'running', updatedAt: new Date() }]
    const result = await svc.runCycle('kb1')
    expect(result.skipped).toBeUndefined()
    // 不排队更多书（预算聚焦），但下游步骤照常执行
    expect(deps.calls).not.toContain('digest-enqueue:doc1')
    expect(result.ran).toContain('book-passes')
    expect(result.ran).not.toContain('digest')
  })

  it('僵死消化（digesting 但只有陈旧 running 台账）→ 复位台账与文档并入队', async () => {
    const { svc, deps } = makeDeps()
    deps.docs[0]!.brainStatus = 'digesting'
    deps.passesByDocument['doc1'] = [
      { status: 'running', updatedAt: new Date(Date.now() - 30 * 60_000) },
    ]
    const result = await svc.runCycle('kb1')
    expect(deps.calls).toContain('docs-update-status:doc1:pending')
    expect(deps.calls).toContain('digest-enqueue:doc1')
    expect(result.ran).toContain('digest')
  })

  it('digesting 但台账全部陈旧（running+pending 混合）→ 复位并入队（pending 不算存活证据）', async () => {
    const { svc, deps } = makeDeps()
    deps.docs[0]!.brainStatus = 'digesting'
    deps.passesByDocument['doc1'] = [
      { status: 'running', updatedAt: new Date(Date.now() - 30 * 60_000) },
      { status: 'pending', updatedAt: new Date(Date.now() - 30 * 60_000) },
    ]
    const result = await svc.runCycle('kb1')
    expect(deps.calls).toContain('passes-reset-to-pending')
    expect(deps.calls).toContain('docs-update-status:doc1:pending')
    expect(deps.calls).toContain('digest-enqueue:doc1')
    expect(result.ran).toContain('digest')
  })

  it('进程内存活 run（liveness 注册表）→ 台账再陈旧也不误复位（review H5）', async () => {
    const { svc, deps } = makeDeps()
    deps.docs[0]!.brainStatus = 'digesting'
    // 台账 30min 无更新——单章 LLM 调用超看护窗的常态形态
    deps.passesByDocument['doc1'] = [
      { status: 'running', updatedAt: new Date(Date.now() - 30 * 60_000) },
    ]
    markDigestLive('doc1')
    try {
      const result = await svc.runCycle('kb1')
      expect(deps.calls).not.toContain('passes-reset-to-pending')
      expect(deps.calls).not.toContain('docs-update-status:doc1:pending')
      // 存活 run 在跑：不误复位、不排队新书（v3：下游提炼并行，不再整轮让位）
      expect(deps.calls).not.toContain('digest-enqueue:doc1')
      expect(result.skipped).toBeUndefined()
    } finally {
      markDigestDone('doc1')
    }
    // 注册表注销（run 结束/进程死亡）后，DB 陈旧判定照常兜底
    deps.calls.length = 0
    const r2 = await svc.runCycle('kb1')
    expect(deps.calls).toContain('docs-update-status:doc1:pending')
    expect(deps.calls).toContain('digest-enqueue:doc1')
    expect(r2.ran).toContain('digest')
  })

  it('冷却记账：紧接的第二轮什么都不重复跑', async () => {
    const { svc, deps } = makeDeps()
    await svc.runCycle('kb1')
    const first = deps.calls.length
    deps.calls.length = 0
    const second = await svc.runCycle('kb1')
    expect(second.ran).toEqual([])
    expect(deps.calls).toHaveLength(0)
    expect(first).toBeGreaterThan(0)
  })

  it('目标重跑门槛：冷却到了但论断池没长 → 不重跑；论断池明显增长 → 重跑', async () => {
    const { svc, deps } = makeDeps()
    await svc.runCycle('kb1')
    deps.calls.length = 0
    // 冷却已过（改记账时间为 25h 前）但论断池没变 → 不重跑
    const kb = deps.kbs[0]!
    const st1 = JSON.parse(kb.brainState!) as { automation: Record<string, unknown> }
    const runs1 = st1.automation.goalRuns as Record<string, { at: string; atoms: number }>
    runs1.g1.at = new Date(Date.now() - 25 * 3600_000).toISOString()
    kb.brainState = JSON.stringify(st1)
    const r2 = await svc.runCycle('kb1')
    expect(r2.ran).not.toContain('goal:世界观设定集')
    expect(deps.calls).not.toContain('goal:g1')
    // 论断池 +30% → 重跑
    deps.stats.byStatus.supported = 130
    deps.stats.byLayer.detail = 130
    const r3 = await svc.runCycle('kb1')
    expect(r3.ran).toContain('goal:世界观设定集')
    expect(deps.calls).toContain('goal:g1')
  })

  it('自动化关停（automation.enabled=false）→ skipped=disabled，零调用', async () => {
    const { svc, deps } = makeDeps()
    deps.kbs[0]!.brainConfig = JSON.stringify({ enabled: true, automation: { enabled: false } })
    const result = await svc.runCycle('kb1')
    expect(result.skipped).toBe('disabled')
    expect(deps.calls).toEqual([])
  })

  it('大脑总开关关（enabled=false）→ skipped=disabled', async () => {
    const { svc, deps } = makeDeps()
    deps.kbs[0]!.brainConfig = JSON.stringify({ enabled: false })
    const result = await svc.runCycle('kb1')
    expect(result.skipped).toBe('disabled')
    expect(deps.calls).toEqual([])
  })

  it('成本熔断：当日调用超限 → skipped=cost-limit', async () => {
    process.env.KB_BRAIN_DAILY_COST_LIMIT = '100'
    const { deps } = makeDeps()
    // 重写 repos 让 costByKb 返回超限值
    const svc2 = new KbBrainAutomationService({
      ...(deps as unknown as KbBrainAutomationDeps),
      repos: () => ({
        kbs: {
          findAll: async () => deps.kbs,
          findById: async (id: string) => deps.kbs.find((k) => k.id === id) ?? null,
          updateBrainState: async () => true,
        },
        docs: {
          findByKnowledgeBaseId: async () => deps.docs,
          updateBrainStatus: async () => true,
        },
        atoms: { statsByKb: async () => deps.stats },
        passes: {
          costByKb: async () => ({ calls: 200 }),
          listByDocument: async () => [],
        },
      }),
    })
    const result = await svc2.runCycle('kb1')
    expect(result.skipped).toBe('cost-limit')
    expect(deps.calls).toEqual([])
  })

  it('目标提炼抛错 → 不记账（下轮可重试），且不阻断后续动作（fail-soft）', async () => {
    const { deps } = makeDeps()
    const failing = new KbBrainAutomationService({
      ...(deps as unknown as KbBrainAutomationDeps),
      goals: {
        isRunning: () => false,
        setModelOverride: () => undefined,
        runGoal: async () => {
          throw new Error('LLM 限流')
        },
      },
    })
    const result = await failing.runCycle('kb1')
    expect(result.errors).toEqual([{ action: 'goal:世界观设定集', error: 'LLM 限流' }])
    expect(result.ran).not.toContain('goal:世界观设定集')
    // 目标失败不记账
    const last = deps.savedStates.at(-1)?.automation as Record<string, unknown>
    expect(last.goalRuns).toBeUndefined()
    // 目标在归纳/清理/伏笔之前 → 失败后它们照常跑
    expect(result.ran).toContain('layer-relabel')
    expect(result.ran).toContain('consolidate')
    expect(deps.calls).toContain('consolidate')
  })

  it('周期单飞：同库周期进行中重复 runAll 不重入', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { deps } = makeDeps()
    const slow = new KbBrainAutomationService({
      ...(deps as unknown as KbBrainAutomationDeps),
      goals: {
        isRunning: () => false,
        setModelOverride: () => undefined,
        runGoal: async () => {
          deps.calls.push('goal:g1')
          await gate
          return { batches: 1, fragments: 1, proposed: false, skippedDuplicate: false, cardTitle: null, cards: 0 }
        },
      },
    })
    const p1 = slow.runAll()
    // 第一个周期卡在 goal（cycleRunning 持锁）——runAll 再跑一轮不会为同库再起周期
    await new Promise((r) => setTimeout(r, 10))
    await slow.runAll()
    release()
    await p1
    expect(deps.calls.filter((c) => c === 'goal:g1')).toHaveLength(1)
  })
})
