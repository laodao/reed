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
import type { IcFetchFn, IcKbPort, IcReposFn, IcSearchFn, IcLlmFn } from './ic-deps'
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

/** 引擎解析：用户默认配置 → 免 Key quick 引擎（ai-nodes web-search 同款优先级的 M1 子集） */
export const defaultIcSearch: IcSearchFn = async (query, maxResults) => {
  const { getSearchEngineService } = await import('@core/platform/services/search-engine.service')
  const { getQuickSearchEngines } = await import('@core/platform/providers/search')
  const service = getSearchEngineService()
  let engineType: SearchEngineType | undefined
  let configId: string | undefined
  const def = await service.getDefaultConfig()
  if (def) {
    engineType = def.templateId
    configId = def.id
  } else {
    const quick = getQuickSearchEngines()
    const first = quick[0] as { templateId?: SearchEngineType; id?: SearchEngineType } | undefined
    engineType = first?.templateId ?? first?.id
    if (!engineType) return { items: [], error: '未配置任何搜索引擎（设置 → 搜索引擎）' }
  }
  const resp = await service.search(query, engineType, configId, maxResults)
  if (!resp.success) return { items: [], error: resp.error ?? '搜索失败' }
  return { items: resp.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })) }
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
