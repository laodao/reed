/**
 * parse-asset-refs · 从分镜 frameDescription 解析 @[名字@图索引] 资产引用，映射为参考图 override。
 *
 * 背景：分镜提示词里用户可能写 `@[杜十娘]`（只点名资产）或 `@[杜十娘@2]`（精确引用该资产第 2 张图）。
 * 生成端 collectReferenceImages 按维度评分自动选图，用户显式写的 `@[名字@索引]` 应作为
 * 参考图 override 传入（命中 (kind, bindingId) 的资产直接用指定图）。
 *
 * 规则：
 *  - `@[名字]`（无图索引）→ 不生成 override（让自动评分挑图），返回空。
 *  - `@[名字@N]` → 按名匹配场景资产，取其 listByAsset 的第 N 张图 imageId。
 *  - `@[名字@N@实体id]`（评审 #48 新增第三段，编辑器序列化时写入）→ 优先按 id 匹配，
 *     改名不再悬空；id 未命中回退按名（兼容跨项目/旧数据复制场景）。
 *     匹配不到资产 / 图索引越界 → 丢弃该项（不阻断生成）。
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

/** 拆 `名字[@索引][@实体id]`（评审 #48：第三段为可选实体 id） */
export function splitRefToken(inner: string): { name: string; index: number | null; id: string | null } {
  const parts = inner.split('@')
  const name = (parts.shift() ?? '').trim()
  let index: number | null = null
  let id: string | null = null
  for (const part of parts) {
    if (/^\d+$/.test(part) && index === null) index = Number(part)
    else if (part) id = part.trim()
  }
  return { name, index, id }
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
    const { name, index, id } = splitRefToken(m[1])
    if (!name && !id) continue
    if (index == null) continue // 只点名资产，不指定图 → 自动评分

    // 评审 #48：优先按 id 匹配（改名不悬空），回退按名（旧格式/跨场景复制）
    const hit = (id && assets.find((a) => a.bindingId === id)) || assets.find((a) => a.name === name)
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
