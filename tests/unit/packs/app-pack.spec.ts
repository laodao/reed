/**
 * app 内置包 IPC 前缀覆盖测试
 * @module tests/packs/app-pack
 * @description 冒烟级断言：读 handler 源码提取全部 ipcBridge.handle 的 channel
 *              字面量，逐一断言被包 manifest 声明的 ipcChannelPrefixes 覆盖；
 *              并锁定 app → workflow 的依赖声明（应用 = 工作流发布产物）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { appPack } from '@core/packs/app'

function extractHandlerChannels(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'src/core/packs/app/handlers/app.handler.ts'),
    'utf-8',
  )
  return [...source.matchAll(/ipcBridge\.handle\(\s*'([^']+)'/g)].map((m) => m[1])
}

describe('app 包 IPC 前缀覆盖', () => {
  it('handler 全部 channel 被 manifest 前缀覆盖', () => {
    const channels = extractHandlerChannels()
    // 防静默漂移：handler 目前注册 20 个 channel（12 个 app:* + 8 个 app-session:*）
    expect(channels.length, '未提取到 channel，请检查正则与 handler 写法').toBeGreaterThanOrEqual(20)

    const prefixes = appPack.manifest.contributions?.ipcChannelPrefixes ?? []
    expect(prefixes).toEqual(['app:', 'app-session:'])

    for (const channel of channels) {
      const covered = prefixes.some((p) => channel.startsWith(p))
      expect(covered, `channel "${channel}" 未被包声明的前缀 ${JSON.stringify(prefixes)} 覆盖`).toBe(true)
    }
  })

  it('manifest 与前端骨架一致（id/name/version）且声明 workflow 依赖', () => {
    expect(appPack.manifest.id).toBe('app')
    expect(appPack.manifest.name).toBe('应用')
    expect(appPack.manifest.version).toBe('1.0.0')
    expect(appPack.manifest.dependencies).toEqual(['workflow'])
  })
})
