/**
 * AI Hub 模型发现服务
 * @module platform/aihub/models
 * @description GET /v1/models → ModelDefinition[] 映射并直写 ai-hub provider config。
 *
 *              关键点（N8）：provider-config:test 链路的 updateTestResult 不落 models，
 *              所以网关模型清单必须由登录/刷新流程直接写库（repo.update），不走 testConnection。
 *              分类一律读 data[].x-ai-hub.model_type（OpenAI 标准顶层没有 model_type，
 *              手册 §7.6.1 专门警告过）。
 */

import type {
  ModelDefinition,
  UserProviderConfig
} from '@shared/types/provider-template.types'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { aihubOpenAIRequest } from './aihub-client'
import { AIHUB_TEMPLATE_ID, type AihubModelListItem, type AihubSession } from './aihub.types'

/**
 * GET /v1/models → ModelDefinition[]
 * 一期只启用 chat / image / video；embedding / music / audio / rerank 不接（不做清单）。
 */
export async function fetchAihubModels(session: AihubSession): Promise<ModelDefinition[]> {
  const res = await aihubOpenAIRequest<{ object: string; data: AihubModelListItem[] }>({
    gatewayUrl: session.gatewayUrl,
    path: '/v1/models',
    jwt: session.jwt,
    timeoutMs: 15_000
  })

  const items = Array.isArray(res?.data) ? res.data : []
  const out: ModelDefinition[] = []

  for (const item of items) {
    if (!item?.id) continue
    const ext = item['x-ai-hub'] ?? {}
    const modelType = ext.model_type ?? 'chat'

    if (modelType === 'chat') {
      out.push({
        id: item.id,
        name: item.id,
        type: ext.supports_vision ? 'multimodal' : 'text',
        contextWindow: ext.context_length ?? 8192,
        maxOutputTokens: 4096,
        features: ext.supports_streaming === false ? ['chat'] : ['chat', 'streaming'],
        supportsTools: ext.supports_function_calling === true,
        supportsThinking: false
      })
    } else if (modelType === 'image' || modelType === 'video') {
      out.push({
        id: item.id,
        name: item.id,
        type: modelType,
        contextWindow: 0,
        maxOutputTokens: 0,
        features: [modelType]
      })
    }
    // embedding / music / audio / rerank：一期不接入，直接跳过
  }

  return out
}

/**
 * 拉取网关模型清单并直写 ai-hub config.models。
 * @returns 写入库的模型清单
 */
export async function refreshAihubModels(session: AihubSession): Promise<ModelDefinition[]> {
  const dbManager = getCoreDatabaseManager()
  if (!dbManager.providerConfigs) {
    throw new Error('数据库未初始化，无法写入 AI Hub 模型清单')
  }

  const models = await fetchAihubModels(session)
  const config = await findAihubConfig()
  if (!config) {
    throw new Error('AI Hub 提供商配置不存在（应先由登录流程自动创建）')
  }

  // 第一个 chat 模型作为默认文本模型（仅在当前未设置或已失效时兜底）
  const firstChat = models.find((m) => m.type === 'text' || m.type === 'multimodal')
  const defaultModelId =
    config.defaultModelId && models.some((m) => m.id === config.defaultModelId)
      ? config.defaultModelId
      : firstChat?.id

  await dbManager.providerConfigs.update(config.id, {
    models,
    ...(defaultModelId ? { defaultModelId } : {})
  })
  return models
}

/** 查找 ai-hub provider config（共享配置表，全局唯一一条） */
export async function findAihubConfig(): Promise<UserProviderConfig | null> {
  const dbManager = getCoreDatabaseManager()
  if (!dbManager.providerConfigs) return null
  const configs = await dbManager.providerConfigs.getByTemplateId(AIHUB_TEMPLATE_ID)
  return configs.length > 0 ? configs[0] : null
}

/** 解密 ai-hub config 中物化的 JWT（无/失败返回空串） */
export async function getMaterializedJwt(): Promise<string> {
  const config = await findAihubConfig()
  if (!config?.apiKey) return ''
  try {
    const secureStorage = getSecureStorage()
    if (!secureStorage.isInitialized()) await secureStorage.initialize()
    return secureStorage.decrypt(config.apiKey)
  } catch {
    return ''
  }
}
