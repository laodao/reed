/**
 * script-to-video-v3 内置图结构与语义校验（写作层技能化后）
 * @module tests/unit/core/platform/workflow/script-to-video-v3-graph
 * @description V3（通用视觉策略 imagery/asset + 写作层动态技能）生成器产物 JSON 的本地校验：
 *              - validateGraph 0 errors（图结构/端口/循环边合法）
 *              - start 含 visualStrategy 与 writerSkill/writerAttitude/writerAngle 输入
 *              - strategy(code) 插在 preset→writerPick 之间（auto 解析/素材门控/policyText）
 *              - 写作层 writerPick(code 按 videoType 映射技能)→writerCall(skill-call, skillId={{…}})→writerMd(code)→outlineReview
 *              - splitShots 按 strategy.result.mode 分流；matItem/matBase 卡片带 mode/source
 *              - 素材板审核 payload 携带 visualStrategy；两级审核 reject→end 语义保留
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'

const doc = JSON.parse(
  readFileSync(join(process.cwd(), 'src/core/database/migrations/builtin-apps/script-to-video-v3.json'), 'utf-8')
) as {
  name: string
  graph: { nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>; edges: Array<{ sourceNodeId: string; targetNodeId: string; kind: string }> }
}
const g = doc.graph
const node = (id: string) => {
  const n = g.nodes.find(x => x.id === id)
  if (!n) throw new Error('no node ' + id)
  return n
}
const edgesOf = (src: string, tgt: string, kind?: string) =>
  g.edges.filter(e => e.sourceNodeId === src && e.targetNodeId === tgt && (!kind || e.kind === kind))
const inputsOf = (id: string) => (node(id).config.inputs as Array<{ key: string; type: string; defaultValue?: string; options?: Array<{ value: string }> }>)

describe('script-to-video-v3 图结构与语义', () => {
  it('validateGraph 0 errors（36 节点 / 40 边，写作层节点齐全）', () => {
    const r = validateGraph({ version: 1, nodes: g.nodes, edges: g.edges })
    expect(r.errors).toEqual([])
    expect(g.nodes.length).toBe(36)
    expect(g.edges.length).toBe(40)
    expect(g.nodes.some(n => n.id === 'outlineGen')).toBe(false)
    expect(g.nodes.some(n => n.id === 'outlineMd')).toBe(false)
    for (const id of ['writerPick', 'writerCall', 'writerMd']) {
      expect(g.nodes.some(n => n.id === id)).toBe(true)
    }
  })

  it('start 含 visualStrategy 与写作技能/态度/角度输入', () => {
    const inputs = inputsOf('start')
    const vs = inputs.find(i => i.key === 'visualStrategy')
    expect(vs).toBeTruthy()
    expect(vs!.type).toBe('select')
    expect(vs!.options!.map(o => o.value)).toEqual(['auto', 'imagery', 'asset'])

    const ws = inputs.find(i => i.key === 'writerSkill')
    expect(ws).toBeTruthy()
    expect(ws!.defaultValue).toBe('auto')
    expect(ws!.options!.map(o => o.value)).toContain('video-writer-investigative')
    expect(ws!.options!.map(o => o.value)).toContain('video-writer-standard')
    const wa = inputs.find(i => i.key === 'writerAttitude')
    expect(wa).toBeTruthy()
    expect(wa!.options!.map(o => o.value)).toEqual(['auto', '冷静调查', '犀利质疑', '共情叙事'])
    expect(inputs.some(i => i.key === 'writerAngle')).toBe(true)
  })

  it('strategy(code) 插在 preset→writerPick 之间（原直连 outlineGen 已移除）', () => {
    expect(node('strategy').type).toBe('code')
    expect(edgesOf('preset', 'outlineGen')).toHaveLength(0)
    expect(edgesOf('preset', 'strategy')).toHaveLength(1)
    expect(edgesOf('strategy', 'writerPick')).toHaveLength(1)
    const code = String(node('strategy').config.code)
    expect(code).toContain('choice')
    expect(code).toContain('assetDependency')
    expect(code).toContain('throw new Error')
    expect(code).toContain('policyText')
    expect((node('strategy').config.inputs as Array<{ value: string }>).map(i => i.value)).toContain('{{preset.policy}}')
    expect((node('strategy').config.inputs as Array<{ value: string }>).map(i => i.value)).toContain('{{readBase.assets}}')
  })

  it('写作层：writerPick 按 videoType 映射 → writerCall(skill-call 动态 skillId) → writerMd → outlineReview', () => {
    // writerPick：映射代码与输入
    const pickCode = String(node('writerPick').config.code)
    expect(pickCode).toContain("'financial-deep': 'video-writer-investigative'")
    expect(pickCode).toContain("'video-writer-standard'")
    const pickInputs = (node('writerPick').config.inputs as Array<{ value: string }>).map(i => i.value)
    expect(pickInputs).toContain('{{start.videoType}}')
    expect(pickInputs).toContain('{{start.writerSkill}}')

    // writerCall：skill-call 节点，动态技能 id + 素材/背景/态度/角度注入
    const wc = node('writerCall')
    expect(wc.type).toBe('skill-call')
    expect((wc.config as { skillId: string }).skillId).toBe('{{writerPick.result.skillId}}')
    expect((wc.config as { providerConfigId: string }).providerConfigId).toBe('{{start.model.providerConfigId}}')
    const wcInputs = new Map((wc.config.inputs as Array<{ key: string; value: string }>).map(i => [i.key, i.value]))
    expect(wcInputs.get('material')).toBe('{{scriptSrc.result.text}}')
    expect(wcInputs.get('context')).toBe('{{kbText.result.text}}')
    expect(wcInputs.get('topic')).toBe('{{start.topic}}')
    expect(wcInputs.get('keyPoints')).toBe('{{start.keyPoints}}')
    expect(wcInputs.get('attitude')).toBe('{{start.writerAttitude}}')
    expect(wcInputs.get('angle')).toBe('{{start.writerAngle}}')

    // writerMd → outlineReview 绑定
    expect(String(node('writerMd').config.code)).toContain('md')
    expect(edgesOf('writerPick', 'writerCall')).toHaveLength(1)
    expect(edgesOf('writerCall', 'writerMd')).toHaveLength(1)
    expect(edgesOf('writerMd', 'outlineReview')).toHaveLength(1)
    expect((node('outlineReview').config.payload as { md: string }).md).toBe('{{writerMd.result.md}}')
    // 大纲审核后仍进拆镜（outlineReview → baseList → shotsGen）
    expect(edgesOf('outlineReview', 'baseList')).toHaveLength(1)
    expect(edgesOf('baseList', 'shotsGen')).toHaveLength(1)
  })

  it('shotsGen 提示词注入策略并约定 concept/imagery/assetIdx（大纲来源=outlineReview.md）', () => {
    const sp = String(node('shotsGen').config.systemPrompt)
    expect(sp).toContain('{{strategy.result.policyText}}')
    expect(sp).toContain('{{strategy.result.mode}}')
    expect(sp).toContain('{{outlineReview.md}}')
    expect(sp).toContain('imagery')
    expect(sp).toContain('assetIdx')
    expect(sp).toContain('{{strategy.result.baseCount}}')
  })

  it('splitShots 按 strategy.result.mode 分流；matItem/matBase 卡片带 mode/source', () => {
    const code = String(node('splitShots').config.code)
    expect(code).toContain('inputs.mode')
    expect(code).toContain('base.push')
    expect(code).toContain('gen.push')
    expect(String(node('matItem').config.code)).toContain("mode: 'imagery'")
    expect(String(node('matItem').config.code)).toContain("source: 'generated'")
    expect(String(node('matBase').config.code)).toContain("mode: 'asset'")
    expect(String(node('matBase').config.code)).toContain("'asset:' + srcId")
    expect(String(node('matBase').config.code)).toContain('baseAssetId')
    expect(String(node('boardMerge').config.code)).toContain('source ===')
  })

  it('素材板审核 payload 带 visualStrategy；两级审核 approve/reject→end 保留', () => {
    const payload = node('boardReview').config.payload as Record<string, unknown>
    expect(payload.visualStrategy).toBe('{{strategy.result.mode}}')
    expect(edgesOf('outlineReview', 'end', 'reject').length + edgesOf('boardReview', 'end', 'reject').length).toBeGreaterThanOrEqual(2)
    expect(edgesOf('boardReview', 'loopVideo', 'approve')).toHaveLength(1)
  })
})
