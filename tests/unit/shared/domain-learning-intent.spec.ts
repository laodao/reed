/**
 * 领域学习输入意图路由测试（routeDlIntent）
 * @module tests/unit/shared/domain-learning-intent.spec
 *
 * 钉死口径：答疑框同框自动判断——学习/答疑默认走 tutor；明确任务指令走 task；
 * 弱任务词（总结/汇总…）须带产出型宾语才路由 task；拿不准回 tutor。
 */

import { describe, it, expect } from 'vitest'
import { routeDlIntent } from '@shared/utils/domain-learning-intent'

describe('routeDlIntent 意图路由', () => {
  it('答疑/学习类输入 → tutor', () => {
    const tutorCases = [
      '贝叶斯公式的分母怎么算？',
      '为什么先验概率重要？',
      '什么是条件概率？能举个例子吗',
      '我没懂，再讲细一点',
      '这个符号什么意思',
      '这两个概念有什么区别',
    ]
    for (const q of tutorCases) expect(routeDlIntent(q), q).toBe('tutor')
  })

  it('明确任务指令 → task（研究/整理/规划/生成/拆解等）', () => {
    const taskCases = [
      '帮我研究一下深度学习的发展史',
      '把这三页笔记整理成一份复习提纲',
      '规划这个领域接下来一个月的学习路线',
      '做一份贝叶斯定理的讲义合集',
      '梳理最近学过的概念并生成讲义',
      '把这个任务拆解成子任务分步执行',
      '调研大模型评测的主流方法并写成报告',
    ]
    for (const q of taskCases) expect(routeDlIntent(q), q).toBe('task')
  })

  it('弱任务词（总结/汇总）不带产出型宾语 → tutor', () => {
    const weakCases = [
      '总结一下这个公式的意义',
      '汇总一下今天学的内容',
      '简单分析一下这段讲义',
    ]
    for (const q of weakCases) expect(routeDlIntent(q), q).toBe('tutor')
  })

  it('弱任务词带产出型宾语（提纲/清单/报告…）→ task', () => {
    const weakTaskCases = [
      '总结最近学的概念，给我一份提纲',
      '汇总我的收藏，生成一份清单',
      '分析这些资料并写一份对比报告',
    ]
    for (const q of weakTaskCases) expect(routeDlIntent(q), q).toBe('task')
  })

  it('空输入 → tutor（默认不误路由）', () => {
    expect(routeDlIntent('')).toBe('tutor')
    expect(routeDlIntent('   ')).toBe('tutor')
  })
})
