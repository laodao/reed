/**
 * 领域共学：知识体系方案的「草稿 ↔ 载荷」纯函数（2026-09-13 用户需求）
 * @module shared/utils/domain-learning-plan-draft
 *
 * 确认弹窗里用户能做的两件事——**取消勾选**（不生成）与**调序**（影响学习路径）——
 * 都只是对草稿的操作；真正落回后端的载荷由 `toSyllabusPayload` 生成。
 * 抽成纯函数以便直测：勾掉的必须真的消失、顺序必须按用户调整后的走、空分支要丢掉
 * （否则又会落出一个没有子知识点的分支——上一版「投资与配置」的问题）。
 *
 * 2026-09-25 D2：草稿升级为完整方案形状（branches + **rootConcepts** + notes）——
 * 此前 toSyllabusDraft/toSyllabusPayload 只处理 branches，模型提交的根层知识点在弹窗里
 * 不可见、确认后从载荷里静默消失（落库额度与清单随之缩水）。
 *
 * 另一条硬约束：载荷必须是**纯数据**。弹窗里草稿来自 `ref`，读出来的是 Vue reactive 代理，
 * 而载荷要经 `ipcRenderer.invoke` 的结构化克隆送到主进程——代理克隆不了，会抛
 * 「An object could not be cloned.」（2026-09-14 实测：`prerequisites` 这类嵌套数组直接透传即崩）。
 * 故本模块只输出普通对象与普通数组，代理一律复制、不外泄。
 */

import type { DlPlanSyllabus, DlSyllabusConcept } from '../types/domain-learning.types'

/** 草稿里的知识点（带勾选态） */
export interface SyllabusDraftConcept extends DlSyllabusConcept {
  checked: boolean
}

/** 草稿里的分支（带勾选态 + 稳定 key：重排时 Vue 列表不能错位） */
export interface SyllabusDraftBranch {
  key: string
  name: string
  definitionShort?: string | null
  checked: boolean
  concepts: SyllabusDraftConcept[]
}

/** 完整方案草稿（2026-09-25：含根层知识点与方案说明，与载荷同构） */
export interface SyllabusDraft {
  branches: SyllabusDraftBranch[]
  rootConcepts: SyllabusDraftConcept[]
  notes: string | null
}

/** 方案 → 草稿（默认全部勾选，顺序按方案） */
export function toSyllabusDraft(syllabus: DlPlanSyllabus | null | undefined): SyllabusDraft {
  return {
    branches: (syllabus?.branches ?? []).map((b, i) => ({
      key: `${i}-${b.name}`,
      name: b.name,
      definitionShort: b.definitionShort ?? null,
      checked: true,
      concepts: (b.concepts ?? []).map((c) => ({ ...c, checked: true })),
    })),
    rootConcepts: (syllabus?.rootConcepts ?? []).map((c) => ({ ...c, checked: true })),
    notes: syllabus?.notes ?? null,
  }
}

/**
 * 草稿 → 用户确认后的载荷（**纯数据**，可安全结构化克隆过 IPC）。
 * - 取消勾选的分支/知识点/根层知识点被剔除；
 * - 勾着但知识点全被取消的分支会被丢掉（不留空分支）；
 * - 顺序完全按草稿（= 用户调序结果）；
 * - 嵌套数组（prerequisites）复制成新数组：草稿里的数组可能是 reactive 代理，透传会导致 IPC 克隆失败。
 */
export function toSyllabusPayload(draft: SyllabusDraft): DlPlanSyllabus {
  const branches = draft.branches
    .filter((b) => b.checked)
    .map((b) => ({
      name: b.name,
      definitionShort: b.definitionShort ?? null,
      concepts: b.concepts
        .filter((c) => c.checked)
        .map((c) => ({
          name: c.name,
          definitionShort: c.definitionShort ?? null,
          prerequisites: [...(c.prerequisites ?? [])],
          layer: c.layer ?? 0,
          nodeType: c.nodeType ?? 'concept',
        })),
    }))
    .filter((b) => b.concepts.length > 0)
  const rootConcepts = draft.rootConcepts
    .filter((c) => c.checked)
    .map((c) => ({
      name: c.name,
      definitionShort: c.definitionShort ?? null,
      prerequisites: [...(c.prerequisites ?? [])],
      layer: c.layer ?? 0,
      nodeType: c.nodeType ?? 'concept',
    }))
  return { branches, rootConcepts, notes: draft.notes }
}

/** 列表内移动一项（上移/下移；越界返回原数组的新副本，便于直接赋值） */
export function moveItem<T>(list: T[], from: number, delta: number): T[] {
  const next = [...list]
  const to = from + delta
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** 草稿里被勾选的知识点数（分支下 + 根层；按钮文案「生成这 N 个知识点」用） */
export function countCheckedConcepts(draft: SyllabusDraft): number {
  return (
    draft.branches.reduce((n, b) => n + b.concepts.filter((c) => c.checked).length, 0) +
    draft.rootConcepts.filter((c) => c.checked).length
  )
}

/**
 * 找出方案里"声明了前置但在方案内没有同名落点"的条目（2026-09-25 D1）。
 * 精确名匹配（两侧 trim）；分支名不算落点（它只是目录）。
 * 后端 normalizePlanSyllabus 用它记 changes（非阻断），确认弹窗用它渲染 ⚠️ 提示——
 * 一处实现、两端共用，口径不漂。
 */
export function findDanglingPrereqs(syllabus: Pick<DlPlanSyllabus, 'branches' | 'rootConcepts'>): string[] {
  const known = new Set<string>()
  for (const c of syllabus.rootConcepts ?? []) known.add(c.name.trim())
  for (const b of syllabus.branches ?? []) for (const c of b.concepts ?? []) known.add(c.name.trim())
  const out: string[] = []
  const seen = new Set<string>()
  const check = (c: DlSyllabusConcept): void => {
    for (const p of c.prerequisites ?? []) {
      const name = p.trim()
      if (!name || known.has(name) || seen.has(name)) continue
      seen.add(name)
      out.push(`「${c.name}」的前置「${name}」`)
    }
  }
  for (const c of syllabus.rootConcepts ?? []) check(c)
  for (const b of syllabus.branches ?? []) for (const c of b.concepts ?? []) check(c)
  return out
}
