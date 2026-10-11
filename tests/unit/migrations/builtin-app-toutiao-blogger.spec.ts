/**
 * 头条博主文章采集（内置工作流）专项测试
 * @module tests/migrations/builtin-app-toutiao-blogger
 * @description 锁采集管线设计：① browser-read links 模式滚动加载博主主页文章列表
 *              ② loop 逐篇严格串行（loop-back 挂在 save 之后：存完一篇才读下一篇）
 *              ③ 每篇 browser-read article 模拟真人滚动到底取正文
 *              ④ save-asset 同名归组（跨运行合并）+ dedupeUrl 幂等去重
 *              ⑤ 汇总 + 完成通知
 */
import { describe, it, expect } from 'vitest'
import toutiaoBloggerRaw from '../../../src/core/database/migrations/builtin-apps/toutiao-blogger-collect.json'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'
import type { WorkflowGraph } from '@shared/types/workflow.types'

type Node = { id: string; type: string; name: string; config: Record<string, unknown> }
const graph = toutiaoBloggerRaw.graph as unknown as WorkflowGraph
const nodes: Node[] = (toutiaoBloggerRaw.graph as unknown as { nodes: Node[] }).nodes ?? []
const edges = (toutiaoBloggerRaw.graph as unknown as { edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; kind: string }> }).edges ?? []
const byId = (id: string): Node => {
  const n = nodes.find(x => x.id === id)
  expect(n, `找不到节点 ${id}`).toBeTruthy()
  return n as unknown as Node
}

describe('头条博主文章采集（拟人阅读采集管线）', () => {
  it('图结构通过校验（节点/边/类型/端口合法）', () => {
    const result = validateGraph(graph)
    if (!result.valid) throw new Error(result.errors.join('；'))
    expect(result.valid).toBe(true)
  })

  it('全部节点类型已注册（WORKFLOW_NODE_TYPES 常量表）', () => {
    const known = new Set(Object.values(WORKFLOW_NODE_TYPES))
    for (const n of nodes) expect(known.has(n.type as never), `${n.type} 未注册`).toBe(true)
  })

  it('start 输入：博主链接 + 博主名（集合名）+ 采集篇数上限', () => {
    const keys = ((byId('start').config.inputs ?? []) as Array<{ key: string }>).map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining(['bloggerUrl', 'bloggerName', 'maxArticles']))
    expect(keys.filter(k => k === 'bloggerUrl' || k === 'bloggerName').length).toBe(2)
  })

  it('列表采集：links 模式 + 头条文章正则 + 篇数联动 + 失败即停', () => {
    const listBr = byId('listBr')
    expect(listBr.type).toBe('browser-read')
    expect(listBr.config.mode).toBe('links')
    expect(String(listBr.config.linkPattern)).toContain('toutiao')
    expect(String(listBr.config.linkPattern)).toContain('article')
    expect(listBr.config.maxLinks).toBe('{{start.maxArticles}}')
    expect(listBr.config.url).toBe('{{start.bloggerUrl}}')
    expect(listBr.config.onError).toBe('fail')
  })

  it('循环严格串行：loop-back 从 save1 回到 loop（存完一篇才读下一篇）', () => {
    const loop = byId('loop1')
    expect(loop.type).toBe('loop')
    expect(loop.config.mode).toBe('foreach')
    expect(loop.config.listExpression).toBe('{{listBr.links}}')
    expect(loop.config.errorPolicy).toBe('skip')
    const kinds = (source: string, kind: string) =>
      edges.some(e => e.sourceNodeId === source && e.targetNodeId === 'loop1' && e.kind === kind)
    expect(kinds('save1', 'loop-back'), 'loop-back 必须从 save1 出发——保证逐篇串行').toBe(true)
    expect(edges.some(e => e.sourceNodeId === 'loop1' && e.kind === 'loop-body' && e.targetNodeId === 'readBr')).toBe(true)
    expect(edges.some(e => e.sourceNodeId === 'loop1' && e.kind === 'loop-done' && e.targetNodeId === 'summary1')).toBe(true)
  })

  it('逐篇阅读：article 模式 + 失败跳过（单篇失败不阻断整轮采集）', () => {
    const readBr = byId('readBr')
    expect(readBr.type).toBe('browser-read')
    expect(readBr.config.mode).toBe('article')
    expect(readBr.config.url).toBe('{{loop1.item.url}}')
    expect(readBr.config.onError).toBe('skip')
  })

  it('入库：同名归组 + 跨运行合并 + 幂等去重 + 有效性闸门', () => {
    const save1 = byId('save1')
    expect(save1.type).toBe('save-asset')
    expect(save1.config.kind).toBe('text')
    expect(save1.config.groupName).toBe('{{start.bloggerName}}')
    expect(String(save1.config.sourceRef)).toContain('toutiao-blogger:')
    expect(save1.config.dedupeUrl).toBe('{{loop1.item.url}}')
    expect(save1.config.enabled).toBe('{{guard1.result.ok}}')
    const guard1 = byId('guard1')
    expect(guard1.type).toBe('code')
    expect(String(guard1.config.code)).toContain('ok')
  })

  it('收尾：结果汇总 + 完成通知', () => {
    expect(byId('summary1').type).toBe('code')
    expect(String(byId('summary1').config.code)).toContain('deduped')
    const notify = byId('notify1')
    expect(notify.type).toBe('app-notify')
    expect(String(notify.config.message)).toContain('{{summary1.result.saved}}')
  })

  it('settings：长跑预算（逐篇慢读耗时远高于普通工作流）', () => {
    const settings = (toutiaoBloggerRaw as unknown as { settings: { maxDurationMs?: number; maxLoopIterations?: number } }).settings
    expect((settings.maxDurationMs ?? 0)).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000)
    expect((settings.maxLoopIterations ?? 0)).toBeGreaterThanOrEqual(100)
  })
})
