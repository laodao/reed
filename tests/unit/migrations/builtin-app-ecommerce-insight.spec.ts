/**
 * 电商套图"商品理解 + 模特图 + 场景提示"专项测试（对标极睿科技 PhotoMagic/ECPro 能力）
 * @module tests/migrations/builtin-app-ecommerce-insight
 * @description 锁住四项升级，防回退：
 *  1) 商品理解节点（analyze1，vision 看图）："先识别、后生成"——全链路（套图规划/场景设计/
 *     场景结构化/清单报告）共享同一份商品认知与文案，图文同源不脱节；
 *  2) model 模特图类型：保持商品完全不变的 AI 试穿/上手持图（人台→模特思路），多姿势防同质；
 *  3) 场景提示 sceneHint：用户指定场景最高优先级（"场景模板 + Prompt 定制"双通道）；
 *  4) 社媒种草图与促销海报画风区隔（UGC 种草感 vs 强促销）。
 */
import { describe, it, expect } from 'vitest'
import ecommerceRaw from '../../../src/core/database/migrations/builtin-apps/ecommerce-poster.json'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import type { WorkflowGraph } from '@shared/types/workflow.types'

type Node = {
  id: string
  type: string
  name: string
  config: Record<string, unknown>
}

const nodes = (ecommerceRaw.graph as unknown as { nodes: Node[]; edges: Array<{ sourceNodeId: string; targetNodeId: string; kind: string }> }).nodes ?? []
const edges = (ecommerceRaw.graph as unknown as { edges: Array<{ sourceNodeId: string; targetNodeId: string; kind: string }> }).edges ?? []
const node = (id: string): Node => {
  const n = nodes.find(x => x.id === id)
  expect(n, `找不到节点 ${id}`).toBeTruthy()
  return n!
}

describe('电商套图商品理解环节（先识别后生成，图文同源）', () => {
  it('图结构通过校验（24 节点 / 31 边）', () => {
    const result = validateGraph(ecommerceRaw.graph as unknown as WorkflowGraph)
    if (!result.valid) throw new Error(result.errors.join('；'))
    expect(result.valid).toBe(true)
    expect(nodes.length).toBe(24)
    expect(edges.length).toBe(31)
  })

  it('analyze1 是 vision 节点且吃商品参考图，接在 start 与 scenePlan 之间', () => {
    const a = node('analyze1')
    expect(a.type).toBe('llm-chat')
    expect(a.config.vision).toBe(true)
    expect(a.config.imageInput).toBe('{{start.productImage.path}}')
    expect(a.config.providerConfigId).toBe('{{start.textModel.providerConfigId}}')
    const linked = edges.filter(e => (e.sourceNodeId === 'start' && e.targetNodeId === 'analyze1') || (e.sourceNodeId === 'analyze1' && e.targetNodeId === 'scenePlan'))
    expect(linked).toHaveLength(2)
    // 不再直连（防绕过商品理解）
    expect(edges.some(e => e.sourceNodeId === 'start' && e.targetNodeId === 'scenePlan')).toBe(false)
  })

  it('analyze1 输出结构覆盖 商品认定/核心卖点/场景建议/广告语，且有"待确认"防臆造约束', () => {
    const sp = String(node('analyze1').config.systemPrompt ?? '')
    expect(sp).toContain('商品认定')
    expect(sp).toContain('核心卖点 TOP3')
    expect(sp).toContain('视觉表达建议')
    expect(sp).toContain('场景建议')
    expect(sp).toContain('广告语备选')
    expect(sp).toContain('待确认')
    expect(sp).toContain('目标人群')
  })

  it('套图规划/场景设计/场景结构化 三节点都注入商品认知（{{analyze1.content}}）', () => {
    for (const id of ['plan1', 'scenePlan', 'sceneParse']) {
      const sp = String(node(id).config.systemPrompt ?? '')
      expect(sp, `${id} 应注入商品认知`).toContain('{{analyze1.content}}')
    }
    const plan1 = String(node('plan1').config.systemPrompt ?? '')
    expect(plan1).toContain('最高优先级口径')
    expect(plan1).toContain('核心卖点 TOP3')
  })

  it('清单报告含"商品理解与文案建议"章节（文案与套图出自同一份商品认知）', () => {
    const tpl = String(node('report1').config.template ?? '')
    expect(tpl).toContain('商品理解与文案建议')
    expect(tpl).toContain('{{analyze1.content}}')
  })
})

describe('电商套图模特图类型（AI 试穿/上手持图）', () => {
  it('start.posterTypes 提供 model 选项', () => {
    const start = node('start')
    const posterTypes = (start.config.inputs as Array<{ key: string; options?: Array<{ value: string }> }>)
      .find(i => i.key === 'posterTypes')
    expect(posterTypes?.options?.map(o => o.value)).toContain('model')
  })

  it('plan1 模特图规范：商品完全不变 + 分品类上身方式 + 多姿势防同质', () => {
    const sp = String(node('plan1').config.systemPrompt ?? '')
    expect(sp).toContain('model 模特图')
    expect(sp).toContain('保持商品完全不变的前提下生成真人模特')
    expect(sp).toContain('姿势/景别必须各不相同')
    expect(sp).toContain('绝不改变商品本身的形状、颜色、材质、图案、logo')
  })

  it('模特图 negativePrompt 追加人体防畸变词', () => {
    const sp = String(node('plan1').config.systemPrompt ?? '')
    expect(sp).toContain('deformed hands, deformed face, extra limbs, distorted body')
  })

  it('范围约束把 model 归入非场景类（数量展开覆盖模特图）', () => {
    const sp = String(node('plan1').config.systemPrompt ?? '')
    expect(sp).toContain('main 主图 / white 白底图 / model 模特图 / promo 促销海报')
  })
})

describe('电商套图场景提示与画风区隔', () => {
  it('start 提供 sceneHint 输入且 scenePlan 声明用户指定最高优先级', () => {
    const start = node('start')
    expect((start.config.inputs as Array<{ key: string }>).map(i => i.key)).toContain('sceneHint')
    const sp = String(node('scenePlan').config.systemPrompt ?? '')
    expect(sp).toContain('【场景提示（用户指定，最高优先级）】')
    const prompt = String(node('scenePlan').config.prompt ?? '')
    expect(prompt).toContain('{{start.sceneHint}}')
  })

  it('scenePlan 吸收商品认知的场景建议与目标人群（场景不再凭空联想）', () => {
    const sp = String(node('scenePlan').config.systemPrompt ?? '')
    expect(sp).toContain('「场景建议」清单与「目标人群」')
  })

  it('社媒种草图与促销海报画风区隔（UGC 种草感 vs 强促销）', () => {
    const sp = String(node('plan1').config.systemPrompt ?? '')
    expect(sp).toContain('UGC 种草笔记氛围')
    expect(sp).toContain('与 promo 的强促销氛围形成画风区隔')
  })

  it('文案模型说明标注商品理解需要看图（引导选多模态模型）', () => {
    const start = node('start')
    const textModel = (start.config.inputs as Array<{ key: string; description?: string }>)
      .find(i => i.key === 'textModel')
    expect(String(textModel?.description ?? '')).toContain('多模态')
  })
})
