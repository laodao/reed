/**
 * 参数持有者工厂测试（数字 / 布尔两种）
 * @module tests/unit/shared/param-holder
 *
 * 「参数设置」的进程级持有者由这一个工厂产出（工作流/上下文/工具/知识库/长文写作都在用），
 * 所以它本身的纪律要钉死：
 * - 数字：非法值保留原值（不能把 -1 或 NaN 打进运行参数）、超上限夹取、每次 set 从默认重建（不会残留上次的组）；
 * - 布尔：**只接受真正的布尔**（`'false'` 之类的字符串不能变真——那会造出"看着关了其实没关"的开关）；
 * - 两者都提供 reset（测试隔离）。
 */

import { describe, it, expect } from 'vitest'
import {
  createFlagHolder,
  createParamHolder,
  pickBooleanFields,
  pickNumericFields,
} from '@shared/utils/param-holder'

const DEFAULTS = {
  a: { x: 10, y: 20 },
  b: { z: 5 },
}
const LIMITS = {
  a: { x: 100, y: 200 },
  b: { z: 50 },
}

describe('createParamHolder（数字）', () => {
  it('未注入时 = 默认；只覆盖传入的字段', () => {
    const holder = createParamHolder({ defaults: DEFAULTS, limits: LIMITS })
    expect(holder.get()).toEqual(DEFAULTS)
    holder.set({ a: { x: 30 } })
    expect(holder.get().a.x).toBe(30)
    expect(holder.get().a.y).toBe(20)
    expect(holder.get().b.z).toBe(5)
  })

  it('超上限夹取；非法值（负数/NaN/字符串）保留原值', () => {
    const holder = createParamHolder({ defaults: DEFAULTS, limits: LIMITS })
    holder.set({ a: { x: 30 } })
    holder.set({ a: { x: 9999 } })
    expect(holder.get().a.x).toBe(100)
    holder.set({ a: { x: -1, y: Number.NaN } })
    expect(holder.get().a.x).toBe(100) // 上次的有效值保留
    expect(holder.get().a.y).toBe(20)
    holder.set({ a: { y: 'abc' as never } })
    expect(holder.get().a.y).toBe(20)
  })

  it('set 是"只改我提的字段"（没提的组/字段沿用上一次生效值）', () => {
    const holder = createParamHolder({ defaults: DEFAULTS, limits: LIMITS })
    holder.set({ a: { x: 30 }, b: { z: 9 } })
    holder.set({ b: { z: 7 } })
    expect(holder.get().a.x).toBe(30) // 沿用上次注入的值（不是回到默认）
    expect(holder.get().b.z).toBe(7)
    holder.reset()
    expect(holder.get().a.x).toBe(10)
  })

  it('normalize 在夹取之后执行（分组一致性修正）', () => {
    const holder = createParamHolder({
      defaults: DEFAULTS,
      limits: LIMITS,
      normalize: (g) => {
        if (g.a.x > g.a.y) g.a.x = g.a.y
      },
    })
    holder.set({ a: { x: 90, y: 40 } })
    expect(holder.get().a.x).toBe(40)
  })

  it('reset 回到默认', () => {
    const holder = createParamHolder({ defaults: DEFAULTS, limits: LIMITS })
    holder.set({ a: { x: 30 } })
    holder.reset()
    expect(holder.get()).toEqual(DEFAULTS)
  })

  it('生效值是冻结的：调用点误改会直接抛错，不会污染全进程的共享单例', () => {
    const holder = createParamHolder({ defaults: DEFAULTS, limits: LIMITS })
    const snapshot = holder.get()
    expect(() => {
      snapshot.a.x = 777
    }).toThrow()
    expect(holder.get().a.x).toBe(10)
  })
})

describe('createFlagHolder（布尔）', () => {
  it('未注入时 = 默认；只接受真正的布尔', () => {
    const holder = createFlagHolder({ on: true, off: false })
    expect(holder.get()).toEqual({ on: true, off: false })

    holder.set({ on: false })
    expect(holder.get().on).toBe(false)

    // 字符串/数字都不算显式设置（否则 'false' 会被当成真，是个危险的静默 bug）
    holder.set({ off: 'false' as never })
    expect(holder.get().off).toBe(false)
    holder.set({ off: 0 as never })
    expect(holder.get().off).toBe(false)
    holder.set({ off: true })
    expect(holder.get().off).toBe(true)
  })

  it('reset 回到默认；生效值冻结（误改抛错）', () => {
    const holder = createFlagHolder({ on: true })
    holder.set({ on: false })
    const snapshot = holder.get()
    expect(() => {
      snapshot.on = true
    }).toThrow()
    expect(holder.get().on).toBe(false)
    holder.reset()
    expect(holder.get().on).toBe(true)
  })
})

describe('从登记表 tree 取值', () => {
  it('pickNumericFields：缺失/非数字回落默认', () => {
    expect(pickNumericFields({ x: 42, y: 'no' }, { x: 1, y: 2 })).toEqual({ x: 42, y: 2 })
    expect(pickNumericFields(null, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 })
    expect(pickNumericFields({ x: Number.NaN }, { x: 1 })).toEqual({ x: 1 })
  })

  it('pickBooleanFields：缺失/非布尔回落默认', () => {
    expect(pickBooleanFields({ a: false, b: 'yes' }, { a: true, b: true })).toEqual({ a: false, b: true })
    expect(pickBooleanFields(undefined, { a: true })).toEqual({ a: true })
  })
})
