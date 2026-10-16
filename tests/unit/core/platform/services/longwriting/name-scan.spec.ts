/**
 * R9 v2 文本人名扫描单测（§3c 排除集扩容，2026-09-20）
 * 验证：known 并入地点名册后地名不报、STOPWORDS 泛称不报、真人名仍报。
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@core/database/database-manager.interface', () => ({ getCoreDatabaseManager: () => ({}) }))

import { scanNameCandidates } from '@core/platform/services/longwriting/graph/consistency.service'

describe('scanNameCandidates（§3c 排除集）', () => {
  const chapters = [
    {
      name: '第1章',
      // 白鹿城→「的」前瞻命中；张轻薄→「笑」前瞻命中；马夫→「道」前瞻命中
      content: '白鹿城的街市热闹。张轻薄笑道：“这算什么。”马夫道：“车备好了。”',
    },
    {
      name: '第2章',
      content: '张轻薄低声嘀咕。白鹿城的钟声响了。车旁的马夫道：“走吧。”',
    },
  ]

  it('地点（白鹿城）并入 known 后不再候选，真人名（张轻薄）仍报', () => {
    const out = scanNameCandidates(chapters, ['沈云萝', '白鹿城'], 1)
    const names = out.map((o) => o.name)
    expect(names).not.toContain('白鹿城')
    expect(names).toContain('张轻薄')
  })

  it('停用词（马夫）不进候选', () => {
    const out = scanNameCandidates(chapters, ['沈云萝'], 1)
    expect(out.map((o) => o.name)).not.toContain('马夫')
  })

  it('known 为空时地名会报（证明是排除集在起作用，而非正则抓不到）', () => {
    const out = scanNameCandidates(chapters, [], 1)
    expect(out.map((o) => o.name)).toContain('白鹿城')
  })

  it('minCount 生效：出现次数不足不报', () => {
    const single = [{ name: '第1章', content: '张轻薄笑道：“好。”' }]
    expect(scanNameCandidates(single, ['沈云萝'], 3)).toHaveLength(0)
  })
})
