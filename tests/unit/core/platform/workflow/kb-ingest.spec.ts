/**
 * kb-ingest 节点增强测试：知识库未选跳过 / sourceKey 幂等 upsert / passthrough 透传
 * @module tests/unit/core/platform/workflow/kb-ingest
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_NODE_HANDLERS } from '@core/platform/workflow/nodes/ai-nodes'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'

const kbIngestNode = AI_NODE_HANDLERS.find(h => h.type === 'kb-ingest')!

/** mock KnowledgeBaseService（避免真实数据库/向量化） */
const addDocumentMock = vi.fn()
vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: vi.fn().mockImplementation(() => ({
    addDocument: addDocumentMock,
    getDocuments: vi.fn(),
  })),
}))

beforeEach(() => {
  addDocumentMock.mockReset()
  addDocumentMock.mockResolvedValue({ success: true, data: { documentId: 'doc-1', isUpdate: false } })
})

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    runId: 'r1',
    runKey: 'r1:k1',
    nodeId: 'k1',
    nodeType: 'kb-ingest',
    iterationIndex: 0,
    config,
    startInputs: {},
    triggerInfo: {},
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    emitProgress: vi.fn(),
    resolveTemplate: (t: string) => t,
    getVariable: () => undefined,
  } as unknown as WorkflowNodeContext
}

describe('kb-ingest sourceKey / passthrough / 跳过', () => {
  it('知识库未选（模板解析为空）→ skipped，不调用 addDocument，passthrough 合并进输出', async () => {
    const result = await kbIngestNode.execute(makeCtx({
      knowledgeBaseId: '',
      title: '标题',
      content: '内容',
      passthrough: { title: '正文标题', text: '正文内容', url: 'https://a.com/x' },
    }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: Record<string, unknown> }).output
    expect(out.status).toBe('skipped')
    expect(out.documentId).toBe('')
    expect(out.title).toBe('正文标题')
    expect(out.text).toBe('正文内容')
    expect(addDocumentMock).not.toHaveBeenCalled()
  })

  it('sourceKey 传值 → addDocument 收到 workflow 来源（幂等 upsert）', async () => {
    const result = await kbIngestNode.execute(makeCtx({
      knowledgeBaseId: 'kb-1',
      title: '「早报采集」新闻标题',
      content: '正文…',
      sourceKey: 'https://a.com/news/1',
      waitForCompletion: false,
    }))
    expect(result.status).toBe('succeeded')
    expect((result as { output: Record<string, unknown> }).output.status).toBe('submitted')
    expect(addDocumentMock).toHaveBeenCalledWith('kb-1', {
      name: '「早报采集」新闻标题',
      type: 'text',
      content: '正文…',
      source: { type: 'workflow', id: 'https://a.com/news/1' },
    })
  })

  it('sourceKey 留空 → 不传 source（每次新建文档）', async () => {
    await kbIngestNode.execute(makeCtx({
      knowledgeBaseId: 'kb-1',
      title: '标题',
      content: '内容',
      waitForCompletion: false,
    }))
    expect(addDocumentMock).toHaveBeenCalledWith('kb-1', {
      name: '标题',
      type: 'text',
      content: '内容',
    })
  })

  it('validateConfig：passthrough 非对象报错', () => {
    const errors = kbIngestNode.validateConfig({ knowledgeBaseId: 'kb-1', title: 't', content: 'c', passthrough: [1] })
    expect(errors.length).toBeGreaterThan(0)
    expect(kbIngestNode.validateConfig({ knowledgeBaseId: 'kb-1', title: 't', content: 'c' })).toEqual([])
  })
})
