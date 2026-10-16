/**
 * 讲义内部核验规则（M4-UX2；纯函数，不向用户展示）
 * @module packs/domain-learning/rules/learning-verify.rules
 *
 * 核验会话产出为模型 JSON 文本:解析→归一化→按 issues 推导内部状态:
 * - 任一 verdict='unsupported' → needs_review;
 * - 否则(全 supported / 无存疑) → verified;
 * - 无法解析/会话失败 → null(保持未核验),由调用方记日志。
 * 状态只用于后端质量提升(内部),UI 不展示细节。
 */

import type { DlCardVerification, DlVerificationStatus, DlVerificationIssue } from '@shared/types/domain-learning.types'

const STATUSES: DlVerificationStatus[] = ['unverified', 'verifying', 'verified', 'needs_review']

/** 派生内部状态(依据 issues 中是否存在 unsupported 存疑) */
export function deriveVerificationStatus(issues: DlVerificationIssue[]): DlVerificationStatus {
  return issues.some((i) => i.verdict === 'unsupported') ? 'needs_review' : 'verified'
}

/** 剥离 ```json 围栏后取首个 JSON 对象文本 */
export function extractJsonObject(raw: string): string | null {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return clean.slice(start, end + 1)
}

/** 解析核验会话输出;失败返回 null(调用方记日志,卡片保持未核验) */
export function parseVerifyOutcome(raw: string | null | undefined, checkedAt: Date = new Date()): DlCardVerification | null {
  if (!raw) return null
  const text = extractJsonObject(raw)
  if (!text) return null
  try {
    const v = JSON.parse(text) as { status?: string; issues?: unknown; note?: string }
    const issues = Array.isArray(v.issues)
      ? (v.issues as DlVerificationIssue[]).filter((i) => i && typeof i === 'object' && ['supported', 'unsupported', 'needs_review'].includes(i.verdict))
      : []
    const status = STATUSES.includes(v.status as DlVerificationStatus) ? (v.status as DlVerificationStatus) : deriveVerificationStatus(issues)
    return {
      status,
      issues,
      checkedAt: checkedAt.toISOString(),
      note: typeof v.note === 'string' ? v.note : null,
    }
  } catch {
    return null
  }
}
