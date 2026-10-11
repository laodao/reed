/**
 * 资产业务服务
 * @module core/platform/assets/asset.service
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
import { AssetVersionRepository, type AssetVersionRecord } from '@core/database/repositories/asset-version.repository'
import { getPathProvider } from '@core/interfaces/path.interface'
import { AssetStorageService } from './asset-storage.service'
import { buildUrlShortcut, ensureExtension, sanitizeFileName, type AssetDownloadPayload, type AssetDownloadView } from './asset-download'
import { DOCUMENT_TEMPLATES } from '@core/platform/services/document-tools/templates'
import { getDocumentTools } from '@core/platform/services/document-tools/document-tools'

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
    private readonly versionRepo?: AssetVersionRepository,
  ) {}

  // ==================== 版本管理（append-only 版本链；文本型资产） ====================

  /** 追加一个版本：版本号自动取号；feedback 记录修订意见/阶段说明 */
  async saveAssetVersion(
    assetId: string,
    input: { content: string; feedback?: string; createdBy?: string },
  ): Promise<{ version: number }> {
    if (!this.versionRepo) throw new Error('版本仓储未装配（versionRepo 缺失）')
    const asset = await this.repo.findById(assetId)
    if (!asset) throw new Error(`资产不存在: ${assetId}`)
    if (asset.kind !== 'text') throw new Error('仅文本型资产支持版本管理（当前 kind=' + asset.kind + '）')
    const version = await this.versionRepo.nextVersion(assetId)
    await this.versionRepo.appendVersion({
      assetId,
      version,
      content: input.content,
      feedback: input.feedback ?? null,
      createdBy: input.createdBy ?? null,
    })
    return { version }
  }

  /** 列版本（新→旧，不含内容大字段） */
  async listAssetVersions(assetId: string): Promise<Array<Omit<AssetVersionRecord, 'content'>>> {
    if (!this.versionRepo) throw new Error('版本仓储未装配（versionRepo 缺失）')
    return this.versionRepo.listByAsset(assetId)
  }

  /** 取指定版本内容 */
  async getAssetVersion(assetId: string, version: number): Promise<AssetVersionRecord | null> {
    if (!this.versionRepo) throw new Error('版本仓储未装配（versionRepo 缺失）')
    return this.versionRepo.findByVersion(assetId, version)
  }

  /**
   * 回滚到指定版本：取历史版内容**另存为新版本**（append-only，不删不改任何历史行），
   * 并就地更新资产当前内容。
   */
  async rollbackAssetVersion(assetId: string, version: number, userId?: string): Promise<{ version: number }> {
    if (!this.versionRepo) throw new Error('版本仓储未装配（versionRepo 缺失）')
    const target = await this.versionRepo.findByVersion(assetId, version)
    if (!target) throw new Error(`版本不存在: v${version}`)
    const newVersion = await this.saveAssetVersion(assetId, {
      content: target.content,
      feedback: `回滚到 v${version}`,
      createdBy: userId ? `user:${userId}` : 'rollback',
    })
    await this.repo.update(assetId, { textContent: target.content } as never)
    return { version: newVersion.version }
  }

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

  /**
   * 按收藏源 URL 查最新一条「网页收藏」资产（幂等查重键：url 列）。
   */
  async findWebCollectBySourceUrl(url: string): Promise<AssetRecord | null> {
    const u = url.trim()
    if (!u) return null
    return this.repo.findLatestByUrl('document', '网页收藏', u)
  }

  /**
   * 按 url 列跨分类查最新一条资产（幂等查重键：url 列）。
   * save-asset 节点 dedupeUrl 用：同一原文链接无论存成什么业务分类都算已存在，
   * 支撑采集类工作流重跑/增量不产生重复资产。
   */
  async findAssetByUrl(url: string): Promise<AssetRecord | null> {
    return this.repo.findByUrl(url)
  }

  /**
   * 就地重写 file 型资产内容（网页收藏「更新快照」）：
   * 新内容（data: URL）落盘 → 删除旧文件 → 行内更新 storagePath/textContent/metadata 等。
   * 资产 ID 保持不变（关联引用不失效）；任何一步失败前不破坏旧档。
   */
  async updateAssetContent(
    id: string,
    input: {
      dataUrl: string
      name?: string
      textContent?: string | null
      metadata?: Record<string, unknown> | null
      sourceRef?: string | null
    },
  ): Promise<AssetRecord | null> {
    const existing = await this.repo.findById(id)
    if (!existing) throw new Error(`资产不存在: ${id}`)
    if (existing.isBuiltin) throw new Error('内置资产不可修改（可复制为自有后刷新）')

    const targetName = input.name?.trim() || existing.name
    const saved = await this.storage.saveFileFromSource(input.dataUrl, existing.category, targetName)
    // 新文件落盘成功后再删旧文件（删除失败不阻断——旧文件成孤儿由清理兜底，记录无损）
    if (existing.storagePath && existing.storagePath !== saved.storagePath) {
      this.storage.deleteStoredFile(existing.storagePath)
    }
    const updated = await this.repo.update(id, {
      name: targetName,
      storagePath: saved.storagePath,
      sizeBytes: saved.sizeBytes,
      mimeType: saved.mimeType,
      textContent: input.textContent !== undefined ? (input.textContent ?? null) : undefined,
      metadata: input.metadata !== undefined ? (input.metadata ?? null) : undefined,
      sourceRef: input.sourceRef !== undefined ? (input.sourceRef ?? null) : undefined,
    })
    return updated
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
      // 网页收藏等"文件 + 正文"形态：正文写入 text_content 列（删除随行清理）
      textContent = input.textContent?.trim() ? input.textContent : null
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

    // 附加元数据（调用方传入）与存储探测元数据合并，调用方优先
    if (input.metadata && Object.keys(input.metadata).length > 0) {
      metadata = { ...(metadata ?? {}), ...input.metadata }
    }

    const record = await this.repo.create({
      category: category as AssetCategory,
      subCategory: input.subCategory ?? null,
      name: name as string,
      description: input.description?.trim() || null,
      tags: input.tags ?? [],
      kind: content.kind,
      storagePath,
      // url 列：url 型取链接；file 型可携带源链接（网页收藏幂等键，见 SaveAssetInput.url）
      url: content.kind === 'url' ? url : (input.url?.trim() || null),
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
   * 资产下载载荷（按存储形态 + 当前视图生成文件名与内容）：
   * - view='preview'：若资产可渲染成长图（report 长图），下载渲染后的 PNG（"看啥下啥"）
   * - file：复制源文件（sourcePath=绝对路径，文件名取存储文件名）
   * - text：下载为 .md（内容 textContent）
   * - json：下载为 .json（内容 jsonContent）
   * - url ：下载为 .url 快捷方式（InternetShortcut）
   * view='source'/缺省按存储形态；无内容/无文件抛错（调用方提示）。
   */
  async buildDownloadPayload(record: AssetRecord, view?: AssetDownloadView): Promise<AssetDownloadPayload> {
    // 预览态（图界面）下载：report 长图 → 直接下载渲染图；渲染不出图则回退按存储形态
    if (view === 'preview') {
      const rendered = await this.renderAssetPreview(record)
      if (rendered && rendered.mode === 'image') {
        const base64 = rendered.url.replace(/^data:image\/[^;]+;base64,/, '')
        const mimeType = rendered.url.replace(/^data:([^;]+);.*$/, '$1') || 'image/png'
        return { fileName: ensureExtension(record.name, 'png'), kind: 'image', base64Data: base64, mimeType }
      }
    }
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
    // 需要渲染的内容：文件形态读磁盘文件全文（single-file 网页快照等"文件即主体"场景），
    // 文本形态读 text_content 列；文件缺失时回退 text_content（textContent 可为 md 正文伴存）。
    let content = ''
    if (record.kind === ASSET_STORAGE_KINDS.file) {
      content = (this.storage.readStoredText(record.storagePath) || record.textContent) ?? ''
    } else {
      content = record.textContent ?? ''
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

  /**
   * 把文本报告资产固化为长图图片资产（桌面端能力）：
   * markdown 内容 + 排版模板 → PNG → 复制进资产库为 image 资产。
   * 存量报告"补图"与工作流 save-img 产物的等价通道；Web 端无渲染器返回 null。
   * @param record 文本报告资产（kind=text）
   * @param opts.templateId DOCUMENT_TEMPLATES 键（缺省 generic）
   * @param opts.subCategory / name / tags 图片资产元数据
   * @param opts.sourceRef 来源 run（资产中心跳执行历史；缺省沿用原资产 sourceRef）
   */
  async materializeTextAsImage(
    record: AssetRecord,
    opts: { templateId?: string; subCategory?: string; name?: string; tags?: string[]; sourceRef?: string } = {}
  ): Promise<AssetRecord | null> {
    const content = record.textContent ?? ''
    if (!content.trim()) throw new Error('资产没有可渲染的文本内容')
    const tools = getDocumentTools()
    if (!tools.canRenderBinary()) return null // Web 无渲染器：跳过（不做降级 HTML）
    const templateId = opts.templateId ?? 'generic'
    const template = DOCUMENT_TEMPLATES[templateId]
    if (!template) throw new Error(`渲染模板不存在: ${templateId}`)
    const rendered = await tools.renderImage({ markdown: content, template, title: record.name })
    if (rendered.format !== 'image') return null
    // 临时 PNG → 经 createAsset(file) 复制进资产目录
    const pathMod = await import('path')
    const { mkdtempSync, writeFileSync, rmSync } = await import('fs')
    const tmpDir = mkdtempSync(pathMod.join(getPathProvider().getDataPath(), 'asset-materialize-'))
    const tmpFile = pathMod.join(tmpDir, `${Date.now().toString(36)}.png`)
    writeFileSync(tmpFile, rendered.buffer)
    try {
      return await this.createAsset({
        category: ASSET_CATEGORIES.image,
        subCategory: opts.subCategory?.trim() || undefined,
        name: opts.name?.trim() || `${record.name}-长图`,
        tags: opts.tags ?? [],
        content: { kind: 'file', path: tmpFile },
        sourceType: record.sourceType ?? undefined,
        sourceRef: opts.sourceRef ?? record.sourceRef ?? undefined,
        groupName: record.groupName ?? undefined,
      })
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
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
