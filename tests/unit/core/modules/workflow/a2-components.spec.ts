/**
 * A2 组件测试：kb-qa（RAG 一体）+ report（markdown/docx 报告）
 * @module tests/workflow/a2-components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock 依赖（KB 检索 / AI 调用 / docx / 路径） ----
const kbSearchMock = vi.fn()
vi.mock('@core/services/knowledge-base.service', () => ({
  KnowledgeBaseService: class {
    search = (...a: any[]) => kbSearchMock(...a)
  },
}))
const callAIStreamMock = vi.fn()
vi.mock('@core/services/ai-call', () => ({ callAIStream: (...a: any[]) => callAIStreamMock(...a) }))
const markdownToDocxMock = vi.fn()
vi.mock('@core/utils/markdown-to-docx', () => ({ markdownToDocx: (...a: any[]) => markdownToDocxMock(...a) }))
const dataPath = 'C:/test-data'
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => dataPath }),
}))

// fs 真实写（写到临时目录由 mock 路径控制）；拦截写盘校验参数即可
const fsWriteMock = vi.fn()
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, mkdirSync: vi.fn(), writeFileSync: (...a: any[]) => fsWriteMock(...a) }
})

import { EXTRA_NODE_HANDLERS } from '@core/modules/workflow/nodes/extra-nodes'
import { A2_NODE_HANDLERS } from '@core/modules/workflow/nodes/a2-nodes'
import { createFullNodeRegistry } from '@core/modules/workflow/nodes'
import { checkRegistryConsistency } from '@core/modules/workflow/engine/node-registry'
import type { WorkflowNodeContext } from '@core/modules/workflow/engine/node-handler'

const makeCtx = (config: Record<string, unknown>, extra: Partial<WorkflowNodeContext> = {}): WorkflowNodeContext => ({
  runId: 'run_1',
  runKey: 'nodeX',
  nodeId: 'nodeX',
  nodeType: 'kb-qa' as any,
  iterationIndex: 0,
  config,
  startInputs: {},
  signal: new AbortController().signal,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  emitProgress: () => {},
  resolveTemplate: (t: string) => t as never,
  getVariable: () => undefined,
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ==================== 一致性（自动覆盖新组件） ====================

describe('A2 组件注册一致性', () => {
  it('全量注册表（含 kb-qa/report）零问题', () => {
    const registry = createFullNodeRegistry()
    expect(() => {
      const problems = checkRegistryConsistency(registry)
      if (problems.length) throw new Error(problems.join('\n'))
    }).not.toThrow()
    expect(registry.get('kb-qa')).toBeDefined()
    expect(registry.get('report')).toBeDefined()
  })
})

// ==================== kb-qa ====================

describe('kb-qa 节点', () => {
  const handler = A2_NODE_HANDLERS.find(h => h.type === 'kb-qa')!

  it('validateConfig：缺知识库/问题报错', () => {
    expect(handler.validateConfig({} as never).length).toBeGreaterThan(0)
    expect(handler.validateConfig({ knowledgeBaseId: 'kb1', question: '{{start.q}}' } as never)).toEqual([])
  })

  it('检索→拼接 context→LLM 生成，输出 answer+sources', async () => {
    kbSearchMock.mockResolvedValue({
      success: true,
      data: [
        { content: '第一条内容', score: 0.9, documentId: 'd1', documentName: '手册A' },
        { content: '第二条内容', score: 0.8, documentId: 'd2', documentName: '手册B' },
      ],
    })
    callAIStreamMock.mockResolvedValue({ content: '这是答案', usage: { promptTokens: 10, completionTokens: 5 } })

    const result = await handler.execute(makeCtx({
      knowledgeBaseId: 'kb1', question: '什么是X？',
    }) as never)

    expect(result).toMatchObject({ status: 'succeeded' })
    const output = (result as any).output
    expect(output.answer).toBe('这是答案')
    expect(output.sources).toEqual([
      { documentName: '手册A', score: 0.9 },
      { documentName: '手册B', score: 0.8 },
    ])
    // context 拼接格式（systemPrompt 含文档名与内容）
    const sysPrompt = callAIStreamMock.mock.calls[0][0].systemPrompt as string
    expect(sysPrompt).toContain('手册A')
    expect(sysPrompt).toContain('第一条内容')
    // question 透传 + signal 透传
    expect(callAIStreamMock.mock.calls[0][0].prompt).toBe('什么是X？')
    expect(kbSearchMock.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal)
  })

  it('resultMaxLength 截断（P4：默认走 DEFAULTS）', async () => {
    kbSearchMock.mockResolvedValue({
      success: true,
      data: [{ content: '长'.repeat(10_000), score: 0.9, documentId: 'd1', documentName: 'A' }],
    })
    callAIStreamMock.mockResolvedValue({ content: 'ok' })
    await handler.execute(makeCtx({ knowledgeBaseId: 'kb1', question: 'q' }) as never)
    const sysPrompt = callAIStreamMock.mock.calls[0][0].systemPrompt as string
    expect(sysPrompt.length).toBeLessThan(10_000) // 被截断
  })

  it('检索失败：success=false → 节点失败', async () => {
    kbSearchMock.mockResolvedValue({ success: false, error: '库不存在' })
    const result = await handler.execute(makeCtx({ knowledgeBaseId: 'bad', question: 'q' }) as never)
    expect(result).toMatchObject({ status: 'failed' })
    expect((result as any).error).toContain('库不存在')
  })

  it('检索空结果仍生成（context 标注无检索结果）', async () => {
    kbSearchMock.mockResolvedValue({ success: true, data: [] })
    callAIStreamMock.mockResolvedValue({ content: '据已知信息无法回答' })
    const result = await handler.execute(makeCtx({ knowledgeBaseId: 'kb1', question: 'q' }) as never)
    expect(result).toMatchObject({ status: 'succeeded' })
    expect(callAIStreamMock.mock.calls[0][0].systemPrompt).toContain('未检索到')
  })
})

// ==================== report ====================

describe('report 节点', () => {
  const handler = A2_NODE_HANDLERS.find(h => h.type === 'report')!

  it('validateConfig：空模板报错', () => {
    expect(handler.validateConfig({ template: '' } as never).length).toBeGreaterThan(0)
  })

  it('markdown 格式：直出渲染内容，不落盘', async () => {
    const result = await handler.execute(makeCtx({
      title: '日报', template: '# 标题\n内容', format: 'markdown',
    }) as never)
    const output = (result as any).output
    expect(result).toMatchObject({ status: 'succeeded' })
    expect(output.markdown).toContain('# 标题')
    expect(output.format).toBe('markdown')
    expect(output.filePath).toBeUndefined()
    expect(fsWriteMock).not.toHaveBeenCalled()
  })

  it('docx 格式：落盘 workflow-reports/，output 不含文件字节（P3/R1）', async () => {
    const buffer = Buffer.from('fake-docx')
    markdownToDocxMock.mockResolvedValue(buffer)
    const result = await handler.execute(makeCtx({
      title: '报告', template: '# 报告\n正文', format: 'docx',
    }) as never)
    const output = (result as any).output
    expect(markdownToDocxMock).toHaveBeenCalledWith(expect.stringContaining('# 报告'), expect.anything())
    expect(fsWriteMock).toHaveBeenCalledTimes(1)
    const [filePath, buf] = fsWriteMock.mock.calls[0]
    expect(filePath).toContain('workflow-reports')
    expect(filePath).toContain('run_1')
    expect(buf).toBe(buffer)
    // output 只有元信息
    expect(output.filePath).toBe(filePath)
    expect(output.format).toBe('docx')
    expect(JSON.stringify(output)).not.toContain('fake-docx')
  })

  it('模板变量已由引擎解析（handler 收到实参直接使用）', async () => {
    const result = await handler.execute(makeCtx({
      title: 'T', template: '# {{llm1.content}}', format: 'markdown',
      // 引擎深解析后 config.template 已是实参——这里直接传解析后的值模拟
    }) as never)
    // 单占位透传语义：字符串原样输出（引擎已解析）
    expect((result as any).output.markdown).toContain('{{llm1.content}}')
  })
})
