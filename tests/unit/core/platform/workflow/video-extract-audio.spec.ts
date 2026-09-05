/**
 * video-extract-audio 节点测试：校验（缺视频路径）/ 执行（mock ffmpeg 提取 + 输出路径/时长/文件名）/
 * file:// 前缀归一 / 文件不存在抛错 / 目录契约
 * @module tests/workflow/video-extract-audio
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock ffmpeg 能力（测试不跑真实二进制） ----
vi.mock('@core/platform/episode-production/reference-video/ffmpeg-helpers', () => ({
  extractAudio: vi.fn(async () => {}),
  getVideoMetadata: vi.fn(async () => ({ durationSec: 123, width: 1920, height: 1080 })),
}))

// ---- mock 数据目录提供器 ----
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => 'C:/mock-data' }),
}))

// ---- mock fs（existsSync 恒真，mkdirSync 空实现） ----
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}))

import { extractAudio, getVideoMetadata } from '@core/platform/episode-production/reference-video/ffmpeg-helpers'
import { MEDIA_NODE_HANDLERS } from '@core/platform/workflow/nodes/media-nodes'
import { NODE_TYPE_CATALOG_MAP, NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const handler = MEDIA_NODE_HANDLERS[0]
const extractAudioMock = vi.mocked(extractAudio)
const getVideoMetadataMock = vi.mocked(getVideoMetadata)

const baseCtx = (config: Record<string, unknown>) =>
  ({ config, runId: 'run_123', nodeId: 'vid1', signal: new AbortController().signal, logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }) as never

describe('video-extract-audio：validateConfig', () => {
  it('videoPath 为空 → 报错；有值 → 通过', () => {
    expect(handler.validateConfig({} as never)).toEqual(expect.arrayContaining([expect.stringContaining('视频文件路径')]))
    expect(handler.validateConfig({ videoPath: '' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('视频文件路径')]))
    expect(handler.validateConfig({ videoPath: '{{start.video}}' } as never)).toEqual([])
  })
})

describe('video-extract-audio：execute', () => {
  beforeEach(() => {
    extractAudioMock.mockClear()
    getVideoMetadataMock.mockClear()
  })

  it('提取音频：输出 wav 路径（workflow-media/<runId>/<runId>_<nodeId>.wav）+ 文件名 + 时长', async () => {
    const result = await handler.execute(baseCtx({ videoPath: 'D:/videos/meeting.mp4' }))
    expect(result.status).toBe('succeeded')
    if (result.status !== 'succeeded') return
    expect(extractAudioMock).toHaveBeenCalledWith('D:/videos/meeting.mp4', expect.stringMatching(/workflow-media[\\/]run_123[\\/]run_123_vid1\.wav$/))
    expect(result.output).toMatchObject({ videoName: 'meeting.mp4', durationMs: 123000 })
    expect(getVideoMetadataMock).toHaveBeenCalledWith('D:/videos/meeting.mp4')
  })

  it('file:// 前缀归一：file://D:/a.mp4 → D:/a.mp4 传给 ffmpeg', async () => {
    const result = await handler.execute(baseCtx({ videoPath: 'file://D:/a.mp4' }))
    expect(result.status).toBe('succeeded')
    expect(extractAudioMock).toHaveBeenCalledWith('D:/a.mp4', expect.any(String))
    if (result.status === 'succeeded') expect(result.output.videoName).toBe('a.mp4')
  })

  it('视频文件不存在 → 抛错（节点 failed 语义由引擎兜底）', async () => {
    // 临时把 existsSync 改为返回 false
    const fs = await import('fs')
    vi.mocked(fs.existsSync).mockReturnValueOnce(false)
    await expect(handler.execute(baseCtx({ videoPath: 'D:/missing.mp4' }))).rejects.toThrow('不存在')
    expect(extractAudioMock).not.toHaveBeenCalled()
  })

  it('元数据失败不阻断：durationMs 归 0，音频仍输出', async () => {
    getVideoMetadataMock.mockRejectedValueOnce(new Error('no metadata'))
    const result = await handler.execute(baseCtx({ videoPath: 'D:/videos/x.mp4' }))
    expect(result.status).toBe('succeeded')
    if (result.status === 'succeeded') expect(result.output.durationMs).toBe(0)
  })
})

describe('video-extract-audio：目录与注册契约', () => {
  it('catalog 含 video-extract-audio 且 videoPath/videoUrl 二选一（无强制必填键）', () => {
    const entry = NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['video-extract-audio']]
    expect(entry.label).toBe('视频提取音频')
    // videoPath 与 videoUrl 任一即可（validateConfig 兜底），因此 requiredConfigKeys 为空
    expect(entry.requiredConfigKeys).toEqual([])
    expect(NODE_TYPE_CATALOG.some(e => e.type === 'video-extract-audio')).toBe(true)
  })

  it('handler 与 catalog 的 outputSchema 键/类型一致（registry 一致性要求的子集）', () => {
    const catalog = NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['video-extract-audio']]
    const handlerKeys = handler.outputSchema.map(f => `${f.key}:${f.type}`).sort()
    const catalogKeys = catalog.outputSchema.map(f => `${f.key}:${f.type}`).sort()
    expect(handlerKeys).toEqual(catalogKeys)
  })
})
