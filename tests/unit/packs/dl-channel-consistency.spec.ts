/**
 * dl IPC 通道键集合一致性护栏（M4-A P1-4）
 * @module tests/unit/packs/dl-channel-consistency.spec
 *
 * 背景:domainLearning(前端命名空间)↔ dl:(后端前缀)系统性错位,新增/改名漏一处即
 * 桌面正常而 Web 静默失效(channel-map 需显式覆盖)。护栏直接读源码断言三端集合相等。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

function extractChannels(pattern: RegExp, relFile: string): string[] {
  const src = fs.readFileSync(path.join(ROOT, relFile), 'utf8')
  const set = new Set<string>()
  for (const m of src.matchAll(pattern)) set.add(m[1])
  return [...set].sort()
}

describe('dl: IPC 通道键集合一致性', () => {
  it('后端 handler / preload invoke / web channel-map 三端 dl: 键集合相等', () => {
    const handler = extractChannels(/ipcBridge\.handle\('(dl:[a-z0-9-]+)'/g, 'src/core/packs/domain-learning/handlers/domain-learning.handler.ts')
    const preload = extractChannels(/invoke\('(dl:[a-z0-9-]+)'/g, 'src/preload/index.ts')
    const channelMap = extractChannels(/channel: '(dl:[a-z0-9-]+)'/g, 'src/web/client/channel-map.ts')

    expect(handler.length).toBeGreaterThan(20) // 防呆:别把正则抽空当成通过
    expect(preload.length).toBeGreaterThan(20)
    expect(channelMap.length).toBeGreaterThan(20)
    expect(preload).toEqual(handler)
    expect(channelMap).toEqual(handler)
  })

  it('domainLearning.* 调用键与 dl: 通道键一一对应（channel-map 覆盖键名 = 通道去前缀）', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/web/client/channel-map.ts'), 'utf8')
    const keys = [...new Set(src.matchAll(/'domainLearning\.([a-zA-Z0-9]+)'/g))].map((m) => m[1]).sort()
    // 事件订阅键(onAgentEvent/onStream)走 eventChannel,不在此比对
    const callKeys = keys.filter((k) => !['onAgentEvent', 'onStream'].includes(k))
    expect(callKeys.length).toBeGreaterThan(20)
    const dlChannels = extractChannels(/channel: '(dl:[a-z0-9-]+)'/g, 'src/web/client/channel-map.ts')
    expect(callKeys.map((k) => `dl:${k.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)}`).sort()).toEqual(
      dlChannels.map((c) => c),
    )
  })
})
