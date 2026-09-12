/**
 * 自测答案折叠纯函数测试（splitSelfCheckAnswers / isAnswerSection）
 * @module tests/unit/shared/lesson-selfcheck.spec
 *
 * 用户需求（2026-09-12）：学习内容中自测的答案默认折叠——读者先自己做，再展开对答案
 * （检索练习 M7）。本 spec 用真实讲义（深度学习·张量卡的自测区）的形状钉死切分口径。
 */

import { describe, it, expect } from 'vitest'
import { isAnswerSection, splitSelfCheckAnswers } from '@shared/utils/lesson-selfcheck'

describe('splitSelfCheckAnswers', () => {
  it('真实形状：`---` + `**答案**` 分隔 → 题目/答案切开，尾部横线并入裁掉', () => {
    const md = [
      '**Q1** 形状 `(32, 3, 224, 224)` 一共有多少个数？',
      '',
      '**Q2** 能手算 (4,1)+(1,3) 的结果形状吗？',
      '',
      '---',
      '',
      '**答案**',
      '',
      '- **A1** 224×224 = 50176；32×50176 = 4816896 个数。',
      '- **A2** 结果 (4,3)。',
    ].join('\n')
    const r = splitSelfCheckAnswers(md)
    expect(r.hasAnswers).toBe(true)
    expect(r.questions).toContain('**Q1**')
    expect(r.questions).toContain('**Q2**')
    expect(r.questions).not.toContain('---') // 多余横线裁掉（折叠面板自带分隔）
    expect(r.questions).not.toContain('A1')
    expect(r.answers).toContain('**A1**')
    expect(r.answers).toContain('**A2**')
  })

  it('markdown 标题式答案标记（### 答案与解析）同样切分', () => {
    const md = ['**Q1** 什么是最小二乘？', '', '### 答案与解析', '', 'A1 让残差平方和最小。'].join('\n')
    const r = splitSelfCheckAnswers(md)
    expect(r.hasAnswers).toBe(true)
    expect(r.questions.trim()).toBe('**Q1** 什么是最小二乘？')
    expect(r.answers).toBe('A1 让残差平方和最小。')
  })

  it('`参考答案：`（带冒号）/ `解答` / `标准答案` 都算标记', () => {
    for (const marker of ['参考答案：', '解答', '标准答案', '**正确答案**']) {
      const r = splitSelfCheckAnswers(`**Q1** 题目\n\n${marker}\n\nA1 答案内容`)
      expect(r.hasAnswers, marker).toBe(true)
      expect(r.answers, marker).toBe('A1 答案内容')
    }
  })

  it('行内答案（列表项里的 `- **答案**：…`）不算标记，原样返回', () => {
    const md = '对照表：\n\n- **答案**：这里的"答案"是讲解用语，不是自测答案区。\n\n继续讲解。'
    const r = splitSelfCheckAnswers(md)
    expect(r.hasAnswers).toBe(false)
    expect(r.questions).toBe(md)
    expect(r.answers).toBe('')
  })

  it('没有答案标记 → 整段都是题目', () => {
    const r = splitSelfCheckAnswers('**Q1** 第一题\n\n**Q2** 第二题')
    expect(r.hasAnswers).toBe(false)
    expect(r.answers).toBe('')
    expect(r.questions).toContain('Q1')
  })

  it('只有"答案"没有内容 → 不切分（避免产生空答案块）', () => {
    const md = '**Q1** 题目\n\n**答案**\n\n'
    const r = splitSelfCheckAnswers(md)
    expect(r.hasAnswers).toBe(false)
    expect(r.questions).toBe(md)
  })

  it('标记前没有题目（整区就是答案）→ 不切分（由 isAnswerSection 整区折叠兜底）', () => {
    const md = '**答案**\n\n- A1 xxx'
    const r = splitSelfCheckAnswers(md)
    expect(r.hasAnswers).toBe(false)
    expect(r.questions).toBe(md)
    expect(r.answers).toBe('')
  })

  it('多个答案标记 → 在第一个处切分', () => {
    const r = splitSelfCheckAnswers('**Q1** 题\n\n**答案**\n\nA1\n\n**答案**\n\nA2')
    expect(r.hasAnswers).toBe(true)
    expect(r.answers).toContain('A1')
    expect(r.answers).toContain('A2')
  })

  it('空输入安全', () => {
    expect(splitSelfCheckAnswers('')).toEqual({ questions: '', answers: '', hasAnswers: false })
  })
})

describe('isAnswerSection（整区就是答案 → 默认折叠）', () => {
  it('key 命中答案区', () => {
    expect(isAnswerSection({ key: 'answers' })).toBe(true)
    expect(isAnswerSection({ key: 'selfcheck-answers' })).toBe(true)
    expect(isAnswerSection({ key: 'solution' })).toBe(true)
    expect(isAnswerSection({ key: 'selfcheck' })).toBe(false)
  })

  it('标题以 答案/参考答案/解答/解析 开头', () => {
    expect(isAnswerSection({ key: 'x', title: '答案' })).toBe(true)
    expect(isAnswerSection({ key: 'x', title: '参考答案与解析' })).toBe(true)
    expect(isAnswerSection({ key: 'x', title: '解答' })).toBe(true)
    expect(isAnswerSection({ key: 'x', title: '解析' })).toBe(true)
  })

  it('自测区（题目+答案）不算答案区——它靠区内的答案标记折叠', () => {
    expect(isAnswerSection({ key: 'selfcheck', title: '自测（先自己做，再对答案）' })).toBe(false)
    expect(isAnswerSection({ key: 'review', title: '检验' })).toBe(false)
    expect(isAnswerSection({})).toBe(false)
  })
})
