/**
 * 订阅匹配规则单测（10-event-system §5.2 / §10 通配符匹配矩阵）
 */
import { describe, it, expect } from 'vitest'
import { matchTypePattern, matchesFilter } from '@core/platform/services/event-system/event-matcher'

describe('matchTypePattern 通配符矩阵', () => {
  const cases: Array<[string, string, boolean]> = [
    // 全量
    ['*', 'kb:document-completed', true],
    ['*', 'workflow.run.run-status', true],
    // 冒号式领域事件前缀
    ['kb:*', 'kb:document-completed', true],
    ['kb:*', 'kb:translation-completed', true],
    ['kb:*', 'kbx:other', false], // 前缀按段边界（含分隔符），不误配相似前缀
    ['kb:*', 'workflow:x', false],
    ['agent:*', 'agent:task-terminal', true],
    // 点分层 run 生命周期族
    ['workflow.run.*', 'workflow.run.run-status', true],
    ['workflow.run.*', 'workflow.run.review-requested', true],
    ['workflow.run.*', 'workflow.run', false], // 'a.b.*' 不匹配 'a.b' 自身
    ['workflow.run.*', 'workflow.other.x', false],
    ['workflow:*', 'workflow.run.run-status', false], // 冒号与点分层不互通
    // 精确名
    ['kb:document-completed', 'kb:document-completed', true],
    ['kb:document-completed', 'kb:document-failed', false],
    ['a.b.c', 'a.b.c', true],
    ['a.b.c', 'a.b', false],
  ]
  it.each(cases)('模式 %s vs 事件 %s → %s', (pattern, type, expected) => {
    expect(matchTypePattern(pattern, type)).toBe(expected)
  })
})

describe('matchesFilter（types OR + aggregate AND）', () => {
  const event = {
    type: 'kb:document-completed',
    aggregate: { kind: 'kb_document', id: 'doc-1' },
  }

  it('types 多元素 OR', () => {
    expect(matchesFilter({ types: ['voice:*', 'kb:*'] }, event)).toBe(true)
    expect(matchesFilter({ types: ['voice:*', 'image:*'] }, event)).toBe(false)
  })

  it('types 空数组不匹配任何事件', () => {
    expect(matchesFilter({ types: [] }, event)).toBe(false)
  })

  it('聚合过滤：单字段匹配 / 不匹配', () => {
    expect(matchesFilter({ types: ['*'], aggregate: { kind: 'kb_document' } }, event)).toBe(true)
    expect(matchesFilter({ types: ['*'], aggregate: { kind: 'workflow_run' } }, event)).toBe(false)
    expect(matchesFilter({ types: ['*'], aggregate: { id: 'doc-1' } }, event)).toBe(true)
    expect(matchesFilter({ types: ['*'], aggregate: { id: 'doc-2' } }, event)).toBe(false)
  })

  it('聚合过滤：两字段同时给定为 AND', () => {
    expect(
      matchesFilter({ types: ['*'], aggregate: { kind: 'kb_document', id: 'doc-1' } }, event)
    ).toBe(true)
    expect(
      matchesFilter({ types: ['*'], aggregate: { kind: 'kb_document', id: 'doc-2' } }, event)
    ).toBe(false)
    expect(
      matchesFilter({ types: ['*'], aggregate: { kind: 'workflow_run', id: 'doc-1' } }, event)
    ).toBe(false)
  })
})
