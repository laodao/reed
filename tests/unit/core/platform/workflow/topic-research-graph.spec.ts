/**
 * 内置「主题深度研究」模板图断言（topic-research.json v5：用途自适应 + 信源四级分级 + 素材密度优先）
 * @module tests/unit/core/platform/workflow/topic-research-graph
 * @description 直接读 builtin-apps 下模板 JSON，断言 v5 结构：
 *              澄清契约(领域无关问卷) → 技能出《调研方法》方案(skill-call) → 契约编译(已知地图/逐条验收/
 *              信源四级分级=官方机构·官方媒体·互联网媒体·互联网搜索，跨渠道取材不偏官方)
 *              → until 循环{研究执行体→另一模型独立评估→打包}（评估通过即提前收尾；达 maxRounds
 *              上限必收尾）→ 按用途成稿(写作用途=高密度写作素材) → 人工确认(可改全文) → 存档。
 *              并钉死分层边界：报告内容/分析维度/数据来源经验在技能里，模板提示词不得再内联
 *              领域特定硬要求（否则换个研究领域就跑偏）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILTIN_SKILLS } from '@core/platform/workflow/skills/builtin-skills'

const FILE = 'topic-research.json'
const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps', FILE), 'utf-8')) as {
  kind?: string
  formatVersion?: number
  name?: string
  settings?: { maxTotalToolCalls?: number; maxDurationMs?: number } | null
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

describe('内置「主题深度研究」模板（topic-research.json v5：用途自适应 + 信源四级分级 + 素材密度优先）', () => {
  it('导出格式与命名', () => {
    expect(raw.kind).toBe('the-bot-workflow')
    expect(raw.formatVersion).toBe(1)
    expect(raw.name).toContain('深度研究')
  })

  it('运行级预算已配置（maxTotalToolCalls=300 跨轮共享；maxDurationMs=2h 兜底多轮深研）', () => {
    expect(raw.settings?.maxTotalToolCalls).toBe(300)
    expect(raw.settings?.maxDurationMs).toBe(7_200_000)
  })

  it('节点集合与数量（13 节点 15 边：…→ method1(技能方案) → plan1 → round1(until) → …）', () => {
    const ids = graph.nodes.map(n => n.id)
    expect(ids).toEqual([
      'start', 'clarify', 'method1', 'plan1', 'round1', 'r1', 'e1', 'pack1',
      'writer', 'report1', 'final1', 'save1', 'end',
    ])
    expect(graph.edges.length).toBe(15)
  })

  it('start 输入完整：主题/用途/深度/轮数/知识库/双模型 + 用户产出规格与参照样本', () => {
    const keys = startInputs.map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining([
      'topic', 'purpose', 'focus', 'depth', 'maxRounds', 'kbs', 'researcherModel', 'evaluatorModel',
      'outputSpecs', 'outputRequirements', 'referenceSample',
    ]))
    // 研究用途决定成稿形态：写作用途=素材密度优先
    const purpose = startInputs.find(i => i.key === 'purpose')!
    expect(purpose.type).toBe('select')
    expect(purpose.options?.map(o => o.value)).toContain('article-writing')
    const specs = startInputs.find(i => i.key === 'outputSpecs')!
    expect(specs.type).toBe('select')
    expect(specs.multi).toBe(true)
    expect((specs.options ?? []).map(o => o.value)).toEqual([
      'timeline', 'key-data', 'actors', 'cases', 'quotes', 'matrix', 'quant-formula', 'counterpoint', 'risk', 'checklist', 'cited-links',
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

  it('clarify 为 form-collect 领域无关问卷：目标/读者/角度/必覆盖/范围/背景，approve→method1 / reject→end', () => {
    expect(nodeById.get('clarify')?.type).toBe('form-collect')
    const fields = (config('clarify').fields ?? []) as Array<{ key: string; type?: string; multi?: boolean; options?: Array<{ value: string }> }>
    expect(fields.map(f => f.key).sort()).toEqual([
      'angle', 'audience', 'context', 'goal', 'mustCover', 'scope',
    ])
    // 领域无关：全部自由文本，不再有电商专用选项（主体/执照/目标市场/品类）
    for (const f of fields) expect(f.type).toBe('string')
    expect(edgeTarget('start', 'normal')).toBe('clarify')
    expect(edgeTarget('clarify', 'approve')).toBe('method1')
    expect(edgeTarget('clarify', 'reject')).toBe('end')
  })

  it('method1：skill-call 调用内置技能 research-method（调研经验在技能里，不在模板提示词里）', () => {
    expect(nodeById.get('method1')?.type).toBe('skill-call')
    const skillId = str('method1', 'skillId')
    expect(skillId).toBe('research-method')
    // 防漂移：模板引用的技能必须真的注册在内置技能清单里
    expect(BUILTIN_SKILLS.some(s => s.id === skillId), `未注册的内置技能 ${skillId}`).toBe(true)
    // 技能参数：把主题/契约/规格/参照样本交给技能，由技能产出方案（报告骨架/分析维度/数据来源）
    const inputs = (config('method1').inputs ?? []) as Array<{ key: string; value: string }>
    const byKey = Object.fromEntries(inputs.map(i => [i.key, i.value]))
    expect(Object.keys(byKey).sort()).toEqual([
      'constraints', 'depth', 'domainType', 'goal', 'knownContext', 'requiredOutputs', 'topic',
    ])
    expect(byKey.topic).toContain('{{start.topic}}')
    expect(byKey.topic).toContain('{{start.focus}}')
    expect(byKey.goal).toContain('{{clarify.values.goal}}')
    expect(byKey.depth).toContain('{{start.depth}}')
    for (const kw of ['purpose', 'audience', 'angle', 'mustCover', 'scope', 'context']) {
      expect(byKey.constraints, kw).toContain(kw === 'purpose' ? '{{start.purpose}}' : `clarify.values.${kw}`)
    }
    expect(byKey.requiredOutputs).toContain('{{start.outputSpecs}}')
    expect(byKey.requiredOutputs).toContain('{{start.outputRequirements}}')
    expect(byKey.knownContext).toContain('{{start.referenceSample}}')
    // 用研究模型执行，链路 method1 → plan1
    expect(str('method1', 'providerConfigId')).toContain('{{start.researcherModel.providerConfigId}}')
    expect(str('method1', 'modelId')).toContain('{{start.researcherModel.modelId}}')
    expect(edgeTarget('method1', 'normal')).toBe('plan1')
  })

  it('plan1：jsonMode 契约编译器，引用技能方案并落到本主题（领域经验不再内联）', () => {
    expect(nodeById.get('plan1')?.type).toBe('llm-chat')
    expect(config('plan1').jsonMode).toBe(true)
    const sp = str('plan1', 'systemPrompt')
    for (const kw of ['已知地图', '验收标准', '先验', 'outputSpecs', 'acceptance']) expect(sp).toContain(kw)
    // 信源四级分级 + 跨渠道取材：编译器必须做渠道搭配，不得写死来源门槛
    for (const kw of ['官方机构', '官方媒体', '互联网媒体', '互联网搜索', '跨渠道', '分级标注']) expect(sp).toContain(kw)
    expect(sp).not.toContain('≥2 个独立来源')
    // 经验已移入技能：模板提示词不得再内联领域特定硬要求
    for (const kw of ['类型骨架', '贡献利润', '采购倒推', 'D1–D90']) expect(sp, kw).not.toContain(kw)
    const prompt = str('plan1', 'prompt')
    expect(prompt).toContain('{{start.topic}}')
    expect(prompt).toContain('{{start.purpose}}')
    expect(prompt).toContain('{{start.maxRounds}}')
    expect(prompt).toContain('{{clarify.values.goal}}')
    expect(prompt).toContain('{{clarify.values.mustCover}}')
    expect(prompt).toContain('{{clarify.values.scope}}')
    // 契约编译器必须吃到技能产出的《调研方法》方案
    expect(prompt).toContain('{{method1.content}}')
    // 用户产出规格/要求/参照样本必须并入规划与验收
    expect(prompt).toContain('{{start.outputSpecs}}')
    expect(prompt).toContain('{{start.outputRequirements}}')
    expect(prompt).toContain('{{start.referenceSample}}')
    // 研究轮与成稿都吃到问卷约束
    expect(str('r1', 'task')).toContain('{{clarify.values.mustCover}}')
    expect(str('writer', 'prompt')).toContain('{{clarify.values.scope}}')
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
    // 素材密度需要检索量兜底：单轮工具调用预算不得低于 20
    expect(Number(config('r1').maxToolCalls)).toBeGreaterThanOrEqual(20)
    expect(Number(config('r1').maxDurationMs)).toBeGreaterThan(0)
    expect(str('r1', 'providerConfigId')).toContain('{{start.researcherModel.providerConfigId}}')
    const task = str('r1', 'task')
    expect(task).toContain('{{round1.index}}')
    expect(task).toContain('{{round1.prev.result.notes}}')
    expect(task).toContain('{{round1.prev.result.gaps}}')
    expect(task).toContain('{{start.purpose}}')
    const sp = str('r1', 'systemPrompt')
    for (const kw of ['wf_kb_list', '禁止编造', '证据锚', '未查到', '以官方最新为准', '来源层级', '量级', '增量', '深度已足够成稿']) expect(sp).toContain(kw)
    // 信源四级分级 + 跨渠道：层级低保留并标注，不得只从官方机构渠道取材
    for (const kw of ['官方机构', '官方媒体', '互联网媒体', '互联网搜索', '网络信息', '单一来源', '不得只从官方机构渠道取材']) expect(sp).toContain(kw)
    // 素材密度导向：具体事实是硬要求
    expect(sp).toContain('素材密度')
    expect(sp).toContain('引语')
  })

  it('e1 独立评估：evaluatorModel、jsonMode、素材密度与分级标注核对', () => {
    expect(nodeById.get('e1')?.type).toBe('llm-chat')
    expect(config('e1').jsonMode).toBe(true)
    expect(str('e1', 'providerConfigId')).toContain('{{start.evaluatorModel.providerConfigId}}')
    expect(str('e1', 'modelId')).toContain('{{start.evaluatorModel.modelId}}')
    const sp = str('e1', 'systemPrompt')
    for (const kw of ['验收标准', 'pass', 'revise', '幻觉', '量级', '来源层级', '非阻塞', 'outputSpecs']) expect(sp).toContain(kw)
    // 评估导向：素材密度不足可判 revise；「来源不够权威」与渠道单一本身不得成为 revise 理由
    expect(sp).toContain('素材密度')
    expect(sp).toContain('不要因为「信息不够权威」')
    expect(sp).toContain('四级')
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

  it('writer：jsonMode，引用 last 与轮数，按技能骨架成稿；链路 writer→report1→final1→approve/reject', () => {
    expect(nodeById.get('writer')?.type).toBe('llm-chat')
    expect(config('writer').jsonMode).toBe(true)
    const prompt = str('writer', 'prompt')
    expect(prompt).toContain('{{round1.last.result.notes}}')
    expect(prompt).toContain('{{round1.last.result.verdict}}')
    expect(prompt).toContain('{{round1.iterations}}')
    expect(prompt).toContain('{{start.purpose}}')
    expect(prompt).toContain('{{start.outputSpecs}}')
    expect(prompt).toContain('{{start.outputRequirements}}')
    expect(prompt).toContain('{{start.referenceSample}}')
    // 报告"该包含哪些内容"来自技能方案，不在模板里写死
    expect(prompt).toContain('{{method1.content}}')
    const sp = str('writer', 'systemPrompt')
    for (const kw of ['execSummary', 'sourcesMd', 'actionPlan', 'limits', '官方机构', '[标题](URL)', '禁止照抄']) {
      expect(sp, kw).toContain(kw)
    }
    // 参考来源按四级分层；网络信息可用但标注；内容导向信息密度优先
    for (const kw of ['官方媒体', '互联网媒体', '互联网搜索', '网络信息，未留链接', '信息密度']) {
      expect(sp, kw).toContain(kw)
    }
    for (const kw of ['采购倒推', 'D1–D90']) expect(sp, kw).not.toContain(kw)
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

  it('分层边界：领域特定产出要求只以「类别+示例」形式存在于技能，模板提示词保持领域无关', () => {
    const templatePrompts = ['method1', 'plan1', 'r1', 'e1', 'writer']
      .map(id => `${str(id, 'systemPrompt')}\n${str(id, 'prompt')}\n${str(id, 'task')}`)
      .join('\n')
    for (const kw of ['贡献利润', '采购倒推', 'D1–D90', 'D1-D90', '逐日']) {
      expect(templatePrompts, kw).not.toContain(kw)
    }
    const skill = BUILTIN_SKILLS.find(s => s.id === 'research-method')?.markdown ?? ''
    // 经验仍在技能里：以类别 + 示例给出，由模型按当前领域实例化
    expect(skill).toContain('单位经济')
    expect(skill).toContain('贡献利润')
    expect(skill).toContain('倒推')
    expect(skill).toContain('时间线')
    // 用户仍可在产出规格里点名要这些具体形态（UI 选项，不属于提示词硬编码）
    const specLabels = (startInputs.find(i => i.key === 'outputSpecs')?.options ?? []).map(o => o.label).join('|')
    expect(specLabels).toContain('公式')
    expect(specLabels).toContain('时间线')
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
