/**
 * 每日热点早报新链路端到端测试（真实引擎 + 全节点注册表）
 * @module tests/workflow/daily-news-brief-flow
 * @description 验证重构后的内置工作流图全链路跑通：
 *              crawl-news(首页) → llm-chat(AI 定位栏目) → crawl-links(抓栏目页链接)
 *              → llm-chat(AI 筛选新闻) → loop[web-extract + kb-ingest(存正文+透传)]
 *              → llm-chat(生成报告) → report-image → kb-ingest(报告存知识库)
 *              → save-asset → end。
 *              关键断言：loop.results 经 passthrough 携带正文供报告引用；
 *              kbId 提供时正文与报告写入知识库；kbId 为空时跳过保存仍成功。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runWithUser } from '@core/context/user-context'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createFullNodeRegistry } from '@core/platform/workflow/nodes'
import type { WorkflowGraph } from '@shared/types/workflow.types'

// ---- mock 外部依赖（节点静态 import 拉起的服务，避免真实 DB/网络/平台） ----
const callAIStreamMock = vi.fn(async () => ({ content: '' }))
vi.mock('@core/platform/services/ai-call', () => ({
  callAIStream: (...a: any[]) => callAIStreamMock(...a),
  callVLM: vi.fn(),
  toImageDataUrl: vi.fn(),
}))

const addDocumentMock = vi.fn(async () => ({ success: true, data: { documentId: 'doc-1', isUpdate: false } }))
vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: vi.fn(() => ({ addDocument: addDocumentMock, getDocuments: vi.fn() })),
}))

const renderImageMock = vi.fn(async () => ({ buffer: Buffer.from('png'), html: '<html>ok</html>', format: 'image' }))
vi.mock('@core/platform/services/document-tools/document-tools', () => ({
  getDocumentTools: () => ({ renderImage: (...a: any[]) => renderImageMock(...a) }),
}))

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => 'C:/test-data' }),
}))

const createAssetMock = vi.fn(async (input: any) => ({
  id: 'asset-1', name: input.name ?? 'asset', category: input.category ?? 'text',
  subCategory: input.subCategory ?? '', kind: input.kind ?? 'text', textContent: '',
}))
const getAssetMock = vi.fn(async () => null)
vi.mock('@core/platform/assets/asset-registry', () => ({
  getAssetService: () => ({
    createAsset: createAssetMock,
    getAsset: getAssetMock,
    deleteAsset: vi.fn(async () => true),
    assetPreviewUrl: () => 'local-image://x',
    resolveAssetPath: () => 'C:/test-data/x',
  }),
}))

vi.mock('@core/interfaces/event.interface', () => ({ getEventEmitter: () => ({ emit: vi.fn() }) }))
vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({ newsSources: { listByIds: async () => [] } }),
}))
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn() }
})

// ---- 读取新版内置工作流图 ----
const template = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/daily-news-brief.json'), 'utf-8')
) as { graph: WorkflowGraph; settings?: Record<string, number> }

/** 测试用图：抓取节点禁用礼貌随机间隔（实际运行由节点配置/工作流默认控制），避免测试超时 */
function testGraph(): WorkflowGraph {
  const g = JSON.parse(JSON.stringify(template.graph)) as WorkflowGraph
  for (const node of g.nodes) {
    if (['crawl-news', 'crawl-links', 'web-extract'].includes(node.type)) {
      node.config = { ...node.config, delayMsMin: 0, delayMsMax: 0 }
    }
  }
  return g
}

// ---- 引擎假实现（e1-form 同款） ----
class FakeRuns {
  patches: Array<Record<string, unknown>> = []
  async patchRun(_id: string, p: Record<string, unknown>) { this.patches.push(p) }
  get final() { return this.patches[this.patches.length - 1] ?? {} }
}
class FakeNodeRuns {
  rows: any[] = []
  seq = 0
  async startNode(i: any) { this.rows.push({ rowKey: `${i.nodeId}|${i.iterationIndex}|${++this.seq}`, ...i, status: 'running' }) }
  async patchNode(_r: string, nodeId: string, iter: number, p: any) {
    const rows = this.rows.filter(x => x.nodeId === nodeId && x.iterationIndex === iter)
    if (rows.length) Object.assign(rows[rows.length - 1], p)
  }
  outputOf(nodeId: string): any {
    const rows = this.rows.filter(r => r.nodeId === nodeId)
    return rows[rows.length - 1]?.output
  }
}
const events: any[] = []

function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createFullNodeRegistry()
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id, p) => runs.patchRun(id, p) },
      nodeRuns: { startNode: i => nodeRuns.startNode(i), patchNode: (r, n, it, p) => nodeRuns.patchNode(r, n, it, p) },
      events: { emit: (e: any) => events.push(e) },
    } as any,
    registry
  )
  return { engine, runs, nodeRuns }
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** mock fetch：首页 → 栏目链接；栏目页 → 新闻链接；新闻页 → 正文 */
function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/news/')) {
      return { ok: true, status: 200, text: async () => `<html><head><title>新闻页 ${u}</title></head><body><p>这是一篇足够长的新闻正文内容，包含可被报告引用的有效信息。</p></body></html>` }
    }
    if (u.includes('/ai') || u.includes('/tech')) {
      return { ok: true, status: 200, text: async () => `<html><body>
        <a href="/news/1">AI 突破新闻标题足够长值得收录</a>
        <a href="/news/2">芯片产业新闻标题足够长值得收录</a>
        <a href="/">首页</a>
      </body></html>` }
    }
    return { ok: true, status: 200, text: async () => `<html><body>
      <a href="/ai">AI 频道</a>
      <a href="/tech">科技产业</a>
      <a href="/">首页</a>
    </body></html>` }
  }))
}

function baseInputs(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    topic: 'ai',
    sourceIds: [],
    customUrls: [],
    maxItems: 2,
    request: '聚焦今日重要进展，简洁',
    templateAssetId: '',
    model: { providerConfigId: 'p1', modelId: 'm1' },
    ...over,
  }
}

describe('每日热点早报新链路（两级采集 + 知识库保存）', () => {
  beforeEach(() => {
    addDocumentMock.mockClear()
    callAIStreamMock.mockClear()
    createAssetMock.mockClear()
    getAssetMock.mockClear()
    getAssetMock.mockResolvedValue(null)
  })

  it('完整链路 succeeded；正文经 passthrough 进报告；正文与报告写入知识库', async () => {
    stubFetch()
    const aiQueue = [
      JSON.stringify([{ title: 'AI 频道', url: 'https://news.example.com/ai' }, { title: '科技产业', url: 'https://news.example.com/tech' }]),
      JSON.stringify([{ title: 'AI 突破新闻', url: 'https://news.example.com/news/1', reason: '重要' }, { title: '芯片新闻', url: 'https://news.example.com/news/2', reason: '关键' }]),
      '# AI 热点早报（2026）\n\n## 今日要点\n- **AI 突破**：重要进展（来源：示例新闻）\n\n*由 The Bot 自动生成*',
    ]
    callAIStreamMock.mockImplementation(async () => ({ content: aiQueue.shift() ?? '' }))

    const { engine, runs, nodeRuns } = makeEngine()
    const status = await runWithUser('u1', () =>
      engine.execute({
        runId: 'run_news', userId: 'u1', definitionId: 'd1',
        graph: testGraph(),
        startInputs: baseInputs({ kbId: 'kb-1' }),
        settings: { maxOutputChars: 800000, maxNodeRuns: 50 } as never,
      } as ExecuteRunInput)
    )
    await wait(400)
    expect(runs.final.status).toBe('succeeded')

    // 1. AI 定位栏目（pick1）→ 批量抓链接（col1）→ AI 筛选新闻（pick2）均执行
    const pick1 = nodeRuns.outputOf('pick1')
    expect(pick1.parsed).toEqual([
      { title: 'AI 频道', url: 'https://news.example.com/ai' },
      { title: '科技产业', url: 'https://news.example.com/tech' },
    ])
    const col1 = nodeRuns.outputOf('col1')
    expect(col1.count).toBe(2)
    expect(col1.links.map((l: { url: string }) => l.url)).toContain('https://news.example.com/news/1')
    const pick2 = nodeRuns.outputOf('pick2')
    expect(pick2.parsed).toHaveLength(2)

    // 2. 循环体：正文经 saveKb1 passthrough 进入 loop.results，gen1 prompt 携带正文
    const loopOut = nodeRuns.outputOf('loop1')
    expect(loopOut.results).toHaveLength(2)
    const firstIter = loopOut.results[0]
    expect(firstIter.text).toContain('足够长的新闻正文内容')
    const gen1Call = callAIStreamMock.mock.calls[2] // 第 3 次 = gen1
    expect(String(gen1Call[0].prompt)).toContain('足够长的新闻正文内容')

    // 3. 知识库写入：正文（sourceKey=URL）+ 报告（sourceKey=report-*）
    const kbCalls = addDocumentMock.mock.calls
    expect(kbCalls.length).toBeGreaterThanOrEqual(3) // 2 篇正文 + 1 篇报告
    const reportCall = kbCalls.find(c => c[1].source?.id.startsWith('report-'))
    expect(reportCall).toBeDefined()
    expect(reportCall[1].content).toContain('AI 热点早报')
    const articleCall = kbCalls.find(c => c[1].source?.id === 'https://news.example.com/news/1')
    expect(articleCall).toBeDefined()

    // 4. 报告长图输出 markdown + 资产保存
    const report = nodeRuns.outputOf('report_default')
    expect(report.markdown).toContain('AI 热点早报')
    expect(nodeRuns.outputOf('save1').assetId).toBe('asset-1')
    expect(nodeRuns.outputOf('notify1')).toMatchObject({ sent: true })
  })

  it('未选知识库（kbId 空）→ 保存节点 skipped，链路仍 succeeded', async () => {
    stubFetch()
    const aiQueue = [
      JSON.stringify([{ title: 'AI 频道', url: 'https://news.example.com/ai' }]),
      JSON.stringify([{ title: 'AI 突破新闻', url: 'https://news.example.com/news/1', reason: '重要' }]),
      '# 报告正文',
    ]
    callAIStreamMock.mockImplementation(async () => ({ content: aiQueue.shift() ?? '' }))

    const { engine, runs, nodeRuns } = makeEngine()
    await runWithUser('u1', () =>
      engine.execute({
        runId: 'run_news2', userId: 'u1', definitionId: 'd1',
        graph: testGraph(),
        startInputs: baseInputs({ kbId: '' }),
        settings: { maxOutputChars: 800000, maxNodeRuns: 50 } as never,
      } as ExecuteRunInput)
    )
    await wait(400)
    expect(runs.final.status).toBe('succeeded')
    expect(addDocumentMock).not.toHaveBeenCalled()
    expect(nodeRuns.outputOf('saveKb1').status).toBe('skipped')
    expect(nodeRuns.outputOf('saveKb2').status).toBe('skipped')
  })

  it('模板资产路径：read1 → report_custom 的模板内容二次渲染（{{}} 占位被解析）', async () => {
    stubFetch()
    const aiQueue = [
      JSON.stringify([{ title: 'AI 频道', url: 'https://news.example.com/ai' }]),
      JSON.stringify([{ title: 'AI 突破新闻', url: 'https://news.example.com/news/1', reason: '重要' }]),
      '# 生成的正文章节\n\n要点内容',
    ]
    callAIStreamMock.mockImplementation(async () => ({ content: aiQueue.shift() ?? '' }))
    // 模板资产：内容里含 {{start.xx}} / {{gen1.xx}} 等占位（经 read-asset 间接引入 → 需 report-image 二次渲染）
    getAssetMock.mockResolvedValue({
      id: 'tpl-1', kind: 'text',
      textContent: '# {{start.topic}} 热点早报（{{sys.today}}）\n\n> 采集源：{{crawl1.failedSources.length}} 个源失败\n\n{{gen1.content}}',
    })

    const { engine, runs, nodeRuns } = makeEngine()
    await runWithUser('u1', () =>
      engine.execute({
        runId: 'run_news_tpl', userId: 'u1', definitionId: 'd1',
        graph: testGraph(),
        startInputs: baseInputs({ templateAssetId: 'tpl-1' }),
        settings: { maxOutputChars: 800000, maxNodeRuns: 50 } as never,
      } as ExecuteRunInput)
    )
    await wait(400)
    expect(runs.final.status).toBe('succeeded')
    const report = nodeRuns.outputOf('report_custom')
    expect(report).toBeDefined()
    expect(report.markdown).toContain('ai 热点早报') // {{start.topic}} 已解析（topic='ai'）
    expect(report.markdown).toContain('生成的正文章节') // {{gen1.content}} 已解析
    expect(report.markdown).not.toContain('{{') // 不再残留未解析占位
  })

  it('容错：循环内某个 URL 抓取失败（onError=skip）→ 跳过该项，链路仍 succeeded', async () => {
    // 新闻页 fetch：/news/2 抛网络错误（模拟被墙/超时/反爬），其余正常
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/news/bad')) throw new Error('fetch failed')
      if (u.includes('/news/')) {
        return { ok: true, status: 200, text: async () => `<html><head><title>新闻页 ${u}</title></head><body><p>这是一篇足够长的新闻正文内容，包含可被报告引用的有效信息。</p></body></html>` }
      }
      if (u.includes('/ai') || u.includes('/tech')) {
        return { ok: true, status: 200, text: async () => `<html><body>
          <a href="/news/good">AI 突破新闻标题足够长值得收录</a>
          <a href="/news/bad">被墙站点新闻标题足够长值得收录</a>
          <a href="/">首页</a>
        </body></html>` }
      }
      return { ok: true, status: 200, text: async () => `<html><body>
        <a href="/ai">AI 频道</a>
        <a href="/">首页</a>
      </body></html>` }
    }))
    const aiQueue = [
      JSON.stringify([{ title: 'AI 频道', url: 'https://news.example.com/ai' }]),
      JSON.stringify([
        { title: '正常新闻', url: 'https://news.example.com/news/good', reason: '重要' },
        { title: '被墙新闻', url: 'https://news.example.com/news/bad', reason: '抓不到' },
      ]),
      '# AI 热点早报（容错）\n\n## 今日要点\n- **正常新闻**：要点\n\n*由 The Bot 自动生成*',
    ]
    callAIStreamMock.mockImplementation(async () => ({ content: aiQueue.shift() ?? '' }))

    const { engine, runs, nodeRuns } = makeEngine()
    await runWithUser('u1', () =>
      engine.execute({
        runId: 'run_news_skip', userId: 'u1', definitionId: 'd1',
        graph: testGraph(),
        startInputs: baseInputs({ kbId: 'kb-1' }),
        settings: { maxOutputChars: 800000, maxNodeRuns: 50 } as never,
      } as ExecuteRunInput)
    )
    await wait(400)
    // 关键：某个 URL 抓取失败不再让整个流程失败
    expect(runs.final.status).toBe('succeeded')
    // 失败的 extract1 被跳过（skipped=true 空结果），正常项照常抓取
    const loopOut = nodeRuns.outputOf('loop1')
    expect(loopOut.results).toHaveLength(2)
    const bad = loopOut.results.find((r: { url?: string }) => String(r.url ?? '').includes('/news/bad'))
    expect(bad?.skipped).toBe(true)
    const good = loopOut.results.find((r: { url?: string }) => String(r.url ?? '').includes('/news/good'))
    expect(good?.text).toContain('足够长的新闻正文内容')
    // 报告正常生成
    const report = nodeRuns.outputOf('report_default')
    expect(report.markdown).toContain('AI 热点早报（容错）')
  })
})
