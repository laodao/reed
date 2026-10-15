/**
 * parseJsonPayload 容错解析单测
 * 覆盖：整体 parse、代码围栏、前后废话包裹（含废话中 '[' 干扰）、括号配平、
 * 顶层 object 包装（json_object 模式产物）与裸数组（旧产物/Anthropic 降级）双兼容。
 */
import { describe, it, expect } from 'vitest'
import { parseJsonPayload, extractArrayField } from '@core/platform/services/longwriting/json-payload'

describe('parseJsonPayload', () => {
  it('整体 parse：裸数组与对象直出', () => {
    expect(parseJsonPayload('[{"a":1}]').ok).toBe(true)
    expect(parseJsonPayload('{"items":[1,2]}').ok).toBe(true)
    expect(parseJsonPayload('[{"a":1}]').data).toEqual([{ a: 1 }])
  })

  it('剥离 markdown 代码围栏', () => {
    const raw = '```json\n{"items":[{"name":"事件A"}]}\n```'
    const r = parseJsonPayload(raw)
    expect(r.ok).toBe(true)
    expect(extractArrayField(r.data, 'items')).toEqual([{ name: '事件A' }])
  })

  it('废话前后包裹：从首个 { 配平截取（旧贪心正则会被废话中的 [ 带偏，此处回归）', () => {
    const raw = '好的，以下是提取结果[注]：\n{"items":[{"name":"事件B"}]}\n希望有帮助。'
    const r = parseJsonPayload(raw)
    expect(r.ok).toBe(true)
    expect(extractArrayField(r.data, 'items')).toEqual([{ name: '事件B' }])
  })

  it('废话包裹的裸数组（Anthropic 降级路径）', () => {
    const raw = '提取结果如下：\n[{"name":"事件C"}]\n以上。'
    const r = parseJsonPayload(raw)
    expect(r.ok).toBe(true)
    expect(r.data).toEqual([{ name: '事件C' }])
  })

  it('字符串内的括号/引号不干扰配平', () => {
    const raw = '{"items":[{"name":"他说\\"开门[啊]\\""}]}'
    const r = parseJsonPayload(raw)
    expect(r.ok).toBe(true)
    expect(extractArrayField(r.data, 'items')![0]).toEqual({ name: '他说"开门[啊]"' })
  })

  it('彻底非法输入返回 ok=false（调用方走空转防线重试）', () => {
    expect(parseJsonPayload('').ok).toBe(false)
    expect(parseJsonPayload('模型拒绝回答了').ok).toBe(false)
    expect(parseJsonPayload('[{"a":1]').ok).toBe(false)
  })
})

describe('extractArrayField', () => {
  it('顶层数组原样返回（兼容旧产物）', () => {
    expect(extractArrayField([{ x: 1 }], 'items')).toEqual([{ x: 1 }])
  })
  it('对象包装取 items 字段（json_object 模式产物）', () => {
    expect(extractArrayField({ items: [{ x: 1 }] }, 'items')).toEqual([{ x: 1 }])
  })
  it('两者皆非返回 null', () => {
    expect(extractArrayField({ foo: 1 }, 'items')).toBeNull()
    expect(extractArrayField(null, 'items')).toBeNull()
    expect(extractArrayField('文本', 'items')).toBeNull()
  })
})
