/**
 * 信息搜集界面共享纯函数（时间格式化 / 状态→徽标映射 / 统计文案）
 * @module views/info-collection/ic-ui
 * @description Home 与详情页、各 tab 组件共用的展示映射。全部纯函数，可直测。
 */

/** El-tag 的 type 取值（element-plus 不导出该字面量联合，这里本地收窄） */
export type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

/** 统一入口：ISO 字符串 / Date（IPC 结构化克隆会传回 Date）→ 'YYYY-MM-DD HH:mm' */
export function shortTime(iso: string | Date | null | undefined, fallback = '—'): string {
  const s = normalizeIso(iso)
  return s ? s.slice(0, 16).replace('T', ' ') : fallback
}

/** 相对时间：刚刚 / N 分钟前 / 今天 HH:mm / 昨天 HH:mm / MM-DD HH:mm / 更早 YYYY-MM-DD */
export function relativeTime(iso: string | Date | null | undefined, now: Date = new Date()): string {
  const s = normalizeIso(iso)
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 24 * 60 * 60_000) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (diffMs < 48 * 60 * 60_000) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (diffMs < 365 * 24 * 60 * 60_000) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return s.slice(0, 10)
}

/** 任务/来源耗时：两个时间点差 → '45 秒' / '3 分 12 秒' / '1 时 04 分'；缺时间为 null */
export function durationText(startIso: string | Date | null | undefined, endIso: string | Date | null | undefined): string | null {
  const a = normalizeIso(startIso)
  const b = normalizeIso(endIso)
  if (!a || !b) return null
  const secs = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000))
  if (secs < 60) return `${secs} 秒`
  if (secs < 3600) return `${Math.floor(secs / 60)} 分 ${pad(secs % 60)} 秒`
  return `${Math.floor(secs / 3600)} 时 ${pad(Math.floor((secs % 3600) / 60))} 分`
}

/** 任务状态 → 徽标色 */
export function taskTagType(status: string): TagType {
  if (status === 'done' || status === 'reviewing') return 'success'
  if (status === 'running' || status === 'pending') return 'warning'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  return 'info'
}

/** 任务状态 → 中文文案 */
export function taskStatusText(status: string): string {
  const map: Record<string, string> = {
    pending: '排队中',
    running: '搜集中',
    reviewing: '整理中',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return map[status] ?? status
}

/** 来源分级 T1-T4 → 徽标色（T1 官方机构最可信） */
export function tierTagType(tier: number | null | undefined): TagType {
  if (tier === 1) return 'success'
  if (tier === 2) return 'primary'
  if (tier === 3) return 'warning'
  if (tier === 4) return 'danger'
  return 'info'
}

/** 抓取状态 → 徽标色 */
export function fetchTagType(status: string): TagType {
  if (status === 'ok') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'blocked' || status === 'failed') return 'danger'
  return 'info'
}

/** 条目状态 → 徽标色：superseded 用 danger（被新数据取代）、stale 用 warning（可能过期） */
export function rowTagType(status: string): TagType {
  if (status === 'confirmed') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'stale') return 'warning'
  return 'info'
}

/** 条目状态 → 中文文案 */
export function rowStatusText(status: string): string {
  const map: Record<string, string> = {
    draft: '待审',
    confirmed: '已确认',
    superseded: '已取代',
    stale: '可能过期',
  }
  return map[status] ?? status
}

/** 信息需求优先级 → 徽标色 */
export function reqTagType(priority: string): TagType {
  if (priority === 'must') return 'danger'
  if (priority === 'should') return 'primary'
  return 'info'
}

/** 维度对象 → 'k=v，k=v' 文案 */
export function dimsText(dims: Record<string, unknown> | null | undefined): string {
  if (!dims || Object.keys(dims).length === 0) return '—'
  return Object.entries(dims)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('，')
}

/** 覆盖率 0-1 → '87%'；缺省 '—' */
export function percentText(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—'
  return `${Math.round(ratio * 100)}%`
}

/** 统一资产概要 → 徽标文案（'PDF · 1.2MB'；无资产返回空串） */
export function assetBadge(
  asset: { name: string; kind: string; mimeType: string | null; sizeBytes: number | null } | null | undefined,
): string {
  if (!asset) return ''
  const m = asset.name.match(/\.([a-z0-9]{1,5})$/i)
  const ext = m ? m[1].toUpperCase() : (asset.mimeType?.split('/')[1] ?? 'FILE').toUpperCase()
  const b = asset.sizeBytes
  const size = b
    ? b >= 1024 * 1024
      ? `${(b / 1024 / 1024).toFixed(1)}MB`
      : `${Math.max(1, Math.round(b / 1024))}KB`
    : ''
  return size ? `${ext} · ${size}` : ext
}

function normalizeIso(iso: string | Date | null | undefined): string | null {
  if (!iso) return null
  if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso.toISOString()
  return typeof iso === 'string' ? iso : String(iso)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
