/**
 * 讲义循序渐进门禁测试（checkLessonProgression）
 * @module tests/unit/core/packs/domain-learning/learning-progression.rules.spec
 *
 * 背景（2026-09-12 用户反馈）：深度学习空间里 张量 → 自动微分与反向传播 直接相连，
 * 中间缺「导数与链式法则」这类前置，而既有难度门禁只对「入门」目标生效，
 * 工作应用/前沿目标下跳步无人拦。本 spec 用真实空间的形状钉死新口径：
 * - meta 首区 + 前置声明是硬要求；
 * - 用到前置能力（线性代数/导数与链式法则/…）时，要么图里有对应前置概念（且它已有讲义
 *   或已排在本概念之前），要么本卡 meta 把它当记号讲清楚；
 * - 都做不到 → gated，且错误信息给出"建概念 + 建关系 + 先给最基础者出讲义"的补法。
 */

import { describe, it, expect } from 'vitest'
import {
  checkLessonProgression,
  detectRequiredSkills,
  hasPrerequisiteDeclaration,
  type ProgressionGateInput,
} from '@core/packs/domain-learning/rules/learning-progression.rules'
// 前置祖先判定 2026-09-25 迁至 learning-prerequisites.rules（全模块唯一实现，建边防环与讲义门禁共用）
import { isPrerequisiteAncestor } from '@core/packs/domain-learning/rules/learning-prerequisites.rules'

/** 最小合法 meta 区（含前置声明；只声明"已掌握张量"，其他前置能力留给正文触发） */
const META = {
  key: 'meta',
  title: '学习前必读',
  md: '### 读者画像\n会 Python。\n\n### 前置\n已掌握：张量。\n\n### 可测目标\n1. 能说出……',
}

function input(over: Partial<ProgressionGateInput> = {}): ProgressionGateInput {
  return {
    goal: '工作应用',
    conceptName: '自动微分与反向传播',
    sections: [META, { key: 'mechanism', title: '机制', md: '以计算图为骨架，用链式法则从输出向输入逐层求参数梯度。' }],
    concepts: [
      { id: 'k-tensor', name: '张量', hasLesson: true },
      { id: 'k-ad', name: '自动微分与反向传播' },
    ],
    relations: [{ source: 'k-tensor', target: 'k-ad', type: 'prerequisite' }],
    conceptId: 'k-ad',
    ...over,
  }
}

describe('辅助判定', () => {
  it('hasPrerequisiteDeclaration：认「前置/已掌握/无需/零基础」等写法', () => {
    expect(hasPrerequisiteDeclaration('### 数学前置\n只要会四则运算')).toBe(true)
    expect(hasPrerequisiteDeclaration('已掌握：张量')).toBe(true)
    expect(hasPrerequisiteDeclaration('无需前置')).toBe(true)
    expect(hasPrerequisiteDeclaration('本讲讲张量的形状规则')).toBe(false)
  })

  it('isPrerequisiteAncestor：沿 prerequisite 边可传递（含多级）', () => {
    const rel = [
      { source: 'a', target: 'b', type: 'prerequisite' },
      { source: 'b', target: 'c', type: 'prerequisite' },
      { source: 'x', target: 'c', type: 'related' },
    ]
    expect(isPrerequisiteAncestor(rel, 'c', 'a')).toBe(true)
    expect(isPrerequisiteAncestor(rel, 'c', 'b')).toBe(true)
    expect(isPrerequisiteAncestor(rel, 'b', 'a')).toBe(true)
    expect(isPrerequisiteAncestor(rel, 'b', 'c')).toBe(false)
    expect(isPrerequisiteAncestor(rel, 'c', 'x')).toBe(false) // 非 prerequisite 边不算
    expect(isPrerequisiteAncestor(rel, 'c', 'c')).toBe(false)
  })

  it('detectRequiredSkills：认出线性代数/导数/积分/期望方差等前置能力', () => {
    const ids = detectRequiredSkills('用 ∫ f(x|θ)dG(θ) 求 ∂L/∂w，并在 iid 假定下算 E[X] 与 Var(X)，涉及矩阵乘法与转置。').map((s) => s.id)
    expect(ids).toContain('integral')
    expect(ids).toContain('derivative')
    expect(ids).toContain('random-variable')
    expect(ids).toContain('expectation')
    expect(ids).toContain('linear-algebra')
  })
})

describe('checkLessonProgression：结构（meta 首区）', () => {
  it('首区不是 meta → gated，并说明补法', () => {
    const r = checkLessonProgression(input({ sections: [{ key: 'definition', title: '定义', md: '张量是……' }] }))
    expect(r.gated).toBe(true)
    expect(r.reason).toContain('key=meta')
    expect(r.reason).toContain('首位')
  })

  it('空区集 → gated（不要落空讲义）', () => {
    expect(checkLessonProgression(input({ sections: [] })).gated).toBe(true)
  })

  it('meta 在首位但不交代前置 → gated（读者要知道门槛）', () => {
    const r = checkLessonProgression(
      input({ sections: [{ key: 'meta', title: '学习前必读', md: '### 读者画像\n会用 Python。' }] }),
    )
    expect(r.gated).toBe(true)
    expect(r.reason).toContain('前置声明')
  })
})

describe('checkLessonProgression：前置能力（用户实测场景）', () => {
  it('「工作应用」目标下 张量 → 自动微分：用到链式法则但图里没有导数类前置 → gated', () => {
    const r = checkLessonProgression(input())
    expect(r.gated).toBe(true)
    expect(r.missingSkills.join('|')).toContain('导数与链式法则')
    // 错误信息必须是可执行的补法
    expect(r.reason).toContain('dl_save_concept')
    expect(r.reason).toContain('dl_save_relation')
    expect(r.reason).toContain('prerequisite')
    expect(r.reason).toContain('dl_save_card')
    expect(r.reason).toContain('记号热身')
  })

  it('图里补上「导数与链式法则」并排在本概念之前且已有讲义 → 通过', () => {
    const r = checkLessonProgression(
      input({
        concepts: [
          { id: 'k-tensor', name: '张量', hasLesson: true },
          { id: 'k-deriv', name: '导数与链式法则', hasLesson: true },
          { id: 'k-ad', name: '自动微分与反向传播' },
        ],
        relations: [
          { source: 'k-tensor', target: 'k-deriv', type: 'prerequisite' },
          { source: 'k-deriv', target: 'k-ad', type: 'prerequisite' },
        ],
      }),
    )
    expect(r.gated).toBe(false)
    expect(r.requiredSkills).toContain('导数与链式法则')
    expect(r.warnings).toEqual([])
  })

  it('前置概念在图上但尚无讲义 → gated（先补讲义），且带出该概念名', () => {
    const r = checkLessonProgression(
      input({
        concepts: [
          { id: 'k-tensor', name: '张量', hasLesson: true },
          { id: 'k-deriv', name: '导数与链式法则' },
          { id: 'k-ad', name: '自动微分与反向传播' },
        ],
        relations: [{ source: 'k-tensor', target: 'k-ad', type: 'prerequisite' }],
      }),
    )
    expect(r.gated).toBe(true)
    expect(r.warnings.join('|')).toContain('导数与链式法则')
  })

  it('前置概念已排在本概念之前（prerequisite 祖先）但暂无讲义 → 通过 + 提醒', () => {
    const r = checkLessonProgression(
      input({
        concepts: [
          { id: 'k-deriv', name: '导数与链式法则' },
          { id: 'k-ad', name: '自动微分与反向传播' },
        ],
        relations: [{ source: 'k-deriv', target: 'k-ad', type: 'prerequisite' }],
      }),
    )
    expect(r.gated).toBe(false)
    expect(r.warnings.join('|')).toContain('尚无讲义')
  })

  it('本卡 meta 把链式法则当记号讲清楚（记号热身 + 命中该能力）→ 通过', () => {
    const r = checkLessonProgression(
      input({
        concepts: [{ id: 'k-ad', name: '自动微分与反向传播' }],
        relations: [],
        sections: [
          {
            key: 'meta',
            title: '学习前必读',
            md: '### 前置\n已掌握张量。\n### 记号热身\n链式法则（求导）：读作"外层变化率乘内层变化率"，例：y=(2x+1)² 先算外层 2(2x+1)，再乘内层 2。',
          },
          { key: 'mechanism', title: '机制', md: '用链式法则逐层求梯度。' },
        ],
      }),
    )
    expect(r.gated).toBe(false)
  })

  it('meta 只有记号热身但没覆盖该能力 → 仍 gated（不能一击通吃）', () => {
    const r = checkLessonProgression(
      input({
        concepts: [{ id: 'k-ad', name: '自动微分与反向传播' }],
        relations: [],
        sections: [
          {
            key: 'meta',
            title: '学习前必读',
            md: '### 前置\n已掌握张量。\n### 记号热身\n转置（⊤）：读作"行列互换"，例：[[1,2]] 的转置是 [[1],[2]]。',
          },
          { key: 'mechanism', title: '机制', md: '用链式法则从输出向输入逐层求梯度。' },
        ],
      }),
    )
    expect(r.gated).toBe(true)
    expect(r.missingSkills.join('|')).toContain('导数与链式法则')
  })

  it('不涉及任何前置能力的讲义 → 通过（不为难简单知识点）', () => {
    const r = checkLessonProgression(
      input({
        sections: [
          { key: 'meta', title: '学习前必读', md: '### 前置\n无需前置，会四则运算即可。' },
          { key: 'essence', title: '本质', md: '它是一个按网格排列的数值容器。' },
        ],
        concepts: [{ id: 'k-ad', name: '自动微分与反向传播' }],
        relations: [],
      }),
    )
    expect(r.gated).toBe(false)
    expect(r.requiredSkills).toEqual([])
  })

  it('门禁不看目标（入门/工作应用/前沿同一口径）——修掉"只有入门被拦"的漏洞', () => {
    for (const goal of ['入门', '工作应用', '前沿', null]) {
      expect(checkLessonProgression(input({ goal })).gated, `goal=${goal} 应被拦`).toBe(true)
    }
  })

  it('当前概念本身就是该前置能力时不自我要求（避免自指死锁）', () => {
    const r = checkLessonProgression(
      input({
        conceptName: '梯度下降与优化器',
        conceptId: 'k-gd',
        sections: [
          { key: 'meta', title: '学习前必读', md: '### 前置\n已掌握：损失函数。' },
          { key: 'mechanism', title: '机制', md: '沿梯度反方向走一步，步长即学习率。' },
        ],
        concepts: [{ id: 'k-gd', name: '梯度下降与优化器' }],
        relations: [],
      }),
    )
    // 概念名含"梯度"（该能力自身）→ 不要求图上另有一个"梯度/导数"概念
    expect(r.gated).toBe(false)
  })

  it('概念名只是"看起来像"前置能力时仍要门禁（自动微分 ≠ 导数前置）', () => {
    const r = checkLessonProgression(
      input({
        conceptName: '自动微分与反向传播',
        conceptId: 'k-ad',
        sections: [
          { key: 'meta', title: '学习前必读', md: '### 前置\n已掌握：张量。' },
          { key: 'mechanism', title: '机制', md: '用链式法则求微分。' },
        ],
        concepts: [{ id: 'k-ad', name: '自动微分与反向传播' }],
        relations: [],
      }),
    )
    expect(r.gated).toBe(true)
    expect(r.missingSkills.join('|')).toContain('导数与链式法则')
  })
})
