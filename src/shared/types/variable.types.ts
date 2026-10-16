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

/**
 * 数据表作用域（2026-10-08 应用数据层）：
 * - workflow：全局命名空间（历史语义，insert 按名自动建表）
 * - app：按 owner 隔离——owner_id = workflow_definition_id（一个 definition 至多一个 app，
 *   故等价于按应用隔离；发布新版本 definition id 不变、数据延续）
 */
export const DATA_TABLE_SCOPES = {
  workflow: 'workflow',
  app: 'app',
} as const
export type DataTableScope = (typeof DATA_TABLE_SCOPES)[keyof typeof DATA_TABLE_SCOPES]

/** 数据表定义（wf_data_table_defs 表字段同名直出） */
export interface DataTableDef {
  id: string
  name: string
  columnsJson: string
  /** 作用域（历史行缺省 = workflow） */
  scope?: DataTableScope
  /** scope='app' 时的属主（= workflow_definition_id）；workflow 作用域为 null */
  ownerId?: string | null
  /** upsert 去重键数组（JSON 字符串，如 ["url"]；建表时锁定） */
  dedupKeysJson?: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

/** 数据表行（wf_data_table_rows 表字段同名直出） */
export interface DataTableRow {
  id: string
  tableId: string
  rowJson: string
  /** 按表 dedup_keys 列值计算的 sha256（有去重键的表用于唯一判定；否则 null） */
  dedupHash?: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

/** 去重键列值的规范化载荷（键排序、值 JSON 序列化）；sha256 由 core 侧追加计算 */
export function canonicalDedupPayload(dedupKeys: string[], row: Record<string, unknown>): string | null {
  if (!dedupKeys.length) return null
  const parts: string[] = []
  for (const k of [...dedupKeys].sort()) {
    const v = row[k]
    if (v === undefined || v === null) return null // 去重键缺值 = 不参与 upsert 判定（insert 语义）
    parts.push(`${k}=${JSON.stringify(v)}`)
  }
  return parts.join('|')
}

/** 行查询过滤条件（内存过滤；V1 表达力=字段包含，对齐应用侧关键字搜索） */
export interface DataTableQueryFilter {
  field?: string
  contains?: string
}
