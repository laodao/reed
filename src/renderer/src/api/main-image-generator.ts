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
import { buildAssetIdentityPrompt } from '@core/modules/episode-production/assets/prompts/asset-identity-prompt'
import { useEpEpisodeStore } from '@/stores/episode-production'

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
): Promise<{ prompt: string; negativePrompt?: string; referenceImagePath?: string | null }> {
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
  const storyBg = readStoryBackgroundFromCurrentEpisode()

  // 收口到共享模块（与 deriveSingle / AddMainImageDialog 共享同一拼装逻辑）
  let prompt = buildAssetIdentityPrompt(assetType, eff, storyBg)
  if (!prompt) {
    throw new Error('请先在设定卡填写名称或描述，AI 才有可生成内容')
  }

  // 用户上传的参考图（spec 2026-05-09）— 透传给后端 generateMain
  const referenceImagePath = (eff.referenceImagePath as string | null | undefined) ?? null

  // 角色主图硬约束（半身定妆照、纯白背景、光照均匀），与派生侧共享同一约束源
  if (assetType === 'character') {
    prompt = appendCharacterConstraints(prompt, 'bust')
    return {
      prompt,
      negativePrompt: mergeCharacterNegative(undefined, 'bust'),
      referenceImagePath,
    }
  }
  return { prompt, referenceImagePath }
}

/**
 * 从 episode store 读当前 episode 的故事背景（年代 / 地域 / 其他描述）。
 * pinia 全局单例 — 在 renderer api 层（vue 组件外）也可调用。
 * store 未初始化或没有当前 episode 时返回空字段，buildPromptFromEffective 会跳过对应 prompt 段。
 */
function readStoryBackgroundFromCurrentEpisode(): {
  era: string
  region: string
  extra: string
} {
  try {
    const store = useEpEpisodeStore()
    const ep: any = store?.currentEpisode
    if (!ep) return { era: '', region: '', extra: '' }
    return {
      era: (ep.storyEra ?? '').toString().trim(),
      region: (ep.storyRegion ?? '').toString().trim(),
      extra: (ep.storyBackgroundExtra ?? '').toString().trim(),
    }
  } catch {
    return { era: '', region: '', extra: '' }
  }
}

/**
 * 为某资产生成主图：拉 effective → 拼 prompt → 调 generate-main IPC。
 * 返回新 main 的 AssetImageEntity（含 imagePath、isMain=1）。
 *
 * @param opts.promptOverride 用户在图集提示词框编辑的文本；非空时优先于系统拼接的
 *   effective prompt 作为生图 prompt（角色仍会叠加定妆硬约束）。
 * @throws 拉 effective 失败 / prompt 为空 / IPC 调用失败 / provider 出错
 */
export async function generateMainFor(
  assetType: AssetType,
  assetId: string,
  opts?: { promptOverride?: string },
): Promise<AssetImageEntity> {
  const { prompt: basePrompt, negativePrompt: baseNegative, referenceImagePath } =
    await buildPromptFromEffective(assetType, assetId)

  const userPrompt = opts?.promptOverride?.trim()
  const isOverride = !!userPrompt
  // 用户编辑的提示词优先；未编辑时用系统从 effective 拼接的 prompt
  let prompt = isOverride ? userPrompt as string : basePrompt
  let negativePrompt = baseNegative
  if (isOverride && assetType === 'character') {
    // buildPromptFromEffective 已对 base prompt 加过定妆约束；override 分支需手动补
    prompt = appendCharacterConstraints(prompt, 'bust')
    negativePrompt = mergeCharacterNegative(undefined, 'bust')
  }

  const root = (window as any).electronAPI?.episodeProduction?.asset
  if (!root?.image?.generateMain) {
    throw new Error('image.generateMain IPC 未暴露')
  }
  const resp: IpcResp<AssetImageEntity> = await root.image.generateMain({
    assetType,
    assetId,
    prompt,
    negativePrompt,
    referenceImagePath: referenceImagePath ?? null,
  })
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || 'AI 主图生成失败')
  }
  return resp.data
}
