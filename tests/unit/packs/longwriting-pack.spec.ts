/**
 * longwriting 内置包 IPC 前缀覆盖测试
 * @module tests/packs/longwriting-pack
 * @description 冒烟级断言：longwriting.handler.ts 的 CHANNELS 表是注册唯一来源
 *              （全部 ipcBridge.handle 均引用 CHANNELS.*），本测试直接读 handler 源码，
 *              提取 CHANNELS 表中的 channel 字面量，逐一断言被包 manifest 声明的
 *              ipcChannelPrefixes 覆盖（守卫归属裁决无遗漏）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { longwritingPack } from '@core/packs/longwriting'

/** 从 handler 源码的 CHANNELS 常量表中提取全部 channel 字面量 */
function extractHandlerChannels(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'src/core/packs/longwriting/handlers/longwriting.handler.ts'),
    'utf-8',
  )
  // 截取 const CHANNELS = { ... } 区块（表结束于 registerLongWritingHandlers 之前）
  const start = source.indexOf('const CHANNELS = {')
  const end = source.indexOf('}', start)
  expect(start, '未找到 CHANNELS 常量表').toBeGreaterThan(-1)
  expect(end, 'CHANNELS 常量表未闭合').toBeGreaterThan(start)
  const table = source.slice(start, end)
  return [...table.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1])
}

describe('longwriting 包 IPC 前缀覆盖', () => {
  it('handler CHANNELS 表全部 channel 被 manifest 前缀覆盖', () => {
    const channels = extractHandlerChannels()
    // 防静默漂移：handler 目前声明 200+ channel，正则失效时不应拿到空表
    expect(channels.length, '未提取到 channel，请检查 CHANNELS 表解析').toBeGreaterThan(100)

    const prefixes = longwritingPack.manifest.contributions?.ipcChannelPrefixes ?? []
    expect(prefixes.length).toBeGreaterThan(0)

    for (const channel of channels) {
      const covered = prefixes.some((p) => channel.startsWith(p))
      expect(covered, `channel "${channel}" 未被包声明的前缀 ${JSON.stringify(prefixes)} 覆盖`).toBe(true)
    }
  })

  it('manifest 与前端骨架一致（id/name/version）', () => {
    expect(longwritingPack.manifest.id).toBe('longwriting')
    expect(longwritingPack.manifest.name).toBe('长文写作')
    expect(longwritingPack.manifest.version).toBe('1.0.0')
  })
})
