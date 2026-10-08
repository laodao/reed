/**
 * VLM 镜头推断单测（提示词优化方案 §3.10，Phase 0 P0 修复）
 * @module tests/unit/episode-production/reference-video/vlm-shot-inferrer
 *
 * 背景（优化前）：
 *   - 提示词只给无方向的 pan/track，映射层却必须落到有方向的枚举 →
 *     pan→pan_left、track→truck_right，"默认方向"注释自承捏造；
 *     所有横摇静默变左摇、所有跟拍变右移，系统性数据失真。
 *   - 未命中映射静默回落 medium/eye_level/static，无告警，漂移不可见。
 *   - durationSec 注入却无字段消费（无效上下文）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const callVLMMock = vi.fn()
vi.mock('@core/platform/episode-production/narrative/ai/_helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/narrative/ai/_helpers')>()
  return { ...actual, callVLM: (...args: unknown[]) => callVLMMock(...args) }
})

vi.mock('node:fs', () => ({
  promises: { readFile: async () => Buffer.from('fake') },
}))

import { createVlmShotInferrer } from '@core/platform/episode-production/reference-video/vlm-shot-inferrer'

function mockReply(obj: Record<string, unknown>) {
  callVLMMock.mockResolvedValue(JSON.stringify(obj))
}

function systemPromptOf(): string {
  return String(callVLMMock.mock.calls[0][2])
}

beforeEach(() => {
  callVLMMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('vlm-shot-inferrer · 提示词（§3.10）', () => {
  it('定位改为「专业影视分镜分析师」，不再是短剧专属', async () => {
    mockReply({ shotType: 'medium' })
    await createVlmShotInferrer()('/tmp/f.jpg', 3)
    const sys = systemPromptOf()

    expect(sys).toContain('专业影视分镜分析师')
    expect(sys).not.toContain('短剧分镜助手')
  })

  it('运镜枚举给出带方向的取值（pan_left/pan_right/track_left/track_right）', async () => {
    mockReply({ shotType: 'medium' })
    await createVlmShotInferrer()('/tmp/f.jpg', 3)
    const sys = systemPromptOf()

    expect(sys).toContain('pan_left')
    expect(sys).toContain('pan_right')
    expect(sys).toContain('track_left')
    expect(sys).toContain('track_right')
    // 无方向歧义的裸值不再作为选项出现
    expect(sys).not.toMatch(/^- pan: /m)
    expect(sys).not.toMatch(/^- track: /m)
  })

  it('提示词含方向判断依据，无运动依据时要求选 static', async () => {
    mockReply({ shotType: 'medium' })
    await createVlmShotInferrer()('/tmp/f.jpg', 3)
    const sys = systemPromptOf()

    expect(sys).toContain('判断方向')
    expect(sys).toContain('无法从单帧判断运动时选 static')
  })

  it('durationSec 不再注入用户提示词（schema 无消费字段）', async () => {
    mockReply({ shotType: 'medium' })
    await createVlmShotInferrer()('/tmp/f.jpg', 12.5)
    const userPrompt = String(callVLMMock.mock.calls[0][0])

    expect(userPrompt).not.toContain('12.5')
    expect(userPrompt).not.toContain('镜头时长')
  })
})

describe('vlm-shot-inferrer · 方向映射不再捏造', () => {
  it('VLM 判断的左摇/右摇原样落库，不被改写', async () => {
    mockReply({ cameraMovement: 'pan_right' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)
    expect(out.cameraMovement).toBe('pan_right')
  })

  it('VLM 判断的左移/右移原样落库', async () => {
    mockReply({ cameraMovement: 'track_left' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)
    expect(out.cameraMovement).toBe('track_left')
  })

  it('push/pull 映射到真实 25 预设值（不再是 dolly_in/dolly_out 平行词）', async () => {
    mockReply({ cameraMovement: 'push' })
    expect((await createVlmShotInferrer()('/tmp/f.jpg', 3)).cameraMovement).toBe('push')

    mockReply({ cameraMovement: 'pull' })
    expect((await createVlmShotInferrer()('/tmp/f.jpg', 3)).cameraMovement).toBe('pull')
  })

  it('handheld 映射到 shaky_handheld（注册表真值）', async () => {
    mockReply({ cameraMovement: 'handheld' })
    expect((await createVlmShotInferrer()('/tmp/f.jpg', 3)).cameraMovement).toBe('shaky_handheld')
  })

  it('历史简化值 pan/track 走兼容映射并记 warn 留痕', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockReply({ cameraMovement: 'pan' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)

    expect(out.cameraMovement).toBe('pan_left')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('历史简化值'))
  })
})

describe('vlm-shot-inferrer · 未命中不再静默兜底', () => {
  it('未知运镜值被丢弃而非回落 static，并落 vlmUnmapped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockReply({ cameraMovement: 'crash_zoom' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)

    expect(out.cameraMovement).toBeUndefined()
    expect(out.vlmUnmapped).toEqual({ cameraMovement: 'crash_zoom' })
    expect(warn).toHaveBeenCalled()
  })

  it('未知角度值被丢弃而非回落 eye_level', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockReply({ cameraAngle: 'sideways_ish' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)

    expect(out.cameraAngle).toBeUndefined()
    expect(out.vlmUnmapped).toEqual({ cameraAngle: 'sideways_ish' })
    warn.mockRestore()
  })

  it('未知景别值被丢弃并落 vlmUnmapped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockReply({ shotType: 'gigantic' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)

    expect(out.shotType).toBeUndefined()
    expect(out.vlmUnmapped).toEqual({ shotType: 'gigantic' })
    warn.mockRestore()
  })

  it('全部命中时无 vlmUnmapped 字段', async () => {
    mockReply({ shotType: 'close_up', cameraAngle: 'dutch', cameraMovement: 'pan_left' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)

    expect(out.vlmUnmapped).toBeUndefined()
    expect(out.shotType).toBe('extreme_close')
    expect(out.cameraAngle).toBe('dutch')
    expect(out.cameraMovement).toBe('pan_left')
  })

  it('字段缺失（非未命中）不触发 vlmUnmapped', async () => {
    mockReply({ frameDescription: '画面内容' })
    const out = await createVlmShotInferrer()('/tmp/f.jpg', 3)

    expect(out.cameraMovement).toBeUndefined()
    expect(out.vlmUnmapped).toBeUndefined()
  })
})