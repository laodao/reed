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

import { ASSET_CATEGORIES, ASSET_PREVIEW_MODES, ASSET_STORAGE_KINDS, type AssetCategory, type AssetCategoryDef, type AssetGroupRecord, type AssetPreviewResult, type AssetPreviewTemplateOption, type AssetRecord, type AssetSourceLink, type SaveAssetCategoryInput, type SaveAssetInput, type UpdateAssetCategoryInput } from '@shared/types/asset.types'
import { AssetRepository, type ListAssetParams, type UpdateAssetInput } from '@core/database/repositories/asset.repository'
import { AssetGroupRepository } from '@core/database/repositories/asset-group.repository'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'
import { getPathProvider } from '@core/interfaces/path.interface'
import { AssetStorageService } from './asset-storage.service'
import { buildUrlShortcut, ensureExtension, sanitizeFileName, type AssetDownloadPayload } from './asset-download'
import { DOCUMENT_TEMPLATES } from '@core/services/document-tools/templates'
import { getDocumentTools } from '@core/services/document-tools/document-tools'

/** 资产中心统计（分类计数） */
export interface AssetStats {
  total: number
  byCategory: Record<string, number>
}

/** 组查询结果（组 + 成员资产） */
export interface AssetGroupDetail {
  group: AssetGroupRecord
  members: AssetRecord[]
}

/**
 * 资产来源 → 功能界面跳转解析器（需求 3）。
 * 由装配方（workflow-boot）注入：workflow/app 模块有 runService/appDefinitionService 访问权，
 * 资产模块保持独立——通过本接口解耦。
 */
export interface AssetSourceLinkResolver {
  /** 按运行 id 反查：app 触发 → 应用会话跳转；工作流触发 → 运行详情跳转 */
  resolve(runId: string): Promise<AssetSourceLink | null>
}

export class AssetService {
  constructor(
    private readonly storage: AssetStorageService,
    private readonly repo: AssetRepository,
    private readonly categoryRepo: AssetCategoryRepository,
    private readonly groupRepo?: AssetGroupRepository,
    private readonly sourceLinkResolver?: AssetSourceLinkResolver,
  ) {}

  /** 资产来源跳转（需求 3：资产 → 产出它的功能/执行历史） */
  async resolveSourceLink(record: AssetRecord): Promise<AssetSourceLink | null> {
    if (!record.sourceRef) return null
    // 手动/导入来源无可跳转
    if (record.sourceType === 'manual' || record.sourceType === 'import') return null
    if (!this.sourceLinkResolver) return null
    try {
      return await this.sourceLinkResolver.resolve(record.sourceRef)
    } catch (e) {
      console.warn('[AssetService] 来源解析失败（忽略）:', e)
      return null
    }
  }

  /** 资产组详情（组 + 成员；供资产中心组卡片/画廊） */
  async getGroupDetail(groupId: string): Promise<AssetGroupDetail | null> {
    if (!this.groupRepo) return null
    const group = await this.groupRepo.findById(groupId)
    if (!group) return null
    const members = await this.repo.findByGroup(groupId)
    return { group, members }
  }

  /** 保存资产（四种形态统一入口；groupName 归组支持） */
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

    // 套图归组：groupName 非空时，按「来源 + 组名」查/建组，本资产成为组内成员
    let groupId: string | null = null
    let groupRole: string | null = null
    const groupName = input.groupName?.trim()
    if (groupName && this.groupRepo) {
      const sourceType = input.sourceType ?? null
      const sourceRef = input.sourceRef ?? null
      // 同一来源（运行）内**同名组**复用；跨来源不合并（避免不同运行串组）。
      // 修复：按 (sourceType, sourceRef, name) 精确匹配——旧实现 findBySource 只按来源查，
      // 同一运行里第二个不同组名会被静默并入第一个组（组名/封面语义错乱）。
      let group = sourceRef
        ? await this.groupRepo.findBySourceAndName(sourceType, sourceRef, groupName)
        : null
      if (!group) {
        const created = await this.groupRepo.create({
          name: groupName,
          category: category,
          subCategory: input.subCategory ?? null,
          sourceType,
          sourceRef,
          coverAssetId: null,
        })
        group = created
      }
      groupId = group.id
      // 组内第一张资产作为封面
      if (!group.coverAssetId) {
        groupRole = 'cover'
      } else {
        groupRole = 'member'
      }
    }

    const record = await this.repo.create({
      category: category as AssetCategory,
      subCategory: input.subCategory ?? null,
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
      groupId,
      groupRole,
    })

    // 组封面回填（首成员作封面）
    if (groupId && groupRole === 'cover' && this.groupRepo) {
      await this.groupRepo.update(groupId, { coverAssetId: record.id })
    }

    return record
  }

  /** 分页列表（组内资产填充组名，供前端组卡片展示真实组名） */
  async listAssets(params: ListAssetParams): Promise<{ items: AssetRecord[]; total: number }> {
    const { items, total } = await this.repo.listAsset(params)
    // 组名批量填充：收集本页 groupId → 查组 → 回填 groupName（缺省保持 undefined）
    if (this.groupRepo) {
      const groupIds = [...new Set(items.map(a => a.groupId).filter((g): g is string => !!g))]
      if (groupIds.length) {
        const groups = await this.groupRepo.findByIds(groupIds)
        for (const a of items) {
          if (a.groupId) a.groupName = groups.get(a.groupId)?.name ?? null
        }
      }
    }
    return { items, total }
  }

  /** 单条查询 */
  async getAsset(id: string): Promise<AssetRecord | null> {
    return this.repo.findById(id)
  }

  /** 更新（名称/描述/标签/分类/子分类） */
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

  /** 指定大类下的子分类计数（资产中心二级分组） */
  async getSubCategoryStats(category: AssetCategory): Promise<Array<{ subCategory: string | null; count: number }>> {
    return this.repo.countBySubCategory(category)
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

  /**
   * 资产下载载荷（按存储形态生成文件名与内容）：
   * - file：复制源文件（sourcePath=绝对路径，文件名取存储文件名）
   * - text：下载为 .md（内容 textContent）
   * - json：下载为 .json（内容 jsonContent）
   * - url ：下载为 .url 快捷方式（InternetShortcut）
   * 无内容/无文件抛错（调用方提示）。
   */
  async buildDownloadPayload(record: AssetRecord): Promise<AssetDownloadPayload> {
    if (record.kind === ASSET_STORAGE_KINDS.file && record.storagePath) {
      const abs = this.resolveAssetPath(record)
      if (!abs) throw new Error('该资产无本地文件')
      return { fileName: sanitizeFileName(basenameOf(record.storagePath)), kind: 'file', sourcePath: abs }
    }
    if (record.kind === ASSET_STORAGE_KINDS.text) {
      const content = record.textContent ?? ''
      if (!content.trim()) throw new Error('该资产无文本内容')
      return { fileName: ensureExtension(record.name, 'md'), kind: 'text', content }
    }
    if (record.kind === ASSET_STORAGE_KINDS.json) {
      const content = record.jsonContent ?? ''
      if (!content.trim()) throw new Error('该资产无数据内容')
      return { fileName: ensureExtension(record.name, 'json'), kind: 'text', content }
    }
    if (record.kind === ASSET_STORAGE_KINDS.url && record.url) {
      return { fileName: ensureExtension(record.name, 'url'), kind: 'text', content: buildUrlShortcut(record.url) }
    }
    throw new Error('该资产暂不支持下载')
  }

  /**
   * 组文件夹打开目标：组内第一个文件型成员的绝对路径（套图/组图文件通常同目录，
   * 以首个文件成员定位即可）；组不存在或无文件成员返回空串。
   */
  async resolveGroupFolderPath(groupId: string): Promise<string> {
    const detail = await this.getGroupDetail(groupId)
    if (!detail) return ''
    const fileMember = detail.members.find(m => m.kind === ASSET_STORAGE_KINDS.file && m.storagePath)
    if (!fileMember) return ''
    return this.resolveAssetPath(fileMember)
  }

  // ==================== 分类定义（业务分类实体） ====================

  /** 全部分类定义（可选按大类过滤计数；资产中心二级分组 tabs 用） */
  async listAssetCategories(category?: AssetCategory): Promise<AssetCategoryDef[]> {
    const [defs, stats] = await Promise.all([
      this.categoryRepo.listAll(),
      category ? this.repo.countBySubCategory(category) : Promise.resolve([]),
    ])
    const counts = new Map(stats.map(s => [s.subCategory, s.count]))
    return defs.map(d => ({ ...d, count: counts.get(d.name) ?? 0 }))
  }

  /** 新建分类定义（重名冲突 / report 模式模板必填且存在校验） */
  async createAssetCategory(input: SaveAssetCategoryInput): Promise<AssetCategoryDef> {
    this.assertCategoryInput(input)
    const dup = await this.categoryRepo.findByName(input.name)
    if (dup) throw new Error(`分类「${input.name}」已存在`)
    return this.categoryRepo.create(input)
  }

  /** 更新分类定义（内置禁改；同名校验排除自身） */
  async updateAssetCategory(id: string, patch: UpdateAssetCategoryInput): Promise<AssetCategoryDef | null> {
    const existing = await this.categoryRepo.findById(id)
    if (!existing) throw new Error('分类不存在')
    if (existing.isBuiltin) throw new Error('内置分类不可修改（可新建同名自有分类）')
    // 显式 undefined = 不修改：先剔除（IPC 展开传参会带 undefined），再与既有定义合并做校验
    const cleanPatch: UpdateAssetCategoryInput = {}
    for (const k of Object.keys(patch) as Array<keyof UpdateAssetCategoryInput>) {
      if (patch[k] !== undefined) cleanPatch[k] = patch[k]
    }
    this.assertCategoryInput({ ...existing, ...cleanPatch })
    if (cleanPatch.name !== undefined && cleanPatch.name !== existing.name) {
      const dup = await this.categoryRepo.findByName(cleanPatch.name)
      if (dup) throw new Error(`分类「${cleanPatch.name}」已存在`)
    }
    return this.categoryRepo.update(id, cleanPatch)
  }

  /** 删除分类定义（内置禁删；仅删定义，资产保留原 sub_category 文本） */
  async deleteAssetCategory(id: string): Promise<boolean> {
    const affected = await this.categoryRepo.delete(id)
    if (affected === 0) {
      const existing = await this.categoryRepo.findById(id)
      if (existing?.isBuiltin) throw new Error('内置分类不可删除')
    }
    return affected > 0
  }

  /** 预览渲染模板选项（分类管理表单；值=DOCUMENT_TEMPLATES key） */
  listPreviewTemplates(): AssetPreviewTemplateOption[] {
    return Object.values(DOCUMENT_TEMPLATES).map(t => ({ value: t.id, label: t.name }))
  }

  /** 按资产 subCategory 命中分类定义 → 预览信息（未命中/auto → null） */
  async previewInfoFor(record: AssetRecord): Promise<{ previewable: boolean; mode: string; templateId: string | null } | null> {
    if (!record.subCategory) return null
    const def = await this.categoryRepo.findByName(record.subCategory)
    if (!def || !def.previewable || def.previewMode === ASSET_PREVIEW_MODES.auto) return null
    return { previewable: true, mode: def.previewMode, templateId: def.previewTemplateId ?? null }
  }

  /**
   * 渲染资产预览（分类定义驱动）：
   * - report 模式：markdown + 业务模板 → 长图 data URL（桌面端）/ HTML（Web 降级）
   * - markdown 模式：generic 模板渲染 HTML
   * - html 模式：原样返回内容
   * - text/json/image/audio/video/auto/none → null（前端按存储形态原生呈现）
   */
  async renderAssetPreview(record: AssetRecord): Promise<AssetPreviewResult | null> {
    const info = await this.previewInfoFor(record)
    if (!info) return null
    const mode = info.mode
    if (mode === ASSET_PREVIEW_MODES.text || mode === ASSET_PREVIEW_MODES.json
      || mode === ASSET_PREVIEW_MODES.image || mode === ASSET_PREVIEW_MODES.audio
      || mode === ASSET_PREVIEW_MODES.video || mode === ASSET_PREVIEW_MODES.none) {
      return null
    }
    // 需要渲染的内容：text 形态取 textContent；文件形态读取（md/html/txt 等）
    let content = record.textContent ?? ''
    if (!content && record.kind === ASSET_STORAGE_KINDS.file) {
      content = this.storage.readStoredText(record.storagePath)
    }
    if (!content.trim()) return null

    const tools = getDocumentTools()
    if (mode === ASSET_PREVIEW_MODES.html) {
      return { mode: 'html', html: content }
    }
    if (mode === ASSET_PREVIEW_MODES.report) {
      const template = DOCUMENT_TEMPLATES[info.templateId ?? ''] ?? DOCUMENT_TEMPLATES.generic
      if (tools.canRenderBinary()) {
        const img = await tools.renderImage({ markdown: content, template, title: record.name })
        return { mode: 'image', url: `data:image/png;base64,${img.buffer.toString('base64')}`, html: img.html }
      }
      const html = await tools.renderHtml({ markdown: content, template, title: record.name })
      return { mode: 'html', html }
    }
    // markdown 模式：generic 排版
    const html = await tools.renderHtml({ markdown: content, template: DOCUMENT_TEMPLATES.generic, title: record.name })
    return { mode: 'html', html }
  }

  /** 分类定义输入校验（report 模式模板必填；模板 ID 必须存在于注册表） */
  private assertCategoryInput(input: SaveAssetCategoryInput | (UpdateAssetCategoryInput & { name: string })): void {
    const name = (input as SaveAssetCategoryInput).name?.trim()
    if (!name) throw new Error('分类名不能为空')
    const mode = input.previewMode
    if (mode === ASSET_PREVIEW_MODES.report) {
      const tplId = input.previewTemplateId?.trim()
      if (!tplId) throw new Error('报告预览模式必须指定渲染模板')
      if (!DOCUMENT_TEMPLATES[tplId]) throw new Error(`渲染模板不存在: ${tplId}`)
    }
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
