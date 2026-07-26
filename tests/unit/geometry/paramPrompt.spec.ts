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
  it('scale 参数低于中性值(1)取 negative 短语', () => {
    // noseH=0.95 → 比中性值低 0.05 → shorter nose
    const p = paramToPhrase('noseH', 0.95)
    expect(p).toContain('slightly')
  })

  it('scale 参数高于中性值(1)取 positive 短语', () => {
    // jaw=1.05 → 比中性值高 0.05 → wider jaw
    expect(paramToPhrase('jaw', 1.05)).toContain('wider')
    // faceW=1.03 → slightly wider
    expect(paramToPhrase('faceW', 1.03)).toContain('slightly')
  })

  it('中性值/未知参数返回空串', () => {
    expect(paramToPhrase('jaw', 1)).toBe('')
    expect(paramToPhrase('eye', 0)).toBe('')
    expect(paramToPhrase('unknown', 0.5)).toBe('')
  })
})

describe('buildFaceEditPrompt', () => {
  it('多参数组装进编辑指令框架', () => {
    const p = buildFaceEditPrompt({ noseH: 0.94, jaw: 0.98 })
    expect(p).toContain('edit this portrait photo')
    expect(p).toContain('keeping the exact same person')
  })

  it('带数值目标提示（变形后指标）', () => {
    const m = computeFaceMetrics(makeLandmarks())
    const p = buildFaceEditPrompt({ foreH: 1.06 }, m)
    expect(p).toContain(`make the mid-face occupy about ${Math.round(m.midThird.pct)}% of face height`)
  })

  it('全中性参数返回空串', () => {
    expect(buildFaceEditPrompt({})).toBe('')
    expect(buildFaceEditPrompt({ jaw: 1 })).toBe('')
  })
})

describe('targetRatioHint', () => {
  it('null 指标返回空串', () => {
    expect(targetRatioHint(null)).toBe('')
  })
})
