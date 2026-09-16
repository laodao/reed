/**
 * 声明式表单联动纯函数测试
 * @module tests/renderer/utils/form-linkage
 * @description resolveLinkageValues / linkageFieldValue：按 linkage 声明（watch/matchBy）
 *              过滤选项元数据计算联动填充值；源值为空清空；多选全选/单选填值。
 *              filterLinkageOptions：候选收窄（用户能选到的即会被选中的）。
 */
import { describe, it, expect } from 'vitest'
import {
  resolveLinkageValues,
  linkageFieldValue,
  filterLinkageOptions,
  type LinkageDeclaration,
  type LinkageOption,
} from '../../../../src/renderer/src/utils/form-linkage'

const TOPIC_SOURCES: LinkageOption[] = [
  { value: 's1', label: '源1', topicId: 'ai' },
  { value: 's2', label: '源2', topicId: 'ai' },
  { value: 's3', label: '源3', topicId: 'finance' },
  { value: 's4', label: '源4', topicId: 'tech' },
]

const linkage: LinkageDeclaration = { watch: 'topic', matchBy: 'topicId' }

describe('resolveLinkageValues', () => {
  it('按 matchBy 过滤匹配选项的 value（保持选项顺序）', () => {
    expect(resolveLinkageValues(linkage, 'ai', TOPIC_SOURCES)).toEqual(['s1', 's2'])
    expect(resolveLinkageValues(linkage, 'finance', TOPIC_SOURCES)).toEqual(['s3'])
  })

  it('无匹配 → 空数组', () => {
    expect(resolveLinkageValues(linkage, 'energy', TOPIC_SOURCES)).toEqual([])
  })

  it('源值为空（undefined/null/空串）→ 空数组（联动字段应清空）', () => {
    expect(resolveLinkageValues(linkage, undefined, TOPIC_SOURCES)).toEqual([])
    expect(resolveLinkageValues(linkage, null, TOPIC_SOURCES)).toEqual([])
    expect(resolveLinkageValues(linkage, '', TOPIC_SOURCES)).toEqual([])
  })

  it('值类型宽容：数字源值与字符串元数据比较', () => {
    expect(resolveLinkageValues(linkage, 0, [{ value: 'z', topicId: 0 }])).toEqual(['z'])
  })
})

describe('linkageFieldValue', () => {
  it('multi → 全部匹配 value（数组）', () => {
    expect(linkageFieldValue(linkage, 'ai', TOPIC_SOURCES, true)).toEqual(['s1', 's2'])
  })

  it('单选 → 首个匹配 value；无匹配 → undefined', () => {
    expect(linkageFieldValue(linkage, 'ai', TOPIC_SOURCES, false)).toBe('s1')
    expect(linkageFieldValue(linkage, 'nope', TOPIC_SOURCES, false)).toBeUndefined()
  })

  it('multi 且源值为空 → 空数组（清空）', () => {
    expect(linkageFieldValue(linkage, '', TOPIC_SOURCES, true)).toEqual([])
  })
})

describe('filterLinkageOptions（候选收窄）', () => {
  it('监听字段有值时只保留匹配项（与联动选中一致）', () => {
    expect(filterLinkageOptions(linkage, 'ai', TOPIC_SOURCES).map(o => o.value)).toEqual(['s1', 's2'])
    expect(filterLinkageOptions(linkage, 'finance', TOPIC_SOURCES).map(o => o.value)).toEqual(['s3'])
  })

  it('监听值为空 → 不过滤（全部候选可选）', () => {
    expect(filterLinkageOptions(linkage, '', TOPIC_SOURCES)).toEqual(TOPIC_SOURCES)
    expect(filterLinkageOptions(linkage, undefined, TOPIC_SOURCES)).toEqual(TOPIC_SOURCES)
    expect(filterLinkageOptions(linkage, null, TOPIC_SOURCES)).toEqual(TOPIC_SOURCES)
  })

  it('无匹配 → 空候选（不泄漏其它分组的来源）', () => {
    expect(filterLinkageOptions(linkage, 'energy', TOPIC_SOURCES)).toEqual([])
  })

  it('跨类别三级联动：类别 → 分组 → 来源', () => {
    const TOPICS: LinkageOption[] = [
      { value: 'ai', label: '人工智能', categoryId: 'news' },
      { value: 'fin_kb', label: '金融知识', categoryId: 'finance_kb' },
    ]
    const SOURCES: LinkageOption[] = [
      { value: 's1', topicId: 'ai', categoryId: 'news' },
      { value: 's2', topicId: 'fin_kb', categoryId: 'finance_kb' },
    ]
    const catLinkage: LinkageDeclaration = { watch: 'sourceCategory', matchBy: 'categoryId' }
    const topicLinkage: LinkageDeclaration = { watch: 'topic', matchBy: 'topicId' }
    expect(filterLinkageOptions(catLinkage, 'finance_kb', TOPICS).map(o => o.value)).toEqual(['fin_kb'])
    expect(filterLinkageOptions(topicLinkage, 'fin_kb', SOURCES).map(o => o.value)).toEqual(['s2'])
  })
})
