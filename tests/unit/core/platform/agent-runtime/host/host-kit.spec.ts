/**
 * HostKit 单测（36 号契约）：装配脊柱行为锚点
 * @module tests/unit/core/platform/agent-runtime/host/host-kit.spec
 *
 * 用 fake 模型直驱 kit.runTurn，验证：turn_start/memory_assembly 留痕、
 * 记忆双通道装配、loadState 双形态、RunRegistry 登记/结算/abort 桥、
 * 外部信号已中止短路、onStream/onTrajectoryEntry 挂钩。
 */

import { describe, expect, it } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel, ModelMessage } from 'ai'
import { createHostKit, extractRecallTopics, formatStopNote, DEFAULT_RESUME_INSTRUCTION } from '@core/platform/agent-runtime/host/host-kit'
import { getAgentRunRegistry } from '@core/platform/agent-runtime/runtime/run-registry'
import { registerStructuredProvider } from '@core/platform/agent-runtime/memory/structured-provider'
import type { AgentToolDef, TrajectoryEntry } from '@core/platform/agent-runtime/types'
import { z } from 'zod'

// ==================== fake 模型 ====================

function txtModel(text = '好的'): LanguageModel {
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: text },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
        ],
      }),
    }),
  }) as unknown as LanguageModel
}

// ==================== 工具与采集 ====================

function catalogTool(): AgentToolDef {
  return {
    name: 'discover_capabilities',
    description: '目录（fake）',
    inputSchema: z.object({}),
    dangerLevel: 'read',
    execute: async () => ({ workflows: [] }),
  }
}

interface Turn {
  input: string
  projectId?: string
}

function mkDeps(overrides: {
  history?: ModelMessage[]
  flywheel?: {
    assemble: (text: string, topK: number, scope: { bizModule?: string; projectId?: string }) => Promise<Array<{ content: { title?: string; content?: string } }>>
    assembleUserLevel: (text: string, topK: number) => Promise<Array<{ content: { title?: string; content?: string } }>>
  }
  contextOverride?: unknown
} = {}) {
  const saved: ModelMessage[][] = []
  const trajectoryRows: Array<{ name?: string | null; kind: string; payload?: Record<string, unknown> | null }> = []
  const registryCalls: Array<{ event: string; id?: string; status?: string; scopeKey?: string; abort?: () => void }> = []
  const registry = {
    register: (run: { id: string; scopeKey: string; abort?: () => void }) => {
      registryCalls.push({ event: 'register', id: run.id, scopeKey: run.scopeKey, abort: run.abort })
    },
    finish: (id: string, info: { status: string; scopeKey: string }) => {
      registryCalls.push({ event: 'finish', id, status: info.status, scopeKey: info.scopeKey })
    },
  }
  return {
    saved,
    trajectoryRows,
    registryCalls,
    deps: {
      trajectoryPort: {
        appendBatch: async (rows: Array<{ kind: string; name?: string | null; payload?: Record<string, unknown> | null }>) => {
          trajectoryRows.push(...rows)
        },
        maxSeq: async () => 0,
      },
      sessionStore: {
        load: async () => (overrides.history && overrides.history.length > 0 ? [...overrides.history] : undefined),
        save: async (_id: string, messages: ModelMessage[]) => {
          saved.push(messages)
        },
      },
      ...(overrides.flywheel ? { flywheel: overrides.flywheel } : {}),
      ...(overrides.contextOverride ? { contextOverride: overrides.contextOverride } : {}),
    } as never,
    registry: registry as never,
  }
}

function mkKit(turnDeps: ReturnType<typeof mkDeps>, configOverrides: Record<string, unknown> = {}) {
  const streamed: string[] = []
  const trajectorySeen: TrajectoryEntry[] = []
  const kit = createHostKit<Turn>(
    {
      definitionId: 'test-host',
      scopeKey: (t) => `test:${t.projectId ?? 'p1'}`,
      tools: () => ({ discover_capabilities: catalogTool() }),
      resolveModel: async () => txtModel(),
      systemPrompt: () => '你是测试宿主',
      maxSteps: 3,
      onStream: (_t, event) => {
        if (event.kind === 'delta') streamed.push(event.text)
      },
      onTrajectoryEntry: (_t, entry) => trajectorySeen.push(entry),
      ...configOverrides,
    },
    turnDeps.deps,
  )
  return { kit, streamed, trajectorySeen }
}

// RunRegistry 用真实单例——每用例唯一 scopeKey 隔离，onChange 捕获结算事件
function captureRegistry(scopeKey: string) {
  const events: Array<{ kind: string; status?: string; error?: string }> = []
  const off = getAgentRunRegistry().onChange((e) => {
    if (e.run.scopeKey !== scopeKey) return
    if (e.kind === 'started') events.push({ kind: 'started' })
    else events.push({ kind: 'finished', status: e.run.status, error: e.run.error })
  })
  return { events, off }
}

// ==================== 用例 ====================

describe('HostKit（36 号契约）', () => {
  it('turn_start + memory_assembly 留痕、[相关经验] 段拼接、结果带 memoryLines', async () => {
    const turnDeps = mkDeps({
      flywheel: {
        assemble: async () => [{ content: { title: '项目偏好', content: '短句回复' } }],
        assembleUserLevel: async () => [],
      },
    })
    const { kit } = mkKit(turnDeps, {
      memory: { scope: { bizModule: 'test', projectId: 'p1' } },
    })
    const r = await kit.runTurn({ input: '你好' })
    expect(r.stopReason).toBe('final')
    expect(r.memoryLines).toEqual(['- 项目偏好：短句回复'])
    expect(r.systemPrompt).toContain('[相关经验（来自知识飞轮，供参考）]')
    // 留痕顺序：turn_start 在前、memory_assembly 在后，快照含最终提示词
    const start = turnDeps.trajectoryRows.find((row) => row.name === 'turn_start')
    const mem = turnDeps.trajectoryRows.find((row) => row.name === 'memory_assembly')
    expect(start).toBeDefined()
    expect(String((start!.payload as { systemPrompt: string }).systemPrompt)).toContain('相关经验')
    expect((mem!.payload as { memoryRefs: string[] }).memoryRefs).toEqual(['- 项目偏好：短句回复'])
  })

  it('systemLine（L0）+ 结构化提供方：[设定事实] 行进入装配', async () => {
    const turnDeps = mkDeps({})
    const { kit } = mkKit(turnDeps, {
      memory: { systemLine: '[系统能力] 目录以 discover_capabilities 为准' },
    })
    const r = await kit.runTurn({ input: '画一张图' })
    expect(r.memoryLines[0]).toBe('[系统能力] 目录以 discover_capabilities 为准')
    expect(turnDeps.trajectoryRows.find((row) => row.name === 'memory_assembly')).toBeDefined()
  })

  it('memory: null 显式关闭：无记忆留痕、提示词不拼段', async () => {
    const turnDeps = mkDeps({
      flywheel: {
        assemble: async () => [{ content: { title: 'x', content: 'y' } }],
        assembleUserLevel: async () => [{ content: { title: 'x', content: 'y' } }],
      },
    })
    const { kit } = mkKit(turnDeps, { memory: null })
    const r = await kit.runTurn({ input: '你好' })
    expect(r.memoryLines).toEqual([])
    expect(r.systemPrompt).not.toContain('相关经验')
    expect(turnDeps.trajectoryRows.find((row) => row.name === 'memory_assembly')).toBeUndefined()
  })

  it('seededHistory 形态：种子历史+本轮消息进 state；observation 存储失败仅告警', async () => {
    const turnDeps = mkDeps({})
    const seeded: ModelMessage[] = [
      { role: 'user', content: '上一轮问题' },
      { role: 'assistant', content: '上一轮回答' },
    ]
    const { kit } = mkKit(turnDeps, {
      seededHistory: () => seeded,
      // 存储必然失败：save 抛错（observation 默认=仅告警不炸轮）
    })
    turnDeps.deps.sessionStore.save = async () => {
      throw new Error('boom')
    }
    const r = await kit.runTurn({ input: '这轮问题' })
    // observation 形态：保存失败仅告警，轮次正常完成；失败即不入库
    expect(r.stopReason).toBe('final')
    expect(turnDeps.saved.length).toBe(0)
  })

  it('会话存储续聊形态：既有历史清洗后+本轮消息；run 正常结算 done', async () => {
    const history: ModelMessage[] = [{ role: 'user', content: '首轮' }]
    const turnDeps = mkDeps({ history })
    const { kit } = mkKit(turnDeps)
    const r = await kit.runTurn({ input: '二轮' })
    expect(r.stopReason).toBe('final')
    expect(turnDeps.saved.length).toBeGreaterThan(0)
  })

  it('onStream 挂钩收到 delta；onTrajectoryEntry 收到 turn_start', async () => {
    const turnDeps = mkDeps({})
    const { kit, streamed, trajectorySeen } = mkKit(turnDeps)
    await kit.runTurn({ input: '你好' })
    expect(streamed).toContain('好的')
    expect(trajectorySeen.some((e) => e.name === 'turn_start')).toBe(true)
  })

  it('外部信号已中止：短路拒绝（不产生模型调用/注册即结）', async () => {
    const turnDeps = mkDeps({})
    const { kit } = mkKit(turnDeps)
    const ctrl = new AbortController()
    ctrl.abort()
    const r = await kit.runTurn({ input: '你好' }, { signal: ctrl.signal })
    expect(r.stopReason).toBe('aborted')
  })

  it('RunRegistry 结算：成功=done；外部中止=aborted（36 号统一登记）', async () => {
    const scopeKey = `test:reg-${Date.now()}`
    const turnDeps = mkDeps({})
    const kit = createHostKit<Turn>(
      {
        definitionId: 'test-host',
        scopeKey: () => scopeKey,
        tools: () => ({ discover_capabilities: catalogTool() }),
        resolveModel: async () => txtModel(),
        systemPrompt: () => 'p',
        maxSteps: 3,
      },
      turnDeps.deps,
    )
    const { events, off } = captureRegistry(scopeKey)
    await kit.runTurn({ input: '你好' })
    await kit.runTurn({ input: '你好' }, { signal: AbortSignal.abort() })
    off()
    const finished = events.filter((e) => e.kind === 'finished')
    expect(events.filter((e) => e.kind === 'started')).toHaveLength(2)
    expect(finished[0]?.status).toBe('done')
    expect(finished[1]?.status).toBe('aborted')
  })

  it('循环外异常：结算带原因（status=error + error 消息——评审 P2-1）', async () => {
    const scopeKey = `test:boom-${Date.now()}`
    const turnDeps = mkDeps({})
    const kit = createHostKit<Turn>(
      {
        definitionId: 'test-host',
        scopeKey: () => scopeKey,
        tools: () => ({}),
        resolveModel: async () => txtModel(),
        systemPrompt: () => {
          throw new Error('装配爆炸')
        },
        maxSteps: 3,
      },
      turnDeps.deps,
    )
    const { events, off } = captureRegistry(scopeKey)
    await expect(kit.runTurn({ input: '你好' })).rejects.toThrow('装配爆炸')
    off()
    const finished = events.find((e) => e.kind === 'finished')
    expect(finished?.status).toBe('error')
    expect(finished?.error).toContain('装配爆炸')
  })

  it('topicsText 与召回语料分离（评审 P1-1）：通道A topics 不被摘要污染', async () => {
    const capturedTopics: string[][] = []
    registerStructuredProvider({
      id: 'topic-test',
      supports: (scope) => scope.bizModule === 'topic-test',
      query: async (q) => {
        capturedTopics.push(q.topics)
        return [{ text: '设定事实片段', source: 'graph', confidence: 1 }]
      },
    })
    const turnDeps = mkDeps({})
    const { kit } = mkKit(turnDeps, {
      memory: {
        scope: () => ({ bizModule: 'topic-test', projectId: 'p1' }),
        recallText: () => '继续。故事概要：某标题（类型：修仙）人物：甲、乙',
        topicsText: () => '继续',
      },
    })
    const r = await kit.runTurn({ input: '继续' })
    expect(capturedTopics[0]).toEqual(['继续'])
    expect(r.memoryLines.some((l) => l.startsWith('[设定事实]'))).toBe(true)
  })

  it('sessionStoreCritical: 保存失败上抛炸轮（聊天权威形态）', async () => {
    const turnDeps = mkDeps({})
    const kit = createHostKit<Turn>(
      {
        definitionId: 'test-host',
        scopeKey: () => `test:critical-${Date.now()}`,
        tools: () => ({ discover_capabilities: catalogTool() }),
        resolveModel: async () => txtModel(),
        systemPrompt: () => 'p',
        maxSteps: 3,
        sessionStoreCritical: true,
      },
      turnDeps.deps,
    )
    turnDeps.deps.sessionStore.save = async () => {
      throw new Error('磁盘已满')
    }
    await expect(kit.runTurn({ input: '你好' })).rejects.toThrow('磁盘已满')
  })

  it('deps.onEntry 广播钩子：turn_start/memory_assembly 实时外推', async () => {
    const broadcast: string[] = []
    const turnDeps = mkDeps({
      flywheel: {
        assemble: async () => [{ content: { title: 't', content: 'c' } }],
        assembleUserLevel: async () => [],
      },
    })
    turnDeps.deps.onEntry = (_sk, entry) => broadcast.push(String(entry.name))
    const { kit } = mkKit(turnDeps, { memory: { scope: { bizModule: 'test', projectId: 'p1' } } })
    await kit.runTurn({ input: '你好' })
    expect(broadcast[0]).toBe('turn_start')
    expect(broadcast).toContain('memory_assembly')
  })
})

describe('HostKit 纯函数', () => {
  it('extractRecallTopics：中英文主题词抽取（LW 同款算法）', () => {
    const topics = extractRecallTopics('帮我修改林逸的人物设定，然后写下一章')
    expect(topics.length).toBeGreaterThanOrEqual(2)
    expect(topics.length).toBeLessThanOrEqual(5)
    expect(extractRecallTopics('a bc 三字词')).toContain('三字词')
  })

  it('formatStopNote：护栏/中断/错误文案单一出处', () => {
    expect(formatStopNote('max_steps')).toContain('步数/进展护栏')
    expect(formatStopNote('aborted')).toBe('（本轮已中断）')
    expect(formatStopNote('error', '超时')).toContain('超时')
    expect(formatStopNote('final')).toBe('')
  })
})

// ==================== 39 号：提示词分层 / 流水 / 产物回查 / 子代理注入 / 摘要分级 ====================

import { TURN_CONTEXT_PREFIX } from '@core/platform/agent-runtime/context/turn-context'
import type { RawTranscriptPort } from '@core/platform/agent-runtime/memory/transcript-store'
import type { ToolArtifactPort } from '@core/platform/agent-runtime/tools/artifacts'

function capturingModel(): { model: LanguageModel; prompts: string[]; toolNames: string[][] } {
  const prompts: string[] = []
  const toolNames: string[][] = []
  const model = new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async (opts: { prompt?: unknown; tools?: unknown }) => {
      prompts.push(JSON.stringify(opts.prompt ?? []))
      const tools = Array.isArray(opts.tools) ? (opts.tools as Array<{ name?: string }>).map((t) => t.name ?? '') : Object.keys((opts.tools as Record<string, unknown>) ?? {})
      toolNames.push(tools)
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: '好的' },
            { type: 'text-end', id: 't' },
            { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
          ],
        }),
      }
    },
  }) as unknown as LanguageModel
  return { model, prompts, toolNames }
}

describe('39 号 P0-1/P1/P2：HostKit 装配', () => {
  it('system 只含稳定段；快照/记忆经轮次上下文块注入消息尾', async () => {
    const turnDeps = mkDeps({
      flywheel: {
        assemble: async () => [{ content: { title: '偏好', content: '短句' } }],
        assembleUserLevel: async () => [],
      },
    })
    const cap = capturingModel()
    const { kit } = mkKit(turnDeps, {
      resolveModel: async () => cap.model,
      snapshot: () => '人物：林晓',
      memory: { scope: { bizModule: 'test', projectId: 'p1' } },
    })
    const r = await kit.runTurn({ input: '你好' })
    // 观测面：effectivePrompt 仍含全部段（工作台「查看上下文」不回归）
    expect(r.systemPrompt).toContain('你是测试宿主')
    expect(r.systemPrompt).toContain('[相关经验（来自知识飞轮，供参考）]')
    expect(r.systemPrompt).toContain('[当前项目状态快照（来自数据库，确证事实）]')
    // 模型实际所见：system 段 = 纯人设；记忆/快照在末尾的轮次上下文块
    const prompt = JSON.parse(cap.prompts[0]) as Array<{ role: string; content: unknown }>
    const systemEntry = prompt.find((m) => m.role === 'system')
    expect(JSON.stringify(systemEntry)).toContain('你是测试宿主')
    expect(JSON.stringify(systemEntry)).not.toContain('林晓')
    const lastUser = [...prompt].reverse().find((m) => m.role === 'user')
    expect(JSON.stringify(lastUser)).toContain(TURN_CONTEXT_PREFIX)
    expect(JSON.stringify(lastUser)).toContain('林晓')
    expect(JSON.stringify(lastUser)).toContain('短句')
  })

  it('artifacts 装配 → 自动注入 get_tool_result；subagent 配置 → 注入 spawn_subagent', async () => {
    const artifacts = { save: async () => {}, load: async () => undefined, deleteByScope: async () => 0 } as unknown as ToolArtifactPort
    const turnDeps = mkDeps()
    turnDeps.deps.artifacts = artifacts
    const cap = capturingModel()
    const { kit } = mkKit(turnDeps, {
      resolveModel: async () => cap.model,
      subagent: { tools: () => ({ discover_capabilities: catalogTool() }) },
    })
    await kit.runTurn({ input: '你好' })
    expect(cap.toolNames[0]).toContain('get_tool_result')
    expect(cap.toolNames[0]).toContain('spawn_subagent')
    expect(cap.toolNames[0]).toContain('discover_capabilities')
  })

  it('rawTranscript 装配 → 会话流水 append-only（user 首行 + 轮次上下文块，seq 连续）', async () => {
    const rows: Array<{ conversationId: string; seq: number; role: string; content: string }> = []
    const transcript: RawTranscriptPort = {
      appendBatch: async (batch) => rows.push(...batch),
      maxSeq: async () => 0,
    }
    const turnDeps = mkDeps()
    turnDeps.deps.rawTranscript = transcript
    const cap = capturingModel()
    const { kit } = mkKit(turnDeps, {
      resolveModel: async () => cap.model,
      snapshot: () => '人物：林晓',
    })
    await kit.runTurn({ input: '你好' })
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0].role).toBe('user')
    expect(rows[0].content).toContain('你好')
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i)) // seq 从 0 连续
    // 快照块也入流水（模型所见上下文可完整回放）
    expect(rows.some((r) => r.content.includes('林晓'))).toBe(true)
  })

  it('models.summary 配置 → ContextManager 注入守恒摘要阶段（窗口超限触发摘要回调）', async () => {
    const summarizeCalls: string[] = []
    // 大体积在历史 assistant 消息（可折叠）；当轮输入保持短（保底保留不阻碍压缩收益）
    const fillerAssistant = { role: 'assistant', content: '冗'.repeat(600) } as ModelMessage
    const historyUser = { role: 'user', content: '史'.repeat(300) } as ModelMessage
    const turnDeps = mkDeps({ history: [historyUser, fillerAssistant] })
    turnDeps.deps.summarize = async (text: string) => {
      summarizeCalls.push(text)
      return '此前：用户在测试摘要装配。'
    }
    const cap = capturingModel()
    const { kit } = mkKit(turnDeps, {
      resolveModel: async () => cap.model,
      contextWindowTokens: 200,
    })
    const r = await kit.runTurn({ input: '继续' })
    expect(r.stopReason).toBe('final')
    expect(summarizeCalls).toHaveLength(1)
    // 压缩产物落历史：历史用户消息守恒保留 + 摘要置尾 + 当轮输入保底
    const messages = turnDeps.saved.at(-1)
    expect(messages).toBeDefined()
    const summaryMsg = messages!.find((m) => typeof m.content === 'string' && (m.content as string).includes('[Previous conversation summary]'))
    expect(summaryMsg).toBeDefined()
    expect(messages!.some((m) => m.role === 'user' && m.content === '继续')).toBe(true)
  })
})

// ==================== 47 号：resumeTurn 崩溃恢复续跑 ====================

describe('HostKit resumeTurn（47 号恢复能力面）', () => {
  it('缺省指令：中断会话续跑——指令作为 user 消息入历史、baseTurn 字段参与 scopeKey 装配', async () => {
    const history: ModelMessage[] = [
      { role: 'user', content: '帮我做长任务' },
      { role: 'assistant', content: [
        { type: 'tool-call', toolCallId: 'c1', toolName: 'discover_capabilities', input: {} },
      ] } as unknown as ModelMessage,
    ]
    const turnDeps = mkDeps({ history })
    const scopeSeen: Array<string | undefined> = []
    const { kit } = mkKit(turnDeps, {
      scopeKey: (t: Turn) => {
        scopeSeen.push(t.projectId)
        return `test:${t.projectId ?? 'p1'}`
      },
    })
    const r = await kit.resumeTurn({ input: '帮我做长任务', projectId: 'p2' })
    expect(r.stopReason).toBe('final')
    // 缺省恢复指令作为最后一条 user 消息落历史（会话存储续跑形态）
    const messages = turnDeps.saved.at(-1)
    expect(messages).toBeDefined()
    const lastUser = [...messages!].reverse().find((m) => m.role === 'user')
    expect(lastUser?.content).toBe(DEFAULT_RESUME_INSTRUCTION)
    // 悬空 tool-call 在 loadState 的 sanitize 段已被清洗（session-sanitize 职责，
    // 哨兵修复只兜 assemble 入口——此处断言历史里不再有悬空形态即可）
    expect(messages!.some((m) => m.role === 'tool')).toBe(false)
    // baseTurn 展开字段到达 scope 回调（记忆/快照/运行标签同源装配）
    expect(scopeSeen).toContain('p2')
  })

  it('instruction 覆盖：业务任务恢复块替换缺省指令', async () => {
    const turnDeps = mkDeps({
      history: [{ role: 'user', content: '做任务' }],
    })
    const { kit } = mkKit(turnDeps)
    const r = await kit.resumeTurn({ input: '做任务' }, { instruction: '任务恢复块：已完成 3/5 步，继续第 4 步' })
    expect(r.stopReason).toBe('final')
    const messages = turnDeps.saved.at(-1)
    const lastUser = [...messages!].reverse().find((m) => m.role === 'user')
    expect(lastUser?.content).toBe('任务恢复块：已完成 3/5 步，继续第 4 步')
  })
})
