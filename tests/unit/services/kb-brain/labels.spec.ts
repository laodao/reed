/**
 * 知识大脑中文标签字典测试：枚举全覆盖 + 未知值回退原样
 */
import { describe, it, expect } from 'vitest'
import {
  KB_ATOM_STATUS_LABELS,
  KB_ATOM_TYPE_LABELS,
  KB_NOTE_STATUS_LABELS,
  KB_NOTE_TYPE_LABELS,
  kbAtomStatusLabel,
  kbAtomTypeLabel,
  kbNoteStatusLabel,
  kbNoteTypeLabel,
} from '@shared/constants/kb-brain-labels'

describe('kb-brain 中文标签', () => {
  it('论断类型/状态枚举全覆盖（与 entity 联合类型对齐）', () => {
    // KbAtomType 六值
    for (const t of ['fact', 'claim', 'concept', 'method', 'insight', 'open-question']) {
      expect(KB_ATOM_TYPE_LABELS[t], `缺论断类型标签: ${t}`).toBeTruthy()
    }
    // KbAtomStatus 五态 + archived（归档层管理可见）
    for (const st of ['supported', 'suspected', 'contradicted', 'superseded', 'stale', 'archived']) {
      expect(KB_ATOM_STATUS_LABELS[st], `缺论断状态标签: ${st}`).toBeTruthy()
    }
  })

  it('卡片类型/状态枚举全覆盖', () => {
    for (const t of ['methodology', 'insight', 'synthesis', 'plot-pattern', 'setting-pattern', 'character-pattern', 'lens', 'skill-seed']) {
      expect(KB_NOTE_TYPE_LABELS[t], `缺卡片类型标签: ${t}`).toBeTruthy()
    }
    for (const st of ['proposed', 'draft', 'published', 'archived']) {
      expect(KB_NOTE_STATUS_LABELS[st], `缺卡片状态标签: ${st}`).toBeTruthy()
    }
  })

  it('labeler：命中映射、未知值回退原样、空值回退 —', () => {
    expect(kbAtomTypeLabel('fact')).toBe('事实')
    expect(kbAtomTypeLabel('future-type')).toBe('future-type')
    expect(kbAtomStatusLabel('supported')).toBe('已采纳')
    expect(kbAtomStatusLabel(null)).toBe('—')
    expect(kbNoteTypeLabel('setting-pattern')).toBe('设定模式')
    expect(kbNoteTypeLabel('character-pattern')).toBe('人物原型')
    expect(kbNoteStatusLabel('proposed')).toBe('待审')
    expect(kbNoteStatusLabel('')).toBe('—')
  })
})
