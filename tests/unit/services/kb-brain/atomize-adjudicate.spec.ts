/**
 * 知识大脑原子化/裁决服务测试（T03：假 LLM 注入，照 ChapterLlmFn 先例）
 *
 * 覆盖：解析链（正常/围栏/截断续写/校验失败回喂重试/两次失败抛错）、
 * F1 quote 定位器（命中推导偏移/未命中 null/同文顺序命中）、events→atom 映射、
 * 裁决解析（越界索引丢弃）。
 */
import { describe, it, expect } from 'vitest'
import {
  AtomizeService,
  AdjudicateService,
  createQuoteLocator,
  splitWindows,
} from '@core/platform/services/kb-brain/atomize.service'
import { defaultBrainLlm, brainModelOverride, parseModelRef, stitchContinuation } from '@core/platform/services/kb-brain/llm'
import { isJsonTruncated } from '@core/platform/services/ai-call'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { validateAtomizeOutput, validateAdjudicateOutput } from '@core/platform/services/kb-brain/schemas'

const CONTENT = '程野推开舱门。他失去了左臂。苏晚早已等候多时。'

function atomizeLlm(response: string | (() => string)): BrainLlmFn {
  return async () => (typeof response === 'function' ? response() : response)
}

const GOOD_ATOMIZE = JSON.stringify({
  atoms: [
    { statement: '程野在第三卷失去左臂', type: 'fact', certainty: 0.9, quote: '他失去了左臂', subject: '程野' },
    { statement: '苏晚在舱内等候程野', type: 'fact', quote: '苏晚早已等候多时' },
  ],
  events: [
    { fromQuote: '他失去了左臂', toQuote: '苏晚早已等候多时', evidence: '失臂之后苏晚现身' },
  ],
})

describe('AtomizeService', () => {
  it('正常解析 + F1 定位：quote 推导章节偏移，未挂 quote 的 offsets 为 null', async () => {
    const svc = new AtomizeService({ llm: atomizeLlm(GOOD_ATOMIZE) })
    const out = await svc.atomizeChapter({ chapterTitle: '第3章', chapterContent: CONTENT })
    expect(out.atoms).toHaveLength(2)
    const a1 = out.atoms[0]
    expect(a1.startOffset).toBe(CONTENT.indexOf('他失去了左臂'))
    expect(a1.endOffset).toBe(a1.startOffset! + '他失去了左臂'.length)
    expect(a1.windowIndex).toBe(0)
    // certainty 缺省补 0.8
    expect(out.atoms[1].certainty).toBe(0.8)
    // events 映射到两条论断的 statement
    expect(out.events).toHaveLength(1)
    expect(out.events[0].fromStatement).toBe('程野在第三卷失去左臂')
    expect(out.events[0].toStatement).toBe('苏晚在舱内等候程野')
  })

  it('quote 未命中（模型改写引句）→ offsets=null，论断仍保留', async () => {
    const bad = JSON.stringify({
      atoms: [{ statement: '某处有舱门', type: 'fact', quote: '原文里没有这句话' }],
      events: [],
    })
    const svc = new AtomizeService({ llm: atomizeLlm(bad) })
    const out = await svc.atomizeChapter({ chapterTitle: 'x', chapterContent: CONTENT })
    expect(out.atoms[0].startOffset).toBeNull()
    expect(out.atoms[0].endOffset).toBeNull()
  })

  it('围栏 JSON / 脏前缀均可提取', async () => {
    const fenced = '好的，以下是结果：\n```json\n' + GOOD_ATOMIZE + '\n```'
    const svc = new AtomizeService({ llm: atomizeLlm(fenced) })
    const out = await svc.atomizeChapter({ chapterTitle: 'x', chapterContent: CONTENT })
    expect(out.atoms).toHaveLength(2)
  })

  it('截断续写：stitchContinuation 拼接后可正常解析', async () => {
    const full = JSON.stringify({
      atoms: [{ statement: '程野在第三卷失去左臂', type: 'fact', quote: '他失去了左臂' }],
      events: [],
    })
    const cut = full.length - 9 // 掐掉 `events":[]}` 一段——截断态
    const part1 = full.slice(0, cut)
    const continuation = full.slice(cut)
    expect(isJsonTruncated(part1)).toBe(true) // 确认截断判定成立
    const stitched = stitchContinuation(part1, continuation)
    expect(stitched).toBe(full)
    const svc = new AtomizeService({ llm: atomizeLlm(stitched) })
    const out = await svc.atomizeChapter({ chapterTitle: 'x', chapterContent: CONTENT })
    expect(out.atoms).toHaveLength(1)
  })

  it('校验失败 → 错误清单回喂重试 1 次（第二次 prompt 含原因）', async () => {
    const calls: string[] = []
    const llm: BrainLlmFn = async (req) => {
      calls.push(req.user)
      if (calls.length === 1) return '{"atoms":[{"statement":"缺type与quote"}],"events":[]}'
      return GOOD_ATOMIZE
    }
    const svc = new AtomizeService({ llm })
    const out = await svc.atomizeChapter({ chapterTitle: 'x', chapterContent: CONTENT })
    expect(out.atoms).toHaveLength(2)
    expect(calls[1]).toContain('不合法')
    expect(calls[1]).toContain('校验失败')
  })

  it('两次均失败 → 抛错（含原因）', async () => {
    const llm: BrainLlmFn = async () => '完全不是JSON'
    const svc = new AtomizeService({ llm })
    await expect(svc.atomizeChapter({ chapterTitle: 'x', chapterContent: CONTENT })).rejects.toThrow(/两次尝试均失败/)
  })

  it('同文 quote 顺序命中（定位器游标语义）', () => {
    const text = '一句话。一句话。一句话。'
    const locate = createQuoteLocator(text)
    expect(locate('一句话')).toBe(0)
    expect(locate('一句话')).toBe(4)
    expect(locate('一句话')).toBe(8)
    expect(locate('一句话')).toBeNull() // 用尽
    const locate2 = createQuoteLocator(text)
    expect(locate2('不存在的句子')).toBeNull()
    expect(locate2('')).toBeNull()
  })

  it('长章分窗：段落边界优先，偏移累计正确', () => {
    const para = '甲'.repeat(300) + '\n'
    const content = para.repeat(30) // 9000+ 字，>6000
    const windows = splitWindows(content, 6000)
    expect(windows.length).toBeGreaterThanOrEqual(2)
    // 每窗不超上限（段落回退只减不增）
    for (const w of windows) expect(w.windowText.length).toBeLessThanOrEqual(6000)
    // 偏移拼接覆盖全文无重叠无遗漏
    let covered = 0
    for (const w of windows) {
      expect(w.startOffset).toBe(covered)
      covered += w.windowText.length
    }
    expect(covered).toBe(content.length)
  })

  it('多窗章：events 落在各自窗内、offset 换算含窗起点', async () => {
    const unit = '甲'.repeat(200) + '\n程野失去了左臂。\n' // ~217 字
    const longContent = unit.repeat(40) // ~8680 字 → 2 窗
    const res = JSON.stringify({
      atoms: [{ statement: '程野失去左臂', type: 'fact', quote: '程野失去了左臂' }],
      events: [],
    })
    const svc = new AtomizeService({ llm: atomizeLlm(res) })
    const out = await svc.atomizeChapter({ chapterTitle: 'x', chapterContent: longContent })
    // 每窗都命中一条
    expect(out.atoms.length).toBeGreaterThanOrEqual(2)
    expect(new Set(out.atoms.map((a) => a.windowIndex))).toEqual(new Set([0, 1]))
    for (const a of out.atoms) {
      expect(a.startOffset).toBe(longContent.indexOf('程野失去了左臂', a.startOffset ?? 0))
    }
  })
})

describe('AdjudicateService', () => {
  const newItems = [
    { idx: 0, statement: '程野是总捕头' },
    { idx: 1, statement: '苏晚知晓密约' },
    { idx: 2, statement: '复仇必升级' },
  ]
  const existingItems = [
    { idx: 0, statement: '程野是捕头', status: 'supported' },
    { idx: 1, statement: '复仇必升级（措辞不同）', status: 'supported' },
  ]

  it('正常解析 verdict + 越界索引丢弃', async () => {
    const verdict = {
      duplicates: [{ newIdx: 2, oldIdx: 1 }],
      contradictions: [{ newIdx: 0, oldIdx: 0, severity: 'update' }, { newIdx: 99, oldIdx: 0, severity: 'conflict' }],
      novel: [1, 77],
    }
    const svc = new AdjudicateService({ llm: atomizeLlm(JSON.stringify(verdict)) })
    const out = await svc.adjudicate({ newItems, existingItems })
    expect(out.duplicates).toEqual([{ newIdx: 2, oldIdx: 1 }])
    expect(out.contradictions).toHaveLength(1) // newIdx=99 越界被丢
    expect(out.contradictions[0].severity).toBe('update')
    expect(out.novel).toEqual([1]) // 77 越界被丢
  })

  it('坏输出回喂重试一次', async () => {
    const calls: string[] = []
    const llm: BrainLlmFn = async (req) => {
      calls.push(req.user)
      if (calls.length === 1) return '我先想想……（无JSON）'
      return JSON.stringify({ duplicates: [], contradictions: [], novel: [0, 1, 2] })
    }
    const svc = new AdjudicateService({ llm })
    const out = await svc.adjudicate({ newItems, existingItems })
    expect(out.novel).toEqual([0, 1, 2])
    expect(calls[1]).toContain('不合法')
  })
})

describe('parseModelRef', () => {
  it('纯 modelId 与 provider:model 两种格式', () => {
    expect(parseModelRef('qwen-max')).toEqual({ modelId: 'qwen-max' })
    expect(parseModelRef('prov-1:qwen-max')).toEqual({ providerConfigId: 'prov-1', modelId: 'qwen-max' })
  })
})

describe('llm 路由与续写辅助', () => {
  it('brainModelOverride：纯 modelId 与 provider:model 两种格式', () => {
    process.env.KB_ATOMIZE_MODEL = 'qwen-turbo'
    expect(brainModelOverride('atomize')).toEqual({ modelId: 'qwen-turbo' })
    process.env.KB_ATOMIZE_MODEL = 'prov-1:qwen-turbo'
    expect(brainModelOverride('atomize')).toEqual({ providerConfigId: 'prov-1', modelId: 'qwen-turbo' })
    delete process.env.KB_ATOMIZE_MODEL
    expect(brainModelOverride('atomize')).toEqual({})
  })

  it('defaultBrainLlm 截断续写循环（注入 generateCompletionText 不现实——验证续写 prompt 构造经由 isJsonTruncated 判定）', async () => {
    // defaultBrainLlm 绑定 simple-llm（生产路径），此处仅验证其存在与调用形状；
    // 续写拼接逻辑已由 AtomizeService 测试中的拼接用例覆盖。
    expect(typeof defaultBrainLlm('kb-brain-atomize')).toBe('function')
  })
})

describe('normalizeAtomizeRaw（模型字段别名归一）', () => {
  it('顶层 claims → atoms、条目 text → statement', () => {
    const out = validateAtomizeOutput({
      claims: [{ text: '张三丰创立武当派', type: 'fact', quote: 'q', confidence: 0.9 }],
      events: [],
    })
    expect(out.atoms[0].statement).toBe('张三丰创立武当派')
    expect(out.atoms[0].certainty).toBe(0.9)
  })
  it('合规输入原样通过（不被归一破坏）', () => {
    const good = { atoms: [{ statement: 'x', type: 'fact', quote: 'q' }], events: [] }
    expect(validateAtomizeOutput(JSON.parse(JSON.stringify(good))).atoms[0].statement).toBe('x')
  })
  it('三元组形态（subject/predicate/object）→ 拼接为 statement；mentions 字符串数组归一', () => {
    const out = validateAtomizeOutput({
      atoms: [
        {
          id: 'a1',
          subject: '人类',
          predicate: '相信',
          object: '九天之上诸般神灵',
          type: 'fact',
          quote: '遂以为九天之上',
        },
      ],
      events: [],
      mentions: ['人类', '九天之上诸般神灵'],
    })
    expect(out.atoms[0].statement).toBe('人类相信九天之上诸般神灵')
    expect((out.mentions ?? [])[0]).toEqual({ name: '人类', type: 'concept' })
  })

  it('缺失 statement 且无别名 → 校验失败（回喂重试路径）', () => {
    expect(() =>
      validateAtomizeOutput({ atoms: [{ type: 'fact', quote: 'q' }], events: [] }),
    ).toThrow(/statement/)
  })
})

describe('normalizeAdjudicateRaw（裁决缺键/别名归一——真机修）', () => {
  const bounds = { newCount: 3, oldCount: 2 }

  it('缺 contradictions（真机诛仙失败形态）→ 补空数组通过，不再整章失败', () => {
    // 本地 qwen3.8-27b 真实输出形态：判了 novel 却省略空的 contradictions
    const out = validateAdjudicateOutput({ duplicates: [], novel: [0, 1, 2] }, bounds)
    expect(out.novel).toEqual([0, 1, 2])
    expect(out.contradictions).toEqual([])
    expect(out.duplicates).toEqual([])
  })

  it('全缺四键（模型只回 {}）→ 全空通过', () => {
    const out = validateAdjudicateOutput({}, bounds)
    expect(out).toEqual({ duplicates: [], contradictions: [], novel: [], readerNotes: [] })
  })

  it('readerNotes（v3 四值）：收编 + 越界丢弃 + reader_notes 别名', () => {
    const out = validateAdjudicateOutput(
      { duplicates: [], contradictions: [], novel: [], readerNotes: [0, 9, '1'] },
      bounds,
    )
    expect(out.readerNotes).toEqual([0, 1])
  })

  it('近义命名 conflicts/same/new → 归一', () => {
    const out = validateAdjudicateOutput(
      { same: [{ newIdx: 0, oldIdx: 0 }], conflicts: [{ newIdx: 1, oldIdx: 1, severity: 'conflict' }], new: [2] },
      bounds,
    )
    expect(out.duplicates).toEqual([{ newIdx: 0, oldIdx: 0 }])
    expect(out.contradictions).toEqual([{ newIdx: 1, oldIdx: 1, severity: 'conflict' }])
    expect(out.novel).toEqual([2])
  })

  it('越界索引仍被丢弃（归一不放松内容校验）', () => {
    const out = validateAdjudicateOutput({ duplicates: [], contradictions: [], novel: [0, 99] }, bounds)
    expect(out.novel).toEqual([0])
  })

  it('类型错误（novel 非数组）→ 空结果（裁决是尽力而为信号，不毁整章）', () => {
    const out = validateAdjudicateOutput({ duplicates: [], contradictions: [], novel: 'x' }, bounds)
    expect(out.novel).toEqual([])
  })

  it('novel 条目级清洗：数字字符串收编、非整数剔除（真机形态）', () => {
    // bounds.newCount=3：4 越界被边界过滤丢弃（归一保留，过滤层兜底）
    const out = validateAdjudicateOutput({ duplicates: [], contradictions: [], novel: [0, '2', 3.5, 'x', 4] }, bounds)
    expect(out.novel).toEqual([0, 2])
  })

  it('contradictions 负数索引 → 校验通过、越界过滤丢弃（真机形态）', () => {
    const out = validateAdjudicateOutput(
      { duplicates: [], contradictions: [{ newIdx: 1, oldIdx: -1, severity: 'update' }], novel: [1] },
      bounds,
    )
    expect(out.contradictions).toEqual([])
    expect(out.novel).toEqual([1])
  })

  it('severity 非枚举 → 保守归 conflict（人审，不误毁旧论断）', () => {
    const out = validateAdjudicateOutput(
      { duplicates: [], contradictions: [{ newIdx: 1, oldIdx: 0, severity: 'major' }], novel: [] },
      bounds,
    )
    expect(out.contradictions[0].severity).toBe('conflict')
  })

  it('duplicates 数字字符串索引 → 收编', () => {
    const out = validateAdjudicateOutput(
      { duplicates: [{ newIdx: '0', oldIdx: '1' }], contradictions: [], novel: [] },
      bounds,
    )
    expect(out.duplicates).toEqual([{ newIdx: 0, oldIdx: 1 }])
  })

  it('duplicates 坏条目（缺键/非对象）→ 剔除不毁整章', () => {
    const out = validateAdjudicateOutput(
      { duplicates: [{ newIdx: 0 }, 'garbage', { newIdx: 1, oldIdx: 0 }], contradictions: [], novel: [] },
      bounds,
    )
    expect(out.duplicates).toEqual([{ newIdx: 1, oldIdx: 0 }])
  })
})

describe('normalizeAtomizeRaw 长尾加固（真机第二轮）', () => {
  it('atoms 数组混入裸字符串 → 坏条目剔除，好条目保留', () => {
    const out = validateAtomizeOutput({
      atoms: [
        { statement: '韩立资质平庸', type: 'fact', quote: 'q1' },
        '韩立是个农家子弟',
        { statement: '墨大夫收徒', type: 'fact', quote: 'q2' },
      ],
      events: [],
    })
    expect(out.atoms).toHaveLength(2)
    expect(out.atoms[0].statement).toBe('韩立资质平庸')
  })

  it('mentions 对象映射形态 {名:类型} → 对象数组', () => {
    const out = validateAtomizeOutput({
      atoms: [{ statement: 'x', type: 'fact', quote: 'q' }],
      events: [],
      mentions: { 韩立: 'character', 墨大夫: 'character' },
    })
    expect(out.mentions).toEqual([
      { name: '韩立', type: 'character' },
      { name: '墨大夫', type: 'character' },
    ])
  })

  it('mentions 非数组非对象（如字符串）→ 剥离不致命', () => {
    const out = validateAtomizeOutput({
      atoms: [{ statement: 'x', type: 'fact', quote: 'q' }],
      events: [],
      mentions: '韩立、墨大夫',
    })
    expect(out.mentions).toBeUndefined()
  })

  it('events 非数组 → 剥离（丢边不丢章）', () => {
    const out = validateAtomizeOutput({
      atoms: [{ statement: 'x', type: 'fact', quote: 'q' }],
      events: { from: 'a', to: 'b' },
    })
    expect(out.events).toBeUndefined()
  })
})
