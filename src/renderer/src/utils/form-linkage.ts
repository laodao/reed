/**
 * 表单声明式联动（纯函数，通用机制）
 * @module renderer/utils/form-linkage
 * @description 按字段的 linkage 声明（{ watch, matchBy }）计算联动填充值：
 * 监听字段（watch）值变化时，本字段自动填充所有"选项元数据[matchBy] === 监听值"的选项。
 * 表单引擎（RunInputForm）只调用本工具，不感知具体业务字段名——
 * 联动关系由工作流 start 输入的字段声明（linkage）驱动。
 */

/** 联动选项的最小结构（选项可携带任意元数据，如 select-dynamic 的 topicId） */
export interface LinkageOption {
  value: string
  label?: string
  [key: string]: unknown
}

/** 联动声明（与 WorkflowStartInput.linkage 一致） */
export interface LinkageDeclaration {
  /** 被监听的字段 key（其值作为过滤条件） */
  watch: string
  /** 选项元数据中与监听值比较的属性名 */
  matchBy: string
}

/**
 * 计算联动填充值：返回所有匹配选项的 value（顺序按选项顺序）。
 * - 监听值为空 → 返回空数组（联动字段应清空）
 * - 无匹配 → 空数组
 */
export function resolveLinkageValues(
  linkage: LinkageDeclaration,
  watchValue: unknown,
  options: LinkageOption[],
): string[] {
  if (watchValue === undefined || watchValue === null || watchValue === '') return []
  const target = String(watchValue)
  return options
    .filter(o => o[linkage.matchBy] !== undefined && o[linkage.matchBy] !== null && String(o[linkage.matchBy]) === target)
    .map(o => o.value)
}

/**
 * 生成联动后的字段值：
 * - multi：匹配的全部 value（数组）
 * - 单选：首个匹配 value（无匹配 → undefined）
 */
export function linkageFieldValue(
  linkage: LinkageDeclaration,
  watchValue: unknown,
  options: LinkageOption[],
  multi: boolean | undefined,
): string | string[] | undefined {
  const values = resolveLinkageValues(linkage, watchValue, options)
  if (multi) return values
  return values[0] ?? undefined
}
