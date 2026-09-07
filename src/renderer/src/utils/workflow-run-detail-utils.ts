/**
 * 工作流运行详情页共用展示工具（前端）
 * @module renderer/utils/workflow-run-detail-utils
 * @description 供运行详情页及新组件（只读图/环节详情/历史输出物）复用的小型格式化函数，
 *              与 WorkflowRunsHistory.vue 内的展示逻辑保持一致，避免各组件各写一份。
 */

/** 运行/节点状态 → Element Plus tag type（节点状态细分更多）；'error' 用于日志行错误级 */
export type EpTagType = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'error'

/** 运行状态中文标签 */
export const RUN_STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '运行中',
  waiting_review: '待审核',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  skipped: '跳过',
  timed_out: '超时',
}

/** 节点运行状态 → tag type */
export function nodeStatusTag(s: string | null | undefined): EpTagType {
  if (s === 'succeeded') return 'success'
  if (s === 'failed' || s === 'timed_out') return 'danger'
  if (s === 'failed_recovered') return 'warning'
  if (s === 'running' || s === 'waiting_review') return 'primary'
  return 'info'
}

/** 运行状态 → tag type */
export function runStatusTag(s: string | null | undefined): EpTagType {
  if (s === 'succeeded') return 'success'
  if (s === 'failed' || s === 'timed_out') return 'danger'
  if (s === 'running' || s === 'pending') return 'warning'
  return 'info'
}

/** runId 缩写展示（前 10 位） */
export function abbrevRunId(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length > 10 ? `${id.slice(0, 10)}…` : id
}

/** 时间格式化（本地化完整时间） */
export function formatRunTime(t: string | number | null | undefined): string {
  if (!t) return '—'
  const d = new Date(String(t))
  return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString('zh-CN')
}

/** 毫秒 → 人类可读时长 */
export function formatRunDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(Number(ms))) return '—'
  const m = Number(ms)
  if (m < 1000) return m <= 0 ? '0s' : `${Math.round(m)}ms`
  if (m < 60_000) return `${(m / 1000).toFixed(1)}s`
  return `${Math.floor(m / 60_000)}m${Math.round((m % 60_000) / 1000)}s`
}

/** 日志行 level → tag type */
export function logLineTag(level: string | null | undefined): EpTagType {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warning'
  return 'info'
}

/** 日志时间（时分秒） */
export function formatLogTs(ts: string | number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(String(ts))
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleTimeString('zh-CN', { hour12: false })
}

/** HTML 转义（日志详情/报告用） */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * JSON 展示为可读文本。
 * 文件类输入 {path,name,text} → 显示「[文件] 名称」，避免大对象刷屏。
 */
export function formatJsonText(v: unknown, maxChars = 20_000): string {
  if (v === undefined || v === null) return ''
  const pretty = JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && typeof val.path === 'string' && typeof val.name === 'string' && 'text' in val) {
      return `[文件] ${val.name}`
    }
    return val
  }, 2)
  return pretty && pretty.length > maxChars ? `${pretty.slice(0, maxChars)}\n…（已截断）` : pretty
}
