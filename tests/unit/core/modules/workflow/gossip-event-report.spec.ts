/**
 * 吃瓜热点事件分析报告 内置工作流专项测试
 * @module tests/unit/core/modules/workflow/gossip-event-report
 * @description 校验工作流 JSON 的结构语义：输入声明、节点编排（搜索×2→合并→筛选→循环抓正文→
 *              结构化分析→按模板风格生成→长图→条件存库→存资产）、循环错误策略、
 *              动态 templateId/搜索引擎引用、以及全部变量引用可解析到上游节点输出。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'

const raw = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/gossip-event-report.json'),
  'utf-8'
)) as { name: string; graph: WorkflowGraph }

const graph = raw.graph
const byId = new Map(graph.nodes.map(n => [n.id, n]))
const configOf = (id: string): Record<string, unknown> => byId.get(id)?.config ?? {}

describe('吃瓜热点事件分析报告 工作流', () => {
  it('通过结构校验（validateGraph）', () => {
    const result = validateGraph(graph)
    expect(result.valid, result.errors.join('；')).toBe(true)
  })

  it('start 输入：事件必填、模板下拉（默认娱乐小报风）、搜索引擎动态源、模型', () => {
    const start = byId.get('start') as WorkflowNode
    const inputs = (start.config.inputs ?? []) as Array<{
      key: string; type: string; required?: boolean; defaultValue?: unknown; source?: string; options?: Array<{ value: string }>
    }>
    const byKey = new Map(inputs.map(i => [i.key, i]))
    expect(byKey.get('event')?.required).toBe(true)
    const template = byKey.get('template')!
    expect(template.type).toBe('select')
    expect(template.defaultValue).toBe('gossipMinguo')
    const values = (template.options ?? []).map(o => o.value)
    expect(values).toContain('gossipMinguo')
    expect(values).toContain('gossipInfographic')
    expect(values).toContain('gossipHK')
    expect(values).toContain('gossipTabloid')
    expect(values).toContain('gossipTimeline')
    expect(values).toContain('gossipArticle')
    for (const v of values) {
      expect(NODE_TYPE_CATALOG_MAP['report-image']).toBeDefined() // 模板有效性由 document-templates.spec 校验
      void v
    }
    const se = byKey.get('searchEngine')!
    expect(se.type).toBe('select-dynamic')
    expect(se.source).toBe('searchEngineConfigs')
    expect(byKey.get('model')?.type).toBe('model')
  })

  it('搜索×2 都引用 start.searchEngine 配置，且两次查询角度互补', () => {
    const s1 = configOf('search1')
    const s2 = configOf('search2')
    expect(s1.query).toContain('{{start.event}}')
    expect(s2.query).toContain('{{start.event}}')
    expect(String(s2.query)).not.toBe(String(s1.query))
    expect(s1.searchConfigId).toBe('{{start.searchEngine}}')
    expect(s2.searchConfigId).toBe('{{start.searchEngine}}')
  })

  it('循环节点配置了空列表与迭代错误策略（skip）', () => {
    const loop = configOf('loop1')
    expect(loop.listExpression).toBe('{{pick1.parsed}}')
    expect(loop.emptyPolicy).toBe('skip')
    expect(loop.errorPolicy).toBe('skip')
    // 循环体抓正文同样 onError=skip（双保险：单篇失败不中断）
    const extract = configOf('extract1')
    expect(extract.url).toBe('{{loop1.item.url}}')
    expect(extract.onError).toBe('skip')
  })

  it('结构化分析与生成节点拆分：analyze1 输出 JSON，gen1 按模板风格写作', () => {
    expect(configOf('analyze1').jsonMode).toBe(true)
    expect(configOf('pick1').jsonMode).toBe(true)
    const gen = configOf('gen1')
    expect(String(gen.prompt)).toContain('{{analyze1.parsed}}')
    expect(String(gen.systemPrompt)).toContain('gossipTabloid')
  })

  it('长图节点：templateId 动态引用 start.template，标题带事件名', () => {
    const report = configOf('report1')
    expect(report.templateId).toBe('{{start.template}}')
    expect(String(report.title)).toContain('{{start.event}}')
    expect(String(report.template)).toContain('{{gen1.content}}')
  })

  it('知识库入库有条件分支保护（kbId 为空不触发 kb-ingest 必填校验）', () => {
    const cond = configOf('cond1')
    const branches = (cond.branches ?? []) as Array<{ branchId: string; conditions: Array<{ left: string; operator: string }> }>
    const hasKb = branches.find(b => b.branchId === 'hasKb')
    const noKb = branches.find(b => b.branchId === 'noKb')
    expect(hasKb?.conditions[0]).toMatchObject({ left: '{{start.kbId}}', operator: 'not_empty' })
    expect(noKb?.conditions[0]).toMatchObject({ left: '{{start.kbId}}', operator: 'is_empty' })
    // 分支出边正确
    const edges = graph.edges.filter(e => e.sourceNodeId === 'cond1')
    expect(edges.find(e => e.branchId === 'hasKb')?.targetNodeId).toBe('saveKb1')
    expect(edges.find(e => e.branchId === 'noKb')?.targetNodeId).toBe('save1')
  })

  it('报告保存为资产：subCategory=吃瓜报告（与资产分类一致）', () => {
    const save = configOf('save1')
    expect(save.subCategory).toBe('吃瓜报告')
    expect(save.category).toBe('text')
    expect(String(save.content)).toContain('{{report1.markdown}}')
  })

  it('全部变量引用可解析：节点存在 + 字段在目录输出中（{{start.xx}} 按输入展开）', () => {
    const varRef = /{{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)}}/g
    const seen = new Set<string>()
    const collect = (obj: unknown, nodeId: string) => {
      if (typeof obj === 'string') {
        for (const m of obj.matchAll(varRef)) {
          const [, srcNode, field] = m
          if (srcNode === 'sys') continue // 系统变量（sys.today）
          const key = `${nodeId}->${srcNode}.${field}`
          if (seen.has(key)) continue
          seen.add(key)
          if (srcNode === 'start') {
            const inputs = (byId.get('start')?.config.inputs ?? []) as Array<{ key: string }>
            expect(inputs.some(i => i.key === field), `start 缺输入 ${field}（引用自 ${nodeId}）`).toBe(true)
            continue
          }
          expect(byId.has(srcNode), `${nodeId} 引用了不存在的节点 ${srcNode}`).toBe(true)
          if (!byId.has(srcNode)) continue
          const schema = NODE_TYPE_CATALOG_MAP[byId.get(srcNode)!.type]?.outputSchema ?? []
          const hasField = schema.some(f => f.key === field) || schema.some(f => f.key === '*')
          expect(hasField, `${nodeId} 引用 ${srcNode}.${field} 不在目录输出中`).toBe(true)
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(v => collect(v, nodeId))
      } else if (obj && typeof obj === 'object') {
        for (const v of Object.values(obj)) collect(v, nodeId)
      }
    }
    for (const node of graph.nodes) collect(node.config, node.id)
    // 关键链路引用必须真实存在（防误删节点后静默失效）
    expect(seen.size).toBeGreaterThan(20)
    expect(seen.has('merge1->search1.results') || seen.has('merge1->search2.results')).toBe(true)
    expect(seen.has('gen1->analyze1.parsed')).toBe(true)
    expect(seen.has('report1->gen1.content')).toBe(true)
  })
})
