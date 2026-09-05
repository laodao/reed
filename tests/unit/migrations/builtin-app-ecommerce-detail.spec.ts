/**
 * 电商详情图（卖点宣传卡）工作流专项测试
 * @module tests/migrations/builtin-app-ecommerce-detail
 * @description 锁"商品介绍图"设计：① 先按卖点/规格规划 N 张（每张=一个卖点/规格点+参数 specs）② 逐张 image-gen 锁参考图商品特效图 ③ code 拼图文+参数 markdown ④ report-image 用「电商卖点卡」模板渲染，每张独立图文卡。
 */
import { describe, it, expect } from 'vitest'
import ecommerceDetailRaw from '../../../src/core/database/migrations/builtin-apps/ecommerce-detail-long-image.json'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'
import type { WorkflowGraph } from '@shared/types/workflow.types'

type Node = { id: string; type: string; name: string; config: Record<string, unknown> }
const nodes = (ecommerceDetailRaw.graph as unknown as { nodes: Node[] }).nodes ?? []
const edgeKinds = (ecommerceDetailRaw.graph as unknown as { edges: Array<{ kind: string }> }).edges ?? []

function llmPrompt(name: string): string {
  const n = nodes.find(x => x.type === 'llm-chat' && x.name === name)
  expect(n, `找不到 llm-chat 节点 ${name}`).toBeTruthy()
  return String(n?.config?.systemPrompt ?? '')
}

describe('电商详情图（卖点宣传卡，一致性与图文合一）', () => {
  it('图结构通过校验（节点/边/类型合法）', () => {
    const result = validateGraph(ecommerceDetailRaw.graph as unknown as WorkflowGraph)
    if (!result.valid) throw new Error(result.errors.join('；'))
    expect(result.valid).toBe(true)
  })

  it('start 提供 卖点宣传图张数(maxSlides) 与 图片规格(specPreset)', () => {
    const start = nodes.find(x => x.id === 'start')
    const keys = (start?.config?.inputs as Array<{ key: string }> ?? []).map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining(['maxSlides', 'specPreset']))
  })

  it('详情规划节点含「卖点×规格→逐张图文 + 参数 specs」+ 编辑指令 + 禁文字 + 风格一致', () => {
    const sp = llmPrompt('详情图规划（卖点×规格）')
    expect(sp).toContain('卖点')
    expect(sp).toContain('specs')
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

  it('存在 code 拼装节点（图+说明+参数表），report-image 用「电商卖点卡」模板渲染（每卖点独立卡）', () => {
    const code = nodes.find(x => x.type === 'code')
    expect(code).toBeTruthy()
    const inp = code?.config?.inputs as Array<{ key: string; value: string }> ?? []
    expect(inp.some(i => i.key === 'imgUrl')).toBe(true)
    expect(inp.some(i => i.key === 'sellPoint')).toBe(true)
    const ri = nodes.find(x => x.type === 'report-image')
    expect(ri).toBeTruthy()
    expect(ri?.config.templateId).toBe('ecommerceSellpoint')
    expect(String(ri?.config.template)).toContain('cardMd.result.markdown')
    expect(String(ri?.config.title)).toContain('loop1.item.title')
    expect(ri?.config.width).toBe(1080)
  })

  it('每张卖点卡独立保存（save-asset 在循环体内，card1.filePath），非合并成一张长图', () => {
    const save = nodes.find(x => x.type === 'save-asset')
    expect(String(save?.config.content)).toContain('card1.filePath')
    // 循环体内：img1(image-gen) → cardMd(code) → card1(report-image) → save-card → loop1 回环；loop1→end 为 loop-done
    const kinds = edgeKinds.map(e => e.kind)
    expect(kinds).toContain('loop-done')
    expect(kinds).toContain('loop-back')
    // 不存在 merge/单张长图（无 array-merge）
    expect(nodes.some(n => n.type === 'array-merge')).toBe(false)
  })
})
