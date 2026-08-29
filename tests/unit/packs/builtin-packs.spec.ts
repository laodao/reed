/**
 * 内置业务包清单测试
 * @module tests/packs/builtin-packs
 * @description builtinPacks（core/packs/builtin-packs）的登记纪律：
 *              全部 manifest 过 validatePackManifest（纪律 3）、id 全局唯一、
 *              dependencies 指向清单内已注册包（悬空依赖 fail-fast 于装配期之前）。
 *              不调用 activate（handler 注册属宿主启动序列，单测只验声明式内容）。
 */
import { describe, it, expect } from 'vitest'
import { validatePackManifest } from '@shared/types/pack.types'
import { builtinPacks } from '@core/packs/builtin-packs'

describe('builtinPacks 内置包清单', () => {
  it('非空且每个包都带 manifest', () => {
    expect(builtinPacks.length).toBeGreaterThan(0)
    for (const def of builtinPacks) {
      expect(def.manifest, '每个内置包必须带 manifest').toBeTruthy()
    }
  })

  it('全部 manifest 通过 validatePackManifest 校验', () => {
    for (const def of builtinPacks) {
      expect(() => validatePackManifest(def.manifest), `包 "${def.manifest?.id}"`).not.toThrow()
    }
  })

  it('id 全局唯一', () => {
    const ids = builtinPacks.map((d) => d.manifest.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('dependencies 指向清单内已注册包', () => {
    const ids = new Set(builtinPacks.map((d) => d.manifest.id))
    for (const def of builtinPacks) {
      for (const dep of def.manifest.dependencies ?? []) {
        expect(ids.has(dep), `包 "${def.manifest.id}" 的依赖 "${dep}" 未在内置包清单中`).toBe(true)
      }
    }
  })

  it('每个包声明了 IPC channel 前缀（供守卫归属裁决）', () => {
    for (const def of builtinPacks) {
      const prefixes = def.manifest.contributions?.ipcChannelPrefixes ?? []
      expect(prefixes.length, `包 "${def.manifest.id}" 未声明 ipcChannelPrefixes`).toBeGreaterThan(0)
    }
  })
})
