/**
 * 讲义区结构规划测试（planLessonSections）
 * @module tests/unit/shared/lesson-sections.spec
 *
 * 背景（2026-09-12 用户反馈「章节结构不清 / 编写注记与这块没懂重叠」）：
 * 区集里混着「正文章节」与「编写注记」，渲染层需要一份明确的计划——
 * 正文按序编号、编写注记区整体剥离并汇总置底折叠（唯一的注记入口）。
 *
 * v8 增补（2026-09-15 用户口径「章节还是太细碎」）：
 * 「参考答案」是自测的收尾折叠块——`follower=true`、`no=0`，不占章节编号（章节只数到自测）。
 */

import { describe, it, expect } from 'vitest'
import {
  planLessonSections,
  isAuthoringNotesSection,
  splitNoteItems,
  defaultSectionStyle,
  DEFAULT_SECTION_TITLES,
  type LessonSectionLike,
} from '@shared/utils/lesson-sections'

function sec(key: string, md: string, extra: Partial<LessonSectionLike> = {}): LessonSectionLike {
  return { key, md, ...extra }
}

describe('区识别与兜底标题/样式', () => {
  it('isAuthoringNotesSection：key=notes 或标题含「编写注记」都算作者注记区', () => {
    expect(isAuthoringNotesSection({ key: 'notes', title: '编写注记（学习者可跳过）' })).toBe(true)
    expect(isAuthoringNotesSection({ key: 'x', title: '编写注记' })).toBe(true)
    expect(isAuthoringNotesSection({ key: 'definition', title: '定义' })).toBe(false)
  })

  it('defaultSectionStyle：meta=引言，edge/pitfalls=注意，selfcheck/review=检验（essence 已并入定义 → body）', () => {
    expect(defaultSectionStyle('meta')).toBe('intro')
    expect(defaultSectionStyle('essence')).toBe('body')
    expect(defaultSectionStyle('edge')).toBe('note')
    expect(defaultSectionStyle('pitfalls')).toBe('note')
    expect(defaultSectionStyle('selfcheck')).toBe('review')
    expect(defaultSectionStyle('definition')).toBe('body')
  })

  it('DEFAULT_SECTION_TITLES 覆盖讲义实际用到的区 key（避免出现"无名章节"）', () => {
    for (const key of ['meta', 'why', 'examples', 'definition', 'rules', 'code', 'pitfalls', 'selfcheck']) {
      expect(DEFAULT_SECTION_TITLES[key], `缺 ${key} 兜底标题`).toBeTruthy()
    }
  })
})

describe('splitNoteItems', () => {
  it('按列表项逐条拆分，续行合并进同一条', () => {
    const items = splitNoteItems('- 第一条\n  续行\n- 第二条\n\n1. 第三条')
    expect(items).toEqual(['第一条 续行', '第二条', '第三条'])
  })

  it('无列表标记时整段作一条', () => {
    expect(splitNoteItems('只有一段说明')).toEqual(['只有一段说明'])
  })

  it('空串 → 空数组', () => {
    expect(splitNoteItems('')).toEqual([])
    expect(splitNoteItems('   \n\n ')).toEqual([])
  })
})

describe('planLessonSections', () => {
  it('正文章节按序编号（从 1 起），作者注记区不占编号也不进正文', () => {
    const plan = planLessonSections([
      sec('meta', '读者画像', { title: '本讲说明' }),
      sec('definition', '张量是……', { title: '定义' }),
      sec('notes', '- 采集情况：web_search 429\n- 数值自检：已重算', { title: '编写注记（学习者可跳过）', folded: true }),
    ])
    expect(plan.content.map((c) => c.key)).toEqual(['meta', 'definition'])
    expect(plan.content.map((c) => c.no)).toEqual([1, 2])
    // 原下标保留（折叠状态按原下标引用，不受剔除影响）
    expect(plan.content.map((c) => c.index)).toEqual([0, 1])
  })

  it('作者注记区全文并入 authoringNotes（逐条），正文不含它', () => {
    const plan = planLessonSections([
      sec('meta', '正文'),
      sec('notes', '- 采集情况：web_search 429\n- 数值自检：已重算', { title: '编写注记' }),
    ])
    expect(plan.authoringNotes).toEqual(['采集情况：web_search 429', '数值自检：已重算'])
  })

  it('正文里剥离出的注记进入 authoringNotes 并带区名前缀（保留上下文）', () => {
    const plan = planLessonSections([
      sec('code', '正常正文。\n\n⚠️ 上表默认 dtype 属先验，未取得官方文档原文。', { title: '落到代码' }),
    ])
    expect(plan.content[0].body).toBe('正常正文。')
    expect(plan.content[0].notes).toHaveLength(1)
    expect(plan.authoringNotes).toEqual(['【落到代码】⚠️ 上表默认 dtype 属先验，未取得官方文档原文。'])
  })

  it('标题/样式：AI 给定优先，缺省用模板语义兜底', () => {
    const plan = planLessonSections([
      sec('meta', 'a'),
      sec('essence', 'b', { title: '这是什么' }),
      sec('edge', 'c', { style: 'review' }),
    ])
    expect(plan.content[0].title).toBe('学习前必读')
    expect(plan.content[0].style).toBe('intro')
    expect(plan.content[1].title).toBe('这是什么')
    expect(plan.content[1].style).toBe('body') // v7：essence 已并入 definition，样式随定义区
    expect(plan.content[2].title).toBe('辨析与易错') // v8：edge 已并入辨析与易错
    expect(plan.content[2].style).toBe('review')
  })

  it('folded 透传（深水区默认收起由渲染层用 index 控制）', () => {
    const plan = planLessonSections([sec('justification', '证明……', { folded: true })])
    expect(plan.content[0].folded).toBe(true)
  })

  // 2026-09-12 用户需求：自测的答案默认折叠
  it('自测区：题目留在 body，答案切到 answers（渲染层默认折叠）', () => {
    const plan = planLessonSections([
      sec(
        'selfcheck',
        ['**Q1** 形状 (32, 3, 224, 224) 有多少个数？', '', '---', '', '**答案**', '', '- **A1** 4816896 个。'].join('\n'),
        { title: '自测（先自己做，再对答案）' },
      ),
    ])
    expect(plan.content[0].body).toContain('Q1')
    expect(plan.content[0].body).not.toContain('A1')
    expect(plan.content[0].answers).toContain('A1')
    expect(plan.content[0].body).not.toContain('---')
  })

  it('无答案标记的区：answers 为空串（渲染层不显示折叠入口）', () => {
    const plan = planLessonSections([sec('definition', '张量是……')])
    expect(plan.content[0].answers).toBe('')
  })

  it('整区就是答案（key=answers / 标题以答案开头）→ 默认整区折叠，且**不占章节编号**（v8 跟随区）', () => {
    const plan = planLessonSections([
      sec('definition', '张量是……', { title: '定义' }),
      sec('selfcheck', '**Q1** 题目', { title: '自测' }),
      sec('answers', '**A1** 答案正文', { title: '参考答案' }),
    ])
    expect(plan.content.map((c) => c.folded)).toEqual([false, false, true])
    // 章节编号只数到自测（1 定义、2 自测），参考答案是自测的收尾折叠块
    expect(plan.content.map((c) => c.no)).toEqual([1, 2, 0])
    expect(plan.content.map((c) => c.follower)).toEqual([false, false, true])
  })

  it('跟随区不打断后续章节编号（答案之后若还有正文区，编号继续）', () => {
    const plan = planLessonSections([
      sec('definition', 'a', { title: '定义' }),
      sec('answers', '**A1** 答案', { title: '参考答案' }),
      sec('selfcheck', '**Q1** 题', { title: '自测' }),
    ])
    expect(plan.content.map((c) => c.no)).toEqual([1, 0, 2])
  })

  it('空区集 → 空计划（渲染层走空态）', () => {
    expect(planLessonSections([])).toEqual({ content: [], authoringNotes: [] })
  })

  // ==================== 2026-09-13 历史卡渲染期归一（真实数据形状） ====================

  it('历史卡别名 key（checks/quiz/selftest）也拿到自测样式（review）', () => {
    for (const key of ['checks', 'quiz', 'selftest', 'self-check']) {
      const plan = planLessonSections([sec(key, '**Q1** 题目', { title: '自测与检验清单' })])
      expect(plan.content[0].style, `${key} 未拿到 review 样式`).toBe('review')
      // 模型给定的标题仍优先（历史卡不改写），缺省才用契约兜底
      expect(plan.content[0].title).toBe('自测与检验清单')
    }
    expect(planLessonSections([sec('worked', '正文')]).content[0].title).toBe('案例')
  })

  it('历史卡正文里的 ## 小标题在渲染期降到 ###（与区标题拉开层级）', () => {
    const plan = planLessonSections([
      sec('mechanism', ['## 1. 把前向计算记成一张图', '', '正文'].join('\n'), { title: '机制' }),
    ])
    expect(plan.content[0].body).toContain('### 1. 把前向计算记成一张图')
    // 二级标题（`## ` 开头）已不存在
    expect(/^##[^#]/m.test(plan.content[0].body)).toBe(false)
  })

  it('历史卡 notes 别名（authoring-notes）也归入编写注记置底汇总', () => {
    const plan = planLessonSections([
      sec('meta', '正文'),
      sec('authoring-notes', '- 采集情况：KB 命中'),
    ])
    expect(plan.content.map((c) => c.key)).toEqual(['meta'])
    expect(plan.authoringNotes).toEqual(['采集情况：KB 命中'])
  })
})
