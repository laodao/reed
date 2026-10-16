/**
 * 分镜提示词实体 token 测试（评审#89 沉淀 ShotPromptEditor 纯逻辑）
 * 覆盖：单段/两段/三段解析、非法索引、序列化省略段、解析-序列化往返。
 */
import { describe, it, expect } from 'vitest'
import { splitEntityRef, serializeEntityToken } from '@/utils/shot-prompt-token'

describe('splitEntityRef', () => {
  it('单段：只点名资产', () => {
    expect(splitEntityRef('杜十娘')).toEqual({ name: '杜十娘', index: null, id: null })
  })
  it('两段：名字@索引', () => {
    expect(splitEntityRef('杜十娘@2')).toEqual({ name: '杜十娘', index: 2, id: null })
  })
  it('三段：名字@索引@实体id（评审#48）', () => {
    expect(splitEntityRef('杜十娘@2@bind_9')).toEqual({ name: '杜十娘', index: 2, id: 'bind_9' })
  })
  it('索引非数字段视为 id（不误判）', () => {
    expect(splitEntityRef('杜十娘@bind_1')).toEqual({ name: '杜十娘', index: null, id: 'bind_1' })
  })
  it('名字含空格/边界：首段保持原样', () => {
    expect(splitEntityRef('杜 十娘@1')).toEqual({ name: '杜 十娘', index: 1, id: null })
  })
})

describe('serializeEntityToken', () => {
  it('按需省略段', () => {
    expect(serializeEntityToken('杜十娘', null, null)).toBe('@[杜十娘]')
    expect(serializeEntityToken('杜十娘', 3, null)).toBe('@[杜十娘@3]')
    expect(serializeEntityToken('杜十娘', 3, 'b1')).toBe('@[杜十娘@3@b1]')
    expect(serializeEntityToken('杜十娘', null, 'b1')).toBe('@[杜十娘@b1]')
  })
  it('解析-序列化往返可逆', () => {
    const cases = ['@[杜十娘@2@b9]', '@[杜十娘@2]', '@[杜十娘]']
    for (const raw of cases) {
      const inner = raw.slice(2, -1)
      const p = splitEntityRef(inner)
      expect(serializeEntityToken(p.name, p.index, p.id)).toBe(raw)
    }
  })
})
