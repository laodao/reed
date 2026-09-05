/**
 * 吃瓜热点事件分析报告 内置工作流专项测试
 * @module tests/unit/core/platform/workflow/gossip-event-report
 * @description 校验工作流 JSON 的结构语义：输入声明、节点编排（搜索×2→合并→筛选→循环抓正文→
 *              结构化分析→按模板风格生成→长图→条件存库→存资产）、循环错误策略、
 *              动态 templateId/搜索引擎引用、以及全部变量引用可解析到上游节点输出。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
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

  it('start 输入：事件必填、风格提示词（非模板下拉）、搜索引擎动态源、模型', () => {
    const start = byId.get('start') as WorkflowNode
    const inputs = (start.config.inputs ?? []) as Array<{
      key: string; type: string; required?: boolean; defaultValue?: unknown; source?: string; options?: Array<{ value: string }>
    }>
    const byKey = new Map(inputs.map(i => [i.key, i]))
    expect(byKey.get('event')?.required).toBe(true)
    // 通用化：风格由提示词驱动，不再绑定预设视觉模板下拉
    const style = byKey.get('stylePrompt')!
    expect(style.type).toBe('textarea')
    expect(byKey.get('template')).toBeUndefined()
    const se = byKey.get('searchEngine')!
    expect(se.type).toBe('select-dynamic')
    expect(se.source).toBe('searchEngineConfigs')
    expect(byKey.get('model')?.type).toBe('model')
    // 繁简开关：默认简体（false）
    const trad = byKey.get('traditional')!
    expect(trad.type).toBe('boolean')
    expect(trad.defaultValue).toBe(false)
    // 自媒体平台多选 + 视频时长
    const platforms = byKey.get('platforms')!
    expect(platforms.type).toBe('select')
    expect(platforms.multi).toBe(true)
    expect(platforms.defaultValue).toEqual(['公众号'])
    const video = byKey.get('videoDuration')!
    expect(video.type).toBe('select')
    expect(video.defaultValue).toBe(60)
  })

  it('并行产出：analyze1 → parallel → 长图流/文案循环/脚本流 → merge2 汇合', () => {
    expect(byId.has('parallel1')).toBe(true)
    expect(byId.has('merge2')).toBe(true)
    const e = graph.edges
    expect(e.find(x => x.sourceNodeId === 'analyze1' && x.targetNodeId === 'parallel1')).toBeTruthy()
    // 三条并行分支
    expect(e.find(x => x.sourceNodeId === 'parallel1' && x.targetNodeId === 'gen1')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'parallel1' && x.targetNodeId === 'loop2')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'parallel1' && x.targetNodeId === 'script1')).toBeTruthy()
    // 文案循环（loop2）：body copyN→saveCopyN，done→merge2
    const copyLoop = configOf('loop2')
    expect(copyLoop.listExpression).toBe('{{start.platforms}}')
    expect(copyLoop.emptyPolicy).toBe('skip')
    expect(e.find(x => x.sourceNodeId === 'loop2' && x.targetNodeId === 'copyN' && x.kind === 'loop-body')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'saveCopyN' && x.targetNodeId === 'loop2' && x.kind === 'loop-back')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'loop2' && x.targetNodeId === 'merge2' && x.kind === 'loop-done')).toBeTruthy()
    // 三条流都汇合到 merge2，merge2→notify
    expect(e.filter(x => x.targetNodeId === 'merge2').length).toBe(3)
    expect(e.find(x => x.sourceNodeId === 'merge2' && x.targetNodeId === 'notify1')).toBeTruthy()
  })

  it('文案与脚本节点引用分析结果、平台、时长、风格与繁简', () => {
    const copy = configOf('copyN')
    expect(String(copy.prompt)).toContain('{{analyze1.parsed}}')
    expect(String(copy.systemPrompt)).toContain('{{loop2.item}}')
    expect(String(copy.systemPrompt)).toContain('{{start.stylePrompt}}')
    // 文案按平台有明确篇幅要求（防"太短"）
    expect(String(copy.systemPrompt)).toContain('1500-2500')
    expect(String(copy.systemPrompt)).toContain('600-1000')
    expect(String(copy.prompt)).toContain('扩写细节')
    const script = configOf('script1')
    expect(String(script.prompt)).toContain('{{analyze1.parsed}}')
    expect(String(script.systemPrompt)).toContain('{{start.videoDuration}}')
    expect(configOf('saveCopyN').subCategory).toBe('自媒体文案')
    expect(configOf('saveScript1').subCategory).toBe('短视频脚本')
  })

  it('gen1 提示词：按风格提示词驱动（无预设模板条目）+ 含繁简规则 + 长图排版结构（icon/卡片/表格）', () => {
    const gen = configOf('gen1')
    const sp = String(gen.systemPrompt)
    expect(sp).toContain('{{start.stylePrompt}}')
    expect(sp).toContain('{{start.traditional}}')
    expect(sp).toContain('默认用简体字')
    // 长图视觉要求：emoji 章节图标、引用块要点卡片、表格、禁 HTML（配色由通用排版 CSS 承担）
    expect(sp).toContain('长图排版结构')
    expect(sp).toContain('emoji')
    expect(sp).toContain('引用块')
    expect(sp).toContain('markdown 表格')
    expect(sp).toContain('HTML')
    // 已移除预设视觉模板条目（通用化）
    expect(sp).not.toContain('gossipMinguo')
    expect(sp).not.toContain('gossipInfographic')
    expect(String(gen.prompt)).toContain('{{start.stylePrompt}}')
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
    expect(String(gen.systemPrompt)).not.toContain('gossipTabloid')
  })

  it('长图节点：用通用排版（generic），标题带事件名', () => {
    const report = configOf('report1')
    expect(report.templateId).toBe('generic')
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
