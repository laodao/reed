/**
 * 物品资产生成的硬约束 prompt（spec 2026-05-09 review）
 * @module modules/episode-production/assets/prompts/item-constraints
 *
 * 物品（item）资产的主图与派生图（view / context 等）共用约束。
 * 与 character / location 类似，这里把"干净背景 / 单一物体居中 / 无文本水印"等
 * 通用规则收口到一个模块，避免每个调用方各自拼。
 *
 * 派生时额外注入身份保持：保持物品的形状 / 材质 / 标志特征 / 比例。
 *
 * 双端共用：core 包，不依赖 fs / browser API。
 */

/** 通用硬约束：纯色背景、居中、无文本 */
const ITEM_CONSTRAINT_SUFFIX = [
  '物品居中清晰呈现（item centered in frame, full object visible, well-lit, sharp focus）',
  '纯色背景（plain solid color background, no scenery, no environment）',
  '无文字、无水印、无 logo（no text, no watermark, no logo, no signature）',
  '正面均匀光照、无强烈阴影（front flat even lighting, soft shadows only, no harsh shadow）',
].join('，')

const ITEM_CONSTRAINT_NEGATIVE = [
  'busy background',
  'complex background',
  'scenery background',
  'multiple objects',
  'cluttered',
  'text',
  'watermark',
  'logo',
  'signature',
  'caption',
  'human hand holding',
  'person in frame',
  'harsh shadow',
  'dramatic shadow',
  'overexposed',
  'underexposed',
  'cropped',
  'cut off',
].join(', ')

export function appendItemConstraints(prompt: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return ITEM_CONSTRAINT_SUFFIX
  if (trimmed.includes(ITEM_CONSTRAINT_SUFFIX)) return trimmed
  return `${trimmed}，${ITEM_CONSTRAINT_SUFFIX}`
}

export function mergeItemNegative(userNegative?: string | null): string {
  const u = (userNegative ?? '').trim()
  if (!u) return ITEM_CONSTRAINT_NEGATIVE
  return `${u}, ${ITEM_CONSTRAINT_NEGATIVE}`
}

/**
 * 派生场景下注入身份保持：保形状 / 材质 / 标志特征 / 比例。
 * 用于派生图（基于主图 ref），让 AI 在文本侧也有"保持物品特征"的强 anchor。
 */
// spec 2026-05-09 ep-redesign · §3.2 P-1：与 character 同步缩减。
// 原版 6 锚点 / 13 词 negative 在 2026 SOTA 模型上属过度工程；让 reference image 主导。
const ITEM_IDENTITY_PRESERVATION_SUFFIX =
  '保持物品身份（preserve item identity）'

const ITEM_IDENTITY_PRESERVATION_NEGATIVE = [
  'different object',
  'shape change',
  'different material',
].join(', ')

export function appendItemIdentityPreservation(prompt: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return ITEM_IDENTITY_PRESERVATION_SUFFIX
  if (trimmed.includes(ITEM_IDENTITY_PRESERVATION_SUFFIX)) return trimmed
  return `${trimmed}，${ITEM_IDENTITY_PRESERVATION_SUFFIX}`
}

export function mergeItemIdentityNegative(userNegative?: string | null): string {
  const u = (userNegative ?? '').trim()
  if (!u) return ITEM_IDENTITY_PRESERVATION_NEGATIVE
  return `${u}, ${ITEM_IDENTITY_PRESERVATION_NEGATIVE}`
}
