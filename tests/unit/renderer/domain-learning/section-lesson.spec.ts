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
 *
 * v8 增补（2026-09-15 用户口径）：有编号的大标题带底色（`.sec-head-numbered`）；
 * 「参考答案」是跟随区（不占章节编号、无序号徽标）。
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import SectionLesson from '../../../../src/renderer/src/views/domain-learning/SectionLesson.vue'
import type { DlCardView, DlCardSection } from '@shared/types/domain-learning.types'

const SFC_PATH = resolve(__dirname, '../../../../src/renderer/src/views/domain-learning/SectionLesson.vue')
const MARKDOWN_SCSS_PATH = resolve(__dirname, '../../../../src/renderer/src/views/domain-learning/lesson-markdown.scss')

const MdStub = { props: ['md'], template: '<div class="md-stub">{{ md }}</div>' }

/** 组件里用到的 Element Plus 组件在无插件环境下会刷警告，这里用 stub 静音（保留插槽内容以便断言） */
const STUBS = {
  MarkdownViewer: MdStub,
  'el-tag': { template: '<span class="el-tag-stub"><slot /></span>' },
  'el-empty': { template: '<div class="el-empty-stub"><slot /></div>' },
  'el-icon': { template: '<i class="el-icon-stub"><slot /></i>' },
}

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

  it('模板语义区有兜底标题（章节可辨识，不出现"无名章节"；v7 起 essence 折到「定义」）', () => {
    const w = mountLesson([{ key: 'essence', md: '本质是……' }])
    expect(w.find('.sec-title').text()).toBe('定义')
    expect(w.find('.sec-index').text()).toBe('1')
  })

  // 2026-09-15 用户口径「知识内容正文，有编号的大标题，增加底色突出一下」
  it('有编号的大标题带底色样式（sec-head-numbered）；无标题/相关区不加', () => {
    const w = mountLesson(TENSOR_LIKE)
    const heads = w.findAll('.sec-head')
    for (const head of heads) {
      expect(head.classes()).toContain('sec-head-numbered')
    }
    // 相关知识点/相关著作这类无编号标题行不加底色
    const withRelated = mount(SectionLesson, {
      props: {
        card: card([{ key: 'definition', title: '定义', md: 'x' }]),
        related: [{ conceptId: 'k2', name: '自动微分', rel: '后继' }],
      },
      global: { stubs: STUBS },
    })
    expect(withRelated.find('.sec-related .sec-head').classes()).not.toContain('sec-head-numbered')
  })

  // 2026-09-15 用户口径「有编号的大标题，字体加大一号」：样式表契约（happy-dom 不算版式，读 SFC 源码断言）
  it('有编号的大标题字号压过正文与正文小标题（sec-title 17px > h3 14.5px > 正文 14px）', () => {
    const src = readFileSync(SFC_PATH, 'utf8')
    const numbered = /\.sec-title\s*\{[\s\S]*?font-size:\s*([\d.]+)px/.exec(src)
    expect(numbered, '找不到 .sec-title 的字号声明').toBeTruthy()
    const numberedPx = Number(numbered![1])
    const follower = /\.sec-head-follower\s+\.sec-title\s*\{[\s\S]*?font-size:\s*([\d.]+)px/.exec(src)
    expect(follower, '找不到跟随区标题的字号声明').toBeTruthy()
    // 加大后必须明显大于正文（14px）与正文小标题（lesson-markdown.scss 的 h3 14.5px）
    expect(numberedPx).toBeGreaterThanOrEqual(17)
    expect(numberedPx).toBeGreaterThan(Number(follower![1]))
    const markdownScss = readFileSync(MARKDOWN_SCSS_PATH, 'utf8')
    const h3 = /h3\s*\{[\s\S]*?font-size:\s*([\d.]+)px/.exec(markdownScss)
    expect(h3, '找不到正文 h3 的字号声明').toBeTruthy()
    expect(numberedPx).toBeGreaterThan(Number(h3![1]))
  })

  // 2026-09-15 用户口径「章节还是太细碎」：参考答案不占章节编号
  it('参考答案是跟随区：无序号徽标、带 sec-head-follower，章节只数到自测', () => {
    const w = mountLesson([
      { key: 'definition', title: '定义', md: '张量是……' },
      { key: 'selfcheck', title: '自测', md: '**Q1** 题目' },
      { key: 'answers', title: '参考答案', md: '**A1** 答案', folded: true },
    ])
    expect(w.findAll('.sec-index').map((n) => n.text())).toEqual(['1', '2'])
    const follower = w.findAll('.sec')[2]
    expect(follower.find('.sec-head').classes()).toContain('sec-head-follower')
    expect(follower.find('.sec-index').exists()).toBe(false)
    expect(follower.find('.sec-title').text()).toBe('参考答案')
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

  // 2026-09-12 用户需求：证据来源要给出可点击的 URL
  describe('证据来源 / 相关著作的可点击链接', () => {
    const cardWithEvidence = (): DlCardView =>
      ({
        id: 'c1',
        conceptId: 'k1',
        essenceType: 'K-concept',
        sections: [{ key: 'definition', title: '定义', md: 'x' }],
        works: [{ kind: '论文', title: 'Bayes 1763', url: 'https://arxiv.org/abs/2106.02475' }],
        evidenceSources: [
          { kind: 'book', title: 'Deep Learning 第2章', url: 'https://www.deeplearningbook.org/contents/linear_algebra.html' },
          { kind: 'kb', title: '我的资料', kbDocId: 'doc-1' },
        ],
        version: 1,
        status: 'draft',
        verification: null,
      }) as unknown as DlCardView

    it('证据来源带 url 时渲染可点击链接（站点名 + target 语义 = window.open 走系统浏览器）', () => {
      const w = mount(SectionLesson, { props: { card: cardWithEvidence() }, global: { stubs: STUBS } })
      const links = w.findAll('.sec-evidence .work-link')
      expect(links.length).toBe(1) // 无 url 的那条不产生链接
      expect(links[0].text()).toContain('deeplearningbook.org')
      expect(links[0].attributes('href')).toBe('https://www.deeplearningbook.org/contents/linear_algebra.html')
      expect(w.find('.sec-evidence').text()).toContain('知识库文档')
    })

    it('相关著作的 url 也可点击', () => {
      const w = mount(SectionLesson, { props: { card: cardWithEvidence() }, global: { stubs: STUBS } })
      const link = w.find('.sec-works .work-link')
      expect(link.exists()).toBe(true)
      expect(link.text()).toContain('arxiv.org')
      expect(link.attributes('href')).toBe('https://arxiv.org/abs/2106.02475')
    })

    it('非法 url（javascript:）不渲染成链接（防外链注入）', () => {
      const c = cardWithEvidence()
      c.evidenceSources = [{ kind: 'x', title: 't', url: 'javascript:alert(1)' }]
      const w = mount(SectionLesson, { props: { card: c }, global: { stubs: STUBS } })
      expect(w.find('.sec-evidence .work-link').exists()).toBe(false)
      expect(w.find('.sec-evidence').html()).not.toContain('javascript:')
    })

    it('点击链接：走 window.open（Electron 主进程转 shell.openExternal），不做页面跳转', async () => {
      // 直接替换真实 window.open（不 stubGlobal window —— 那会破坏 happy-dom 的事件系统）
      const original = window.open
      const open = vi.fn()
      window.open = open as unknown as typeof window.open
      try {
        const w = mount(SectionLesson, { props: { card: cardWithEvidence() }, global: { stubs: STUBS } })
        await w.find('.sec-evidence .work-link').trigger('click')
        expect(open).toHaveBeenCalledWith(
          'https://www.deeplearningbook.org/contents/linear_algebra.html',
          '_blank',
          'noopener,noreferrer',
        )
      } finally {
        window.open = original
      }
    })
  })
})
