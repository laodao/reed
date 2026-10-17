/**
 * W4 选区 AI 编辑：scanExcerptConflicts 纯函数单测
 */
import { describe, expect, it } from 'vitest'
import { scanExcerptConflicts } from '@core/platform/services/longwriting/excerpt-review'

describe('scanExcerptConflicts（W4 excerpt 复查）', () => {
  const chars = [
    { name: '沈云萝', aliases: ['云萝', '沈捕头'], stateSummary: '在诏狱被处死，尸体未寻回' },
    { name: '赵德全', stateSummary: '押运途中受重伤' },
    { name: '白鹿城主', stateSummary: '' },
  ]

  it('死亡角色的本名或别名出现在结果 → warning', () => {
    const w = scanExcerptConflicts('沈云萝推门而入，剑光如雪。', chars)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('沈云萝')
    expect(w[0]).toContain('已死亡')
  })

  it('死亡角色的别名命中 → warning 且报别名', () => {
    const w = scanExcerptConflicts('云萝笑了笑。', chars)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('云萝')
  })

  it('活角色/无状态角色 → 无 warning', () => {
    expect(scanExcerptConflicts('赵德全咳了两声。白鹿城主点头。', chars)).toEqual([])
  })

  it('结果不含任何角色名 → 无 warning', () => {
    expect(scanExcerptConflicts('街上人声鼎沸。', chars)).toEqual([])
  })

  it('短名（<2 字）不参与匹配（防误报单字）', () => {
    const w = scanExcerptConflicts('阿九死了。', [{ name: '九', stateSummary: '死亡' }])
    expect(w).toEqual([])
  })

  it('空文本 → 无 warning', () => {
    expect(scanExcerptConflicts('', chars)).toEqual([])
  })
})
