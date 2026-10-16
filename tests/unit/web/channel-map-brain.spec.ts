/**
 * Web 桥 brain 通道 wrap 形状断言（review H4 回归）
 *
 * 背景：readingRun/readingStatus 曾用对象参数签名偏离本表「位置参数 → wrap 组装
 * 对象」的约定，renderer 直传对象会被 wrap 的位置解构整体塞进 kbId 字段，
 * handler 收到 `{ kbId: {kbId:'…'} }` 后全部查询空转——Electron 端正常、Web 端
 * 静默失效。本用例锁死通道形状：renderer 位置传参，wrap 产出 handler 对象。
 */
import { describe, it, expect } from 'vitest'
import { CHANNEL_OVERRIDES } from '@web-client/channel-map'

describe('web 桥 wrap 形状（review H4 回归）', () => {
  it('readingRun / readingStatus 位置参数 → handler 对象形状', () => {
    const run = CHANNEL_OVERRIDES['knowledgeBase.brain.readingRun']!
    expect(run.channel).toBe('kb:brain:reading-run')
    expect(run.wrap!('kb-1', 'doc-1')).toEqual([{ kbId: 'kb-1', documentId: 'doc-1' }])
    expect(run.wrap!('kb-1')).toEqual([{ kbId: 'kb-1', documentId: undefined }])

    const st = CHANNEL_OVERRIDES['knowledgeBase.brain.readingStatus']!
    expect(st.channel).toBe('kb:brain:reading-status')
    expect(st.wrap!('kb-1')).toEqual([{ kbId: 'kb-1' }])
  })

  it('同库相邻通道形状抽查（bookPasses / autoLog 与 reading 同约定）', () => {
    expect(CHANNEL_OVERRIDES['knowledgeBase.brain.bookPassesRun']!.wrap!('kb-1')).toEqual([
      { kbId: 'kb-1' },
    ])
    expect(
      CHANNEL_OVERRIDES['knowledgeBase.brain.autoLogList']!.wrap!('kb-1', 20)
    ).toEqual([{ kbId: 'kb-1', limit: 20 }])
  })

  it('防再犯：brain 通道 wrap 一律位置参数解构，产出单对象参数', () => {
    // renderer 若误传对象 { kbId }，wrap 的 kbId 形参收到的就是对象——
    // 断言输出里 kbId 必为 string 形态，错位在此显式爆炸而非静默空转
    for (const [key, entry] of Object.entries(CHANNEL_OVERRIDES)) {
      if (!key.startsWith('knowledgeBase.brain.') || !entry.wrap) continue
      const args = entry.wrap('kb-shape-probe' as never, undefined as never)
      expect(args, key).toHaveLength(1)
      expect(typeof args[0], key).toBe('object')
      if ('kbId' in (args[0] as object)) {
        expect((args[0] as { kbId: unknown }).kbId, key).toBe('kb-shape-probe')
      }
    }
  })
})
