/**
 * 批量操作结果聚合（评审 #56）
 * @module renderer/utils/batch-summary
 * @description 全失败 → error（带首个原因）、部分失败 → warning、全部成功 → success；
 *              供资产图集批量派生等循环调用场景，杜绝"已生成 0 张图"式假成功提示。
 */
export interface BatchResultItem {
  ok: boolean
  error?: string
}

export interface BatchSummary {
  level: 'success' | 'warning' | 'error'
  message: string
}

export function summarizeBatchResults(results: BatchResultItem[]): BatchSummary {
  const ok = results.filter(r => r.ok).length
  const failed = results.length - ok
  if (failed === 0) return { level: 'success', message: `已生成 ${ok} 张图` }
  const firstError = results.find(r => !r.ok)?.error || '未知原因'
  if (ok === 0) return { level: 'error', message: `生成全部失败（${results.length} 项）：${firstError}` }
  return { level: 'warning', message: `成功 ${ok} 张、失败 ${failed} 张（${firstError}）` }
}
