/**
 * 讲义「版式设备」契约（纯函数）
 * @module tests/unit/shared/lesson-layout.spec
 *
 * 背景（2026-09-14 用户反馈）：「生成讲义功能太简陋……不美观，纯粹的堆砌文字，
 * 没有对文字做精炼归纳，没有配图，布局单调简陋」。
 *
 * 本 spec 钉死三件事：
 * 1. 设备目录（15 个版式）与别名归一 —— 提示词/门禁/渲染共用一份；
 * 2. 正文形状分析（图/表/公式/代码/引用/列表/数据看点）—— 质检判据的输入；
 * 3. 视觉质检两级（阻断 / 警告）—— 「文字墙」「通篇无图」「声明版式与正文不符」必须被拦下，
 *    「版式单调」「长区没归纳」给出可执行修复建议。
 */
import { describe, it, expect } from 'vitest'
import {
  LESSON_LAYOUT_CATALOG,
  LESSON_LAYOUT_RHYTHM,
  analyzeLessonMd,
  canonicalLessonLayout,
  checkLessonVisualQuality,
  defaultLayoutForSection,
  lessonLayoutHint,
  lessonLayoutName,
  parseLessonChecklist,
  parseLessonPoints,
  parseLessonStats,
  parseLessonSteps,
  parseLessonTimeline,
  presentLessonSections,
  resolveSectionLayout,
  splitLessonDeviceMd,
  type DlLessonLayout,
} from '@shared/utils/lesson-layout'

/** 造一个「达标」的讲义：有图、有表、有要点卡，用于对照 */
const OK_SECTIONS = [
  {
    key: 'meta',
    md: ['- **读者画像**：会 Python，没学过线代', '- **学完能做到**：能说出形状规则、能算出广播结果'].join('\n'),
    layout: 'keypoints',
    takeaway: '这张卡把张量的形状与运算一次讲清',
  },
  {
    key: 'examples',
    md: ['给一个算例：(4,1) 与 (1,3) 广播。', '', '```figure', '{"type":"shape","dims":[4,3],"labels":["行","列"]}', '```'].join('\n'),
    layout: 'figure',
    takeaway: '(4,1)+(1,3) → (4,3)',
  },
  {
    key: 'structure',
    md: ['| 运算 | 形状要求 |', '| --- | --- |', '| 加法 | 可广播 |'].join('\n'),
    layout: 'compare',
  },
]

describe('版式设备目录', () => {
  it('15 个设备，key 唯一且都带名称/用途/形状要求', () => {
    expect(LESSON_LAYOUT_CATALOG.length).toBe(15)
    const keys = LESSON_LAYOUT_CATALOG.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const d of LESSON_LAYOUT_CATALOG) {
      expect(d.name.trim().length).toBeGreaterThan(0)
      expect(d.purpose.trim().length).toBeGreaterThan(0)
      expect(d.shapeHint.trim().length).toBeGreaterThan(0)
    }
  })

  it('别名归一（写法容错），未收录写法返回空串', () => {
    expect(canonicalLessonLayout('points')).toBe('keypoints')
    expect(canonicalLessonLayout('要点卡')).toBe('keypoints')
    expect(canonicalLessonLayout('table')).toBe('compare')
    expect(canonicalLessonLayout('Figure')).toBe('figure')
    expect(canonicalLessonLayout('steps')).toBe('steps')
    expect(canonicalLessonLayout('自造版式')).toBe('')
  })

  it('设备中文名可查（渲染徽标与提示词共用）', () => {
    expect(lessonLayoutName('keypoints')).toBe('要点卡')
    expect(lessonLayoutName('worked')).toBe('算例推演')
    expect(lessonLayoutName('不存在的')).toBe('')
  })

  it('默认版式一律 prose（2026-09-15 用户口径「不要卡片样式」：讲义按文档排，不自动套卡片）', () => {
    for (const key of ['meta', 'why', 'definition', 'detail', 'examples', 'pitfalls', 'selfcheck', 'checks', 'structure', 'justification', '未知区']) {
      expect(defaultLayoutForSection(key), `${key} 的默认版式应为 prose`).toBe('prose')
    }
  })

  it('版式解析优先级：显式 layout > 大纲 roster > 默认 prose', () => {
    expect(resolveSectionLayout({ key: 'definition', layout: 'callout' })).toBe('callout')
    expect(resolveSectionLayout({ key: 'definition', rosterLayout: 'compare' })).toBe('compare')
    expect(resolveSectionLayout({ key: 'definition' })).toBe('prose')
    expect(resolveSectionLayout({ key: 'procedure' })).toBe('prose')
  })

  it('提示词可拿到完整设备菜单（生成侧与门禁同源）', () => {
    const hint = lessonLayoutHint()
    for (const d of LESSON_LAYOUT_CATALOG) expect(hint).toContain(d.key)
    expect(hint).toContain('要点卡')
  })
})

describe('正文形状分析（质检判据输入）', () => {
  it('识别代码围栏类型：figure / mermaid / js / 其他代码', () => {
    const md = [
      '说明文字。',
      '```figure',
      '{"type":"bar","items":[]}',
      '```',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      '```js',
      'console.log(1)',
      '```',
      '```python',
      'print(1)',
      '```',
    ].join('\n')
    const st = analyzeLessonMd(md)
    expect(st.figures).toBe(1)
    expect(st.mermaid).toBe(1)
    expect(st.jsBlocks).toBe(1)
    expect(st.codeBlocks).toBe(2) // js + python
    expect(st.graphic).toBe(true)
  })

  it('识别表格 / 引用 / 列表 / 勾选清单 / 数据看点', () => {
    const md = [
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '> 引文一句',
      '',
      '- 普通要点',
      '- [x] 已完成事项',
      '- [ ] 待办事项',
      '',
      '1. 第一步',
      '2. 第二步',
      '',
      '- 68% | 命中率 | 换数据集会掉',
      '- 2.1x | 速度提升',
    ].join('\n')
    const st = analyzeLessonMd(md)
    expect(st.tables).toBe(1)
    expect(st.quotes).toBe(1)
    expect(st.bullets).toBeGreaterThanOrEqual(3)
    expect(st.checkboxes).toBe(2)
    expect(st.ordered).toBe(2)
    expect(st.statsItems).toBe(2)
    expect(st.structured).toBe(true)
  })

  it('识别块级公式（$$ 独立成行）与行内公式', () => {
    const block = analyzeLessonMd(['先看式子：', '', '$$', 'p(x|y)=\\frac{p(y|x)p(x)}{p(y)}', '$$'].join('\n'))
    expect(block.formulas).toBe(1)
    const inline = analyzeLessonMd('其中 $p(x)$ 是先验，$p(y|x)$ 是似然。')
    expect(inline.formulas).toBe(0)
    expect(inline.inlineFormulas).toBe(2)
  })

  it('代码围栏内的 # 与 | 不误判成标题/表格（围栏状态机）', () => {
    const st = analyzeLessonMd(['```js', '// # 注释', 'const t = "| a | b |"', '```'].join('\n'))
    expect(st.headings).toBe(0)
    expect(st.tables).toBe(0)
  })

  it('纯文字长段落：structured=false、chars 统计不含代码围栏', () => {
    const prose = '张量是'.repeat(50) + '。'
    const st = analyzeLessonMd(prose)
    expect(st.structured).toBe(false)
    expect(st.chars).toBe(prose.length)
    const withCode = '一句话。\n\n```js\n' + 'x'.repeat(500) + '\n```'
    expect(analyzeLessonMd(withCode).chars).toBeLessThan(60)
  })
})

describe('视觉质检：阻断项（堆砌文字必须被拦下）', () => {
  const longProse = '张量的形状规则决定了运算能不能做，'.repeat(60) + '。'

  it('纯文字长段（超过上限且无小标题/列表/图/表）= 文字墙 → 阻断（走完规划流程时）', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'mechanism', md: longProse, layout: 'prose' }],
      strict: true,
    })
    expect(longProse.length).toBeGreaterThan(LESSON_LAYOUT_RHYTHM.proseWallChars)
    expect(r.blocking.map((i) => i.code)).toContain('prose-wall')
    const issue = r.blocking.find((i) => i.code === 'prose-wall')!
    expect(issue.sectionKey).toBe('mechanism')
    expect(issue.fix).toContain('要点卡') // 修复建议可执行
  })

  it('快速模式（未走规划）同一个文字墙降级为警告（不卡死自动推进，但要让模型看见）', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'mechanism', md: longProse, layout: 'prose' }],
    })
    expect(r.blocking.map((i) => i.code)).not.toContain('prose-wall')
    const issue = r.warnings.find((i) => i.code === 'prose-wall')
    expect(issue).toBeTruthy()
    expect(issue!.fix).toContain('要点卡')
  })

  it('长区但有小标题/列表 → 不算文字墙（归纳过就不拦）', () => {
    const summarized = '### 形状规则\n' + longProse + '\n\n- 要点一\n- 要点二'
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'mechanism', md: summarized, layout: 'prose' }],
      strict: true,
    })
    expect(r.blocking.map((i) => i.code)).not.toContain('prose-wall')
  })

  it('整篇（≥4 区）没有任何图/表/公式/代码 → 阻断（用户要的「配图」硬要求；走完规划流程时）', () => {
    const texts = [
      { key: 'meta', md: '- 读者画像：会 Python', layout: 'keypoints' },
      { key: 'essence', md: '张量是带形状的多维数组。', layout: 'prose' },
      { key: 'definition', md: '形状是一串整数。', layout: 'prose' },
      { key: 'rules', md: '- 加法要可广播\n- 乘法按轴约简', layout: 'keypoints' },
    ]
    const r = checkLessonVisualQuality({ essenceType: 'K-concept', sections: texts, strict: true })
    expect(r.blocking.map((i) => i.code)).toContain('no-graphic-carrier')
    expect(r.blocking.find((i) => i.code === 'no-graphic-carrier')!.fix).toContain('figure')
    // 快速模式下降级为警告
    const soft = checkLessonVisualQuality({ essenceType: 'K-concept', sections: texts })
    expect(soft.blocking.map((i) => i.code)).not.toContain('no-graphic-carrier')
    expect(soft.warnings.map((i) => i.code)).toContain('no-graphic-carrier')
  })

  it('区数少（3 区）时同一问题降级为警告（不误伤短讲义）', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: '- 画像：会 Python', layout: 'keypoints' },
        { key: 'essence', md: '一句话本质。', layout: 'prose' },
        { key: 'definition', md: '一句话定义。', layout: 'prose' },
      ],
      strict: true,
    })
    expect(r.blocking.map((i) => i.code)).not.toContain('no-graphic-carrier')
    expect(r.warnings.map((i) => i.code)).toContain('no-graphic-carrier')
  })

  it('声明版式与正文形状不符（声明要点卡却写成大段散文）→ 阻断', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'rules', md: '规则就是形状要能对齐，否则不能相加。', layout: 'keypoints' }],
    })
    const issue = r.blocking.find((i) => i.code === 'layout-shape-mismatch')
    expect(issue).toBeTruthy()
    expect(issue!.message).toContain('要点卡')
    expect(issue!.fix).toContain('要点卡')
  })

  it('未声明版式的区按 prose 呈现（2026-09-15「不要卡片样式」），不会因模板兜底被判形状不符', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'structure', md: '组成分三部分，这里只用文字说。' }],
    })
    expect(r.blocking.map((i) => i.code)).not.toContain('layout-shape-mismatch')
    expect(r.warnings.some((i) => i.code === 'layout-shape-suggestion')).toBe(false)
  })

  it('大纲声明某区要配图、正文却没有 → 阻断（roster 载体覆盖）', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [
        { key: 'meta', md: '- 画像：会 Python', layout: 'keypoints' },
        { key: 'mechanism', md: '机制一句话解释。', layout: 'prose' },
      ],
      roster: [
        { key: 'meta', layout: 'keypoints' },
        { key: 'mechanism', layout: 'prose', carrier: 'figure' },
      ],
    })
    const issue = r.blocking.find((i) => i.code === 'roster-carrier-missing')
    expect(issue).toBeTruthy()
    expect(issue!.sectionKey).toBe('mechanism')
  })

  it('空区 → 阻断（宁可少一区，不要空壳）', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'definition', md: '   ', layout: 'prose' }],
    })
    expect(r.blocking.map((i) => i.code)).toContain('empty-section')
  })
})

describe('视觉质检：警告项（可修但不必拦）', () => {
  it('长区未归纳（超过长区上限但结构化）→ 警告', () => {
    const md = '### 小标题\n' + '巴拉'.repeat(300)
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [
        { key: 'mechanism', md, layout: 'prose' },
        { key: 'examples', md: '```figure\n{"type":"bar","items":[{"label":"a","value":1}]}\n```', layout: 'figure' },
      ],
    })
    expect(r.warnings.map((i) => i.code)).toContain('long-section')
  })

  it('连续 ≥3 个纯文字区 → 警告（布局单调）', () => {
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [
        { key: 'essence', md: '本质一句话。', layout: 'prose' },
        { key: 'definition', md: '定义一句话。', layout: 'prose' },
        { key: 'detail', md: '详解一句话。', layout: 'prose' },
        { key: 'examples', md: '```figure\n{"type":"bar","items":[{"label":"a","value":1}]}\n```', layout: 'figure' },
      ],
    })
    expect(r.warnings.map((i) => i.code)).toContain('consecutive-plain')
  })

  it('整篇只用一种版式（≥4 区）→ 警告（布局单调）', () => {
    const sec = (key: string) => ({ key, md: '- 要点一：说明\n- 要点二：说明', layout: 'keypoints' })
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [sec('meta'), sec('rules'), sec('property'), sec('application')],
    })
    expect(r.warnings.map((i) => i.code)).toContain('device-monotony')
  })

  it('要点卡单条没精炼（超过上限字数）→ 警告', () => {
    const long = '这一条要点写得太长'.repeat(12)
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'why', md: `- ${long}`, layout: 'keypoints' }],
    })
    expect(r.warnings.map((i) => i.code)).toContain('unrefined-points')
  })

  it('长正文区缺一句话结论（takeaway）→ 警告', () => {
    const md = '### 小标题\n' + '内容'.repeat(220)
    const r = checkLessonVisualQuality({
      essenceType: 'K-concept',
      sections: [{ key: 'mechanism', md, layout: 'prose' }],
    })
    expect(r.warnings.map((i) => i.code)).toContain('missing-takeaway')
  })

  it('质检报告带全文统计（区数/载体数/版式种类），供动作摘要与 UI 展示', () => {
    const r = checkLessonVisualQuality({ essenceType: 'K-concept', sections: OK_SECTIONS })
    expect(r.stats.sections).toBe(3)
    expect(r.stats.graphicSections).toBe(2) // figure + compare
    expect(r.stats.devices.length).toBeGreaterThanOrEqual(3)
    expect(r.blocking).toHaveLength(0)
  })
})

describe('设备条目解析（渲染层按设备二次拆解，纯函数可测）', () => {
  it('要点卡：`- **术语**：一句话` → 标题 + 说明', () => {
    const items = parseLessonPoints(['- **张量**：带形状的多维数组', '- 形状：一串整数', '', '尾注一句'].join('\n'))
    expect(items).toEqual([
      { title: '张量', desc: '带形状的多维数组' },
      { title: '形状', desc: '一串整数' },
    ])
  })

  it('步骤条：有序列表 → 带序号的步骤', () => {
    const steps = parseLessonSteps(['1. **取形状**：读出两个张量的 shape', '2. **看广播**：逐轴比对'].join('\n'))
    expect(steps).toEqual([
      { no: 1, title: '取形状', desc: '读出两个张量的 shape' },
      { no: 2, title: '看广播', desc: '逐轴比对' },
    ])
  })

  it('数据看点：`- 68% | 命中率 | 备注` → 数值 + 说明 + 备注', () => {
    const stats = parseLessonStats(['- 68% | 命中率 | 换数据集会掉', '- 2.1x | 速度提升'].join('\n'))
    expect(stats).toEqual([
      { value: '68%', label: '命中率', note: '换数据集会掉' },
      { value: '2.1x', label: '速度提升', note: '' },
    ])
  })

  it('勾选清单与时间线', () => {
    expect(parseLessonChecklist(['- [x] 装好环境', '- [ ] 跑通示例'].join('\n'))).toEqual([
      { text: '装好环境', done: true },
      { text: '跑通示例', done: false },
    ])
    expect(parseLessonTimeline(['- 2012：AlexNet 夺冠', '- 2017：Transformer'].join('\n'))).toEqual([
      { marker: '2012', title: 'AlexNet 夺冠', desc: '' },
      { marker: '2017', title: 'Transformer', desc: '' },
    ])
  })

  it('解析不出条目时返回空数组（渲染层退回整段 markdown，不吞内容）', () => {
    expect(parseLessonPoints('就是一段散文，没有列表。')).toEqual([])
    expect(parseLessonStats('没有数据看点。')).toEqual([])
  })

  // 结构化设备只摘掉"已变成卡片的列表行"，夹在列表之外的正文原样保留——
  // 渲染层用「卡片 + 残余 markdown」两段渲染，绝不静默丢内容。
  describe('按设备拆分正文（卡片 + 残余，不缺斤少两）', () => {
    it('要点卡：列表行进卡片，列表外的说明段留在残余', () => {
      const md = ['先说一句总括。', '', '- **张量**：带形状的数组', '- **形状**：一串整数', '', '最后补一句边界。'].join('\n')
      const { residual } = splitLessonDeviceMd(md, 'keypoints')
      expect(residual).toContain('先说一句总括')
      expect(residual).toContain('最后补一句边界')
      expect(residual).not.toContain('- **张量**')
    })

    it('数据看点：只有 `值 | 说明` 行被摘走；普通列表行留在残余（不丢内容）', () => {
      const md = ['- 68% | 命中率', '- 这条只是普通列表项，不是数据看点'].join('\n')
      const { residual } = splitLessonDeviceMd(md, 'stats')
      expect(residual).toContain('普通列表项')
      expect(residual).not.toContain('68%')
    })

    it('时间线：没有「标记：事件」的列表行留在残余', () => {
      const md = ['- 2012：AlexNet 夺冠', '- 无冒号的补充说明'].join('\n')
      const { residual } = splitLessonDeviceMd(md, 'timeline')
      expect(residual).toBe('- 无冒号的补充说明')
    })

    it('正文类版式不拆（prose/figure 整段交给 markdown 渲染）', () => {
      const md = '- 一个列表项'
      expect(splitLessonDeviceMd(md, 'prose').residual).toBe(md)
      expect(splitLessonDeviceMd(md, 'figure').residual).toBe(md)
    })
  })
})

describe('区展示计划（渲染层数据源）', () => {
  it('每区给出设备、徽标、一句话结论与形状统计', () => {
    const plan = presentLessonSections({ essenceType: 'K-concept', sections: OK_SECTIONS })
    expect(plan).toHaveLength(3)
    expect(plan[0].layout).toBe('keypoints')
    expect(plan[0].layoutName).toBe('要点卡')
    expect(plan[0].badge).toBe('要点卡')
    expect(plan[0].takeaway).toContain('一次讲清')
    expect(plan[1].stats.figures).toBe(1)
  })

  it('正文区不挂徽标（避免每区都是花哨标签）', () => {
    const plan = presentLessonSections({
      essenceType: 'K-concept',
      sections: [{ key: 'definition', md: '定义一句话。' }],
    })
    expect(plan[0].layout).toBe('prose')
    expect(plan[0].badge).toBe('')
  })

  it('显式 layout 覆盖模板默认（模型/大纲指定优先）', () => {
    const plan = presentLessonSections({
      essenceType: 'K-concept',
      sections: [{ key: 'definition', md: '> 原文引用', layout: 'quote' as DlLessonLayout }],
    })
    expect(plan[0].layout).toBe('quote')
    expect(plan[0].badge).toBe('引文/条文')
  })
})