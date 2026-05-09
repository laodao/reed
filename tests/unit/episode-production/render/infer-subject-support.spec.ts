/**
 * inferSubjectSupport / inferMaxSubjects · spec（Phase 3 P3-C1，spec 2026-05-09 §3.2 C1 · P-20）
 *
 * 验证 provider 原生 subject 支持矩阵：
 *   Kling O3/O1 ✓ (4)
 *   Midjourney V7 ✓ (1)
 *   Seedance 2.0+ (dashscope) ✓ (9)
 *   bailian 托管 kling-v3 ✓ (10)
 *   其他（OpenAI / Vidu / Wan 1.x 等）✗
 */

import { describe, it, expect } from 'vitest'
import {
  inferSubjectSupport,
  inferMaxSubjects,
} from '@electron/ipc/handlers/episode-production/render/video-segment.handler'

describe('inferSubjectSupport', () => {
  describe('Kling 系列', () => {
    it('Kling O3 → true', () => {
      expect(inferSubjectSupport('kling', 'o3')).toBe(true)
      expect(inferSubjectSupport('kling', 'O3')).toBe(true)
    })
    it('Kling O1 → true', () => {
      expect(inferSubjectSupport('kling', 'o1')).toBe(true)
    })
    it('Kling 2.6 → true', () => {
      expect(inferSubjectSupport('kling', '2.6')).toBe(true)
    })
    it('Kling 3.0 → true', () => {
      expect(inferSubjectSupport('kling', '3.0')).toBe(true)
    })
    it('Kling 1.5（旧版）→ false', () => {
      expect(inferSubjectSupport('kling', '1.5')).toBe(false)
    })
  })

  describe('Midjourney', () => {
    it('Midjourney V7 → true', () => {
      expect(inferSubjectSupport('midjourney', 'v7')).toBe(true)
      expect(inferSubjectSupport('midjourney', 'mj-v7-omni')).toBe(true)
    })
    it('Midjourney V6（旧版）→ false', () => {
      expect(inferSubjectSupport('midjourney', 'v6')).toBe(false)
    })
  })

  describe('DashScope (Seedance)', () => {
    it('Seedance 2.0 → true', () => {
      expect(inferSubjectSupport('dashscope', 'seedance-2.0')).toBe(true)
      expect(inferSubjectSupport('dashscope', 'seedance-2.5')).toBe(true)
    })
    it('Seedance 1.0（旧版）→ false', () => {
      expect(inferSubjectSupport('dashscope', 'seedance-1.0')).toBe(false)
    })
    it('其他 dashscope 模型 → false', () => {
      expect(inferSubjectSupport('dashscope', 'wanx-v1')).toBe(false)
    })
  })

  describe('bailian 托管 kling', () => {
    it('kling-v3-xx → true', () => {
      expect(inferSubjectSupport('bailian', 'kling-v3-image-generation')).toBe(true)
    })
    it('其他 bailian 模型 → false', () => {
      expect(inferSubjectSupport('bailian', 'qwen-image-v1')).toBe(false)
    })
  })

  describe('其他 provider → false', () => {
    it.each(['openai', 'vidu', 'volcengine', 'minimax', 'zhipu', 'custom', 'unknown-type'])(
      '%s → false',
      (type) => {
        expect(inferSubjectSupport(type, 'any-model')).toBe(false)
      },
    )
  })
})

describe('inferMaxSubjects', () => {
  it('支持矩阵', () => {
    expect(inferMaxSubjects('kling')).toBe(4)
    expect(inferMaxSubjects('bailian')).toBe(10)
    expect(inferMaxSubjects('midjourney')).toBe(1)
    expect(inferMaxSubjects('dashscope')).toBe(9)
  })

  it('不支持的 provider → 0', () => {
    expect(inferMaxSubjects('openai')).toBe(0)
    expect(inferMaxSubjects('vidu')).toBe(0)
    expect(inferMaxSubjects('unknown')).toBe(0)
  })
})
