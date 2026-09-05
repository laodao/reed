/**
 * storyboard-generator 单测 — Bug C 修复（normalizeAiCharacters）
 *
 * 背景（spec 2026-05-09 ep-redesign · e2e report-shot-1.2.md Bug C）：
 *   AI 拆分镜返回的 storyboard.characters[].characterId 经常是
 *   - 角色名（"李墨" / "苏白"）
 *   - 长文写作 ID（lwc_xxx）
 *   - 占位符 / 空字符串
 *   …而**不是真实的 character_binding.id**（cb_xxx）。这导致 keyframe
 *   生成时 resolveCharacter 无法反查到 binding，最终 prompt 和 UI 显示都丢失
 *   角色信息。
 *
 *   normalizeAiCharacters 负责后处理：
 *   - characterId 已是 scene.characters[].characterBindingId 列表中之一 → 保留
 *   - 否则按 characterName 反查 → 替换为对应的 characterBindingId
 *   - 都找不到 → 保留为空字符串 + console.warn（让 service 层 fallback 接管，
 *     不抛错避免 e2e 中断）
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { normalizeAiCharacters } from '@core/platform/episode-production/narrative/ai/storyboard-generator'
import type { SceneCharacter } from '@shared/types/episode-production'

const sceneCharacters: SceneCharacter[] = [
  {
    characterBindingId: 'cb_li_mo',
    characterId: 'lwc_li_mo',
    characterName: '李墨',
  },
  {
    characterBindingId: 'cb_su_bai',
    characterId: 'lwc_su_bai',
    characterName: '苏白',
  },
]

describe('normalizeAiCharacters', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('AI 输出 characterId 已是真实 binding.id → 保留不变', () => {
    const result = normalizeAiCharacters(
      [
        {
          characterId: 'cb_li_mo',
          expression: '焦虑',
          action: '摩挲玉佩',
        },
      ],
      sceneCharacters,
    )
    expect(result).toHaveLength(1)
    expect(result[0].characterId).toBe('cb_li_mo')
    expect(result[0].expression).toBe('焦虑')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('AI 输出 characterId 是中文角色名 → 反查替换为 binding.id', () => {
    const result = normalizeAiCharacters(
      [
        {
          characterId: '李墨',
          expression: '焦虑',
          action: '推门',
        },
      ],
      sceneCharacters,
    )
    expect(result[0].characterId).toBe('cb_li_mo')
    expect(result[0].expression).toBe('焦虑')
  })

  it('AI 输出 characterId 是长文写作 ID → 反查替换为 binding.id', () => {
    const result = normalizeAiCharacters(
      [
        {
          characterId: 'lwc_su_bai',
          expression: '平静',
        },
      ],
      sceneCharacters,
    )
    expect(result[0].characterId).toBe('cb_su_bai')
  })

  it('AI 输出 characterId 是空字符串 → 保留空 + warn（让 fallback 接管）', () => {
    const result = normalizeAiCharacters(
      [
        {
          characterId: '',
          expression: '焦虑',
          action: '摩挲玉佩',
        },
      ],
      sceneCharacters,
    )
    expect(result).toHaveLength(1)
    expect(result[0].characterId).toBe('')
    expect(result[0].expression).toBe('焦虑')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('AI 输出 characterId 是未知名字 → 保留空 + warn', () => {
    const result = normalizeAiCharacters(
      [
        {
          characterId: '完全不认识的角色',
          expression: '惊愕',
        },
      ],
      sceneCharacters,
    )
    expect(result).toHaveLength(1)
    expect(result[0].characterId).toBe('')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('多角色混合：部分识别成功，部分 fallback 空字符串', () => {
    const result = normalizeAiCharacters(
      [
        { characterId: '李墨', expression: '焦虑' },
        { characterId: 'cb_su_bai', expression: '平静' },
        { characterId: 'unknown', expression: '神秘' },
      ],
      sceneCharacters,
    )
    expect(result).toHaveLength(3)
    expect(result[0].characterId).toBe('cb_li_mo')
    expect(result[1].characterId).toBe('cb_su_bai')
    expect(result[2].characterId).toBe('')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('characters 输入为 undefined / null → 返回空数组', () => {
    expect(normalizeAiCharacters(undefined, sceneCharacters)).toEqual([])
    expect(normalizeAiCharacters(null as any, sceneCharacters)).toEqual([])
  })

  it('保留 position / facing 等其他字段不变', () => {
    const result = normalizeAiCharacters(
      [
        {
          characterId: '李墨',
          position: { x: 65, y: 55, scale: 1.1 },
          expression: '焦虑',
          action: '摩挲玉佩',
          facing: 'left',
        },
      ],
      sceneCharacters,
    )
    expect(result[0].position).toEqual({ x: 65, y: 55, scale: 1.1 })
    expect(result[0].facing).toBe('left')
    expect(result[0].action).toBe('摩挲玉佩')
  })
})
