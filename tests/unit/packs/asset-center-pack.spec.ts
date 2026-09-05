/**
 * asset-center 内置包 IPC 前缀覆盖测试
 * @module tests/packs/asset-center-pack
 * @description 冒烟级断言：读 handler 源码提取全部 ipcBridge.handle 的 channel
 *              字面量，逐一断言被包 manifest 声明的 ipcChannelPrefixes 覆盖。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { assetCenterPack } from '@core/packs/asset-center'

function extractHandlerChannels(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'src/core/packs/asset-center/handlers/asset.handler.ts'),
    'utf-8',
  )
  return [...source.matchAll(/ipcBridge\.handle\(\s*'([^']+)'/g)].map((m) => m[1])
}

describe('asset-center 包 IPC 前缀覆盖', () => {
  it('handler 全部 channel 被 manifest 前缀覆盖', () => {
    const channels = extractHandlerChannels()
    // 防静默漂移：handler 目前注册 18 个 channel
    expect(channels.length, '未提取到 channel，请检查正则与 handler 写法').toBeGreaterThanOrEqual(18)

    const prefixes = assetCenterPack.manifest.contributions?.ipcChannelPrefixes ?? []
    expect(prefixes).toEqual(['asset:'])

    for (const channel of channels) {
      const covered = prefixes.some((p) => channel.startsWith(p))
      expect(covered, `channel "${channel}" 未被包声明的前缀 ${JSON.stringify(prefixes)} 覆盖`).toBe(true)
    }
  })

  it('manifest 与前端骨架一致（id/name/version）', () => {
    expect(assetCenterPack.manifest.id).toBe('asset-center')
    expect(assetCenterPack.manifest.name).toBe('资产管理')
    expect(assetCenterPack.manifest.version).toBe('1.0.0')
  })
})
