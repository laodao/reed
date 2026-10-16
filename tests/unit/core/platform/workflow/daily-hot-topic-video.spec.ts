/**
 * 每日热点自动成片 内置工作流专项测试
 * @module tests/unit/core/platform/workflow/daily-hot-topic-video
 * @description 校验工作流 JSON 的结构语义：cron 触发器、邮箱账号输入默认值、邮件搜索/读取工具、
 *              list-check 选题表单、逐主题循环（吃瓜子工作流 → 视频闸门 → 短视频V3 子工作流）、
 *              以及全部变量引用可解析到上游节点输出。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type { WorkflowGraph, WorkflowNode, WorkflowTrigger } from '@shared/types/workflow.types'

const raw = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/daily-hot-topic-video.json'),
  'utf-8'
)) as { name: string; graph: WorkflowGraph; triggers: WorkflowTrigger[] }

const graph = raw.graph
const byId = new Map(graph.nodes.map(n => [n.id, n]))
const configOf = (id: string): Record<string, unknown> => byId.get(id)?.config ?? {}

describe('每日热点自动成片 工作流', () => {
  it('通过结构校验（validateGraph）', () => {
    const result = validateGraph(graph)
    expect(result.valid, result.errors.join('；')).toBe(true)
  })

  it('cron 触发器：每天早上 7:35（热点邮件约 7:19 送达之后）、默认启用', () => {
    const crons = raw.triggers.filter(t => t.type === 'cron') as Array<Extract<WorkflowTrigger, { type: 'cron' }>>
    expect(crons.length).toBe(1)
    expect(crons[0].expression).toBe('35 7 * * *')
    expect(crons[0].enabled).toBe(true)
  })

  it('start 输入：邮箱账号默认 254400283@qq.com，模型/配音等均为可选（定时触发无表单也能跑）', () => {
    const start = byId.get('start') as WorkflowNode
    const inputs = (start.config.inputs ?? []) as Array<{ key: string; type: string; required?: boolean; defaultValue?: unknown; source?: string }>
    const byKey = new Map(inputs.map(i => [i.key, i]))
    expect(byKey.get('emailAccount')?.defaultValue).toBe('254400283@qq.com')
    for (const key of ['model', 'ttsVoiceId', 'ttsVoiceProvider', 'imageProvider', 'stockCredentialId', 'subjectKeyword']) {
      expect(byKey.get(key)?.required ?? false, `${key} 应为可选输入`).toBe(false)
    }
    expect(byKey.get('ttsVoiceProvider')?.source).toBe('providerConfigs')
    expect(byKey.get('imageProvider')?.source).toBe('providerConfigs')
    expect(byKey.get('stockCredentialId')?.source).toBe('credentials')
  })

  it('邮件搜索/读取走 email 预设工具，账号来自 start.emailAccount', () => {
    const search = configOf('mailSearch')
    expect(search.toolType).toBe('preset')
    expect(search.toolId).toBe('preset:email-search')
    const searchParams = (search.params ?? []) as Array<{ key: string; value: string }>
    expect(searchParams.find(p => p.key === 'accountId')?.value).toBe('{{start.emailAccount}}')
    expect(searchParams.find(p => p.key === 'since')?.value).toBe('{{sys.today}}')
    const read = configOf('mailRead')
    expect(read.toolId).toBe('preset:email-read')
    const readParams = (read.params ?? []) as Array<{ key: string; value: string }>
    expect(readParams.find(p => p.key === 'uid')?.value).toBe('{{pickMail.parsed.uid}}')
  })

  it('选题表单：list-check 多选勾选（数据源=AI 提取的话题清单），approve/reject 边齐备', () => {
    const form = configOf('topicForm')
    const fields = (form.fields ?? []) as Array<{ key: string; type: string; source?: string; itemKey?: string }>
    const topics = fields.find(f => f.key === 'topics')
    expect(topics?.type).toBe('list-check')
    expect(topics?.source).toBe('{{topicsExtract.parsed.topics}}')
    expect(topics?.itemKey).toBe('{{item.title}}')
    const edges = graph.edges.filter(e => e.sourceNodeId === 'topicForm')
    expect(edges.find(e => e.kind === 'approve')?.targetNodeId).toBe('selectPrep')
    expect(edges.find(e => e.kind === 'reject')?.targetNodeId).toBe('cancelMsg')
  })

  it('逐主题循环：body=吃瓜子流程→视频闸门，两个子工作流 ID 正确、脚本经 message 输出传递', () => {
    const loop = configOf('topicLoop')
    expect(loop.listExpression).toBe('{{selectPrep.result.selected}}')
    expect(loop.errorPolicy).toBe('skip')
    expect(graph.edges.find(e => e.sourceNodeId === 'topicLoop' && e.targetNodeId === 'gossipSub' && e.kind === 'loop-body')).toBeTruthy()
    expect(graph.edges.find(e => e.targetNodeId === 'topicLoop' && e.kind === 'loop-back')?.sourceNodeId).toBeDefined()
    expect(graph.edges.find(e => e.sourceNodeId === 'topicLoop' && e.targetNodeId === 'doneMsg' && e.kind === 'loop-done')).toBeTruthy()

    const gossip = configOf('gossipSub')
    expect(gossip.definitionId).toBe('builtin_def_gossip-event-report')
    const gossipInputs = (gossip.inputs ?? []) as Array<{ key: string; value: string }>
    expect(gossipInputs.find(p => p.key === 'event')?.value).toBe('{{topicLoop.item.title}}')

    const v3 = configOf('v3Sub')
    expect(v3.definitionId).toBe('builtin_def_script-to-video-v3')
    const v3Inputs = (v3.inputs ?? []) as Array<{ key: string; value: string }>
    expect(v3Inputs.find(p => p.key === 'scriptSource')?.value).toBe('text')
    expect(v3Inputs.find(p => p.key === 'scriptText')?.value).toBe('{{gossipSub.result}}')
  })

  it('视频闸门：脚本与 模型/配音音色/配音Provider/文生图Provider 全配齐才生成视频', () => {
    const gate = configOf('v3Gate')
    const branches = (gate.branches ?? []) as Array<{ branchId: string; conditions: Array<{ left: string; operator: string }> }>
    const make = branches.find(b => b.branchId === 'make')
    const lefts = (make?.conditions ?? []).map(c => c.left)
    expect(make?.conditions.every(c => c.operator === 'not_empty')).toBe(true)
    expect(lefts).toContain('{{gossipSub.result}}')
    expect(lefts).toContain('{{start.model}}')
    expect(lefts).toContain('{{start.ttsVoiceId}}')
    expect(lefts).toContain('{{start.ttsVoiceProvider}}')
    expect(lefts).toContain('{{start.imageProvider}}')
    const edges = graph.edges.filter(e => e.sourceNodeId === 'v3Gate')
    expect(edges.find(e => e.branchId === 'make')?.targetNodeId).toBe('v3Sub')
    expect(edges.find(e => e.branchId === 'skip')?.targetNodeId).toBe('skipVideoMsg')
  })

  it('全部变量引用可解析：节点存在 + 字段在目录输出中（{{start.xx}} 按输入展开）', () => {
    const varRef = /{{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)}}/g
    const seen = new Set<string>()
    const collect = (obj: unknown, nodeId: string) => {
      if (typeof obj === 'string') {
        for (const m of obj.matchAll(varRef)) {
          const [, srcNode, field] = m
          if (srcNode === 'sys' || srcNode === 'item') continue // 系统变量 / list-check 行内伪变量
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
    expect(seen.size).toBeGreaterThan(10)
    expect(seen.has('mailPick->mailSearch.json')).toBe(true)
    expect(seen.has('v3Gate->gossipSub.result')).toBe(true)
    expect(seen.has('v3Sub->gossipSub.result')).toBe(true)
    expect(seen.has('doneMsg->topicLoop.count')).toBe(true)
  })
})
