// @vitest-environment happy-dom
/**
 * AssetWriteImpactDialog 组件级测试（T01 · 写回影响范围确认弹窗）
 * @module tests/unit/renderer/components/asset-write-impact-dialog
 *
 * 钉死弹窗 UI 行为（task-01 §2.2 / AC2）：
 * - 打开时经 store 调 ep:asset:get-write-impact，文案用"约 N 个分镜（M 集）"（估算口径，不绝对化）
 * - detail 展示口径说明（notes）
 * - 确认 → 只 emit confirm；取消 → emit cancel
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import AssetWriteImpactDialog from '../../../../src/renderer/src/components/episode-production/shared/AssetWriteImpactDialog.vue'

type ImpactPayload = {
  success: boolean
  data?: {
    storyboardCount: number
    episodeCount: number
    notes: string[]
    legacyUnmigratedSceneCount?: number
  }
}

let impactResp: ImpactPayload
let calls: Array<{ assetType: string; assetId: string }>

function installFakeApi(): void {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    episodeProduction: {
      asset: {
        getWriteImpact: async (assetType: string, assetId: string) => {
          calls.push({ assetType, assetId })
          return impactResp
        },
      },
    },
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

function mountDialog(modelValue: boolean) {
  return mount(AssetWriteImpactDialog, {
    attachTo: document.body,
    props: {
      modelValue,
      assetType: 'character',
      assetId: 'cb_test',
      action: 'set-main',
    },
    global: { plugins: [ElementPlus, createPinia()] },
  })
}

describe('AssetWriteImpactDialog（T01）', () => {
  beforeEach(() => {
    calls = []
    impactResp = {
      success: true,
      data: {
        storyboardCount: 3,
        episodeCount: 2,
        notes: ['统计为估算值：不含分镜级挑图', '含未迁移老数据：1 条场景角色记录未迁移绑定'],
      },
    }
    installFakeApi()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('打开时调 getWriteImpact(character, cb_test)，文案含"约 3 个分镜"与"约 2 集"', async () => {
    const w = mountDialog(true)
    await flush()

    expect(calls).toEqual([{ assetType: 'character', assetId: 'cb_test' }])
    const body = document.body
    expect(body.textContent).toContain('约 3 个分镜')
    expect(body.textContent).toContain('约 2 集')
    // 口径说明（含未迁移老数据标注）随 notes 展示
    expect(body.textContent).toContain('含未迁移老数据')
    // 文案不绝对化（"被约"，无"正好/精确"表述）
    expect(body.textContent).toContain('被约 3 个分镜')
    w.unmount()
  })

  it('点"继续设为主图"只 emit confirm，不 emit cancel', async () => {
    const w = mountDialog(true)
    await flush()

    const btn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('继续设为主图'),
    )
    expect(btn, '应渲染"继续设为主图"确认按钮').toBeTruthy()
    btn!.click()
    await flush()
    await flush()

    const emitted = w.emitted()
    expect(emitted['confirm']).toBeTruthy()
    expect(emitted['cancel']).toBeFalsy()
    w.unmount()
  })

  it('点"取消"emit cancel', async () => {
    const w = mountDialog(true)
    await flush()

    const btn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === '取消',
    )
    expect(btn, '应渲染"取消"按钮').toBeTruthy()
    btn!.click()
    await flush()
    await flush()

    expect(w.emitted('cancel')).toBeTruthy()
    w.unmount()
  })

  it('查询失败（success=false）时文案显示"?"占位，不阻塞确认', async () => {
    impactResp = { success: false }
    const w = mountDialog(true)
    await flush()

    expect(document.body.textContent).toContain('约 ? 个分镜')
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('继续设为主图'),
    )
    btn!.click()
    await flush()
    expect(w.emitted('confirm')).toBeTruthy()
    w.unmount()
  })
})
