/**
 * 主图（main）生成 client
 * @module renderer/api/main-image-generator
 *
 * 把 "拉资产 effective → 拼 prompt → 调 ep:asset:image:generate-main IPC" 这条流程
 * 封装成一个 generateMainFor(assetType, assetId) 入口，3 个 GalleryEditor
 * (character / location / item) 直接调用，不重复实现 prompt 拼接。
 *
 * 双端透明：直接走 window.electronAPI 的 episodeProduction.asset.* namespace，
 * Web 端由 channel-map / bridge 转 HTTP /api/ipc/<channel>，PC 端走 ipcRenderer。
 */

import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import {
  appendCharacterConstraints,
  mergeCharacterNegative,
} from '@core/modules/episode-production/assets/prompts/character-constraints'

type AssetType = 'character' | 'location' | 'item'

interface IpcResp<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 从对应资产的 effective data 拼出生成主图用的 prompt + negativePrompt。
 * - character: name + description + appearance + outfit（spec 双源投影）+ 角色硬约束
 * - location: name + description
 * - item: name + description
 *
 * 任何资产都至少要有 name，否则抛错（生成无 prompt 的图没意义）。
 */
async function buildPromptFromEffective(
  assetType: AssetType,
  assetId: string,
): Promise<{ prompt: string; negativePrompt?: string }> {
  const root = (window as any).electronAPI?.episodeProduction?.asset
  if (!root) throw new Error('episodeProduction.asset API 未暴露')

  let resp: IpcResp<any>
  if (assetType === 'character') {
    resp = await root.character.effective(assetId)
  } else if (assetType === 'location') {
    resp = await root.location.effective(assetId)
  } else {
    resp = await root.item.effective(assetId)
  }
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || `加载${assetType} effective 数据失败`)
  }

  const eff = resp.data as Record<string, any>
  const parts: string[] = []
  if (eff.name) parts.push(String(eff.name).trim())
  if (eff.description) parts.push(String(eff.description).trim())
  if (assetType === 'character') {
    // 设定卡上的"剩余字段"按 effective 输出顺序拼到 prompt（与派生侧共享同一来源）
    if (eff.alias) parts.push(`别名：${String(eff.alias).trim()}`)
    if (eff.role) parts.push(`定位：${String(eff.role).trim()}`)
    if (eff.gender) parts.push(`性别：${String(eff.gender).trim()}`)
    if (eff.age != null) parts.push(`年龄：${eff.age}`)
    if (eff.race) {
      const raceText = describeCharacterRace(String(eff.race))
      if (raceText) parts.push(`人种：${raceText}`)
    }
    if (eff.appearance) parts.push(`外貌：${String(eff.appearance).trim()}`)
    if (eff.outfit) parts.push(`服装：${String(eff.outfit).trim()}`)
    if (Array.isArray(eff.outfitsExtra) && eff.outfitsExtra.length > 0) {
      parts.push(`备选服装：${eff.outfitsExtra.join(' / ')}`)
    }
    if (Array.isArray(eff.styleAnchors) && eff.styleAnchors.length > 0) {
      parts.push(`风格：${eff.styleAnchors.join(' / ')}`)
    }
  }
  let prompt = parts.filter(Boolean).join('，')
  if (!prompt) {
    throw new Error('请先在设定卡填写名称或描述，AI 才有可生成内容')
  }

  // 角色主图硬约束（直立全身、纯色背景、无帽子无首饰），与派生侧共享同一约束源
  if (assetType === 'character') {
    prompt = appendCharacterConstraints(prompt, 'fullBody')
    return { prompt, negativePrompt: mergeCharacterNegative(undefined, 'fullBody') }
  }
  return { prompt }
}

/**
 * 角色 race 枚举 → "中文 + 英文标签"双写，提升各家 provider 的命中率。
 * 与 CharacterCardFormV2.RACE_OPTIONS 一一对应。
 */
function describeCharacterRace(race: string): string {
  switch (race) {
    case 'east_asian':
      return '东亚（East Asian, Han Chinese / Japanese / Korean facial features）'
    case 'south_asian':
      return '南亚（South Asian, Indian / Pakistani / Bangladeshi facial features）'
    case 'southeast_asian':
      return '东南亚（Southeast Asian, Thai / Vietnamese / Filipino facial features）'
    case 'central_asian':
      return '中亚（Central Asian, Kazakh / Uzbek facial features）'
    case 'european':
      return '欧洲（European / Caucasian facial features）'
    case 'african':
      return '非洲（African, dark skin tone）'
    case 'south_american':
      return '南美（South American, Latin American facial features）'
    default:
      return ''
  }
}

/**
 * 为某资产生成主图：拉 effective → 拼 prompt → 调 generate-main IPC。
 * 返回新 main 的 AssetImageEntity（含 imagePath、isMain=1）。
 *
 * @throws 拉 effective 失败 / prompt 为空 / IPC 调用失败 / provider 出错
 */
export async function generateMainFor(
  assetType: AssetType,
  assetId: string,
): Promise<AssetImageEntity> {
  const { prompt, negativePrompt } = await buildPromptFromEffective(assetType, assetId)
  const root = (window as any).electronAPI?.episodeProduction?.asset
  if (!root?.image?.generateMain) {
    throw new Error('image.generateMain IPC 未暴露')
  }
  const resp: IpcResp<AssetImageEntity> = await root.image.generateMain({
    assetType,
    assetId,
    prompt,
    negativePrompt,
  })
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || 'AI 主图生成失败')
  }
  return resp.data
}
