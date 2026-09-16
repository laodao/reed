/**
 * settings 保存后重注入钩子测试（平台级；2026-09-13 参数设置第二轮）
 * @module tests/unit/shared/settings-reload
 *
 * 为什么要这条用例：进程级参数（限额持有者/工具注册表护栏/工作流运行参数）原本"启动装配一次、
 * 改完必须重启"。改造后由 settings 写入触发**重新注入**，于是"保存即生效"。
 * 这里钉死三条纪律：钩子能收到键、单个钩子抛错不影响其它钩子、钩子异常绝不让保存失败。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listSettingsReloadHooks,
  registerSettingsReloadHook,
  resetSettingsReloadHooks,
  runSettingsReloadHooks,
  setSettingsReloadLogger,
  unregisterSettingsReloadHook,
} from '@shared/utils/settings-reload'

beforeEach(() => {
  resetSettingsReloadHooks()
  setSettingsReloadLogger({ warn: () => {} })
})

describe('settings 重注入钩子', () => {
  it('运行钩子时把刚写入的键传下去（钩子自己判断是否关心）', async () => {
    const seen: string[] = []
    registerSettingsReloadHook('a', (key) => {
      seen.push(key)
    })
    registerSettingsReloadHook('b', (key) => {
      seen.push(`b:${key}`)
    })
    await runSettingsReloadHooks('agent:budget')
    expect(seen).toEqual(['agent:budget', 'b:agent:budget'])
  })

  it('同名注册覆盖而不是叠加（重复装配不会重复执行）', async () => {
    let calls = 0
    registerSettingsReloadHook('dup', () => {
      calls += 1
    })
    registerSettingsReloadHook('dup', () => {
      calls += 10
    })
    expect(listSettingsReloadHooks()).toEqual(['dup'])
    await runSettingsReloadHooks('x')
    expect(calls).toBe(10)
  })

  it('异步钩子会被等待（重注入完成后处理器才返回）', async () => {
    const order: string[] = []
    registerSettingsReloadHook('slow', async () => {
      await new Promise((r) => setTimeout(r, 5))
      order.push('hook')
    })
    await runSettingsReloadHooks('x').then(() => order.push('after'))
    expect(order).toEqual(['hook', 'after'])
  })

  it('单个钩子抛错：只记日志，继续跑后面的，且不把异常抛给调用方（保存已成功）', async () => {
    const warn = vi.fn()
    setSettingsReloadLogger({ warn })
    let secondRan = false
    registerSettingsReloadHook('boom', () => {
      throw new Error('reload failed')
    })
    registerSettingsReloadHook('ok', () => {
      secondRan = true
    })
    await expect(runSettingsReloadHooks('agent:budget')).resolves.toBeUndefined()
    expect(secondRan).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('boom')
  })

  it('注销与清空（测试隔离用）', async () => {
    let calls = 0
    registerSettingsReloadHook('a', () => {
      calls += 1
    })
    registerSettingsReloadHook('b', () => {
      calls += 1
    })
    unregisterSettingsReloadHook('a')
    expect(listSettingsReloadHooks()).toEqual(['b'])
    await runSettingsReloadHooks('x')
    expect(calls).toBe(1)

    resetSettingsReloadHooks()
    expect(listSettingsReloadHooks()).toEqual([])
    await runSettingsReloadHooks('x')
    expect(calls).toBe(1)
  })
})
