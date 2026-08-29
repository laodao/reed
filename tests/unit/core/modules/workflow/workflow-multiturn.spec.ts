/**
 * 工作流多轮对话（multiTurn）测试：执行设置解析 + llm-chat / skill-call 节点多轮上下文注入
 * @module tests/unit/core/modules/workflow/workflow-multiturn
 * @description 校验：
 *  - resolveExecutionSettings 对 multiTurn 的透传（true / false 缺省）；
 *  - llm-chat 节点：getLLMHistory 返回历史时注入 callAIStream.messages，且 recordLLMTurn 登记本轮；
 *  - skill-call 节点：同多轮行为；
 *  - 无多轮上下文（history 空/未提供）时行为与无状态单轮一致（messages 不传）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callAIStreamMock = vi.fn()
vi.mock('@core/services/ai-call', () => ({
  callAIStream: (...a: any[]) => callAIStreamMock(...a),
  callVLM: vi.fn(),
  toImageDataUrl: vi.fn(),
}))
vi.mock('@core/modules/workflow/skills/skill-registry', () => ({
  getSkillService: vi.fn(),
}))

import { resolveExecutionSettings } from '@core/modules/workflow/engine/execution-settings'
import { TASK_NODE_HANDLERS } from '@core/modules/workflow/nodes/task-nodes'
import { SKILL_NODE_HANDLERS } from '@core/modules/workflow/nodes/skill-nodes'
import { getSkillService } from '@core/modules/workflow/skills/skill-registry'
import type { WorkflowNodeContext } from '@core/modules/workflow/engine/node-handler'

const llmHandler = TASK_NODE_HANDLERS.find(h => h.type === 'llm-chat')!
const skillHandler = SKILL_NODE_HANDLERS[0]
const svcMock = vi.mocked(getSkillService)

/** 构造带多轮钩子的节点上下文（history=getLLMHistory 返回值；records=recordLLMTurn 记录） */
const makeCtx = (
  config: Record<string, unknown>,
  opts: { history?: Array<{ role: 'user' | 'assistant'; content: string }>; noMultiturn?: boolean } = {},
) => {
  const records: Array<{ role: string; content: string }> = []
  return {
    runId: 'run_1', nodeId: 'n1', nodeType: 'llm-chat' as never, config,
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    emitProgress: () => {},
    resolveTemplate: (t: string) => t as never,
    getVariable: () => undefined,
    // 模拟引擎注入：noMultiturn=true 时 getLLMHistory 返回空（模拟 multiTurn 关闭）
    getLLMHistory: opts.noMultiturn ? () => [] : () => opts.history ?? [],
    recordLLMTurn: (role: 'user' | 'assistant', content: string) => records.push({ role, content }),
    __records: records,
  } as never
}

beforeEach(() => { vi.clearAllMocks(); callAIStreamMock.mockResolvedValue({ content: '回复', usage: { promptTokens: 1, completionTokens: 1 } }) })

describe('resolveExecutionSettings：multiTurn 解析', () => {
  it('settings.multiTurn=true 透传；缺省/非 true 为 false', () => {
    expect(resolveExecutionSettings({ multiTurn: true }).multiTurn).toBe(true)
    expect(resolveExecutionSettings({}).multiTurn).toBe(false)
    expect(resolveExecutionSettings({ multiTurn: false }).multiTurn).toBe(false)
    expect(resolveExecutionSettings(null).multiTurn).toBe(false)
  })

  it('multiTurn 不受数值封顶影响（布尔直通）', () => {
    const s = resolveExecutionSettings({ multiTurn: true, maxNodeRuns: 1000 })
    expect(s.multiTurn).toBe(true)
    expect(s.maxNodeRuns).toBe(1000) // 封顶逻辑不影响 multiTurn
  })
})

describe('llm-chat 多轮上下文', () => {
  const history = [
    { role: 'user' as const, content: '上一轮问题' },
    { role: 'assistant' as const, content: '上一轮回答' },
  ]

  it('multiTurn 开启：callAIStream 收到历史 messages，recordLLMTurn 登记本轮', async () => {
    const ctx = makeCtx({ prompt: '本轮问题', systemPrompt: '你是助手' }, { history })
    const r = await llmHandler.execute(ctx)
    expect(r.status).toBe('succeeded')
    const [args] = callAIStreamMock.mock.calls[0]
    expect(args.messages).toEqual(history)
    expect(args.prompt).toBe('本轮问题')
    const records = (ctx as never as { __records: Array<{ role: string; content: string }> }).__records
    expect(records).toEqual([
      { role: 'user', content: '本轮问题' },
      { role: 'assistant', content: '回复' },
    ])
  })

  it('multiTurn 关闭（history 空）：不传 messages（无状态单轮不变）', async () => {
    const ctx = makeCtx({ prompt: '本轮问题', systemPrompt: undefined }, { noMultiturn: true })
    await llmHandler.execute(ctx)
    const [args] = callAIStreamMock.mock.calls[0]
    expect(args.messages).toBeUndefined()
  })

  it('ctx 未提供多轮钩子（历史行为）：不报错且不传 messages', async () => {
    const ctx = makeCtx({ prompt: '本轮问题' })
    // 移除钩子，模拟旧上下文
    delete (ctx as Record<string, unknown>).getLLMHistory
    delete (ctx as Record<string, unknown>).recordLLMTurn
    const r = await llmHandler.execute(ctx)
    expect(r.status).toBe('succeeded')
    const [args] = callAIStreamMock.mock.calls[0]
    expect(args.messages).toBeUndefined()
  })
})

describe('skill-call 多轮上下文', () => {
  const history = [{ role: 'user' as const, content: '前文' }]
  const skill = {
    id: 's1', name: '技能', description: 'd', category: 'c', source: 'builtin' as const,
    dirPath: null, inputs: [], systemPrompt: '', body: '任务 {{param.material}}', modelInvocable: true,
  }

  it('multiTurn 开启：callAIStream 收到历史 messages，recordLLMTurn 登记本轮', async () => {
    svcMock.mockReturnValue({ resolveSkill: vi.fn().mockReturnValue(skill) } as never)
    const ctx = makeCtx(
      { skillId: 's1', inputs: [{ key: 'material', value: '素材' }] },
      { history },
    )
    const r = await skillHandler.execute(ctx)
    expect(r.status).toBe('succeeded')
    const [args] = callAIStreamMock.mock.calls[0]
    expect(args.messages).toEqual(history)
    expect(args.prompt).toContain('素材')
    const records = (ctx as never as { __records: Array<{ role: string; content: string }> }).__records
    expect(records[0].role).toBe('user')
    expect(records[1]).toEqual({ role: 'assistant', content: '回复' })
  })
})
