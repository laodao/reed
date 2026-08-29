/**
 * episode-production 内置包 IPC 前缀覆盖测试
 * @module tests/packs/episode-production-pack
 * @description 冒烟级断言：episode-production handler 目录（electron/ipc/handlers/
 *              episode-production/**，25 个 handler 文件）的全部 channel 均为
 *              ipcBridge.handle 字面量直写，本测试直接读 handler 源码提取 channel 表，
 *              逐一断言被包 manifest 声明的 ipcChannelPrefixes 覆盖（守卫归属裁决无遗漏）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import { episodeProductionPack } from '@core/packs/episode-production'

/** 递归收集 handler 目录下全部 .handler.ts 文件 */
function collectHandlerFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectHandlerFiles(full))
    } else if (entry.endsWith('.handler.ts')) {
      files.push(full)
    }
  }
  return files
}

/** 从全部 handler 源码中提取 ipcBridge.handle 的 channel 字面量 */
function extractHandlerChannels(): string[] {
  const dir = resolve(process.cwd(), 'src/electron/ipc/handlers/episode-production')
  const channels: string[] = []
  for (const file of collectHandlerFiles(dir)) {
    const source = readFileSync(file, 'utf-8')
    // 兼容 panorama.handler 的多行调用形态：ipcBridge.handle(\n  'ep:...'
    for (const m of source.matchAll(/ipcBridge\.handle\(\s*'([^']+)'/g)) {
      channels.push(m[1])
    }
  }
  return [...new Set(channels)]
}

describe('episode-production 包 IPC 前缀覆盖', () => {
  it('handler 目录全部 channel 被 manifest 前缀覆盖', () => {
    const channels = extractHandlerChannels()
    // 防静默漂移：handler 目前注册 175 个 channel，正则失效时不应拿到空表
    expect(channels.length, '未提取到 channel，请检查 handler 源码解析').toBeGreaterThan(150)

    const prefixes = episodeProductionPack.manifest.contributions?.ipcChannelPrefixes ?? []
    expect(prefixes.length).toBeGreaterThan(0)

    for (const channel of channels) {
      const covered = prefixes.some((p) => channel.startsWith(p))
      expect(covered, `channel "${channel}" 未被包声明的前缀 ${JSON.stringify(prefixes)} 覆盖`).toBe(true)
    }
  })

  it('manifest 与前端骨架一致（id/name/version/description/dependencies）', () => {
    const m = episodeProductionPack.manifest
    expect(m.id).toBe('episode-production')
    expect(m.name).toBe('剧集制作')
    expect(m.version).toBe('1.0.0')
    expect(m.description).toBe('剧本生成与视频制作')
    // 前端引用 voice-design 包的 VoiceCloneDialog，dependencies 必须含 voice-design
    expect(m.dependencies).toEqual(['voice-design'])
  })
})
