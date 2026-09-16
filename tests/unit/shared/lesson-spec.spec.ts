/**
 * 讲义「设计规格」契约（纯函数；2026-09-14 用户反馈落地）
 * @module tests/unit/shared/lesson-spec.spec
 *
 * 参考 ppt-master 的 `design_spec.md` + `spec_lock.md` + §IX 页级 roster：
 * 生成讲义前先把「读者是谁、学完能做到什么、多深多长、术语/记号怎么教、全讲用哪套算例数字、
 * 每个区用什么版式承载什么」写成一份规格，用户确认后它成为**写作锁**；
 * 落库时按它校验（区集/版式/载体一致），保证「Plan 与 Do 不是两张皮」。
 */
import { describe, it, expect } from 'vitest'
import {
  LESSON_SPEC_BUDGET_LIMITS,
  checkLessonSpecAgreement,
  lessonSpecLock,
  normalizeCarrier,
  normalizeLessonSpec,
  summarizeLessonSpec,
} from '@shared/utils/lesson-spec'

/** 一份合法的规格草案（模型应产出的形状） */
function draft(over: Record<string, unknown> = {}): unknown {
  return {
    audience: '会 Python、没学过线性代数的后端工程师',
    outcomes: ['能说出张量的形状规则', '能算出 (4,1)+(1,3) 广播后的形状'],
    depth: '入门',
    budget: { sections: 6, charsPerSection: 380 },
    tone: '生活类比先行，不堆术语',
    glossary: [{ term: '广播', plain: '形状不同也能相加的自动对齐规则' }],
    notation: [{ symbol: '⊗', read: '逐元素相乘', example: '[1,2]⊗[3,4]=[3,8]' }],
    exampleParams: [{ name: '学习率', value: '0.01' }],
    roster: [
      { key: 'meta', layout: 'keypoints', job: '让读者判断自己能不能学', carrier: 'points', takeaway: '会四则运算即可' },
      { key: 'definition', layout: 'prose', job: '给出张量的正式定义' },
      { key: 'examples', layout: 'figure', job: '用一张形状图看懂广播', carrier: 'figure' },
      { key: 'selfcheck', layout: 'qa', job: '检验能否自己算广播', carrier: null },
    ],
    visualPlan: '形状规则用 shape 图，运算对比用一张表',
    ...over,
  }
}

const SECTIONS = [
  { key: 'meta', md: '- **读者画像**：会 Python\n- **学完能做到**：能说出形状规则', layout: 'keypoints', takeaway: '会四则运算即可' },
  { key: 'definition', md: '张量是带形状的多维数组。', layout: 'prose' },
  {
    key: 'examples',
    md: '```figure\n{"type":"shape","dims":[4,3],"labels":["行","列"]}\n```',
    layout: 'figure',
  },
  { key: 'selfcheck', md: '1. (4,1) 与 (1,3) 广播后是什么形状？', layout: 'qa' },
]

describe('讲义规格归一化', () => {
  it('合法草案：字段齐全、别名版式归一到规范设备', () => {
    const r = normalizeLessonSpec(draft({ roster: [{ key: 'meta', layout: 'points', job: '让读者自测门槛' }] }), 'K-concept')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.audience).toContain('后端工程师')
    expect(r.value.outcomes).toHaveLength(2)
    expect(r.value.roster[0].layout).toBe('keypoints')
    expect(r.changes.join('；')).toContain('points')
  })

  it('读者画像缺失 → 拒绝并说明要写什么（规格不能空转）', () => {
    const r = normalizeLessonSpec(draft({ audience: '' }), 'K-concept')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('audience')
  })

  it('学完能做到缺失/全是空串 → 拒绝（没有可测目标就不算规格）', () => {
    const r = normalizeLessonSpec(draft({ outcomes: ['  '] }), 'K-concept')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('outcomes')
  })

  it('区级计划为空 → 拒绝（必须有 roster，才能逐区精写）', () => {
    const r = normalizeLessonSpec(draft({ roster: [] }), 'K-concept')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('roster')
  })

  it('roster 用了该本质类型不允许的区 → 拒绝并列出可用区（与落库门禁同源）', () => {
    const r = normalizeLessonSpec(
      draft({ roster: [{ key: 'practice', layout: 'qa', job: '随便练' }] }),
      'K-concept',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('practice')
    expect(r.reason).toContain('meta')
  })

  it('roster 顺序不符合模板区序 → 拒绝（先例后律、自测收尾）', () => {
    const r = normalizeLessonSpec(
      draft({
        roster: [
          { key: 'selfcheck', layout: 'qa', job: '检验' },
          { key: 'definition', layout: 'prose', job: '定义' },
        ],
      }),
      'K-concept',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('顺序')
  })

  it('篇幅预算越界 → 收到合法区间并记变更（不静默接受畸形值）', () => {
    const r = normalizeLessonSpec(draft({ budget: { sections: 999, charsPerSection: 10 } }), 'K-concept')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.budget.sections).toBe(LESSON_SPEC_BUDGET_LIMITS.maxSections)
    expect(r.value.budget.charsPerSection).toBe(LESSON_SPEC_BUDGET_LIMITS.minCharsPerSection)
    expect(r.changes.join('；')).toContain('篇幅')
  })

  it('空条目被丢弃、重复项去重（术语表/记号表/示例参数）', () => {
    const r = normalizeLessonSpec(
      draft({
        glossary: [{ term: '广播', plain: '对齐规则' }, { term: '广播', plain: '重复' }, { term: '', plain: 'x' }],
        notation: [{ symbol: '', read: 'x' }, { symbol: 'Σ', read: '求和' }],
        exampleParams: [{ name: '学习率', value: '0.01' }, { name: '', value: '1' }],
      }),
      'K-concept',
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.glossary).toEqual([{ term: '广播', plain: '对齐规则' }])
    expect(r.value.notation).toEqual([{ symbol: 'Σ', read: '求和', example: null }])
    expect(r.value.exampleParams).toEqual([{ name: '学习率', value: '0.01' }])
  })

  it('roster 缺 job → 用版式用途兜底并记变更（不因一句漏写整份规格作废）', () => {
    const r = normalizeLessonSpec(
      draft({ roster: [{ key: 'meta', layout: 'keypoints' }, { key: 'definition', layout: 'prose' }] }),
      'K-concept',
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.roster[0].job.length).toBeGreaterThan(0)
    expect(r.changes.join('；')).toContain('读者动作')
  })

  it('非对象入参 → 拒绝（不抛异常）', () => {
    expect(normalizeLessonSpec(null, 'K-concept').ok).toBe(false)
    expect(normalizeLessonSpec('一段话', 'K-concept').ok).toBe(false)
  })

  it('载体词归一：图/表/公式/代码/要点/数据 的中英文写法都认', () => {
    expect(normalizeCarrier('图')).toBe('figure')
    expect(normalizeCarrier('对比表')).toBe('table')
    expect(normalizeCarrier('公式')).toBe('formula')
    expect(normalizeCarrier('js')).toBe('code')
    expect(normalizeCarrier('要点')).toBe('points')
    expect(normalizeCarrier('数据')).toBe('stats')
    expect(normalizeCarrier('')).toBe(null)
    expect(normalizeCarrier(null)).toBe(null)
    // 认不出的写法原样保留（质检按文本匹配，不因词表不全而放行）
    expect(normalizeCarrier('形状示意图')).toBe('形状示意图')
  })
})

describe('规格与落库区集的一致性（Plan 与 Do 不能两张皮）', () => {
  const spec = (() => {
    const r = normalizeLessonSpec(draft(), 'K-concept')
    if (!r.ok) throw new Error('draft 应合法')
    return r.value
  })()

  it('一致时无阻断（区集顺序一致 + 版式一致 + 载体齐）', () => {
    const r = checkLessonSpecAgreement({ essenceType: 'K-concept', spec, sections: SECTIONS })
    expect(r.ok).toBe(true)
    expect(r.blocking).toHaveLength(0)
  })

  it('区集与大纲不一致（少了/多了/换序）→ 阻断，并给出两边差异', () => {
    const r = checkLessonSpecAgreement({
      essenceType: 'K-concept',
      spec,
      sections: [SECTIONS[0], SECTIONS[2]], // 少了 examples/selfcheck
    })
    expect(r.ok).toBe(false)
    const issue = r.blocking.find((i) => i.code === 'roster-mismatch')!
    expect(issue.message).toContain('examples')
    expect(issue.fix).toContain('大纲')
  })

  it('区版式与大纲不符 → 警告（渲染会按大纲纠正，不必打断生成）', () => {
    const drifted = SECTIONS.map((s, i) => (i === 2 ? { ...s, layout: 'callout' } : s))
    const r = checkLessonSpecAgreement({ essenceType: 'K-concept', spec, sections: drifted })
    expect(r.ok).toBe(true)
    expect(r.warnings.map((i) => i.code)).toContain('roster-layout-drift')
  })

  it('大纲声明的示例参数在正文里从未出现 → 警告（怀疑算例参数漂移）', () => {
    const r = checkLessonSpecAgreement({
      essenceType: 'K-concept',
      spec: { ...spec, exampleParams: [{ name: '学习率', value: '0.01' }] },
      sections: SECTIONS,
    })
    expect(r.warnings.map((i) => i.code)).toContain('example-param-unused')
  })

  it('大纲声明的 takeaway 没写进区 → 警告（结论条缺失）', () => {
    const noTakeaway = SECTIONS.map((s, i) => (i === 0 ? { ...s, takeaway: '' } : s))
    const r = checkLessonSpecAgreement({ essenceType: 'K-concept', spec, sections: noTakeaway })
    expect(r.warnings.map((i) => i.code)).toContain('roster-takeaway-missing')
  })
})

describe('规格摘要与写作锁（提示词注入）', () => {
  const spec = (() => {
    const r = normalizeLessonSpec(draft(), 'K-concept')
    if (!r.ok) throw new Error('draft 应合法')
    return r.value
  })()

  it('摘要讲清读者/篇幅/术语与记号数量/版式序列', () => {
    const text = summarizeLessonSpec(spec)
    expect(text).toContain('6 区')
    expect(text).toContain('术语 1')
    expect(text).toContain('keypoints')
  })

  it('写作锁包含逐区计划（区序 + 版式 + 读者动作 + 载体）与全讲复用的参数', () => {
    const lock = lessonSpecLock(spec, 'K-concept')
    expect(lock).toContain('规格锁')
    expect(lock).toContain('读者')
    expect(lock).toContain('0.01') // 示例参数
    expect(lock).toContain('广播') // 术语表
    expect(lock).toContain('⊗') // 记号表
    expect(lock).toContain('examples')
    // 逐区计划按序出现
    const atMeta = lock.indexOf('meta')
    const atExamples = lock.indexOf('examples')
    const atSelfcheck = lock.indexOf('selfcheck')
    expect(atMeta).toBeGreaterThanOrEqual(0)
    expect(atExamples).toBeGreaterThan(atMeta)
    expect(atSelfcheck).toBeGreaterThan(atExamples)
    // 回读纪律（对应 ppt-master 的 five-page lock re-read）
    expect(lock).toContain('回读')
  })
})