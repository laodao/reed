/**
 * AI 设定反推 client（spec 2026-05-07）
 * @module renderer/api/asset-setting-enrichment
 */

interface IpcResp<T> {
  success: boolean
  data?: T
  error?: string
}

export interface EnrichSummary {
  enrichedCount: { character: number; location: number; item: number }
  failures: Array<{ kind: 'character' | 'location' | 'item'; reason: string }>
}

export async function enrichAssetSettings(projectId: string): Promise<EnrichSummary> {
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.enrichSettings) {
    throw new Error('asset.enrichSettings IPC 未暴露')
  }
  const resp: IpcResp<EnrichSummary> = await api.enrichSettings({ projectId })
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || 'AI 设定反推失败')
  }
  return resp.data
}
