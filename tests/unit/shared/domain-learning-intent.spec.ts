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

  // ===== 复盘修复（2026-09-09）：意图路由误判反例（会话层审计 5 句实测 + 边界） =====

  it('对话性"梳理/归纳/整理"无产出宾语 → tutor（不再被强词误伤）', () => {
    const cases = [
      '我不太懂贝叶斯公式，帮我把推导的思路再梳理一遍', // 审计句1：答疑重讲被误路由 task
      '把全概率公式的证明再给我归纳一下',
      '这段讲义的逻辑帮我理一理',
      '先验概率和似然有什么不同？哪个更常被搞混', // 审计句3
      '贝叶斯公式的分母为什么这样展开，再讲讲',
    ]
    for (const q of cases) expect(routeDlIntent(q), q).toBe('tutor')
  })

  it('产出型宾语（提纲/表格/大纲/笔记/合集）配弱词 → task', () => {
    const cases = [
      '把这周学的内容整理成一份复习提纲，发我', // 审计句4
      '把这几篇论文的核心观点做成一张对比表给我', // 审计句2：对比表漏检
      '梳理一下这门课的知识大纲',
      '把答疑里好的讲解收集成一份学习笔记',
      '归纳最近学过的几个定理，做一份合集',
    ]
    for (const q of cases) expect(routeDlIntent(q), q).toBe('task')
  })

  it('时效检索（查最近/最新+资讯词）→ task', () => {
    const cases = [
      '查一下最近三天这个领域有什么新论文', // 审计句5：字面粘连漏检
      '搜索一下最新的开源大模型进展',
      '最近这个方向有什么新动态？帮我查查',
      '查查这几天领域内有什么重要新闻',
    ]
    for (const q of cases) expect(routeDlIntent(q), q).toBe('task')
  })

  it('纯"最近进展"资讯问但无检索动作词且无产出 → tutor 不误送（拿不准回 tutor）', () => {
    const cases = ['这个领域最近难学吗', '最近的复习安排要调整吗']
    for (const q of cases) expect(routeDlIntent(q), q).toBe('tutor')
  })

  // ===== 2026-09-12：建图/改图指令（用户"左侧知识点不够完善，能追加吗"） =====

  it('追加/补全知识点与前置关系类指令 → task（否则只会在答疑里得到一段建议文字）', () => {
    const cases = [
      '帮我追加几个知识点：导数与链式法则、计算图',
      '添加一个知识点「反向传播」',
      '新增概念：链式法则',
      '补充一下这个领域缺的前置知识点',
      '补全知识地图',
      '完善知识体系，把缺的台阶补上',
      '追加一条前置边：张量 → 导数与链式法则',
      '建立前置关系图',
      '把前置关系补上',
      '这些前置连上',
    ]
    for (const q of cases) expect(routeDlIntent(q), q).toBe('task')
  })

  it('答疑里的"补充/讲解前置"类说法仍走 tutor（不误送任务）', () => {
    const cases = [
      '补充一下这个前置的推导过程',
      '这个前置关系我还是没懂，再讲讲',
      '为什么这个前置知识点必须先学？',
      '把这段的推理关系再梳理一遍',
    ]
    for (const q of cases) expect(routeDlIntent(q), q).toBe('tutor')
  })
})
