/**
 * 讲义区集契约测试（lesson-template）
 * @module tests/unit/shared/lesson-template.spec
 *
 * 背景（2026-09-13 用户反馈）：同一主题下不同知识点的讲义结构完全不同——
 * 深度学习「张量」与「自动微分与反向传播」本质类型相同（K-concept），区集却是两套，
 * 区标题、正文标题层级（### vs ##）、自测答案组织方式三处都不一致。
 * 本用例覆盖契约自洽性 + 真机两张卡形状的归一化/校验行为。
 */

import { describe, it, expect } from 'vitest'
import {
  LESSON_SECTION_CATALOG,
  LESSON_TEMPLATES,
  DL_ESSENCE_TYPES,
  DEFAULT_SECTION_TITLES,
  canonicalSectionKey,
  sectionSpecOf,
  sectionTitleOf,
  sectionStyleOf,
  isSectionAllowed,
  lessonTemplateKeys,
  lessonTemplateHint,
  normalizeLessonHeadingLevels,
  normalizeCardSections,
  checkLessonSectionsShape,
  hasInlineAnswers,
  type LessonSectionShape,
} from '@shared/utils/lesson-template'
import { isAnswerSection } from '@shared/utils/lesson-selfcheck'

/** 真机：深度学习「张量」v2 的区集 */
const TENSOR_SECTIONS: LessonSectionShape[] = [
  { key: 'meta', title: '本讲说明：读者画像 · 数学前置 · 记号热身 · 可测目标', md: '### 读者画像\n\n你刚学完…' },
  { key: 'why', title: '为什么“工作应用”要从张量开始', md: '正文' },
  { key: 'examples', title: '先看例子：五个真实形状', md: '正文' },
  { key: 'definition', title: '定义：张量到底是什么', md: '正文' },
  { key: 'rules', title: '三类核心运算与它们的形状规则', md: '### 规则一：逐元素运算\n\n正文' },
  { key: 'code', title: '落到代码：NumPy 与 PyTorch 的对应写法', md: '```python\n# 注释里的 # 不能被改\nx = 1\n```' },
  { key: 'pitfalls', title: '常见坑', md: '正文' },
  {
    key: 'selfcheck',
    title: '自测（先自己做，再对答案）',
    md: ['**Q1** 形状 (32,3,224,224) 有多少个数？', '', '---', '', '**答案**', '', '- **A1** 4816896 个。'].join('\n'),
  },
  { key: 'notes', title: '编写注记（学习者可跳过）', md: '- 采集情况：KB 命中', folded: true },
]

/** 真机：深度学习「自动微分与反向传播」v3 的区集（用户点名的另一张） */
const AUTODIFF_SECTIONS: LessonSectionShape[] = [
  { key: 'meta', title: '导读：前置、记号与目标', md: '## 前置（先确认你已有这些能力）\n\n正文' },
  { key: 'why', title: '为什么需要它：四条求导路线', md: '正文' },
  { key: 'mechanism', title: '机制：链式法则 + 计算图 = 反向模式累加', md: '## 1. 把前向计算记成一张图\n\n正文' },
  { key: 'worked', title: '手算两例（含回算校验）', md: '## 例 1\n\n正文' },
  { key: 'cost', title: '成本、边界与三种「微分」的分工', md: '正文' },
  { key: 'practice', title: '落到代码：autograd 的用法与梯度确认', md: '正文' },
  { key: 'pitfalls', title: '常见误区与辨析', md: '正文' },
  {
    key: 'checks',
    title: '自测与检验清单',
    md: ['## A. 费曼复述', '', '1. 反向传播与链式法则是什么关系？（答：它就是链式法则的高效执行）', '', '## B. 手算题（答案附后）', '', '**答案 1**：t = x + y 经乘法节点…'].join('\n'),
  },
]

describe('与渲染/折叠口径的平权（防止别名表两处漂移）', () => {
  it('answers 的每个同义写法都被 isAnswerSection 认作答案区', () => {
    const answers = LESSON_SECTION_CATALOG.find((s) => s.key === 'answers')
    expect(answers).toBeTruthy()
    for (const name of [answers!.key, ...(answers!.aliases ?? [])]) {
      expect(isAnswerSection({ key: name }), `${name} 未被 isAnswerSection 认作答案区`).toBe(true)
    }
  })
})

describe('契约自洽性', () => {
  it('目录 key 唯一，别名不与他人 key/别名冲突', () => {
    const keys = LESSON_SECTION_CATALOG.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    const seen = new Map<string, string>()
    for (const spec of LESSON_SECTION_CATALOG) {
      expect(seen.has(spec.key), `key ${spec.key} 与 ${seen.get(spec.key)} 重名`).toBe(false)
      seen.set(spec.key, spec.key)
      for (const alias of spec.aliases ?? []) {
        expect(seen.has(alias), `别名 ${alias} 与 ${seen.get(alias)} 冲突`).toBe(false)
        seen.set(alias, spec.key)
      }
    }
  })

  it('每种本质类型的模板：key 都在目录内、meta 开头、notes 收尾、selfcheck 与 answers 相邻', () => {
    for (const type of DL_ESSENCE_TYPES) {
      const tpl = LESSON_TEMPLATES[type]
      for (const key of tpl) {
        expect(sectionSpecOf(key), `${type} 的 ${key} 不在目录内`).not.toBeNull()
      }
      expect(tpl[0], `${type} 首区`).toBe('meta')
      expect(tpl[tpl.length - 1], `${type} 末区`).toBe('notes')
      expect(tpl[tpl.length - 3], `${type} 自测`).toBe('selfcheck')
      expect(tpl[tpl.length - 2], `${type} 答案`).toBe('answers')
      expect(new Set(tpl).size).toBe(tpl.length)
    }
  })

  it('isSectionAllowed 按类型判定（cost 归 application，K-open 不含 code）', () => {
    expect(isSectionAllowed('K-concept', 'cost')).toBe(true)
    expect(isSectionAllowed('K-concept', 'code')).toBe(true)
    expect(isSectionAllowed('K-open', 'code')).toBe(false)
  })

  it('lessonTemplateHint 给出「key（标题）」区序（提示词与门禁同源）', () => {
    const hint = lessonTemplateHint('K-concept')
    expect(hint).toContain('meta（学习前必读）')
    expect(hint).toContain('selfcheck（自测）')
    expect(hint.indexOf('examples（示例）')).toBeLessThan(hint.indexOf('definition（定义）'))
  })
})

describe('canonicalSectionKey / 标题 / 样式', () => {
  it('同义写法归一（大小写与连字符变体都认）', () => {
    expect(canonicalSectionKey('checks')).toBe('selfcheck')
    expect(canonicalSectionKey('self-check')).toBe('selfcheck')
    expect(canonicalSectionKey('SELFTEST')).toBe('selfcheck')
    expect(canonicalSectionKey('worked-example')).toBe('examples')
    expect(canonicalSectionKey('cost')).toBe('application')
    expect(canonicalSectionKey('def')).toBe('definition')
    expect(canonicalSectionKey('proof')).toBe('justification')
    expect(canonicalSectionKey('core')).toBe('essence')
  })

  it('未收录的名字原样返回（交给门禁拒绝，不静默吞内容）', () => {
    expect(canonicalSectionKey('practice')).toBe('practice')
    expect(sectionSpecOf('practice')).toBeNull()
    expect(sectionTitleOf('practice')).toBe('')
    expect(sectionStyleOf('practice')).toBe('body')
  })

  it('自测/答案类区拿到 review 样式（历史卡的 checks/quiz 也算）', () => {
    expect(sectionStyleOf('selfcheck')).toBe('review')
    expect(sectionStyleOf('checks')).toBe('review')
    expect(sectionStyleOf('quiz')).toBe('review')
    expect(sectionStyleOf('answers')).toBe('review')
    expect(sectionTitleOf('checks')).toBe('自测')
    expect(DEFAULT_SECTION_TITLES['meta']).toBe('学习前必读')
  })
})

describe('normalizeLessonHeadingLevels（区标题占二级语义，正文小标题降到 ###）', () => {
  it('h1/h2 → ###，h3 及更深不动', () => {
    expect(normalizeLessonHeadingLevels('## A. 费曼复述')).toBe('### A. 费曼复述')
    expect(normalizeLessonHeadingLevels('# 标题')).toBe('### 标题')
    expect(normalizeLessonHeadingLevels('### 已是三级')).toBe('### 已是三级')
    expect(normalizeLessonHeadingLevels('#### 四级')).toBe('#### 四级')
  })

  it('代码围栏内原样保留（注释与示例里的 # 不能被改）', () => {
    const md = ['```python', '# 注释', '## 不是标题', '```', '', '## 真标题'].join('\n')
    expect(normalizeLessonHeadingLevels(md)).toBe(['```python', '# 注释', '## 不是标题', '```', '', '### 真标题'].join('\n'))
    const tilde = ['~~~', '# keep', '~~~', '# 改'].join('\n')
    expect(normalizeLessonHeadingLevels(tilde)).toBe(['~~~', '# keep', '~~~', '### 改'].join('\n'))
  })

  it('幂等（落库时归一 + 渲染时再归一也不会累加）', () => {
    const once = normalizeLessonHeadingLevels('## A\n\n### B')
    expect(normalizeLessonHeadingLevels(once)).toBe(once)
  })
})

describe('normalizeCardSections', () => {
  it('张量卡：标题/样式由模板派生，自测答案拆成独立 answers 区', () => {
    const { sections, changes } = normalizeCardSections({ essenceType: 'K-concept', sections: TENSOR_SECTIONS })
    expect(sections.map((s) => s.key)).toEqual([
      'meta', 'why', 'examples', 'definition', 'rules', 'code', 'pitfalls', 'selfcheck', 'answers', 'notes',
    ])
    expect(sections[0].title).toBe('学习前必读')
    expect(sections[8].title).toBe('参考答案')
    expect(sections[8].folded).toBe(true)
    // 答案不在题面里
    expect(sections[7].md).toContain('Q1')
    expect(sections[7].md).not.toContain('A1')
    expect(sections[8].md).toContain('A1')
    expect(changes.some((c) => c.includes('answers'))).toBe(true)
    // 代码围栏里的注释未被标题归一化破坏
    expect(sections[5].md).toContain('# 注释')
  })

  it('自动微分卡：worked→examples、cost→application、checks→selfcheck，自造区名 practice 保留', () => {
    const { sections, changes } = normalizeCardSections({ essenceType: 'K-concept', sections: AUTODIFF_SECTIONS })
    expect(sections.map((s) => s.key)).toEqual([
      'meta', 'why', 'mechanism', 'examples', 'application', 'practice', 'pitfalls', 'selfcheck',
    ])
    // 正文 ## 小标题统一降到 ###
    expect(sections[2].md).toContain('### 1. 把前向计算记成一张图')
    // worked→examples、cost→application、checks→selfcheck 共 3 处改名（practice 不在目录内，保留交门禁）
    expect(changes.filter((c) => c.includes('归一为')).length).toBe(3)
  })

  it('已有 answers 区时不重复拆（题面里也不含答案标记）', () => {
    const { sections } = normalizeCardSections({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'selfcheck', md: '**Q1** 题目' },
        { key: 'answers', md: '**A1** 答案' },
        { key: 'notes', md: '- 注记' },
      ],
    })
    expect(sections.map((s) => s.key)).toEqual(['meta', 'selfcheck', 'answers', 'notes'])
  })
})

describe('checkLessonSectionsShape（修复后仍不合规 → 可执行的拒绝）', () => {
  it('张量卡形状：合规', () => {
    const { sections } = normalizeCardSections({ essenceType: 'K-concept', sections: TENSOR_SECTIONS })
    expect(checkLessonSectionsShape({ essenceType: 'K-concept', sections })).toEqual({ ok: true, reason: null })
  })

  it('自动微分卡形状：自造区名 practice → 拒绝并列出模板区序', () => {
    const { sections } = normalizeCardSections({ essenceType: 'K-concept', sections: AUTODIFF_SECTIONS })
    const result = checkLessonSectionsShape({ essenceType: 'K-concept', sections })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('practice')
    expect(result.reason).toContain('meta → essence → why → examples')
  })

  it('顺序乱（机制写在示例之前）→ 拒绝并说明要求顺序', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'why', md: 'b' },
        { key: 'mechanism', md: 'c' },
        { key: 'examples', md: 'd' },
        { key: 'selfcheck', md: '**Q1** 题' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('区序不符合')
  })

  it('自测区残留行内答案 → 拒绝并指向独立 answers 区', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'selfcheck', md: '1. 题目（答：这里就是答案）' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('answers')
  })

  it('「答案附后」这类指路文本不算行内答案', () => {
    expect(hasInlineAnswers('## B. 手算题（答案附后）\n\n1. 题目')).toBe(false)
    expect(hasInlineAnswers('**答案 1**：正文')).toBe(true)
    expect(hasInlineAnswers('- **A1** 答案')).toBe(true)
    expect(hasInlineAnswers('（答：就是链式法则）')).toBe(true)
  })

  it('修正后的自动微分形状（practice→code、机制移到示例之后）→ 合规', () => {
    const fixed: LessonSectionShape[] = [
      { key: 'meta', md: '### 前置\n\n正文' },
      { key: 'why', md: '正文' },
      { key: 'examples', md: '### 例 1\n\n正文' },
      { key: 'definition', md: '正文' },
      { key: 'mechanism', md: '### 两条规则\n\n正文' },
      { key: 'application', md: '正文' },
      { key: 'code', md: '正文' },
      { key: 'pitfalls', md: '正文' },
      { key: 'selfcheck', md: '**Q1** 题目' },
      { key: 'answers', md: '**A1** 答案' },
      { key: 'notes', md: '- 注记' },
    ]
    expect(checkLessonSectionsShape({ essenceType: 'K-concept', sections: fixed })).toEqual({ ok: true, reason: null })
  })

  it('lessonTemplateKeys：未知类型回退 K-concept', () => {
    expect(lessonTemplateKeys('K-unknown' as never)).toEqual(LESSON_TEMPLATES['K-concept'])
  })
})
