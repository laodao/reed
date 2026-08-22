/**
 * 资产业务服务
 * @module core/modules/assets/asset.service
 * @description 资产中心的读写与工作流「保存资产/读取资产」节点的业务入口。
 *              磁盘操作委托 AssetStorageService；DB 操作委托 AssetRepository。
 *
 *              内容四种形态：
 *              - file：把本地路径（含 data:/local-*:// 协议 URL）复制进资产目录
 *              - url ：保留原始链接（远程资源不落盘，如第三方图床）
 *              - text：文本内容直接入库
 *              - json：结构化数据（序列化后入库，读取时解析）
 */

import { ASSET_CATEGORIES, ASSET_STORAGE_KINDS, type AssetCategory, type AssetRecord, type SaveAssetInput } from '@shared/types/asset.types'
import { AssetRepository, type ListAssetParams, type UpdateAssetInput } from '@core/database/repositories/asset.repository'
import { getPathProvider } from '@core/interfaces/path.interface'
import { AssetStorageService } from './asset-storage.service'

/** 资产中心统计（分类计数） */
export interface AssetStats {
  total: number
  byCategory: Record<string, number>
}

export class AssetService {
  constructor(
    private readonly storage: AssetStorageService,
    private readonly repo: AssetRepository,
  ) {}

  /** 保存资产（四种形态统一入口） */
  async createAsset(input: SaveAssetInput): Promise<AssetRecord> {
    const content = input.content
    let category = input.category
    let name = input.name?.trim()
    let storagePath: string | null = null
    let url: string | null = null
    let textContent: string | null = null
    let jsonContent: string | null = null
    let mimeType: string | null = null
    let sizeBytes: number | null = null
    let metadata: Record<string, unknown> | null = null

    if (content.kind === 'file') {
      // 来源名（缺省取路径文件名）
      const srcName = fileNameOf(content.path)
      name = name || srcName || 'asset'
      // 大类缺省按来源文件名探测
      category = category ?? this.storage.deriveCategoryFromName(name)
      const saved = await this.storage.saveFileFromSource(content.path, category, name)
      storagePath = saved.storagePath
      sizeBytes = saved.sizeBytes
      mimeType = saved.mimeType
      metadata = Object.keys(saved.metadata).length ? saved.metadata : null
      // 落盘后以实际存储文件名作为资产名（含去重序号时更直观）
      name = name || basenameOf(storagePath)
    } else if (content.kind === 'url') {
      const u = content.url.trim()
      if (!/^https?:\/\//i.test(u) && !/^local-(image|file|video):\/\//i.test(u)) {
        throw new Error('url 形态仅支持 http(s) 或 local-*:// 链接')
      }
      name = name || fileNameOf(u) || 'asset'
      category = category ?? this.storage.deriveCategoryFromName(name)
      url = u
    } else if (content.kind === 'text') {
      name = name || '文本'
      category = category ?? ASSET_CATEGORIES.text
      textContent = content.text
      sizeBytes = Buffer.byteLength(content.text, 'utf-8')
    } else {
      // json：校验可解析，存原始字符串（保留格式）
      let parsed: unknown
      try {
        parsed = JSON.parse(content.json)
      } catch {
        throw new Error('json 形态内容不是合法 JSON')
      }
      name = name || '数据'
      category = category ?? ASSET_CATEGORIES.json
      jsonContent = JSON.stringify(parsed)
      sizeBytes = Buffer.byteLength(jsonContent, 'utf-8')
    }

    return this.repo.create({
      category: category as AssetCategory,
      name: name as string,
      description: input.description?.trim() || null,
      tags: input.tags ?? [],
      kind: content.kind,
      storagePath,
      url,
      textContent,
      jsonContent,
      mimeType,
      sizeBytes,
      metadata,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
    })
  }

  /** 分页列表 */
  async listAssets(params: ListAssetParams): Promise<{ items: AssetRecord[]; total: number }> {
    return this.repo.listAsset(params)
  }

  /** 单条查询 */
  async getAsset(id: string): Promise<AssetRecord | null> {
    return this.repo.findById(id)
  }

  /** 更新（名称/描述/标签/分类） */
  async updateAsset(id: string, patch: UpdateAssetInput): Promise<AssetRecord | null> {
    return this.repo.update(id, patch)
  }

  /** 删除（文件型连带删磁盘文件） */
  async deleteAsset(id: string): Promise<boolean> {
    const record = await this.repo.findById(id)
    if (!record) return false
    if (record.kind === ASSET_STORAGE_KINDS.file && record.storagePath) {
      this.storage.deleteStoredFile(record.storagePath)
    }
    await this.repo.delete(id)
    return true
  }

  /** 统计（资产中心头部） */
  async getStats(): Promise<AssetStats> {
    const rows = await this.repo.countByCategory()
    const byCategory: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      byCategory[r.category] = r.count
      total += r.count
    }
    return { total, byCategory }
  }

  /** 资产可访问 URL（前端预览用；返回空串表示不可预览） */
  assetPreviewUrl(record: AssetRecord): string {
    if (record.kind === ASSET_STORAGE_KINDS.file && record.storagePath) {
      const scheme = record.category === 'image' ? 'image' : record.category === 'video' ? 'video' : 'file'
      return getPathProvider().toAssetUrl(record.storagePath, scheme)
    }
    if (record.kind === ASSET_STORAGE_KINDS.url && record.url) {
      return record.url
    }
    return ''
  }

  /** 资产本地绝对路径（文件型；非文件型返回空串） */
  resolveAssetPath(record: AssetRecord): string {
    if (record.kind === ASSET_STORAGE_KINDS.file && record.storagePath) {
      return this.storage.resolveStoredPath(record.storagePath)
    }
    return ''
  }
}

/** 路径/URL 的文件名（剥查询串） */
function fileNameOf(p: string): string {
  const cleaned = p.split(/[?#]/)[0]
  return (cleaned.split(/[\\/]/).pop() ?? '').trim() || ''
}

/** 相对路径取文件名 */
function basenameOf(rel: string): string {
  const seg = rel.split('/').pop() ?? ''
  return seg || 'asset'
}
