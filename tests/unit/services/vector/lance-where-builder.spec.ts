/**
 * 步骤0 阶段5：LanceDB where 子句构造 + escape 测试（纯函数，D3 防注入保障）
 * @description 不连真实 lancedb，只测 buildLanceWhere / escapeLanceValue 的字符串构造正确性。
 */

import { describe, it, expect } from 'vitest'
import {
  buildLanceWhere,
  escapeLanceValue,
} from '@core/services/lance-db.service'

describe('escapeLanceValue', () => {
  it('转义单引号（防注入）', () => {
    expect(escapeLanceValue("normal")).toBe('normal')
    expect(escapeLanceValue("a'b")).toBe("a''b")
    expect(escapeLanceValue("'; DROP TABLE--")).toBe("''; DROP TABLE--")
  })

  it('多个单引号全部转义', () => {
    expect(escapeLanceValue("'x'y'")).toBe("''x''y''")
  })
})

describe('buildLanceWhere（search 模式，allowRange）', () => {
  it('projectId + entityType 构造 AND 条件', () => {
    const where = buildLanceWhere({ projectId: 'p1', entityType: 'character' }, { allowRange: true })
    expect(where).toBe("projectId = 'p1' AND entityType = 'character'")
  })

  it('恶意 projectId 被转义（不产生注入）', () => {
    const where = buildLanceWhere({ projectId: "p1'; DROP TABLE vectors--" }, { allowRange: true })
    // 单引号被翻倍，WHERE 仍是一个合法的字符串字面量，不会逸出
    expect(where).toBe("projectId = 'p1''; DROP TABLE vectors--'")
    expect(where).not.toMatch(/'p1';/) // 没有未转义的闭合引号
  })

  it('chapterNumberLte 翻译为 <=（数字不引号）', () => {
    const where = buildLanceWhere({ projectId: 'p1', chapterNumberLte: 5 }, { allowRange: true })
    expect(where).toBe("projectId = 'p1' AND chapterNumber <= 5")
  })

  it('chapterNumberGte 翻译为 >=', () => {
    const where = buildLanceWhere({ chapterNumberGte: 3 }, { allowRange: true })
    expect(where).toBe('chapterNumber >= 3')
  })

  it('chapterNumber 精确匹配', () => {
    const where = buildLanceWhere({ projectId: 'p1', chapterNumber: 3 }, { allowRange: true })
    expect(where).toBe("projectId = 'p1' AND chapterNumber = 3")
  })

  it('空 filter 返回空字符串', () => {
    expect(buildLanceWhere({}, { allowRange: true })).toBe('')
  })

  it('entityId 也被转义', () => {
    const where = buildLanceWhere({ entityId: "e'1" }, { allowRange: true })
    expect(where).toBe("entityId = 'e''1'")
  })
})

describe('buildLanceWhere（delete 模式，无 range）', () => {
  it('allowRange=false 时忽略 chapterNumberLte/Gte', () => {
    const where = buildLanceWhere(
      { projectId: 'p1', chapterNumberLte: 5, chapterNumberGte: 1 } as any,
      { allowRange: false },
    )
    expect(where).toBe("projectId = 'p1'")
    expect(where).not.toContain('<=')
    expect(where).not.toContain('>=')
  })

  it('delete 用精确 chapterNumber', () => {
    const where = buildLanceWhere(
      { projectId: 'p1', chapterNumber: 3 },
      { allowRange: false },
    )
    expect(where).toBe("projectId = 'p1' AND chapterNumber = 3")
  })

  it('delete 空 filter 返回空（调用方应阻止）', () => {
    expect(buildLanceWhere({}, { allowRange: false })).toBe('')
  })
})
