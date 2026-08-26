/**
 * 统一占位符解析（跨驱动方言归一）
 * @module core/modules/workflow/datasource/placeholder-utils
 * @description
 * 统一约定：工作流「数据表」节点 / Agent 生成的 SQL 一律用 $1,$2,... 占位符，
 * 由各驱动适配器翻译成自己的方言（MySQL ? / SQLServer @pn / ClickHouse {pn:Type}）。
 * 本模块提供共享解析：扫描 $n 并回调渲染，同时按编号收集参数值（支持乱序 $2,$1）。
 */

/**
 * 解析 SQL 中的 $n 占位符。
 * @param sqlText 原始 SQL（$1,$2,... 占位符）
 * @param parameters 参数值数组（下标 0 对应 $1）
 * @param render 渲染函数：(占位编号, 参数值) → 方言占位符文本
 * @returns { sql: 渲染后的 SQL；orderedValues: 按占位符**出现顺序**收集的参数值（MySQL ? 用）；
 *           usedIndices: 用到的编号集合（缺参检测用） }
 */
export function replaceDollarPlaceholders(
  sqlText: string,
  parameters: ReadonlyArray<unknown>,
  render: (index: number, value: unknown) => string,
): { sql: string; orderedValues: unknown[]; usedIndices: number[] } {
  const orderedValues: unknown[] = []
  const usedIndices: number[] = []
  const sql = sqlText.replace(/\$(\d+)/g, (_m, numStr) => {
    const index = Number(numStr)
    usedIndices.push(index)
    orderedValues.push(parameters[index - 1])
    return render(index, parameters[index - 1])
  })
  return { sql, orderedValues, usedIndices }
}
