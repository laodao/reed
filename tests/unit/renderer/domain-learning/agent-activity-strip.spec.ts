// @vitest-environment happy-dom
/**
 * Agent 活动行组件测试（AgentActivityStrip）
 * @module tests/unit/renderer/domain-learning/agent-activity-strip.spec
 *
 * 背景（2026-09-13 用户需求）：长任务（起步研究/研究此概念）要滚动显示系统正在做什么，
 * 且失败与被额度拦截的条目必须可见——此前 3 个知识点被静默拒建，界面上毫无痕迹。
 *
 * 做法：用假 window.electronAPI.domainLearning.onAgentEvent 捕获订阅回调，
 * 手动推 progress 事件，断言渲染与过滤行为。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentActivityStrip from '../../../../src/renderer/src/views/domain-learning/AgentActivityStrip.vue'
import type { DlAgentUiEvent } from '../../../../src/renderer/src/stores/domain-learning'

/** 捕获到的订阅（一个 spaceId 一条） */
let subscribers: Array<{ spaceId: string; conceptId: string | null; cb: (ev: DlAgentUiEvent) => void }>
let unsubscribed: number

function installFakeApi(): void {
  subscribers = []
  unsubscribed = 0
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    domainLearning: {
      onAgentEvent: (spaceId: string, conceptId: string | null, cb: (ev: DlAgentUiEvent) => void) => {
        subscribers.push({ spaceId, conceptId, cb })
        return () => {
          unsubscribed++
        }
      },
    },
  }
}

/** 向最新一个订阅推事件 */
function push(ev: DlAgentUiEvent): void {
  for (const s of subscribers) s.cb(ev)
}

function progress(line: string, kind: 'info' | 'warn' = 'info', mode: 'research' | 'task' = 'research'): DlAgentUiEvent {
  return { type: 'progress', mode, activity: { line, kind } }
}

const mountOpts = { global: { stubs: { 'el-icon': true } } }

describe('AgentActivityStrip', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    installFakeApi()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('订阅空间级通道（conceptId=null），活动行按序滚动且最多 3 行', async () => {
    const w = mount(AgentActivityStrip, { props: { spaceId: 'sp1' }, ...mountOpts })
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0].spaceId).toBe('sp1')
    expect(subscribers[0].conceptId).toBeNull()

    for (const t of ['正在读取网页：investor.gov', '第 5 步 · 正在落库知识点：单利与复利', '第 6 步 · 正在建立前置关系：A → B', '第 7 步 · 正在编写讲义：单利与复利']) {
      push(progress(t))
      await w.vm.$nextTick()
    }
    const lines = w.findAll('.aa-line').map((n) => n.text())
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('落库知识点')
    expect(lines[2]).toContain('编写讲义')
    w.unmount()
  })

  it('失败行（⚠️/warn）高亮整条为警示态', async () => {
    const w = mount(AgentActivityStrip, { props: { spaceId: 'sp1' }, ...mountOpts })
    push(progress('⚠️ 落库知识点「资产配置与分散化」未成功——原因见本轮总结', 'warn'))
    await w.vm.$nextTick()
    expect(w.find('.agent-activity').classes()).toContain('is-warn')
    expect(w.find('.aa-line').classes()).toContain('is-warn')
    w.unmount()
  })

  it('默认收 research + task 两类长任务的活动，答疑（tutor）不混进来', async () => {
    const w = mount(AgentActivityStrip, { props: { spaceId: 'sp1' }, ...mountOpts })
    // 补全知识地图（task）也是长任务 → 要显示
    push(progress('第 2 步 · 正在检索知识库：金融知识体系', 'info', 'task'))
    await w.vm.$nextTick()
    expect(w.find('.agent-activity').exists()).toBe(true)

    // 答疑轮不显示（答案走对话面板）
    const before = w.findAll('.aa-line').length
    push({ type: 'progress', mode: 'tutor', activity: { line: '正在检索知识库：答疑' } })
    await w.vm.$nextTick()
    expect(w.findAll('.aa-line')).toHaveLength(before)
    w.unmount()
  })

  it('modes 可定制（只要 research 时 task 轮不显示）', async () => {
    const w = mount(AgentActivityStrip, { props: { spaceId: 'sp1', modes: ['research'] }, ...mountOpts })
    push(progress('正在运行工作流：xxx', 'info', 'task'))
    await w.vm.$nextTick()
    expect(w.find('.agent-activity').exists()).toBe(false)

    push(progress('正在联网检索：股票'))
    await w.vm.$nextTick()
    expect(w.find('.agent-activity').exists()).toBe(true)
    w.unmount()
  })

  it('一轮结束（reply:done）后保留 4 秒再清空', async () => {
    const w = mount(AgentActivityStrip, { props: { spaceId: 'sp1' }, ...mountOpts })
    push(progress('正在联网检索：期货'))
    await w.vm.$nextTick()
    push({ type: 'reply:done', mode: 'research' })
    await w.vm.$nextTick()
    expect(w.find('.agent-activity').exists()).toBe(true)

    vi.advanceTimersByTime(4000)
    await w.vm.$nextTick()
    expect(w.find('.agent-activity').exists()).toBe(false)
    w.unmount()
  })

  it('spaceId 变化时重订阅并清空旧行；卸载时取消订阅', async () => {
    const w = mount(AgentActivityStrip, { props: { spaceId: 'sp1' }, ...mountOpts })
    push(progress('正在联网检索：股票'))
    await w.vm.$nextTick()
    expect(w.findAll('.aa-line')).toHaveLength(1)

    await w.setProps({ spaceId: 'sp2' })
    expect(subscribers).toHaveLength(2)
    expect(w.find('.agent-activity').exists()).toBe(false)

    w.unmount()
    expect(unsubscribed).toBeGreaterThanOrEqual(2)
  })

  it('没有 spaceId 时不订阅（空串守卫）', () => {
    const w = mount(AgentActivityStrip, { props: { spaceId: '' }, ...mountOpts })
    expect(subscribers).toHaveLength(0)
    w.unmount()
  })
})
