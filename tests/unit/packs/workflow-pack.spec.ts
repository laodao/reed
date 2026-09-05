/**
 * workflow 内置包 IPC 前缀覆盖测试
 * @module tests/packs/workflow-pack
 * @description 冒烟级断言：读 handler 源码提取全部 ipcBridge.handle 的 channel
 *              字面量（含多行形态），逐一断言被包 manifest 声明的
 *              ipcChannelPrefixes 覆盖（守卫归属裁决无遗漏）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { workflowPack } from '@core/packs/workflow'

/** 从 handler 源码提取全部 channel 字面量（兼容单行/多行 ipcBridge.handle 调用） */
function extractHandlerChannels(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'src/core/packs/workflow/handlers/workflow.handler.ts'),
    'utf-8',
  )
  return [...source.matchAll(/ipcBridge\.handle\(\s*'([^']+)'/g)].map((m) => m[1])
}

describe('workflow 包 IPC 前缀覆盖', () => {
  it('handler 全部 channel 被 manifest 前缀覆盖', () => {
    const channels = extractHandlerChannels()
    // 防静默漂移：handler 目前注册 27 个 channel，正则失效时不应拿到空表
    expect(channels.length, '未提取到 channel，请检查正则与 handler 写法').toBeGreaterThanOrEqual(27)

    const prefixes = workflowPack.manifest.contributions?.ipcChannelPrefixes ?? []
    expect(prefixes).toEqual(['wf:'])

    for (const channel of channels) {
      const covered = prefixes.some((p) => channel.startsWith(p))
      expect(covered, `channel "${channel}" 未被包声明的前缀 ${JSON.stringify(prefixes)} 覆盖`).toBe(true)
    }
  })

  it('manifest 与前端骨架一致（id/name/version）', () => {
    expect(workflowPack.manifest.id).toBe('workflow')
    expect(workflowPack.manifest.name).toBe('工作流')
    expect(workflowPack.manifest.version).toBe('1.0.0')
  })
})
