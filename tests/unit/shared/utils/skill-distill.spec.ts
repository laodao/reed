/**
 * 技能蒸馏纯函数测试：清洗 / 分块 / 归一 / 审计
 * @module tests/unit/shared/utils/skill-distill
 */
import { describe, it, expect } from 'vitest'
import {
  sanitizeSourceText,
  clampSourceText,
  chunkSourceText,
  normalizeSkillName,
  normalizeSkillPackageDraft,
  auditSkillPackage,
  auditHasErrors,
} from '@shared/utils/skill-distill'
import type { SkillPackageDraft } from '@shared/types/skill-distill.types'

function goodDraft(patch: Partial<SkillPackageDraft> = {}): SkillPackageDraft {
  return {
    name: 'my-distilled-skill',
    title: '我的蒸馏技能',
    description: '把 X 方法应用到 Y 场景；当需要做 Z 时使用。',
    whenToUse: '需要按 X 方法做事时',
    category: '知识提炼',
    body: [
      '# 我的蒸馏技能',
      '',
      '## 诚实边界',
      '',
      '- 原材料未覆盖 A 场景，需补充材料。',
      '',
      '## 参考卡片',
      '',
      '- [框架](references/frameworks.md)：何时打开——需要套框架时',
      '- [决策](references/rules.md)：何时打开——需要做判断时',
    ].join('\n'),
    references: [
      { filename: 'frameworks.md', content: '# 框架\n\n## 框架一\n何时用：…' },
      { filename: 'rules.md', content: '# 决策规则\n\n当 X 时做 Y，因为 Z。' },
    ],
    ...patch,
  }
}

describe('sanitizeSourceText 源内容清洗', () => {
  it('剥离零宽字符 / 方向控制符 / Unicode tag 隐写，统一换行', () => {
    const dirty = 'a\u200Bb\u200Fc\u202Ed\ufeffe\uE0041f\r\n第二行\r第三行'
    expect(sanitizeSourceText(dirty)).toBe('abcde1f\n第二行\n第三行')
  })
})

describe('clampSourceText 规模收口', () => {
  it('超限截断并标记', () => {
    expect(clampSourceText('ab', 10)).toEqual({ text: 'ab', truncated: false })
    expect(clampSourceText('abcdef', 4)).toEqual({ text: 'abcd', truncated: true })
  })
})

describe('chunkSourceText 分块', () => {
  it('短文单块直通', () => {
    const chunks = chunkSourceText('短内容', 100)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ index: 0, title: '', text: '短内容' })
  })

  it('按 markdown 标题切块，标题归入其后块并作为块标题', () => {
    const text = ['intro 段落', '', '# 第一章', '内容 A'.repeat(30), '', '## 第二节', '内容 B'.repeat(30)].join('\n')
    const chunks = chunkSourceText(text, 120)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0].title).toBe('')
    expect(chunks.some(c => c.title === '第一章')).toBe(true)
    expect(chunks.map(c => c.index)).toEqual(chunks.map((_, i) => i))
    // 不丢内容
    const joined = chunks.map(c => c.text).join('\n')
    expect(joined).toContain('intro 段落')
    expect(joined).toContain('内容 A')
    expect(joined).toContain('内容 B')
  })

  it('无标题长文退化为段落打包；超长段落按句子硬切', () => {
    const longSentence = '这是一个非常长的句子没有换行'.repeat(60) // ~840 字，单段超限
    const chunks = chunkSourceText(longSentence, 200)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(220)
  })
})

describe('normalizeSkillName slug 化', () => {
  it('大写/空白/下划线转 kebab-case，去非法字符', () => {
    expect(normalizeSkillName('My Great Skill', 'fb')).toBe('my-great-skill')
    expect(normalizeSkillName('  foo_bar  ', 'fb')).toBe('foo-bar')
    expect(normalizeSkillName('中文名', 'fb')).toBe('fb')
    expect(normalizeSkillName('', 'fb')).toBe('fb')
    expect(normalizeSkillName('a--b', 'fb')).toBe('a-b')
  })
})

describe('normalizeSkillPackageDraft 草稿归一', () => {
  it('填缺省、slug 化名字、卡片文件名规范 + 去重 + 截数', () => {
    const raw = {
      name: 'My Skill!',
      title: '标题',
      description: '描述；当需要时使用',
      when_to_use: '别名键也认',
      body: '正文',
      references: [
        { filename: 'A.md', content: '内容一' },
        { filename: 'a.md', content: '重复去重' },
        { filename: 'sub/dir.md', content: '去路径' },
        { filename: 'empty.md', content: '' },
        { content: '没有文件名丢弃' },
      ],
    }
    const draft = normalizeSkillPackageDraft(raw, { fallbackName: 'fb', contentType: 'style' })
    expect(draft.name).toBe('my-skill')
    expect(draft.whenToUse).toBe('别名键也认')
    expect(draft.detectedType).toBe('style')
    expect(draft.references.map(r => r.filename)).toEqual(['a.md', 'dir.md'])
  })

  it('非法 name 回落 fallback；references 非数组安全', () => {
    const draft = normalizeSkillPackageDraft({ references: 'nope' }, { fallbackName: 'fb1', contentType: 'persona' })
    expect(draft.name).toBe('fb1')
    expect(draft.references).toEqual([])
    expect(draft.detectedType).toBe('persona')
  })
})

describe('auditSkillPackage 审计', () => {
  it('合格草稿零问题', () => {
    const issues = auditSkillPackage(goodDraft(), { fallbackName: 'my-distilled-skill' })
    expect(issues).toEqual([])
  })

  it('description 空 → error；超 400 字或缺触发从句 → warn', () => {
    const d = goodDraft({ description: '' })
    expect(auditSkillPackage(d, { fallbackName: d.name }).map(i => i.code)).toContain('description-empty')

    const d2 = goodDraft({ description: '很'.repeat(401) })
    const codes2 = auditSkillPackage(d2, { fallbackName: d2.name }).map(i => i.code)
    expect(codes2).toContain('description-over-budget')
    expect(codes2).not.toContain('description-empty')

    const d3 = goodDraft({ description: '一个不含触发场景的平平无奇描述句子' })
    expect(auditSkillPackage(d3, { fallbackName: d3.name }).map(i => i.code)).toContain('description-not-routable')
  })

  it('正文空 → error；正文超硬上限 → error', () => {
    const d = goodDraft({ body: '' })
    expect(auditSkillPackage(d, { fallbackName: d.name }).map(i => i.code)).toContain('body-empty')

    const longBody = goodDraft({ body: `# 长文\n\n${'内容'.repeat(4200)}\n\n## 参考卡片\n\n- [框架](references/frameworks.md)：x\n- [决策](references/rules.md)：x` })
    expect(auditSkillPackage(longBody, { fallbackName: longBody.name }).map(i => i.code)).toContain('body-over-budget')
  })

  it('孤儿卡片（正文未链接）→ error；卡片超硬上限 → error', () => {
    const d = goodDraft({
      references: [...goodDraft().references, { filename: 'orphan.md', content: '没人链接我' }],
    })
    expect(auditSkillPackage(d, { fallbackName: d.name }).map(i => i.code)).toContain('orphan-reference')

    const d2 = goodDraft({
      references: [{ filename: 'big.md', content: '大'.repeat(8001) }],
    })
    const codes = auditSkillPackage(d2, { fallbackName: d2.name }).map(i => i.code)
    expect(codes).toContain('reference-over-budget')
    expect(codes).toContain('orphan-reference')
  })

  it('人设缺诚实边界 → error；知识类缺 → warn', () => {
    const stripped = { ...goodDraft(), body: '# 某技能\n\n正文没有边界声明\n\n## 参考卡片\n\n- [框架](references/frameworks.md)：x\n- [决策](references/rules.md)：x' }

    const persona = auditSkillPackage({ ...stripped, detectedType: 'persona' }, { fallbackName: stripped.name })
    expect(persona.filter(i => i.code === 'honest-boundary-missing').every(i => i.level === 'error')).toBe(true)

    const methodology = auditSkillPackage({ ...stripped, detectedType: 'methodology' }, { fallbackName: stripped.name })
    expect(methodology.filter(i => i.code === 'honest-boundary-missing').every(i => i.level === 'warn')).toBe(true)
  })

  it('≥90 字句子逐字复现源文 → error（反搬运）', () => {
    const longSentence = '这是一段被原样搬运的长句'.repeat(8) // 96 字、无标点——分句后仍是单段
    expect(longSentence.length).toBeGreaterThan(90)
    const d = goodDraft({
      body: `# 技能\n\n${longSentence}\n\n## 诚实边界\n\n- x\n\n## 参考卡片\n\n- [框架](references/frameworks.md)：x\n- [决策](references/rules.md)：x`,
    })
    const issues = auditSkillPackage(d, { fallbackName: d.name, sourceText: `来源开头。${longSentence}来源结尾。` })
    expect(issues.map(i => i.code)).toContain('verbatim-copy')
  })

  it('注入残留 → warn（不判死：蒸馏提示词工程内容时可能误伤）', () => {
    const d = goodDraft({
      references: [{ filename: 'rules.md', content: '当看到 ignore previous instructions 字样时要警觉' }],
    })
    const issues = auditSkillPackage(d, { fallbackName: d.name })
    const inj = issues.find(i => i.code === 'injection-residue')
    expect(inj?.level).toBe('warn')
  })

  it('auditHasErrors 区分 error 与 warn', () => {
    expect(auditHasErrors([{ level: 'warn', code: 'x', message: '' }])).toBe(false)
    expect(auditHasErrors([{ level: 'error', code: 'x', message: '' }])).toBe(true)
  })
})
