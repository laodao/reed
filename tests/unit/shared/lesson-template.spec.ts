/**
 * 讲义区集契约测试（lesson-template）
 * @module tests/unit/shared/lesson-template.spec
 *
 * 背景（2026-09-13 用户反馈）：同一主题下不同知识点的讲义结构完全不同——
 * 深度学习「张量」与「自动微分与反向传播」本质类型相同（K-concept），区集却是两套。
 *
 * v8 增补（2026-09-15 用户口径：**章节还是太细碎；核心骨架＝定义、详解（含规则和逻辑）、
 * 示例、自测，有些领域还有具体的操作**）：
 * - 再合并：为什么学它 → 学习前必读；步骤/落到代码 → 实操；辨析/常见坑/补充与注意 → 辨析与易错；
 * - 六类模板都长在同一条主干上（类型差异只在「陈述/条文」与「争议与评价」）；
 * - 重点区（定义/详解/案例）带写作要求与参考字数下限；历史模板 v5/v6/v7 留档。
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
  LESSON_TEMPLATES_V7,
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

  it('六类模板都长在同一条主干上：类型差异只在「陈述/条文」与「争议与评价」', () => {
    // 主干（用户口径）：定义 → 详解 → 案例/实操 → 辨析与易错 → 自测
    const SPINE = ['definition', 'detail', 'examples', 'operation', 'confusions', 'selfcheck']
    for (const type of DL_ESSENCE_TYPES) {
      const tpl = LESSON_TEMPLATES[type]
      const at = (k: string): number => tpl.indexOf(k)
      for (const key of SPINE) expect(tpl, `${type} 缺核心骨架区 ${key}`).toContain(key)
      expect(tpl.includes('statement'), `${type} 只有 K-stmt/K-agent/K-open 才该有陈述区`).toBe(
        type === 'K-stmt' || type === 'K-agent' || type === 'K-open',
      )
      expect(tpl.includes('controversy'), `${type} 只有 K-agent/K-open 才该有争议区`).toBe(
        type === 'K-agent' || type === 'K-open',
      )
      // 顺序：定义在详解前；案例与实操都在详解之后；收尾按「辨析与易错 → 自测 → 答案 → 注记」
      expect(at('definition'), `${type} 定义应排在详解之前`).toBeLessThan(at('detail'))
      for (const key of ['examples', 'operation']) {
        expect(at('detail'), `${type} 的 ${key} 应排在详解之后`).toBeLessThan(at(key))
      }
      // K-oper 是唯一把「实操」提到「案例」之前的类型（做法类知识的本体就是操作）
      expect(at('examples') < at('operation'), `${type} 案例/实操顺序应按模板声明`).toBe(type !== 'K-oper')
      expect(at('operation')).toBeLessThan(at('confusions'))
      expect(at('confusions')).toBeLessThan(at('selfcheck'))
      expect(at('selfcheck')).toBeLessThan(at('answers'))
      expect(at('answers')).toBeLessThan(at('notes'))
    }
  })

  it('isSectionAllowed 按类型判定，且历史区名折到合并后的生效区（cost → detail／code → operation）', () => {
    expect(isSectionAllowed('K-concept', 'cost')).toBe(true)
    expect(isSectionAllowed('K-concept', 'rules')).toBe(true)
    expect(isSectionAllowed('K-concept', 'code')).toBe(true) // code 已折到 operation
    expect(isSectionAllowed('K-concept', 'statement')).toBe(false)
    expect(isSectionAllowed('K-stmt', 'statement')).toBe(true)
  })

  it('lessonTemplateHint：区序为「定义 → 详解 → 案例 → 实操 → 辨析与易错」，导学只留学习前必读', () => {
    const hint = lessonTemplateHint('K-concept')
    expect(hint).toContain('definition（定义）')
    expect(hint).toContain('detail（详解）')
    expect(hint).toContain('examples（案例）')
    expect(hint).toContain('operation（实操）')
    expect(hint).toContain('confusions（辨析与易错）')
    const at = (s: string): number => hint.indexOf(s)
    expect(at('definition（定义）')).toBeLessThan(at('detail（详解）'))
    expect(at('detail（详解）')).toBeLessThan(at('examples（案例）'))
    expect(at('examples（案例）')).toBeLessThan(at('operation（实操）'))
    expect(at('operation（实操）')).toBeLessThan(at('selfcheck（自测）'))
    // 已合并的区不再出现在区序里
    expect(hint).not.toContain('why（')
    expect(hint).not.toContain('structure（')
    expect(hint).not.toContain('pitfalls（')
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

  it('合并去向声明齐全（v7 合并 + v8 再合并：为什么学它→学习前必读、步骤/代码→实操、辨析/常见坑→辨析与易错）', () => {
    const merged = (key: string): string | undefined =>
      LESSON_MERGED_SECTION_SPECS.find((s) => s.key === key)?.mergedInto
    expect(merged('essence')).toBe('definition')
    expect(LESSON_SECTION_MERGE_MAP['essence']).toBe('definition')
    // v8：再合并的三组
    expect(merged('why')).toBe('meta')
    expect(merged('procedure')).toBe('operation')
    expect(merged('code')).toBe('operation')
    expect(merged('distinguish')).toBe('confusions')
    expect(merged('pitfalls')).toBe('confusions')
    expect(merged('edge')).toBe('confusions')
    // 生效目录里不再出现这些历史区
    for (const key of ['essence', 'why', 'structure', 'rules', 'mechanism', 'justification', 'application', 'counterexample', 'edge', 'code', 'procedure', 'distinguish', 'pitfalls']) {
      expect(LESSON_SECTION_CATALOG.some((s) => s.key === key), `${key} 不该出现在生效目录里`).toBe(false)
    }
    for (const key of ['mechanism', 'structure', 'rules', 'formula', 'property', 'justification', 'application']) {
      expect(merged(key), `${key} 应并入 detail`).toBe('detail')
    }
    expect(merged('counterexample')).toBe('examples')
    // 生效区必须都是模板里出现的区（controversy/statement 只在部分类型里）
    for (const key of LESSON_ACTIVE_SECTION_KEYS) {
      expect(LESSON_TEMPLATES['K-concept'].includes(key) || key === 'controversy' || key === 'statement').toBe(true)
    }
  })

  it('实操与辨析区的写作说明把"什么时候写、写到什么程度"讲清楚（操作类知识的落点）', () => {
    const operation = sectionSpecOf('operation')!
    expect(operation.title).toBe('实操')
    expect(operation.brief).toContain('照着做')
    const confusions = sectionSpecOf('confusions')!
    expect(confusions.title).toBe('辨析与易错')
    expect(confusions.brief).toContain('判据')
  })

  it('lessonTemplateBriefHint 按类型渲染区清单 + 写作要求（重点区带 [重点] 标记，其它区不打标签）', () => {
    const hint = lessonTemplateBriefHint('K-concept')
    expect(hint).toContain('definition（定义）[重点]')
    expect(hint).toContain('detail（详解）[重点]')
    expect(hint).toContain('examples（案例）[重点]')
    expect(hint).toContain('meta（学习前必读）：')
    expect(hint).not.toContain('meta（学习前必读）[')
    // 实操/辨析是支撑区：不给 [重点] 标签（重点始终是定义/详解/案例）
    expect(hint).toContain('operation（实操）：')
    expect(hint).not.toContain('operation（实操）[')
    // brief 正文与参考下限必须进提示词（不是只给区名）
    expect(hint).toContain(sectionSpecOf('detail')!.brief.slice(0, 12))
    expect(hint).toContain(`至少 ${sectionSpecOf('detail')!.minChars} 字`)
    // 已合并的历史区不进提示词
    expect(hint).not.toContain('structure（')
    expect(hint).not.toContain('why（')
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
    expect(menu).not.toContain('pitfalls（')
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
        { key: 'why', md: long(700, '动机') }, // v8：why 已折到 meta，两个导学区都算进 meta
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
    expect(canonicalSectionKey('why')).toBe('meta') // v8：为什么学它并入学习前必读
  })

  it('已合并的区名折到目标区（cost → 详解、code/steps → 实操、pitfalls/contrast → 辨析与易错）', () => {
    expect(canonicalSectionKey('cost')).toBe('detail')
    expect(canonicalSectionKey('scope')).toBe('detail')
    expect(canonicalSectionKey('proof')).toBe('detail')
    expect(canonicalSectionKey('types')).toBe('detail')
    expect(canonicalSectionKey('steps')).toBe('operation')
    expect(canonicalSectionKey('code')).toBe('operation')
    expect(canonicalSectionKey('js')).toBe('operation')
    expect(canonicalSectionKey('edge-cases')).toBe('confusions')
    expect(canonicalSectionKey('pitfall')).toBe('confusions')
    expect(canonicalSectionKey('contrast')).toBe('confusions')
    expect(canonicalSectionKey('counter-example')).toBe('examples')
    expect(sectionTitleOf('structure')).toBe('详解')
    expect(sectionTitleOf('edge')).toBe('辨析与易错')
    expect(sectionTitleOf('code')).toBe('实操')
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
    expect(sectionStyleOf('confusions')).toBe('note')
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

describe('normalizeCardSections（v8：再合并 + 按主干重排，内容一字不删）', () => {
  it('张量卡（v5 序）：为什么学它并进学习前必读、规则并进详解、代码并进实操、自测答案拆独立区；v9 保持 v5 的正文相对顺序（先例后律）', () => {
    const { sections, changes } = normalizeCardSections({ essenceType: 'K-concept', sections: TENSOR_SECTIONS })
    expect(sections.map((s) => s.key)).toEqual([
      'meta', 'examples', 'definition', 'detail', 'operation', 'confusions', 'selfcheck', 'answers', 'notes',
    ])
    expect(sections[0].title).toBe('学习前必读')
    // 原「为什么学它」作为小标题留在导学区里
    expect(sections[0].md).toContain('### 为什么学它')
    expect(sections[0].md).toContain('你刚学完') // meta 原内容未丢
    expect(sections[3].title).toBe('详解')
    expect(sections[3].md).toContain('规则一：逐元素运算') // rules 的内容并入详解，未丢
    expect(sections[4].key).toBe('operation')
    expect(sections[4].title).toBe('实操')
    expect(sections[4].md).toContain('### 落到代码') // 原区标题作为小标题保留
    expect(sections[5].title).toBe('辨析与易错')
    expect(sections[5].md).toContain('### 常见坑')
    expect(sections[7].title).toBe('参考答案')
    expect(sections[7].folded).toBe(true)
    // 答案不在题面里
    expect(sections[6].md).toContain('Q1')
    expect(sections[6].md).not.toContain('A1')
    expect(sections[7].md).toContain('A1')
    expect(changes.some((c) => c.includes('并入'))).toBe(true)
    expect(changes.some((c) => c.includes('answers'))).toBe(true)
    // 代码围栏里的注释未被标题归一化破坏
    expect(sections[4].md).toContain('# 注释')
  })

  it('自动微分卡：worked→案例、cost/mechanism→详解（内容合并）、why→导学，自造区 practice 保留在正文位（v9 锚点归位）', () => {
    const { sections, changes } = normalizeCardSections({ essenceType: 'K-concept', sections: AUTODIFF_SECTIONS })
    // v9：正文区保持模型给的相对顺序（practice 在 confusions 之前），收尾组 selfcheck 归位到尾
    expect(sections.map((s) => s.key)).toEqual([
      'meta', 'detail', 'examples', 'practice', 'confusions', 'selfcheck',
    ])
    const detail = sections.find((s) => s.key === 'detail')!
    expect(detail.md).toContain('把前向计算记成一张图') // 原 mechanism
    expect(detail.md).toContain('### 适用与局限') // 原 cost（application）的区标题作为小标题保留
    expect(detail.title).toBe('详解')
    // 正文 ## 小标题统一降到 ###
    expect(detail.md).toContain('### 1. 把前向计算记成一张图')
    expect(changes.some((c) => c.includes('并入'))).toBe(true)
    expect(sections[0].md).toContain('### 为什么学它')
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
  it('v5 老卡归一后即为 v8 形状（再合并 + 重排），无需历史模板兜底', () => {
    const { sections } = normalizeCardSections({ essenceType: 'K-concept', sections: TENSOR_SECTIONS })
    const result = checkLessonSectionsShape({ essenceType: 'K-concept', sections })
    expect(result.ok).toBe(true)
    expect(result.note).toBeNull()
  })

  it('v5/v6/v7/v8 模板作为历史版本留档（章节数逐版下降）', () => {
    expect(LESSON_TEMPLATE_VERSION_CURRENT).toBe('v9')
    expect(LESSON_LEGACY_TEMPLATES.map((l) => l.version)).toEqual(['v8', 'v7', 'v6', 'v5'])
    for (const type of DL_ESSENCE_TYPES) {
      const v5 = LESSON_TEMPLATES_V5[type]
      const v6 = LESSON_TEMPLATES_V6[type]
      const v7 = LESSON_TEMPLATES_V7[type]
      const v8 = LESSON_TEMPLATES[type]
      expect(v5.includes('examples')).toBe(true)
      expect(v6.indexOf('examples')).toBeGreaterThan(v6.indexOf('definition'))
      expect(v7.length).toBeLessThan(v5.length)
      expect(v8.length).toBeLessThan(v7.length)
      // v8 的区都能在 v7 里找到（例外：v8 把辨析/常见坑并成「辨析与易错」，把步骤/代码并成「实操」）
      for (const key of v8) {
        const mergedInV8 = key === 'confusions' || key === 'operation'
        expect(v7.includes(key) || mergedInV8, `${type}: v8 的 ${key} 不在 v7 里`).toBe(true)
      }
    }
  })

  it('v9：自造区合法但字段必须自带——practice 有 title 缺 role → 拒绝并说明五选一', () => {
    const { sections } = normalizeCardSections({ essenceType: 'K-concept', sections: AUTODIFF_SECTIONS })
    const result = checkLessonSectionsShape({ essenceType: 'K-concept', sections })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('practice')
    expect(result.reason).toContain('role')
  })

  it('v9：自造区带齐 title + role → 通过（复杂主题可自造章节）', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'definition', md: 'b' },
        { key: 'architecture', title: '整体架构', role: 'core', md: 'c' },
        { key: 'ecosystem', title: '生态与周边', role: 'support', md: 'd' },
        { key: 'selfcheck', md: '**Q1** 题' },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.note).toBeNull()
  })

  it('v9：自造区缺 title → 拒绝（章节名由规划给出）', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'definition', md: 'b' },
        { key: 'architecture', role: 'core', md: 'c' },
        { key: 'selfcheck', md: '**Q1** 题' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('title')
  })

  it('v9：正文区顺序自由（详解排在定义之前不再拒绝——章节顺序由规划决定）', () => {
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
    expect(result.ok).toBe(true)
    expect(result.note).toBeNull()
  })

  it('v9：锚点位置仍被把守——正文区出现在自测之后 → 拒绝', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: 'a' },
        { key: 'selfcheck', md: '**Q1** 题' },
        { key: 'definition', md: 'b' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('收尾')
  })

  it('v9：meta 不在首位 → 拒绝', () => {
    const result = checkLessonSectionsShape({
      essenceType: 'K-concept',
      sections: [
        { key: 'definition', md: 'b' },
        { key: 'meta', md: 'a' },
        { key: 'selfcheck', md: '**Q1** 题' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('首位')
  })

  it('未归一的 v5 老卡（案例排在详解之前）→ v9 放行（正文区顺序自由，无需历史模板兜底）', () => {
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
    expect(result.note).toBeNull()
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

  it('v8 合规卡（定义 → 详解 → 案例 → 实操 → 辨析与易错）→ 通过且无附注', () => {
    const { sections } = normalizeCardSections({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: '### 前置\n无需前置。\n\n### 为什么学它\n动机。' },
        { key: 'definition', md: '严格定义与边界' },
        { key: 'detail', md: '主线 + 逐类展开 + 对比表 + 判定规则' },
        { key: 'examples', md: '案例' },
        { key: 'operation', md: '照着做的三步' },
        { key: 'confusions', md: '辨析与易错' },
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