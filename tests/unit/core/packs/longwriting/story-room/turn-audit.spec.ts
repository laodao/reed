/**
 * 回合完成宣称审计单测（§2 防编造，2026-09-20）
 * auditCompletionClaims：宣称+零写工具=违规 / 有写工具=放行 / 无宣称=放行 / 宣称词去重；
 * stillClaimingAfterChallenge：纠问后的诚实出口（历史事实声明 / 工具回执凭据）。
 */
import { describe, it, expect } from 'vitest'
import {
  auditCompletionClaims,
  stillClaimingAfterChallenge,
  FALLBACK_WRITE_TOOLS,
} from '@core/packs/longwriting/story-room/turn-audit'

const ok = (content: string, writeToolsUsed: string[]) => auditCompletionClaims({ content, writeToolsUsed })

describe('auditCompletionClaims', () => {
  it('宣称完成 + 零写工具 → 违规，并给出命中宣称词', () => {
    const r = ok('第 1 章正文已保存（2454 字），两段检查结论如下。', [])
    expect(r.violation).toBe(true)
    expect(r.claims).toContain('已保存')
  })

  it('宣称完成 + 有写工具回执 → 放行', () => {
    const r = ok('正文已保存（2321 字）。', ['lw_write_chapter_full'])
    expect(r.violation).toBe(false)
  })

  it('无宣称 → 放行（哪怕也没调用写工具）', () => {
    expect(ok('这个问题需要先确认一下大纲，我查一下。', []).violation).toBe(false)
  })

  it('宣称词去重保序', () => {
    const r = ok('设计卡已生成，正文已保存，版本已入库。', [])
    expect(r.claims).toEqual(['已生成', '已保存', '已入库'])
  })

  it('兜底名单覆盖分步写工具 lw_write_chapter', () => {
    expect(FALLBACK_WRITE_TOOLS.has('lw_write_chapter')).toBe(true)
    expect(FALLBACK_WRITE_TOOLS.has('lw_query_bible')).toBe(false)
  })
})

describe('stillClaimingAfterChallenge（纠问后的诚实出口）', () => {
  it('声明历史事实 → 不再算违规', () => {
    expect(stillClaimingAfterChallenge('抱歉，那是指第1章此前已完成保存，本轮无新增写入。')).toBe(false)
  })

  it('给出工具回执凭据（run id / 章节 id）→ 不再算违规', () => {
    expect(stillClaimingAfterChallenge('章法 run id：wfrun_1789898351702_66bww5syf，已完成保存。')).toBe(false)
    expect(stillClaimingAfterChallenge('章节 id chapter_1789898403823_17r0h2gje，已保存。')).toBe(false)
  })

  it('无凭据坚持完成表述 → 仍违规', () => {
    expect(stillClaimingAfterChallenge('我确认正文已保存完毕，没有问题。')).toBe(true)
  })

  it('不含宣称词 → 不违规', () => {
    expect(stillClaimingAfterChallenge('好的，我现在去执行。')).toBe(false)
  })
})
