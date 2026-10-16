/**
 * 日记周报复盘内置流模板测试（spec 2026-09-24 日记增强 P1）
 * @module tests/unit/core/platform/workflow/diary-weekly-review-graph
 * @description 锁定 diary-weekly-review.json 的图契约：
 *              start → collect1(collect-diary) → llm1(llm-chat) → review1(human-review)
 *              → diary1(save-diary) → end；模板引用关系与人工确认环节不被后续改版破坏。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface GraphNode {
  id: string
  type: string
  config: Record<string, unknown>
}
interface GraphEdge {
  sourceNodeId: string
  targetNodeId: string
  kind: string
}

function loadGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const raw = readFileSync(
    resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/diary-weekly-review.json'),
    'utf-8'
  )
  const parsed = JSON.parse(raw) as { graph: { nodes: GraphNode[]; edges: GraphEdge[] } }
  return parsed.graph
}

describe('日记周报复盘内置流模板（diary-weekly-review.json）', () => {
  const graph = loadGraph()
  const byId = Object.fromEntries(graph.nodes.map(n => [n.id, n]))

  it('节点集合：6 节点（start/collect/llm/review/save-diary/end）', () => {
    expect(graph.nodes.map(n => n.id).sort()).toEqual(['collect1', 'diary1', 'end', 'llm1', 'review1', 'start'])
    expect(byId['collect1'].type).toBe('collect-diary')
    expect(byId['llm1'].type).toBe('llm-chat')
    expect(byId['review1'].type).toBe('human-review')
    expect(byId['diary1'].type).toBe('save-diary')
  })

  it('边：review1 人工确认分流（approve → diary1，reject → end）', () => {
    const approve = graph.edges.find(e => e.sourceNodeId === 'review1' && e.kind === 'approve')
    const reject = graph.edges.find(e => e.sourceNodeId === 'review1' && e.kind === 'reject')
    expect(approve?.targetNodeId).toBe('diary1')
    expect(reject?.targetNodeId).toBe('end')
    // 主链路顺序
    const chain = ['start', 'collect1', 'llm1', 'review1']
    for (let i = 0; i < chain.length - 1; i++) {
      expect(graph.edges.some(e => e.sourceNodeId === chain[i] && e.targetNodeId === chain[i + 1])).toBe(true)
    }
  })

  it('collect1 引用 start 时间窗输入；folderId 透传 sourceFolderId', () => {
    const cfg = byId['collect1'].config as Record<string, string>
    expect(cfg.startDate).toBe('{{start.startDate}}')
    expect(cfg.endDate).toBe('{{start.endDate}}')
    expect(cfg.days).toBe('{{start.days}}')
    expect(cfg.folderId).toBe('{{start.sourceFolderId}}')
  })

  it('llm1 提示词含三段式复盘结构，引用 collect1 素材，模型来自 start', () => {
    const cfg = byId['llm1'].config as Record<string, string>
    expect(cfg.systemPrompt).toContain('发生了什么')
    expect(cfg.systemPrompt).toContain('学到了什么')
    expect(cfg.systemPrompt).toContain('下周关注什么')
    expect(cfg.prompt).toContain('{{collect1.content}}')
    expect(cfg.providerConfigId).toBe('{{start.model.providerConfigId}}')
    expect(cfg.modelId).toBe('{{start.model.modelId}}')
  })

  it('start 输入完整：时间窗（days/起止日期）、目录（源/目标）、标题、模型', () => {
    const inputs = (byId['start'].config as { inputs: Array<{ key: string; type: string }> }).inputs
    const keys = inputs.map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining(['days', 'startDate', 'endDate', 'sourceFolderId', 'folderId', 'title', 'model']))
    expect(inputs.find(i => i.key === 'model')?.type).toBe('model')
    expect(inputs.find(i => i.key === 'days')?.defaultValue).toBe('7')
  })

  it('save-diary 落库引用 review1 可编辑产出与 start 标题/目录', () => {
    const cfg = byId['diary1'].config as Record<string, string>
    expect(cfg.content).toBe('{{review1.output_result}}')
    expect(cfg.title).toBe('{{start.title}}')
    expect(cfg.folderId).toBe('{{start.folderId}}')
  })
})
