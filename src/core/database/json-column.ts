/**
 * JSON 列安全解析（复核修复 P3-2：仓库层此前在 20+ 个文件各自复制了一份
 * safeParse/safeParseJsonArray，改一处漏一处——`dl-doc.repository.ts` 就是因为
 * 漏改而用裸 JSON.parse，脏数据会让整条查询抛错）。
 *
 * @module core/database/json-column
 * @description 数据库 JSON/JSONB 列在 SQLite 下以 TEXT 存储，历史脏数据或手工改库
 *              都可能写入非法 JSON。读取路径必须容错：解析失败降级为调用方给的
 *              兜底值并记日志，绝不让单行坏数据拖垮整个列表查询。
 */

import { createLogger } from '@core/utils/logger'

const logger = createLogger('json-column')

/**
 * 安全解析 JSON 字符串。
 *
 * @param raw      原始列值（null/空串直接返回兜底值）
 * @param fallback 解析失败或为空时返回的兜底值
 * @param context  定位信息（建议传 `实体名#字段名`），仅在失败时用于日志
 * @returns 解析结果；任何异常都降级为 fallback
 */
export function safeParseJson<T>(raw: string | null | undefined, fallback: T, context = ''): T {
  if (raw === null || raw === undefined || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch (e) {
    logger.warn(
      `JSON 列解析失败，已降级${context ? `（${context}）` : ''}: ${e instanceof Error ? e.message : String(e)}`,
    )
    return fallback
  }
}

/**
 * 安全解析 JSON 数组列，非数组结果同样降级。
 *
 * @param raw     原始列值
 * @param context 定位信息
 * @returns 解析出的数组；非数组/非法 JSON 一律返回空数组
 */
export function safeParseJsonArray<T = unknown>(
  raw: string | null | undefined,
  context = '',
): T[] {
  const parsed = safeParseJson<unknown>(raw, null, context)
  return Array.isArray(parsed) ? (parsed as T[]) : []
}

/**
 * 安全解析 JSON 对象列，非对象结果同样降级。
 *
 * @param raw     原始列值
 * @param context 定位信息
 * @returns 解析出的普通对象；非法 JSON/数组/null 一律返回 null
 */
export function safeParseJsonObject<T = Record<string, unknown>>(
  raw: string | null | undefined,
  context = '',
): T | null {
  const parsed = safeParseJson<unknown>(raw, null, context)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as T
}