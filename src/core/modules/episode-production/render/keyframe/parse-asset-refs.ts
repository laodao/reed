/**
 * parse-asset-refs · 从分镜 frameDescription 解析 @[名字@图索引] 资产引用，映射为参考图 override。
 *
 * 背景：分镜提示词里用户可能写 `@[杜十娘]`（只点名资产）或 `@[杜十娘@2]`（精确引用该资产第 2 张图）。
 * 生成端 collectReferenceImages 按维度评分自动选图，用户显式写的 `@[名字@索引]` 应作为
 * 参考图 override 传入（命中 (kind, bindingId) 的资产直接用指定图）。
 *
 * 规则：
 *  - `@[名字]`（无图索引）→ 不生成 override（让自动评分挑图），返回空。
 *  - `@[名字@N]` → 匹配场景资产 effective.name，取其 listByAsset 的第 N 张图 imageId。
 *     匹配不到资产 / 图索引越界 / 同名歧义 → 丢弃该项（不阻断生成）。
 *
 * 纯计算 + 一次 listByAsset；不 touch typeorm（图列表由调用方注入的 imageSvc 提供，便于单测）。
 */

import type { KeyframeReferenceOverride } from '@core/database/repositories/storyboard-keyframe.repository'
import type { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'

/** 场景已解析资产的精简形状（含名称与 bindingId），供按名匹配 */
export interface RefAssetCandidate {
  kind: 'character' | 'location' | 'item'
  bindingId: string
  name: string
}

const REF_RE = /@\[([^\]]+)\]/g

/** 拆 `名字@索引` */
function splitNameIndex(inner: string): { name: string; index: number | null } {
  const at = inner.lastIndexOf('@')
  if (at > 0 && /^\d+$/.test(inner.slice(at + 1))) {
    return { name: inner.slice(0, at).trim(), index: Number(inner.slice(at + 1)) }
  }
  return { name: inner.trim(), index: null }
}

/**
 * 解析 frameDescription 里的 @[名字@索引]，生成参考图 override。
 *
 * @param text      frameDescription（含 @[..] 标记）
 * @param assets    本分镜消费的场景资产（characters + location + items，取 effective.name）
 * @param imageSvc  AssetImageService，用于按 bindingId 拉图列表并定位第 N 张
 */
export async function parseAssetRefOverrides(
  text: string,
  assets: RefAssetCandidate[],
  imageSvc: Pick<AssetImageService, 'listByAsset'>,
): Promise<KeyframeReferenceOverride[]> {
  if (!text) return []
  const out: KeyframeReferenceOverride[] = []
  const seen = new Set<string>()

  for (const m of text.matchAll(REF_RE)) {
    const { name, index } = splitNameIndex(m[1])
    if (!name) continue
    if (index == null) continue // 只点名资产，不指定图 → 自动评分

    // 按名字匹配场景资产（同名取第一个）
    const hit = assets.find((a) => a.name === name)
    if (!hit) continue
    const key = `${hit.kind}:${hit.bindingId}`
    if (seen.has(key)) continue // 同名同资产只取一次（图索引不同也保留第一个）
    seen.add(key)

    const list = await imageSvc.listByAsset(hit.kind, hit.bindingId)
    const img = list[index - 1] // 1-based 索引
    if (!img?.id) continue
    out.push({ kind: hit.kind, bindingId: hit.bindingId, imageId: img.id })
  }
  return out
}

/** 从场景已解析资产提取按名匹配所需的候选（含 name）。 */
export function toRefCandidates(assets: {
  characters: Array<{ bindingId: string; effective?: { name?: string } }>
  location: { bindingId: string; effective?: { name?: string } } | null
  items: Array<{ bindingId: string; effective?: { name?: string } }>
}): RefAssetCandidate[] {
  const out: RefAssetCandidate[] = []
  for (const c of assets.characters ?? []) {
    if (c.effective?.name) out.push({ kind: 'character', bindingId: c.bindingId, name: c.effective.name })
  }
  if (assets.location?.effective?.name) {
    out.push({ kind: 'location', bindingId: assets.location.bindingId, name: assets.location.effective.name })
  }
  for (const it of assets.items ?? []) {
    if (it.effective?.name) out.push({ kind: 'item', bindingId: it.bindingId, name: it.effective.name })
  }
  return out
}
