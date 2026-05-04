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

type AssetType = 'character' | 'location' | 'item'

interface IpcResp<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 从对应资产的 effective data 拼出生成主图用的 prompt。
 * - character: name + description + appearance + outfit（spec 双源投影）
 * - location: name + description
 * - item: name + description
 *
 * 任何资产都至少要有 name，否则抛错（生成无 prompt 的图没意义）。
 */
async function buildPromptFromEffective(
  assetType: AssetType,
  assetId: string,
): Promise<string> {
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

  const eff = resp.data as Record<string, string | null | undefined>
  const parts: string[] = []
  if (eff.name) parts.push(String(eff.name).trim())
  if (eff.description) parts.push(String(eff.description).trim())
  if (assetType === 'character') {
    if (eff.appearance) parts.push(`外貌：${String(eff.appearance).trim()}`)
    if (eff.outfit) parts.push(`服装：${String(eff.outfit).trim()}`)
  }
  const prompt = parts.filter(Boolean).join('，')
  if (!prompt) {
    throw new Error('请先在设定卡填写名称或描述，AI 才有可生成内容')
  }
  return prompt
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
  const prompt = await buildPromptFromEffective(assetType, assetId)
  const root = (window as any).electronAPI?.episodeProduction?.asset
  if (!root?.image?.generateMain) {
    throw new Error('image.generateMain IPC 未暴露')
  }
  const resp: IpcResp<AssetImageEntity> = await root.image.generateMain({
    assetType,
    assetId,
    prompt,
  })
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || 'AI 主图生成失败')
  }
  return resp.data
}
