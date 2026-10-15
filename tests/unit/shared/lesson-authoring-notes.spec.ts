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

  // 2026-09-12 修复：剥离口径收紧为「注记**主导**该行」。
  // 此前任何一行里出现"先验待查证"就整行删除，导致真实教学内容被吃掉
  // （实测：张量讲义「为什么学它」的第 2、3 条 bullet 整条消失，读者看到"支撑三类工作"
  //  却只剩一条）。
  describe('不误伤"提到待查证"的教学内容（2026-09-12 用户实测）', () => {
    it('句中带"（先验待查证）"的 bullet 属于教学内容，保留；纯注记 bullet 仍剥离', () => {
      const md = [
        '落到日常工程里，张量这件事支撑三类具体工作：',
        '',
        '1. **看懂报错**：形状规则没对齐；',
        '2. **估算资源**（先验待查证）：参数数量、激活占用、显存峰值都要从形状算出来；',
        '3. **对齐数据接口**（先验待查证）：部署导出工具对维度顺序（如 NCHW / NHWC）的约定不一致时要先看形状；',
        '- **先验待查证**（本轮未取得资料原文）：PyTorch/NumPy 默认 dtype。',
      ].join('\n')
      const r = stripAuthoringNotes(md)
      // 三条教学内容全在
      expect(r.body).toContain('看懂报错')
      expect(r.body).toContain('估算资源')
      expect(r.body).toContain('对齐数据接口')
      // 纯注记 bullet 被剥离
      expect(r.body).not.toContain('本轮未取得资料原文')
      expect(r.notes.join('|')).toContain('本轮未取得资料原文')
      expect(r.notes.join('|')).not.toContain('估算资源')
    })

    it('段末括号里的"（后两类来自工程先验，待查证）"不剥整段', () => {
      const md = '张量支撑三类具体工作（后两类来自工程先验，待查证）：估算资源、对齐接口。'
      const r = stripAuthoringNotes(md)
      expect(r.body).toBe(md)
      expect(r.notes).toHaveLength(0)
    })

    it('以注记开头的标题/行仍剥离（"待核验：…"、"⚠️ …"）', () => {
      const md = ['待核验：本卡数值未复核', '⚠️ 上表 dtype 属先验', '教学内容。'].join('\n')
      const r = stripAuthoringNotes(md)
      expect(r.body).toBe('教学内容。')
      expect(r.notes.join('|')).toContain('待核验')
      expect(r.notes.join('|')).toContain('dtype')
    })
  })

  it('空输入安全', () => {
    expect(stripAuthoringNotes('')).toEqual({ body: '', notes: [] })
  })
})
