/**
 * 业务包注册表（纯内存）测试
 * @module tests/packs/pack-registry
 * @description 注册/校验 fail-fast、依赖 pending、级联激活与回退、循环依赖、
 *              禁用执行 disposer 逆序（effect 可逆纪律）、IPC channel 前缀归属。
 *              不依赖 DB，直接 new PackRegistry()。
 */
import { describe, it, expect, vi } from 'vitest'
import { PackManifestError } from '@shared/types/pack.types'
import { PackRegistry, type PackDefinition } from '@core/packs/registry'

/** 构造合法包定义（测试夹具） */
function makePack(
  id: string,
  overrides?: {
    dependencies?: string[]
    defaultEnabled?: boolean
    ipcChannelPrefixes?: string[]
    activate?: PackDefinition['activate']
  },
): PackDefinition {
  return {
    manifest: {
      id,
      name: `测试包 ${id}`,
      version: '1.0.0',
      ...(overrides?.dependencies ? { dependencies: overrides.dependencies } : {}),
      ...(overrides?.defaultEnabled !== undefined ? { defaultEnabled: overrides.defaultEnabled } : {}),
      ...(overrides?.ipcChannelPrefixes
        ? { contributions: { ipcChannelPrefixes: overrides.ipcChannelPrefixes } }
        : {}),
    },
    activate: overrides?.activate,
  }
}

describe('PackRegistry 注册与校验（fail-fast）', () => {
  it('注册无依赖包 → 默认启用并调用 activate', async () => {
    const registry = new PackRegistry()
    const activate = vi.fn()
    await registry.registerPack(makePack('alpha', { activate }))
    expect(registry.getPackState('alpha')).toBe('enabled')
    expect(activate).toHaveBeenCalledTimes(1)
    expect(activate.mock.calls[0][0].packId).toBe('alpha')
  })

  it('manifest 非法 → 抛 PackManifestError 且不入表', async () => {
    const registry = new PackRegistry()
    const bad = { manifest: { id: 'Bad_ID', name: 'x', version: '1.0.0' } }
    await expect(registry.registerPack(bad)).rejects.toThrow(PackManifestError)
    expect(() => registry.getPackState('Bad_ID')).toThrow(PackManifestError)
  })

  it('重复注册 → 抛 PackManifestError', async () => {
    const registry = new PackRegistry()
    await registry.registerPack(makePack('alpha'))
    await expect(registry.registerPack(makePack('alpha'))).rejects.toThrow(PackManifestError)
  })

  it('defaultEnabled=false → 注册后为 disabled 且不激活', async () => {
    const registry = new PackRegistry()
    const activate = vi.fn()
    await registry.registerPack(makePack('alpha', { defaultEnabled: false, activate }))
    expect(registry.getPackState('alpha')).toBe('disabled')
    expect(activate).not.toHaveBeenCalled()
  })
})

describe('PackRegistry 依赖解析与级联', () => {
  it('依赖未注册 → pending 且带 missingDependencies', async () => {
    const registry = new PackRegistry()
    await registry.registerPack(makePack('beta', { dependencies: ['alpha'] }))
    expect(registry.getPackState('beta')).toBe('pending')
    const info = registry.listPacks().find((p) => p.id === 'beta')!
    expect(info.missingDependencies).toEqual(['alpha'])
    expect(info.enabled).toBe(false)
  })

  it('依赖后注册 → 依赖方自动激活（级联）', async () => {
    const registry = new PackRegistry()
    const betaActivate = vi.fn()
    await registry.registerPack(makePack('beta', { dependencies: ['alpha'], activate: betaActivate }))
    expect(registry.getPackState('beta')).toBe('pending')
    await registry.registerPack(makePack('alpha'))
    expect(registry.getPackState('alpha')).toBe('enabled')
    expect(registry.getPackState('beta')).toBe('enabled')
    expect(betaActivate).toHaveBeenCalledTimes(1)
  })

  it('禁用依赖 → 依赖方自动回 pending；重新启用 → 自动恢复启用（无 disposer 不重跑 activate）', async () => {
    const registry = new PackRegistry()
    await registry.registerPack(makePack('alpha'))
    const betaActivate = vi.fn()
    await registry.registerPack(makePack('beta', { dependencies: ['alpha'], activate: betaActivate }))
    expect(registry.getPackState('beta')).toBe('enabled')

    await registry.setEnabled('alpha', false)
    expect(registry.getPackState('alpha')).toBe('disabled')
    expect(registry.getPackState('beta')).toBe('pending')
    expect(registry.listPacks().find((p) => p.id === 'beta')!.missingDependencies).toEqual(['alpha'])

    await registry.setEnabled('alpha', true)
    expect(registry.getPackState('alpha')).toBe('enabled')
    expect(registry.getPackState('beta')).toBe('enabled')
    // betaActivate 未返回 disposer → 贡献从未卸载，恢复时只翻状态不重跑（防重复注册）
    expect(betaActivate).toHaveBeenCalledTimes(1)
  })

  it('依赖方自身被禁用时不随依赖上线激活', async () => {
    const registry = new PackRegistry()
    await registry.registerPack(makePack('alpha'))
    await registry.registerPack(makePack('beta', { dependencies: ['alpha'] }))
    await registry.setEnabled('beta', false)
    expect(registry.getPackState('beta')).toBe('disabled')
    // 依赖上下线不影响 disabled 的期望态
    await registry.setEnabled('alpha', false)
    await registry.setEnabled('alpha', true)
    expect(registry.getPackState('beta')).toBe('disabled')
  })

  it('循环依赖 → 抛 PackManifestError 且成环注册被回滚', async () => {
    const registry = new PackRegistry()
    await registry.registerPack(makePack('alpha', { dependencies: ['beta'] })) // beta 未注册：pending，不成环
    expect(registry.getPackState('alpha')).toBe('pending')
    await expect(
      registry.registerPack(makePack('beta', { dependencies: ['alpha'] })),
    ).rejects.toThrow(PackManifestError)
    // 回滚：beta 不入表
    expect(() => registry.getPackState('beta')).toThrow(PackManifestError)
    expect(registry.getPackState('alpha')).toBe('pending')
  })

  it('activate 抛异常 → 包标 failed，依赖方保持 pending', async () => {
    const registry = new PackRegistry()
    await registry.registerPack(
      makePack('alpha', {
        activate: () => {
          throw new Error('boom')
        },
      }),
    )
    expect(registry.getPackState('alpha')).toBe('failed')
    await registry.registerPack(makePack('beta', { dependencies: ['alpha'] }))
    expect(registry.getPackState('beta')).toBe('pending')
  })
})

describe('PackRegistry 禁用的逆操作纪律（disposer LIFO）', () => {
  it('activate 无 disposer 的包：禁用→启用只翻状态，不重跑 activate（防重复注册）', async () => {
    const calls: string[] = []
    const registry = new PackRegistry()
    await registry.registerPack(
      makePack('alpha', {
        activate: () => {
          calls.push('activate')
          // 不返回 disposer——贡献不可卸载（如 IPC channel 注册）
        },
      }),
    )
    expect(calls).toEqual(['activate'])

    await registry.setEnabled('alpha', false)
    expect(registry.getPackState('alpha')).toBe('disabled')

    await registry.setEnabled('alpha', true)
    expect(registry.getPackState('alpha')).toBe('enabled')
    expect(calls).toEqual(['activate']) // 关键断言：activate 未被重跑
  })

  it('禁用 → disposer 栈反序执行；再启用 → 重新激活收集新栈', async () => {
    const calls: string[] = []
    const registry = new PackRegistry()
    await registry.registerPack(
      makePack('alpha', {
        activate: () => {
          calls.push('activate')
          return [
            () => { calls.push('dispose-1') },
            () => { calls.push('dispose-2') },
          ]
        },
      }),
    )
    expect(calls).toEqual(['activate'])

    await registry.setEnabled('alpha', false)
    expect(registry.getPackState('alpha')).toBe('disabled')
    expect(calls).toEqual(['activate', 'dispose-2', 'dispose-1']) // LIFO

    await registry.setEnabled('alpha', true)
    expect(registry.getPackState('alpha')).toBe('enabled')
    expect(calls).toEqual(['activate', 'dispose-2', 'dispose-1', 'activate'])
  })

  it('单个 disposer 异常不阻断其余逆操作', async () => {
    const calls: string[] = []
    const registry = new PackRegistry()
    await registry.registerPack(
      makePack('alpha', {
        activate: () => [
          () => { calls.push('dispose-1') },
          () => { throw new Error('dispose boom') },
          () => { calls.push('dispose-3') },
        ],
      }),
    )
    await registry.setEnabled('alpha', false)
    expect(registry.getPackState('alpha')).toBe('disabled')
    expect(calls).toEqual(['dispose-3', 'dispose-1']) // LIFO，中间异常被跳过
  })

  it('对未注册包 setEnabled → 抛 PackManifestError', async () => {
    const registry = new PackRegistry()
    await expect(registry.setEnabled('ghost', false)).rejects.toThrow(PackManifestError)
  })
})

describe('PackRegistry IPC channel 前缀归属', () => {
  it('按前缀裁决归属；未声明前缀的 channel → null（守卫放行）', async () => {
    const registry = new PackRegistry()
    await registry.registerPack(makePack('alpha', { ipcChannelPrefixes: ['alpha:'] }))
    await registry.registerPack(makePack('beta', { ipcChannelPrefixes: ['alpha:sub:'] }))
    expect(registry.getChannelOwner('alpha:list')).toBe('alpha')
    // 最长前缀优先
    expect(registry.getChannelOwner('alpha:sub:run')).toBe('beta')
    expect(registry.getChannelOwner('settings:get')).toBeNull()
  })
})
