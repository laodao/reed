/**
 * 讲义区集契约测试（lesson-template）
 * @module tests/unit/shared/lesson-template.spec
 *
 * 背景（2026-09-13 用户反馈）：同一主题下不同知识点的讲义结构完全不同——
 * 深度学习「张量」与「自动微分与反向传播」本质类型相同（K-concept），区集却是两套。
 *
 * v7 增补（2026-09-15 用户口径：**章节太细碎要合并、重点写详细、示例放到详解之后、不要卡片样式**）：
 * - 合并：本质 → 定义；机制/构成与结构/规则/公式/性质/步骤/依据/适用与局限 → 详解；
 *   反例与边界 → 案例；补充与注意 → 常见坑；
 * - 区序：「定义 → 详解 → 案例」；归一化会把老卡**合并 + 按新序重排**（内容一字不删）；
 * - 重点区（定义/详解/案例）带写作要求与参考字数下限；历史模板 v5/v6 留档。
 */

import { describe, it, expect } from 'vitest'
import {
  LESSON_SECTION_CATALOG,
  LESSON_MERGED_SECTION_SPECS,
  LESSON_SECTION_MERGE_MAP,
  LESSON_ACTIVE_SECTION_KEYS,
  LESSON_TEMPLATES,
  LESSON_TEMPLATES_V5,
  LESSON_TEMPLATES_V6,
  LESSON_LEGACY_TEMPLATES,
  LESSON_TEMPLATE_VERSION_CURRENT,
  LESSON_DEPTH,
  DL_ESSENCE_TYPES,
  DEFAULT_SECTION_TITLES,
  canonicalSectionKey,
  sectionSpecOf,
  sectionTitleOf,
  sectionStyleOf,
  isSectionAllowed,
  lessonTemplateKeys,
  lessonTemplateHint,
  lessonTemplateBriefHint,
  lessonSectionBriefMenuHint,
  checkLessonDepth,
  normalizeLessonHeadingLevels,
  normalizeCardSections,
  checkLessonSectionsShape,
  hasInlineAnswers,
  type LessonSectionShape,
} from '@shared/utils/lesson-template'
import { isAnswerSection } from '@shared/utils/lesson-selfcheck'

/** 真机：深度学习「张量」v2 的区集（v5 结构：示例在定义之前、规则单独成区） */
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

/** 真机：深度学习「自动微分与反向传播」v3 的区集（自造区名 practice + 散落的机制/成本区） */
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
  it('目录 key 唯一，别名不与他人 key/别名冲突（生效区 + 已合并的历史区一起查）', () => {
    const seen = new Map<string, string>()
    for (const spec of [...LESSON_SECTION_CATALOG, ...LESSON_MERGED_SECTION_SPECS]) {
      expect(seen.has(spec.key), `key ${spec.key} 与 ${seen.get(spec.key)} 重名`).toBe(false)
      seen.set(spec.key, spec.key)
      for (const alias of spec.aliases ?? []) {
        expect(seen.has(alias), `别名 ${alias} 与 ${seen.get(alias)} 冲突`).toBe(false)
        seen.set(alias, spec.key)
      }
    }
  })

  it('每种本质类型的模板：key 都在目录内且为**生效区**、meta 开头、notes 收尾、selfcheck 与 answers 相邻', () => {
    for (const type of DL_ESSENCE_TYPES) {
      const tpl = LESSON_TEMPLATES[type]
      for (const key of tpl) {
        expect(sectionSpecOf(key), `${type} 的 ${key} 不在目录内`).not.toBeNull()
        expect(sectionSpecOf(key)!.mergedInto, `${type} 的 ${key} 是已合并的历史区，不该出现在新模板里`).toBeUndefined()
      }
      expect(tpl[0], `${type} 首区`).toBe('meta')
      expect(tpl[tpl.length - 1], `${type} 末区`).toBe('notes')
      expect(tpl[tpl.length - 3], `${type} 自测`).toBe('selfcheck')
      expect(tpl[tpl.length - 2], `${type} 答案`).toBe('answers')
      expect(new Set(tpl).size).toBe(tpl.length)
    }
  })

  it('isSectionAllowed 按类型判定，且历史区名折到合并后的生效区（cost → detail）', () => {
    expect(isSectionAllowed('K-concept', 'cost')).toBe(true)
    expect(isSectionAllowed('K-concept', 'rules')).toBe(true)
    expect(isSectionAllowed('K-concept', 'code')).toBe(true)
    expect(isSectionAllowed('K-open', 'code')).toBe(false)
  })

  it('lessonTemplateHint：区序为「定义 → 详解 → 案例」（示例/案例在详解之后）', () => {
    const hint = lessonTemplateHint('K-concept')
    expect(hint).toContain('definition（定义）')
    expect(hint).toContain('detail（详解）')
    expect(hint).toContain('examples（案例）')
    expect(hint.indexOf('definition（定义）')).toBeLessThan(hint.indexOf('detail（详解）'))
    expect(hint.indexOf('detail（详解）')).toBeLessThan(hint.indexOf('examples（案例）'))
    // 合并后的历史区不再出现在区序里
    expect(hint).not.toContain('structure（')
    expect(hint).not.toContain('rules（')
  })
})

describe('区职责与写作说明（重点＝定义/详解/案例）', () => {
  it('每个生效区都有 role 与一段写作说明 brief', () => {
    for (const spec of LESSON_SECTION_CATALOG) {
      expect(spec.role, `${spec.key} 缺 role`).toBeTruthy()
      expect(['lead', 'core', 'case', 'support', 'close']).toContain(spec.role)
      expect((spec.brief ?? '').length, `${spec.key} 的 brief 太短，等于没提要求`).toBeGreaterThanOrEqual(20)
    }
  })

  it('重点区（core/case）都给了参考字数下限；其它区不设', () => {
    for (const spec of LESSON_SECTION_CATALOG) {
      if (spec.role === 'core' || spec.role === 'case') {
        expect(spec.minChars, `${spec.key} 是重点区却没给 minChars`).toBeGreaterThan(0)
      } else {
        expect(spec.minChars ?? 0, `${spec.key} 不是重点区，不该要求最少字数`).toBe(0)
      }
    }
    expect(LESSON_DEPTH.coreShareMin).toBeGreaterThan(0)
    expect(LESSON_DEPTH.minTotalForShareCheck).toBeGreaterThan(0)
  })

  it('合并去向声明齐全（本质→定义、机制/结构/规则/公式/性质/步骤/依据/适用→详解、反例→案例、补充→常见坑）', () => {
    const merged = (key: string): string | undefined =>
      LESSON_MERGED_SECTION_SPECS.find((s) => s.key === key)?.mergedInto
    expect(merged('essence')).toBe('definition')
    expect(LESSON_SECTION_MERGE_MAP['essence']).toBe('definition')
    // 生效目录里不再出现这些历史区（用户 2026-09-15：「本质和定义并没有合并」的观感来源）
    for (const key of ['essence', 'structure', 'rules', 'mechanism', 'justification', 'application', 'counterexample', 'edge']) {
      expect(LESSON_SECTION_CATALOG.some((s) => s.key === key), `${key} 不该出现在生效目录里`).toBe(false)
    }
    for (const key of ['mechanism', 'structure', 'rules', 'formula', 'property', 'procedure', 'justification', 'application']) {
      expect(merged(key), `${key} 应并入 detail`).toBe('detail')
    }
    expect(merged('counterexample')).toBe('examples')
    expect(merged('edge')).toBe('pitfalls')
    // 生效区必须都是模板里出现的区
    for (const key of LESSON_ACTIVE_SECTION_KEYS) {
      expect(LESSON_TEMPLATES['K-concept'].includes(key) || key === 'controversy' || key === 'statement').toBe(true)
    }
  })

  it('lessonTemplateBriefHint 按类型渲染区清单 + 写作要求（重点区带 [重点] 标记，其它区不打标签）', () => {
    const hint = lessonTemplateBriefHint('K-concept')
    expect(hint).toContain('definition（定义）[重点]')
    expect(hint).toContain('detail（详解）[重点]')
    expect(hint).toContain('examples（案例）[重点]')
    expect(hint).toContain('meta（学习前必读）：')
    expect(hint).not.toContain('meta（学习前必读）[')
    // brief 正文与参考下限必须进提示词（不是只给区名）
    expect(hint).toContain(sectionSpecOf('detail')!.brief.slice(0, 12))
    expect(hint).toContain(`至少 ${sectionSpecOf('detail')!.minChars} 字`)
    // 已合并的历史区不进提示词
    expect(hint).not.toContain('structure（')
  })

  it('lessonSectionBriefMenuHint：只列生效区，每区一行写作要求', () => {
    const menu = lessonSectionBriefMenuHint()
    const lines = menu.split('\n')
    expect(lines).toHaveLength(LESSON_ACTIVE_SECTION_KEYS.length)
    for (const key of LESSON_ACTIVE_SECTION_KEYS) {
      const spec = sectionSpecOf(key)!
      expect(menu, `${key} 缺写作要求行`).toContain(`${key}（${spec.title}）`)
      expect(menu).toContain(spec.brief.slice(0, 12))
    }
    expect(menu).not.toContain('structure（')
    expect(menu).not.toContain('essence（')
  })
})

describe('checkLessonDepth（重点深度：非阻断提醒，与 brief 同源）', () => {
  const long = (n: number, seed = '细则'): string => seed.repeat(Math.ceil(n / seed.length)).slice(0, n)

  it('重点区过简 → 提醒该区写详细（附参考下限与该区的写作要求）', () => {
    const r = checkLessonDepth({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: long(120, '读者画像') },
        { key: 'definition', md: '金融资产就是能带来未来收益的合约。' },
        { key: 'detail', md: long(700, '明细') },
        { key: 'examples', md: long(300, '案例') },
      ],
    })
    expect(r.ok).toBe(false)
    const thin = r.issues.find((i) => i.code === 'thin-core')
    expect(thin?.sectionKey).toBe('definition')
    expect(thin?.fix).toContain(String(sectionSpecOf('definition')!.minChars))
  })

  it('案例区过简 → 提醒写具体（案例要能呼应定义与详解）', () => {
    const r = checkLessonDepth({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: long(120, '读者画像') },
        { key: 'definition', md: long(360, '定义细则') },
        { key: 'detail', md: long(700, '明细') },
        { key: 'examples', md: '例如股权。' },
      ],
    })
    const thin = r.issues.find((i) => i.code === 'thin-case')
    expect(thin?.sectionKey).toBe('examples')
    expect(thin?.fix).toContain('案例')
  })

  it('非重点章节挤占篇幅（重点占比过低）→ 提醒把篇幅让给定义/详解/案例', () => {
    const r = checkLessonDepth({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: long(700, '读者画像') },
        { key: 'why', md: long(700, '动机') },
        { key: 'definition', md: long(360, '定义细则') },
        { key: 'detail', md: long(700, '明细') },
        { key: 'examples', md: long(300, '案例') },
        { key: 'selfcheck', md: long(700, '自测题') },
      ],
    })
    expect(r.issues.some((i) => i.code === 'low-core-share')).toBe(true)
  })

  it('重点写详细、占比正常的卡 → 无提醒', () => {
    const r = checkLessonDepth({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: long(120, '读者画像') },
        { key: 'definition', md: long(400, '定义边界') },
        { key: 'detail', md: long(800, '明细逻辑') },
        { key: 'examples', md: long(300, '案例过程') },
        { key: 'selfcheck', md: long(120, '自测题面') },
      ],
    })
    expect(r).toMatchObject({ ok: true })
    expect(r.stats.coreShare).toBeGreaterThanOrEqual(LESSON_DEPTH.coreShareMin)
  })

  it('短卡（不足 share 检查门槛）不查占比，避免噪声', () => {
    const r = checkLessonDepth({
      essenceType: 'K-concept',
      sections: [
        { key: 'definition', md: long(400, '定义边界') },
        { key: 'detail', md: long(800, '明细逻辑') },
      ],
    })
    expect(r.issues.some((i) => i.code === 'low-core-share')).toBe(false)
  })
})

describe('canonicalSectionKey / 标题 / 样式', () => {
  it('同义写法归一（大小写与连字符变体都认）', () => {
    expect(canonicalSectionKey('checks')).toBe('selfcheck')
    expect(canonicalSectionKey('self-check')).toBe('selfcheck')
    expect(canonicalSectionKey('SELFTEST')).toBe('selfcheck')
    expect(canonicalSectionKey('worked-example')).toBe('examples')
    expect(canonicalSectionKey('def')).toBe('definition')
    expect(canonicalSectionKey('core')).toBe('definition') // v7：本质并入定义
  })

  it('v7 已合并的区名折到目标区（cost/scope → 详解、proof → 详解、types → 详解、edge-cases → 常见坑）', () => {
    expect(canonicalSectionKey('cost')).toBe('detail')
    expect(canonicalSectionKey('scope')).toBe('detail')
    expect(canonicalSectionKey('proof')).toBe('detail')
    expect(canonicalSectionKey('types')).toBe('detail')
    expect(canonicalSectionKey('steps')).toBe('detail')
    expect(canonicalSectionKey('edge-cases')).toBe('pitfalls')
    expect(canonicalSectionKey('counter-example')).toBe('examples')
    expect(sectionTitleOf('structure')).toBe('详解')
    expect(sectionTitleOf('edge')).toBe('常见坑')
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

describe('normalizeCardSections（v7：合并 + 按新序重排，内容一字不删）', () => {
  it('张量卡（v5 序）：规则并入详解、示例移到详解之后、标题按目标区派生、自测答案拆独立区', () => {
    const { sections, changes } = normalizeCardSections({ essenceType: 'K-concept', sections: TENSOR_SECTIONS })
    expect(sections.map((s) => s.key)).toEqual([
      'meta', 'why', 'definition', 'detail', 'examples', 'code', 'pitfalls', 'selfcheck', 'answers', 'notes',
    ])
    expect(sections[0].title).toBe('学习前必读')
    expect(sections[3].title).toBe('详解')
    expect(sections[3].md).toContain('规则一：逐元素运算') // rules 的内容并入详解，未丢
    expect(sections[8].title).toBe('参考答案')
    expect(sections[8].folded).toBe(true)
    // 答案不在题面里
    expect(sections[7].md).toContain('Q1')
    expect(sections[7].md).not.toContain('A1')
    expect(sections[8].md).toContain('A1')
    expect(changes.some((c) => c.includes('并入'))).toBe(true)
    expect(changes.some((c) => c.includes('answers'))).toBe(true)
    // 代码围栏里的注释未被标题归一化破坏
    expect(sections[5].md).toContain('# 注释')
  })

  it('自动微分卡：worked→案例、cost/mechanism→详解（内容合并）、checks→自测，自造区名 practice 保留', () => {
    const { sections, changes } = normalizeCardSections({ essenceType: 'K-concept', sections: AUTODIFF_SECTIONS })
    expect(sections.map((s) => s.key)).toEqual([
      'meta', 'why', 'detail', 'examples', 'pitfalls', 'selfcheck', 'practice',
    ])
    const detail = sections.find((s) => s.key === 'detail')!
    expect(detail.md).toContain('把前向计算记成一张图') // 原 mechanism
    expect(detail.md).toContain('### 适用与局限') // 原 cost（application）的区标题作为小标题保留
    expect(detail.title).toBe('详解')
    // 正文 ## 小标题统一降到 ###
    expect(detail.md).toContain('### 1. 把前向计算记成一张图')
    expect(changes.some((c) => c.includes('并入'))).toBe(true)
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

  it('幂等：归一后的区集再归一不再变化（不会重复合并/重排）', () => {
    const once = normalizeCardSections({ essenceType: 'K-concept', sections: AUTODIFF_SECTIONS }).sections
    const twice = normalizeCardSections({ essenceType: 'K-concept', sections: once })
    expect(twice.sections.map((s) => s.key)).toEqual(once.map((s) => s.key))
    expect(twice.sections.map((s) => s.md)).toEqual(once.map((s) => s.md))
  })
})

describe('checkLessonSectionsShape（归一后仍不合规 → 可执行的拒绝）', () => {
  it('v5 老卡归一后即为 v7 形状（合并 + 重排），无需历史模板兜底', () => {
    const { sections } = normalizeCardSections({ essenceType: 'K-concept', sections: TENSOR_SECTIONS })
    const result = checkLessonSectionsShape({ essenceType: 'K-concept', sections })
    expect(result.ok).toBe(true)
    expect(result.note).toBeNull()
  })

  it('v5/v6 模板作为历史版本留档（v7 是它们的子集；示例位置由前挪后）', () => {
    expect(LESSON_TEMPLATE_VERSION_CURRENT).toBe('v7')
    expect(LESSON_LEGACY_TEMPLATES.map((l) => l.version)).toEqual(['v6', 'v5'])
    for (const type of DL_ESSENCE_TYPES) {
      const v5 = LESSON_TEMPLATES_V5[type]
      const v6 = LESSON_TEMPLATES_V6[type]
      const v7 = LESSON_TEMPLATES[type]
      expect(v5.includes('examples')).toBe(true)
      expect(v6.indexOf('examples')).toBeGreaterThan(v6.indexOf('definition'))
      expect(v7.length).toBeLessThan(v5.length)
      // v7 的区都能在 v6 里找到（例外：v7 给 K-agent/K-open 补了「定义」区，给它们补了「辨析」区）
      for (const key of v7) {
        const addedInV7 = key === 'definition' || key === 'distinguish'
        expect(v6.includes(key) || addedInV7, `${type}: v7 的 ${key} 不在 v6 里`).toBe(true)
      }
    }
  })

  it('自造区名 practice → 拒绝并列出当前模板区序', () => {
    const { sections } = normalizeCardSections({ essenceType: 'K-concept', sections: AUTODIFF_SECTIONS })
    const result = checkLessonSectionsShape({ essenceType: 'K-concept', sections })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('practice')
    expect(result.reason).toContain('meta → why → definition → detail → examples')
  })

  it('未归一的老卡（详解排在定义之前）→ 拒绝并说明要求顺序', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'detail', md: 'd' },
        { key: 'definition', md: 'b' },
        { key: 'examples', md: 'c' },
        { key: 'selfcheck', md: '**Q1** 题' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('区序不符合')
  })

  it('未归一的 v5 老卡（案例排在详解之前）→ 按历史模板 v6 兼容放行并附重排提示（内容不动）', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'definition', md: 'b' },
        { key: 'examples', md: 'c' },
        { key: 'detail', md: 'd' },
        { key: 'selfcheck', md: '**Q1** 题' },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.note).toContain('v6')
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

  it('v7 合规卡（定义 → 详解 → 案例）→ 通过且无附注', () => {
    const { sections } = normalizeCardSections({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: '### 前置\n无需前置。' },
        { key: 'why', md: '动机' },
        { key: 'definition', md: '严格定义与边界' },
        { key: 'detail', md: '主线 + 逐类展开 + 对比表 + 判定规则' },
        { key: 'examples', md: '案例' },
        { key: 'pitfalls', md: '常见坑' },
        { key: 'selfcheck', md: '**Q1** 题目' },
        { key: 'answers', md: '**A1** 答案' },
        { key: 'notes', md: '- 注记' },
      ],
    })
    expect(checkLessonSectionsShape({ essenceType: 'K-concept', sections })).toMatchObject({ ok: true, note: null })
  })

  it('lessonTemplateKeys：未知类型回退 K-concept', () => {
    expect(lessonTemplateKeys('K-unknown' as never)).toEqual(LESSON_TEMPLATES['K-concept'])
  })
})
