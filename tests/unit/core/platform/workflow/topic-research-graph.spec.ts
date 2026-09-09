/**
 * 内置「主题实操研究」模板图断言（topic-research.json）
 * @module tests/unit/core/platform/workflow/topic-research-graph
 * @description 与 gossip-event-report / script-to-video-v3-graph 等既有模板专项 spec 同纪律：
 *              直接读 builtin-apps 下模板 JSON，断言节点接线与提示词契约关键句，
 *              保证"主题→规划→逐问搜索摘要→综合成实操指南→人工确认→存资产"的流程不被误改。
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
    edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; kind: string }>
  }
}

const graph = raw.graph!
const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
const startInputs = (nodeById.get('start')?.config?.inputs ?? []) as Array<{ key: string; label?: string; type?: string; required?: boolean; multi?: boolean; defaultValue?: unknown; modelTypes?: string[]; options?: Array<{ label: string; value: string }> }>

function config(id: string): Record<string, unknown> {
  return nodeById.get(id)?.config ?? {}
}

describe('内置「主题实操研究」模板（topic-research.json）', () => {
  it('导出格式与文件命名一致（kind/formatVersion/名称）', () => {
    expect(raw.kind).toBe('the-bot-workflow')
    expect(raw.formatVersion).toBe(1)
    expect(raw.name).toContain('主题实操研究')
  })

  it('节点与边数量、节点集合符合设计（10 节点 11 边）', () => {
    const ids = graph.nodes.map(n => n.id)
    expect(ids).toEqual(['start', 'plan1', 'loop1', 'search1', 'summ1', 'compose1', 'report1', 'review1', 'save1', 'end'])
    expect(graph.edges.length).toBe(11)
  })

  it('边接线符合流水线：规划→循环{搜索→摘要}→综合→报告→人工确认→保存/结束', () => {
    const edge = (s: string, t: string, kind: string) =>
      graph.edges.some(e => e.sourceNodeId === s && e.targetNodeId === t && e.kind === kind)
    expect(edge('start', 'plan1', 'normal')).toBe(true)
    expect(edge('plan1', 'loop1', 'normal')).toBe(true)
    expect(edge('loop1', 'search1', 'loop-body')).toBe(true)
    expect(edge('search1', 'summ1', 'normal')).toBe(true)
    expect(edge('summ1', 'loop1', 'loop-back')).toBe(true)
    expect(edge('loop1', 'compose1', 'loop-done')).toBe(true)
    expect(edge('compose1', 'report1', 'normal')).toBe(true)
    expect(edge('report1', 'review1', 'normal')).toBe(true)
    expect(edge('review1', 'save1', 'approve')).toBe(true)
    expect(edge('review1', 'end', 'reject')).toBe(true)
    expect(edge('save1', 'end', 'normal')).toBe(true)
  })

  it('start 输入完整：topic 必填 / focus 维度选项 / depth 默认 / model 必填', () => {
    const keys = startInputs.map(i => i.key)
    expect(keys).toContain('topic')
    expect(keys).toContain('focus')
    expect(keys).toContain('depth')
    expect(keys).toContain('model')

    const topic = startInputs.find(i => i.key === 'topic')!
    expect(topic.type).toBe('textarea')
    expect(topic.required).toBe(true)

    const focus = startInputs.find(i => i.key === 'focus')!
    expect(focus.type).toBe('select')
    expect(focus.multi).toBe(true)
    const focusVals = (focus.options ?? []).map(o => o.value)
    expect(focusVals).toEqual(['background', 'steps', 'cautions', 'operations', 'tools', 'faq'])
    const focusLabels = (focus.options ?? []).map(o => o.label)
    expect(focusLabels.join(',')).toContain('详细步骤')
    expect(focusLabels.join(',')).toContain('注意事项')
    expect(focusLabels.join(',')).toContain('运营方法')

    const depth = startInputs.find(i => i.key === 'depth')!
    expect(depth.defaultValue).toBe('standard')
    expect((depth.options ?? []).map(o => o.value)).toEqual(['quick', 'standard', 'deep'])

    const model = startInputs.find(i => i.key === 'model')!
    expect(model.type).toBe('model')
    expect(model.required).toBe(true)
    expect(model.modelTypes).toEqual(expect.arrayContaining(['text', 'multimodal']))
  })

  it('plan1：jsonMode 拆子问题，引用主题/维度/深度，提示词含维度纪律与做法型维度', () => {
    const plan1 = config('plan1')
    expect(plan1.jsonMode).toBe(true)
    expect(String(plan1.prompt)).toContain('{{start.topic}}')
    expect(String(plan1.prompt)).toContain('{{start.focus}}')
    expect(String(plan1.prompt)).toContain('{{start.depth}}')
    expect(String(plan1.providerConfigId)).toContain('{{start.model.providerConfigId}}')
    expect(String(plan1.modelId)).toContain('{{start.model.modelId}}')
    const sp = String(plan1.systemPrompt)
    for (const dim of ['【总体认识】', '【详细步骤】', '【注意事项】', '【运营方法】', '【工具与资源】', '【常见问题】']) {
      expect(sp).toContain(dim)
    }
    // 做法/实操类主题必须覆盖步骤/注意/运营三类
    expect(sp).toContain('至少覆盖')
    expect(sp).toContain('详细步骤')
    expect(sp).toContain('注意事项')
    expect(sp).toContain('运营方法')
  })

  it('loop1 按子问题列表循环，空则跳过', () => {
    const loop1 = config('loop1')
    expect(loop1.listExpression).toContain('{{plan1.parsed.subQuestions}}')
    expect(loop1.emptyPolicy).toBe('skip')
  })

  it('search1 用循环项作为搜索词', () => {
    const search1 = config('search1')
    expect(String(search1.query)).toContain('{{loop1.item}}')
  })

  it('summ1：逐问摘要只基于当轮搜索结果，禁编造来源', () => {
    const summ1 = config('summ1')
    expect(summ1.jsonMode).toBe(true)
    expect(String(summ1.prompt)).toContain('{{loop1.item}}')
    expect(String(summ1.prompt)).toContain('{{search1.results}}')
    const sp = String(summ1.systemPrompt)
    expect(sp).toContain('禁止编造')
    expect(sp).toContain('来源')
    expect(sp).toContain('搜索结果')
    expect(sp).toContain('summary')
  })

  it('compose1：在循环后综合全部摘要为实操指南，含归组与诚实标注纪律', () => {
    const compose1 = config('compose1')
    expect(compose1.jsonMode).toBe(true)
    expect(String(compose1.prompt)).toContain('{{start.topic}}')
    expect(String(compose1.prompt)).toContain('{{loop1.results}}')
    const sp = String(compose1.systemPrompt)
    for (const dim of ['总体认识', '详细步骤', '注意事项', '运营方法', '工具与资源', '常见问题']) {
      expect(sp).toContain(dim)
    }
    expect(sp).toContain('sourcesMd')
    expect(sp).toContain('需核实')
    expect(sp).toContain('以官方最新为准')
    expect(sp).toContain('body')
  })

  it('report1 拼装 parsed 字符串字段为 Markdown 指南', () => {
    const report1 = config('report1')
    expect(report1.format).toBe('markdown')
    const template = String(report1.template)
    expect(template).toContain('{{compose1.parsed.title}}')
    expect(template).toContain('{{compose1.parsed.overview}}')
    expect(template).toContain('{{compose1.parsed.body}}')
    expect(template).toContain('{{compose1.parsed.sourcesMd}}')
    expect(template).toContain('{{compose1.parsed.disclaimer}}')
  })

  it('review1 人工确认可编辑全文，approve 才保存', () => {
    const review1 = config('review1')
    expect(String(review1.payload)).toContain('{{report1.markdown}}')
    expect(review1.editableFields).toEqual([{ key: 'output_result', label: '指南全文', type: 'string' }])
  })

  it('save1 存为文本资产（实操指南分类），名称与标签含主题', () => {
    const save1 = config('save1')
    expect(String(save1.content)).toContain('{{report1.markdown}}')
    expect(save1.kind).toBe('text')
    expect(save1.category).toBe('text')
    expect(save1.subCategory).toBe('实操指南')
    expect(String(save1.name)).toContain('{{start.topic}}')
    expect(String(save1.tags)).toContain('实操研究')
    expect(String(save1.tags)).toContain('{{start.topic}}')
  })
})
