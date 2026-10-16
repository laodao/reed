/**
 * 进程内消化活跃注册表（review H5）
 * @module platform/services/kb-brain/liveness
 *
 * 僵死看护原先只看 DB 台账 updated_at——「存活的消化循环必然持续触碰台账」的
 * 前提在章内不成立：单章从 setRunning 到 setDone 之间只有一次 LLM 调用，
 * 64K 输出预算下 15-35min/章是常态，巡检 tick 落进该静默窗就会把活进程的
 * 消化误复位（重复幂等重扫 + 状态闪烁）。
 *
 * 注册表在 run 存续期（启动 → finally）内声明存活，与单章耗时无关；进程死亡
 * 注册表随之消失，DB 侧陈旧判定照常兜底跨进程残留（崩溃/被杀）。
 * automation 与 digest 同进程（Electron main；Web 端不启用 automation），
 * 直接读本模块即可。
 */

const live = new Set<string>()

/** 消化 run 开始时登记（digestDocument 入口；重入安全——幂等集合） */
export function markDigestLive(documentId: string): void {
  live.add(documentId)
}

/** 消化 run 结束时注销（finally；重入安全） */
export function markDigestDone(documentId: string): void {
  live.delete(documentId)
}

/** 看护判活：该文档是否有本进程存续中的消化 run */
export function isDigestLive(documentId: string): boolean {
  return live.has(documentId)
}
