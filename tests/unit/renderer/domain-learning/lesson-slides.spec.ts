// @vitest-environment happy-dom
/**
 * 讲义幻灯片页切分（LessonSlides）
 * @module tests/unit/renderer/domain-learning/lesson-slides.spec
 *
 * 2026-09-12 用户需求：自测的答案默认折叠。幻灯片场景的等价做法是**答案单独成页**——
 * 讲者先出题，讲到再翻页对答案（避免答案和题目同屏、读者一眼看到答案）。
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LessonSlides from '../../../../src/renderer/src/views/domain-learning/LessonSlides.vue'
import type { DlCardSection } from '@shared/types/domain-learning.types'

const MdStub = { props: ['md'], template: '<div class="md-stub">{{ md }}</div>' }

function mountSlides(sections: DlCardSection[]) {
  return mount(LessonSlides, {
    props: { title: '张量', subTitle: '工作应用', sections },
    global: { plugins: [ElementPlus], stubs: { MarkdownViewer: MdStub } },
  })
}

const SECTIONS: DlCardSection[] = [
  { key: 'meta', title: '学习前必读', md: '前置：无' },
  { key: 'definition', title: '定义', md: '张量是……' },
  {
    key: 'selfcheck',
    title: '自测',
    md: ['**Q1** 有多少个数？', '', '---', '', '**答案**', '', '- **A1** 4816896 个。'].join('\n'),
  },
]

describe('LessonSlides 页切分', () => {
  it('自测答案单独成页（题目页不含答案）', () => {
    const w = mountSlides(SECTIONS)
    // 封面 + 3 个区（自测拆成 题目/答案 两页）= 5 页
    expect(w.find('.slides-count').text()).toContain('1 / 5')
  })

  it('翻到自测题目页：只见题目，不见答案', async () => {
    const w = mountSlides(SECTIONS)
    const next = w.findAll('button').filter((b) => b.text().includes('下一页'))[0]
    // 封面 → meta → definition → selfcheck（题目）
    await next.trigger('click')
    await next.trigger('click')
    await next.trigger('click')
    expect(w.find('.slide-head h3').text()).toBe('自测')
    expect(w.find('.slide-body').text()).toContain('Q1')
    expect(w.find('.slide-body').text()).not.toContain('4816896')
  })

  it('再翻一页是「自测 · 参考答案」页', async () => {
    const w = mountSlides(SECTIONS)
    const next = w.findAll('button').filter((b) => b.text().includes('下一页'))[0]
    for (let i = 0; i < 4; i++) await next.trigger('click')
    expect(w.find('.slide-head h3').text()).toBe('自测 · 参考答案')
    expect(w.find('.slide-body').text()).toContain('4816896')
  })

  it('没有答案区的讲义不额外产生页', () => {
    const w = mountSlides([{ key: 'definition', title: '定义', md: '张量是……' }])
    expect(w.find('.slides-count').text()).toContain('1 / 2') // 封面 + 1 区（无著作页）
  })
})
