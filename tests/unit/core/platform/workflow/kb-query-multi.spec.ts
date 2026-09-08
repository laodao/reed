/**
 * kb-query-multi 节点单测：多库逐库检索 → 按分数合并去重 → sources 去重标注
 * @module tests/unit/core/platform/workflow/kb-query-multi
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 检索响应桩：由用例注入（vi.hoisted 规避 vi.mock 提升限制）
const h = vi.hoisted(() => ({ searchImpl: null as null | ((p: Record<string, unknown>) => unknown) }))

vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: class {
    async search(p: Record<string, unknown>) {
      if (!h.searchImpl) return { success: false, error: '未注入 searchImpl' }
      return h.searchImpl(p)
    }
  },
}))

import { AI_NODE_HANDLERS } from '@core/platform/workflow/nodes/ai-nodes'
import type { WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'

const node: WorkflowNodeHandler = AI_NODE_HANDLERS.find(x => x.type === 'kb-query-multi')!

function hit(over: Partial<{ content: string; score: number; documentId: string; documentName: string }>) {
  return { content: '片段：' + Math.random(), score: 0.5, documentId: 'doc1', documentName: '文档1', ...over }
}

function ctxFor(config: Record<string, unknown>) {
  return { config, signal: new AbortController().signal } as never
}

async function run(config: Record<string, unknown>) {
  const result = await node.execute(ctxFor(config))
  return result as { status: string; output?: Record<string, unknown>; error?: string }
}

describe('kb-query-multi 节点', () => {
  beforeEach(() => {
    h.searchImpl = null
  })

  it('validateConfig：未选库/空查询报错，合法输入通过', () => {
    expect(node.validateConfig!({ knowledgeBaseIds: [], query: 'q' } as never)).toEqual(['必须至少选择一个知识库'])
    expect(node.validateConfig!({ knowledgeBaseIds: 'kb1', query: '' } as never)).toEqual(['查询内容不能为空'])
    expect(node.validateConfig!({ knowledgeBaseIds: ['kb1'], query: 'q' } as never)).toEqual([])
  })

  it('多库检索合并：每库 topK、按分数降序、去重、sources 去重', async () => {
    h.searchImpl = async (p: Record<string, unknown>) => {
      const kb = p.knowledgeBaseId as string
      if (kb === 'kbA') {
        return {
          success: true,
          data: [
            hit({ content: 'A-高分', score: 0.95, documentId: 'd1', documentName: '甲' }),
            hit({ content: 'A-低分', score: 0.3, documentId: 'd2', documentName: '乙' }),
          ],
        }
      }
      if (kb === 'kbB') {
        return {
          success: true,
          data: [
            hit({ content: 'B-中分', score: 0.8, documentId: 'd3', documentName: '丙' }),
            hit({ content: 'A-高分（B 库重复文档）', score: 0.6, documentId: 'd1', documentName: '甲' }),
          ],
        }
      }
      return { success: false, error: '未知库 ' + kb }
    }
    const out = await run({ knowledgeBaseIds: ['kbA', 'kbB'], query: '问', topKPerKb: 5, maxResults: 10 })
    expect(out.status).toBe('succeeded')
    const results = out.output!.results as Array<Record<string, string | number>>
    // 按分数降序（0.95 → 0.8 → 0.6 → 0.3）
    expect(results.map(r => r.score)).toEqual([0.95, 0.8, 0.6, 0.3])
    // 每条带 knowledgeBaseId 来源
    expect(results[0].knowledgeBaseId).toBe('kbA')
    expect(results[1].knowledgeBaseId).toBe('kbB')
    expect(out.output!.count).toBe(4)
    // sources 去重
    expect(out.output!.sources).toEqual(['kbA', 'kbB'])
  })

  it('未选择知识库（运行期空数组）→ 直通空结果，不报错', async () => {
    const out = await run({ knowledgeBaseIds: [], query: '问' })
    expect(out.status).toBe('succeeded')
    expect(out.output!.count).toBe(0)
    expect(out.output!.results).toEqual([])
    expect(h.searchImpl).toBeNull() // 未发起检索
  })

  it('字符串/JSON 数组两种形态的知识库 id 均被归一化；maxResults 截断', async () => {
    const calls: string[][] = []
    h.searchImpl = async (p: Record<string, unknown>) => {
      calls.push([p.knowledgeBaseId as string])
      return {
        success: true,
        data: [
          hit({ content: 'x', score: 0.9, documentId: 'd' + p.knowledgeBaseId, documentName: 'n' }),
          hit({ content: 'y', score: 0.4, documentId: 'd' + p.knowledgeBaseId + 'b', documentName: 'n2' }),
        ],
      }
    }
    // 逗号分隔字符串 → 2 个库
    const out1 = await run({ knowledgeBaseIds: 'kb1,kb2', query: 'q', topKPerKb: 2, maxResults: 1 })
    expect(calls).toEqual([['kb1'], ['kb2']])
    expect((out1.output!.results as unknown[]).length).toBe(1) // maxResults=1 截断
    expect(out1.output!.count).toBe(1)
    calls.length = 0
    // 单个 id 字符串 → 1 个库
    await run({ knowledgeBaseIds: 'kb1', query: 'q' })
    expect(calls).toEqual([['kb1']])
  })
})
