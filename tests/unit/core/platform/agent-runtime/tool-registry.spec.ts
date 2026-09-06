/**
 * AgentToolRegistry 单元测试（契约测试 = 23 号 §3 / 14 号 R1-R2 的执行定义）
 * @module platform/agent-runtime/__tests__/tool-registry.spec
 *
 * 覆盖：注册（命名空间/名式样/冲突）/ listSpecs 过滤 / toLLMTools 序列化 /
 * execute 管线（未注册/审批通过/驳回/编辑透传/校验失败/超时/中止/异常包含/截断/
 * 二进制字段/审计 sink）/ buildToolDefs 桥（静态配置优先/descriptionOverride/
 * 审批取严三态/maxCalls 快照计数/快照独立性/未注册跳过/不双重审批）。
 */

import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolCallAudit, AgentToolRegistryDeps } from '@core/platform/agent-runtime/tools/registry'
import {
  AgentToolRegistry,
  AgentToolConflictError,
  mergeStaticConfig,
  serializeToolResult,
  TOOL_RESULT_ARRAY_KEEP,
  TOOL_RESULT_FIELD_MAX_CHARS,
  TOOL_RESULT_MAX_BYTES,
} from '@core/platform/agent-runtime/tools/registry'
import type { AgentToolBinding } from '@shared/types/agent.types'
import { LoopRunner } from '@core/platform/agent-runtime/runtime/loop'
import type { AgentHost, AgentLoopState, TrajectoryEntry, AgentStreamEvent } from '@core/platform/agent-runtime/types'
import { toolCallChunks as toolParts, txtChunks as txt, mkModel } from './helpers'

function mkDef(over: Partial<AgentToolDef> = {}): AgentToolDef {
  return {
    name: 'query_setting',
    description: '查询设定集',
    inputSchema: z.object({ q: z.string(), limit: z.number().optional() }),
    execute: async (input: { q: string; limit?: number }) => ({ rows: [input.q], limit: input.limit }),
    ...over,
  }
}

function mkRegistry(deps: AgentToolRegistryDeps = {}): AgentToolRegistry {
  return new AgentToolRegistry(deps)
}

describe('注册与目录', () => {
  it('注册：builtin 直名；pack 命名空间化为 pack:<packId>:<name>', () => {
    const r = mkRegistry()
    r.register(mkDef())
    r.register(mkDef(), { packId: 'longwriting' })
    const names = r.listSpecs().map((s) => s.name)
    expect(names).toContain('query_setting')
    expect(names).toContain('pack:longwriting:query_setting') // 同基础名不同命名空间可共存
  })

  it('非法基础名 / 同名冲突 → AgentToolConflictError', () => {
    const r = mkRegistry()
    expect(() => r.register(mkDef({ name: 'Bad-Name' }))).toThrow(AgentToolConflictError)
    expect(() => r.register(mkDef({ name: 'ab' }))).toThrow(AgentToolConflictError) // 最短 3 位
    r.register(mkDef())
    expect(() => r.register(mkDef())).toThrow(AgentToolConflictError)
  })

  it('listSpecs 过滤 source/packId；spec 字段齐备（dangerLevel 缺省 read/取严审批/jsonSchema 派生）', () => {
    const r = mkRegistry()
    r.register(mkDef())
    r.register(mkDef({ name: 'exec_cli', dangerLevel: 'exec' }), { packId: 'p1' })
    r.register(mkDef({ name: 'marked_needs_approval', requiresApproval: true }))

    expect(r.listSpecs({ source: 'pack' }).map((s) => s.name)).toEqual(['pack:p1:exec_cli'])
    expect(r.listSpecs({ packId: 'p1' })).toHaveLength(1)

    const plain = r.listSpecs().find((s) => s.name === 'query_setting')!
    expect(plain.source).toBe('builtin')
    expect(plain.dangerLevel).toBe('read')
    expect(plain.requiresApproval).toBe(false)
    expect(plain.jsonSchema).toMatchObject({ type: 'object' })

    // 取严：dangerLevel=exec → 需批准；显式 requiresApproval=true（read）→ 也需批准
    expect(r.listSpecs().find((s) => s.name === 'pack:p1:exec_cli')!.requiresApproval).toBe(true)
    expect(r.listSpecs().find((s) => s.name === 'marked_needs_approval')!.requiresApproval).toBe(true)
  })

  it('toLLMTools：仅 name/description/parameters 三字段（无宿主侧信息泄漏）', () => {
    const r = mkRegistry()
    r.register(mkDef())
    const [d] = r.toLLMTools(r.listSpecs())
    expect(Object.keys(d).sort()).toEqual(['description', 'name', 'parameters'])
    expect(d.name).toBe('query_setting')
    expect(d.parameters).toMatchObject({ type: 'object' })
  })

  it('unregister / unregisterPack：按名与整包注销', () => {
    const r = mkRegistry()
    r.register(mkDef())
    r.register(mkDef({ name: 'tool_b' }), { packId: 'p1' })
    r.register(mkDef({ name: 'tool_c' }), { packId: 'p1' })
    expect(r.unregisterPack('p1')).toBe(2)
    expect(r.listSpecs().map((s) => s.name)).toEqual(['query_setting'])
    r.unregister('query_setting')
    expect(r.listSpecs()).toEqual([])
  })
})

describe('execute 管线（错误永不 throw）', () => {
  it('未注册 → NOT_WHITELISTED（hint 列可用工具）', async () => {
    const r = mkRegistry()
    const res = await r.execute({ toolName: 'nope', args: {} })
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('NOT_WHITELISTED')
    expect(res.error?.retryable).toBe(false)
  })

  it('入参校验失败 → INVALID_ARGS（hint 逐字段）', async () => {
    const r = mkRegistry()
    r.register(mkDef())
    const res = await r.execute({ toolName: 'query_setting', args: { q: 123 } })
    expect(res.error?.code).toBe('INVALID_ARGS')
    expect(res.error?.hint).toContain('q')
    expect(res.error?.retryable).toBe(true)
  })

  it('需批准工具直调且无审批回调 → 安全默认拒绝（与 loop 层对齐——深 review P2 回归）', async () => {
    const exec = vi.fn(async () => ({ done: true }))
    const r = mkRegistry()
    r.register(mkDef({ requiresApproval: true, execute: exec }))
    const res = await r.execute({ toolName: 'query_setting', args: { q: 'x' } })
    expect(exec).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    expect(res.error?.message).toContain('未提供审批通道')
  })

  it('审批回调驳回 → 拒绝结果 + 审计 rejected；通过 → 执行；approve_with_edit → 编辑值生效', async () => {
    const seenInputs: unknown[] = []
    let decision: { action: string; input?: Record<string, unknown> } = { action: 'approve' }
    const r = mkRegistry({
      requestApproval: async (_t, input) => {
        seenInputs.push(input)
        return decision as never
      },
    })
    r.register(mkDef({ requiresApproval: true }))

    // 驳回
    decision = { action: 'reject', reason: 'no' }
    const rej = await r.execute({ toolName: 'query_setting', args: { q: 'x' } })
    expect(rej.ok).toBe(false)
    expect(rej.error?.message).toContain('拒绝')

    // 通过
    decision = { action: 'approve' }
    const ok = await r.execute({ toolName: 'query_setting', args: { q: 'y' } })
    expect(ok.ok).toBe(true)

    // 编辑后执行（编辑值经 zod 重校验——非法编辑会 INVALID_ARGS）
    decision = { action: 'approve_with_edit', input: { q: 'edited' } }
    const edited = await r.execute({ toolName: 'query_setting', args: { q: 'orig' } })
    expect(edited.ok).toBe(true)
    expect(JSON.stringify(edited.data)).toContain('edited')
    decision = { action: 'approve_with_edit', input: { q: 42 } }
    const badEdit = await r.execute({ toolName: 'query_setting', args: { q: 'orig' } })
    expect(badEdit.error?.code).toBe('INVALID_ARGS')
    expect(seenInputs.length).toBe(4)
  })

  it('执行异常 → INTERNAL 包含为结构化错误（不 throw）', async () => {
    const r = mkRegistry()
    r.register(mkDef({ execute: async () => { throw new Error('boom') } }))
    const res = await r.execute({ toolName: 'query_setting', args: { q: 'x' } })
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('INTERNAL')
    expect(res.error?.message).toContain('boom')
  })

  it('超时 → TIMEOUT（retryable，hint 引导换轻量查询）', async () => {
    const r = mkRegistry({ executeTimeoutMs: 30 })
    r.register(mkDef({ execute: () => new Promise<never>(() => undefined) }))
    const res = await r.execute({ toolName: 'query_setting', args: { q: 'x' } })
    expect(res.error?.code).toBe('TIMEOUT')
    expect(res.error?.retryable).toBe(true)
    expect(res.error?.hint).toBeTruthy()
  })

  it('中止 → CANCELLED（retryable=false）', async () => {
    const r = mkRegistry()
    r.register(mkDef({ execute: () => new Promise<never>(() => undefined) }))
    const ac = new AbortController()
    const p = r.execute({ toolName: 'query_setting', args: { q: 'x' }, signal: ac.signal })
    ac.abort()
    const res = await p
    expect(res.error?.code).toBe('CANCELLED')
    expect(res.error?.retryable).toBe(false)
  })

  it('结果截断：数组超 20 项截断带 _truncated；超长字符串字段截断；整体超 16KB _oversize', async () => {
    const r = mkRegistry()
    r.register(mkDef({ execute: async () => ({ rows: Array.from({ length: 100 }, (_, i) => ({ i })) }) }))
    const res = await r.execute({ toolName: 'query_setting', args: { q: 'x' } })
    expect(res.truncated).toBe(true)
    const rows = (res.data as { rows: Array<{ i: number }> & unknown[] }).rows
    expect(rows).toHaveLength(TOOL_RESULT_ARRAY_KEEP + 1) // 20 项 + _truncated 标注
    expect((rows.at(-1) as { _truncated?: { totalItems: number } })._truncated.totalItems).toBe(100)

    r.register(mkDef({ name: 'big_field', execute: async () => ({ text: 'x'.repeat(TOOL_RESULT_FIELD_MAX_CHARS + 5) }) }))
    const big = await r.execute({ toolName: 'big_field', args: { q: 'x' } })
    expect(big.truncated).toBe(true)
    expect(JSON.stringify(big.data).length).toBeLessThan(TOOL_RESULT_FIELD_MAX_CHARS + 100)

    r.register(mkDef({ name: 'huge_all', execute: async () => ({ a: 'x'.repeat(TOOL_RESULT_MAX_BYTES), b: 'y'.repeat(TOOL_RESULT_MAX_BYTES) }) }))
    // 超长字段先截断到 2000 → 总量 4KB 不触发整体 oversize；构造整体超限需多字段
    const many: Record<string, string> = {}
    for (let i = 0; i < 20; i++) many[`f${i}`] = 'z'.repeat(TOOL_RESULT_FIELD_MAX_CHARS)
    r.register(mkDef({ name: 'oversize', execute: async () => many }))
    const over = await r.execute({ toolName: 'oversize', args: { q: 'x' } })
    expect(over.truncated).toBe(true)
  })

  it('二进制字段（base64/dataUrl）永不进上下文（引用化描述）', async () => {
    const r = mkRegistry()
    r.register(mkDef({ name: 'gen_img', execute: async () => ({ base64: 'A'.repeat(1000), mime: 'image/png' }) }))
    const res = await r.execute({ toolName: 'gen_img', args: { q: 'x' } })
    const data = res.data as { base64: { _omitted: string; sizeBytes: number } }
    expect(data.base64._omitted).toBe('binary')
    expect(data.base64.sizeBytes).toBe(1000)
    expect(JSON.stringify(res.data)).not.toContain('AAAA')
  })

  it('审计 sink：成功/失败/驳回路径均留痕；sink 异常不影响结果', async () => {
    const audits: AgentToolCallAudit[] = []
    const r = mkRegistry({ audit: (a) => { audits.push(a); if (a.status === 'failed') throw new Error('sink boom') } })
    r.register(mkDef())
    r.register(mkDef({ name: 'failing', execute: async () => { throw new Error('x') } }))

    await r.execute({ toolName: 'query_setting', args: { q: 'x' }, context: { runId: 'r1', nodeId: 'n1' } })
    await r.execute({ toolName: 'failing', args: { q: 'x' } }) // sink 抛错但结果不受影响
    expect(audits).toHaveLength(2)
    expect(audits[0]).toMatchObject({ toolName: 'query_setting', status: 'succeeded', dangerLevel: 'read', context: { runId: 'r1' } })
    expect(audits[1]).toMatchObject({ toolName: 'failing', status: 'failed', errorCode: 'INTERNAL' })
  })
})

describe('mergeStaticConfig / serializeToolResult 纯函数', () => {
  it('静态键优先：标量覆盖、对象递归、数组整体替换、未触及键保留 LLM 值', () => {
    const merged = mergeStaticConfig(
      { mode: 'strict', opts: { depth: 2, keep: 'static' }, tags: ['a'] },
      { mode: 'loose', q: 'llm', opts: { depth: 9, extra: 'llm' }, tags: ['x', 'y'] },
    )
    expect(merged).toEqual({ mode: 'strict', q: 'llm', opts: { depth: 2, keep: 'static', extra: 'llm' }, tags: ['a'] })
  })

  it('serializeToolResult：循环引用安全（深度上限截断，不抛不炸 stringify）', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    const out = serializeToolResult(a)
    expect(out.truncated).toBe(true)
    expect(JSON.stringify(out.data)).toContain('[depth-limit]')
  })
})

describe('buildToolDefs（registry→loop 桥）', () => {
  it('静态 config 深合并生效（LLM 不可覆盖宿主键）；结果形态为 loop 工具回填形', async () => {
    const r = mkRegistry()
    r.register(mkDef())
    const defs = r.buildToolDefs([{ tool: 'query_setting', config: { limit: 5 } } as AgentToolBinding])
    const res = (await defs['query_setting'].execute({ q: 'x', limit: 99 }, {
      scopeId: 's',
      rawInput: 'task',
      logContext: {},
    })) as { ok: boolean; data: { rows: unknown[]; limit: number } }
    expect(res.ok).toBe(true)
    expect(res.data.limit).toBe(5) // 静态优先
  })

  it('descriptionOverride 生效；审批三态（inherit 取严 / always 强制 / never 放宽）', async () => {
    const r = mkRegistry()
    r.register(mkDef({ dangerLevel: 'read' })) // 取严=false
    r.register(mkDef({ name: 'dangerous', dangerLevel: 'external-post' }))
    const defs = r.buildToolDefs([
      { tool: 'query_setting', descriptionOverride: '定制描述', approval: 'always' },
      { tool: 'dangerous' },
    ] as AgentToolBinding[])
    expect(defs['query_setting'].description).toBe('定制描述')
    expect(defs['query_setting'].requiresApproval).toBe(true) // always 强制
    expect(defs['dangerous'].requiresApproval).toBe(true) // inherit → 取严（external-post）
  })

  it('approval=never 显式放宽需批准工具', () => {
    const r = mkRegistry()
    r.register(mkDef({ name: 'danger2', dangerLevel: 'exec' }))
    const defs = r.buildToolDefs([{ tool: 'danger2', approval: 'never' } as AgentToolBinding])
    expect(defs['danger2'].requiresApproval).toBe(false)
  })

  it('maxCalls：快照内计数，超限回填 LIMIT_EXCEEDED', async () => {
    const r = mkRegistry()
    r.register(mkDef())
    const defs = r.buildToolDefs([{ tool: 'query_setting', maxCalls: 2 } as AgentToolBinding])
    const ctx = { scopeId: 's', rawInput: 't', logContext: {} }
    const okRes = await defs['query_setting'].execute({ q: '1' }, ctx)
    expect((okRes as { ok: boolean }).ok).toBe(true)
    await defs['query_setting'].execute({ q: '2' }, ctx)
    const over = (await defs['query_setting'].execute({ q: '3' }, ctx)) as { ok: boolean; error: string; hint: string }
    expect(over.ok).toBe(false)
    expect(over.error).toBe('LIMIT_EXCEEDED')
    expect(over.hint).toContain('上限 2 次')
    // 新快照计数独立
    const fresh = r.buildToolDefs([{ tool: 'query_setting', maxCalls: 1 } as AgentToolBinding])
    expect(((await fresh['query_setting'].execute({ q: 'x' }, ctx)) as { ok: boolean }).ok).toBe(true)
  })

  it('快照独立性：装配后注册新工具/注销不影响既有映射', () => {
    const r = mkRegistry()
    r.register(mkDef())
    const defs = r.buildToolDefs([{ tool: 'query_setting' } as AgentToolBinding])
    r.register(mkDef({ name: 'late_tool' }))
    expect(Object.keys(defs)).toEqual(['query_setting']) // 后注册不进快照
    r.unregister('query_setting')
    expect(Object.keys(defs)).toEqual(['query_setting']) // 注销不破坏快照引用
  })

  it('快照行为独立（深 review P1 回归）：注销后快照工具仍可执行', async () => {
    const r = mkRegistry()
    r.register(mkDef())
    const defs = r.buildToolDefs([{ tool: 'query_setting' } as AgentToolBinding])
    r.unregister('query_setting')
    // 公共查表路径此时 NOT_WHITELISTED——但快照闭包直通必须照常执行（23 号 §3 契约）
    expect((await r.execute({ toolName: 'query_setting', args: { q: 'x' } })).error?.code).toBe('NOT_WHITELISTED')
    const res = (await defs['query_setting'].execute({ q: 'x' }, { scopeId: 's', rawInput: 't', logContext: {} })) as { ok: boolean; data: unknown }
    expect(res.ok).toBe(true)
    expect(JSON.stringify(res.data)).toContain('x')
  })

  it('审计 approval 语义（深 review P1 回归）：审批通过记 approved；never 放宽记 auto；loop 桥已审记 approved', async () => {
    const audits: AgentToolCallAudit[] = []
    // 直调路径：审批回调通过 → approved
    const r1 = mkRegistry({ audit: (a) => audits.push(a), requestApproval: async () => ({ action: 'approve' }) })
    r1.register(mkDef({ requiresApproval: true }))
    await r1.execute({ toolName: 'query_setting', args: { q: 'x' } })
    expect(audits.at(-1)).toMatchObject({ approval: 'approved', status: 'succeeded' })

    // loop 桥：danger 工具 approval=never 放宽 → auto；inherit → approved（loop 已审）
    const r2 = mkRegistry({ audit: (a) => audits.push(a) })
    r2.register(mkDef())
    r2.register(mkDef({ name: 'danger_w', dangerLevel: 'write', requiresApproval: true }))
    const defs = r2.buildToolDefs([
      { tool: 'danger_w', approval: 'never' } as AgentToolBinding,
      { tool: 'query_setting' } as AgentToolBinding,
    ])
    await (defs['danger_w'] as AgentToolDef).execute({ q: 'a' }, { scopeId: 's', rawInput: 't', logContext: {} })
    expect(audits.at(-1)).toMatchObject({ approval: 'auto' })
    await (defs['query_setting'] as AgentToolDef).execute({ q: 'b' }, { scopeId: 's', rawInput: 't', logContext: {} })
    expect(audits.at(-1)).toMatchObject({ approval: 'not-required' })
  })

  it('未注册调用留 blocked 审计痕（深 review P2 回归：探测行为可审计）', async () => {
    const audits: AgentToolCallAudit[] = []
    const r = mkRegistry({ audit: (a) => audits.push(a) })
    r.register(mkDef())
    const res = await r.execute({ toolName: 'ghost_tool', args: {} })
    expect(res.error?.code).toBe('NOT_WHITELISTED')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ toolName: 'ghost_tool', status: 'blocked', dangerLevel: 'unknown' })
  })

  it('静态键不在 inputSchema 内不被 zod strip 丢弃（parse 后合并——深 review P2 回归）', async () => {
    const seen: unknown[] = []
    const r = mkRegistry()
    r.register(mkDef({ execute: async (input) => { seen.push(input); return { ok: true } } }))
    const defs = r.buildToolDefs([
      { tool: 'query_setting', config: { hostOnlyKey: 'static-value' } } as AgentToolBinding,
    ])
    await (defs['query_setting'] as AgentToolDef).execute({ q: 'x' }, { scopeId: 's', rawInput: 't', logContext: {} })
    expect(seen.at(-1)).toMatchObject({ q: 'x', hostOnlyKey: 'static-value' })
  })

  it('未注册工具：跳过 + 不抛（宁缺毋滥）', () => {
    const r = mkRegistry()
    const defs = r.buildToolDefs([{ tool: 'ghost' } as AgentToolBinding])
    expect(defs).toEqual({})
  })

  it('loop 桥不双重审批：registry 带 requestApproval 时包装层不触发它', async () => {
    const approval = vi.fn(async () => ({ action: 'approve' as const }))
    const r = mkRegistry({ requestApproval: approval })
    r.register(mkDef({ requiresApproval: true }))
    const defs = r.buildToolDefs([{ tool: 'query_setting' } as AgentToolBinding])
    const ctx = { scopeId: 's', rawInput: 't', logContext: {} }
    const res = (await defs['query_setting'].execute({ q: 'x' }, ctx)) as { ok: boolean }
    expect(res.ok).toBe(true)
    expect(approval).not.toHaveBeenCalled() // 审批属 loop 层；包装层 skipApproval
  })
})

// ==================== 穿过 loop 包装层的集成（深 review P1 形状冲突回归） ====================

class RecordingHost implements AgentHost {
  savedStates: AgentLoopState[] = []
  trajectories: TrajectoryEntry[] = []
  streams: AgentStreamEvent[] = []
  signal = new AbortController().signal
  async loadState() { return null }
  async saveState(st: AgentLoopState) { this.savedStates.push(JSON.parse(JSON.stringify(st))) }
  async suspend() { throw new Error('不应挂起') }
  emitTrajectory(e: TrajectoryEntry) { this.trajectories.push(e) }
  emitStream(e: AgentStreamEvent) { this.streams.push(e) }
}

describe('registry × LoopRunner 集成（registryWrapped 所有权分层）', () => {
  function taskFor(tools: Record<string, AgentToolDef>) {
    return {
      definitionId: 'test-def', scopeId: 's1', input: '干活', systemPrompt: 'sys',
      tools, maxSteps: 6,
    }
  }

  it('registry 工具失败（execute 抛错）→ loop 报 tool-end ok:false + 轨迹 ok:false + 模型收到结构化错误', async () => {
    const r = mkRegistry()
    r.register(mkDef({ execute: async () => { throw new Error('upstream down') } }))
    const tools = r.buildToolDefs([{ tool: 'query_setting' } as AgentToolBinding])
    const host = new RecordingHost()
    const runner = new LoopRunner({ resolveModel: async () => mkModel([() => toolParts('c1', 'query_setting', { q: 'x' }), () => txt('改路完成')]) })
    const result = await runner.run(taskFor(tools), host)
    expect(result.stopReason).toBe('final')
    // 失败不再被谎报为成功（深 review P1：两层包装曾把 ok:false 报成 ok:true）
    const toolEnd = host.streams.find((e) => e.kind === 'tool-end') as { ok: boolean }
    expect(toolEnd.ok).toBe(false)
    const toolResult = host.trajectories.find((t) => t.kind === 'tool_result')
    expect(toolResult?.payload.ok).toBe(false)
    // 结构化错误直达模型（第二步的入参消息里含 INTERNAL/upstream down，而非嵌套字符串化的 ok:true）
    const errorToModel = JSON.stringify(host.savedStates.at(-1)?.messages)
    expect(errorToModel).toContain('upstream down')
  })

  it('LIMIT_EXCEEDED（maxCalls=1）经 loop 传导：第二次调用模型收到上限提示', async () => {
    const r = mkRegistry()
    r.register(mkDef())
    const tools = r.buildToolDefs([{ tool: 'query_setting', maxCalls: 1 } as AgentToolBinding])
    const host = new RecordingHost()
    const runner = new LoopRunner({ resolveModel: async () => mkModel([() => toolParts('c1', 'query_setting', { q: '1' }), () => toolParts('c2', 'query_setting', { q: '2' }), () => txt('放弃工具直答')]) })
    const result = await runner.run(taskFor(tools), host)
    expect(result.stopReason).toBe('final')
    expect(result.output).toBe('放弃工具直答')
    expect(JSON.stringify(host.savedStates.at(-1)?.messages)).toContain('LIMIT_EXCEEDED')
  })

  it('registry 工具超时（executeTimeoutMs 旋钮生效，loop 不再套第二层计时器）', async () => {
    const r = mkRegistry({ executeTimeoutMs: 30 })
    r.register(mkDef({ execute: () => new Promise<never>(() => undefined) }))
    const tools = r.buildToolDefs([{ tool: 'query_setting' } as AgentToolBinding])
    const host = new RecordingHost()
    const runner = new LoopRunner({ resolveModel: async () => mkModel([() => toolParts('c1', 'query_setting', { q: 'x' }), () => txt('超时后收敛')]), toolTimeoutMs: 60_000 })
    const result = await runner.run(taskFor(tools), host)
    // registry 的 30s? 30ms 先触发（loop 的 60s 不封顶它——旋钮所有权单一）
    expect(result.stopReason).toBe('final')
    expect(JSON.stringify(host.savedStates.at(-1)?.messages)).toContain('TIMEOUT')
  })
})

// ==================== 总收口 review 回归 ====================

describe('结果序列化与上限拦截（P3 回归）', () => {
  it('void 工具结果：data=null 且不误报 _unserializable/truncated', () => {
    const r = serializeToolResult(undefined)
    expect(r).toEqual({ data: null, truncated: false })
  })

  it('_oversize preview 按字节截：CJK 载荷最终 data 不超 16KB 字节上限', () => {
    const cjk = '字'.repeat(20 * 2000) // 20 字段 × 2000 字（每字 3 字节）
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < 20; i++) obj[`f${i}`] = cjk
    const r = serializeToolResult(obj)
    expect(r.truncated).toBe(true)
    expect((r.data as { _oversize?: boolean })._oversize).toBe(true)
    const bytes = Buffer.byteLength(JSON.stringify(r.data), 'utf8')
    expect(bytes).toBeLessThanOrEqual(16384) // 修复前 ~24.7KB
  })

  it('maxCalls 拦截留审计痕（status=blocked errorCode=LIMIT_EXCEEDED）', async () => {
    const audits: AgentToolCallAudit[] = []
    const r = mkRegistry({ audit: (a) => audits.push(a) })
    r.register(mkDef({ name: 'capped_tool' }))
    const defs = r.buildToolDefs([{ tool: 'capped_tool', maxCalls: 1 }])
    const call = { scopeId: 's', rawInput: 'x', signal: undefined, logContext: {} } as never
    await defs.capped_tool.execute({ q: '一' }, call)
    await defs.capped_tool.execute({ q: '二' }, call) // 超限
    const blocked = audits.filter((a) => a.status === 'blocked')
    expect(blocked.length).toBe(1)
    expect(blocked[0].errorCode).toBe('LIMIT_EXCEEDED')
  })
})
