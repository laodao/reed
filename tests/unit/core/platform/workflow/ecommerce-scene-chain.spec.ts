/**
 * 电商套图 v2 场景设计环节模板结构测试
 * @module tests/unit/core/platform/workflow/ecommerce-scene-chain.spec
 * @description 验证 ecommerce-poster.json v2：
 *              - start 含 sceneCount（默认 4，范围 1-8）
 *              - 场景链：scenePlan(llm json) → sceneText(llm) → sceneReview(human-review 挂起)
 *                → approve → sceneParse(llm json)；reject → end
 *              - 双 loop 串联：plan1 → loop1(非场景) → loop-done → loop2(场景) → loop-done → report
 *              - 两个 image-gen 都带 referenceImages + promptExtend:false（商品一致性）
 *              - 场景图 saveImg2 归同组 groupName
 *              引擎级挂起/批准/驳回语义已由 a3-review / loop-save-asset 覆盖。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'

const RAW = JSON.parse(readFileSync(resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/ecommerce-poster.json'), 'utf-8'))
const graph = RAW.graph as WorkflowGraph
const node = (id: string): WorkflowNode => graph.nodes.find(n => n.id === id)!
const edgesOf = (id: string) => graph.edges.filter(e => e.sourceNodeId === id)

describe('电商套图 v2 场景设计环节', () => {
  it('start 含场景数量 sceneCount（默认 4，范围 1-8）', () => {
    const input = (node('start').config?.inputs as Array<Record<string, unknown>>).find(i => i.key === 'sceneCount')
    expect(input).toBeDefined()
    expect(input!.type).toBe('number')
    expect(input!.defaultValue).toBe(4)
    const v = input!.validation as { min?: number; max?: number }
    expect(v.min).toBe(1)
    expect(v.max).toBe(8)
  })

  it('场景链拓扑：scenePlan → sceneText → sceneReview（approve→sceneParse，reject→end）', () => {
    const edges = edgesOf('scenePlan')
    expect(edges.some(e => e.targetNodeId === 'sceneText' && e.kind === 'normal')).toBe(true)
    expect(edgesOf('sceneText').some(e => e.targetNodeId === 'sceneReview' && e.kind === 'normal')).toBe(true)
    const reviewEdges = edgesOf('sceneReview')
    expect(reviewEdges.some(e => e.targetNodeId === 'sceneParse' && e.kind === 'approve')).toBe(true)
    expect(reviewEdges.some(e => e.targetNodeId === 'end' && e.kind === 'reject')).toBe(true)
  })

  it('scenePlan 是 jsonMode 且按 sceneCount 设计；sceneParse 从确认文本解析回结构化', () => {
    const plan = node('scenePlan')
    expect(plan.type).toBe('llm-chat')
    expect((plan.config as { jsonMode?: boolean }).jsonMode).toBe(true)
    expect((plan.config as { systemPrompt?: string }).systemPrompt).toContain('{{start.sceneCount}}')
    const parse = node('sceneParse')
    expect((parse.config as { jsonMode?: boolean }).jsonMode).toBe(true)
    expect((parse.config as { prompt?: string }).prompt).toContain('{{sceneReview.content}}')
  })

  it('sceneReview 是 human-review 且 payload 引用场景清单文本', () => {
    const review = node('sceneReview')
    expect(review.type).toBe('human-review')
    expect((review.config as { payload?: string }).payload).toBe('{{sceneText.content}}')
  })

  it('确认链拓扑：loop2 → merge1 → check1(list-check) → condCheck（regen→loop3→report1 / allOk→report1）', () => {
    const loop1 = node('loop1')
    const loop2 = node('loop2')
    expect((loop1.config as { listExpression?: string }).listExpression).toBe('{{plan1.parsed.shots}}')
    expect((loop2.config as { listExpression?: string }).listExpression).toBe('{{sceneParse.parsed.scenes}}')
    // loop1 → loop2 串联；loop2 → merge1（汇总）
    expect(edgesOf('loop1').some(e => e.targetNodeId === 'loop2' && e.kind === 'loop-done')).toBe(true)
    expect(edgesOf('loop2').some(e => e.targetNodeId === 'merge1' && e.kind === 'loop-done')).toBe(true)
    // merge1 → check1（form-collect list-check）
    const merge = node('merge1')
    expect(merge.type).toBe('array-merge')
    expect((merge.config as { sources?: unknown[] }).sources).toEqual(['{{loop1.results}}', '{{loop2.results}}'])
    const check = node('check1')
    expect(check.type).toBe('form-collect')
    const field = (check.config as { fields?: Array<Record<string, unknown>> }).fields?.[0]
    expect(field?.type).toBe('list-check')
    expect(field?.source).toBe('{{merge1.merged}}')
    expect(field?.itemKey).toBe('{{item.assetId}}')
    // check1 approve → condCheck；reject → end
    expect(edgesOf('check1').some(e => e.targetNodeId === 'condCheck' && e.kind === 'approve')).toBe(true)
    expect(edgesOf('check1').some(e => e.targetNodeId === 'end' && e.kind === 'reject')).toBe(true)
    // condCheck：regen → loop3（重生成）；allOk → report1
    expect(edgesOf('condCheck').some(e => e.targetNodeId === 'loop3' && e.branchId === 'regen')).toBe(true)
    expect(edgesOf('condCheck').some(e => e.targetNodeId === 'report1' && e.branchId === 'allOk')).toBe(true)
    // loop3 重生成 body：img3 → saveImg3 → loop-back；loop-done → report1
    const loop3 = node('loop3')
    expect((loop3.config as { listExpression?: string }).listExpression).toBe('{{check1.values.confirm.uncheckedItems}}')
    expect(edgesOf('loop3').some(e => e.targetNodeId === 'img3' && e.kind === 'loop-body')).toBe(true)
    expect(edgesOf('saveImg3').some(e => e.targetNodeId === 'loop3' && e.kind === 'loop-back')).toBe(true)
    expect(edgesOf('loop3').some(e => e.targetNodeId === 'report1' && e.kind === 'loop-done')).toBe(true)
  })

  it('两个 image-gen 都带参考图 + promptExtend:false（商品一致性）', () => {
    for (const id of ['img1', 'img2']) {
      const cfg = node(id).config as Record<string, unknown>
      expect(cfg.referenceImages).toBe('{{start.productImage.path}}')
      expect(cfg.promptExtend).toBe(false)
      expect(String(cfg.prompt)).toContain('{{')
    }
  })

  it('场景图 saveImg2 归同组（groupName 与 saveImg1 相同）', () => {
    const g1 = (node('saveImg1').config as { groupName?: string }).groupName
    const g2 = (node('saveImg2').config as { groupName?: string }).groupName
    expect(g1).toBe('套图-{{sys.today}}')
    expect(g2).toBe('套图-{{sys.today}}')
    expect((node('saveImg2').config as { name?: string }).name).toContain('{{loop2.item.title}}')
  })

  it('plan1 只规划非场景类型（systemPrompt 排除 scene）', () => {
    const sp = (node('plan1').config as { systemPrompt?: string }).systemPrompt
    expect(sp).toContain('scene')
    expect(sp).toContain('不要输出 scene')
  })

  it('图结构校验通过', () => {
    const result = validateGraph(graph)
    if (!result.valid) throw new Error(result.errors.join('；'))
    expect(result.valid).toBe(true)
  })
})
