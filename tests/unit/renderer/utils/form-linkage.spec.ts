/**
 * 声明式表单联动纯函数测试
 * @module tests/renderer/utils/form-linkage
 * @description resolveLinkageValues / linkageFieldValue：按 linkage 声明（watch/matchBy）
 *              过滤选项元数据计算联动填充值；源值为空清空；多选全选/单选填值。
 */
import { describe, it, expect } from 'vitest'
import {
  resolveLinkageValues,
  linkageFieldValue,
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
