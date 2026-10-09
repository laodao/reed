/**
 * 信息搜集：生产缺省依赖装配（全部惰性 import，避免把平台单例拖进测试/渲染端）
 * @module core/packs/info-collection/services/ic-defaults
 *
 * 引用面（均为平台既有设施，本模块只做形状适配，零业务逻辑）：
 * - repos  → getCoreDatabaseManager().ic*（五仓储；未就绪返回 null，服务层报中文错）
 * - llm    → generateCompletionText（simple-llm；purpose 区分用途/模型档）
 * - search → SearchEngineService 默认引擎 → 免 Key quick 引擎（ai-nodes web-search 同款优先级）
 * - fetch  → executeHttpFetch（自带 SSRF 闸门/超时/限长/重定向过闸，不另包超时）
 * - extract→ htmlToMarkdown（utils/html-to-markdown）
 * - kb     → KnowledgeBaseService.addDocument（自动落盘 + 切块 + 嵌入 + 倒排）
 */

import type { SearchEngineType } from '@shared/types/search-engine.types'
import type { IcFetchFn, IcKbPort, IcReposFn, IcSearchFn, IcLlmFn, IcDocumentFetchFn, IcAssetPort, IcVisionFn, IcVideoMetaFn, IcTranscribeFn, IcResolveVideoAudioFn } from './ic-deps'
import { executeHttpFetch } from '@core/platform/workflow/nodes/http-fetch'
import { htmlToMarkdown } from '@core/utils/html-to-markdown'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'

export const defaultIcRepos: IcReposFn = () => {
  const m = getCoreDatabaseManager()
  if (!m.icProjects || !m.icTasks || !m.icTaskPasses || !m.icSources || !m.icRows) return null
  return {
    projects: m.icProjects,
    tasks: m.icTasks,
    passes: m.icTaskPasses,
    sources: m.icSources,
    rows: m.icRows,
  }
}

export const defaultIcLlm = (purpose: string): IcLlmFn => async req => {
  const { generateCompletionText } = await import('@core/platform/services/simple-llm')
  return generateCompletionText(purpose, req)
}

/**
 * 引擎解析：用户默认配置优先，否则逐个尝试免 Key quick 引擎。
 * 逐引擎 + 相关性预筛（2026-10-09 真机实测：bing-web 免 key 抓取会退化成"首字搜索"，
 * 返回的 20 条全是门户噪音——某引擎结果全被 isCandidateRelevant 拦下时自动换下一个，
 * 全部失败才如实报错，绝不拿跑题结果烧抓取预算）。
 */
export const defaultIcSearch: IcSearchFn = async (query, maxResults) => {
  const { getSearchEngineService } = await import('@core/platform/services/search-engine.service')
  const { getQuickSearchEngines } = await import('@core/platform/providers/search')
  const { isCandidateRelevant } = await import('@shared/utils/info-collection-relevance')
  const service = getSearchEngineService()

  const candidates: Array<{ engineType: SearchEngineType; configId?: string }> = []
  const def = await service.getDefaultConfig()
  if (def) {
    candidates.push({ engineType: def.templateId, configId: def.id })
  } else {
    for (const q of getQuickSearchEngines()) {
      const t = (q as { templateId?: SearchEngineType; id?: SearchEngineType }).templateId
        ?? (q as { id?: SearchEngineType }).id
      if (t) candidates.push({ engineType: t })
    }
  }
  if (candidates.length === 0) return { items: [], error: '未配置任何搜索引擎（设置 → 搜索引擎）' }

  let lastError = '搜索失败'
  for (const c of candidates) {
    try {
      const resp = await service.search(query, c.engineType, c.configId, maxResults)
      if (!resp.success) {
        lastError = resp.error ?? `引擎 ${c.engineType} 搜索失败`
        continue
      }
      const items = resp.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet }))
      const relevant = items.filter(it => isCandidateRelevant(it.title, it.snippet, query))
      if (relevant.length > 0) return { items }
      lastError = `引擎 ${c.engineType} 的结果与查询不相关（已跳过）`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  return { items: [], error: lastError }
}

export const defaultIcFetch: IcFetchFn = async url => {
  try {
    const r = await executeHttpFetch(
      { method: 'GET', url, responseType: 'text', timeoutMs: 45_000 },
      AbortSignal.timeout(45_000),
    )
    if (!r.ok) return { ok: false, status: 0, body: '', error: r.error }
    const status = r.output.status
    return {
      ok: status >= 200 && status < 400,
      status,
      body: r.output.body,
      blocked: status === 403 || status === 429,
    }
  } catch (e) {
    return { ok: false, status: 0, body: '', error: e instanceof Error ? e.message : String(e) }
  }
}

export const defaultIcExtract = (html: string, baseUrl: string): string => htmlToMarkdown(html, baseUrl)

/**
 * 文档直链下载（多模态 M1）：executeHttpFetch file 模式——原件落盘临时目录 +
 * MIME/字节数回带，SSRF 闸门/重定向过闸/超时全部复用。资产服务建卡时会复制进
 * 统一资产目录（dataPath/assets/搜集资料/），临时文件由调用方清理。
 */
export const defaultIcDocumentFetch: IcDocumentFetchFn = async (url, opts) => {
  try {
    const r = await executeHttpFetch(
      { method: 'GET', url, responseType: 'file', timeoutMs: 120_000, headers: opts?.headers },
      AbortSignal.timeout(120_000),
    )
    if (!r.ok) return { ok: false, status: 0, error: r.error }
    const out = r.output
    const status = out.status
    if (status !== 200) return { ok: false, status, error: `HTTP ${status}` }
    if (!out.filePath) return { ok: false, status, error: '下载未产生文件' }
    return { ok: true, status, filePath: out.filePath, mimeType: out.mimeType, bytes: out.sizeBytes }
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 统一资产登记（getAssetService 平台单例；未装配时如实报错——服务层 fail-soft 降级为不建卡） */
export const defaultIcAssets: IcAssetPort = {  create: async input => {
    const { getAssetService } = await import('@core/platform/assets/asset-registry')
    const rec = await getAssetService().createAsset({
      category: input.category as never,
      subCategory: input.subCategory,
      name: input.name,
      tags: input.tags,
      content: { kind: 'file', path: input.filePath },
      url: input.url,
      textContent: input.textContent,
      metadata: input.metadata,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
    })
    return { id: rec.id }
  },
  remove: async id => {
    const { getAssetService } = await import('@core/platform/assets/asset-registry')
    await getAssetService().deleteAsset(id)
  },
  createText: async input => {
    const { getAssetService } = await import('@core/platform/assets/asset-registry')
    const rec = await getAssetService().createAsset({
      category: input.category as never,
      subCategory: input.subCategory,
      name: input.name,
      tags: input.tags,
      content: { kind: 'text', text: input.text },
      url: input.url,
      metadata: input.metadata,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
    })
    return { id: rec.id }
  },
}

let kbPort: IcKbPort | null = null
export const defaultIcKb: IcKbPort = {
  addDocument: async (kbId, doc) => {
    if (!kbPort) {
      const { KnowledgeBaseService } = await import('@core/platform/services/knowledge-base.service')
      const service = new KnowledgeBaseService()
      kbPort = {
        addDocument: async (id, d) => {
          const resp = await service.addDocument(id, {
            name: d.name,
            type: 'text',
            content: d.content,
            source: { type: 'workflow', id: d.sourceId },
          })
          if (!resp.success) return { documentId: null, error: resp.error }
          return { documentId: resp.data?.doc?.id ?? null }
        },
      }
    }
    return kbPort.addDocument(kbId, doc)
  },
}

/**
 * 视觉描述（多模态 M2）：宿主模型 + 平台多模态消息构建（FileService.buildMultimodalContent，
 * 与聊天页发图片同一链路）。模型不支持 vision 时 generateText 会报错——按 fail-soft 返回，
 * 调用方把图片资产标记"描述待补"。
 */
export const defaultIcVision: IcVisionFn = async req => {
  try {
    const [{ generateText }, harnessMod, fsMod] = await Promise.all([
      import('ai'),
      import('@core/platform/workflow/nodes/agent-loop-node'),
      import('node:fs/promises'),
      import('node:path'),
    ])
    const buf = await fsMod.readFile(req.imagePath)
    void req.mimeType // 下载响应头可能给 application/octet-stream；ai SDK ImagePart 自带嗅探，这里不再透传
    const harness = harnessMod.getAgentLoopHarness()
    const model = await harness.resolveModel({})
    // ai SDK 原生 image part（chat 的 MessageContent 类型与其不同，直接用 SDK 形状）
    const r = await generateText({
      model: model as never,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: req.prompt },
            { type: 'image', image: new Uint8Array(buf) },
          ],
        },
      ],
    })
    const text = (r.text ?? '').trim()
    if (!text) return { ok: false, error: '视觉模型返回空描述' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}


/**
 * 视频页元数据+字幕（多模态 M3 元数据档）：B站公开 view API（复用平台 video-url-resolver
 * 的会话与 BV 提取）。CC 字幕在 view 响应的 subtitle 字段里，匿名可取时拉全文；
 * 拿不到就如实缺省（不做 ASR——那是 M4）。不下载视频原件。
 */
export const defaultIcVideoMeta: IcVideoMetaFn = async url => {
  try {
    const [{ extractBilibiliBvid, getBilibiliSession }] = await Promise.all([
      import('@core/platform/workflow/tools/video-url-resolver'),
    ])
    const bvid = extractBilibiliBvid(url)
    if (!bvid) return { ok: false, platform: 'bilibili', error: '未能从 URL 提取 BV 号' }
    const session = await getBilibiliSession()
    const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://www.bilibili.com/',
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return { ok: false, platform: 'bilibili', error: `B站 API HTTP ${res.status}` }
    const data = (await res.json()) as {
      code: number
      data?: {
        title?: string
        desc?: string
        owner?: { name?: string }
        duration?: number
        subtitle?: { list?: Array<{ subtitle_url?: string; lan?: string }> }
      }
    }
    if (data.code !== 0 || !data.data) return { ok: false, platform: 'bilibili', error: `B站 API code=${data.code}` }
    const d = data.data
    let subtitleText: string | undefined
    const sub = d.subtitle?.list?.[0]
    if (sub?.subtitle_url) {
      try {
        const subUrl = sub.subtitle_url.startsWith('//') ? `https:${sub.subtitle_url}` : sub.subtitle_url
        const subRes = await fetch(subUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
          signal: AbortSignal.timeout(20_000),
        })
        if (subRes.ok) {
          const json = (await subRes.json()) as { body?: Array<{ from?: number; to?: number; content?: string }> }
          const lines = (json.body ?? []).map(l => l.content?.trim()).filter((t): t is string => !!t)
          if (lines.length > 0) subtitleText = lines.join('\n')
        }
      } catch {
        /* 字幕拉取失败不影响元数据（如实缺省） */
      }
    }
    return {
      ok: true,
      platform: 'bilibili',
      title: d.title,
      desc: d.desc,
      owner: d.owner?.name,
      durationSec: d.duration,
      subtitleText,
    }
  } catch (e) {
    return { ok: false, platform: 'bilibili', error: e instanceof Error ? e.message : String(e) }
  }
}


/** 音频转写（多模态 M4）：按用户设置走本地 whisper / 云 API；off 时如实未启用 */
export const defaultIcTranscribe: IcTranscribeFn = async req => {
  const { readTranscribeConfig, transcribeAudioFile } = await import('./ic-transcribe.service')
  const cfg = await readTranscribeConfig()
  return transcribeAudioFile(cfg, req.audioPath, { language: req.language })
}


/** 视频音频直链解析（M4）：平台 video-url-resolver 的 B站 DASH 音频解析（带 Referer 防盗链头） */
export const defaultIcResolveVideoAudio: IcResolveVideoAudioFn = async url => {
  const { resolveVideoSource } = await import('@core/platform/workflow/tools/video-url-resolver')
  const resolved = await resolveVideoSource(url)
  if (resolved.kind !== 'bilibili' || !resolved.url) {
    return { ok: false, error: '未能解析出音频直链' }
  }
  return { ok: true, audioUrl: resolved.url, headers: resolved.headers }
}
