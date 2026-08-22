/**
 * 资产节点（保存资产 / 读取资产）
 * @module core/modules/workflow/nodes/asset-nodes
 * @description 工作流成果沉淀与复用：
 *              - save-asset：把上游输出（文件路径 / http(s) / data: / local-*:// 链接 /
 *                文本 / JSON）按分类保存到资产库，返回 assetId 供 read-asset 或会话卡片展示
 *              - read-asset：按资产 ID 读取（链接 / 本地路径 / 内容），供下游节点复用
 *
 *              架构铁律：节点是服务的薄适配器——文件落盘/DB 读写全部委托
 *              AssetService（workflow-boot 装配后经 asset-registry 取用）。
 */

import { ASSET_CATEGORIES, type AssetCategory, type AssetRecord } from '@shared/types/asset.types'
import { getAssetService } from '../../assets/asset-registry'
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
    const cfg = config as { content?: string; kind?: string; category?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.content).trim() === '') errors.push('内容不能为空')
    const kind = cfg.kind ?? 'auto'
    if (!['auto', 'file', 'url', 'text', 'json'].includes(kind)) errors.push('内容形态不合法')
    const cat = cfg.category
    if (cat && cat !== 'auto' && !Object.values(ASSET_CATEGORIES).includes(cat as AssetCategory)) {
      errors.push('资产分类不合法')
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
    }
    const content = stringifyValue(cfg.content)
    const explicitKind = cfg.kind ?? 'auto'
    const kind = explicitKind === 'auto' ? detectContentKind(content) : explicitKind

    const service = getAssetService()
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
    })

    return {
      status: 'succeeded',
      output: {
        assetId: record.id,
        name: record.name,
        category: record.category,
        subCategory: record.subCategory ?? '',
        kind: record.kind,
        url: service.assetPreviewUrl(record),
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
    { key: 'kind', type: 'string', desc: '存储形态' },
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
      kind: record.kind,
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
      out.tags = record.tags
      out.description = record.description
      out.createdAt = record.createdAt
      out.metadata = record.metadata
    }
    return { status: 'succeeded', output: out }
  },
}

/** 资产节点集合 */
export const ASSET_NODE_HANDLERS: WorkflowNodeHandler[] = [saveAssetNode, readAssetNode]
