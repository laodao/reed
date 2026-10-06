/**
 * 提示词片段 golden snapshot 基线（§2.4）
 * @module tests/unit/episode-production/prompts/prompt-snapshot.spec
 *
 * 基线表为空时本测试会打印实际哈希（用于首次建立基线）；
 * 建立后任何片段改动都会失败 → 强制"改动可见"。
 */

import { describe, it, expect } from 'vitest'
import {
  renderAllSpecHashes,
  renderAllSpecs,
  promptHash,
  PROMPT_BASELINES,
  SNAPSHOT_CTX_SHORT_DRAMA,
  SNAPSHOT_CTX_FILM_MODERN,
} from './prompt-snapshot'
import { STATIC_SPECS } from '@core/platform/episode-production/prompts/specs'

describe('提示词片段注册表 · 结构约束（§2.4 P1）', () => {
  it('静态片段登记表覆盖全部约定片段键', () => {
    expect(Object.keys(STATIC_SPECS).sort()).toEqual(
      [
        'BINDING_CONSTRAINT_SPEC',
        'DIALOGUE_SINGLE_SOURCE_SPEC',
        'FIELD_QUALITY_SPEC',
        'NARRATION_QUALITY_SPEC',
        'ROSTER_LIST_SPEC',
        'SCENE_JSON_EXAMPLE_SPEC',
        'SCENE_SPLIT_PRINCIPLES_SPEC',
        'SCRIPT_FIDELITY_SPEC',
      ].sort(),
    )
  })

  it('每个片段非空且无未替换占位符残留（{xxx} 只允许在花名册片段里）', () => {
    for (const [key, text] of Object.entries(STATIC_SPECS)) {
      expect(text.trim().length).toBeGreaterThan(0)
      if (key === 'ROSTER_LIST_SPEC') continue
      expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })

  it('片段不含真实项目专名（P3 原则）', () => {
    const forbidden = ['沈云萝', '秦越', '雪麓山庄', '白鹿城', '阿蘅', '杜十娘', '曼陀罗花', '忘忧草']
    for (const [key, text] of Object.entries(STATIC_SPECS)) {
      for (const name of forbidden) {
        expect(`${key}:${text}`).not.toContain(name)
      }
    }
  })

  it('短剧纪律话术不在共享片段里（只允许出现在体裁档案）', () => {
    // 共享片段是跨体裁复用的，出现短剧专属话术即类型定制污染
    for (const text of Object.values(STATIC_SPECS)) {
      expect(text).not.toContain('黄金三秒')
      expect(text).not.toContain('爽点')
      expect(text).not.toContain('短剧留存底线')
    }
  })
})

describe('提示词片段 · golden snapshot（§2.4 漂移可见化）', () => {
  it('短剧古风组合的渲染哈希与基线一致', () => {
    const actual = renderAllSpecHashes(SNAPSHOT_CTX_SHORT_DRAMA)
    const missing = Object.keys(actual).filter((k) => !PROMPT_BASELINES[k])
    if (missing.length > 0) {
      // 首次建基线：打印实际值供写回
      console.log('[prompt-snapshot] 待建立基线（短剧古风）:', JSON.stringify(actual, null, 2))
    }
    expect(missing, `以下片段尚无基线，请写回 PROMPT_BASELINES:\n${missing.join('\n')}`).toEqual([])

    for (const [key, hash] of Object.entries(actual)) {
      expect(hash, `片段 ${key} 渲染结果发生变化（如为预期改动请更新基线）`).toBe(
        PROMPT_BASELINES[key],
      )
    }
  })

  it('电影/现代组合可渲染且与短剧组合结果不同（体裁分支生效）', () => {
    const short = renderAllSpecs(SNAPSHOT_CTX_SHORT_DRAMA)
    const film = renderAllSpecs(SNAPSHOT_CTX_FILM_MODERN)

    expect(promptHash(film.pacingDensitySpec)).not.toBe(promptHash(short.pacingDensitySpec))
    expect(film.pacingDensitySpec).not.toContain('短剧')
    expect(short.pacingDensitySpec).toContain('短剧')
  })

  it('语速变化只影响命名/情绪片段的台词校准行', () => {
    const slow = renderAllSpecs(SNAPSHOT_CTX_SHORT_DRAMA)
    const fast = renderAllSpecs({
      ...SNAPSHOT_CTX_SHORT_DRAMA,
      speechCharsPerSec: 6,
    })
    expect(fast.namingEmotionSpec).toContain('6 字/秒')
    expect(slow.namingEmotionSpec).toContain('4.5 字/秒')
  })
})