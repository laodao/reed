/**
 * 知识体系草稿纯函数测试（domain-learning-plan-draft）
 * @module tests/unit/shared/domain-learning-plan-draft.spec
 *
 * 用户确认弹窗里能改两件事：取消勾选（不生成）与调序（影响学习路径）。
 * 这里钉死"改完回传的载荷"语义——勾掉的必须真的没了、顺序按用户调整后的走、
 * 知识点被全部取消的分支不留空壳（上一版「投资与配置」空分支的教训）。
 */

import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import {
  toSyllabusDraft,
  toSyllabusPayload,
  moveItem,
  countCheckedConcepts,
} from '@shared/utils/domain-learning-plan-draft'
import type { DlPlanSyllabus } from '@shared/types/domain-learning.types'

const SYLLABUS: DlPlanSyllabus = {
  branches: [
    {
      name: '金融产品',
      definitionShort: '各类金融工具',
      concepts: [
        { name: '股票', layer: 0 },
        { name: '债券', layer: 0, prerequisites: ['股票'] },
      ],
    },
    { name: '市场与价格', concepts: [{ name: '汇率与美元', layer: 1 }] },
  ],
}

describe('toSyllabusDraft / toSyllabusPayload', () => {
  it('默认全部勾选，顺序与方案一致；原样确认时载荷等价于方案', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    expect(draft.map((b) => b.name)).toEqual(['金融产品', '市场与价格'])
    expect(draft.every((b) => b.checked && b.concepts.every((c) => c.checked))).toBe(true)
    expect(countCheckedConcepts(draft)).toBe(3)
    const payload = toSyllabusPayload(draft)
    expect(payload.branches[0].concepts.map((c) => c.name)).toEqual(['股票', '债券'])
    expect(payload.branches[1].concepts[0].name).toBe('汇率与美元')
  })

  it('取消勾选知识点 → 载荷里真的没有它', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    draft[0].concepts[1].checked = false
    const payload = toSyllabusPayload(draft)
    expect(payload.branches[0].concepts.map((c) => c.name)).toEqual(['股票'])
    expect(countCheckedConcepts(draft)).toBe(2)
  })

  it('分支下知识点全被取消 → 该分支被丢掉（不留空分支）', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    draft[1].concepts[0].checked = false
    const payload = toSyllabusPayload(draft)
    expect(payload.branches.map((b) => b.name)).toEqual(['金融产品'])
  })

  it('整分支取消勾选 → 分支及其知识点都剔除', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    draft[0].checked = false
    const payload = toSyllabusPayload(draft)
    expect(payload.branches.map((b) => b.name)).toEqual(['市场与价格'])
  })

  it('调序后载荷顺序 = 用户调整后的顺序（分支与分支内都可调）', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    // 分支 1 上移
    const reordered = [moveItem(draft, 1, -1)]
    const moved = moveItem(reordered[0], 0, 1) // 再把「金融产品」下移回原位（验证可逆）
    expect(moved.map((b) => b.name)).toEqual(['金融产品', '市场与价格'])
    // 分支内概念调序
    const b0 = moveItem(toSyllabusDraft(SYLLABUS)[0].concepts, 0, 1)
    expect(b0.map((c) => c.name)).toEqual(['债券', '股票'])
  })

  it('moveItem：越界安全（返回新数组、内容不变）', () => {
    const list = ['a', 'b']
    expect(moveItem(list, 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(list, 5, 1)).toEqual(['a', 'b'])
    expect(list).toEqual(['a', 'b']) // 不改原数组
  })

  it('空方案 → 空草稿与空载荷（不炸）', () => {
    expect(toSyllabusDraft(null)).toEqual([])
    expect(toSyllabusPayload([])).toEqual({ branches: [] })
    expect(countCheckedConcepts([])).toBe(0)
  })

  /**
   * 弹窗里 draftBranches 是 ref，读出来的是 Vue reactive 代理；载荷要经
   * ipcRenderer.invoke 的结构化克隆送给主进程，代理（尤其 prerequisites 这类嵌套数组）
   * 克隆不了，会抛「An object could not be cloned.」。所以载荷必须是纯数据。
   */
  it('草稿来自 reactive（弹窗真实情形）→ 载荷仍是纯数据，可结构化克隆', () => {
    const draft = toSyllabusDraft(reactive(SYLLABUS))
    draft[0].checked = true
    draft[0].concepts[1].checked = true
    const payload = toSyllabusPayload(draft)
    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload.branches[0].concepts[1].prerequisites).toEqual(['股票'])
  })
})
