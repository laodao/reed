/**
 * 知识体系草稿纯函数测试（domain-learning-plan-draft）
 * @module tests/unit/shared/domain-learning-plan-draft.spec
 *
 * 用户确认弹窗里能改两件事：取消勾选（不生成）与调序（影响学习路径）。
 * 这里钉死"改完回传的载荷"语义——勾掉的必须真的没了、顺序按用户调整后的走、
 * 知识点被全部取消的分支不留空壳（上一版「投资与配置」空分支的教训）。
 *
 * 2026-09-25：草稿升级为完整方案形状（branches + rootConcepts + notes）——根层知识点
 * 不再在用户确认时被静默丢弃；另钉死 findDanglingPrereqs（悬空前置提示）语义。
 */

import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import {
  toSyllabusDraft,
  toSyllabusPayload,
  moveItem,
  countCheckedConcepts,
  findDanglingPrereqs,
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
  rootConcepts: [{ name: '复利与折现', layer: 0 }],
  notes: '取材说明：金融产品分支来自资料，其余先验待查证',
}

describe('toSyllabusDraft / toSyllabusPayload', () => {
  it('默认全部勾选，顺序与方案一致；原样确认时载荷等价于方案（含根层与说明）', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    expect(draft.branches.map((b) => b.name)).toEqual(['金融产品', '市场与价格'])
    expect(draft.branches.every((b) => b.checked && b.concepts.every((c) => c.checked))).toBe(true)
    expect(draft.rootConcepts.map((c) => c.name)).toEqual(['复利与折现'])
    expect(draft.notes).toBe(SYLLABUS.notes)
    expect(countCheckedConcepts(draft)).toBe(4)
    const payload = toSyllabusPayload(draft)
    expect(payload.branches[0].concepts.map((c) => c.name)).toEqual(['股票', '债券'])
    expect(payload.branches[1].concepts[0].name).toBe('汇率与美元')
    expect(payload.rootConcepts?.map((c) => c.name)).toEqual(['复利与折现'])
    expect(payload.notes).toBe(SYLLABUS.notes)
  })

  it('取消勾选知识点 → 载荷里真的没有它', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    draft.branches[0].concepts[1].checked = false
    const payload = toSyllabusPayload(draft)
    expect(payload.branches[0].concepts.map((c) => c.name)).toEqual(['股票'])
    expect(countCheckedConcepts(draft)).toBe(3)
  })

  it('分支下知识点全被取消 → 该分支被丢掉（不留空分支）', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    draft.branches[1].concepts[0].checked = false
    const payload = toSyllabusPayload(draft)
    expect(payload.branches.map((b) => b.name)).toEqual(['金融产品'])
  })

  it('整分支取消勾选 → 分支及其知识点都剔除（根层不受影响）', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    draft.branches[0].checked = false
    const payload = toSyllabusPayload(draft)
    expect(payload.branches.map((b) => b.name)).toEqual(['市场与价格'])
    expect(payload.rootConcepts?.map((c) => c.name)).toEqual(['复利与折现'])
  })

  it('根层知识点：取消勾选 → 载荷里被剔除（此前整段被静默丢弃）', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    draft.rootConcepts[0].checked = false
    const payload = toSyllabusPayload(draft)
    expect(payload.rootConcepts).toEqual([])
    expect(countCheckedConcepts(draft)).toBe(3)
  })

  it('调序后载荷顺序 = 用户调整后的顺序（分支与分支内都可调）', () => {
    const draft = toSyllabusDraft(SYLLABUS)
    // 分支 1 上移
    const reordered = moveItem(draft.branches, 1, -1)
    expect(reordered.map((b) => b.name)).toEqual(['市场与价格', '金融产品'])
    // 分支内概念调序
    const b0 = moveItem(toSyllabusDraft(SYLLABUS).branches[0].concepts, 0, 1)
    expect(b0.map((c) => c.name)).toEqual(['债券', '股票'])
    // 根层概念调序（2026-09-25）
    const root2: DlPlanSyllabus = { ...SYLLABUS, rootConcepts: [{ name: 'A', layer: 0 }, { name: 'B', layer: 0 }] }
    expect(moveItem(toSyllabusDraft(root2).rootConcepts, 0, 1).map((c) => c.name)).toEqual(['B', 'A'])
  })

  it('moveItem：越界安全（返回新数组、内容不变）', () => {
    const list = ['a', 'b']
    expect(moveItem(list, 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(list, 5, 1)).toEqual(['a', 'b'])
    expect(list).toEqual(['a', 'b']) // 不改原数组
  })

  it('空方案 → 空草稿与空载荷（不炸）', () => {
    const draft = toSyllabusDraft(null)
    expect(draft.branches).toEqual([])
    expect(draft.rootConcepts).toEqual([])
    expect(draft.notes).toBeNull()
    expect(toSyllabusPayload(draft)).toEqual({ branches: [], rootConcepts: [], notes: null })
    expect(countCheckedConcepts(draft)).toBe(0)
  })

  /**
   * 弹窗里 draft 是 ref，读出来的是 Vue reactive 代理；载荷要经
   * ipcRenderer.invoke 的结构化克隆送给主进程，代理（尤其 prerequisites 这类嵌套数组）
   * 克隆不了，会抛「An object could not be cloned.」。所以载荷必须是纯数据。
   */
  it('草稿来自 reactive（弹窗真实情形）→ 载荷仍是纯数据，可结构化克隆', () => {
    const draft = toSyllabusDraft(reactive(SYLLABUS))
    draft.branches[0].checked = true
    draft.branches[0].concepts[1].checked = true
    const payload = toSyllabusPayload(draft)
    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload.branches[0].concepts[1].prerequisites).toEqual(['股票'])
  })
})

describe('findDanglingPrereqs（2026-09-25 D1：悬空前置提示）', () => {
  it('前置在方案内有同名落点 → 不报', () => {
    expect(findDanglingPrereqs(SYLLABUS)).toEqual([])
  })

  it('前置没有落点 → 报「概念」的前置「名」；同一缺失名只报一次', () => {
    const s: DlPlanSyllabus = {
      branches: [
        {
          name: 'A 分支',
          concepts: [
            { name: 'X', layer: 1, prerequisites: ['数学基础', 'Y'] },
            { name: 'Y', layer: 0 },
          ],
        },
      ],
    }
    expect(findDanglingPrereqs(s)).toEqual([`「X」的前置「数学基础」`])
  })

  it('前置指向分支名 → 仍算悬空（分支只是目录，不是知识落点）', () => {
    const s: DlPlanSyllabus = {
      branches: [{ name: '数学', concepts: [{ name: 'X', layer: 1, prerequisites: ['数学'] }] }],
    }
    expect(findDanglingPrereqs(s)).toEqual([`「X」的前置「数学」`])
  })

  it('根层知识点的前置同样检查；根层自身可作落点', () => {
    const s: DlPlanSyllabus = {
      branches: [{ name: 'A', concepts: [{ name: 'X', layer: 1, prerequisites: ['R'] }] }],
      rootConcepts: [{ name: 'R', layer: 0 }, { name: 'Z', layer: 2, prerequisites: ['没有的'] }],
    }
    expect(findDanglingPrereqs(s)).toEqual([`「Z」的前置「没有的」`])
  })

  it('名字两侧 trim 后精确匹配（不做子串包含）', () => {
    const s: DlPlanSyllabus = {
      branches: [{ name: 'A', concepts: [{ name: '概率论', layer: 0 }, { name: '贝叶斯', layer: 1, prerequisites: ['概率'] }] }],
    }
    expect(findDanglingPrereqs(s)).toEqual([`「贝叶斯」的前置「概率」`])
  })
})
