/**
 * AI 填空（fillStoryboardFields）提示词与白名单校验单测
 * @module tests/unit/episode-production/narrative/storyboard-generator-fill-registry
 *
 * 覆盖提示词优化方案 §3.9（Phase 0 活 bug 修复）：
 *   - 运镜枚举段必须来自镜头语言注册表（25 真值），不得再出现虚构值
 *   - 角度枚举必须含 worms_eye、转场必须含 iris（旧版漏项）
 *   - 输出校验：cameraMovement / cameraAngle / lighting / aperture / cameraStyle / transitionType
 *     全部走注册表白名单；非法值拒绝落库而非原样透传
 *   - 示例中性化（@[沈云萝] / 雪麓山庄书房 → 角色甲 / 某山庄书房）
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

const callAIMock = vi.fn()
vi.mock('@core/platform/episode-production/narrative/ai/_helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/narrative/ai/_helpers')>()
  return { ...actual, callAI: (...args: unknown[]) => callAIMock(...args) }
})

import { EpisodeStoryboardGenerator } from '@core/platform/episode-production/narrative/ai/storyboard-generator'

function makeGenerator(): EpisodeStoryboardGenerator {
  // fillStoryboardFields 不触碰 DB，构造入参仅需宿主服务
  return new EpisodeStoryboardGenerator({} as never)
}

const baseInput = {
  shotNumber: 1,
  sceneContext: '【人物】角色甲身着素白长袍',
  location: '某山庄书房',
  timeOfDay: '夜',
  mood: '紧张',
  existingFields: { cameraMovement: null, shotType: null },
}

afterEach(() => {
  callAIMock.mockReset()
})

describe('fillStoryboardFields · 提示词枚举接注册表', () => {
  it('prompt 含全部 25 个真实运镜预设', async () => {
    callAIMock.mockResolvedValue('{}')
    await makeGenerator().fillStoryboardFields(baseInput)
    const prompt = String(callAIMock.mock.calls[0][0])

    for (const v of [
      'push',
      'pull',
      'track_left',
      'track_right',
      'crane_up',
      'crane_down',
      'dolly_zoom',
      'circle_360',
      'whip_pan',
      'shaky_handheld',
      'snorricam',
      'aerial_descend',
      'rack_focus',
      'time_lapse',
    ]) {
      expect(prompt).toContain(v)
    }
  })

  it('prompt 不再出现虚构运镜值（旧版写死的 11 项）', async () => {
    callAIMock.mockResolvedValue('{}')
    await makeGenerator().fillStoryboardFields(baseInput)
    const prompt = String(callAIMock.mock.calls[0][0])

    for (const v of [
      'push_in',
      'pull_out',
      'reveal_push',
      'reveal_pull',
      'whip_pan_left',
      'whip_pan_right',
      'crash_zoom',
      'slow_motion_static',
      'time_lapse_pan',
      'freeze_frame',
      'impact_zoom',
    ]) {
      expect(prompt).not.toContain(v)
    }
  })

  it('prompt 不再出现历史平行词表（dolly_in / tracking_left / steadicam）', async () => {
    callAIMock.mockResolvedValue('{}')
    await makeGenerator().fillStoryboardFields(baseInput)
    const prompt = String(callAIMock.mock.calls[0][0])

    expect(prompt).not.toContain('dolly_in')
    expect(prompt).not.toContain('dolly_out')
    expect(prompt).not.toContain('tracking_left')
    expect(prompt).not.toContain('steadicam')
  })

  it('角度枚举含 worms_eye，转场枚举含 iris（旧版漏项已修）', async () => {
    callAIMock.mockResolvedValue('{}')
    await makeGenerator().fillStoryboardFields(baseInput)
    const prompt = String(callAIMock.mock.calls[0][0])

    expect(prompt).toContain('worms_eye')
    expect(prompt).toContain('iris')
    // 旧口径的 label 不再出现于角度段
    expect(prompt).not.toContain('dutch: 斜角')
  })

  it('声明的预设数量与实际条目一致（25 个命名预设）', async () => {
    callAIMock.mockResolvedValue('{}')
    await makeGenerator().fillStoryboardFields(baseInput)
    const prompt = String(callAIMock.mock.calls[0][0])

    expect(prompt).toContain('使用 25 个命名预设')
  })

  it('资产引用示例中性化（无真实项目名）', async () => {
    callAIMock.mockResolvedValue('{}')
    await makeGenerator().fillStoryboardFields(baseInput)
    const prompt = String(callAIMock.mock.calls[0][0])

    expect(prompt).not.toContain('沈云萝')
    expect(prompt).not.toContain('雪麓山庄')
    expect(prompt).toContain('角色甲')
  })
})

describe('fillStoryboardFields · 白名单校验', () => {
  it('合法运镜值正常落库', async () => {
    callAIMock.mockResolvedValue(
      JSON.stringify({ cameraMovement: 'rack_focus', cameraAngle: 'worms_eye' }),
    )
    const out = await makeGenerator().fillStoryboardFields(baseInput)
    expect(out.cameraMovement).toBe('rack_focus')
    expect(out.cameraAngle).toBe('worms_eye')
  })

  it('非法运镜值被拒绝落库（旧版原样透传的活 bug）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    callAIMock.mockResolvedValue(
      JSON.stringify({ cameraMovement: 'crash_zoom', cameraAngle: 'eye_angle_bogus' }),
    )
    const out = await makeGenerator().fillStoryboardFields(baseInput)

    expect(out.cameraMovement).toBeUndefined()
    expect(out.cameraAngle).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('历史平行词（dolly_in）不再被接受为新产出', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    callAIMock.mockResolvedValue(JSON.stringify({ cameraMovement: 'dolly_in' }))
    const out = await makeGenerator().fillStoryboardFields(baseInput)

    expect(out.cameraMovement).toBeUndefined()
    warn.mockRestore()
  })

  it('lighting / aperture / cameraStyle / transitionType / shotType 全部走白名单', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    callAIMock.mockResolvedValue(
      JSON.stringify({
        lighting: 'blue_hour',
        aperture: 'f/2.8',
        cameraStyle: 'cinematic',
        transitionType: 'iris',
        shotType: 'detail',
        // 非法值
        lightingBad: 'x',
      }),
    )
    const out = await makeGenerator().fillStoryboardFields(baseInput)

    expect(out.lighting).toBe('blue_hour')
    expect(out.aperture).toBe('f/2.8')
    expect(out.cameraStyle).toBe('cinematic')
    expect(out.transitionType).toBe('iris')
    expect(out.shotType).toBe('detail')
    warn.mockRestore()
  })

  it('非法 lighting / aperture / cameraStyle / transitionType 被拒绝', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    callAIMock.mockResolvedValue(
      JSON.stringify({
        lighting: 'sunny_vibes',
        aperture: 'f/99',
        cameraStyle: 'hologram',
        transitionType: 'teleport',
      }),
    )
    const out = await makeGenerator().fillStoryboardFields(baseInput)

    expect(out.lighting).toBeUndefined()
    expect(out.aperture).toBeUndefined()
    expect(out.cameraStyle).toBeUndefined()
    expect(out.transitionType).toBeUndefined()
    warn.mockRestore()
  })

  it('焦距数字自动补 mm 后走白名单（85 → 85mm 合法，99 → 拒绝）', async () => {
    callAIMock.mockResolvedValue(JSON.stringify({ lensFocalMm: 85 }))
    const ok = await makeGenerator().fillStoryboardFields(baseInput)
    expect(ok.lensFocalMm).toBe('85mm')

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    callAIMock.mockResolvedValue(JSON.stringify({ lensFocalMm: 99 }))
    const bad = await makeGenerator().fillStoryboardFields(baseInput)
    expect(bad.lensFocalMm).toBeUndefined()
    warn.mockRestore()
  })

  it('非枚举字段（duration/frameDescription/transitionDuration）不受白名单影响', async () => {
    callAIMock.mockResolvedValue(
      JSON.stringify({
        duration: 3.5,
        frameDescription: '【场景】某山庄书房',
        transitionDuration: 600,
        transitionDirection: 'left',
        keyframeCount: 4,
      }),
    )
    const out = await makeGenerator().fillStoryboardFields(baseInput)

    expect(out.duration).toBe(3.5)
    expect(out.frameDescription).toBe('【场景】某山庄书房')
    expect(out.transitionDuration).toBe(600)
    expect(out.transitionDirection).toBe('left')
    expect(out.keyframeCount).toBe(4)
  })
})