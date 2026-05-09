/**
 * 全局镜头编号工具（spec 2026-05-09 ep-redesign §3.2 B5b · P-15）
 *
 * 格式：EP{episodeNumber:02}_S{sceneIndex+1:02}_SH{shotNumber:02}
 * 例：EP01_S03_SH04
 *
 * 用于 ④ 分镜 / ⑤ 制作 / ⑥ 合成 三个 stage 显示，便于跨分镜引用 / 团队沟通。
 *
 * 双母语：
 *   大众用户：清晰可读的全局编号
 *   专业用户：电影行业标准 shot ID 格式
 */

export interface FormatGlobalShotIdInput {
  /** 剧集序号（1-based）；缺省 → 默认 1（兼容历史 episode 无 episodeNumber 的情况） */
  episodeNumber?: number | null
  /** 场景索引（0-based） */
  sceneIndex: number
  /** 分镜号（1-based） */
  shotNumber: number
}

/**
 * 格式化全局镜头编号。
 *
 * 大数字不截断（episodeNumber=100 → EP100_S100_SH100），padStart(2, '0') 仅对 < 99 的数字补 0。
 */
export function formatGlobalShotId(input: FormatGlobalShotIdInput): string {
  const ep = String(input.episodeNumber ?? 1).padStart(2, '0')
  const sc = String(input.sceneIndex + 1).padStart(2, '0')
  const sh = String(input.shotNumber).padStart(2, '0')
  return `EP${ep}_S${sc}_SH${sh}`
}
