// @vitest-environment happy-dom
/**
 * CharacterGalleryEditor · T01 历史折叠区 + 写回影响确认 组件级测试
 * @module tests/unit/renderer/components/character-gallery-history
 *
 * 钉死 AC1 / AC2 的画廊 UI 行为（task-01 §5）：
 * - AC1：分类"历史 (N)"折叠区按 createdAt desc 列出全部行，当前主图行加"主图"徽标
 * - AC2：设为主图时 storyboardCount>0 弹 AssetWriteImpactDialog，确认后才执行；
 *        storyboardCount===0 直接执行（不弹）
 * - 历史行"设为主图"调 image.setAsMain（恢复旧版本）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import CharacterGalleryEditor from '../../../../src/renderer/src/components/episode-production/stage-asset/character/CharacterGalleryEditor.vue'

interface FakeRow {
  id: string
  category: string
  label: string | null
  imagePath: string
  thumbnailPath?: string | null
  isMain: number
  createdAt: string
}

let imageRows: FakeRow[]
let writeImpact: { storyboardCount: number; episodeCount: number; notes: string[] }
const calls: { setAsMain: string[]; getWriteImpact: Array<[string, string]> } = {
  setAsMain: [],
  getWriteImpact: [],
}

function installFakeApi(): void {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    episodeProduction: {
      asset: {
        image: {
          listByAsset: async () => ({ success: true, data: imageRows }),
          setAsMain: async (id: string) => {
            calls.setAsMain.push(id)
            return { success: true, data: { updated: true } }
          },
        },
        getWriteImpact: async (assetType: string, assetId: string) => {
          calls.getWriteImpact.push([assetType, assetId])
          return { success: true, data: writeImpact }
        },
      },
    },
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

function mountEditor() {
  return mount(CharacterGalleryEditor, {
    props: { bindingId: 'cb_hist', assetType: 'character' as const },
    global: { plugins: [ElementPlus, createPinia()] },
  })
}

/** 卡片区历史按钮顺序：主图卡(0) / 服装卡(1) / 视角卡(2) / 表情(3) / 姿势(4) */
function historyButton(w: ReturnType<typeof mount>, index: number) {
  const btns = w.findAll('button').filter((b) => b.text().includes('历史'))
  expect(btns.length, '应有 5 个分类历史开关').toBe(5)
  return btns[index]
}

describe('CharacterGalleryEditor · T01 历史折叠区（AC1/AC2）', () => {
  beforeEach(() => {
    calls.setAsMain = []
    calls.getWriteImpact = []
    // 主图两张（一新一旧）+ view 分类两张同 label 历史行（多行累积场景）
    imageRows = [
      { id: 'img_old_main', category: 'main', label: null, imagePath: '/old.png', isMain: 0, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'img_view1', category: 'view', label: 'front', imagePath: '/v1.png', isMain: 0, createdAt: '2026-10-02T00:00:00Z' },
      { id: 'img_view2', category: 'view', label: 'front', imagePath: '/v2.png', isMain: 0, createdAt: '2026-10-05T00:00:00Z' },
      { id: 'img_new_main', category: 'main', label: null, imagePath: '/new.png', isMain: 1, createdAt: '2026-10-06T00:00:00Z' },
    ]
    writeImpact = { storyboardCount: 0, episodeCount: 0, notes: [] }
    installFakeApi()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('AC1：历史折叠区按 createdAt desc 列出全部行，当前主图行加"主图"徽标', async () => {
    const w = mountEditor()
    await flush()

    // 视角卡历史：两行都列出（不按 label 去重截断），createdAt desc（v2 在 v1 前）
    await historyButton(w, 2)!.trigger('click')
    await flush()
    const viewStrip = w.findAll('.history-strip').find((s) =>
      s.findAll('img').some((i) => i.attributes('src')?.includes('v1')),
    )
    expect(viewStrip, '视角历史条应渲染').toBeTruthy()
    const srcs = viewStrip!.findAll('img').map((i) => i.attributes('src') ?? '')
    expect(srcs.some((s) => s.includes('v1'))).toBe(true)
    expect(srcs.some((s) => s.includes('v2'))).toBe(true)
    expect(srcs.findIndex((s) => s.includes('v2'))).toBeLessThan(srcs.findIndex((s) => s.includes('v1')))

    // 主图卡历史：当前主图（isMain=1）行带"主图"徽标 + 金边框
    await historyButton(w, 0)!.trigger('click')
    await flush()
    const strips = w.findAll('.history-strip')
    const mainStrip = strips.find((s) =>
      s.findAll('img').some((i) => i.attributes('src')?.includes('new.png')),
    )
    expect(mainStrip, '主图历史条应渲染').toBeTruthy()
    const badge = mainStrip!.find('.history-main-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('主图')
    expect(mainStrip!.find('.is-history-main img').attributes('src')).toContain('new.png')
    // 历史行数 = 该分类全部行数（主图分类 2 行都渲染）
    expect(mainStrip!.findAll('.thumb-cell').length).toBe(2)
    w.unmount()
  })

  it('AC2（0 直接执行）：无引用时点历史行"设为主图"直接调 setAsMain，不弹确认', async () => {
    const w = mountEditor()
    await flush()
    await historyButton(w, 2)!.trigger('click') // 视角卡历史
    await flush()

    // 视角历史条第一行（最新 v2）的"设为主图"星标 = 该条 strip 内第 1 个工具图标
    const viewStrip = w.findAll('.history-strip').find((s) =>
      s.findAll('img').some((i) => i.attributes('src')?.includes('v2')),
    )!
    await viewStrip.findAll('.thumb-tool-icon')[0].trigger('click')
    await flush()
    await flush()

    expect(calls.getWriteImpact).toEqual([['character', 'cb_hist']])
    expect(calls.setAsMain).toEqual(['img_view2'])
    // 无确认弹窗（storyboardCount===0 直接执行）
    expect(document.querySelector('.impact-body')).toBeNull()
    w.unmount()
  })

  it('AC2（>0 弹窗）：被引用时先弹影响确认，确认后才执行 setAsMain', async () => {
    writeImpact = { storyboardCount: 3, episodeCount: 2, notes: ['统计为估算值'] }
    const w = mountEditor()
    await flush()
    await historyButton(w, 2)!.trigger('click')
    await flush()

    const viewStrip = w.findAll('.history-strip').find((s) =>
      s.findAll('img').some((i) => i.attributes('src')?.includes('v2')),
    )!
    await viewStrip.findAll('.thumb-tool-icon')[0].trigger('click')
    await flush()
    await flush()

    // 未执行、弹窗已打开（teleport 到 body）
    expect(calls.setAsMain).toEqual([])
    const dialogBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('继续设为主图'),
    )
    expect(dialogBtn, '写回影响确认弹窗应打开').toBeTruthy()
    expect(document.body.textContent).toContain('约 3 个分镜')

    dialogBtn!.click()
    await flush()
    await flush()
    expect(calls.setAsMain).toEqual(['img_view2'])
    w.unmount()
  })
})
