/**
 * 通知弹窗助手单测
 *
 * 背景需求：系统弹出的通知提示卡片，用户没有点击关闭时，过一定时间必须自动关闭。
 * 历史实现里 5 处 ElNotification 写了 duration: 0（永不自动关闭），用户不点就永久占屏。
 *
 * 本助手把"超时时长 / 是否常驻 / offset 避让顶栏铃铛"收敛到一处，
 * 保证新增通知默认即带自动关闭行为，不会再次疏漏。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** 记录每次 ElNotification 调用的参数（模块需在 mock 之后动态 import） */
const calls: Array<Record<string, unknown>> = []
/** close 回调计数：验证返回值透传 */
let closeCallCount = 0

vi.mock('element-plus', () => ({
  ElNotification: (opts: Record<string, unknown>) => {
    calls.push(opts)
    return {
      close: () => {
        closeCallCount++
      },
    }
  },
}))

/** 动态导入：确保拿到被 mock 后的 element-plus */
async function loadNotify() {
  return await import('../../../../src/renderer/src/utils/notify')
}

describe('notify 通知弹窗助手', () => {
  beforeEach(() => {
    calls.length = 0
    closeCallCount = 0
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('自动关闭（核心需求）', () => {
    it('默认超时时长为 8000ms，用户不点击也会自动消失', async () => {
      const { notify, NOTIFY_AUTO_CLOSE_MS } = await loadNotify()
      notify({ title: '标题', message: '正文' })

      expect(NOTIFY_AUTO_CLOSE_MS).toBe(8000)
      expect(calls).toHaveLength(1)
      expect(calls[0].duration).toBe(8000)
    })

    it('任何语义入口都不会产生 duration: 0（永不关闭）的弹窗', async () => {
      const { notifyInfo, notifySuccess, notifyWarning, notifyError, notifyTodo } = await loadNotify()

      notifyInfo({ title: 'a', message: 'a' })
      notifySuccess({ title: 'b', message: 'b' })
      notifyWarning({ title: 'c', message: 'c' })
      notifyError({ title: 'd', message: 'd' })
      notifyTodo({ title: 'e', message: 'e' })

      expect(calls).toHaveLength(5)
      for (const c of calls) {
        expect(c.duration).toBe(8000)
        expect(c.duration).not.toBe(0)
      }
    })

    it('显式传入 duration 时以调用方为准（可覆盖默认值）', async () => {
      const { notify } = await loadNotify()
      notify({ title: 'x', message: 'x', duration: 3000 })
      expect(calls[0].duration).toBe(3000)
    })

    it('显式传入 duration: 0 会被拒绝并回落默认超时（防再次疏漏）', async () => {
      const { notify, NOTIFY_AUTO_CLOSE_MS } = await loadNotify()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      notify({ title: 'x', message: 'x', duration: 0 })

      expect(calls[0].duration).toBe(NOTIFY_AUTO_CLOSE_MS)
      expect(warn).toHaveBeenCalled()
    })
  })

  describe('顶栏避让与类型', () => {
    it('固定 offset=52，避免被右上角铃铛遮挡', async () => {
      const { notify } = await loadNotify()
      notify({ title: 'x', message: 'x' })
      expect(calls[0].offset).toBe(52)
    })

    it('各语义入口映射到正确的 Element Plus type', async () => {
      const { notifyInfo, notifySuccess, notifyWarning, notifyError } = await loadNotify()

      notifyInfo({ title: 'a', message: 'a' })
      notifySuccess({ title: 'b', message: 'b' })
      notifyWarning({ title: 'c', message: 'c' })
      notifyError({ title: 'd', message: 'd' })

      expect(calls.map(c => c.type)).toEqual(['info', 'success', 'warning', 'error'])
    })
  })

  describe('返回值与点击', () => {
    it('返回 Element Plus 通知实例（调用方可主动 close）', async () => {
      const { notify } = await loadNotify()
      const ins = notify({ title: 'x', message: 'x' })
      expect(typeof ins.close).toBe('function')
      ins.close()
      expect(closeCallCount).toBe(1)
    })

    it('onClick 透传给 Element Plus（点击即关闭由组件自身保证）', async () => {
      const { notify } = await loadNotify()
      const onClick = vi.fn()
      notify({ title: 'x', message: 'x', onClick })
      expect(calls[0].onClick).toBe(onClick)
    })
  })

  describe('待办类通知（超时关闭但可回看）', () => {
    it('notifyTodo 接受 route，供点击直达', async () => {
      const { notifyTodo } = await loadNotify()
      notifyTodo({ title: '待审核', message: '等你审核', route: '/workflow/review/r1' })
      expect(calls[0].duration).toBe(8000)
      expect(calls[0].type).toBe('warning')
    })

    it('notifyTodo 未传 duration 时同样自动关闭', async () => {
      const { notifyTodo } = await loadNotify()
      notifyTodo({ title: '待审核', message: '等你审核' })
      expect(calls[0].duration).toBe(8000)
    })
  })
})