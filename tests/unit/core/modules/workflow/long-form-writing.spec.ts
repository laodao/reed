/**
 * 长文写作 内置工作流专项测试
 * @module tests/unit/core/modules/workflow/long-form-writing
 * @description 校验分阶段写长文工作流的结构语义：storyline → outline(jsonMode 章节数组) →
 *              loop 逐章 → code 拼接 → 条件存库/存资产；settings.multiTurn=true（多轮对话承接前文）；
 *              章节节点引用故事线/大纲/当前章节，拼接引用 {{loop1.results}}。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'

const raw = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/long-form-writing.json'),
  'utf-8'
)) as { name: string; settings: Record<string, unknown>; graph: WorkflowGraph }

const graph = raw.graph
const byId = new Map(graph.nodes.map(n => [n.id, n]))
const configOf = (id: string): Record<string, unknown> => byId.get(id)?.config ?? {}

describe('长文写作 工作流', () => {
  it('通过结构校验（validateGraph）', () => {
    const result = validateGraph(graph)
    expect(result.valid, result.errors.join('；')).toBe(true)
  })

  it('settings.multiTurn=true（多轮对话承接前文）', () => {
    expect(raw.settings.multiTurn).toBe(true)
  })

  it('start 输入：主题必填、设定/章节数/字数/文风/繁简', () => {
    const start = byId.get('start') as WorkflowNode
    const inputs = (start.config.inputs ?? []) as Array<{ key: string; type: string; required?: boolean; options?: Array<{ value: string }> }>
    const byKey = new Map(inputs.map(i => [i.key, i]))
    expect(byKey.get('topic')?.required).toBe(true)
    expect(byKey.get('chapterCount')?.type).toBe('number')
    expect(byKey.get('wordCountPerChapter')?.type).toBe('number')
    expect(byKey.get('style')?.type).toBe('select')
    expect(byKey.get('traditional')?.defaultValue).toBe(false)
    expect(byKey.get('model')?.type).toBe('model')
    expect(byKey.get('kbId')?.type).toBe('select-dynamic')
  })

  it('主线节点链：storyline → outline → loop1 → concat1 → 存库/存资产', () => {
    const e = graph.edges
    expect(e.find(x => x.sourceNodeId === 'start' && x.targetNodeId === 'storyline')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'storyline' && x.targetNodeId === 'outline')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'outline' && x.targetNodeId === 'loop1')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'loop1' && x.targetNodeId === 'concat1' && x.kind === 'loop-done')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'concat1' && x.targetNodeId === 'cond1')).toBeTruthy()
    // 知识库分支：hasKb→saveKb1，noKb→save1，saveKb1 也汇入 save1
    expect(e.find(x => x.sourceNodeId === 'cond1' && x.branchId === 'hasKb')?.targetNodeId).toBe('saveKb1')
    expect(e.find(x => x.sourceNodeId === 'cond1' && x.branchId === 'noKb')?.targetNodeId).toBe('save1')
    expect(e.find(x => x.sourceNodeId === 'saveKb1' && x.targetNodeId === 'save1')).toBeTruthy()
  })

  it('loop 逐章：listExpression=大纲章节数组，body=chapter(loop-body/loop-back)', () => {
    const loop = configOf('loop1')
    expect(loop.listExpression).toBe('{{outline.parsed}}')
    expect(loop.emptyPolicy).toBe('skip')
    const e = graph.edges
    expect(e.find(x => x.sourceNodeId === 'loop1' && x.targetNodeId === 'chapter' && x.kind === 'loop-body')).toBeTruthy()
    expect(e.find(x => x.sourceNodeId === 'chapter' && x.targetNodeId === 'loop1' && x.kind === 'loop-back')).toBeTruthy()
    // chapter 是循环体内的 llm-chat
    const chapter = byId.get('chapter')!
    expect(chapter.type).toBe('llm-chat')
  })

  it('storyline 输入设定与风格；outline 引用故事线 + jsonMode', () => {
    const sl = String(configOf('storyline').prompt)
    expect(sl).toContain('{{start.topic}}')
    expect(sl).toContain('{{start.premise}}')
    expect(sl).toContain('{{start.style}}')
    const outline = configOf('outline')
    expect(outline.jsonMode).toBe(true)
    expect(String(outline.prompt)).toContain('{{storyline.content}}')
    expect(String(outline.prompt)).toContain('{{start.chapterCount}}')
  })

  it('chapter 引用故事线/大纲/当前章节(loop.item)/字数/繁简，且 systemPrompt 强调承接前文', () => {
    const chapter = configOf('chapter')
    const sp = String(chapter.systemPrompt)
    const p = String(chapter.prompt)
    expect(p).toContain('{{storyline.content}}')
    expect(p).toContain('{{outline.parsed}}')
    expect(p).toContain('{{loop1.item.title}}')
    expect(p).toContain('{{loop1.item.summary}}')
    expect(p).toContain('{{loop1.index}}')
    expect(p).toContain('{{start.wordCountPerChapter}}')
    expect(sp).toContain('{{start.traditional}}')
    expect(sp).toContain('承接前文')
  })

  it('拼接节点：code 引用 {{loop1.results}}，输出长文 result', () => {
    const concat = configOf('concat1')
    expect(concat.language).toBe('js')
    expect(String(concat.code)).toContain('inputs.chapters')
    const inputsArr = concat.inputs as Array<{ key: string; value: string }>
    expect(inputsArr.find(i => i.key === 'chapters')?.value).toBe('{{loop1.results}}')
    expect(inputsArr.find(i => i.key === 'title')?.value).toBe('{{start.topic}}')
  })

  it('保存：subCategory=长文写作；知识库入库引用拼接结果', () => {
    expect(configOf('save1').subCategory).toBe('长文写作')
    expect(String(configOf('save1').content)).toContain('{{concat1.result}}')
    expect(configOf('saveKb1').content).toBe('{{concat1.result}}')
  })

  it('全部变量引用可解析：节点存在 + 字段在目录输出中；关键链路存在', () => {
    const varRef = /{{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)}}/g
    const seen = new Set<string>()
    const collect = (obj: unknown, nodeId: string) => {
      if (typeof obj === 'string') {
        for (const m of obj.matchAll(varRef)) {
          const [, srcNode, field] = m
          if (srcNode === 'sys') continue
          const key = `${nodeId}->${srcNode}.${field}`
          if (seen.has(key)) continue
          seen.add(key)
          if (srcNode === 'start') {
            const inputs = (byId.get('start')?.config.inputs ?? []) as Array<{ key: string }>
            expect(inputs.some(i => i.key === field), `start 缺输入 ${field}（引用自 ${nodeId}）`).toBe(true)
            continue
          }
          expect(byId.has(srcNode), `${nodeId} 引用不存在的节点 ${srcNode}`).toBe(true)
          if (!byId.has(srcNode)) continue
          const schema = NODE_TYPE_CATALOG_MAP[byId.get(srcNode)!.type]?.outputSchema ?? []
          expect(schema.some(f => f.key === field), `${nodeId} 引用 ${srcNode}.${field} 不在目录输出中`).toBe(true)
        }
      } else if (Array.isArray(obj)) obj.forEach(v => collect(v, nodeId))
      else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) collect(v, nodeId)
    }
    for (const node of graph.nodes) collect(node.config, node.id)
    expect(seen.has('storyline->start.topic')).toBe(true)
    expect(seen.has('outline->storyline.content')).toBe(true)
    expect(seen.has('concat1->loop1.results')).toBe(true)
    // 三级路径（如 {{loop1.item.title}}）不被二级正则捕获，已由「chapter 引用当前章节」专项断言覆盖
  })
})
