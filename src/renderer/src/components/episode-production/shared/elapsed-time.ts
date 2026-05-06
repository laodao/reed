/**
 * elapsed-time · 相对时间格式化（FU5 通用）
 *
 * 给 LwSyncReminderBanner 用，也可被其他需要"X 分钟/小时/天前"展示的组件复用。
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const MONTH = 30 * DAY

/**
 * 格式化为"刚刚 / N 分钟前 / N 小时前 / N 天前 / yyyy-mm-dd"。
 *
 * 30 天以上回退为本地日期字符串（避免"180 天前"这种不友好提示）。
 *
 * @param ts epoch ms 或 null/undefined
 * @param now 当前时刻（默认 Date.now()，单测可注入）
 */
export function formatElapsed(
  ts: number | null | undefined,
  now: number = Date.now(),
): string {
  if (!ts) return ''
  const diff = now - ts
  if (diff < 0) return '刚刚'
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < MONTH) return `${Math.floor(diff / DAY)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}
