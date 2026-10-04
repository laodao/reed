/**
 * 镜头画面生产节点（shot-visual）
 * @module core/platform/workflow/nodes/visual-nodes
 * @description 「短视频脚本生成视频」配图相关性的**核心承载节点**：把单个镜头的脚本语义
 *              变成一张能用/一支能剪的画面，按三层供给依次回退：
 *
 *                ① 真实视频素材（Pexels/Pixabay）→ 直接作为该镜片段（真实 B-roll）
 *                ② 真实图片素材                   → 首帧图（合成阶段做缓慢运镜）
 *                ③ AI 生成图（高质量模型）        → 视觉质检不过则按失败原因强化重试
 *
 *              每一层都过**相关性闸**：视觉模型对候选/结果按脚本语义打分（相关性 + 是否
 *              被画成文字/海报），低于阈值不采用、继续回退。全程降级链写入 note，
 *              绝不静默假装成功，也绝不因某一条路不可用而中断整场工作流。
 *
 *              架构纪律：节点是服务的薄适配器——检索/下载走 StockMediaService，
 *              文生图走 image-generate（与 image-gen 同一实现），质检走 ai-call 的 callVLM。
 */

import { callVLM, toImageDataUrl } from '@core/platform/services/ai-call'
import { StockMediaService } from '@core/platform/services/stock-media.service'
import { STOCK_PROVIDER_IDS, isStockProviderId } from '@core/platform/providers/stock'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getToolService } from '../tools/tool-registry'
import { stringifyValue } from '../engine/variable-resolver'
import { generateImages } from './image-generate'
import {
  NO_TEXT_NEGATIVE,
  VISUAL_QA_SYSTEM_PROMPT,
  buildGenerationPrompt,
  buildQaPrompt,
  buildRetryExtra,
  isGeneratedAcceptable,
  parseVisualQa,
  resolveSceneQueries,
  type VisualQaResult,
  type VisualShotSpec,
} from '../visual/visual-plan'
import type { StockMediaDownload, StockMediaKind, StockMediaProviderId } from '@shared/types/stock-media.types'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '../engine/node-handler'

/** 节点配置 */
interface ShotVisualConfig {
  // ── 镜头语义（由拆镜产物注入）──
  concept?: string
  subject?: string
  setting?: string
  searchQuery?: string
  altQueries?: unknown
  visual?: string
  shotSize?: string
  cameraMove?: string
  caption?: string
  duration?: number
  /** 预设画面风格文本（并入生成提示词） */
  styleText?: string

  // ── 真实素材层 ──
  /** auto=配置了凭据就检索；off=只走生成 */
  stockMode?: string
  stockProvider?: string
  /** 素材库凭据（设置 → 工具 → 凭据 中保存的 API Key 条目 id） */
  stockCredentialId?: string
  stockPerPage?: number
  stockMinWidth?: number
  stockMinDurationSec?: number
  /** 相关性闸阈值（真实素材） */
  stockMinScore?: number
  /** 素材种类偏好：auto=视频优先；video=只要视频；image=只要图片 */
  stockKind?: string
  /** 相关性选优最多下载几条候选 */
  stockMaxCandidates?: number

  // ── 生成兜底层 ──
  generateFallback?: boolean
  imageProviderConfigId?: string
  imageModelId?: string
  width?: number
  height?: number
  negativePrompt?: string
  referenceImages?: unknown
  maxAttempts?: number

  // ── 视觉质检层 ──
  qaProviderConfigId?: string
  qaModelId?: string
  /** 生成图相关性闸阈值 */
  minScore?: number
}

/** 归一化为字符串数组（数组原样；字符串按 JSON / 逗号 / 换行拆） */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => stringifyValue(x).trim()).filter(Boolean)
  const s = stringifyValue(v).trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s)
      if (Array.isArray(arr)) return arr.map(x => stringifyValue(x).trim()).filter(Boolean)
    } catch {
      /* 落到分隔符拆分 */
    }
  }
  return s
    .split(/[\n,，]/)
    .map(x => x.trim())
    .filter(Boolean)
}

/** 素材种类尝试顺序 */
function stockKindsToTry(pref: string | undefined): StockMediaKind[] {
  const v = String(pref || 'auto').toLowerCase()
  if (v === 'video') return ['video']
  if (v === 'image') return ['image']
  return ['video', 'image']
}

/** 素材库 id 解析（未知值回落清单首个，并留给 note 说明） */
function resolveStockProvider(v: unknown): StockMediaProviderId {
  return isStockProviderId(v) ? v : STOCK_PROVIDER_IDS[0]
}

/** 视觉质检一次；异常不抛出，返回 error 交由调用方决定是否放弃质检 */
async function runQa(
  ctx: WorkflowNodeContext,
  cfg: ShotVisualConfig,
  spec: VisualShotSpec,
  imagePathOrUrl: string,
): Promise<{ qa: VisualQaResult | null; error?: string }> {
  if (!cfg.qaProviderConfigId) return { qa: null, error: '未配置视觉质检模型' }
  try {
    const dataUrl = await toImageDataUrl(imagePathOrUrl)
    const text = await callVLM(
      buildQaPrompt(spec),
      dataUrl,
      VISUAL_QA_SYSTEM_PROMPT,
      1024,
      stringifyValue(cfg.qaProviderConfigId),
      cfg.qaModelId ? stringifyValue(cfg.qaModelId) : undefined,
    )
    const qa = parseVisualQa(text)
    return qa ? { qa } : { qa: null, error: `质检输出无法解析：${String(text).slice(0, 80)}` }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { qa: null, error: `${detail}（provider=${stringifyValue(cfg.qaProviderConfigId)}，model=${stringifyValue(cfg.qaModelId) || '默认'}）` }
  }
}

const shotVisualNode: WorkflowNodeHandler = {
  type: 'shot-visual',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'source', type: 'string', desc: '素材来源：stock-video / stock-image / generated' },
    { key: 'imagePath', type: 'string', desc: '首帧图本地绝对路径（真实图片或生成图）' },
    { key: 'imageUrl', type: 'string', desc: '首帧图可访问 URL（素材板展示用）' },
    { key: 'clipPath', type: 'string', desc: '真实视频素材本地绝对路径（可直接作为片段；无则空）' },
    { key: 'clipUrl', type: 'string', desc: '真实视频素材可访问 URL' },
    { key: 'relevance', type: 'number', desc: '相关性分 0-100（-1=未质检）' },
    { key: 'attempts', type: 'number', desc: '生成层实际尝试次数' },
    { key: 'provider', type: 'string', desc: '实际供给方（素材库 id 或图像 provider）' },
    { key: 'stockId', type: 'string', desc: '素材库素材 id（留痕）' },
    { key: 'pageUrl', type: 'string', desc: '素材出处页（授权留痕）' },
    { key: 'author', type: 'string', desc: '素材作者（留痕）' },
    { key: 'license', type: 'string', desc: '素材授权标识' },
    { key: 'searchQuery', type: 'string', desc: '实际生效的素材检索词' },
    { key: 'prompt', type: 'string', desc: '实际使用的文生图提示词（生成路径）' },
    { key: 'note', type: 'string', desc: '供给/降级链说明（如实记录）' },
  ],
  validateConfig(config) {
    const cfg = config as ShotVisualConfig
    const errors: string[] = []
    const hasSemantic = ['concept', 'subject', 'setting', 'visual'].some(
      k => stringifyValue((cfg as unknown as Record<string, unknown>)[k]).trim() !== '',
    )
    if (!hasSemantic) errors.push('至少需要提供 concept / subject / setting / visual 之一（镜头语义缺失无法配图）')
    if (cfg.generateFallback === false && !cfg.stockCredentialId) {
      errors.push('关闭生成兜底时必须提供素材库凭据（否则该镜无任何画面来源）')
    }
    if (cfg.generateFallback !== false && !cfg.imageModelId) {
      errors.push('必须指定图像模型（imageModelId）')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as ShotVisualConfig
    const spec: VisualShotSpec = {
      concept: stringifyValue(cfg.concept),
      subject: stringifyValue(cfg.subject),
      setting: stringifyValue(cfg.setting),
      searchQuery: stringifyValue(cfg.searchQuery),
      altQueries: toList(cfg.altQueries),
      visual: stringifyValue(cfg.visual),
      shotSize: stringifyValue(cfg.shotSize),
      cameraMove: stringifyValue(cfg.cameraMove),
    }
    const notes: string[] = []
    const duration = Number(cfg.duration) > 0 ? Number(cfg.duration) : 5
    const stockMinScore = Number(cfg.stockMinScore) > 0 ? Number(cfg.stockMinScore) : 60
    const genMinScore = Number(cfg.minScore) > 0 ? Number(cfg.minScore) : 60
    const maxAttempts = Number(cfg.maxAttempts) > 0 ? Math.min(4, Math.floor(Number(cfg.maxAttempts))) : 2

    // ─────────── ① / ② 真实素材层 ───────────
    const stockMode = String(cfg.stockMode || 'auto').toLowerCase()
    const credentialId = stringifyValue(cfg.stockCredentialId).trim()
    if (stockMode !== 'off' && credentialId) {
      const { primary, alts } = resolveSceneQueries(spec)
      if (!primary) {
        notes.push('该镜未解析出素材检索词（scene lexicon 未命中且拆镜未给 searchQuery），跳过真实素材层')
      } else {
        const provider = resolveStockProvider(cfg.stockProvider)
        try {
          const apiKey = await getToolService().resolveCredentialKey(credentialId)
          ctx.emitProgress(8, `检索真实素材：${primary}`)
          // 质检能力只探一次：失败后续候选不再重复调用（避免每个候选都撞同一个错）
          let qaUsable = !!cfg.qaProviderConfigId
          let qaError = ''
          for (const kind of stockKindsToTry(cfg.stockKind)) {
            if (!qaUsable && kind === 'video') {
              // 无质检时仍可用真实素材（检索词本身即强约束），但必须留痕
              notes.push('视觉质检模型不可用：真实素材按检索词命中直接采用')
            }
            const res = await StockMediaService.fetchCandidates({
              provider,
              apiKey,
              request: {
                query: primary,
                kind,
                perPage: Number(cfg.stockPerPage) > 0 ? Number(cfg.stockPerPage) : 8,
                orientation: 'portrait',
                minWidth: Number(cfg.stockMinWidth) > 0 ? Number(cfg.stockMinWidth) : 720,
                minDurationSec: kind === 'video'
                  ? (Number(cfg.stockMinDurationSec) > 0 ? Number(cfg.stockMinDurationSec) : 3)
                  : undefined,
              },
              altQueries: alts,
              maxDownloads: Number(cfg.stockMaxCandidates) > 0 ? Number(cfg.stockMaxCandidates) : 3,
            })
            if (res.downloads.length === 0) {
              notes.push(`真实${kind === 'video' ? '视频' : '图片'}素材未命中（检索词：${res.queriesTried.join(' / ')}）`)
              continue
            }
            // 相关性选优：逐条质检，取第一条过闸的；全部不过则记最优分
            let best: { d: StockMediaDownload; qa: VisualQaResult | null } | null = null
            for (const d of res.downloads) {
              const qaSource = d.item.previewUrl || (d.item.kind === 'image' ? d.absPath : '')
              let qa: VisualQaResult | null = null
              if (qaUsable && qaSource) {
                const qaRes = await runQa(ctx, cfg, spec, qaSource)
                if (qaRes.error) {
                  qaUsable = false
                  qaError = qaRes.error
                } else {
                  qa = qaRes.qa
                }
              }
              if (!best || (qa?.score ?? 0) > (best.qa?.score ?? 0)) best = { d, qa }
              if (!qaUsable) break // 质检不可用：采用首条（检索词命中即用）
              if (qa && !(qa.hasText && qa.score < 90) && qa.score >= stockMinScore) break
            }
            // 质检中途失效时必须在此留痕：下面若采用候选会直接 return，走不到循环外的统一留痕
            if (qaError) notes.push(`视觉质检不可用（按检索词命中直接采用）：${qaError}`)
            const chosen = best
            const usable = chosen && (!qaUsable || !chosen.qa || (!(chosen.qa.hasText && chosen.qa.score < 90) && chosen.qa.score >= stockMinScore))
            if (chosen && usable && qaUsable && !chosen.qa) {
              notes.push('候选素材无封面图可质检（视频未返回缩略图）：按检索词命中直接采用')
            }
            if (chosen && usable) {
              const item = chosen.d.item
              const isVideo = item.kind === 'video'
              notes.push(
                `真实${isVideo ? '视频' : '图片'}素材采用：${item.provider}#${item.id}（${item.width}×${item.height}` +
                  `${isVideo ? `，${item.durationSec}s` : ''}）｜检索词「${res.queryUsed}」｜授权：${item.license}` +
                  `${chosen.qa ? `｜相关性 ${chosen.qa.score}` : '｜未质检'}`,
              )
              ctx.emitProgress(100, notes[notes.length - 1])
              return {
                status: 'succeeded',
                output: {
                  source: isVideo ? 'stock-video' : 'stock-image',
                  imagePath: isVideo ? '' : chosen.d.absPath,
                  imageUrl: isVideo ? '' : finalUrl(chosen.d.relPath),
                  clipPath: isVideo ? chosen.d.absPath : '',
                  clipUrl: isVideo ? finalUrl(chosen.d.relPath) : '',
                  relevance: chosen.qa ? chosen.qa.score : -1,
                  attempts: 0,
                  provider: item.provider,
                  stockId: item.id,
                  pageUrl: item.pageUrl,
                  author: item.author || '',
                  license: item.license,
                  searchQuery: res.queryUsed,
                  prompt: '',
                  note: notes.join('；'),
                },
              }
            }
            const bestScore = chosen?.qa ? chosen.qa.score : -1
            notes.push(
              `真实${kind === 'video' ? '视频' : '图片'}候选 ${res.downloads.length} 条均未过相关性闸` +
                `（最优 ${bestScore < 0 ? '未质检' : bestScore} < 阈值 ${stockMinScore}）`,
            )
          }
          if (qaError) notes.push(`视觉质检调用失败：${qaError}`)
        } catch (e) {
          notes.push(`真实素材层不可用：${e instanceof Error ? e.message : String(e)}`)
        }
      }
    } else if (stockMode !== 'off') {
      notes.push('未提供素材库凭据（stockCredentialId）：跳过真实素材层')
    }

    // ─────────── ③ AI 生成兜底层（带质检重试） ───────────
    if (cfg.generateFallback === false) {
      return {
        status: 'failed',
        error: `真实素材未取到且已关闭生成兜底：${notes.join('；')}`,
        retryable: false,
      }
    }
    const styleText = stringifyValue(cfg.styleText)
    const negative = stringifyValue(cfg.negativePrompt) || NO_TEXT_NEGATIVE
    let bestGen: { imagePath: string; imageUrl: string; qa: VisualQaResult | null; prompt: string } | null = null
    let qaFailure = ''
    let attempts = 0
    let qaUsable = !!cfg.qaProviderConfigId
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt
      const extra = attempt > 1 ? buildRetryExtra(bestGen?.qa ?? null) : ''
      const prompt = buildGenerationPrompt(spec, { styleText, extra })
      ctx.emitProgress(20 + attempt * 10, `AI 生成画面（第 ${attempt}/${maxAttempts} 次）`)
      const out = await generateImages(
        {
          prompt,
          negativePrompt: negative,
          width: Number(cfg.width) > 0 ? Number(cfg.width) : undefined,
          height: Number(cfg.height) > 0 ? Number(cfg.height) : undefined,
          modelId: stringifyValue(cfg.imageModelId),
          ...(cfg.imageProviderConfigId ? { providerConfigId: stringifyValue(cfg.imageProviderConfigId) } : {}),
          referenceImages: cfg.referenceImages,
          promptExtend: false,
        },
        ctx,
      )
      const first = Array.isArray(out?.images) ? out.images[0] : undefined
      const imagePath = first?.path || ''
      const imageUrl = first?.localUrl || first?.url || ''
      if (!imagePath && !imageUrl) {
        // 服务返回空图：记为一次失败尝试（不静默产生空卡片），继续走重试/终判
        notes.push(`第 ${attempt} 次生成未返回图片（服务异常）`)
        continue
      }
      let qa: VisualQaResult | null = null
      if (qaUsable && imagePath) {
        const qaRes = await runQa(ctx, cfg, spec, imagePath)
        if (qaRes.error) {
          qaUsable = false
          qaFailure = qaRes.error
        } else {
          qa = qaRes.qa
        }
      }
      const candidate = { imagePath, imageUrl, qa, prompt }
      if (!bestGen || (qa?.score ?? -1) > (bestGen.qa?.score ?? -1)) bestGen = candidate
      if (isGeneratedAcceptable(qa, genMinScore)) {
        bestGen = candidate
        break
      }
      if (!qaUsable) break // 质检不可用：无重试依据，采用首版（留痕）
      notes.push(`第 ${attempt} 次生成未过质检（${qa ? `${qa.score} 分：${qa.reason}` : '无质检结果'}）`)
    }
    if (!bestGen) {
      return { status: 'failed', error: `镜头画面生产失败：${notes.join('；')}`, retryable: true }
    }
    if (qaFailure) notes.push(`视觉质检调用失败：${qaFailure}（已采用生成结果，未经质检）`)
    notes.push(
      `AI 生成采用：${bestGen.qa ? `相关性 ${bestGen.qa.score}` : '未质检'}｜尝试 ${attempts} 次｜模型 ${stringifyValue(cfg.imageModelId)}`,
    )
    ctx.emitProgress(100, notes[notes.length - 1])
    return {
      status: 'succeeded',
      output: {
        source: 'generated',
        imagePath: bestGen.imagePath,
        imageUrl: bestGen.imageUrl,
        clipPath: '',
        clipUrl: '',
        relevance: bestGen.qa ? bestGen.qa.score : -1,
        attempts,
        provider: stringifyValue(cfg.imageProviderConfigId) || 'image-service-default',
        stockId: '',
        pageUrl: '',
        author: '',
        license: '',
        searchQuery: '',
        prompt: bestGen.prompt,
        note: notes.join('；'),
      },
    }
  },
}

/** 本地相对路径 → 前端可加载 URL（按扩展名区分图片/视频协议；PathProvider 未注册时回落相对路径） */
function finalUrl(relPath: string): string {
  if (!relPath) return ''
  if (/^(local-[a-z]+:\/\/|https?:)/i.test(relPath)) return relPath
  const scheme = /\.(mp4|webm|mov)$/i.test(relPath) ? 'video' : 'image'
  try {
    return getPathProvider().toAssetUrl(relPath, scheme)
  } catch {
    return relPath
  }
}

/** 全部画面生产节点 */
export const VISUAL_NODE_HANDLERS: WorkflowNodeHandler[] = [shotVisualNode]