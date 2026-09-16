// @vitest-environment happy-dom
/**
 * 讲义「版式设备」渲染 + 规格条（2026-09-14 用户反馈落地）
 * @module tests/unit/renderer/domain-learning/lesson-devices.spec
 *
 * 背景（用户原话）：「生成讲义功能太简陋……不美观，纯粹的堆砌文字，没有对文字做精炼归纳，
 * 没有配图，布局单调简陋」。
 *
 * 本 spec 钉死渲染层的可见结果：
 * - 区正文按 layout 渲染成要点卡/步骤条/数据看点/勾选清单/时间线（不再是"一堵字"）；
 * - 一句话结论（takeaway）显示在正文之前；
 * - 非正文版式挂版式徽标（读者一眼知道这一区是什么形态）；
 * - 有已确认规格时出规格条 + 区导航（点击跳区）；
 * - 区级「重写此区」把该区上抛（定点重写，不整篇重来）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SectionLesson from '../../../../src/renderer/src/views/domain-learning/SectionLesson.vue'
import type { DlCardView, DlCardSection, DlLessonSpec } from '../../../../src/shared/types/domain-learning.types'

const MdStub = { props: ['md'], template: '<div class="md-stub">{{ md }}</div>' }

const STUBS = {
  MarkdownViewer: MdStub,
  LessonSectionBody: false, // 设备渲染是本次被测对象，用真实实现
  'el-tag': { template: '<span class="el-tag-stub"><slot /></span>' },
  'el-empty': { template: '<div class="el-empty-stub"><slot /></div>' },
  'el-icon': { template: '<i class="el-icon-stub"><slot /></i>' },
  'el-tooltip': { template: '<span class="el-tooltip-stub"><slot /></span>' },
}

function spec(over: Partial<DlLessonSpec> = {}): DlLessonSpec {
  return {
    audience: '会 Python、没学过线性代数的后端工程师',
    outcomes: ['能算出 (4,1)+(1,3) 广播后的形状'],
    depth: '入门',
    budget: { sections: 5, charsPerSection: 400 },
    tone: '生活类比先行',
    glossary: [{ term: '广播', plain: '形状不同也能相加的对齐规则' }],
    notation: [{ symbol: '⊗', read: '逐元素相乘', example: '[1,2]⊗[3,4]=[3,8]' }],
    exampleParams: [{ name: '学习率', value: '0.01' }],
    roster: [
      { key: 'meta', layout: 'keypoints', job: '让读者判断自己能不能学', carrier: 'points', takeaway: '会四则运算即可' },
      { key: 'structure', layout: 'compare', job: '把运算摆成一张对照表', carrier: 'table' },
    ],
    visualPlan: '形状用 shape 图，运算用对照表',
    ...over,
  }
}

function card(sections: DlCardSection[], withSpec = false): DlCardView {
  return {
    id: 'c1',
    conceptId: 'k1',
    essenceType: 'K-concept',
    sections,
    version: 1,
    status: 'draft',
    spec: withSpec ? spec() : null,
  } as unknown as DlCardView
}

function mountLesson(sections: DlCardSection[], withSpec = false) {
  return mount(SectionLesson, {
    props: { card: card(sections, withSpec) },
    global: { stubs: STUBS },
  })
}

describe('讲义版式设备渲染', () => {
  it('要点卡：列表行渲染成卡片（标题 + 说明），不再是 markdown 段落', () => {
    const w = mountLesson([
      { key: 'why', layout: 'keypoints', md: '- **省时间**：少写循环\n- **少出错**：形状自动对齐' },
    ])
    const cards = w.findAll('.ld-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('省时间')
    expect(cards[0].text()).toContain('少写循环')
    // 已变成卡片的列表行不再重复出现在 markdown 里
    expect(w.findAll('.md-stub')).toHaveLength(0)
  })

  it('要点卡：列表之外的说明段仍然渲染（不吞内容）', () => {
    const w = mountLesson([
      { key: 'why', layout: 'keypoints', md: '先说结论。\n\n- **省时间**：少写循环' },
    ])
    expect(w.findAll('.ld-card')).toHaveLength(1)
    expect(w.findAll('.md-stub').map((n) => n.text()).join('|')).toContain('先说结论')
  })

  it('步骤条：有序列表渲染成带序号的步骤（含竖向连接）', () => {
    const w = mountLesson([
      { key: 'procedure', layout: 'steps', md: '1. **取形状**：读出两个 shape\n2. **看广播**：逐轴比对' },
    ])
    const steps = w.findAll('.ld-step')
    expect(steps).toHaveLength(2)
    expect(steps[0].find('.ld-step-no').text()).toBe('1')
    expect(steps[1].text()).toContain('看广播')
  })

  it('数据看点：`值 | 说明` 渲染成大字 + 说明', () => {
    const w = mountLesson([
      { key: 'detail', layout: 'stats', md: '- 68% | 命中率 | 换数据集会掉\n- 2.1x | 速度提升' },
    ])
    const stats = w.findAll('.ld-stat')
    expect(stats).toHaveLength(2)
    expect(stats[0].find('.ld-stat-value').text()).toBe('68%')
    expect(stats[0].find('.ld-stat-label').text()).toBe('命中率')
    expect(stats[0].find('.ld-stat-note').text()).toBe('换数据集会掉')
  })

  it('上手清单：勾选项渲染成清单（已完成划线）', () => {
    const w = mountLesson([
      { key: 'procedure', layout: 'checklist', md: '- [x] 装好环境\n- [ ] 跑通示例' },
    ])
    const items = w.findAll('.ld-check')
    expect(items).toHaveLength(2)
    expect(items[0].classes()).toContain('done')
    expect(items[1].classes()).not.toContain('done')
  })

  it('时间线：`标记：事件` 渲染成脉络条目', () => {
    const w = mountLesson([
      { key: 'detail', layout: 'timeline', md: '- 2012：AlexNet 夺冠\n- 2017：Transformer 提出' },
    ])
    const items = w.findAll('.ld-tl-item')
    expect(items).toHaveLength(2)
    expect(items[0].find('.ld-tl-marker').text()).toBe('2012')
    expect(items[1].text()).toContain('Transformer')
  })

  it('正文/图解类版式仍走 markdown（图由 ```figure 渲染），并带版式装饰类', () => {
    const w = mountLesson([
      { key: 'essence', layout: 'figure', md: '```figure\n{"type":"shape","dims":[4,3]}\n```' },
    ])
    expect(w.find('.ld-figure').exists()).toBe(true)
    expect(w.find('.md-stub').text()).toContain('figure')
  })

  it('一句话结论（takeaway）在正文之前显示', () => {
    const w = mountLesson([{ key: 'definition', md: '张量是带形状的数组。', takeaway: '它=数组+形状' }])
    const strip = w.find('.sec-takeaway')
    expect(strip.exists()).toBe(true)
    expect(strip.text()).toBe('它=数组+形状')
  })

  it('非正文版式挂徽标；正文（prose）不挂（避免每区都是花哨标签）', () => {
    const w = mountLesson([
      { key: 'why', layout: 'keypoints', md: '- **要点一**：说明\n- **要点二**：说明' },
      { key: 'definition', md: '张量是带形状的多维数组。' },
    ])
    const badges = w.findAll('.sec-badge').map((b) => b.text())
    expect(badges).toEqual(['要点卡'])
  })
})

describe('讲义规格条与区导航', () => {
  it('无已确认规格（老卡）时不渲染规格条（不猜内容）', () => {
    const w = mountLesson([{ key: 'definition', md: '定义。' }])
    expect(w.find('.lesson-spec-bar').exists()).toBe(false)
  })

  it('有规格时出规格条：读者画像 + 深度篇幅 + 区导航（含版式名）', () => {
    const w = mountLesson(
      [
        { key: 'meta', layout: 'keypoints', md: '- **读者画像**：会 Python\n- **学完能做到**：能算广播', takeaway: '会四则运算即可' },
        { key: 'structure', layout: 'compare', md: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
      ],
      true,
    )
    const bar = w.find('.lesson-spec-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('会 Python、没学过线性代数的后端工程师')
    expect(bar.text()).toContain('入门')
    expect(bar.text()).toContain('每区 ≤400 字')
    const nav = w.findAll('.lsb-nav-chip')
    expect(nav).toHaveLength(2)
    expect(nav[0].text()).toContain('学习前必读')
    expect(nav[0].text()).toContain('要点卡')
    expect(nav[1].text()).toContain('对比表')
  })

  it('点区导航 → 跳到该区锚点（渲染层给出可跳转的 id）', () => {
    const w = mountLesson(
      [
        { key: 'meta', layout: 'keypoints', md: '- **读者画像**：会 Python\n- **学完能做到**：能算广播' },
        { key: 'definition', md: '张量是带形状的数组。' },
      ],
      true,
    )
    // 锚点存在（jump 的落点）
    const sections = w.findAll('.sec')
    expect(sections[0].attributes('id')).toBe('dl-sec-0')
    expect(sections[1].attributes('id')).toBe('dl-sec-1')
    // 点击导航 chip 不抛错（happy-dom 无布局，scrollIntoView 可能是 undefined）
    void w.findAll('.lsb-nav-chip')[1].trigger('click')
  })

  it('展开规格明细能看到术语/记号/示例参数/视觉计划（读者可核对口径）', async () => {
    const w = mountLesson([{ key: 'definition', md: '定义。' }], true)
    await w.find('.lsb-toggle').trigger('click')
    const text = w.find('.lesson-spec-bar').text()
    expect(text).toContain('学完能做到')
    expect(text).toContain('广播')
    expect(text).toContain('⊗')
    expect(text).toContain('学习率=0.01')
    expect(text).toContain('形状用 shape 图')
  })
})

describe('区级「重写此区」', () => {
  it('点击把该区原对象上抛（父级据此驱动定点重写，不整篇重来）', async () => {
    const w = mountLesson([
      { key: 'definition', layout: 'prose', md: '定义。' },
      { key: 'structure', layout: 'compare', md: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
    ])
    await w.findAll('.sec-actions .sec-rewrite')[1].trigger('click')
    const emitted = w.emitted('rewriteSection')
    expect(emitted).toBeTruthy()
    expect((emitted![0][0] as DlCardSection).key).toBe('structure')
  })
})
