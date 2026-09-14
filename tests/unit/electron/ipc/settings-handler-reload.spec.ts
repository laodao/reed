/**
 * settings 写入后的重注入端到端测试（IPC 处理器 → 钩子）
 * @module tests/unit/electron/ipc/settings-handler-reload
 *
 * 背景（2026-09-13 参数设置第二轮）：用户要求"参数调好就能用"。
 * 本用例走真实注册路径（`registerSettingsHandlers` + `invokeIpc`）钉死：
 * 保存 `agent:budget` / `wf:defaults` 后，装配方注册的重注入钩子**确实被调用**；
 * 且钩子抛错不会让保存失败（配置写进去了才是关键）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

/** 假 settings 仓库（按 key 存） */
const store: Record<string, unknown> = {}

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    settings: {
      get: async (key: string) => (key in store ? store[key] : null),
      set: async (key: string, value: unknown) => {
        store[key] = value
      },
      getAll: async () => ({ ...store }),
    },
  }),
}))

import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerSettingsHandlers } from '@electron/ipc/handlers/settings.handler'
import { registerSettingsReloadHook, resetSettingsReloadHooks } from '@shared/utils/settings-reload'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'

interface Resp {
  success: boolean
  data?: unknown
}

const save = (key: string, value: unknown): Promise<Resp> =>
  invokeIpc('settings:set', [{ key, value }]) as Promise<Resp>

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  resetSettingsReloadHooks()
  registerSettingsHandlers()
})

describe('settings:set 触发参数重注入', () => {
  it('保存 agent:budget → 重注入钩子收到该键，并能读到刚写入的值', async () => {
    const seen: string[] = []
    let observed: unknown = null
    registerSettingsReloadHook('agent-budget-runtime', async (key) => {
      seen.push(key)
      observed = store[key]
    })

    const value = { maxSteps: { research: 20 } }
    const resp = await save(SETTINGS_KEYS.agentBudget, value)
    expect(resp.success).toBe(true)
    expect(seen).toEqual([SETTINGS_KEYS.agentBudget])
    expect(observed).toEqual(value) // 钩子读到的是**已落库**的新值（顺序不能反）
  })

  it('保存 wf:defaults → 工作流运行参数钩子被调用', async () => {
    const seen: string[] = []
    registerSettingsReloadHook('workflow-runtime-params', (key) => {
      seen.push(key)
    })
    await save(SETTINGS_KEYS.wfDefaults, { crawl: { delayMsMin: 100 } })
    expect(seen).toEqual([SETTINGS_KEYS.wfDefaults])
  })

  it('无关的键不会让钩子误改运行参数（钩子只能收到键，自己过滤）', async () => {
    const seen: string[] = []
    registerSettingsReloadHook('workflow-runtime-params', (key) => {
      if (key === SETTINGS_KEYS.wfDefaults) seen.push(key)
    })
    await save(SETTINGS_KEYS.uiFontSize, 'large')
    expect(seen).toEqual([])
  })

  it('钩子抛错不影响保存结果（配置已落库，重注入失败只记日志）', async () => {
    registerSettingsReloadHook('boom', () => {
      throw new Error('reload exploded')
    })
    const resp = await save(SETTINGS_KEYS.agentBudget, { guards: { maxToolResultBytes: 8192 } })
    expect(resp.success).toBe(true)
    expect(store[SETTINGS_KEYS.agentBudget]).toEqual({ guards: { maxToolResultBytes: 8192 } })
  })
})
