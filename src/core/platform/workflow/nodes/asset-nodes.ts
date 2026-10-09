/**
 * 资产节点（保存资产 / 读取资产）
 * @module core/platform/workflow/nodes/asset-nodes
 * @description 工作流成果沉淀与复用：
 *              - save-asset：把上游输出（文件路径 / http(s) / data: / local-*:// 链接 /
 *                文本 / JSON）按分类保存到资产库，返回 assetId 供 read-asset 或会话卡片展示
 *              - read-asset：按资产 ID 读取（链接 / 本地路径 / 内容），供下游节点复用
 *
 *              架构铁律：节点是服务的薄适配器——文件落盘/DB 读写全部委托
 *              AssetService（workflow-boot 装配后经 asset-registry 取用）。
 */

import { ASSET_CATEGORIES, type AssetCategory } from '@shared/types/asset.types'
import { getAssetService } from '../../assets/asset-registry'
import { getWebCollectService } from '../../assets/web-collect-registry'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

/** 内容形态识别（kind=auto 时使用；保存语义下 http/data/local-* 一律落盘） */
function detectContentKind(value: string): 'file' | 'text' | 'json' {
  const v = value.trim()
  if (!v) return 'text'
  // 链接形态 → 落盘（下载/解码/复制）
  if (/^(https?|data):/i.test(v) || /^local-(image|file|video):\/\//i.test(v)) return 'file'
  // 路径形态 → 复制
  if (/^[A-Za-z]:[\\/]/.test(v) || v.startsWith('/') || v.startsWith('./') || v.startsWith('../') || v.includes('\\') || v.includes('/')) return 'file'
  // JSON 形态
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
    try {
      JSON.parse(v)
      return 'json'
    } catch {
      /* 非 JSON 按文本处理 */
    }
  }
  return 'text'
}

/** 解析分类配置：'auto'/空 → undefined（由服务按文件名探测） */
function resolveCategory(raw: string | undefined): AssetCategory | undefined {
  const v = raw?.trim()
  if (!v || v === 'auto') return undefined
  return v as AssetCategory
}

function parseTags(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(Boolean)
}

// ==================== 保存资产 ====================

const saveAssetNode: WorkflowNodeHandler = {
  type: 'save-asset',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'assetId', type: 'string', desc: '资产 ID（read-asset 节点引用）' },
    { key: 'name', type: 'string', desc: '资产名' },
    { key: 'category', type: 'string', desc: '资产大类' },
    { key: 'subCategory', type: 'string', desc: '资产子分类（资产中心二级分组）' },
    { key: 'kind', type: 'string', desc: '存储形态（file/url/text/json）' },
    { key: 'url', type: 'string', desc: '可访问链接（文件型/链接型）' },
  ],
  validateConfig(config) {
    const cfg = config as { content?: string; kind?: string; category?: string; passthrough?: unknown }
    const errors: string[] = []
    if (stringifyValue(cfg.content).trim() === '') errors.push('内容不能为空')
    const kind = cfg.kind ?? 'auto'
    if (!['auto', 'file', 'url', 'text', 'json'].includes(kind)) errors.push('内容形态不合法')
    const cat = cfg.category
    if (cat && cat !== 'auto' && !Object.values(ASSET_CATEGORIES).includes(cat as AssetCategory)) {
      errors.push('资产分类不合法')
    }
    if (cfg.passthrough !== undefined && (typeof cfg.passthrough !== 'object' || Array.isArray(cfg.passthrough))) {
      errors.push('passthrough 必须是对象（{字段: 值模板}）')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      content: string
      kind?: 'auto' | 'file' | 'url' | 'text' | 'json'
      category?: string
      subCategory?: string
      name?: string
      tags?: string
      description?: string
      enabled?: boolean
      groupName?: string
      /** 透传字段：{字段: 值}（引擎已解析模板），合并进输出——下游确认/重生成环节引用上游参数 */
      passthrough?: Record<string, unknown>
      /** 替换语义：保存新资产成功后删除被替换的旧资产（重生成场景用；旧资产文件一并删除） */
      replaceAssetId?: string
      /** 版本链（仅 text）：填目标资产 id 时，不为新资产，而是把内容追加为该资产的下一版本并就地更新其内容（修订模式） */
      versionOfAssetId?: string
      /** 新建资产时即记录 v1（后续修订运行以 versionOfAssetId 续链；不开则永不入链） */
      versioned?: boolean
      /** 版本说明（修订意见/阶段说明；入库 asset_versions.feedback） */
      feedback?: string
    }
    // 保存开关：false = 不落库（流程继续），输出空资产标记
    if (cfg.enabled === false) {
      return {
        status: 'succeeded',
        output: { assetId: '', name: '', category: '', subCategory: '', kind: '', url: '', skipped: true },
      }
    }
    const content = stringifyValue(cfg.content)
    const explicitKind = cfg.kind ?? 'auto'
    const kind = explicitKind === 'auto' ? detectContentKind(content) : explicitKind

    const service = getAssetService()

    // 版本链分支：versionOfAssetId 非空 → 追加为该 text 资产的下一版本并就地更新内容（不建新资产）
    const versionOf = stringifyValue(cfg.versionOfAssetId ?? '').trim()
    if (versionOf) {
      const { version } = await service.saveAssetVersion(versionOf, {
        content,
        feedback: stringifyValue(cfg.feedback ?? '') || undefined,
        createdBy: `workflow:${ctx.nodeId}`,
      })
      // 就地更新资产当前内容（版本链已留快照；失败不阻断——内容以版本链为准可再回滚）
      try {
        await service.updateAsset(versionOf, { textContent: content })
      } catch (e) {
        console.warn('[save-asset] 版本就地更新失败（版本快照已落）:', e)
      }
      const updated = await service.getAsset(versionOf)
      return {
        status: 'succeeded',
        output: {
          assetId: versionOf,
          name: updated?.name ?? '',
          category: updated?.category ?? '',
          subCategory: updated?.subCategory ?? '',
          kind: updated?.kind ?? 'text',
          url: updated ? service.assetPreviewUrl(updated) : '',
          version,
          versioned: true,
          ...(cfg.passthrough ?? {}),
        },
      }
    }

    const record = await service.createAsset({
      category: resolveCategory(cfg.category),
      subCategory: cfg.subCategory?.trim() || undefined,
      name: cfg.name?.trim() || undefined,
      description: cfg.description,
      tags: parseTags(cfg.tags),
      content:
        kind === 'url'
          ? { kind: 'url', url: content }
          : kind === 'json'
            ? { kind: 'json', json: content }
            : kind === 'text'
              ? { kind: 'text', text: content }
              : { kind: 'file', path: content },
      sourceType: 'workflow',
      sourceRef: ctx.runId,
      groupName: cfg.groupName?.trim() || undefined,
    })

    // 替换语义：新资产保存成功后删除旧资产（重生成替换，避免同图新旧并存）
    let replacedId = ''
    const oldId = cfg.replaceAssetId?.trim()
    if (oldId && oldId !== record.id) {
      try {
        const ok = await service.deleteAsset(oldId)
        if (ok) replacedId = oldId
      } catch (e) {
        // 旧资产删除失败不阻断流程（孤儿资产由资产中心手动清理）
        console.warn('[save-asset] 替换删除旧资产失败（忽略）:', oldId, e)
      }
    }

    // 首次入链：versioned=true 且文本型 → 记录 v1，供后续修订运行以 versionOfAssetId 续链
    let firstVersion: number | undefined
    if (record.kind === 'text' && cfg.versioned === true) {
      try {
        firstVersion = (await service.saveAssetVersion(record.id, {
          content,
          feedback: stringifyValue(cfg.feedback ?? ''),
          createdBy: `workflow:${ctx.nodeId}`,
        })).version
      } catch (e) {
        console.warn('[save-asset] v1 版本落链失败（不阻断保存）:', e)
      }
    }

    return {
      status: 'succeeded',
      output: {
        assetId: record.id,
        name: record.name,
        category: record.category,
        subCategory: record.subCategory ?? '',
        kind: record.kind,
        url: service.assetPreviewUrl(record),
        groupId: record.groupId ?? '',
        ...(firstVersion !== undefined ? { version: firstVersion, versioned: true } : {}),
        ...(replacedId ? { replacedAssetId: replacedId } : {}),
        ...(cfg.passthrough ?? {}),
      },
    }
  },
}

// ==================== 读取资产 ====================

const readAssetNode: WorkflowNodeHandler = {
  type: 'read-asset',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'assetId', type: 'string', desc: '资产 ID' },
    { key: 'name', type: 'string', desc: '资产名' },
    { key: 'category', type: 'string', desc: '资产大类' },
    { key: 'subCategory', type: 'string', desc: '资产子分类（资产中心二级分组）' },
    { key: 'kind', type: 'string', desc: '存储形态' },
    { key: 'tags', type: 'json', desc: '标签数组' },
    { key: 'description', type: 'string', desc: '资产描述' },
    { key: 'url', type: 'string', desc: '可访问链接（url 模式）' },
    { key: 'path', type: 'string', desc: '本地文件路径（path 模式，文件型）' },
    { key: 'content', type: 'string', desc: '文本内容（content 模式，text 型）' },
    { key: 'json', type: 'json', desc: '结构化内容（content 模式，json 型）' },
  ],
  validateConfig(config) {
    const cfg = config as { assetId?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.assetId).trim() === '') errors.push('资产 ID 不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { assetId: string; output?: 'url' | 'path' | 'content' | 'metadata' }
    const assetId = stringifyValue(cfg.assetId).trim()
    const mode = cfg.output ?? 'url'

    const service = getAssetService()
    const record = await service.getAsset(assetId)
    if (!record) {
      return { status: 'failed', error: `资产不存在: ${assetId}`, retryable: false }
    }

    const out: Record<string, unknown> = {
      assetId: record.id,
      name: record.name,
      category: record.category,
      subCategory: record.subCategory ?? '',
      kind: record.kind,
      tags: record.tags ?? [],
      description: record.description ?? '',
      url: '',
      path: '',
      content: '',
      json: null,
    }
    if (mode === 'url' || mode === 'metadata') {
      out.url = service.assetPreviewUrl(record)
    }
    if (mode === 'path' || mode === 'metadata') {
      out.path = service.resolveAssetPath(record)
    }
    if (mode === 'content' || mode === 'metadata') {
      if (record.kind === 'text') {
        out.content = record.textContent ?? ''
      } else if (record.kind === 'json' && record.jsonContent) {
        try {
          out.json = JSON.parse(record.jsonContent)
        } catch {
          out.json = null
        }
      }
    }
    if (mode === 'metadata') {
      out.sizeBytes = record.sizeBytes
      out.mimeType = record.mimeType
      out.createdAt = record.createdAt
      out.metadata = record.metadata
      out.sourceRef = record.sourceRef
    }
    return { status: 'succeeded', output: out }
  },
}

// ==================== 读取多个资产（引用资产已有内容） ====================

/**
 * 归一化资产 id：数组原样；JSON 数组字符串 / 逗号 / 空白分隔 → 字符串数组。
 */
function normalizeAssetIds(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(x => String(x).trim()).filter(Boolean)
  if (input === undefined || input === null) return []
  const s = String(input).trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.map((x: unknown) => String(x).trim()).filter(Boolean)
  } catch { /* 非 JSON 数组 */ }
  return s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean)
}

const readAssetsNode: WorkflowNodeHandler = {
  type: 'read-assets',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'count', type: 'number', desc: '成功读取的资产数（含缺失跳过）' },
    { key: 'assets', type: 'json', desc: '资产明细 [{ assetId,name,category,subCategory,kind,tags,description,url,path,content }]' },
    { key: 'texts', type: 'json', desc: '文本型资产正文数组（与 assets 顺序一致）' },
    { key: 'textJoined', type: 'string', desc: '所有文本正文合并（供 LLM 引用）' },
    { key: 'imagePaths', type: 'json', desc: '图片/文件型本地路径数组（作参考图/底图候选）' },
    { key: 'imageUrls', type: 'json', desc: '图片/文件型可访问链接数组' },
    { key: 'missingIds', type: 'json', desc: '未找到的资产 id' },
  ],
  validateConfig(config) {
    void (config as { assetIds?: unknown }) // assetIds 可为空：未选择资产时静默通过
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { assetIds?: unknown }
    const ids = normalizeAssetIds(cfg.assetIds)
    const service = getAssetService()
    const assets: Array<Record<string, unknown>> = []
    const texts: string[] = []
    const imagePaths: string[] = []
    const imageUrls: string[] = []
    const missingIds: string[] = []
    for (const id of ids) {
      const record = await service.getAsset(id)
      if (!record) {
        missingIds.push(id)
        continue
      }
      const path = service.resolveAssetPath(record)
      const url = service.assetPreviewUrl(record)
      const item: Record<string, unknown> = {
        assetId: record.id,
        name: record.name,
        category: record.category,
        subCategory: record.subCategory ?? '',
        kind: record.kind,
        tags: record.tags ?? [],
        description: record.description ?? '',
        url,
        path: path ?? '',
      }
      if (record.kind === 'text') {
        const content = record.textContent ?? ''
        item.content = content
        texts.push(content)
      } else if (record.kind === 'json' && record.jsonContent) {
        item.content = record.jsonContent
        texts.push(record.jsonContent)
      } else if (record.kind === 'file') {
        if (record.category === 'image' || /^image\//.test(record.mimeType ?? '')) {
          imagePaths.push(path ?? '')
          imageUrls.push(url)
        }
      }
      assets.push(item)
    }
    return {
      status: 'succeeded',
      output: {
        count: assets.length,
        assets,
        texts,
        textJoined: texts.join('\n\n'),
        imagePaths,
        imageUrls,
        missingIds,
      },
    }
  },
}

// ==================== 收藏网页 ====================

/**
 * 把网页收藏为资产中心「网页收藏」资产（single-file html + markdown 正文）。
 * 节点是薄适配器：抓取/内联/入库全部委托 WebCollectService（save-asset 之外的
 * 网页专属语义——自动 title/正文提取、固定 网页收藏 分类，画布上无需配 kind/分类）。
 */
const collectWebpageNode: WorkflowNodeHandler = {
  type: 'collect-webpage',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'assetId', type: 'string', desc: '资产 ID' },
    { key: 'name', type: 'string', desc: '资产名（网页标题.html）' },
    { key: 'category', type: 'string', desc: '资产大类（document）' },
    { key: 'subCategory', type: 'string', desc: '资产子分类（网页收藏）' },
    { key: 'url', type: 'string', desc: '资产可访问链接' },
    { key: 'markdownChars', type: 'number', desc: 'markdown 正文字符数' },
    { key: 'sourceUrl', type: 'string', desc: '原始网页 URL' },
    { key: 'skipped', type: 'boolean', desc: '该 URL 已收藏且策略为跳过（true=未改写）' },
    { key: 'warnings', type: 'json', desc: '资源内联失败提示（可选）' },
  ],
  validateConfig(config) {
    const errors: string[] = []
    if (stringifyValue((config as { url?: string }).url).trim() === '') errors.push('网页 URL 不能为空')
    const policy = (config as { existingPolicy?: string }).existingPolicy
    if (policy !== undefined && policy !== '' && policy !== 'skip' && policy !== 'replace') {
      errors.push('重复 URL 策略不合法')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      url?: string
      title?: string
      tags?: string
      description?: string
      enabled?: boolean
      existingPolicy?: 'skip' | 'replace'
    }
    if (cfg.enabled === false) {
      return {
        status: 'succeeded',
        output: { assetId: '', name: '', category: '', subCategory: '', url: '', markdownChars: 0, sourceUrl: '', skipped: true },
      }
    }
    const service = getWebCollectService()
    const result = await service.collectWebpage({
      url: stringifyValue(cfg.url),
      title: cfg.title?.trim() || undefined,
      description: cfg.description?.trim() || undefined,
      tags: parseTags(cfg.tags),
      existingPolicy: cfg.existingPolicy === 'replace' ? 'replace' : 'skip',
      sourceType: 'workflow',
      sourceRef: ctx.runId,
    })
    const record = result.record
    return {
      status: 'succeeded',
      output: {
        assetId: record.id,
        name: record.name,
        category: record.category,
        subCategory: record.subCategory ?? '网页收藏',
        url: getAssetService().assetPreviewUrl(record),
        markdownChars: result.skipped
          ? (typeof record.metadata?.markdownChars === 'number' ? record.metadata.markdownChars : result.markdown.length)
          : result.markdown.length,
        sourceUrl: String(record.metadata?.sourceUrl ?? cfg.url),
        skipped: result.skipped,
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      },
    }
  },
}

/** 资产节点集合 */
export const ASSET_NODE_HANDLERS: WorkflowNodeHandler[] = [saveAssetNode, readAssetNode, readAssetsNode, collectWebpageNode]
