/**
 * 分镜 → 角色参考图视角（view）映射（P-A 多视角定妆选图，2026-09-16）
 * @module platform/episode-production/render/keyframe/keyframe-view-mapping
 *
 * 关键帧 collectReferenceImages 给 pickReferenceImage 的 dims 补 view 维度：
 * 由分镜 shotType（景别）+ characters[].facing（朝向）映射到 AssetGallery 派生槽位 label。
 *
 * label 与 AssetGallery.vue 槽位 / character-view-hints 对齐：
 *   main        = 正面全身（主图槽位；main 不参与变体评分，传此值时走兜底主图，语义即正面全身）
 *   front_half  = 正面半身
 *   left_3q     = 左侧半身
 *   right_3q    = 右侧半身
 *   full_left   = 全景左侧
 *   full_right  = 全景右侧
 *
 * 映射规则（design.md P-A）：
 *   - close / extreme_close / detail / medium_close → 半身
 *   - long / extreme_long / full                    → 全身
 *   - facing=left/right 时优先对应侧身槽位（半身→left_3q/right_3q，全身→full_left/full_right）
 *   - medium 等未列景别 / 无 facing → 不映射（返回 undefined，不传 view 维度，保持原评分行为）
 */

const HALF_BODY_SHOT_TYPES = new Set(['close', 'extreme_close', 'detail', 'medium_close'])
const FULL_BODY_SHOT_TYPES = new Set(['long', 'extreme_long', 'full'])

/**
 * 解析角色参考图的 view 槽位 label。
 *
 * @param shotType 分镜景别（ShotType；空/未识别 → undefined）
 * @param facing 分镜角色朝向（'left' / 'right' 触发侧身槽位；其余按正面）
 * @returns 派生槽位 label；无法映射时返回 undefined（调用方不传 view 维度）
 */
export function resolveCharacterViewLabel(
  shotType: string | null | undefined,
  facing: string | null | undefined,
): string | undefined {
  if (!shotType) return undefined
  const half = HALF_BODY_SHOT_TYPES.has(shotType)
  const full = FULL_BODY_SHOT_TYPES.has(shotType)
  if (!half && !full) return undefined
  if (facing === 'left') return half ? 'left_3q' : 'full_left'
  if (facing === 'right') return half ? 'right_3q' : 'full_right'
  // 正面：半身 → front_half；全身 → main（正面全身即主图槽位，走兜底主图命中）
  return half ? 'front_half' : 'main'
}
