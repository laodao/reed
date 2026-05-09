/**
 * keyframe-prompt-builder · 镜头扩展 metadata · spec（Phase 2 C7，spec 2026-05-09 §3.2 B5）
 * @module tests/unit/episode-production/render/keyframe-prompt-builder-camera-metadata
 *
 * 验证 builder 解析 storyboards.metadata（焦距 / 光圈 / 相机风格 / 打光）后拼装到 prompt 末尾。
 */

import { describe, it, expect } from 'vitest'
import { buildKeyframePrompt } from '@core/modules/episode-production/render/keyframe/keyframe-prompt-builder'

const baseInput = {
  shotType: 'medium',
  cameraAngle: 'eye_level',
  frameDescription: '少年推门而入',
  sceneDescription: '黄昏酒馆',
  characters: [],
  location: null,
  items: [],
  frameRole: 'start' as const,
  timePercent: 0,
  styleConfig: {
    stylePrefix: 'cinematic',
    qualitySuffix: '8k, masterpiece',
    negativePrompt: 'low quality',
  },
}

describe('buildKeyframePrompt · 镜头扩展 metadata', () => {
  it('cameraMetadata 为 null → prompt 不含 promptHint', () => {
    const out = buildKeyframePrompt({ ...baseInput, cameraMetadata: null })
    expect(out.prompt).not.toMatch(/shot at \d+mm/i)
    expect(out.prompt).not.toMatch(/aperture f\//i)
    expect(out.prompt).not.toMatch(/cinematic, film grain/i)
    expect(out.prompt).not.toMatch(/rembrandt lighting/i)
  })

  it('cameraMetadata JSON 字符串 → 拼装焦距 promptHint', () => {
    const out = buildKeyframePrompt({
      ...baseInput,
      cameraMetadata: JSON.stringify({ lensFocalMm: '50mm' }),
    })
    expect(out.prompt).toMatch(/shot at 50mm, natural perspective/i)
  })

  it('cameraMetadata 含 4 项全部 → 拼装 4 个 promptHint', () => {
    const out = buildKeyframePrompt({
      ...baseInput,
      cameraMetadata: {
        lensFocalMm: '85mm',
        aperture: 'f/2.8',
        cameraStyle: 'cinematic',
        lighting: 'rembrandt',
      },
    })
    expect(out.prompt).toMatch(/85mm portrait/i)
    expect(out.prompt).toMatch(/f\/2\.8/i)
    expect(out.prompt).toMatch(/cinematic, film grain/i)
    expect(out.prompt).toMatch(/rembrandt lighting/i)
  })

  it('cameraMetadata 含非法 value → 跳过该字段', () => {
    const out = buildKeyframePrompt({
      ...baseInput,
      cameraMetadata: { lensFocalMm: 'INVALID', lighting: 'rembrandt' },
    })
    expect(out.prompt).not.toContain('INVALID')
    expect(out.prompt).toMatch(/rembrandt lighting/i)
  })

  it('cameraMetadata 是非法 JSON 字符串 → 跳过', () => {
    const out = buildKeyframePrompt({
      ...baseInput,
      cameraMetadata: '{ not valid json',
    })
    expect(out.prompt).not.toMatch(/shot at \d+mm/i)
  })

  it('camera metadata 拼到 cameraAngle 之后 / 用户额外提示词之前', () => {
    const out = buildKeyframePrompt({
      ...baseInput,
      cameraMetadata: { lensFocalMm: '50mm' },
      userPrompt: '更安静的氛围',
    })
    const focalIdx = out.prompt.indexOf('50mm')
    const userIdx = out.prompt.indexOf('user direction')
    expect(focalIdx).toBeGreaterThanOrEqual(0)
    expect(userIdx).toBeGreaterThanOrEqual(0)
    expect(focalIdx).toBeLessThan(userIdx)
  })
})
