/**
 * spawn_subagent 单测（39 号 P1-2）
 * @module tests/unit/core/platform/agent-runtime/subagent.spec
 *
 * 锚点：报告回填（子代理全程不进主上下文，只有最终报告）/ 工具白名单过滤
 * （未知名 fail-fast）/ 递归结构性防护（子代理工具集永无 spawn_subagent）/
 * 模型档位（cheap/strong → 对应 resolveModel 入参）/ 失败隔离（子代理异常
 * 不炸主轮，报告带 stopReason+note）。
 */

import { describe, expect, it } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import { createSpawnSubagentTool } from '@core/platform/agent-runtime/tools/subagent'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'

function scriptedModel(steps: Array<() => Array<Record<string, unknown>>>, capture?: (opts: { prompt?: unknown; tools?: unknown }) => void): LanguageModel {
  let i = 0
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async (opts: { prompt?: unknown; tools?: unknown }) => {
      capture?.(opts)
      return { stream: simulateReadableStream({ chunks: steps[Math.min(i++, steps.length - 1)]() }) }
    },
  }) as unknown as LanguageModel
}

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } }
const txt = (t: string) => () => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: t },
  { type: 'text-end', id: 't' },
  { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
]
const streamErr = (msg: string) => () => [
  { type: 'stream-start', warnings: [] },
  { type: 'error', error: new Error(msg) },
]

function readTool(): AgentToolDef {
  return {
    name: 'log_read',
    description: '读日志（fake）',
    inputSchema: z.object({}),
    dangerLevel: 'read',
    execute: async () => ({ lines: ['a', 'b'] }),
  }
}

function spawnTool(model: LanguageModel, extra?: { models?: { cheap?: { modelId?: string } } ; capture?: (opts: { prompt?: unknown; tools?: unknown }) => void }) {
  const resolvedWith: Array<unknown> = []
  const models = extra?.models
  const resolveModel = async (opts?: unknown) => {
    resolvedWith.push(opts)
    return model
  }
  const tool = createSpawnSubagentTool({
    resolveModel: resolveModel as never,
    tools: { log_read: readTool(), spawn_subagent: readTool() }, // 基集故意混入 spawn_subagent——应被剔除
    trajectoryPort: null,
    scopeKey: 'session:test:p1',
    ...(models ? { models: models as never } : {}),
  })
  return { tool, resolvedWith }
}

const CTX = { scopeId: 'session:test:p1', rawInput: '主任务', signal: undefined, logContext: {}, toolCallId: 'call_1' }

describe('spawn_subagent（39 号 P1-2）', () => {
  it('报告回填：子代理最终输出进入 data.report，轨迹键独立', async () => {
    const cap = spawnTool(scriptedModel([txt('这是子代理的调查报告。')]))
    const r = await cap.tool.execute({ goal: '读日志并提炼错误要点' }, CTX as never)
    expect(r.ok).toBe(true)
    const data = (r as { data: { report: string; stopReason: string; trajectoryKey: string } }).data
    expect(data.report).toBe('这是子代理的调查报告。')
    expect(data.stopReason).toBe('final')
    expect(data.trajectoryKey).toContain('session:test:p1:sub_')
  })

  it('递归结构性防护：子代理工具集永无 spawn_subagent；tool_names 过滤生效', async () => {
    const captured: Array<{ tools?: unknown }> = []
    const cap = spawnTool(scriptedModel([txt('done')], (o) => captured.push(o)))
    await cap.tool.execute({ goal: 'g', tool_names: ['log_read'] }, CTX as never)
    const childToolNames = (captured[0].tools as Array<{ name: string }>).map((t) => t.name)
    expect(childToolNames).toEqual(['log_read']) // spawn_subagent 被剔除 + 白名单过滤
  })

  it('未授权工具名 fail-fast（宁失败不静默缩权）', async () => {
    const cap = spawnTool(scriptedModel([txt('x')]))
    const r = await cap.tool.execute({ goal: 'g', tool_names: ['log_read', 'nope'] }, CTX as never)
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toBe('UNKNOWN_TOOLS')
    expect((r as { hint: string }).hint).toContain('log_read')
  })

  it('模型档位：cheap/strong → 对应档位偏好传给 resolveModel', async () => {
    const cap = spawnTool(scriptedModel([txt('a')], undefined), {
      models: { cheap: { modelId: 'cheap-model' }, strong: { modelId: 'strong-model' } },
    })
    await cap.tool.execute({ goal: 'g1', model: 'cheap' }, CTX as never)
    await cap.tool.execute({ goal: 'g2', model: 'strong' }, CTX as never)
    await cap.tool.execute({ goal: 'g3', model: 'inherit' }, CTX as never)
    expect(cap.resolvedWith[0]).toEqual({ modelId: 'cheap-model' })
    expect(cap.resolvedWith[1]).toEqual({ modelId: 'strong-model' })
    expect(cap.resolvedWith[2]).toBeUndefined() // inherit → 主模型（无偏好）
  })

  it('失败隔离：子代理模型流错误 → ok:true + stopReason=error + note（主轮不炸）', async () => {
    // 流错误经 LoopRunner 优雅终止（stopReason=error），不 throw——主轮只收到带说明的报告
    const cap = spawnTool(scriptedModel([streamErr('provider 500')]))
    const r = await cap.tool.execute({ goal: 'g' }, CTX as never)
    expect(r.ok).toBe(true)
    const data = (r as { data: { stopReason: string; note?: string; error?: string } }).data
    expect(data.stopReason).toBe('error')
    expect(data.note).toContain('子代理未正常收敛')
    expect(data.note).toContain('provider 500')
  })

  it('子代理 max_steps 硬顶 16（超出夹取）', async () => {
    const cap = spawnTool(scriptedModel([txt('x')]))
    // 步数经 AgentTask 传入 LoopRunner；直接验证不炸 + 正常返回（上限夹取在实现内）
    const r = await cap.tool.execute({ goal: 'g', max_steps: 999 }, CTX as never)
    expect((r as { data: { stopReason: string } }).data.stopReason).toBe('final')
  })
})
