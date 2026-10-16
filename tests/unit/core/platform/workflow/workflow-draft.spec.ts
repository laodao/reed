/**
 * M7 工作流草稿生成单测（31 号）
 * - parseDraftJson：裸 JSON / 代码块包裹 / 垃圾文本
 * - normalizeDraft：边字段映射（source→sourceNodeId）、布局、start/end 校验、
 *   未知边节点、节点上限
 * - WorkflowDraftService：校验失败回喂修复轮（错误进 prompt）、两轮皆败抛错、
 *   成功路径 create+saveDraft 调用
 */

import { describe, it, expect } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import {
  parseDraftJson,
  normalizeDraft,
  buildDraftPrompt,
  WorkflowDraftService,
  DRAFT_MAX_NODES,
} from '@core/platform/workflow/draft/workflow-draft.service'
import type { WorkflowDraftDeps } from '@core/platform/workflow/draft/workflow-draft.service'

const VALID_RAW = {
  name: '网页翻译',
  description: '抓网页正文并翻译成英语',
  startInputs: [{ key: 'url', label: '网页地址', type: 'string', required: true }],
  nodes: [
    { id: 'start', type: 'start', name: '开始', config: { inputs: [{ key: 'url', label: '网页地址', type: 'string', required: true }] } },
    { id: 'extract_1', type: 'web-extract', name: '抓正文', config: { url: '{{start.url}}' } },
    { id: 'end', type: 'end', name: '结束', config: {} },
  ],
  edges: [
    { source: 'start', target: 'extract_1' },
    { source: 'extract_1', target: 'end' },
  ],
}

function textModel(steps: Array<string>): LanguageModel {
  let i = 0
  const gen = (opts: { prompt?: unknown }) => {
    const text = steps[Math.min(i++, steps.length - 1)]
    void opts
    return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } }, warnings: [] }
  }
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async (opts: { prompt?: unknown }) => {
      const text = steps[Math.min(i++, steps.length - 1)]
      void opts
      return { stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: text },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } } },
      ] }) }
    },
    doGenerate: gen,
  }) as unknown as LanguageModel
}

function makeDeps(model: LanguageModel) {
  const calls: Array<{ kind: string; args: unknown }> = []
  const deps: WorkflowDraftDeps = {
    resolveModel: async () => model,
    validate: (graph) => {
      calls.push({ kind: 'validate', args: graph })
      return []
    },
    create: async (input) => {
      calls.push({ kind: 'create', args: input })
      return { id: 'wf-draft-1' } as never
    },
    saveDraft: (id, graph) => {
      calls.push({ kind: 'saveDraft', args: { id, graph } })
      return Promise.resolve(null) as never
    },
  }
  return { deps, calls }
}

// ==================== 纯函数 ====================

describe('parseDraftJson', () => {
  it('裸 JSON / 代码块包裹均可解析；垃圾文本返回 null', () => {
    expect(parseDraftJson('{"name":"a"}')).toEqual({ name: 'a' })
    expect(parseDraftJson('```json\n{"name":"b"}\n```')).toEqual({ name: 'b' })
    expect(parseDraftJson('好的，这是结果：{"name":"c"} 以上')).toEqual({ name: 'c' })
    expect(parseDraftJson('我不会')).toBeNull()
    expect(parseDraftJson('')).toBeNull()
  })
})

describe('normalizeDraft', () => {
  it('合法草稿：边字段映射 source→sourceNodeId、version 1、布局坐标生成', () => {
    const r = normalizeDraft(VALID_RAW as never)
    expect(typeof r).toBe('object')
    if (typeof r === 'string') throw new Error(String(r))
    expect(r.graph.version).toBe(1)
    expect(r.graph.edges[0]).toMatchObject({ sourceNodeId: 'start', targetNodeId: 'extract_1', kind: 'normal' })
    expect(r.graph.nodes.every((n) => n.position && typeof n.position.x === 'number')).toBe(true)
    expect(r.nodeCount).toBe(3)
  })

  it('缺 start / 缺 end / 未知边节点 / 超上限 → 错误字符串（进修复轮）', () => {
    const noStart = { ...VALID_RAW, nodes: VALID_RAW.nodes.filter((n) => n.id !== 'start') }
    expect(normalizeDraft(noStart as never)).toContain('start')
    const noEnd = { ...VALID_RAW, nodes: VALID_RAW.nodes.filter((n) => n.id !== 'end') }
    expect(normalizeDraft(noEnd as never)).toContain('end')
    const badEdge = { ...VALID_RAW, edges: [{ source: 'start', target: 'ghost' }] }
    expect(normalizeDraft(badEdge as never)).toContain('不存在')
    const many = { ...VALID_RAW, nodes: Array.from({ length: DRAFT_MAX_NODES + 1 }, (_, k) => ({ id: `n${k}`, type: k === 0 ? 'start' : k === DRAFT_MAX_NODES ? 'end' : 'delay', config: {} })) }
    expect(normalizeDraft(many as never)).toContain('上限')
    const dup = { ...VALID_RAW, nodes: [{ ...VALID_RAW.nodes[0] }, { ...VALID_RAW.nodes[0] }, ...VALID_RAW.nodes.slice(1)] }
    expect(normalizeDraft(dup as never)).toContain('重复')
  })

  it('startInputs 填充进 start 节点 config.inputs（prompt 契约兑现）', () => {
    const r = normalizeDraft(VALID_RAW as never)
    if (typeof r === 'string') throw new Error(String(r))
    const start = r.graph.nodes.find((n) => (n as { type: string }).type === 'start') as unknown as { config: { inputs: Array<{ key: string }> } }
    expect(start.config.inputs).toEqual([{ key: 'url', label: '网页地址', type: 'string', required: true }])
    // 无 startInputs 且 start 节点 config 原本无 inputs → 不凭空注入
    const noInputs = {
      ...VALID_RAW,
      startInputs: [],
      nodes: VALID_RAW.nodes.map((n) => (n.id === 'start' ? { ...n, config: {} } : n)),
    }
    const r2 = normalizeDraft(noInputs as never)
    if (typeof r2 === 'string') throw new Error(String(r2))
    const start2 = r2.graph.nodes.find((n) => (n as { type: string }).type === 'start') as unknown as { config: Record<string, unknown> }
    expect(start2.config.inputs).toBeUndefined()
  })

  it('buildDraftPrompt：含节点目录与用户描述；修复轮带错误清单', () => {
    const p1 = buildDraftPrompt('做一个翻译工作流')
    expect(p1).toContain('llm-chat')
    expect(p1).toContain('做一个翻译工作流')
    const p2 = buildDraftPrompt('做一个翻译工作流', ['缺少 start 节点', 'url 必填'])
    expect(p2).toContain('缺少 start 节点')
    expect(p2).toContain('url 必填')
  })
})

// ==================== 服务 ====================

describe('WorkflowDraftService', () => {
  it('一次通过：validate/create/saveDraft 按序调用，返回 definitionId', async () => {
    const { deps, calls } = makeDeps(textModel([JSON.stringify(VALID_RAW)]))
    const svc = new WorkflowDraftService(deps)
    const r = await svc.draftFromDescription({ description: '抓网页正文并翻译成英语' })
    expect(r.definitionId).toBe('wf-draft-1')
    expect(r.nodeCount).toBe(3)
    expect(r.repairRounds).toBe(0)
    expect(calls.map((c) => c.kind)).toEqual(['validate', 'create', 'saveDraft'])
  })

  it('首轮校验失败 → 修复轮（错误回喂 prompt）→ 通过', async () => {
    const bad = { ...VALID_RAW, nodes: VALID_RAW.nodes.filter((n) => n.id !== 'end'), edges: VALID_RAW.edges.slice(0, 1) }
    const prompts: string[] = []
    let i = 0
    const model = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doGenerate: async (opts: { prompt?: unknown }) => {
        prompts.push(JSON.stringify(opts.prompt ?? ''))
        const text = i++ === 0 ? JSON.stringify(bad) : JSON.stringify(VALID_RAW)
        return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } }, warnings: [] }
      },
    }) as unknown as LanguageModel
    const { deps, calls } = makeDeps(model)
    // 首轮：缺 end（normalize 拦截）；次轮：通过
    const svc = new WorkflowDraftService(deps)
    const r = await svc.draftFromDescription({ description: '抓网页翻译' })
    expect(r.repairRounds).toBe(1)
    expect(prompts[1]).toContain('缺少 end 节点')
    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(1)
  })

  it('两轮皆败 → 结构化错误抛出', async () => {
    const { deps } = makeDeps(textModel(['不是JSON', '还不是JSON']))
    const svc = new WorkflowDraftService(deps)
    await expect(svc.draftFromDescription({ description: 'x' })).rejects.toThrow('生成失败')
  })

  it('finishReason=length 截断：截断文案抛出 + 修复轮喂长度提示（33 号长程实测回归）', async () => {
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } }
    const prompts: string[] = []
    // 两轮都输出"截断的 JSON 半截"（无收尾括号 → parse 失败），finishReason=length
    const truncated = '{"nodes": [{"id": "a"'
    const lenModel = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => {
        // generateText 不走流式；此 mock 仅供类型完备
        return { stream: simulateReadableStream({ chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: truncated },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'length', raw: undefined }, usage },
        ] }) }
      },
      doGenerate: (opts: { prompt?: unknown }) => {
        prompts.push(JSON.stringify(opts.prompt))
        return { content: [{ type: 'text', text: truncated }], finishReason: { unified: 'length', raw: undefined }, usage, warnings: [] }
      },
    }) as unknown as LanguageModel
    const { deps } = makeDeps(lenModel)
    const svc = new WorkflowDraftService(deps)
    await expect(svc.draftFromDescription({ description: '调研流程' })).rejects.toThrow('截断')
    // 第二轮 prompt 带上了截断针对性修复提示（而非笼统的"严格 JSON"）
    expect(prompts[1]).toContain('因长度被截断')
  })

  it('空描述直接拒绝', async () => {
    const { deps } = makeDeps(textModel('{}'))
    const svc = new WorkflowDraftService(deps)
    await expect(svc.draftFromDescription({ description: '   ' })).rejects.toThrow('描述不能为空')
  })
})
