/**
 * 工作流实时弹窗（右上角通知）点击自动关闭测试
 * @module tests/renderer/workflow-notify-popup
 * @description 用户需求：通知点击后自动消失。验证 workflow store 收到
 *              wf:run-event 的 notify / review-requested 时创建的 ElNotification：
 *              - 弹窗配置了 onClick：点击 → 调用实例 close()（自动消失）
 *              - 点击同时按 runId 直达运行详情（与通知中心点击语义一致）
 *              - notify 无 runId 时只关闭不跳转；review-requested 保持 duration=0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { WfRunEvent } from '@/stores/workflow'

const { notificationMock, pushMock } = vi.hoisted(() => ({
  notificationMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('element-plus', () => ({ ElNotification: notificationMock }))
vi.mock('@/router', () => ({ default: { push: pushMock } }))

let emitEvent: ((e: WfRunEvent) => void) | null = null

beforeEach(async () => {
  notificationMock.mockReset()
  notificationMock.mockReturnValue({ close: vi.fn() })
  pushMock.mockReset()
  emitEvent = null
  vi.resetModules()
  setActivePinia(createPinia())
  ;(globalThis as { window?: unknown }).window = {
    electronAPI: {
      workflow: {
        onRunEvent: (cb: (e: WfRunEvent) => void) => {
          emitEvent = cb
          return () => {}
        },
      },
    },
  }
  const { useWorkflowStore } = await import('@/stores/workflow')
  const store = useWorkflowStore()
  store.subscribe()
  expect(emitEvent).toBeTruthy()
})

function emit(e: WfRunEvent): void {
  emitEvent!(e)
}

/** 最近一次 ElNotification 调用：配置对象 + 返回实例的 close */
function lastPopup(): { config: Record<string, unknown>; close: ReturnType<typeof vi.fn> } {
  const cfg = notificationMock.mock.calls[notificationMock.mock.calls.length - 1][0] as Record<string, unknown>
  const close = notificationMock.mock.results[notificationMock.mock.results.length - 1].value.close as ReturnType<typeof vi.fn>
  return { config: cfg, close }
}

describe('workflow 弹窗通知点击后自动消失', () => {
  it('notify 事件（有 runId）：点击 → close 自动消失 + 直达运行详情', async () => {
    emit({ type: 'notify', runId: 'wfrun_1', title: '短视频生成完成', message: '成片已存档', level: 'success' })
    const { config, close } = lastPopup()
    expect(typeof config.onClick).toBe('function')
    ;(config.onClick as () => void)()
    expect(close).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/workflow/run/wfrun_1')
  })

  it('notify 事件（无 runId）：点击 → 只关闭，不跳转', async () => {
    emit({ type: 'notify', title: '运行通知', message: '状态更新', level: 'info' })
    const { config, close } = lastPopup()
    ;(config.onClick as () => void)()
    expect(close).toHaveBeenCalledTimes(1)
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('review-requested 事件：保持 duration=0（不自动超时消失），点击 → close + 直达审核页', async () => {
    emit({ type: 'review-requested', runId: 'wfrun_2', nodeName: '素材板审核' })
    const { config, close } = lastPopup()
    expect(config.duration).toBe(0)
    expect(typeof config.onClick).toBe('function')
    ;(config.onClick as () => void)()
    expect(close).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/workflow/run/wfrun_2')
  })
})
