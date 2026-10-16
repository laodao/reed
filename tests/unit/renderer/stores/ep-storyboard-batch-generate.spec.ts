/**
 * ep-storyboard store · 批量生成分镜部分失败/跳过提示测试
 * @module tests/unit/renderer/stores/ep-storyboard-batch-generate
 * @description 一致性修复第四批 Task 1：批量响应的 failedScenes/skippedScenes 此前
 *              renderer 零消费，部分失败时用户无感知。验证 store.generateStoryboards：
 *              - failedScenes 非空 → ElMessage.warning「N 个场景生成失败：{首个错误}」
 *              - skippedScenes 非空 → ElMessage.info「N 个场景 AI 未返回有效分镜，已保留原分镜」
 *              - 全灭 success:false → 走既有 wb.error 错误路径，不重复 toast
 *              - 旧版数组载荷（无新字段）→ 不提示
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { warningMock, infoMock } = vi.hoisted(() => ({
  warningMock: vi.fn(),
  infoMock: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: warningMock, info: infoMock },
}))

// generateStoryboards 内动态 import 的 script store：控制 currentScene 以走列表回填分支
vi.mock('../../../../src/renderer/src/stores/episode-production/script.store', () => ({
  useEpScriptStore: () => ({ currentScene: null }),
}))

async function freshStore() {
  vi.resetModules()
  setActivePinia(createPinia())
  const { useEpStoryboardStore } = await import(
    '../../../../src/renderer/src/stores/episode-production/storyboard.store'
  )
  const { useEpWorkbenchStore } = await import(
    '../../../../src/renderer/src/stores/episode-production/workbench.store'
  )
  return { store: useEpStoryboardStore(), wb: useEpWorkbenchStore() }
}

function stubGenerateStoryboards(response: unknown) {
  ;(globalThis as any).window = {
    electronAPI: {
      episodeProduction: {
        generateStoryboards: vi.fn().mockResolvedValue(response),
      },
    },
  }
}

describe('ep-storyboard store · generateStoryboards 部分失败/跳过提示', () => {
  beforeEach(() => {
    warningMock.mockReset()
    infoMock.mockReset()
  })

  it('failedScenes 非空 → warning 提示场景数与首个错误信息', async () => {
    stubGenerateStoryboards({
      success: true,
      data: {
        storyboards: [{ id: 'sb-1', sceneScriptId: 'sc-1' }],
        failedScenes: [
          { sceneId: 'sc-2', error: '写库失败：FK 约束' },
          { sceneId: 'sc-3', error: '写库失败：触发器异常' },
        ],
      },
    })
    const { store } = await freshStore()
    await store.generateStoryboards('script-1')
    expect(warningMock).toHaveBeenCalledTimes(1)
    expect(warningMock).toHaveBeenCalledWith('2 个场景生成失败：写库失败：FK 约束')
    expect(infoMock).not.toHaveBeenCalled()
  })

  it('skippedScenes 非空 → info 提示已保留原分镜', async () => {
    stubGenerateStoryboards({
      success: true,
      data: {
        storyboards: [{ id: 'sb-1', sceneScriptId: 'sc-1' }],
        skippedScenes: ['sc-2'],
      },
    })
    const { store } = await freshStore()
    await store.generateStoryboards('script-1')
    expect(infoMock).toHaveBeenCalledTimes(1)
    expect(infoMock).toHaveBeenCalledWith('1 个场景 AI 未返回有效分镜，已保留原分镜')
    expect(warningMock).not.toHaveBeenCalled()
  })

  it('全灭 success:false → 走既有 wb.error 错误路径，不重复 toast', async () => {
    stubGenerateStoryboards({
      success: false,
      error: '批量生成分镜失败：2 个场景写库失败（已回滚保留旧分镜）——sc-1: 写库失败',
    })
    const { store, wb } = await freshStore()
    const result = await store.generateStoryboards('script-1')
    expect(result).toBeNull()
    expect(wb.error).toContain('批量生成分镜失败')
    expect(warningMock).not.toHaveBeenCalled()
    expect(infoMock).not.toHaveBeenCalled()
  })

  it('旧版数组载荷（无 failedScenes/skippedScenes）→ 不提示', async () => {
    stubGenerateStoryboards({
      success: true,
      data: [{ id: 'sb-1', sceneScriptId: 'sc-1' }],
    })
    const { store } = await freshStore()
    await store.generateStoryboards('script-1')
    expect(warningMock).not.toHaveBeenCalled()
    expect(infoMock).not.toHaveBeenCalled()
  })
})
