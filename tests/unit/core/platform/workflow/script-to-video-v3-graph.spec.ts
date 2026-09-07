/**
 * script-to-video-v3 内置图结构与语义校验
 * @module tests/unit/core/platform/workflow/script-to-video-v3-graph
 * @description V3（通用视觉策略 imagery/asset）生成器产物 JSON 的本地校验：
 *              - validateGraph 0 errors（图结构/端口/循环边合法）
 *              - start 含 visualStrategy 输入
 *              - strategy(code) 节点插在 preset→outlineGen 之间（auto 解析/素材门控/policyText）
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

describe('script-to-video-v3 图结构与语义', () => {
  it('validateGraph 0 errors（35 节点 / 39 边）', () => {
    const r = validateGraph({ version: 1, nodes: g.nodes, edges: g.edges })
    expect(r.errors).toEqual([])
    expect(g.nodes.length).toBe(35)
    expect(g.edges.length).toBe(39)
  })

  it('start 含 visualStrategy（auto/imagery/asset）', () => {
    const inputs = node('start').config.inputs as Array<{ key: string; type: string; options?: Array<{ value: string }> }>
    const vs = inputs.find(i => i.key === 'visualStrategy')
    expect(vs).toBeTruthy()
    expect(vs!.type).toBe('select')
    expect(vs!.options!.map(o => o.value)).toEqual(['auto', 'imagery', 'asset'])
  })

  it('strategy(code) 插在 preset→outlineGen 之间（原直连移除）', () => {
    expect(node('strategy').type).toBe('code')
    expect(edgesOf('preset', 'outlineGen')).toHaveLength(0)
    expect(edgesOf('preset', 'strategy')).toHaveLength(1)
    expect(edgesOf('strategy', 'outlineGen')).toHaveLength(1)
    const code = String(node('strategy').config.code)
    expect(code).toContain('choice')
    expect(code).toContain('assetDependency')
    expect(code).toContain('throw new Error')
    expect(code).toContain('policyText')
    expect((node('strategy').config.inputs as Array<{ value: string }>).map(i => i.value)).toContain('{{preset.policy}}')
    expect((node('strategy').config.inputs as Array<{ value: string }>).map(i => i.value)).toContain('{{readBase.assets}}')
  })

  it('shotsGen 提示词注入策略并约定 concept/imagery/assetIdx', () => {
    const sp = String(node('shotsGen').config.systemPrompt)
    expect(sp).toContain('{{strategy.result.policyText}}')
    expect(sp).toContain('{{strategy.result.mode}}')
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
    expect(String(node('matBase').config.code)).toContain("source: it.baseAssetId")
    expect(String(node('boardMerge').config.code)).toContain('source ===')
  })

  it('素材板审核 payload 带 visualStrategy；两级审核 approve/reject→end 保留', () => {
    const payload = node('boardReview').config.payload as Record<string, unknown>
    expect(payload.visualStrategy).toBe('{{strategy.result.mode}}')
    expect(edgesOf('outlineReview', 'end', 'reject').length + edgesOf('boardReview', 'end', 'reject').length).toBeGreaterThanOrEqual(2)
    expect(edgesOf('boardReview', 'loopVideo', 'approve')).toHaveLength(1)
  })
})
