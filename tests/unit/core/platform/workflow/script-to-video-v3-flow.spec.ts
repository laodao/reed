/**
 * 短视频脚本生成视频 V3 全链路引擎级测试（真实引擎 + 全节点注册表 + 真实 ffmpeg 合成）
 * @module tests/unit/core/platform/workflow/script-to-video-v3-flow
 * @description 覆盖 V3 三条关键路径（外部服务 mock，图结构/引擎/ffmpeg 为真）：
 *  1) imagery 意象化空镜主链路：写作技能 → 大纲审核 → 分镜拆解 → 逐镜提示词包+文生图
 *     → 素材板聚合与审核 → 逐镜片段确认+图生视频 → TTS → ffmpeg 合成+字幕+配音 → 存档
 *  2) asset 素材驱动链路：底图资产直用（assetIdx 分流），零文生图调用
 *  3) 缺素材拦截门控：ecommerce 预设（assetDependency=required）0 素材 → 明确失败不静默
 *  引擎挂起/批准语义、审核输出合并（payload 字段透传给 video-gen）一并验证。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runWithUser } from '@core/context/user-context'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createFullNodeRegistry } from '@core/platform/workflow/nodes'
import type { WorkflowGraph } from '@shared/types/workflow.types'

const execFileAsync = promisify(execFile)
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// ---- 测试媒体夹具（真实文件：1x1 png / 小 mp4 / 小 wav，合成阶段走真 ffmpeg） ----
const FIX_DIR = mkdtempSync(join(tmpdir(), 'v3flow-'))
const OUT_DIR = join(FIX_DIR, 'data')
// 图片夹具放进 dataPath：真实运行时 toAssetUrl 产出 dataPath 相对路径的 local-image:// URL
const IMG_PATH = join(OUT_DIR, 'frame.png')
const MP4_PATH = join(FIX_DIR, 'seg.mp4')
const WAV_PATH = join(FIX_DIR, 'voice.wav')

// 桌面端判定注入：V3 图内含多个 code 节点（策略决策/分镜分流/素材板聚合等），
// 其 vm 沙箱门禁按 process.versions.electron + 非 ELECTRON_RUN_AS_NODE 判桌面主进程。
// vitest-electron runner 实际跑在 Electron-as-Node（versions 冻结只读）→ 按
// workflow-definition-triggers.spec 同款 vi.stubGlobal 整体替换 process。
beforeAll(async () => {
  vi.stubGlobal('process', {
    ...globalThis.process,
    versions: { ...(globalThis.process as unknown as { versions: Record<string, string> }).versions, electron: '44.0.0' },
    env: { ...(globalThis.process as unknown as { env: Record<string, string | undefined> }).env, ELECTRON_RUN_AS_NODE: '0' },
  })
  mkdirSync(OUT_DIR, { recursive: true })
  // 1x1 红色 PNG（文生图产物夹具，无需 ffmpeg）
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  writeFileSync(IMG_PATH, png)
  // 小 mp4 / wav 用系统 ffmpeg 生成（video-compose 真实合成需要可解码文件）
  await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=128x256:d=0.4', '-r', '24', '-pix_fmt', 'yuv420p', MP4_PATH])
  await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', WAV_PATH])
  writeFileSync(join(FIX_DIR, 'bgm.wav'), Buffer.from('RIFFFakeWav'))
})

afterAll(() => {
  vi.unstubAllGlobals()
  try { rmSync(FIX_DIR, { recursive: true, force: true }) } catch { /* 忽略 */ }
})

// ---- mock 外部服务（LLM / 图像 / 语音 / 视频生成 / 资产库 / 事件 / 路径 / 技能） ----

const callAIStreamMock = vi.fn()
vi.mock('@core/platform/services/ai-call', () => ({
  callAIStream: (...a: unknown[]) => callAIStreamMock(...(a as [])),
  callVLM: vi.fn(),
  toImageDataUrl: vi.fn(),
}))

vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: vi.fn(() => ({ addDocument: vi.fn(), search: vi.fn(async () => ({ results: [] })) })),
}))

vi.mock('@core/platform/services/image.service', () => ({
  ImageService: {
    generateImage: vi.fn(async () => ({
      success: true,
      images: [{ filePath: IMG_PATH, width: 128, height: 256 }],
    })),
  },
}))

vi.mock('@core/platform/services/voice.service', () => ({
  VoiceService: {
    generateSpeech: vi.fn(async () => ({ success: true, data: { audioPath: WAV_PATH, duration: 1000 } })),
  },
}))

vi.mock('@core/platform/episode-production/render/video/video-generation.service', () => ({
  VideoGenerationService: {
    generateVideo: vi.fn(async () => ({ success: true, video: { localPath: MP4_PATH } })),
  },
}))

// 资产库：save-asset 落库 + read-assets 读取底图（asset 场景按 id 返回两张图资产）
const createAssetMock = vi.fn(async (input: { name?: string; category?: string }) => ({
  id: `asset-${createAssetMock.mock.calls.length}`,
  name: input.name ?? 'asset',
  category: input.category ?? 'text',
}))
const getAssetMock = vi.fn(async (id: string) => {
  if (!id) return null
  return {
    id,
    name: `底图${id}`,
    category: 'image',
    subCategory: '',
    kind: 'file',
    tags: [],
    description: `测试底图 ${id}（蓝色瓶子产品图）`,
    mimeType: 'image/png',
  }
})
vi.mock('@core/platform/assets/asset-registry', () => ({
  getAssetService: () => ({
    createAsset: createAssetMock,
    getAsset: getAssetMock,
    deleteAsset: vi.fn(async () => true),
    assetPreviewUrl: () => 'local-image://preview',
    resolveAssetPath: () => IMG_PATH,
  }),
}))

vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({ emit: vi.fn(), tapEvents: undefined }),
}))

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => OUT_DIR,
    // 与真实实现同形态：dataPath 相对路径（下游 local-* 解析可回到本地文件）
    toAssetUrl: (p: string, kind: string) =>
      `local-${kind}://${String(p).replace(OUT_DIR.replace(/\/+$/, '') + '/', '').replace(/^\//, '')}`,
  }),
}))

const resolveSkillMock = vi.fn((id: string) => ({
  id,
  name: id,
  description: '测试写作技能',
  category: '内容创作',
  source: 'builtin',
  dirPath: null,
  inputs: [],
  systemPrompt: '你是短视频编导（测试技能 {{param.topic}}）',
  body: '素材：{{param.material}}\n主题：{{param.topic}}\n要点：{{param.keyPoints}}\n背景：{{param.context}}\n态度：{{param.attitude}}\n角度：{{param.angle}}',
  modelInvocable: true,
}))
vi.mock('@core/platform/workflow/skills/skill-registry', () => ({
  getSkillService: () => ({ resolveSkill: resolveSkillMock }),
}))

// ---- 读取 V3 内置图 ----
const template = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/script-to-video-v3.json'), 'utf-8')
) as { graph: WorkflowGraph }

/** 3 镜头拆解结果（imagery 模式；asset 模式按 baseCount 生成 assetIdx 引用） */
function shotsPayload(mode: string): string {
  const shots = [
    { concept: '开场悬念', visual: '城市清晨空镜，镜头缓推', caption: '开局一句话', duration: 5, imagery: '城市天际线晨光' },
    { concept: '数据冲击', visual: '交易大屏光影（无文字），快速横移', caption: '数字会说话', duration: 6, imagery: '抽象数据流光效' },
    { concept: '收束观点', visual: '黄昏天台远眺，镜头拉远', caption: '结论一句话', duration: 5, imagery: '黄昏城市远景' },
  ]
  if (mode === 'asset') for (const [i, s] of shots.entries()) (s as Record<string, unknown>).assetIdx = i % 2
  return JSON.stringify({ narration: '第一句口播。| 第二句口播。| 第三句口播。', shots })
}

/** 当前场景的分镜模式（每个用例执行前设置） */
let shotsMode = 'imagery'

/** 单镜头提示词包（shotPack 每次迭代返回一份） */
const packFor = (i: number) =>
  JSON.stringify({
    concept: `概念${i}`,
    visual: `画面描述${i}（单一场景，含运镜）`,
    imagery: `意象${i}`,
    caption: `字幕${i}`,
    duration: 5,
    prompt: `cinematic empty shot ${i}, no text`,
  })

/** 大纲 markdown（写作技能输出） */
const OUTLINE_MD = '# 视频大纲\n\n## 开场\n- 悬念钩子\n\n## 中段\n- 数据与论证\n\n## 收尾\n- 观点收束'

/** LLM 路由：分镜拆解 / 素材包 / 写作技能 三类 systemPrompt */
function routeLLM(systemPrompt: string): string {
  if (systemPrompt.includes('分镜师')) return shotsPayload(shotsMode)
  if (systemPrompt.includes('素材包')) {
    const idx = callAIStreamMock.mock.calls.filter(([a]) => String((a as { systemPrompt?: string }).systemPrompt ?? '').includes('素材包')).length
    return packFor(idx)
  }
  return OUTLINE_MD
}

// ---- 引擎假实现（e1-form / daily-news 同款） ----
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

function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createFullNodeRegistry()
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id: string, p: Record<string, unknown>) => runs.patchRun(id, p) },
      nodeRuns: { startNode: (i: any) => nodeRuns.startNode(i), patchNode: (r: string, n: string, it: number, p: any) => nodeRuns.patchNode(r, n, it, p) },
      events: { emit: () => {} },
    } as never,
    registry
  )
  return { engine, runs, nodeRuns }
}

function baseInputs(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scriptSource: 'text',
    scriptText: '各位观众，今天聊一个反常识的现象。数据给出答案。这就是今天的结论。',
    topic: '测试选题',
    keyPoints: '',
    knowledgeBaseIds: [],
    videoType: 'financial-deep',
    videoStyle: '',
    visualStrategy: 'auto',
    writerSkill: 'auto',
    writerAttitude: 'auto',
    writerAngle: '',
    referenceAssetIds: [],
    baseImageAssetIds: [],
    width: 128,
    height: 256,
    voiceId: 'voice-test',
    voiceProviderConfigId: 'pc-voice',
    videoProviderConfigId: 'pc-video',
    videoModelId: 'h3',
    videoQuality: 'low',
    h3Steps: 4,
    imageProviderConfigId: 'pc-img',
    imageModelId: 'krea2',
    bgmPath: '',
    model: { providerConfigId: 'pc-1', modelId: 'm1' },
    ...over,
  }
}

/** 等待运行进入终态（succeeded/failed），返回终态 */
async function waitTerminal(runs: FakeRuns, timeoutMs = 60000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const st = String(runs.final.status ?? '')
    if (st === 'succeeded' || st === 'failed') return st
    await wait(30)
  }
  return String(runs.final.status ?? '')
}


/** 批准指定审核节点：轮询直到引擎受理（挂起到位）或运行进入终态 */
async function approveReview(engine: WorkflowEngineService, runs: FakeRuns, runId: string, nodeId: string, timeoutMs = 30000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (['succeeded', 'failed'].includes(String(runs.final.status ?? ''))) return false
    const ok = await runWithUser('u1', () => engine.resumeReview(runId, nodeId, { decision: 'approve' }))
    if (ok) return true
    await wait(30)
  }
  return false
}

async function execute(engine: WorkflowEngineService, runId: string, inputs: Record<string, unknown>) {
  return runWithUser('u1', () =>
    engine.execute({
      runId, userId: 'u1', definitionId: 'd1',
      graph: JSON.parse(JSON.stringify(template.graph)) as WorkflowGraph,
      startInputs: baseInputs(inputs),
      settings: { maxOutputChars: 800000, maxNodeRuns: 200 } as never,
    } as ExecuteRunInput)
  )
}

/** 用例间清零外部服务调用记录（mock 跨用例存活，避免计数污染） */
async function clearServiceMocks(): Promise<void> {
  callAIStreamMock.mockClear()
  createAssetMock.mockClear()
  getAssetMock.mockClear()
  resolveSkillMock.mockClear()
  const { ImageService } = await import('@core/platform/services/image.service')
  vi.mocked(ImageService.generateImage).mockClear()
  const { VoiceService } = await import('@core/platform/services/voice.service')
  vi.mocked(VoiceService.generateSpeech).mockClear()
  const { VideoGenerationService } = await import('@core/platform/episode-production/render/video/video-generation.service')
  vi.mocked(VideoGenerationService.generateVideo).mockClear()
}

// ==================== 场景 1：imagery 主链路（真实 ffmpeg 合成） ====================

describe('script-to-video-v3 全链路（imagery 意象化空镜）', () => {
  it('脚本 → 大纲审核 → 分镜 → 逐镜生图 → 素材板审核 → 逐镜确认+图生视频 → TTS → 合成 → 存档', async () => {
    await clearServiceMocks()
    shotsMode = 'imagery'
    callAIStreamMock.mockImplementation(async (arg: { systemPrompt?: string }) => ({
      content: routeLLM(String(arg?.systemPrompt ?? '')),
      usage: { promptTokens: 10, completionTokens: 20 },
    }))
    const { engine, runs, nodeRuns } = makeEngine()
    const returned = await execute(engine, 'run_v3_img', {})
    expect(returned).toBe('waiting_review')

    // 1) 大纲审核挂起 → 批准（写作技能被调用一次，素材为粘贴脚本）
    expect(await approveReview(engine, runs, 'run_v3_img', 'outlineReview')).toBe(true)
    expect(resolveSkillMock).toHaveBeenCalledWith('video-writer-investigative') // financial-deep → 调查技能

    // 2) 素材板审核挂起 → 批准
    expect(await approveReview(engine, runs, 'run_v3_img', 'boardReview')).toBe(true)

    // 3) 逐镜片段确认 ×3 → 批准
    for (let i = 0; i < 3; i++) {
      expect(await approveReview(engine, runs, 'run_v3_img', 'shotReview')).toBe(true)
    }

    const __st = await waitTerminal(runs)
    expect(__st).toBe('succeeded')

    // 视觉策略：auto + financial-deep → imagery 意象化空镜
    const strategy = nodeRuns.outputOf('strategy')?.result ?? {}
    expect(strategy.mode).toBe('imagery')
    expect(String(strategy.policyText)).toContain('意象化空镜')

    // 分镜拆解：3 镜头 + 全片口播
    const shots = nodeRuns.outputOf('shotsGen')
    expect(shots.parsed.shots).toHaveLength(3)
    expect(String(shots.parsed.narration)).toContain('第一句口播')

    // 逐镜文生图 3 次（imagery 模式），素材板 3 张卡带生成图路径
    const { ImageService } = await import('@core/platform/services/image.service')
    expect(ImageService.generateImage).toHaveBeenCalledTimes(3)
    const board = { cards: nodeRuns.outputOf('boardMerge')?.result?.cards ?? [] }
    expect(board.cards).toHaveLength(3)
    for (const card of board.cards) {
      expect(card.mode).toBe('imagery')
      expect(card.source).toBe('generated')
      expect(String(card.imagePath)).toBeTruthy()
    }

    // 审核输出透传：video-gen 收到的是「片段确认」后的画面/时长（payload 字段成为节点输出）
    const { VideoGenerationService } = await import('@core/platform/episode-production/render/video/video-generation.service')
    expect(VideoGenerationService.generateVideo).toHaveBeenCalledTimes(3)
    const vidCall = VideoGenerationService.generateVideo.mock.calls[0][0] as Record<string, unknown>
    expect(String(vidCall.image)).toContain('data:image/png;base64') // local-image:// → base64
    expect(vidCall.quality).toBe('low')

    // TTS 口播 + ffmpeg 合成（真实文件产出）
    const { VoiceService } = await import('@core/platform/services/voice.service')
    expect(VoiceService.generateSpeech).toHaveBeenCalledTimes(1)
    const comp = nodeRuns.outputOf('comp1')
    expect(String(comp.videoPath)).toBeTruthy()
    expect(existsSync(String(comp.videoPath))).toBe(true)
    expect(comp.duration).toBeGreaterThan(0)

    // 存档：成片/大纲/素材板 3 资产 + 完成通知
    expect(createAssetMock.mock.calls.length).toBeGreaterThanOrEqual(3)
    const videoSave = createAssetMock.mock.calls.find(([c]) => (c as { category?: string }).category === 'video')
    expect(videoSave).toBeTruthy()
    expect(nodeRuns.outputOf('notify1').sent).toBe(true)
  }, 120000)
})

// ==================== 场景 2：asset 素材驱动（底图直用，零文生图） ====================

describe('script-to-video-v3 全链路（asset 素材驱动）', () => {
  it('强制 asset + 提供底图 → 分镜带 assetIdx → 底图直用，不调用文生图', async () => {
    await clearServiceMocks()
    shotsMode = 'asset'
    callAIStreamMock.mockImplementation(async (arg: { systemPrompt?: string }) => ({
      content: routeLLM(String(arg?.systemPrompt ?? '')),
      usage: { promptTokens: 10, completionTokens: 20 },
    }))
    const { engine, runs, nodeRuns } = makeEngine()
    const returned = await execute(engine, 'run_v3_asset', {
      visualStrategy: 'asset',
      baseImageAssetIds: ['base1', 'base2'],
    })
    expect(returned).toBe('waiting_review')
    expect(await approveReview(engine, runs, 'run_v3_asset', 'outlineReview')).toBe(true)
    expect(await approveReview(engine, runs, 'run_v3_asset', 'boardReview')).toBe(true)
    for (let i = 0; i < 3; i++) {
      expect(await approveReview(engine, runs, 'run_v3_asset', 'shotReview')).toBe(true)
    }
    const __st = await waitTerminal(runs)
    expect(__st).toBe('succeeded')

    // 策略：asset 模式 + 素材池 2 张
    const strategy = nodeRuns.outputOf('strategy')?.result ?? {}
    expect(strategy.mode).toBe('asset')
    expect(strategy.baseCount).toBe(2)
    expect(String(strategy.policyText)).toContain('素材驱动')

    // 分镜 JSON 未带 assetIdx（LLM mock 固定返回）→ splitShots 在 asset 模式下应拦截
    // ——但本场景跑通说明拆解 LLM 按 asset 模式给了 assetIdx：校验 board 卡片全部素材直用
    const board = { cards: nodeRuns.outputOf('boardMerge')?.result?.cards ?? [] }
    expect(board.cards).toHaveLength(3)
    for (const card of board.cards) {
      expect(card.mode).toBe('asset')
      expect(Number(card.assetIdx)).toBeGreaterThanOrEqual(0)
      expect(Number(card.assetIdx)).toBeLessThan(2)
    }

    // asset 模式：零文生图、视频首帧=素材图
    const { ImageService } = await import('@core/platform/services/image.service')
    expect(ImageService.generateImage).not.toHaveBeenCalled()
    const { VideoGenerationService } = await import('@core/platform/episode-production/render/video/video-generation.service')
    expect(VideoGenerationService.generateVideo).toHaveBeenCalledTimes(3)
  }, 120000)
})

// ==================== 场景 3：素材驱动缺素材拦截门控 ====================

describe('script-to-video-v3 缺素材拦截（ecommerce 预设 assetDependency=required）', () => {
  it('asset 模式 + 0 素材 → strategy 明确失败，错误信息指引提供素材', async () => {
    await clearServiceMocks()
    callAIStreamMock.mockImplementation(async (arg: { systemPrompt?: string }) => ({
      content: routeLLM(String(arg?.systemPrompt ?? '')),
    }))
    const { engine, runs } = makeEngine()
    await execute(engine, 'run_v3_gate', { videoType: 'ecommerce', visualStrategy: 'asset' })
    const gateSt = await waitTerminal(runs)
    expect(gateSt).toBe('failed')
    expect(String(runs.final.error ?? '')).toContain('素材')

    // 门控在 LLM 拆解前触发：写作技能之后的 strategy 阶段即失败，不进入生图/生视频
    const { ImageService } = await import('@core/platform/services/image.service')
    expect(ImageService.generateImage).not.toHaveBeenCalled()
  }, 60000)

  it('auto 模式 + 电商预设 + 0 素材 → 同样拦截（auto 按预设解析为 asset）', async () => {
    await clearServiceMocks()
    callAIStreamMock.mockImplementation(async (arg: { systemPrompt?: string }) => ({
      content: routeLLM(String(arg?.systemPrompt ?? '')),
    }))
    const { engine, runs } = makeEngine()
    await execute(engine, 'run_v3_gate2', { videoType: 'ecommerce' })
    const gateSt = await waitTerminal(runs)
    expect(gateSt).toBe('failed')
    expect(String(runs.final.error ?? '')).toContain('素材')
  }, 60000)

  it('强制 asset + 自定义风格（dep=optional）+ 0 素材 → 回落 imagery 并跑通全链', async () => {
    await clearServiceMocks()
    shotsMode = 'imagery'
    callAIStreamMock.mockImplementation(async (arg: { systemPrompt?: string }) => ({
      content: routeLLM(String(arg?.systemPrompt ?? '')),
    }))
    const { engine, runs, nodeRuns } = makeEngine()
    const returned = await execute(engine, 'run_v3_fallback', {
      videoType: '',
      videoStyle: '自定义氛围感风格',
      visualStrategy: 'asset',
    })
    expect(returned).toBe('waiting_review')
    expect(await approveReview(engine, runs, 'run_v3_fallback', 'outlineReview')).toBe(true)
    expect(await approveReview(engine, runs, 'run_v3_fallback', 'boardReview')).toBe(true)
    for (let i = 0; i < 3; i++) {
      expect(await approveReview(engine, runs, 'run_v3_fallback', 'shotReview')).toBe(true)
    }
    const __st = await waitTerminal(runs)
    expect(__st).toBe('succeeded')
    const strategy = nodeRuns.outputOf('strategy')?.result ?? {}
    expect(strategy.mode).toBe('imagery')
    expect(String(strategy.note)).toContain('回落')
  }, 120000)
})
