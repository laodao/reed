/**
 * report-image 节点测试：templateId → 排版模板透传（早报/周报/未知回退）、落盘、HTML 降级
 * @module tests/workflow/report-image
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock 文档工具层（唯一渲染入口；renderImage 由测试控制） ----
const renderImageMock = vi.fn()
vi.mock('@core/platform/services/document-tools/document-tools', () => ({
  getDocumentTools: () => ({ renderImage: (...a: any[]) => renderImageMock(...a) }),
}))

// ---- mock 重量级依赖（a2-nodes 静态 import 拉起的服务，避免真实 DB/网络） ----
vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: class {
    search = vi.fn(async () => ({ success: true, data: [] }))
    searchQa = vi.fn(async () => ({ success: true, data: [] }))
  },
}))
vi.mock('@core/platform/services/ai-call', () => ({ callAIStream: vi.fn(async () => ({ content: '' })) }))
vi.mock('@core/utils/markdown-to-docx', () => ({ markdownToDocx: vi.fn(async () => Buffer.from('x')) }))

// ---- mock 数据目录提供器 ----
const dataPath = 'C:/test-data'
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => dataPath }),
}))

const fsWriteMock = vi.fn()
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, mkdirSync: vi.fn(), writeFileSync: (...a: any[]) => fsWriteMock(...a) }
})

import { A2_NODE_HANDLERS } from '@core/platform/workflow/nodes/a2-nodes'
import { DOCUMENT_TEMPLATES } from '@core/platform/services/document-tools/templates'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'

const handler = A2_NODE_HANDLERS.find(h => h.type === 'report-image')!

const makeCtx = (config: Record<string, unknown>): WorkflowNodeContext =>
  ({
    runId: 'run_1',
    runKey: 'nodeX',
    nodeId: 'nodeX',
    nodeType: 'report-image' as any,
    iterationIndex: 0,
    config,
    startInputs: {},
    triggerInfo: {},
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    emitProgress: () => {},
    resolveTemplate: (t: string) => t as never,
    getVariable: () => undefined,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('report-image 节点', () => {
  it('validateConfig：空模板报错', () => {
    expect(handler.validateConfig({ template: '' } as never).length).toBeGreaterThan(0)
    expect(handler.validateConfig({ template: '# 早报\n{{gen1.content}}' } as never)).toEqual([])
  })

  it('templateId → 对应排版模板透传给渲染层（早报商务蓝）', async () => {
    renderImageMock.mockResolvedValue({ buffer: Buffer.from('png'), html: '<html/>', format: 'image' })
    const result = await handler.execute(makeCtx({
      title: 'AI 热点早报 2026年8月',
      template: '# 早报\n\n正文',
      templateId: 'morningReportBlue',
    }) as never)
    expect(result).toMatchObject({ status: 'succeeded' })
    const args = renderImageMock.mock.calls[0][0]
    expect(args.template).toBe(DOCUMENT_TEMPLATES.morningReportBlue)
    expect(args.template.id).toBe('morningReportBlue')
    expect(args.title).toBe('AI 热点早报 2026年8月')
    expect(args.markdown).toContain('# 早报')
  })

  it('周报模板同样生效（industryWeekly）', async () => {
    renderImageMock.mockResolvedValue({ buffer: Buffer.from('png'), html: '<html/>', format: 'image' })
    await handler.execute(makeCtx({
      title: '行业周报',
      template: '## 本周趋势',
      templateId: 'industryWeekly',
    }) as never)
    expect(renderImageMock.mock.calls[0][0].template).toBe(DOCUMENT_TEMPLATES.industryWeekly)
  })

  it('未知 templateId → 回退通用模板（不抛错）', async () => {
    renderImageMock.mockResolvedValue({ buffer: Buffer.from('png'), html: '<html/>', format: 'image' })
    await handler.execute(makeCtx({ title: 'T', template: '正文', templateId: 'not-exist' }) as never)
    expect(renderImageMock.mock.calls[0][0].template).toBe(DOCUMENT_TEMPLATES.generic)
  })

  it('缺省 templateId → 通用模板', async () => {
    renderImageMock.mockResolvedValue({ buffer: Buffer.from('png'), html: '<html/>', format: 'image' })
    await handler.execute(makeCtx({ title: 'T', template: '正文' }) as never)
    expect(renderImageMock.mock.calls[0][0].template).toBe(DOCUMENT_TEMPLATES.generic)
  })

  it('image 格式：PNG 落盘 workflow-reports/ + output 元信息', async () => {
    const buf = Buffer.from('fake-png')
    renderImageMock.mockResolvedValue({ buffer: buf, html: '<html/>', format: 'image' })
    const result = await handler.execute(makeCtx({ title: 'T', template: '正文', templateId: 'morningReport' }) as never)
    expect(fsWriteMock).toHaveBeenCalledTimes(1)
    const [filePath, written] = fsWriteMock.mock.calls[0]
    expect(filePath).toContain('workflow-reports')
    expect(filePath).toContain('run_1')
    expect(written).toBe(buf)
    const output = (result as any).output
    expect(output.format).toBe('image')
    expect(output.filePath).toBe(filePath)
  })

  it('HTML 降级（无平台渲染器）：不落盘，output 含 html', async () => {
    renderImageMock.mockResolvedValue({ buffer: Buffer.from('html'), html: '<html><body>hi</body></html>', format: 'html' })
    const result = await handler.execute(makeCtx({ title: 'T', template: '正文' }) as never)
    expect(fsWriteMock).not.toHaveBeenCalled()
    expect((result as any).output.format).toBe('html')
    expect((result as any).output.html).toContain('<html>')
    expect((result as any).output.filePath).toBeUndefined()
  })
})
