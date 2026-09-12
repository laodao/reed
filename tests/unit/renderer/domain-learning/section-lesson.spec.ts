// @vitest-environment happy-dom
/**
 * 讲义区渲染契约（SectionLesson）
 * @module tests/unit/renderer/domain-learning/section-lesson.spec
 *
 * 背景（2026-09-12 用户反馈）：
 * - 「编写注记（学习者可跳过）这部分右侧的展开全文和这块没懂重叠了」：注记区被当成正文
 *   章节渲染，标题行右侧的「展开全文」与右上角绝对定位的「这块没懂」叠在一起；
 * - 「没有明显的章节区分」：章节没有序号、标题与正文层级不清。
 *
 * 本 spec 钉死渲染层的结构契约（MarkdownViewer 用 stub 替换，避免拉起重型编辑器）：
 * - 每个正文章节都有标题行 + 序号，区级动作都收在同一行 `.sec-actions` 内；
 * - 页面里不再存在绝对定位的右上角「这块没懂」；
 * - 编写注记是**唯一的置底折叠面板**，不再是正文章节。
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SectionLesson from '../../../../src/renderer/src/views/domain-learning/SectionLesson.vue'
import type { DlCardView, DlCardSection } from '@shared/types/domain-learning.types'

const MdStub = { props: ['md'], template: '<div class="md-stub">{{ md }}</div>' }

/** 组件里用到的 Element Plus 组件在无插件环境下会刷警告，这里用 stub 静音 */
const STUBS = { MarkdownViewer: MdStub, 'el-tag': true, 'el-empty': true }

function card(sections: DlCardSection[]): DlCardView {
  return {
    id: 'c1',
    conceptId: 'k1',
    essenceType: 'K-concept',
    sections,
    works: undefined,
    contentMd: undefined,
    evidenceSources: undefined,
    version: 1,
    status: 'draft',
    verification: null,
  } as unknown as DlCardView
}

function mountLesson(sections: DlCardSection[], related: Array<{ conceptId: string; name: string; rel?: string }> = []) {
  return mount(SectionLesson, {
    props: { card: card(sections), related: related as never },
    global: { stubs: STUBS },
  })
}

const TENSOR_LIKE: DlCardSection[] = [
  { key: 'meta', title: '本讲说明', md: '读者画像：会用 Python。', style: 'note' },
  { key: 'definition', title: '定义：张量到底是什么', md: '张量是……' },
  { key: 'rules', title: '三类核心运算', md: '规则一……' },
  { key: 'justification', title: '依据/证明', md: '推导……', folded: true },
  {
    key: 'notes',
    title: '编写注记（学习者可跳过）',
    md: '- 采集情况：web_search 429\n- 数值自检：已重算',
    folded: true,
  },
]

describe('SectionLesson 章节结构', () => {
  it('正文章节按序编号（编写注记区不占编号）', () => {
    const w = mountLesson(TENSOR_LIKE)
    const indexes = w.findAll('.sec-index').map((n) => n.text())
    expect(indexes).toEqual(['1', '2', '3', '4'])
    expect(w.findAll('.sec-title').map((n) => n.text())).toEqual([
      '本讲说明',
      '定义：张量到底是什么',
      '三类核心运算',
      '依据/证明',
    ])
  })

  it('「这块没懂」与「展开全文」在同一标题行动作区内（不再两处叠放）', () => {
    const w = mountLesson(TENSOR_LIKE)
    // 每个正文章节都有动作区，且区级「这块没懂」都在动作区内
    const heads = w.findAll('.sec-head')
    expect(heads.length).toBe(4)
    expect(w.findAll('.sec-head > .sec-actions > .sec-confuse').length).toBe(4)
    // 折叠区的「展开全文」也在同一个动作区内（与这块没懂同容器 → 同行不重叠）
    const foldedHead = heads[3]
    expect(foldedHead.find('.sec-actions .sec-confuse').exists()).toBe(true)
    expect(foldedHead.find('.sec-actions .fold-hint').exists()).toBe(true)
    // 没有任何脱离标题行的右上角悬浮「这块没懂」
    expect(w.findAll('.sec > .sec-confuse').length).toBe(0)
  })

  it('编写注记不是正文章节：不进标题序号，只在置底折叠面板里出现', () => {
    const w = mountLesson(TENSOR_LIKE)
    // 正文里没有「编写注记」章节标题
    expect(w.findAll('.sec-title').map((n) => n.text())).not.toContain('编写注记（学习者可跳过）')
    // 置底面板：默认收起，只有入口行
    const panel = w.find('.authoring-notes')
    expect(panel.exists()).toBe(true)
    expect(panel.find('.notes-list').exists()).toBe(false)
    expect(panel.text()).toContain('编写注记（学习者可跳过）')
    expect(panel.text()).toContain('2 条')
  })

  it('点开编写注记后逐条列出（学习者可跳过、默认不占用版面）', async () => {
    const w = mountLesson(TENSOR_LIKE)
    await w.find('.authoring-notes .notes-toggle').trigger('click')
    const items = w.findAll('.authoring-notes .notes-list li').map((n) => n.text())
    expect(items).toEqual(['采集情况：web_search 429', '数值自检：已重算'])
  })

  it('正文里剥离出的注记也进同一面板（带区名前缀）', async () => {
    const w = mountLesson([
      { key: 'code', title: '落到代码', md: '正常正文。\n\n⚠️ 默认 dtype 属先验，未取得官方文档原文。' },
    ])
    expect(w.find('.md-stub').text()).toBe('正常正文。')
    await w.find('.authoring-notes .notes-toggle').trigger('click')
    expect(w.find('.authoring-notes .notes-list li').text()).toContain('【落到代码】')
  })

  it('折叠区默认收起，点「展开全文」才显示正文', async () => {
    const w = mountLesson(TENSOR_LIKE)
    const folded = w.findAll('.sec')[3]
    expect(folded.find('.sec-body').exists()).toBe(false)
    await folded.find('.fold-hint').trigger('click')
    expect(folded.find('.sec-body').exists()).toBe(true)
  })

  it('标题无法解析的区不显示标题行，但区级动作仍可用（无重叠隐患）', () => {
    const w = mountLesson([{ key: 'misc-block', md: '一段补充说明。' }])
    const head = w.find('.sec-head')
    expect(head.classes()).toContain('sec-head-bare')
    expect(head.find('.sec-title').exists()).toBe(false)
    expect(head.find('.sec-actions .sec-confuse').exists()).toBe(true)
  })

  it('essence 等模板语义区有兜底标题（章节可辨识，不出现"无名章节"）', () => {
    const w = mountLesson([{ key: 'essence', md: '本质是……' }])
    expect(w.find('.sec-title').text()).toBe('本质')
    expect(w.find('.sec-index').text()).toBe('1')
  })

  it('「这块没懂」回传原区对象（下标映射不因剔除注记区而错位）', async () => {
    const w = mountLesson(TENSOR_LIKE)
    await w.findAll('.sec-actions .sec-confuse')[2].trigger('click')
    const emitted = w.emitted('notUnderstand')
    expect(emitted).toBeTruthy()
    expect((emitted![0][0] as DlCardSection).key).toBe('rules')
  })

  it('相关知识点与相关著作区不参与编号', () => {
    const w = mount(SectionLesson, {
      props: {
        card: card([{ key: 'definition', title: '定义', md: 'x' }]),
        related: [{ conceptId: 'k2', name: '自动微分', rel: '后继' }],
      },
      global: { stubs: STUBS },
    })
    expect(w.findAll('.sec-index').length).toBe(1)
    expect(w.find('.sec-related').text()).toContain('自动微分')
  })

  // 2026-09-12 用户需求：自测的答案默认折叠
  describe('自测答案默认折叠', () => {
    const SELF_CHECK: DlCardSection[] = [
      { key: 'meta', title: '学习前必读', md: '前置：无' },
      {
        key: 'selfcheck',
        title: '自测（先自己做，再对答案）',
        md: ['**Q1** 形状 (32,3,224,224) 有多少个数？', '', '---', '', '**答案**', '', '- **A1** 4816896 个。'].join('\n'),
      },
    ]

    it('题目立即可见；答案默认收起，只显示「显示答案」入口', () => {
      const w = mountLesson(SELF_CHECK)
      expect(w.text()).toContain('Q1')
      const answers = w.find('.selfcheck-answers')
      expect(answers.exists()).toBe(true)
      expect(answers.text()).toContain('显示答案（建议先自己做）')
      // 答案内容不在 DOM（未展开）
      expect(w.text()).not.toContain('4816896')
      expect(w.findAll('.md-stub').map((n) => n.text()).join('|')).not.toContain('A1')
    })

    it('点击后展开答案；再点收起', async () => {
      const w = mountLesson(SELF_CHECK)
      await w.find('.selfcheck-answers .answers-toggle').trigger('click')
      expect(w.find('.selfcheck-answers .answers-body').exists()).toBe(true)
      expect(w.find('.selfcheck-answers').text()).toContain('收起答案')
      expect(w.text()).toContain('4816896')
      await w.find('.selfcheck-answers .answers-toggle').trigger('click')
      expect(w.find('.selfcheck-answers .answers-body').exists()).toBe(false)
    })

    it('没有答案区的讲义不显示该入口', () => {
      const w = mountLesson([{ key: 'definition', title: '定义', md: '张量是……' }])
      expect(w.find('.selfcheck-answers').exists()).toBe(false)
    })

    it('各区的答案折叠态互相独立（按区下标）', async () => {
      const w = mountLesson([
        { key: 'selfcheck', title: '自测一', md: '**Q1** 甲\n\n**答案**\n\nA1 甲答' },
        { key: 'review', title: '自测二', md: '**Q2** 乙\n\n**答案**\n\nA2 乙答' },
      ])
      const toggles = w.findAll('.selfcheck-answers .answers-toggle')
      expect(toggles.length).toBe(2)
      await toggles[0].trigger('click')
      expect(w.findAll('.selfcheck-answers')[0].find('.answers-body').exists()).toBe(true)
      expect(w.findAll('.selfcheck-answers')[1].find('.answers-body').exists()).toBe(false)
    })
  })
})
