/**
 * Web 端 bridge 单元测试
 *
 * 重点回归：preload 中带前置参数的 onXxx（如 onGenerateEvent(eventId, cb)）
 * 在 web bridge 中需通过 channel-map 的 eventChannel 计算动态 channel，
 * 否则会订阅错误的静态 channel 导致前端永远等不到 done 事件（观测到的 bug：
 * 长文写作生成概要 AI 已返回但前端一直显示"生成中"）。
 */

import { describe, it, expect } from 'vitest'
import { CHANNEL_OVERRIDES } from '@web-client/channel-map'

describe('web bridge channel-map', () => {
  it('longwriting.onGenerateEvent 必须用 eventChannel 计算动态 channel', () => {
    const entry = CHANNEL_OVERRIDES['longwriting.onGenerateEvent']
    expect(entry, '缺少 longwriting.onGenerateEvent 配置').toBeDefined()
    expect(typeof entry.eventChannel).toBe('function')
    const ch = entry.eventChannel!('e-123')
    // 与 src/core/platform/services/longwriting-ai.service.ts 中的 emit channel 对齐
    expect(ch).toBe('longwriting:generate:e-123')
  })

  it('longwriting.onNewEntitiesDetected 同样基于 eventId 动态拼接', () => {
    const entry = CHANNEL_OVERRIDES['longwriting.onNewEntitiesDetected']
    expect(entry?.eventChannel).toBeTypeOf('function')
    expect(entry!.eventChannel!('xx')).toBe('longwriting:new-entities-detected:xx')
  })

  it('chat.onStream / image.onGenerationEvent / portrait.onGenerationEvent 静态 channel 与后端 emit 对齐', () => {
    expect(CHANNEL_OVERRIDES['chat.onStream']?.channel).toBe('chat:stream')
    expect(CHANNEL_OVERRIDES['image.onGenerationEvent']?.channel).toBe(
      'image:generation-event',
    )
    expect(CHANNEL_OVERRIDES['portrait.onGenerationEvent']?.channel).toBe(
      'portrait:generation-event',
    )
  })

  it('translation.onProgress / onCompleted / onFailed 与后端 emit 对齐', () => {
    expect(CHANNEL_OVERRIDES['translation.onProgress']?.channel).toBe(
      'translation:progress',
    )
    expect(CHANNEL_OVERRIDES['translation.onCompleted']?.channel).toBe(
      'translation:completed',
    )
    expect(CHANNEL_OVERRIDES['translation.onFailed']?.channel).toBe(
      'translation:failed',
    )
  })

  it('voice.onTTSCompleted / onSTTCompleted 与后端 emit 对齐', () => {
    expect(CHANNEL_OVERRIDES['voice.onTTSCompleted']?.channel).toBe(
      'voice:tts-completed',
    )
    expect(CHANNEL_OVERRIDES['voice.onSTTCompleted']?.channel).toBe(
      'voice:stt-completed',
    )
  })

  it('assets.* 覆盖映射到单数 asset:* 后端通道（复数命名空间→单数 channel）', () => {
    // preload 命名空间是 assets（复数），后端 handler 注册的是 asset:*（单数）；
    // 必须显式覆盖，否则 Web fallback 生成 'assets:list' 与 'asset:list' 不匹配。
    expect(CHANNEL_OVERRIDES['assets.list']?.channel).toBe('asset:list')
    expect(CHANNEL_OVERRIDES['assets.stats']?.channel).toBe('asset:stats')
    expect(CHANNEL_OVERRIDES['assets.openFolder']?.channel).toBe('asset:open-folder')
    expect(CHANNEL_OVERRIDES['assets.listCategories']?.channel).toBe('asset:categories-list')
    expect(CHANNEL_OVERRIDES['assets.deleteCategory']?.channel).toBe('asset:category-delete')
    expect(CHANNEL_OVERRIDES['assets.download']?.channel).toBe('asset:download')
  })

  it('assets.* 单参数方法 wrap 成后端期望的对象形态', () => {
    expect(CHANNEL_OVERRIDES['assets.get']?.wrap?.('id-1')).toEqual([{ id: 'id-1' }])
    expect(CHANNEL_OVERRIDES['assets.delete']?.wrap?.('id-2')).toEqual([{ id: 'id-2' }])
    expect(CHANNEL_OVERRIDES['assets.previewRender']?.wrap?.('a-9')).toEqual([{ assetId: 'a-9' }])
    expect(CHANNEL_OVERRIDES['assets.groupDetail']?.wrap?.('g-1')).toEqual([{ groupId: 'g-1' }])
    // listCategories 接受可选对象；空调用需兜底为 {}（后端 `p.category || undefined` 不能收到 undefined）
    expect(CHANNEL_OVERRIDES['assets.listCategories']?.wrap?.({ category: 'news' })).toEqual([{ category: 'news' }])
    expect(CHANNEL_OVERRIDES['assets.listCategories']?.wrap?.()).toEqual([{}])
  })
})
