/**
 * 知识飞轮停用开关单测：缺省停用、AGENT_MEMORY_FLYWHEEL=on 显式重开、
 * 其余值一律视为停用（白名单式开关，宁可停不可误开）。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { isMemoryFlywheelEnabled } from '@core/platform/workflow/workflow-boot'

const KEY = 'AGENT_MEMORY_FLYWHEEL'
let saved: string | undefined

afterEach(() => {
  if (saved === undefined) delete process.env[KEY]
  else process.env[KEY] = saved
})

describe('isMemoryFlywheelEnabled', () => {
  it('缺省（未设置）停用；=on 重开；其余值停用', () => {
    saved = process.env[KEY]
    delete process.env[KEY]
    expect(isMemoryFlywheelEnabled()).toBe(false)
    process.env[KEY] = 'on'
    expect(isMemoryFlywheelEnabled()).toBe(true)
    process.env[KEY] = 'off'
    expect(isMemoryFlywheelEnabled()).toBe(false)
    process.env[KEY] = '1'
    expect(isMemoryFlywheelEnabled()).toBe(false)
  })
})
