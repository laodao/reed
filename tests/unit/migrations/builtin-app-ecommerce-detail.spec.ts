/**
 * 电商详情长图工作流专项测试
 * @module tests/migrations/builtin-app-ecommerce-detail
 * @description 锁"商品介绍图"设计：① 先按卖点/规格规划 N 张（图文对应）② 逐张 image-gen 锁参考图商品 ③ code 拼图文 markdown ④ report-image 渲染竖版长图。
 */
import { describe, it, expect } from 'vitest'
import ecommerceDetailRaw from '../../../src/core/database/migrations/builtin-apps/ecommerce-detail-long-image.json'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'
import type { WorkflowGraph } from '@shared/types/workflow.types'

type Node = { id: string; type: string; name: string; config: Record<string, unknown> }
const nodes = (ecommerceDetailRaw.graph as unknown as { nodes: Node[] }).nodes ?? []

function llmPrompt(name: string): string {
  const n = nodes.find(x => x.type === 'llm-chat' && x.name === name)
  expect(n, `找不到 llm-chat 节点 ${name}`).toBeTruthy()
  return String(n?.config?.systemPrompt ?? '')
}

describe('电商详情长图（一致性内含）', () => {
  it('图结构通过校验（节点/边/类型合法）', () => {
    const result = validateGraph(ecommerceDetailRaw.graph as unknown as WorkflowGraph)
    if (!result.valid) throw new Error(result.errors.join('；'))
    expect(result.valid).toBe(true)
  })

  it('start 提供 介绍图张数(maxSlides) 与 图片规格(specPreset)', () => {
    const start = nodes.find(x => x.id === 'start')
    const keys = (start?.config?.inputs as Array<{ key: string }> ?? []).map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining(['maxSlides', 'specPreset']))
  })

  it('详情图规划节点含「卖点×规格→逐张图文对应」+ 编辑指令 + 禁文字 + 风格一致', () => {
    const sp = llmPrompt('详情图规划（卖点×规格）')
    expect(sp).toContain('卖点')
    expect(sp).toContain('规格')
    expect(sp).toContain('Keep the product')
    expect(sp).toContain('completely unchanged')
    expect(sp).toContain('禁止出现任何文字')
    expect(sp).toContain('风格与质感一致')
    expect(sp).toContain('{{start.maxSlides}}')
  })

  it('loop 按规划清单逐张生成（listExpression=detailPlan.parsed.slides）', () => {
    const loop = nodes.find(x => x.type === 'loop')
    expect(loop?.config.listExpression).toBe('{{detailPlan.parsed.slides}}')
  })

  it('image-gen 锁参考图商品且关闭扩写（promptExtend=false / referenceImages=商品图）', () => {
    const img = nodes.find(x => x.type === 'image-gen')
    expect(img?.config.promptExtend).toBe(false)
    expect(String(img?.config.referenceImages)).toContain('productImage')
  })

  it('存在 code 拼装节点 + report-image 渲染节点（template 引用 code 输出）', () => {
    const code = nodes.find(x => x.type === 'code')
    expect(code).toBeTruthy()
    expect(String(code?.config.code)).toContain('markdown')
    const ri = nodes.find(x => x.type === 'report-image')
    expect(ri).toBeTruthy()
    expect(String(ri?.config.template)).toContain('buildMd.result.markdown')
    expect(ri?.config.templateId).toBe('generic')
    expect(ri?.config.width).toBe(1080)
  })
})
