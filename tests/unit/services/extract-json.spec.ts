/**
 * extractJsonFromResponse 容错解析：模型重答双 JSON 拼接 / 散文包裹 / 平衡扫描
 */
import { describe, it, expect } from 'vitest'
import { extractJsonFromResponse, parseFirstBalancedJsonObject } from '@core/platform/services/ai-call'

describe('parseFirstBalancedJsonObject（括号平衡扫描）', () => {
  it('双 JSON 拼接取第一个完整对象', () => {
    const text = '{"a":1}{"b":2}'
    expect(parseFirstBalancedJsonObject(text)).toBe('{"a":1}')
  })

  it('字符串字面量内的花括号与转义引号不参与深度', () => {
    const text = '{"s":"含有 { 与 \\" 的文本"}{"b":2}'
    expect(parseFirstBalancedJsonObject(text)).toBe('{"s":"含有 { 与 \\" 的文本"}')
  })

  it('嵌套对象在深度归零处截断', () => {
    const text = '{"o":{"i":1}}尾随散文'
    expect(parseFirstBalancedJsonObject(text)).toBe('{"o":{"i":1}}')
  })

  it('未闭合返回 null；非 { 开头返回 null', () => {
    expect(parseFirstBalancedJsonObject('{"a":1')).toBeNull()
    expect(parseFirstBalancedJsonObject('x{"a":1}')).toBeNull()
  })
})

describe('extractJsonFromResponse（模型重答容错）', () => {
  it('完整 JSON + 重复第二段（deepseek 重答实证形态）→ 只取第一段', () => {
    const first = '{"atoms":[{"statement":"《天书》共四卷","type":"fact","layer":"setting","certainty":0.9,"quote":"自古魔教传下四卷","subject":"《天书》","object":"鬼王宗"}],"events":[],"scenes":[]}'
    const dup = '{"statement":"魔教自古传下四卷《天书》","type":"fact","layer":"setting","certainty":0.8,"quote":"自古魔教传下四卷","subject":"《天书》","object":"鬼王宗"}\n ],\n "events": [],\n "scenes": []\n}'
    const result = extractJsonFromResponse(first + dup)
    expect(result.atoms).toHaveLength(1)
    expect(result.atoms[0].statement).toContain('天书')
    expect(result.scenes).toEqual([])
  })

  it('JSON 后追散文 → 正常解析', () => {
    const result = extractJsonFromResponse('{"atoms":[],"events":[]}\n以上即为提取结果。')
    expect(result.atoms).toEqual([])
  })

  it('单引号包裹的字符串含花括号不破坏解析', () => {
    const result = extractJsonFromResponse('{"s":"a { b }"}')
    expect(result.s).toBe('a { b }')
  })
})
