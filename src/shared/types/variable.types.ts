/**
 * 变量与数据表类型（P0 片4：跨运行持久化状态）
 * @module shared/types/variable.types
 */

/** 变量作用域：global=全局 / user=当前用户 / run=运行实例（落库存为 run:<runId>，随实例生灭） */
export const VARIABLE_SCOPES = {
  global: 'global',
  user: 'user',
  run: 'run',
} as const
export type VariableScope = (typeof VARIABLE_SCOPES)[keyof typeof VARIABLE_SCOPES]

/**
 * 运行实例作用域的实际存储键：run:<runId>（复合进 scope 列，零迁移；
 * 同一工作流并行实例各自独享，删除运行级联清理，断点续跑复制到新 run）。
 */
export function runVariableScope(runId: string): string {
  return `run:${runId}`
}

/** 键值变量（wf_variables 表字段同名直出） */
export interface WorkflowVariable {
  id: string
  scope: VariableScope
  key: string
  valueJson: string
  createdAt: Date | null
  updatedAt: Date | null
}

/** 数据表结构列定义 */
export interface DataTableColumn {
  key: string
  label?: string
  type?: 'string' | 'number' | 'boolean' | 'json'
}

/** 数据表定义（wf_data_table_defs 表字段同名直出） */
export interface DataTableDef {
  id: string
  name: string
  columnsJson: string
  createdAt: Date | null
  updatedAt: Date | null
}

/** 数据表行（wf_data_table_rows 表字段同名直出） */
export interface DataTableRow {
  id: string
  tableId: string
  rowJson: string
  createdAt: Date | null
  updatedAt: Date | null
}
