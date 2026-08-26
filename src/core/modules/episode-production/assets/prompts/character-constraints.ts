/**
 * 角色资产生成的硬约束 prompt
 * @module modules/episode-production/assets/prompts/character-constraints
 *
 * 适用范围：角色（character）的"主图"和"派生图"（视角 / 表情 / 服装 / 姿势）。
 * 主图须便于做派生参考，因此对构图作硬性要求；派生图基于主图，沿用同一约束
 * 以保持跨变体的一致性（构图 / 干净背景 / 全身可见）。
 *
 * 双端共用：renderer/api/main-image-generator.ts 与 core 派生 service 都引用本模块。
 */

/**
 * 角色资产生成的 framing 模式：
 *   - 'fullBody'  全身（视角、服装、姿势等派生图）
 *   - 'upperBody' 上半身（表情 — 重点是脸 + 手势，不要求脚到地）
 *   - 'bust'      半身定妆（角色定妆/主图 — 上半身 + 白色背景，供派生参考）
 */
export type CharacterFraming = 'fullBody' | 'upperBody' | 'bust'

/** 共用约束：固定纯白背景 / 光照均匀 / 无阴影（帽子、首饰交由用户自由控制，不再硬约束）。
 * 背景统一为纯白并固定颜色，保证资产的主图与派生图（视角/表情/服装等）背景一致。 */
const COMMON_CONSTRAINT = [
  '纯白背景（pure white background, clean white backdrop, no shadow on background）',
  '光照与参考图保持一致（match lighting from reference, preserve original lighting intensity）',
  '正面均匀光照、无任何阴影（front flat even lighting, shadowless, no shadow on body, no shadow on background, no ground shadow）',
].join('，')

/** framing 文案 */
const FRAMING_SUFFIX: Record<CharacterFraming, string> = {
  fullBody: '直立全身（standing full body, head to toe in frame）',
  upperBody: '上半身（upper body shot, from waist up, head and hands visible）',
  bust: '半身定妆照（bust portrait, upper body shot, head and shoulders visible, waist-up）',
}

/** 半身定妆的背景硬约束：纯白背景（角色定妆基准，便于后期抠图/派生） */
const BUST_BACKGROUND_CONSTRAINT = '纯白背景（pure white background, clean white backdrop, no shadow on background）'

/** 正面 prompt 末尾追加的硬约束（中英双写，提升各家 provider 的命中率） */
export function characterConstraintSuffix(framing: CharacterFraming = 'fullBody'): string {
  const bg = framing === 'bust' ? `${BUST_BACKGROUND_CONSTRAINT}, ${COMMON_CONSTRAINT}` : COMMON_CONSTRAINT
  return `${FRAMING_SUFFIX[framing]}，${bg}`
}

/** 共用 negative：杂背景 / 强烈阴影（帽子、首饰不再禁止，交由用户自由控制） */
const COMMON_NEGATIVE = [
  'busy background',
  'complex background',
  'scenery background',
  // 光照：完全压制阴影（含人物自身投影 / 地面投影 / 墙面投影），拒绝戏剧化光
  'shadow',
  'shadows',
  'cast shadow',
  'ground shadow',
  'floor shadow',
  'wall shadow',
  'body shadow',
  'harsh shadow',
  'dramatic shadow',
  'dark shadow',
  'silhouette',
  'strong directional light',
  'hard light',
  'backlight',
  'rim light',
  'side light',
  'spot light',
  'chiaroscuro',
  'overexposed',
  'underexposed',
]

/** framing 对应的 negative（fullBody 多禁止"半身/特写"，upperBody/bust 不加这条） */
const FRAMING_NEGATIVE: Record<CharacterFraming, string[]> = {
  fullBody: ['cropped', 'half body', 'close-up', 'portrait crop', 'cut off legs'],
  upperBody: ['extreme close-up', 'face only crop'],
  bust: ['full body', 'legs visible', 'cropped head'],
}

/** negative prompt（可与已有 negativePrompt 拼接） */
export function characterConstraintNegative(framing: CharacterFraming = 'fullBody'): string {
  return [...COMMON_NEGATIVE, ...FRAMING_NEGATIVE[framing]].join(', ')
}

/**
 * 把硬约束注入到主 prompt 末尾。已包含约束（重复注入）时不重复追加。
 */
export function appendCharacterConstraints(
  prompt: string,
  framing: CharacterFraming = 'fullBody',
): string {
  const trimmed = (prompt ?? '').trim()
  const suffix = characterConstraintSuffix(framing)
  if (!trimmed) return suffix
  if (trimmed.includes(suffix)) return trimmed
  return `${trimmed}，${suffix}`
}

/**
 * 合并 negative prompt：用户已传的 negative + 角色约束 negative，去重保留次序。
 */
export function mergeCharacterNegative(
  userNegative?: string | null,
  framing: CharacterFraming = 'fullBody',
): string {
  const constraint = characterConstraintNegative(framing)
  const u = (userNegative ?? '').trim()
  if (!u) return constraint
  return `${u}, ${constraint}`
}

/**
 * 由派生 category 决定 framing：
 *   - expression → upperBody（表情图，关注脸和上半身）
 *   - main       → fullBody（正面定妆全身照，供派生参考）
 *   - 其他（view / outfit / pose） → fullBody
 */
export function framingForCategory(category: string): CharacterFraming {
  if (category === 'expression') return 'upperBody'
  return 'fullBody'
}

/**
 * 角色身份保持硬约束（spec 2026-05-09 review）：
 *
 * 用于派生图（基于主图 reference 出 view / expression / outfit / pose 等），
 * 让 AI 在文本侧也有"保持人物特征"的强 anchor，而不是仅依赖 reference image
 * 的视觉相似度。
 *
 * 锚点维度（中英双写）：
 *   - 五官 / 脸型 / 肤色 / 发色发型 / 体型 / 身高 / 整体气质
 *
 * 不约束 outfit（服装可派生时变化）；不约束 expression（同上）；不约束 pose / view。
 *
 * 命名空间隔离：与 appendCharacterConstraints 不冲突；两者可叠加注入。
 */
// spec 2026-05-09 ep-redesign · §3.2 P-1：缩减为极简版（1 锚点 < 30 字 / 3 token）。
// 原版 6 锚点 30+ 词中英双写在 2026 SOTA 模型上是过度工程：
//   - 模型已原生支持多模态参考 + subject embedding
//   - 长文本约束反而稀释 prompt
//   - 与"reference image latent guidance 主导一致性"路径冲突
// 改为 reference image 物理主导；文本只保留最弱的提醒。
const IDENTITY_PRESERVATION_SUFFIX =
  '保持人物身份（preserve character identity）'

const IDENTITY_PRESERVATION_NEGATIVE = [
  'different face',
  'face change',
  'different person',
].join(', ')

/** 把身份保持约束追加到 prompt 末尾（已包含则不重复） */
export function appendCharacterIdentityPreservation(prompt: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return IDENTITY_PRESERVATION_SUFFIX
  if (trimmed.includes(IDENTITY_PRESERVATION_SUFFIX)) return trimmed
  return `${trimmed}，${IDENTITY_PRESERVATION_SUFFIX}`
}

/** 合并身份保持 negative 到现有 negativePrompt */
export function mergeCharacterIdentityNegative(
  userNegative?: string | null,
): string {
  const u = (userNegative ?? '').trim()
  if (!u) return IDENTITY_PRESERVATION_NEGATIVE
  return `${u}, ${IDENTITY_PRESERVATION_NEGATIVE}`
}
