/**
 * toPlainData 单测
 *
 * 背景 bug：Electron IPC（V8 structured clone）无法克隆 Vue reactive 代理。
 * 运行「每日热点早报」这类含多选数组 / 对象输入的工作流时，startRun 直接抛
 * "An object could not be cloned"。toPlainData 在跨进程传输前把值转回普通
 * JSON 数据，保证 ipcRenderer.invoke 参数可被克隆。
 */
import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { toPlainData } from '../../../../src/renderer/src/utils/plain-data'

describe('toPlainData', () => {
  it('原样返回原始值（字符串/数字/布尔/null/undefined）', () => {
    expect(toPlainData('abc')).toBe('abc')
    expect(toPlainData(42)).toBe(42)
    expect(toPlainData(true)).toBe(true)
    expect(toPlainData(null)).toBe(null)
    expect(toPlainData(undefined)).toBe(undefined)
  })

  it('把 Vue reactive 数组转成普通数组（可被 structuredClone 克隆）', () => {
    const v = reactive({ arr: ['s1', 's2'] })
    // bug 前置条件：reactive 代理不可克隆
    expect(() => structuredClone(v.arr)).toThrow(/could not be cloned/)
    const plain = toPlainData(v.arr)
    expect(Array.isArray(plain)).toBe(true)
    expect(plain).toEqual(['s1', 's2'])
    expect(() => structuredClone(plain)).not.toThrow()
  })

  it('把 Vue reactive 对象（含嵌套）转成普通对象', () => {
    const v = reactive({ obj: { a: 1, b: { c: [1, 2] } } })
    expect(() => structuredClone(v.obj)).toThrow(/could not be cloned/)
    const plain = toPlainData(v.obj)
    expect(plain).toEqual({ a: 1, b: { c: [1, 2] } })
    expect(() => structuredClone(plain)).not.toThrow()
  })

  it('空对象 / 空数组保持结构', () => {
    expect(toPlainData({})).toEqual({})
    expect(toPlainData([])).toEqual([])
  })
})
