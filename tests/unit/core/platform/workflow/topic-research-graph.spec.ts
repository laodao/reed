/**
 * 内置「主题深度研究」模板图断言（topic-research.json，v2 迭代研究版）
 * @module tests/unit/core/platform/workflow/topic-research-graph
 * @description 与 gossip-event-report / script-to-video-v3-graph 等既有模板专项 spec 同纪律：
 *              直接读 builtin-apps 下模板 JSON，断言节点接线与提示词契约关键句，
 *              保证"澄清契约 → 规划(已知地图/验收) → ≤3轮[研究执行体+另一模型独立评估] →
 *              差距迭代 → 溯源成稿 → 人工确认(可改全文) → 存档"的流程不被误改。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FILE = 'topic-research.json'
const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps', FILE), 'utf-8')) as {
  kind?: string
  formatVersion?: number
  name?: string
  graph?: {
    version?: number
    nodes: Array<{ id: string; type: string; name?: string; config?: Record<string, unknown> }>
    edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; kind: string; branchId?: string }>
  }
}

const graph = raw.graph!
const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
const startInputs = (nodeById.get('start')?.config?.inputs ?? []) as Array<{ key: string; label?: string; type?: string; required?: boolean; multi?: boolean; defaultValue?: unknown; modelTypes?: string[]; source?: string; options?: Array<{ label: string; value: string }> }>

function config(id: string): Record<string, unknown> {
  return nodeById.get(id)?.config ?? {}
}

function str(id: string, field: string): string {
  return String(config(id)[field] ?? '')
}

describe('内置「主题深度研究」模板（topic-research.json v2）', () => {
  it('导出格式与命名（kind/formatVersion/名称含“深度研究”）', () => {
    expect(raw.kind).toBe('the-bot-workflow')
    expect(raw.formatVersion).toBe(1)
    expect(raw.name).toContain('深度研究')
  })

  it('节点集合与数量（16 节点 19 边：澄清→规划→3轮[研究+评估+闸]→成稿→拼装→人工确认→保存）', () => {
    const ids = graph.nodes.map(n => n.id)
    expect(ids).toEqual([
      'start', 'clarify', 'plan1', 'r1', 'e1', 'c1', 'r2', 'e2', 'c2', 'r3', 'e3',
      'writer', 'report1', 'final1', 'save1', 'end',
    ])
    expect(graph.edges.length).toBe(19)
  })

  it('start 输入完整：topic 必填 / focus / depth / kbs(select-dynamic knowledgeBases) / 双模型', () => {
    const keys = startInputs.map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining(['topic', 'focus', 'depth', 'kbs', 'researcherModel', 'evaluatorModel']))
    const topic = startInputs.find(i => i.key === 'topic')!
    expect(topic.type).toBe('textarea')
    expect(topic.required).toBe(true)
    const kbs = startInputs.find(i => i.key === 'kbs')!
    expect(kbs.type).toBe('select-dynamic')
    expect(kbs.source).toBe('knowledgeBases')
    expect(kbs.multi).toBe(true)
    const rm = startInputs.find(i => i.key === 'researcherModel')!
    const em = startInputs.find(i => i.key === 'evaluatorModel')!
    expect(rm.type).toBe('model')
    expect(em.type).toBe('model')
    expect(rm.required).toBe(true)
    expect(em.required).toBe(true)
  })

  it('clarify 为 form-collect：研究契约表单在规划之前，approve→plan1 / reject→end', () => {
    expect(nodeById.get('clarify')?.type).toBe('form-collect')
    const fields = (config('clarify').fields ?? []) as Array<{ key: string; label: string; type: string }>
    expect(fields.map(f => f.key).sort()).toEqual(['context', 'goal'])
    const edge = (s: string, t: string, kind: string) =>
      graph.edges.some(e => e.sourceNodeId === s && e.targetNodeId === t && e.kind === kind)
    expect(edge('start', 'clarify', 'normal')).toBe(true)
    expect(edge('clarify', 'plan1', 'approve')).toBe(true)
    expect(edge('clarify', 'end', 'reject')).toBe(true)
  })

  it('plan1：jsonMode 规划器，任务含已知地图/主题类型/验收标准，引用契约与背景', () => {
    const plan1 = config('plan1')
    expect(plan1.jsonMode).toBe(true)
    expect(str('plan1', 'providerConfigId')).toContain('{{start.researcherModel.providerConfigId}}')
    const sp = str('plan1', 'systemPrompt')
    for (const kw of ['已知地图', '主题类型', '验收标准', '先验', '信息源', '颗粒度', '决策树', '禁止编造']) expect(sp).toContain(kw)
    const prompt = str('plan1', 'prompt')
    expect(prompt).toContain('{{start.topic}}')
    expect(prompt).toContain('{{clarify.values.goal}}')
    expect(prompt).toContain('{{clarify.values.context}}')
  })

  it('三轮研究执行体 r1/r2/r3：agent-loop，工具白名单含联网/深读/私有库与 wf_kb_list，带预算护栏', () => {
    for (const id of ['r1', 'r2', 'r3']) {
      expect(nodeById.get(id)?.type, id).toBe('agent-loop')
      const whitelist = (config(id).toolWhitelist ?? []) as string[]
      for (const t of ['web_search', 'wf_web_extract', 'wf_kb_retrieve', 'wf_kb_list']) {
        expect(whitelist, `${id}/${t}`).toContain(t)
      }
      expect(Number(config(id).maxIterations)).toBeGreaterThan(0)
      expect(Number(config(id).maxToolCalls)).toBeGreaterThan(0)
      expect(Number(config(id).maxDurationMs)).toBeGreaterThan(0)
      expect(str(id, 'providerConfigId')).toContain('{{start.researcherModel.providerConfigId}}')
      // 研究纪律关键句
      const sp = str(id, 'systemPrompt')
      for (const kw of ['wf_kb_list', '禁止编造', '证据锚', '未查到', '以官方最新为准', '证据层级', '量级']) {
        expect(sp, `${id}/${kw}`).toContain(kw)
      }
    }
    // 轮次间传递：r2 引用 r1 进展与 e1 差距；r3 引用 r2 与 e2
    expect(str('r2', 'task')).toContain('{{r1.answer}}')
    expect(str('r2', 'task')).toContain('{{e1.parsed}}')
    expect(str('r3', 'task')).toContain('{{r2.answer}}')
    expect(str('r3', 'task')).toContain('{{e2.parsed}}')
  })

  it('三轮独立评估 e1/e2/e3：用 evaluatorModel（另一模型），jsonMode，输出 pass/revise 判定', () => {
    for (const id of ['e1', 'e2', 'e3']) {
      expect(nodeById.get(id)?.type, id).toBe('llm-chat')
      expect(config(id).jsonMode, id).toBe(true)
      expect(str(id, 'providerConfigId'), id).toContain('{{start.evaluatorModel.providerConfigId}}')
      expect(str(id, 'modelId'), id).toContain('{{start.evaluatorModel.modelId}}')
      const sp = str(id, 'systemPrompt')
      for (const kw of ['验收标准', 'pass', 'revise', '幻觉', '量级', '证据层级']) expect(sp, `${id}/${kw}`).toContain(kw)
    }
    expect(str('e1', 'prompt')).toContain('{{r1.answer}}')
    expect(str('e2', 'prompt')).toContain('{{r2.answer}}')
    expect(str('e3', 'prompt')).toContain('{{r3.answer}}')
  })

  it('评估闸 c1/c2：pass→writer，revise→下一轮；e3 无论结论都进 writer（有界迭代）', () => {
    for (const id of ['c1', 'c2']) {
      expect(nodeById.get(id)?.type, id).toBe('condition')
      expect(branchTarget(id, 'pass')).toBe('writer')
      expect(branchTarget(id, 'revise')).toBe(id === 'c1' ? 'r2' : 'r3')
      const branches = (config(id).branches ?? []) as Array<{ branchId: string; conditions?: Array<{ left?: string; operator?: string; right?: unknown }> }>
      expect(branches.map(b => b.branchId).sort()).toEqual(['pass', 'revise'])
    }
    expect(edgeTarget('e3', 'normal')).toBe('writer') // e3 → writer 直连
  })

  it('writer 成稿 → report1 拼装 → final1 人工确认（可改全文）→ approve 保存 / reject 结束', () => {
    expect(nodeById.get('writer')?.type).toBe('llm-chat')
    expect(config('writer').jsonMode).toBe(true)
    for (const kw of ['execSummary', 'sourcesMd', 'limits', '以官方最新为准', 'actionPlan', '官方一手', '清单', '决策树']) {
      expect(str('writer', 'systemPrompt'), kw).toContain(kw)
    }
    // 深度契约已内联到报告模板：下一步行动 + 证据分层来源
    const tpl = str('report1', 'template')
    expect(tpl).toContain('{{writer.parsed.actionPlan}}')
    expect(tpl).toContain('下一步行动')
    expect(edgeTarget('writer', 'normal')).toBe('report1')
    expect(edgeTarget('report1', 'normal')).toBe('final1')
    expect(nodeById.get('final1')?.type).toBe('human-review')
    const editable = (config('final1').editableFields ?? []) as Array<{ key: string }>
    expect(editable.map(f => f.key)).toEqual(['content'])
    expect(edgeTarget('final1', 'approve')).toBe('save1')
    expect(edgeTarget('final1', 'reject')).toBe('end')
    // 保存内容 = 人工确认后的全文（用户可改），而非中间稿
    expect(str('save1', 'content')).toContain('{{final1.content}}')
    expect(config('save1').kind).toBe('text')
  })

  it('从 start 出发的全链可达（无断链），且图无环（除允许的 forward 分支）', () => {
    // 简单可达性：按边遍历，期望覆盖全部 16 个节点
    const reachable = new Set<string>(['start'])
    const adj = new Map<string, string[]>()
    for (const n of graph.nodes) adj.set(n.id, [])
    for (const e of graph.edges) adj.get(e.sourceNodeId)!.push(e.targetNodeId)
    const stack = ['start']
    while (stack.length) {
      const cur = stack.pop()!
      for (const next of adj.get(cur) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next)
          stack.push(next)
        }
      }
    }
    for (const n of graph.nodes) expect(reachable.has(n.id), `未达节点 ${n.id}`).toBe(true)
  })
})

function branchTarget(source: string, branchId: string): string | undefined {
  const hit = graph.edges.find(e => e.sourceNodeId === source && e.kind === 'branch' && e.branchId === branchId)
  return hit?.targetNodeId
}

function edgeTarget(source: string, kind: string): string | undefined {
  const hit = graph.edges.find(e => e.sourceNodeId === source && e.kind === kind)
  return hit?.targetNodeId
}
