/**
 * LLM 输出 JSON 提取单测（info-collection-json）
 * @module tests/unit/shared/info-collection-json.spec
 */
import { describe, it, expect } from 'vitest'
import { extractJsonBlock, parseJsonObject } from '@shared/utils/info-collection-json'

describe('extractJsonBlock / parseJsonObject', () => {
  it('裸 JSON 直取', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('```json 围栏 + 前后缀说明文字', () => {
    const out = '好的，以下是蓝图：\n```json\n{"goal":"测试","n":2}\n```\n请确认。'
    expect(parseJsonObject(out)).toEqual({ goal: '测试', n: 2 })
  })

  it('字符串内的花括号/引号不破坏配对', () => {
    const out = '前缀 {"s":"含 } 与 \\" 的字符串","ok":true} 后缀'
    expect(parseJsonObject(out)).toEqual({ s: '含 } 与 " 的字符串', ok: true })
  })

  it('嵌套对象完整提取', () => {
    const out = 'x {"a":{"b":{"c":1}},"list":[{},{"n":2}]}'
    expect(parseJsonObject(out)).toEqual({ a: { b: { c: 1 } }, list: [{}, { n: 2 }] })
  })

  it('截断（无闭合）→ null', () => {
    expect(parseJsonObject('{"a":1,"b":{"c":2')).toBeNull()
  })

  it('无 JSON → null', () => {
    expect(parseJsonObject('抱歉，我无法完成')).toBeNull()
    expect(parseJsonObject('')).toBeNull()
  })

  it('顶层数组 → null（契约要求对象）', () => {
    expect(parseJsonObject('[1,2,3]')).toBeNull()
  })

  it('extractJsonBlock 返回可 JSON.parse 的原文块', () => {
    const block = extractJsonBlock('说明 {"k":"v"} 尾部')
    expect(block).toBe('{"k":"v"}')
  })
})
