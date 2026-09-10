/**
 * 讲义「编写注记」剥离测试（stripAuthoringNotes）
 * @module tests/unit/shared/lesson-authoring-notes.spec
 *
 * 钉死（2026-09-09 复盘：学习者正文里不该出现编写注记/系统黑话）：
 * - ⚠️ 待核验类引用块、概念 id/状态/version 行 → 归入 notes；
 * - 正常教学正文原样保留；连续注记行合并为一条。
 */

import { describe, it, expect } from 'vitest'
import { stripAuthoringNotes } from '@shared/utils/lesson-authoring-notes'

describe('stripAuthoringNotes 讲义脱敏', () => {
  it('剥离 ⚠️ 待核验引用块，保留教学正文', () => {
    const md = [
      '波函数是描述量子态的复值函数。',
      '',
      '> ⚠️ **待核验**：本节为教材标准表述，尚未从一手原文引证。',
      '',
      '它的模方给出概率密度。',
    ].join('\n')
    const r = stripAuthoringNotes(md)
    expect(r.body).toContain('波函数是描述量子态的复值函数。')
    expect(r.body).toContain('它的模方给出概率密度。')
    expect(r.body).not.toContain('待核验')
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toContain('待核验')
  })

  it('剥离系统黑话行（概念 id/状态/version/快照确证）', () => {
    const md = [
      '概念 id: 03f19637-d36a-4f8b',
      '状态: draft | version: 1',
      '真正的教学内容一句。',
      '本空间快照确证：分母即 P(B)。',
    ].join('\n')
    const r = stripAuthoringNotes(md)
    expect(r.body).toBe('真正的教学内容一句。')
    // 相邻的注记行会合并为一条，故按内容而非条数断言
    const joined = r.notes.join(' | ')
    expect(r.notes.length).toBeGreaterThanOrEqual(2)
    expect(joined).toContain('概念 id')
    expect(joined).toContain('version')
    expect(joined).toContain('快照确证')
  })

  it('连续多行注记合并为一条', () => {
    const md = ['> ⚠️ 待核验：采集阶段站点超时', '> 建议下一步补采 Wikipedia 词条', '正文甲'].join('\n')
    const r = stripAuthoringNotes(md)
    expect(r.body).toBe('正文甲')
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toContain('超时')
    expect(r.notes[0]).toContain('Wikipedia')
  })

  it('无注记时原样返回（不误伤正文）', () => {
    const md = '第一段。\n\n第二段，含 P(A|B)=P(B|A)P(A)/P(B) 公式。'
    const r = stripAuthoringNotes(md)
    expect(r.body).toBe(md)
    expect(r.notes).toHaveLength(0)
  })

  it('空输入安全', () => {
    expect(stripAuthoringNotes('')).toEqual({ body: '', notes: [] })
  })
})
