/**
 * lw_patch_chapter（章节局部修正）单测
 *
 * 走真实注册表管线（zod 校验同线上），服务层 mock。钉死：
 * - 正常链路：excerpt 定位 → splice → saveChapter → 图谱重提（整章新全文）→ 回执
 *   （paragraph/before/after/wordCount/remainingConflicts）；
 * - conflictKey 自动登记 resolved（wizard_state.conflictResolutions）；
 * - 摘录未命中：整单拒绝 + 近似片段线索，绝不模糊替换；
 * - nth：多处同短语取第几处；越界明确报错；
 * - 与章法工作流互斥：同 scope 在途 run 存在即拒绝；
 * - 无正文/非章节节点明确报错。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { registerLwRoomTools } from '@core/packs/longwriting/story-room/room-agent-tools'

vi.mock('@core/database/database-manager.interface', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCoreDatabaseManager: () => (globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb,
}))

vi.mock('@core/packs/longwriting/services/longwriting.service', () => ({
  LongWritingService: {
    getInstance: () => (globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake.svc,
  },
}))

vi.mock('@core/platform/services/longwriting/graph/chapter-graph.processor', () => ({
  ChapterGraphProcessor: class {
    async process(input: unknown) {
      const fake = (globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake
      fake.processCalls.push(input)
      return { events: [], states: [], edges: [], stateCount: 0 }
    }
  },
}))

vi.mock('@core/platform/services/longwriting/graph/consistency.service', () => ({
  ConsistencyService: {
    getInstance: () => (globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake.consistency,
  },
}))

const CONTENT = '第一段原文。\n\n第五日丑时三刻，崔九登船。七日之限只剩最后两夜。\n\n第三段。'

import { conflictKey } from '@core/platform/services/longwriting/conflict-gate'

/** 现存疑点（scanContradictions 返回形态）与它算出的合法 key */
const PENDING_CONFLICT = { rule: 'R10', entityName: 'x', chapterNumber: 5, message: '第5章纪日与第7章公决差一天' }
const VALID_KEY = conflictKey(PENDING_CONFLICT)

function mkFake(opts: { content?: string | null; busy?: boolean; remaining?: any[]; pending?: any[] } = {}) {
  const saves: Array<{ id: string; content: string }> = []
  const processCalls: any[] = []
  const resolutions: any[] = []
  const db = {
    lwOutlines: { getByProjectId: async () => [{ id: 'ol_5', nodeType: 'chapter', name: '第五章', orderIndex: 1, summary: '' }] },
    lwChapters: { getByOutlineId: async () => (opts.content ? { id: 'ch_5', content: opts.content } : null) },
    workflowRuns: { findByMutexScope: async () => (opts.busy ? [{ id: 'run_1' }] : []) },
    lwProjects: {
      getById: async () => ({ id: 'p1', wizardState: { conflictResolutions: [...resolutions] } }),
      update: async (_id: string, patch: { wizardState: Record<string, unknown> }) => {
        resolutions.length = 0
        resolutions.push(...((patch.wizardState.conflictResolutions as any[]) || []))
        return { id: _id }
      },
    },
  }
  const fake = {
    db,
    saves,
    processCalls,
    resolutions,
    svc: {
      getChapter: vi.fn(async () => (opts.content ? { id: 'ch_5', content: opts.content } : null)),
      saveChapter: vi.fn(async (id: string, content: string) => {
        saves.push({ id, content })
        return { id }
      }),
    },
    consistency: {
      scanBlockingConflicts: vi.fn(async () => opts.remaining ?? []),
      scanContradictions: vi.fn(async () => opts.pending ?? []),
    },
  }
  return fake
}

let fake: ReturnType<typeof mkFake>

function getTool(name: string): AgentToolDef {
  const registry = new AgentToolRegistry()
  registerLwRoomTools(registry)
  const defs = registry.buildToolDefs([{ tool: name } as never])
  const def = defs[name]
  if (!def) throw new Error(`工具未注册：${name}`)
  return def
}

const ctx = { logContext: { projectId: 'p1' } } as never

async function run(name: string, input: unknown) {
  const outer = (await getTool(name).execute(input, ctx)) as {
    ok?: boolean
    data?: Record<string, unknown>
    error?: unknown
    detail?: unknown
    hint?: unknown
  }
  if (outer.ok === false) {
    return { ok: false, data: {} as Record<string, unknown>, error: String(outer.detail ?? outer.hint ?? outer.error ?? '') }
  }
  const raw = (outer.data ?? {}) as { ok?: boolean; data?: Record<string, unknown>; error?: unknown }
  return { ok: raw.ok !== false, data: (raw.data ?? {}) as Record<string, unknown>, error: typeof raw.error === 'string' ? raw.error : String(raw.error ?? '') }
}

beforeEach(() => {
  fake = mkFake({ content: CONTENT })
  ;(globalThis as unknown as { __lwPatchFake?: unknown }).__lwPatchFake = fake
  ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
  registerEventEmitter(() => ({
    emit: () => undefined,
    emitProgress: () => undefined,
    emitStatus: () => undefined,
  } as never))
})

const INPUT = {
  chapter: '第1章',
  problem: '七日倒计时差一整天',
  excerpt: '第五日丑时三刻',
  replacement: '第六日丑时三刻',
  conflictKey: VALID_KEY,
}

describe('lw_patch_chapter 正常链路', () => {
  it('定位→splice→保存→图谱重提（整章新全文）→回执字段', async () => {
    fake = mkFake({ content: CONTENT, pending: [PENDING_CONFLICT] })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', INPUT)
    expect(r.ok).toBe(true)
    expect(r.data.paragraph).toBe(2)
    expect(r.data.before).toBe('第五日丑时三刻')
    expect(r.data.after).toBe('第六日丑时三刻')
    expect(r.data.remainingConflicts).toBe(0)
    // 保存的是替换后的整章
    expect(fake.saves).toHaveLength(1)
    expect(fake.saves[0].content).toContain('第六日丑时三刻')
    expect(fake.saves[0].content).not.toContain('第五日丑时三刻')
    // 图谱重提收到整章新全文 + 章号
    expect(fake.processCalls).toHaveLength(1)
    expect(fake.processCalls[0].chapterContent).toBe(fake.saves[0].content)
    expect(fake.processCalls[0].chapterNumber).toBe(1)
    expect(String(r.data.message)).toContain('已修正第1章第2段')
  })

  it('conflictKey 与现存疑点匹配：修正成功后自动登记 resolved', async () => {
    fake = mkFake({ content: CONTENT, pending: [PENDING_CONFLICT] })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', INPUT)
    expect(r.ok).toBe(true)
    expect(fake.resolutions).toHaveLength(1)
    expect(fake.resolutions[0]).toMatchObject({ key: VALID_KEY, status: 'resolved' })
    expect(String(r.data.message)).toContain('已登记 resolved')
  })

  it('幻觉 key（不匹配任何现存疑点）：忽略不登记，回执明说（key 契约）', async () => {
    fake = mkFake({ content: CONTENT, pending: [PENDING_CONFLICT] })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', { ...INPUT, conflictKey: 'R10|y|9|deadbeef' })
    expect(r.ok).toBe(true)
    expect(fake.resolutions).toHaveLength(0)
    expect(String(r.data.message)).toContain('未匹配现存疑点、未登记')
  })

  it('幂等短路：摘录已不存在且替换文本已在正文 → 回成功不重复改（超时重试场景）', async () => {
    // 模拟补丁此前已落库：正文里只有 replacement、没有 excerpt
    const already = CONTENT.replace('第五日丑时三刻', '第六日丑时三刻')
    fake = mkFake({ content: already, pending: [PENDING_CONFLICT] })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', INPUT)
    expect(r.ok).toBe(true)
    expect(r.data.idempotent).toBe(true)
    expect(fake.saves).toHaveLength(0)
    expect(fake.processCalls).toHaveLength(0)
  })

  it('替换文本跨多句：replacement 原样插入（不加解释）', async () => {
    const r = await run('lw_patch_chapter', { ...INPUT, replacement: '第六日丑时三刻，崔九登船。只剩最后一夜。', conflictKey: undefined })
    expect(r.ok).toBe(true)
    expect(fake.saves[0].content).toContain('只剩最后一夜。')
    expect(fake.saves[0].content).not.toContain('第五日丑时三刻')
  })
})

describe('lw_patch_chapter 防线', () => {
  it('摘录未命中：整单拒绝 + 近似片段线索，不保存不重提', async () => {
    const r = await run('lw_patch_chapter', { ...INPUT, excerpt: '第五日丑时三刻，周九登船' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('找不到')
    expect(r.error).toContain('近似片段')
    expect(fake.saves).toHaveLength(0)
    expect(fake.processCalls).toHaveLength(0)
  })

  it('nth 取第几处：替换第二处命中', async () => {
    const content = '案匣仍在。\n\n中段提到案匣。\n\n尾段又提案匣。'
    fake = mkFake({ content })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', { chapter: '第1章', problem: 'p', excerpt: '案匣', nth: 2, replacement: '案卷' })
    expect(r.ok).toBe(true)
    expect(r.data.paragraph).toBe(2)
    expect(r.data.before).toBe('案匣')
    expect(fake.saves[0].content).toBe('案匣仍在。\n\n中段提到案卷。\n\n尾段又提案匣。')
  })

  it('nth 越界明确报错', async () => {
    const r = await run('lw_patch_chapter', { ...INPUT, nth: 9 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('找不到')
  })

  it('归一化救援：摘录引号样式漂移仍可定位', async () => {
    const quoted = '第一段。\n\n她说「方子动过」便走了。'
    fake = mkFake({ content: quoted })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', { chapter: '第1章', problem: 'p', excerpt: '她说“方子动过”', replacement: '她说“方子被人动过”' })
    expect(r.ok).toBe(true)
    expect(r.data.before).toBe('她说「方子动过')
  })

  it('章法工作流运行中：拒绝（防同章 last-write-win 互相覆盖）', async () => {
    fake = mkFake({ content: CONTENT, busy: true })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', INPUT)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('工作流正在运行')
    expect(fake.saves).toHaveLength(0)
  })

  it('该章无正文：拒绝并指引写正文入口', async () => {
    fake = mkFake({ content: null })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', INPUT)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('还没有正文')
    expect(r.error).toContain('lw_write_chapter_full')
  })

  it('缺参：zod/守卫层拒绝', async () => {
    const r = await run('lw_patch_chapter', { chapter: '第1章' })
    expect(r.ok).toBe(false)
  })

  it('重扫出的剩余疑点进回执（不阻断修正）', async () => {
    fake = mkFake({
      content: CONTENT,
      remaining: [{ rule: 'R9', message: '正文出现名册外人名「赵德全」' }],
    })
    ;(globalThis as unknown as { __lwPatchFake?: any }).__lwPatchFake = fake
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
    const r = await run('lw_patch_chapter', INPUT)
    expect(r.ok).toBe(true)
    expect(r.data.remainingConflicts).toBe(1)
    expect(String(r.data.message)).toContain('仍有 1 处')
  })
})
