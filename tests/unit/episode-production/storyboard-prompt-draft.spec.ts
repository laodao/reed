import { describe, expect, it } from 'vitest'

import {
  FORM_PROMPT_DIVIDER,
  mergeFormPromptDescription,
  metadataRefKey,
  shouldMarkSyncedPromptDirty,
  shouldResetStoryboardDraft,
} from '../../../src/renderer/src/components/episode-production/stage-storyboard-v2/storyboard-prompt-draft'

describe('mergeFormPromptDescription', () => {
  it('保留用户在旧自动摘要后追加的自由提示词', () => {
    const previous = '旧镜头参数'
    const next = '新镜头参数'
    const manual = '用户补充：@主角 转身看向窗外'

    expect(
      mergeFormPromptDescription({
        currentText: `${previous}${FORM_PROMPT_DIVIDER}${manual}`,
        nextFormPrompt: next,
        previousFormPrompt: previous,
      }),
    ).toBe(`${next}${FORM_PROMPT_DIVIDER}${manual}`)
  })

  it('用户改写自动摘要区域时不静默丢弃改写内容', () => {
    const previous = '旧镜头参数'
    const editedByUser = '旧镜头参数，用户补充了雨夜氛围'
    const next = '新镜头参数'

    expect(
      mergeFormPromptDescription({
        currentText: `${editedByUser}${FORM_PROMPT_DIVIDER}保留的自由提示词`,
        nextFormPrompt: next,
        previousFormPrompt: previous,
      }),
    ).toBe(`${next}${FORM_PROMPT_DIVIDER}${editedByUser}${FORM_PROMPT_DIVIDER}保留的自由提示词`)
  })

  it('首次自动同步时把已有纯手写内容保留在分隔线之后', () => {
    const manual = '手写画面：@主角 站在桥上'
    const next = '镜头参数摘要'

    expect(
      mergeFormPromptDescription({
        currentText: manual,
        nextFormPrompt: next,
      }),
    ).toBe(`${next}${FORM_PROMPT_DIVIDER}${manual}`)
  })

  it('当前文本已与自动摘要一致时不重复追加摘要', () => {
    expect(
      mergeFormPromptDescription({
        currentText: '镜头参数摘要',
        nextFormPrompt: '镜头参数摘要',
      }),
    ).toBe('镜头参数摘要')
  })

  it('旧自动摘要后已有手写内容但缺少分隔线时只替换摘要前缀', () => {
    const previous = '旧镜头参数'
    const next = '新镜头参数'
    const manual = '手写补充：@主角 看向远方'

    expect(
      mergeFormPromptDescription({
        currentText: `${previous}\n${manual}`,
        nextFormPrompt: next,
        previousFormPrompt: previous,
      }),
    ).toBe(`${next}${FORM_PROMPT_DIVIDER}${manual}`)
  })

})

describe('shouldResetStoryboardDraft', () => {
  it('同一个分镜刷新且存在未保存修改时不重置草稿', () => {
    expect(
      shouldResetStoryboardDraft({
        currentStoryboardId: 'sb-1',
        nextStoryboardId: 'sb-1',
        dirtyFieldCount: 2,
      }),
    ).toBe(false)
  })

  it('切换到另一个分镜时重置草稿', () => {
    expect(
      shouldResetStoryboardDraft({
        currentStoryboardId: 'sb-1',
        nextStoryboardId: 'sb-2',
        dirtyFieldCount: 2,
      }),
    ).toBe(true)
  })

  it('同一个分镜刷新但没有未保存修改时允许同步最新数据', () => {
    expect(
      shouldResetStoryboardDraft({
        currentStoryboardId: 'sb-1',
        nextStoryboardId: 'sb-1',
        dirtyFieldCount: 0,
      }),
    ).toBe(true)
  })
})

describe('shouldMarkSyncedPromptDirty', () => {
  it('初始化同步自动摘要时不标记脏状态', () => {
    expect(
      shouldMarkSyncedPromptDirty({
        syncReason: 'initialize',
        syncedText: `镜头参数摘要${FORM_PROMPT_DIVIDER}原描述`,
        savedText: '原描述',
      }),
    ).toBe(false)
  })

  it('用户操作触发表单摘要变化时标记脏状态', () => {
    expect(
      shouldMarkSyncedPromptDirty({
        syncReason: 'user-edit',
        syncedText: `新镜头参数${FORM_PROMPT_DIVIDER}原描述`,
        savedText: `旧镜头参数${FORM_PROMPT_DIVIDER}原描述`,
      }),
    ).toBe(true)
  })

  it('文本没有变化时不标记脏状态', () => {
    expect(
      shouldMarkSyncedPromptDirty({
        syncReason: 'user-edit',
        syncedText: '相同文本',
        savedText: '相同文本',
      }),
    ).toBe(false)
  })
})

describe('metadataRefKey', () => {
  it('把 metadata 字段映射到对应显示 ref', () => {
    expect(metadataRefKey('lensFocalMm')).toBe('lensFocalMm')
    expect(metadataRefKey('aperture')).toBe('aperture')
    expect(metadataRefKey('cameraStyle')).toBe('cameraStyle')
    expect(metadataRefKey('lighting')).toBe('lighting')
  })

  it('忽略未知 metadata 字段', () => {
    expect(metadataRefKey('unknown')).toBeNull()
  })
})
