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
import { loadBuiltinPacks } from '@core/packs/builtin-packs'

// 全量登记断言只对「全模块启用」的形态有效（dev）；裁剪形态（如 the-chat-bot）
// 按功能开关只注册白名单包，本文件整体跳过。
const allEnabled = Object.values(
  (await import('@shared/constants/features')).FEATURE_MODULES
).every((v) => v !== false)

describe.skipIf(!allEnabled)('builtinPacks 内置包清单', () => {
  it('非空且每个包都带 manifest', async () => {
    const builtinPacks = await loadBuiltinPacks()
    expect(builtinPacks.length).toBeGreaterThan(0)
    for (const def of builtinPacks) {
      expect(def.manifest, '每个内置包必须带 manifest').toBeTruthy()
    }
  })

  it('全部 manifest 通过 validatePackManifest 校验', async () => {
    for (const def of await loadBuiltinPacks()) {
      expect(() => validatePackManifest(def.manifest), `包 "${def.manifest?.id}"`).not.toThrow()
    }
  })

  it('id 全局唯一', async () => {
    const ids = (await loadBuiltinPacks()).map((d) => d.manifest.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('dependencies 指向清单内已注册包', async () => {
    const builtinPacks = await loadBuiltinPacks()
    const ids = new Set(builtinPacks.map((d) => d.manifest.id))
    for (const def of builtinPacks) {
      for (const dep of def.manifest.dependencies ?? []) {
        expect(ids.has(dep), `包 "${def.manifest.id}" 的依赖 "${dep}" 未在内置包清单中`).toBe(true)
      }
    }
  })

  it('声明了 IPC channel 前缀的包，前缀非空（供守卫归属裁决；纯界面包可无 IPC）', async () => {
    for (const def of await loadBuiltinPacks()) {
      const prefixes = def.manifest.contributions?.ipcChannelPrefixes ?? []
      // voice-design 的 voice:* 已迁壳层（平台能力），纯界面包允许无前缀
      for (const prefix of prefixes) {
        expect(prefix.length, `包 "${def.manifest.id}" 的前缀为空`).toBeGreaterThan(0)
      }
    }
  })
})
