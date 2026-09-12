/**
 * 内置「主题深度研究」模板图断言（topic-research.json v3：until 循环研究轮）
 * @module tests/unit/core/platform/workflow/topic-research-graph
 * @description 直接读 builtin-apps 下模板 JSON，断言 v3 结构：
 *              澄清契约 → 规划(已知地图/验收) → until 循环{研究执行体→另一模型独立评估→打包}
 *              （评估通过即提前收尾；达 maxRounds 上限必收尾）→ 溯源成稿 → 人工确认(可改全文) → 存档。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FILE = 'topic-research.json'
const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps', FILE), 'utf-8')) as {
  kind?: string
  formatVersion?: number
  name?: string
  settings?: { maxTotalToolCalls?: number } | null
  graph?: {
    version?: number
    nodes: Array<{ id: string; type: string; name?: string; config?: Record<string, unknown> }>
    edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; kind: string; branchId?: string }>
  }
}

const graph = raw.graph!
const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
const startInputs = (nodeById.get('start')?.config?.inputs ?? []) as Array<{ key: string; label?: string; type?: string; required?: boolean; multi?: boolean; defaultValue?: unknown; source?: string; validation?: { min?: number; max?: number }; options?: Array<{ label: string; value: string }> }>

function config(id: string): Record<string, unknown> {
  return nodeById.get(id)?.config ?? {}
}

function str(id: string, field: string): string {
  return String(config(id)[field] ?? '')
}

function edgeTarget(source: string, kind: string): string | undefined {
  const hit = graph.edges.find(e => e.sourceNodeId === source && e.kind === kind)
  return hit?.targetNodeId
}

describe('内置「主题深度研究」模板（topic-research.json v3：until 循环研究轮）', () => {
  it('导出格式与命名', () => {
    expect(raw.kind).toBe('the-bot-workflow')
    expect(raw.formatVersion).toBe(1)
    expect(raw.name).toContain('深度研究')
  })

  it('运行级总预算已配置（settings.maxTotalToolCalls=120，跨轮共享不再每轮等额）', () => {
    expect(raw.settings?.maxTotalToolCalls).toBe(120)
  })

  it('节点集合与数量（12 节点 14 边：…→ round1(until) → writer → report1 → final1 → save1/end）', () => {
    const ids = graph.nodes.map(n => n.id)
    expect(ids).toEqual([
      'start', 'clarify', 'plan1', 'round1', 'r1', 'e1', 'pack1',
      'writer', 'report1', 'final1', 'save1', 'end',
    ])
    expect(graph.edges.length).toBe(14)
  })

  it('start 输入完整：主题/深度/轮数/知识库/双模型 + 用户产出规格与参照样本', () => {
    const keys = startInputs.map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining([
      'topic', 'focus', 'depth', 'maxRounds', 'kbs', 'researcherModel', 'evaluatorModel',
      'outputSpecs', 'outputRequirements', 'referenceSample',
    ]))
    const specs = startInputs.find(i => i.key === 'outputSpecs')!
    expect(specs.type).toBe('select')
    expect(specs.multi).toBe(true)
    expect((specs.options ?? []).map(o => o.value)).toEqual([
      'quant-formula', 'market-matrix', 'timeline', 'risk', 'checklist', 'counterpoint', 'cited-links',
    ])
    expect(startInputs.find(i => i.key === 'outputRequirements')!.type).toBe('textarea')
    expect(startInputs.find(i => i.key === 'referenceSample')!.type).toBe('textarea')
    const topic = startInputs.find(i => i.key === 'topic')!
    expect(topic.type).toBe('textarea')
    expect(topic.required).toBe(true)
    const rounds = startInputs.find(i => i.key === 'maxRounds')!
    expect(rounds.type).toBe('number')
    expect(rounds.defaultValue).toBe(8)
    expect(rounds.validation?.min).toBe(1)
    expect(rounds.validation?.max).toBe(12)
    const kbs = startInputs.find(i => i.key === 'kbs')!
    expect(kbs.type).toBe('select-dynamic')
    expect(kbs.source).toBe('knowledgeBases')
    const rm = startInputs.find(i => i.key === 'researcherModel')!
    const em = startInputs.find(i => i.key === 'evaluatorModel')!
    expect(rm.type).toBe('model')
    expect(em.type).toBe('model')
    expect(rm.required).toBe(true)
    expect(em.required).toBe(true)
  })

  it('clarify 为 form-collect 结构化问卷：主体/执照/目标市场/品类/内容能力/可承受亏损，approve→plan1 / reject→end', () => {
    expect(nodeById.get('clarify')?.type).toBe('form-collect')
    const fields = (config('clarify').fields ?? []) as Array<{ key: string; type?: string; multi?: boolean; options?: Array<{ value: string }> }>
    expect(fields.map(f => f.key).sort()).toEqual([
      'category', 'contentAbility', 'context', 'entityType', 'goal', 'licenseStatus', 'lossTolerance', 'targetMarkets',
    ])
    const byKey = Object.fromEntries(fields.map(f => [f.key, f]))
    expect(byKey.entityType.type).toBe('select')
    expect(byKey.entityType.options?.map(o => o.value)).toEqual(['cn-individual', 'cn-sole', 'cn-ltd', 'hk-ltd', 'overseas', 'other'])
    expect(byKey.licenseStatus.type).toBe('select')
    expect(byKey.targetMarkets.type).toBe('select')
    expect(byKey.targetMarkets.multi).toBe(true)
    expect(byKey.targetMarkets.options?.map(o => o.value)).toEqual(['MY', 'TH', 'PH', 'VN', 'SG', 'ID', 'US', 'EU', 'UK', 'JP', 'undecided'])
    expect(byKey.contentAbility.type).toBe('select')
    expect(byKey.lossTolerance.type).toBe('select')
    expect(edgeTarget('start', 'normal')).toBe('clarify')
    expect(edgeTarget('clarify', 'approve')).toBe('plan1')
    expect(edgeTarget('clarify', 'reject')).toBe('end')
  })

  it('plan1：jsonMode 规划器，深度化验收契约关键词', () => {
    expect(nodeById.get('plan1')?.type).toBe('llm-chat')
    expect(config('plan1').jsonMode).toBe(true)
    const sp = str('plan1', 'systemPrompt')
    for (const kw of ['已知地图', '主题类型', '验收标准', '先验', '信息源', '颗粒度', '决策树', '禁止编造', '做法/商业类', '单位经济', 'outputSpecs']) expect(sp).toContain(kw)
    const prompt = str('plan1', 'prompt')
    expect(prompt).toContain('{{start.topic}}')
    expect(prompt).toContain('{{start.maxRounds}}')
    expect(prompt).toContain('{{clarify.values.goal}}')
    expect(prompt).toContain('{{clarify.values.entityType}}')
    expect(prompt).toContain('{{clarify.values.targetMarkets}}')
    expect(prompt).toContain('{{clarify.values.lossTolerance}}')
    // 用户产出规格/要求/参照样本必须并入规划与验收
    expect(prompt).toContain('{{start.outputSpecs}}')
    expect(prompt).toContain('{{start.outputRequirements}}')
    expect(prompt).toContain('{{start.referenceSample}}')
    // 研究轮与成稿都吃到问卷约束
    expect(str('r1', 'task')).toContain('{{clarify.values.targetMarkets}}')
    expect(str('writer', 'prompt')).toContain('{{clarify.values.lossTolerance}}')
  })

  it('round1 为 until 循环：stopExpression/stopValue/maxIterations/errorPolicy=skip，边结构符合循环', () => {
    expect(nodeById.get('round1')?.type).toBe('loop')
    expect(config('round1').mode).toBe('until')
    expect(str('round1', 'stopExpression')).toBe('{{pack1.result.verdict}}')
    expect(config('round1').stopValue).toBe('pass')
    expect(str('round1', 'maxIterations')).toBe('{{start.maxRounds}}')
    expect(config('round1').errorPolicy).toBe('skip')
    expect(edgeTarget('plan1', 'normal')).toBe('round1')
    expect(edgeTarget('round1', 'loop-body')).toBe('r1')
    expect(edgeTarget('round1', 'loop-done')).toBe('writer')
    // pack1 → round1 loop-back（迭代结果 = pack1 输出）
    const back = graph.edges.find(e => e.kind === 'loop-back')
    expect(back?.sourceNodeId).toBe('pack1')
    expect(back?.targetNodeId).toBe('round1')
  })

  it('r1 研究执行体：agent-loop、工具白名单、预算护栏、轮次/上一轮注入与纪律', () => {
    expect(nodeById.get('r1')?.type).toBe('agent-loop')
    const whitelist = (config('r1').toolWhitelist ?? []) as string[]
    for (const t of ['web_search', 'wf_web_extract', 'wf_kb_retrieve', 'wf_kb_list']) expect(whitelist).toContain(t)
    expect(Number(config('r1').maxIterations)).toBeGreaterThan(0)
    expect(Number(config('r1').maxToolCalls)).toBeGreaterThan(0)
    expect(Number(config('r1').maxDurationMs)).toBeGreaterThan(0)
    expect(str('r1', 'providerConfigId')).toContain('{{start.researcherModel.providerConfigId}}')
    const task = str('r1', 'task')
    expect(task).toContain('{{round1.index}}')
    expect(task).toContain('{{round1.prev.result.notes}}')
    expect(task).toContain('{{round1.prev.result.gaps}}')
    const sp = str('r1', 'systemPrompt')
    for (const kw of ['wf_kb_list', '禁止编造', '证据锚', '未查到', '以官方最新为准', '证据层级', '量级', '增量', '深度已足够成稿']) expect(sp).toContain(kw)
  })

  it('e1 独立评估：evaluatorModel、jsonMode、深度质量核对', () => {
    expect(nodeById.get('e1')?.type).toBe('llm-chat')
    expect(config('e1').jsonMode).toBe(true)
    expect(str('e1', 'providerConfigId')).toContain('{{start.evaluatorModel.providerConfigId}}')
    expect(str('e1', 'modelId')).toContain('{{start.evaluatorModel.modelId}}')
    const sp = str('e1', 'systemPrompt')
    for (const kw of ['验收标准', 'pass', 'revise', '幻觉', '量级', '证据层级', '非阻塞', 'outputSpecs']) expect(sp).toContain(kw)
    const ePrompt = str('e1', 'prompt')
    expect(ePrompt).toContain('{{r1.answer}}')
    expect(ePrompt).toContain('{{start.outputSpecs}}')
    expect(ePrompt).toContain('{{start.outputRequirements}}')
  })

  it('pack1（code）：打包 notes/verdict/gaps 为迭代结果（loop-back 源）', () => {
    expect(nodeById.get('pack1')?.type).toBe('code')
    expect(config('pack1').language).toBe('js')
    const inputs = (config('pack1').inputs ?? []) as Array<{ key: string; value: string }>
    const byKey = Object.fromEntries(inputs.map(i => [i.key, i.value]))
    expect(byKey.notes).toBe('{{r1.answer}}')
    expect(byKey.verdict).toBe('{{e1.parsed.verdict}}')
    expect(byKey.gaps).toBe('{{e1.parsed.gaps}}')
    const code = str('pack1', 'code')
    expect(code).toContain('return { notes: inputs.notes, verdict: inputs.verdict, gaps: inputs.gaps }')
  })

  it('writer：jsonMode，引用 last 与轮数，深度结构契约；链路 writer→report1→final1→approve/reject', () => {
    expect(nodeById.get('writer')?.type).toBe('llm-chat')
    expect(config('writer').jsonMode).toBe(true)
    const prompt = str('writer', 'prompt')
    expect(prompt).toContain('{{round1.last.result.notes}}')
    expect(prompt).toContain('{{round1.last.result.verdict}}')
    expect(prompt).toContain('{{round1.iterations}}')
    expect(prompt).toContain('{{start.outputSpecs}}')
    expect(prompt).toContain('{{start.outputRequirements}}')
    expect(prompt).toContain('{{start.referenceSample}}')
    const sp = str('writer', 'systemPrompt')
    for (const kw of ['execSummary', 'sourcesMd', 'actionPlan', 'limits', '官方一手', '清单', '决策树', '以官方最新为准', '采购倒推', 'D1–D90', '[标题](URL)', '禁止照抄']) {
      expect(sp, kw).toContain(kw)
    }
    expect(edgeTarget('writer', 'normal')).toBe('report1')
    expect(nodeById.get('report1')?.type).toBe('report')
    const tpl = str('report1', 'template')
    expect(tpl).toContain('{{writer.parsed.actionPlan}}')
    expect(tpl).toContain('下一步行动')
    expect(edgeTarget('report1', 'normal')).toBe('final1')
    expect(nodeById.get('final1')?.type).toBe('human-review')
    const editable = (config('final1').editableFields ?? []) as Array<{ key: string }>
    expect(editable.map(f => f.key)).toEqual(['content'])
    expect(edgeTarget('final1', 'approve')).toBe('save1')
    expect(edgeTarget('final1', 'reject')).toBe('end')
    expect(str('save1', 'content')).toContain('{{final1.content}}')
  })

  it('从 start 出发全链可达', () => {
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
