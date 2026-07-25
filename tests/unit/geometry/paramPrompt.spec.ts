/**
 * paramPrompt 单元测试
 * @see src/renderer/src/components/portrait/geometry/paramPrompt.ts
 */
import { describe, expect, it } from 'vitest'
import {
  degreeOf,
  paramToPhrase,
  buildFaceEditPrompt,
  targetRatioHint,
} from '@/components/portrait/geometry/paramPrompt'
import { computeFaceMetrics } from '@/components/portrait/geometry/faceMetrics'
import {
  LM_GLABELLA,
  LM_FOREHEAD_TOP,
  LM_SUBNASALE,
  LM_CHIN_BOTTOM,
  LM_RIGHT_EYE_OUTER,
  LM_RIGHT_EYE_INNER,
  LM_LEFT_EYE_OUTER,
  LM_LEFT_EYE_INNER,
  LM_NOSE_ALAR_RIGHT,
  LM_NOSE_ALAR_LEFT,
  LM_ZYGOMA_RIGHT,
  LM_ZYGOMA_LEFT,
  LM_JAW_ANGLE_RIGHT,
  LM_JAW_ANGLE_LEFT,
} from '@/components/portrait/geometry/landmarkIndices'

function makeLandmarks(): { x: number; y: number }[] {
  const pts = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }))
  pts[LM_GLABELLA] = { x: 300, y: 100 }
  pts[LM_FOREHEAD_TOP] = { x: 300, y: 20 }
  pts[LM_SUBNASALE] = { x: 300, y: 200 }
  pts[LM_CHIN_BOTTOM] = { x: 300, y: 400 }
  pts[LM_RIGHT_EYE_OUTER] = { x: 200, y: 90 }
  pts[LM_RIGHT_EYE_INNER] = { x: 250, y: 90 }
  pts[LM_LEFT_EYE_OUTER] = { x: 400, y: 90 }
  pts[LM_LEFT_EYE_INNER] = { x: 350, y: 90 }
  pts[LM_NOSE_ALAR_RIGHT] = { x: 270, y: 190 }
  pts[LM_NOSE_ALAR_LEFT] = { x: 330, y: 190 }
  pts[LM_ZYGOMA_RIGHT] = { x: 150, y: 150 }
  pts[LM_ZYGOMA_LEFT] = { x: 450, y: 150 }
  pts[LM_JAW_ANGLE_RIGHT] = { x: 220, y: 330 }
  pts[LM_JAW_ANGLE_LEFT] = { x: 380, y: 330 }
  return pts
}

describe('degreeOf', () => {
  it('幅度分档', () => {
    expect(degreeOf(-0.02)).toBe('very subtly')
    expect(degreeOf(0.05)).toBe('slightly')
    expect(degreeOf(-0.1)).toBe('significantly')
  })
})

describe('paramToPhrase', () => {
  it('负值取 negative 短语', () => {
    const p = paramToPhrase('midface', -0.06)
    expect(p).toContain('slightly')
    expect(p).toContain('shorter mid-face')
  })

  it('正值取 positive 短语', () => {
    expect(paramToPhrase('jaw', 0.05)).toContain('wider')
    expect(paramToPhrase('eyeSpacing', 0.05)).toContain('wider-set')
  })

  it('零值/未知参数返回空串', () => {
    expect(paramToPhrase('midface', 0)).toBe('')
    expect(paramToPhrase('unknown', 0.5)).toBe('')
  })
})

describe('buildFaceEditPrompt', () => {
  it('多参数组装进编辑指令框架', () => {
    const p = buildFaceEditPrompt({ midface: -0.06, jaw: -0.02 })
    expect(p).toContain('edit this portrait photo')
    expect(p).toContain('keeping the exact same person')
    expect(p).toContain('slightly shorter mid-face')
    expect(p).toContain('very subtly narrower')
    expect(p).toContain('keep hair, clothing, body, pose and background exactly the same')
  })

  it('带数值目标提示（变形后指标）', () => {
    const m = computeFaceMetrics(makeLandmarks())
    const p = buildFaceEditPrompt({ midface: -0.06 }, m)
    expect(p).toContain(`make the mid-face occupy about ${Math.round(m.midThird.pct)}% of face height`)
  })

  it('全零参数返回空串', () => {
    expect(buildFaceEditPrompt({})).toBe('')
    expect(buildFaceEditPrompt({ midface: 0 })).toBe('')
  })
})

describe('targetRatioHint', () => {
  it('null 指标返回空串', () => {
    expect(targetRatioHint(null)).toBe('')
  })
})
