/**
 * 讲义难度门禁测试（checkLessonDifficulty）
 * @module tests/unit/core/packs/domain-learning/learning-difficulty.rules.spec
 *
 * 钉死（2026-09-09 复盘 + 用户拍板「遇超纲先补前置基础卡」）：
 * - 目标=入门 + 出现进阶记号 + 未做记号教学 → gated（并要求先补前置）；
 * - 已做记号教学（meta 记号热身/读法/符号表）→ 通过；
 * - 目标≠入门（工作应用/前沿）→ 不过滤；
 * - 无进阶记号 → 通过。
 */

import { describe, it, expect } from 'vitest'
import {
  checkLessonDifficulty,
  detectAdvancedNotation,
  isBeginnerGoal,
} from '@core/packs/domain-learning/rules/learning-difficulty.rules'

const SEC = (md: string, key = 'body') => [{ key, title: '正文', md }]

describe('learning-difficulty 难度门禁', () => {
  it('isBeginnerGoal：识别入门口径', () => {
    expect(isBeginnerGoal('入门')).toBe(true)
    expect(isBeginnerGoal('零基础')).toBe(true)
    expect(isBeginnerGoal('工作应用')).toBe(false)
    expect(isBeginnerGoal('前沿')).toBe(false)
    expect(isBeginnerGoal(null)).toBe(false)
  })

  it('detectAdvancedNotation：认出积分/期望/分布/iid 等记号', () => {
    const hit = detectAdvancedNotation('经验贝叶斯用 ∫ f(x|θ)dG(θ)，且 X_k ~ N(Θ_k,1)，假定 iid。')
    expect(hit.length).toBeGreaterThanOrEqual(3)
    expect(hit.join('|')).toMatch(/积分/)
    expect(hit.join('|')).toMatch(/分布族|期望/)
  })

  it('入门目标 + 研究生级讲义（无记号教学）→ gated，且给出补前置指引', () => {
    const r = checkLessonDifficulty({
      goal: '入门',
      sections: SEC('用 ∫ f(x|θ)dG(θ) 估计先验 G，iid 假定下做边际极大似然。'),
    })
    expect(r.gated).toBe(true)
    expect(r.notation.length).toBeGreaterThan(0)
    expect(r.reason).toContain('先补前置')
    expect(r.reason).toContain('dl_save_concept')
    expect(r.reason).toContain('prerequisite')
    expect(r.reason).toContain('记号热身')
  })

  it('已做记号教学（meta 区含记号热身/读法）→ 通过（门禁只挡"未解释就使用"）', () => {
    const r = checkLessonDifficulty({
      goal: '入门',
      sections: [
        { key: 'meta', title: '学习前必读', md: '记号热身：∫ 读作"把…加起来"，例：∫x dx 表示把细条面积加起来。' },
        { key: 'body', title: '正文', md: '于是 ∫ f(x|θ)dG(θ) 表示按先验加权求和。' },
      ],
    })
    expect(r.gated).toBe(false)
    expect(r.teaching).toBe(true)
  })

  it('目标=前沿/工作应用 → 不过滤（同一份讲义）', () => {
    const sections = SEC('用 ∫ f(x|θ)dG(θ) 估计先验 G。')
    expect(checkLessonDifficulty({ goal: '前沿', sections }).gated).toBe(false)
    expect(checkLessonDifficulty({ goal: '工作应用', sections }).gated).toBe(false)
  })

  it('入门目标但没有进阶记号 → 通过', () => {
    const r = checkLessonDifficulty({
      goal: '入门',
      sections: SEC('体检报告里"阳性"不等于"患病"，因为健康人也会误报。'),
    })
    expect(r.gated).toBe(false)
    expect(r.notation).toHaveLength(0)
  })
})
