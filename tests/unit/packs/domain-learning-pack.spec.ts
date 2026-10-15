/**
 * domain-learning 内置包 IPC 前缀覆盖测试
 * @module tests/packs/domain-learning-pack
 * @description 冒烟级断言：读 handler 源码提取全部 ipcBridge.handle 的 channel
 *              字面量，逐一断言被包 manifest 声明的 ipcChannelPrefixes（dl:）覆盖；
 *              manifest id/name/version 与前端骨架一致。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { domainLearningPack } from '@core/packs/domain-learning'

function extractHandlerChannels(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'src/core/packs/domain-learning/handlers/domain-learning.handler.ts'),
    'utf-8',
  )
  return [...source.matchAll(/ipcBridge\.handle\(\s*'([^']+)'/g)].map((m) => m[1])
}

describe('domain-learning 包 IPC 前缀覆盖', () => {
  it('handler 全部 channel 被 manifest 前缀覆盖', () => {
    const channels = extractHandlerChannels()
    expect(channels.length, '未提取到 channel，请检查正则与 handler 写法').toBeGreaterThanOrEqual(14)

    const prefixes = domainLearningPack.manifest.contributions?.ipcChannelPrefixes ?? []
    expect(prefixes).toEqual(['dl:'])

    for (const channel of channels) {
      const covered = prefixes.some((p) => channel.startsWith(p))
      expect(covered, `channel "${channel}" 未被声明的前缀 ${JSON.stringify(prefixes)} 覆盖`).toBe(true)
    }
  })

  it('manifest 与前端骨架一致（id/name/version）+ 依赖声明', () => {
    expect(domainLearningPack.manifest.id).toBe('domain-learning')
    expect(domainLearningPack.manifest.name).toBe('领域学习')
    expect(domainLearningPack.manifest.dependencies).toEqual(['workflow', 'knowledge-base', 'skills'])
  })
})
