/**
 * asset-ref-resolver · "提示词引用资产"视频路径（2026-09-21 一致性修复 v2）
 * @module platform/episode-production/render/video/asset-ref-resolver
 *
 * 背景（雪麓山庄 v3 一致性复盘）：关键帧链路 11/11 废帧（flux-kontext 照抄参考板），
 * keyframes2video / image2video 的图源都是关键帧 → 一并暂停。本模块实现唯一开通的
 * assetRef2video 路径：从分镜结构化字段（characters / location_binding_ids /
 * item_binding_ids）收集本段涉及的资产主图，作为视频模型的主体外观参考。
 *
 * 兑现方式（H3 网关约束：refs 必填且上限 2，2 张 = 首尾帧语义）：
 *   1 个资产 → refs[0] = 该资产主图原图（不经拼板，最大保真）
 *   ≥2 个资产 → refs[0] = 编号参考板（ReferenceBoardService 拼板，声明段声明编号）
 *   0 个资产 → 抛错（纯文生视频在该 provider 不可用），提示补资产/绑定
 *
 * 语义红线：refs 只承载"主体外观来源"，绝不承载首帧构图——声明段必须显式声明
 * "不要求保留 Picture 1 的拼贴构图"，否则模型会照抄拼板版式（关键帧事故的根因）。
 */

import type { DataSource } from 'typeorm'
import { AssetImageService } from '../../assets/services/asset-image.service'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'

/** 单条资产引用（解析结果，落 metadata + prompt 声明段） */
export interface SegmentAssetRef {
  kind: 'character' | 'location' | 'item'
  bindingId: string
  name: string
  /** canonical 外观摘要（角色 standalone_description 截断），声明段用 */
  appearance?: string
  assetImageId: string
  imagePath: string
}

/** collectSegmentAssetRefs 的分镜输入形状（storyboard 实行的相关列） */
export interface SegmentRefShotInput {
  characters?: unknown[] | null
  locationBindingIds?: unknown[] | null
  itemBindingIds?: unknown[] | null
}

/** asset_image 行里挑参考图：主图优先 → 已确认 → 第一张有图的 */
function pickRefImage(
  images: Array<{ isMain?: number | null; confirmed?: number | null; imagePath?: string | null; id: string }>,
): { id: string; imagePath: string } | null {
  const withImage = images.filter((i) => !!i.imagePath)
  if (withImage.length === 0) return null
  const main = withImage.find((i) => i.isMain === 1)
  if (main) return { id: main.id, imagePath: main.imagePath as string }
  const confirmed = withImage.find((i) => i.confirmed === 1)
  if (confirmed) return { id: confirmed.id, imagePath: confirmed.imagePath as string }
  return { id: withImage[0].id, imagePath: withImage[0].imagePath as string }
}

function truncate(s: string | null | undefined, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/**
 * 收集一个片段内全部镜头引用的资产（去重、稳定顺序：地点 → 角色 → 道具）。
 * 角色取 shots[].characters[].characterId；地点/道具取对应 bindingIds 数组。
 * 任一 binding 无图 → 跳过并 console.warn（不阻断；prompt 侧由文字描述兜底）。
 */
export async function collectSegmentAssetRefs(
  ds: DataSource,
  shots: SegmentRefShotInput[],
): Promise<SegmentAssetRef[]> {
  const imageSvc = new AssetImageService(ds)

  const locationIds: string[] = []
  const characterIds: string[] = []
  const itemIds: string[] = []
  for (const shot of shots) {
    for (const id of (shot.locationBindingIds ?? []) as unknown[]) {
      if (typeof id === 'string' && id && !locationIds.includes(id)) locationIds.push(id)
    }
    for (const c of (shot.characters ?? []) as unknown[]) {
      const cid = (c as { characterId?: string } | null)?.characterId
      if (typeof cid === 'string' && cid && !characterIds.includes(cid)) characterIds.push(cid)
    }
    for (const id of (shot.itemBindingIds ?? []) as unknown[]) {
      if (typeof id === 'string' && id && !itemIds.includes(id)) itemIds.push(id)
    }
  }

  const refs: SegmentAssetRef[] = []

  for (const bindingId of locationIds) {
    const binding = await ds
      .getRepository(LocationBindingEntity)
      .findOne({ where: { id: bindingId } })
    if (!binding) continue
    const images = await imageSvc.listByAsset('location', bindingId)
    const picked = pickRefImage(images)
    if (!picked) {
      console.warn(`[asset-ref] 地点「${binding.standaloneName ?? bindingId}」无可用主图，跳过`)
      continue
    }
    refs.push({
      kind: 'location',
      bindingId,
      name: binding.standaloneName ?? bindingId,
      appearance: truncate(binding.standaloneDescription, 80),
      assetImageId: picked.id,
      imagePath: picked.imagePath,
    })
  }

  for (const bindingId of characterIds) {
    const binding = await ds
      .getRepository(CharacterBindingEntity)
      .findOne({ where: { id: bindingId } })
    if (!binding) continue
    const images = await imageSvc.listByAsset('character', bindingId)
    const picked = pickRefImage(images)
    if (!picked) {
      console.warn(`[asset-ref] 角色「${binding.standaloneName ?? bindingId}」无可用主图，跳过`)
      continue
    }
    refs.push({
      kind: 'character',
      bindingId,
      name: binding.standaloneName ?? bindingId,
      appearance: truncate(binding.standaloneDescription, 80),
      assetImageId: picked.id,
      imagePath: picked.imagePath,
    })
  }

  for (const bindingId of itemIds) {
    const binding = await ds
      .getRepository(ItemBindingEntity)
      .findOne({ where: { id: bindingId } })
    if (!binding) continue
    const images = await imageSvc.listByAsset('item', bindingId)
    const picked = pickRefImage(images)
    if (!picked) {
      console.warn(`[asset-ref] 物品「${binding.standaloneName ?? bindingId}」无可用主图，跳过`)
      continue
    }
    refs.push({
      kind: 'item',
      bindingId,
      name: binding.standaloneName ?? bindingId,
      assetImageId: picked.id,
      imagePath: picked.imagePath,
    })
  }

  return refs
}

/**
 * 在镜头正文里把每个资产名的首次出现标注为可见的参考板编号引用，
 * 如「沈云萝（参考板第2号）」——让"提示词引用资产"在 prompt 文本层面可见、可审计。
 * 已有 `@[...]` 标记会被 buildSegmentPrompt 先剥成纯名，此处再统一加编号。
 *
 * 实现要点：全部名字做一次正则交替匹配（长名排在前面，保证同一位置最长名优先），
 * 避免嵌套名误标——refs 同时含「雪麓山庄书房」与「雪麓山庄」时，短名不得标进长名前缀。
 * 每个名字只标首次出现；同名资产（去重迁移的漏网）共享第一个名字的编号。
 */
export function annotateRefsWithSlots(basePrompt: string, refs: SegmentAssetRef[]): string {
  if (refs.length === 0) return basePrompt
  const slotByName = new Map<string, number>()
  for (let i = 0; i < refs.length; i++) {
    if (!slotByName.has(refs[i].name)) slotByName.set(refs[i].name, i + 1)
  }
  const names = [...slotByName.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
  const seen = new Set<string>()
  return basePrompt.replace(pattern, (m) => {
    if (seen.has(m)) return m
    seen.add(m)
    return `${m}（参考板第${slotByName.get(m)}号）`
  })
}

/**
 * 组装"提示词引用资产"的三段式 prompt（H3 网关检测到
 * subject_definitions/summary/retention_analysis 三段时原样透传）。
 *
 * @param basePrompt segment-planner.buildSegmentPrompt 的产出（镜头正文+约束尾）
 * @param refs       解析出的资产引用（≥1）
 * @param useBoard   true = refs 已拼成编号参考板（Picture 1 为板）；false = 单资产原图
 */
export function buildAssetRefPrompt(
  basePrompt: string,
  refs: SegmentAssetRef[],
  useBoard: boolean,
): string {
  const kindLabel: Record<SegmentAssetRef['kind'], string> = {
    character: '角色',
    location: '场景',
    item: '物品',
  }
  const list = refs
    .map((r, i) => {
      const extra = r.appearance ? `：${r.appearance}` : ''
      return `${i + 1}号=${r.name}（${kindLabel[r.kind]}${extra}）`
    })
    .join('；')
  const picDesc = useBoard
    ? 'Picture 1 为资产参考板（多个编号分块，各分块是一张独立的资产图）'
    : `Picture 1 为资产「${refs[0].name}」的参考图`

  return [
    'subject_definitions:',
    `${picDesc}，仅作为画面主体外观来源：${list}。`,
    '要求：人物长相、发型、服装、配饰必须与对应编号资产完全一致；场景风格与地点资产一致；' +
    '画面中每个人物只出现一次，不得出现重复的人物、分身或残影；' +
    '不要求保留 Picture 1 的拼贴构图，画面按 summary 描述的机位、场景与动作自然呈现。',
    '',
    'summary:',
    `[reference generation + audio reference] ${basePrompt}`,
    '',
    'retention_analysis:',
    'Subject 1（Picture 1 各编号主体）：fully_preserved - 仅保持主体外观与整体风格一致，画面按 summary 运动。',
  ].join('\n')
}
