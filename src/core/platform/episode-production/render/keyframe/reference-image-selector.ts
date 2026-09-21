/**
 * 关键帧参考图选择器（spec §3.4 + §4.5 · P5-T6）
 * @module platform/episode-production/render/keyframe/reference-image-selector
 *
 * 输入：分镜消费的资产 binding + 当前场景维度（角色 view/expression/outfit/pose
 *       或地点 time/weather/angle 或物品 view/context）。
 * 输出：从 asset_image 表中按评分挑最匹配的变体；找不到匹配变体兜底用主图；都没有 → null。
 *
 * 选图策略（B4 · 2026-09-20 人物一致性修复）：
 *   - character：confirmed 池内优先 is_main=1 主图（角色身份权威锚点）；
 *     无主图 / 主图无实际图片时才按维度评分挑 view 等变体作补充
 *   - location / item：维持评分规则（见下），主图兜底
 *
 * 评分规则（spec §3.4 + §4.5）：
 *   角色 character：  view +4 / expression +3 / outfit +2 / pose +1
 *   地点 location：   angle +4 / time +2 / weather +1
 *   物品 item：       view +3 / context +1
 *
 * 解析 asset_image.metadata（text JSON）取变体维度；解析失败按"无 metadata"处理（不计分）。
 *
 * 纯计算 + 一次 listByAsset 查询；不直接 touch typeorm 而是通过传入的
 * AssetImageService（或 mock）取图，便于单测。
 */

import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import type { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'

/** 角色维度 */
export interface CharacterPickDims {
  /** 角色面部朝向（front / left / right / back / three_quarter_*） */
  view?: string
  /** 表情（happy / sad / angry / ...） */
  expression?: string
  /** 服装标签（formal / casual / battle / ...） */
  outfit?: string
  /** 姿态（standing / sitting / fighting / ...） */
  pose?: string
}

/** 地点维度（与 location-asset.service.pickBestVariant 一致） */
export interface LocationPickDims {
  /** 时间段（morning / noon / afternoon / evening / night / dawn / dusk） */
  time?: string
  /** 天气（sunny / rainy / cloudy / snow / ...） */
  weather?: string
  /** 角度（front / wide / overhead / ...） */
  angle?: string
}

/** 物品维度 */
export interface ItemPickDims {
  /** 视角（front / side / detail / ...） */
  view?: string
  /** 使用场景（held / on_table / on_shelf / ...） */
  context?: string
}

export type ReferencePickInput =
  | { kind: 'character'; bindingId: string; dims: CharacterPickDims }
  | { kind: 'location'; bindingId: string; dims: LocationPickDims }
  | { kind: 'item'; bindingId: string; dims: ItemPickDims }

/** 单帧打分明细，用于调试 / UI 显示选中原因 */
export interface PickResult {
  /** 选中的图（可能是变体，也可能是兜底主图） */
  image: AssetImageEntity | null
  /** 是否走兜底（fallback 到主图） */
  fellBackToMain: boolean
  /** 命中分数（兜底主图记 0） */
  score: number
  /** 命中的字段（如 ['view', 'expression']），便于 UI 展示"为什么选这张" */
  matchedFields: string[]
}

interface VariantMetadata {
  view?: unknown
  expression?: unknown
  outfit?: unknown
  pose?: unknown
  time?: unknown
  weather?: unknown
  angle?: unknown
  context?: unknown
}

/**
 * 给定一个资产引用 + 维度，挑最匹配的 asset_image。
 *
 * @param imageSvc 注入的 AssetImageService（或 mock，便于单测）
 * @param input 资产 + 维度
 * @returns 选中结果（含命中字段与分数）；资产无图时 image=null
 */
export async function pickReferenceImage(
  imageSvc: Pick<AssetImageService, 'listByAsset' | 'getMainImage'>,
  input: ReferencePickInput,
): Promise<PickResult> {
  const all = await imageSvc.listByAsset(input.kind, input.bindingId)
  /*
   * S-05 定妆确认闸门（2026-09-17）：只有 confirmed=1 的图参与选图。
   * 老数据兼容兜底：该资产一张 confirmed 图都没有时，回退 is_main=1 主图并 warn
   * （迁移 add-asset-image-confirmed 已把存量 is_main=1 回填 confirmed=1，
   *  正常不会走到；走到说明数据未迁移/异常，至少不让老剧集断供参考图）。
   */
  let pool = all.filter((img) => (img as unknown as { confirmed?: number }).confirmed === 1)
  if (pool.length === 0) {
    const legacyMain = all.find((img) => img.isMain === 1)
    if (legacyMain) {
      console.warn(
        `[reference-image-selector] ${input.kind}:${input.bindingId} 无 confirmed 定妆图，` +
          `回退 is_main 主图（老数据兼容兜底）`,
      )
      pool = [legacyMain]
    }
  }
  const defaultMain = pool.find((img) => img.isMain === 1) ?? null

  /*
   * B4 选图策略 main 优先（2026-09-20，人物一致性修复）：
   *   角色类资产在 confirmed 池内优先 is_main=1 主图——主图是角色身份的唯一权威锚点，
   *   在风格曾分叉的资产池里评分挑图会让同一角色的不同关键帧选到 Q版 main /
   *   写实 view 不同版本。view / expression 等变体图仅在无主图（或主图无实际图片）
   *   时作补充，走下方既有评分逻辑。location / item 维持现有评分逻辑不变。
   */
  if (input.kind === 'character' && defaultMain && defaultMain.imagePath) {
    return { image: defaultMain, fellBackToMain: true, score: 0, matchedFields: [] }
  }

  /*
   * spec 2026-05-09 location 多主图模型：
   *   - 主图（category='main'）也带 metadata，参与评分；带 angle / time 等命中维度的主图可以被
   *     直接选中，省一次派生（"正面外景"主图直接命中外景分镜）
   *   - floor_plan（2026-09-21 平面布局图）是主图生成的布局参考，不是场景真实视角图，
   *     不进候选池，避免平面图被选中当场景参考
   * character / item 仍走旧逻辑（只有非主图变体参评，主图兜底）。
   */
  const candidates =
    input.kind === 'location'
      ? pool.filter((img) => img.category !== 'floor_plan') // 所有图（含主图）参评，排除平面图
      : pool.filter((img) => img.isMain !== 1) // 老逻辑：仅非主图

  let best: { image: AssetImageEntity; score: number; matchedFields: string[] } | null = null
  for (const img of candidates) {
    const meta = parseMetadata(img.metadata)
    /*
     * P-A 视角对齐（2026-09-16）：AssetGallery 派生槽位图（front_half / left_3q /
     * right_3q / full_left / full_right）落库时视角写在 label 列而非 metadata.view，
     * metadata.view 缺失时用 label 补齐 view 维度，让 dims.view 能命中派生槽位图。
     * metadata.view 有值时优先（用户手工标注的维度信息权威）。
     */
    if (meta.view === undefined && img.label) meta.view = img.label
    const evaluation = scoreVariant(input, meta)
    if (evaluation.score > 0) {
      if (!best || evaluation.score > best.score) {
        best = {
          image: img,
          score: evaluation.score,
          matchedFields: evaluation.matchedFields,
        }
      }
    }
  }

  if (best) {
    return {
      image: best.image,
      fellBackToMain: false,
      score: best.score,
      matchedFields: best.matchedFields,
    }
  }
  // 兜底默认主图（isMain=1）
  if (defaultMain) {
    return { image: defaultMain, fellBackToMain: true, score: 0, matchedFields: [] }
  }
  return { image: null, fellBackToMain: false, score: 0, matchedFields: [] }
}

/**
 * 针对一个变体图打分（pure function · 无 IO，便于单测）。
 *
 * 分数：见模块顶部规则。
 */
export function scoreVariant(
  input: ReferencePickInput,
  meta: VariantMetadata,
): { score: number; matchedFields: string[] } {
  const matchedFields: string[] = []
  let score = 0

  if (input.kind === 'character') {
    const d = input.dims
    if (d.view && meta.view === d.view) {
      score += 4
      matchedFields.push('view')
    }
    if (d.expression && meta.expression === d.expression) {
      score += 3
      matchedFields.push('expression')
    }
    if (d.outfit && meta.outfit === d.outfit) {
      score += 2
      matchedFields.push('outfit')
    }
    if (d.pose && meta.pose === d.pose) {
      score += 1
      matchedFields.push('pose')
    }
  } else if (input.kind === 'location') {
    const d = input.dims
    if (d.angle && meta.angle === d.angle) {
      score += 4
      matchedFields.push('angle')
    }
    if (d.time && meta.time === d.time) {
      score += 2
      matchedFields.push('time')
    }
    if (d.weather && meta.weather === d.weather) {
      score += 1
      matchedFields.push('weather')
    }
  } else {
    // item
    const d = input.dims
    if (d.view && meta.view === d.view) {
      score += 3
      matchedFields.push('view')
    }
    if (d.context && meta.context === d.context) {
      score += 1
      matchedFields.push('context')
    }
  }

  return { score, matchedFields }
}

/**
 * 解析 asset_image.metadata 文本列；text → object 失败兜底空对象。
 * 实际 entity 上 metadata 类型是 unknown（声明为 text），运行时拿到的可能是 string 或 object。
 */
function parseMetadata(raw: unknown): VariantMetadata {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as VariantMetadata
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') return parsed as VariantMetadata
    return {}
  } catch {
    return {}
  }
}
