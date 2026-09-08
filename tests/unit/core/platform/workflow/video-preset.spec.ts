/**
 * 视频类型预设 + video-preset 节点单测
 * @module tests/unit/core/platform/workflow/video-preset
 */
import { describe, it, expect } from 'vitest'
import {
  VIDEO_TYPE_PRESETS,
  assembleVideoPresetPrompt,
  getVideoPreset,
  CUSTOM_FALLBACK_POLICY,
} from '@shared/types/video-presets'
import { VIDEO_NODE_HANDLERS } from '@core/platform/workflow/nodes/video-nodes'
import type { WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'

const presetNode: WorkflowNodeHandler = VIDEO_NODE_HANDLERS.find(n => n.type === 'video-preset')!

describe('视频类型预设数据', () => {
  it('预设含 6 类且 id 唯一、字段齐全', () => {
    expect(VIDEO_TYPE_PRESETS.length).toBeGreaterThanOrEqual(6)
    const ids = VIDEO_TYPE_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of VIDEO_TYPE_PRESETS) {
      expect(p.label).toBeTruthy()
      for (const k of ['positioning', 'structure', 'visualStyle', 'camera', 'music', 'subtitle', 'tone']) {
        expect(p[k as keyof typeof p]).toBeTruthy()
      }
    }
  })

  it('assembleVideoPresetPrompt：预设产出规范块，自由风格叠加行并入', () => {
    const p = assembleVideoPresetPrompt('financial-deep', '鎏金暗调更浓')
    expect(p).toContain('【视频类型】财经深度')
    expect(p).toContain('【叙事结构】')
    expect(p).toContain('【画面基调】')
    expect(p).toContain('鎏金暗调更浓')
    const unknown = assembleVideoPresetPrompt('no-such', '自定义风')
    expect(unknown).toContain('自定义风')
    expect(unknown).not.toContain('【视频类型】')
  })
})

describe('video-preset 节点', () => {
  it('预设备选项：输出 label/promptBlock/styleText/preset', async () => {
    const r = (await presetNode.execute({ config: { videoType: 'knowledge', freeStyle: '偏清新插画感' } } as never)) as {
      status: string
      output: Record<string, unknown>
    }
    expect(r.status).toBe('succeeded')
    expect(r.output.label).toBe('知识科普')
    expect(String(r.output.promptBlock)).toContain('知识科普')
    expect(String(r.output.styleText)).toContain('清新插画感')
    expect(r.output.type).toBe('knowledge')
    expect((r.output.preset as { id: string }).id).toBe('knowledge')
    // V3：policy=预设自带 visualPolicy
    const pol = r.output.policy as { mode: string; assetDependency: string }
    expect(pol.mode).toBe(getVideoPreset('knowledge')!.visualPolicy.mode)
    expect(pol.assetDependency).toBe('none')
  })

  it('仅自由风格（无预设）：走自定义分支；policy 用自定义兜底策略', async () => {
    const r = (await presetNode.execute({ config: { videoType: '', freeStyle: '复古胶片vlog' } } as never)) as {
      status: string
      output: Record<string, unknown>
    }
    expect(r.status).toBe('succeeded')
    expect(r.output.type).toBe('')
    expect(r.output.preset).toBeNull()
    expect(r.output.styleText).toBe('复古胶片vlog')
    // V3：自定义类型 policy=CUSTOM_FALLBACK_POLICY（imagery/optional/通用意象表）
    expect(r.output.policy).toEqual(CUSTOM_FALLBACK_POLICY)
  })

  it('validateConfig：无类型且无自由风格 → 报错；未知预设 → 报错', () => {
    const errs1 = presetNode.validateConfig!({ videoType: '', freeStyle: '' } as never)
    expect(errs1[0]).toContain('至少一项')
    expect(presetNode.validateConfig!({ videoType: 'not-exist', freeStyle: '' } as never)).toEqual(['未知的视频类型预设: not-exist'])
    expect(presetNode.validateConfig!({ videoType: '', freeStyle: 'x' } as never)).toEqual([])
    expect(getVideoPreset('travel')).toBeTruthy()
  })
})
