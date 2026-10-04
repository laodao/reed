/**
 * shot-visual（镜头画面生产）节点测试
 * @module tests/unit/core/platform/workflow/shot-visual-node
 * @description 配图相关性的核心节点：三层供给 + 相关性闸 + 生成质检重试。
 *              这里把三类 IO（素材服务 / 文生图 / 视觉质检）全部 mock，穷举分支：
 *              - 真实视频素材过闸 → 直接采用（source=stock-video，带出处与相关性）
 *              - 真实素材全部不过闸 → 回落生成
 *              - 素材层异常（网络/Key 失效） → 不阻断，回落生成并如实记录 note
 *              - 未配凭据 / 未配质检模型 → 各自留痕而不是静默
 *              - 生成质检不过 → 按失败原因强化重试（attempts 计数正确）
 *              - 关闭生成兜底且素材未命中 → 明确失败
 *              - validateConfig 拦住"无画面来源"的配置
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchCandidates = vi.fn()
const mockResolveCredentialKey = vi.fn()
const mockCallVLM = vi.fn()
const mockGenerateImages = vi.fn()

vi.mock('@core/platform/services/stock-media.service', () => ({
  StockMediaService: {
    fetchCandidates: (...a: unknown[]) => mockFetchCandidates(...a),
  },
}))
vi.mock('@core/platform/services/ai-call', () => ({
  callVLM: (...a: unknown[]) => mockCallVLM(...a),
  toImageDataUrl: async (p: string) => `data:image/png;base64,${String(p).slice(-8)}`,
}))
vi.mock('@core/platform/workflow/nodes/image-generate', () => ({
  generateImages: (...a: unknown[]) => mockGenerateImages(...a),
}))
vi.mock('@core/platform/workflow/tools/tool-registry', () => ({
  getToolService: () => ({
    resolveCredentialKey: (...a: unknown[]) => mockResolveCredentialKey(...a),
  }),
}))

import { VISUAL_NODE_HANDLERS } from '@core/platform/workflow/nodes/visual-nodes'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'

const handler = VISUAL_NODE_HANDLERS[0]

const ctx = (config: Record<string, unknown>): WorkflowNodeContext =>
  ({
    runId: 'run1',
    runKey: 'visualShot:0',
    nodeId: 'visualShot',
    nodeType: 'shot-visual',
    iterationIndex: 0,
    config,
    startInputs: {},
    triggerInfo: {},
    signal: new AbortController().signal,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    emitProgress: vi.fn(),
    resolveTemplate: (t: string) => t as never,
    getVariable: () => undefined,
    saveState: async () => {},
    loadState: async () => undefined,
    executionKey: 'run1:visualShot:0',
  }) as unknown as WorkflowNodeContext

const BASE_CONFIG = {
  concept: '外贸进出口超预期',
  subject: '龙门吊与集装箱',
  setting: '集装箱码头堆场',
  searchQuery: 'container port terminal',
  visual: '繁忙集装箱码头，龙门吊吊装集装箱',
  caption: '外贸数据超预期',
  duration: 6,
  styleText: '深蓝鎏金纪实风',
  stockMode: 'auto',
  stockProvider: 'pexels',
  stockCredentialId: 'cred_1',
  stockKind: 'auto',
  stockMinScore: 60,
  stockMinWidth: 720,
  generateFallback: true,
  imageProviderConfigId: 'pc_img',
  imageModelId: 'doubao-seedream-4.5',
  qaProviderConfigId: 'pc_vision',
  qaModelId: 'doubao-seed-2.0-pro',
  minScore: 60,
  maxAttempts: 2,
  width: 1080,
  height: 1920,
}

const download = (over: Record<string, unknown> = {}, itemOver: Record<string, unknown> = {}) => ({
  item: {
    provider: 'pexels',
    id: '11801939',
    kind: 'video',
    downloadUrl: 'https://videos.pexels.com/x.mp4',
    previewUrl: 'https://images.pexels.com/x.jpg',
    width: 1080,
    height: 1920,
    durationSec: 12,
    pageUrl: 'https://www.pexels.com/video/11801939/',
    author: 'Mike Hongkong',
    license: 'pexels',
    ...itemOver,
  },
  relPath: 'stock-media/pexels/video/pexels_video_11801939.mp4',
  absPath: 'C:/data/stock-media/pexels/video/pexels_video_11801939.mp4',
  bytes: 1024,
  cached: false,
  ...over,
})

const qaReply = (score: number, hasText = false, reason = '') =>
  JSON.stringify({ score, hasText, reason })

const genOk = (path = 'C:/data/images/a.png') => ({
  prompt: 'p',
  images: [{ path, localUrl: `local-image://${path.split('/').pop()}` }],
})

beforeEach(() => {
  // resetAllMocks：连 once 队列与实现一起清空——只 clearAllMocks 会让上一用例的
  // mockResolvedValueOnce 残留到下一用例，造成"看似节点行为错"的假失败
  vi.resetAllMocks()
  mockResolveCredentialKey.mockResolvedValue('PEXELS_KEY')
})

/** 按素材种类给不同候选（精确控制"视频层有/图片层无"等分支） */
const byKind = (byVideo: unknown, byImage: unknown) =>
  mockFetchCandidates.mockImplementation(async (opts: { request: { kind: string } }) =>
    opts.request.kind === 'video' ? byVideo : byImage,
  )

describe('validateConfig', () => {
  it('无镜头语义报错；关闭生成兜底又无凭据报错；无图像模型报错', () => {
    expect(handler.validateConfig({} as never).join()).toContain('concept')
    expect(
      handler
        .validateConfig({ concept: 'x', generateFallback: false, stockCredentialId: '' } as never)
        .join(),
    ).toContain('素材库凭据')
    expect(handler.validateConfig({ concept: 'x', generateFallback: true } as never).join()).toContain('imageModelId')
    expect(handler.validateConfig({ concept: 'x', generateFallback: true, imageModelId: 'm' } as never)).toEqual([])
  })
})

describe('第一层：真实素材命中', () => {
  it('真实视频素材过闸即采用（带出处/作者/授权/相关性）', async () => {
    mockFetchCandidates.mockResolvedValueOnce({ downloads: [download()], queryUsed: 'container port terminal', queriesTried: ['container port terminal'], failed: 0 })
    mockCallVLM.mockResolvedValueOnce(qaReply(88, false, '码头场景贴题'))
    const res = await handler.execute(ctx({ ...BASE_CONFIG }))
    expect(res.status).toBe('succeeded')
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('stock-video')
    expect(out.clipPath).toContain('pexels_video_11801939.mp4')
    expect(out.imagePath).toBe('')
    expect(out.relevance).toBe(88)
    expect(out.provider).toBe('pexels')
    expect(out.stockId).toBe('11801939')
    expect(out.pageUrl).toContain('pexels.com')
    expect(out.license).toBe('pexels')
    expect(out.searchQuery).toBe('container port terminal')
    expect(mockGenerateImages).not.toHaveBeenCalled()
  })

  it('真实图片素材采用时给首帧图与 URL，且不产出片段', async () => {
    // 视频层未命中 → 图片层次之命中
    byKind(
      { downloads: [], queryUsed: 'container port terminal', queriesTried: ['container port terminal'], failed: 0 },
      {
        downloads: [download({ relPath: 'stock-media/pexels/image/x.jpg', absPath: 'C:/data/stock-media/pexels/image/x.jpg' }, { kind: 'image', durationSec: undefined })],
        queryUsed: 'container port terminal',
        queriesTried: ['container port terminal'],
        failed: 0,
      },
    )
    mockCallVLM.mockResolvedValueOnce(qaReply(75))
    const res = await handler.execute(ctx({ ...BASE_CONFIG }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('stock-image')
    expect(out.clipPath).toBe('')
    expect(out.imagePath).toContain('x.jpg')
    expect(mockGenerateImages).not.toHaveBeenCalled()
    // 视频层先试、图片层次之
    expect(mockFetchCandidates.mock.calls.map(c => (c[0] as { request: { kind: string } }).request.kind)).toEqual(['video', 'image'])
  })

  it('候选不过闸 → 回落生成（并留下未过闸说明）', async () => {
    const hit = { downloads: [download()], queryUsed: 'q', queriesTried: ['q'], failed: 0 }
    const miss = { downloads: [], queryUsed: 'q', queriesTried: ['q'], failed: 0 }
    byKind(hit, miss)
    mockCallVLM.mockResolvedValueOnce(qaReply(20, false, '跑题')) // 素材质检
    mockCallVLM.mockResolvedValueOnce(qaReply(85, false, '产线贴题')) // 生成质检
    mockGenerateImages.mockResolvedValueOnce(genOk())
    const res = await handler.execute(ctx({ ...BASE_CONFIG }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('generated')
    expect(out.relevance).toBe(85)
    expect(String(out.note)).toContain('未过相关性闸')
    expect(mockGenerateImages).toHaveBeenCalledTimes(1)
  })

  it('质检判定"画面有文字"时也不采用（阈值内也拦）', async () => {
    const hit = { downloads: [download()], queryUsed: 'q', queriesTried: ['q'], failed: 0 }
    const miss = { downloads: [], queryUsed: 'q', queriesTried: ['q'], failed: 0 }
    byKind(hit, miss)
    mockCallVLM.mockResolvedValue(qaReply(80, true, '有字幕条'))
    mockGenerateImages.mockResolvedValue(genOk())
    const res = await handler.execute(ctx({ ...BASE_CONFIG }))
    expect((res as { output: Record<string, unknown> }).output.source).toBe('generated')
  })

  it('素材层异常不阻断流程（回落生成并记录原因）', async () => {
    mockFetchCandidates.mockRejectedValueOnce(new Error('Pexels 接口返回 HTTP 401'))
    mockCallVLM.mockResolvedValue(qaReply(80))
    mockGenerateImages.mockResolvedValueOnce(genOk())
    const res = await handler.execute(ctx({ ...BASE_CONFIG }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('generated')
    expect(String(out.note)).toContain('HTTP 401')
  })

  it('未配凭据 → 跳过素材层并留痕', async () => {
    mockCallVLM.mockResolvedValue(qaReply(80))
    mockGenerateImages.mockResolvedValueOnce(genOk())
    const res = await handler.execute(ctx({ ...BASE_CONFIG, stockCredentialId: '' }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('generated')
    expect(String(out.note)).toContain('未提供素材库凭据')
    expect(mockFetchCandidates).not.toHaveBeenCalled()
  })

  it('该镜无检索词 → 跳过素材层（不瞎搜）', async () => {
    mockCallVLM.mockResolvedValue(qaReply(80))
    mockGenerateImages.mockResolvedValueOnce(genOk())
    const res = await handler.execute(ctx({ ...BASE_CONFIG, searchQuery: '', concept: 'ZZZ', subject: '', setting: '', visual: '' }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(String(out.note)).toContain('未解析出素材检索词')
    expect(mockFetchCandidates).not.toHaveBeenCalled()
  })

  it('无质检模型时真实素材按检索词命中直接采用（留痕）', async () => {
    mockFetchCandidates.mockResolvedValueOnce({ downloads: [download()], queryUsed: 'q', queriesTried: ['q'], failed: 0 })
    const res = await handler.execute(ctx({ ...BASE_CONFIG, qaProviderConfigId: '' }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('stock-video')
    expect(out.relevance).toBe(-1)
    expect(String(out.note)).toContain('视觉质检模型不可用')
    expect(mockCallVLM).not.toHaveBeenCalled()
  })
})

describe('第三层：AI 生成兜底 + 质检重试', () => {
  it('首次不过质检、第二次通过 → attempts=2 且采用第二次', async () => {
    mockFetchCandidates.mockResolvedValue({ downloads: [], queryUsed: 'q', queriesTried: ['q'], failed: 0 })
    mockCallVLM
      .mockResolvedValueOnce(qaReply(30, false, '主体不对'))
      .mockResolvedValueOnce(qaReply(78, false, '这次对了'))
    mockGenerateImages.mockResolvedValue(genOk())
    const res = await handler.execute(ctx({ ...BASE_CONFIG }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('generated')
    expect(out.attempts).toBe(2)
    expect(out.relevance).toBe(78)
    expect(mockGenerateImages).toHaveBeenCalledTimes(2)
    // 第二次提示词带纠偏语
    const secondPrompt = String((mockGenerateImages.mock.calls[1][0] as { prompt: string }).prompt)
    expect(secondPrompt).toContain('重新生成')
    expect(secondPrompt).toContain('真实可拍')
  })

  it('质检不可用时采用首版并留痕（不空转重试）', async () => {
    mockFetchCandidates.mockResolvedValue({ downloads: [], queryUsed: 'q', queriesTried: ['q'], failed: 0 })
    mockCallVLM.mockRejectedValue(new Error('模型不支持图片输入'))
    mockGenerateImages.mockResolvedValue(genOk())
    const res = await handler.execute(ctx({ ...BASE_CONFIG }))
    const out = (res as { output: Record<string, unknown> }).output
    expect(out.source).toBe('generated')
    expect(out.attempts).toBe(1)
    expect(String(out.note)).toContain('视觉质检调用失败')
    expect(mockGenerateImages).toHaveBeenCalledTimes(1)
  })

  it('关闭生成兜底且素材未命中 → 明确失败（不静默出空镜）', async () => {
    mockFetchCandidates.mockResolvedValue({ downloads: [], queryUsed: 'q', queriesTried: ['q'], failed: 0 })
    mockCallVLM.mockResolvedValue(qaReply(80))
    const res = await handler.execute(ctx({ ...BASE_CONFIG, generateFallback: false }))
    expect(res.status).toBe('failed')
    expect(String((res as { error: string }).error)).toContain('已关闭生成兜底')
  })

  it('生成提示词含主体/场所/风格/无文字纪律', async () => {
    mockFetchCandidates.mockResolvedValue({ downloads: [], queryUsed: 'q', queriesTried: ['q'], failed: 0 })
    mockCallVLM.mockResolvedValue(qaReply(80))
    mockGenerateImages.mockResolvedValueOnce(genOk())
    await handler.execute(ctx({ ...BASE_CONFIG }))
    const arg = mockGenerateImages.mock.calls[0][0] as { prompt: string; negativePrompt: string; width: number; height: number; modelId: string }
    expect(arg.prompt).toContain('龙门吊与集装箱')
    expect(arg.prompt).toContain('集装箱码头堆场')
    expect(arg.prompt).toContain('深蓝鎏金纪实风')
    expect(arg.negativePrompt).toContain('文字')
    expect(arg.width).toBe(1080)
    expect(arg.height).toBe(1920)
    expect(arg.modelId).toBe('doubao-seedream-4.5')
  })
})