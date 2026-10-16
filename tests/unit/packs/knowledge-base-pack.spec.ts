/**
 * knowledge-base 内置包 IPC 前缀覆盖测试
 * @module tests/packs/knowledge-base-pack
 * @description 冒烟级断言：读 handler 源码提取全部 ipcBridge.handle 的 channel
 *              字面量，逐一断言被包 manifest 声明的 ipcChannelPrefixes 覆盖。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { knowledgeBasePack } from '@core/packs/knowledge-base'

function extractHandlerChannels(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'src/core/packs/knowledge-base/handlers/knowledge-base.handler.ts'),
    'utf-8',
  )
  return [...source.matchAll(/ipcBridge\.handle\(\s*'([^']+)'/g)].map((m) => m[1])
}

describe('knowledge-base 包 IPC 前缀覆盖', () => {
  it('handler 全部 channel 被 manifest 前缀覆盖', () => {
    const channels = extractHandlerChannels()
    // 防静默漂移：handler 目前注册 30 个 channel（19 knowledge-base:* + 4 kb:* + 7 kb-qa:*）
    expect(channels.length, '未提取到 channel，请检查正则与 handler 写法').toBeGreaterThanOrEqual(30)

    const prefixes = knowledgeBasePack.manifest.contributions?.ipcChannelPrefixes ?? []
    expect(prefixes).toEqual(['knowledge-base:', 'kb:', 'kb-qa:'])

    for (const channel of channels) {
      const covered = prefixes.some((p) => channel.startsWith(p))
      expect(covered, `channel "${channel}" 未被包声明的前缀 ${JSON.stringify(prefixes)} 覆盖`).toBe(true)
    }
  })

  it('manifest 与前端骨架一致（id/name/version）', () => {
    expect(knowledgeBasePack.manifest.id).toBe('knowledge-base')
    expect(knowledgeBasePack.manifest.name).toBe('知识库')
    expect(knowledgeBasePack.manifest.version).toBe('1.0.0')
  })
})
