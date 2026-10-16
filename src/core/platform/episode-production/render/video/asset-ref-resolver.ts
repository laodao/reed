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
import { CharacterAssetService } from '../../assets/services/character-asset.service'
import { LocationAssetService } from '../../assets/services/location-asset.service'
import { ItemAssetService } from '../../assets/services/item-asset.service'
import type { ReferenceBoardMember } from '../keyframe/reference-board.service'

/** 单条资产引用（解析结果，落 metadata + prompt 声明段） */
export interface SegmentAssetRef {
  kind: 'character' | 'location' | 'item'
  bindingId: string
  name: string
  /** 生效外观摘要（getEffectiveData 投影后截断），声明段用 */
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

/**
 * asset_image 行里挑参考图（与 keyframe/reference-image-selector 的 S-05 confirmed 闸门同口径）：
 * confirmed=1 池强制（池内 is_main 主图优先）；池空回退 is_main 主图并 warn（老数据兼容兜底）；
 * 池空且无主图 → null（资产跳过）。
 */
export function pickRefImage(
  images: Array<{ isMain?: number | null; confirmed?: number | null; imagePath?: string | null; id: string }>,
  label: string,
): { id: string; imagePath: string } | null {
  const withImage = images.filter((i) => !!i.imagePath)
  if (withImage.length === 0) return null
  const confirmedPool = withImage.filter((i) => i.confirmed === 1)
  if (confirmedPool.length > 0) {
    const picked = confirmedPool.find((i) => i.isMain === 1) ?? confirmedPool[0]
    return { id: picked.id, imagePath: picked.imagePath as string }
  }
  const legacyMain = withImage.find((i) => i.isMain === 1)
  if (legacyMain) {
    console.warn(`[asset-ref] ${label} 无 confirmed 定妆图，回退 is_main 主图（老数据兼容兜底）`)
    return { id: legacyMain.id, imagePath: legacyMain.imagePath as string }
  }
  return null
}

function truncate(s: string | null | undefined, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/**
 * 收集一个片段内全部镜头引用的资产（去重、稳定顺序：地点 → 角色 → 道具）。
 * 角色取 shots[].characters[].characterId；地点/道具取对应 bindingIds 数组。
 * name/description 经 *AssetService.getEffectiveData 双源投影（linked_lw 不再落空为裸 bindingId）；
 * 投影失败的 binding 跳过并 console.warn（不阻断）。
 * 任一 binding 无图 → 跳过并 console.warn（不阻断；prompt 侧由文字描述兜底）。
 */
export async function collectSegmentAssetRefs(
  ds: DataSource,
  shots: SegmentRefShotInput[],
): Promise<SegmentAssetRef[]> {
  const imageSvc = new AssetImageService(ds)
  const charSvc = new CharacterAssetService(ds)
  const locSvc = new LocationAssetService(ds, imageSvc)
  const itemSvc = new ItemAssetService(ds)

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
    let name: string
    let appearance: string
    try {
      const eff = await locSvc.getEffectiveData(bindingId)
      name = eff.name
      appearance = truncate(eff.description, 80)
    } catch (e) {
      console.warn(`[asset-ref] 地点绑定 ${bindingId} 投影失败，跳过：`, (e as Error).message)
      continue
    }
    const images = await imageSvc.listByAsset('location', bindingId)
    const picked = pickRefImage(images, `地点「${name}」`)
    if (!picked) {
      console.warn(`[asset-ref] 地点「${name}」无可用主图，跳过`)
      continue
    }
    refs.push({
      kind: 'location',
      bindingId,
      name,
      appearance,
      assetImageId: picked.id,
      imagePath: picked.imagePath,
    })
  }

  for (const bindingId of characterIds) {
    let name: string
    let appearance: string
    try {
      const eff = await charSvc.getEffectiveData(bindingId)
      name = eff.name
      appearance = truncate([eff.description, eff.appearance].filter(Boolean).join(' / '), 80)
    } catch (e) {
      console.warn(`[asset-ref] 角色绑定 ${bindingId} 投影失败，跳过：`, (e as Error).message)
      continue
    }
    const images = await imageSvc.listByAsset('character', bindingId)
    const picked = pickRefImage(images, `角色「${name}」`)
    if (!picked) {
      console.warn(`[asset-ref] 角色「${name}」无可用主图，跳过`)
      continue
    }
    refs.push({
      kind: 'character',
      bindingId,
      name,
      appearance,
      assetImageId: picked.id,
      imagePath: picked.imagePath,
    })
  }

  for (const bindingId of itemIds) {
    let name: string
    let appearance: string
    try {
      const eff = await itemSvc.getEffectiveData(bindingId)
      name = eff.name
      // 物品外观+归属约束（如"仅沈云萝背负"）进声明段，压制参考板道具串位
      appearance = truncate(eff.description, 80)
    } catch (e) {
      console.warn(`[asset-ref] 物品绑定 ${bindingId} 投影失败，跳过：`, (e as Error).message)
      continue
    }
    const images = await imageSvc.listByAsset('item', bindingId)
    const picked = pickRefImage(images, `物品「${name}」`)
    if (!picked) {
      console.warn(`[asset-ref] 物品「${name}」无可用主图，跳过`)
      continue
    }
    refs.push({
      kind: 'item',
      bindingId,
      name,
      appearance,
      assetImageId: picked.id,
      imagePath: picked.imagePath,
    })
  }

  return refs
}

/**
 * 编号事实源构建：编号必须来自重排后的 board.members（单一事实源）。
 *
 * ReferenceBoardService.build 会跳过缺图成员，sharp-worker 对幸存成员重排 slot
 * （1..N 按幸存顺序），因此原始 refs 下标在成员缺图时与板上编号色块错位，
 * 会把「N号=名字」张冠李戴。members 入参（拼板产物 board.members）存在时，
 * 编号一律以 members 的幸存顺序为准；缺图被剔除的名字不参与编号。
 * members 未传（undefined）时退回 refs 原始下标——仅兼容单资产直传与旧调用方。
 */
function buildSlotMap(
  refs: SegmentAssetRef[],
  boardMembers?: ReferenceBoardMember[],
): Map<string, number> {
  const slotByName = new Map<string, number>()
  if (boardMembers) {
    boardMembers.forEach((m, i) => {
      if (!slotByName.has(m.name)) slotByName.set(m.name, m.slot ?? i + 1)
    })
    return slotByName
  }
  for (let i = 0; i < refs.length; i++) {
    if (!slotByName.has(refs[i].name)) slotByName.set(refs[i].name, i + 1)
  }
  return slotByName
}

/**
 * 在镜头正文里把每个资产名的首次出现标注为可见的参考板编号引用，
 * 如「沈云萝（参考板第2号）」——让"提示词引用资产"在 prompt 文本层面可见、可审计。
 * 已有 `@[...]` 标记会被 buildSegmentPrompt 先剥成纯名，此处再统一加编号。
 *
 * 编号必须来自重排后 members：传入拼板产物 board.members（缺图成员已被剔除、
 * 幸存成员 slot 重排）时，编号跟随 members 幸存顺序，与板上色块一一对应；
 * 被剔除成员的名字不加编号（prompt 正文文字描述兜底）。
 *
 * 实现要点：全部名字做一次正则交替匹配（长名排在前面，保证同一位置最长名优先），
 * 避免嵌套名误标——refs 同时含「雪麓山庄书房」与「雪麓山庄」时，短名不得标进长名前缀。
 * 每个名字只标首次出现；同名资产（去重迁移的漏网）共享第一个名字的编号。
 */
export function annotateRefsWithSlots(
  basePrompt: string,
  refs: SegmentAssetRef[],
  boardMembers?: ReferenceBoardMember[],
): string {
  if (refs.length === 0) return basePrompt
  const slotByName = buildSlotMap(refs, boardMembers)
  if (slotByName.size === 0) return basePrompt // 空成员/全员缺图：不生成编号标注
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
 * @param basePrompt   segment-planner.buildSegmentPrompt 的产出（镜头正文+约束尾）
 * @param refs         解析出的资产引用（≥1），appearance 描述按 assetImageId 关联
 * @param useBoard     true = refs 已拼成编号参考板（Picture 1 为板）；false = 单资产原图
 * @param boardMembers 拼板产物 board.members——编号必须来自重排后的 members
 *                     （缺图成员被剔除、幸存成员 slot 重排），与板上色块一一对应；
 *                     不传时退回 refs 原始下标（兼容单资产直传/旧调用方），
 *                     传空数组（全员缺图）则不生成编号清单、不抛错
 */
export function buildAssetRefPrompt(
  basePrompt: string,
  refs: SegmentAssetRef[],
  useBoard: boolean,
  boardMembers?: ReferenceBoardMember[],
): string {
  const kindLabel: Record<SegmentAssetRef['kind'], string> = {
    character: '角色',
    location: '场景',
    item: '物品',
  }
  const appearanceByImageId = new Map(refs.map((r) => [r.assetImageId, r]))
  let list: string
  if (boardMembers) {
    // 编号一律以 members 为准（单一事实源）；名字/外观描述仍从 refs 取
    list = boardMembers
      .map((m, i) => {
        const r = appearanceByImageId.get(m.assetImageId)
        const name = m.name || r?.name || ''
        const kind: SegmentAssetRef['kind'] = r?.kind ?? m.kind
        const extra = r?.appearance ? `：${r.appearance}` : ''
        return `${m.slot ?? i + 1}号=${name}（${kindLabel[kind]}${extra}）`
      })
      .join('；')
  } else {
    list = refs
      .map((r, i) => {
        const extra = r.appearance ? `：${r.appearance}` : ''
        return `${i + 1}号=${r.name}（${kindLabel[r.kind]}${extra}）`
      })
      .join('；')
  }
  const picDesc = useBoard
    ? 'Picture 1 为资产参考板（多个编号分块，各分块是一张独立的资产图）'
    : `Picture 1 为资产「${refs[0].name}」的参考图`

  return [
    'subject_definitions:',
    `${picDesc}，仅作为画面主体外观来源：${list}。`,
    '要求：人物长相、发型、服装、配饰必须与对应编号资产完全一致；场景风格与地点资产一致；' +
    '画面中每个人物只出现一次，不得出现重复的人物、分身或残影；' +
    '物品道具仅出现在其归属人物身上（见编号清单的归属约束），不得套用到其他人物；' +
    '不要求保留 Picture 1 的拼贴构图，画面按 summary 描述的机位、场景与动作自然呈现。',
    '',
    'summary:',
    `[reference generation + audio reference] ${basePrompt}`,
    '',
    'retention_analysis:',
    'Subject 1（Picture 1 各编号主体）：fully_preserved - 仅保持主体外观与整体风格一致，画面按 summary 运动。',
  ].join('\n')
}
