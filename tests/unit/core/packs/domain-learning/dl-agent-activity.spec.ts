/**
 * Agent 活动跟踪器测试（DlActivityTracker）
 * @module tests/unit/core/packs/domain-learning/dl-agent-activity.spec
 *
 * 钉死：步号跟随 step 事件；tool-start 出 info 行；tool-end 成功不出行；
 * tool-end 失败出 warn 行且**复用调用时的主语**（用户要知道是哪个知识点没落上）。
 */

import { describe, it, expect } from 'vitest'
import { DlActivityTracker } from '@core/packs/domain-learning/services/dl-agent-activity'

describe('DlActivityTracker', () => {
  it('step 事件只更新步号，不单独出行；随后的工具调用带上步号', () => {
    const t = new DlActivityTracker()
    expect(t.onStream({ kind: 'step', stepNumber: 3 })).toBeNull()
    const e = t.onStream({ kind: 'tool-start', toolName: 'web_search', toolCallId: 'c1', args: { query: '股票' } })
    expect(e).toEqual({ line: '第 3 步 · 正在联网检索：股票', kind: 'info', tool: 'web_search' })
  })

  it('tool-start：落库类工具出"正在落库知识点：<名>"', () => {
    const t = new DlActivityTracker()
    const e = t.onStream({
      kind: 'tool-start',
      toolName: 'dl_save_concept',
      toolCallId: 'c1',
      args: { concept: { name: '资产配置与分散化' } },
    })
    expect(e?.line).toBe('正在落库知识点：资产配置与分散化')
    expect(e?.kind).toBe('info')
  })

  it('tool-end 成功：不产生活动行（避免刷屏）', () => {
    const t = new DlActivityTracker()
    t.onStream({ kind: 'tool-start', toolName: 'dl_save_concept', toolCallId: 'c1', args: { concept: { name: 'A' } } })
    expect(t.onStream({ kind: 'tool-end', toolName: 'dl_save_concept', toolCallId: 'c1', ok: true })).toBeNull()
  })

  it('tool-end 失败：warn 行复用 tool-start 的主语（额度用尽场景）', () => {
    const t = new DlActivityTracker()
    t.onStream({
      kind: 'tool-start',
      toolName: 'dl_save_concept',
      toolCallId: 'c9',
      args: { concept: { name: '指数基金与定期定额投资（定投）' } },
    })
    const e = t.onStream({ kind: 'tool-end', toolName: 'dl_save_concept', toolCallId: 'c9', ok: false })
    expect(e?.kind).toBe('warn')
    expect(e?.line).toContain('⚠️')
    expect(e?.line).toContain('指数基金与定期定额投资（定投）')
    expect(e?.line).toContain('本轮总结')
  })

  it('tool-end 找不到对应 tool-start（事件丢失）：退化为工具级 warn，不抛错', () => {
    const t = new DlActivityTracker()
    const e = t.onStream({ kind: 'tool-end', toolName: 'wf_web_extract', toolCallId: 'ghost', ok: false })
    expect(e?.kind).toBe('warn')
    expect(e?.line).toContain('读取网页')
  })

  it('tool-end 会清掉在途记录（同一 toolCallId 不会二次复用主语）', () => {
    const t = new DlActivityTracker()
    t.onStream({ kind: 'tool-start', toolName: 'dl_save_concept', toolCallId: 'c1', args: { concept: { name: 'A' } } })
    t.onStream({ kind: 'tool-end', toolName: 'dl_save_concept', toolCallId: 'c1', ok: false })
    const again = t.onStream({ kind: 'tool-end', toolName: 'dl_save_concept', toolCallId: 'c1', ok: false })
    expect(again?.line).not.toContain('「A」')
  })

  it('delta 事件不产生活动行（正文另有流式通道）', () => {
    const t = new DlActivityTracker()
    expect(t.onStream({ kind: 'delta', text: '正在思考…' })).toBeNull()
  })
})
