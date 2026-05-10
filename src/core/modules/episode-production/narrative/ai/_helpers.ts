/**
 * narrative/ai · 内部共享辅助函数
 * @module modules/episode-production/narrative/ai/_helpers
 * @description 供 EpisodeScriptGenerator 和 EpisodeStoryboardGenerator 共享的私有工具函数。
 *              拆自原 StoryToVideoAIService 私有方法：
 *              getProviderConfig / callAI / extractJsonFromResponse / parseJsonString
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createProvider } from '@core/providers'
import { PROVIDER_TEMPLATES } from '@core/services/provider-template.service'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { createLogger } from '@core/utils/logger'
import type { ProviderTemplate, UserProviderConfig, ChatContext } from '@shared/types'

const aiLogger = createLogger('ai-call')

// ==================== 类型 ====================

export interface ProviderInfo {
  config: UserProviderConfig
  template: ProviderTemplate
  apiKey: string
}

// ==================== 提供商配置 ====================

/**
 * 获取提供商配置
 * 按优先级查找：指定 ID → 默认 → 首个已启用
 */
export async function getProviderConfig(providerConfigId?: string): Promise<ProviderInfo | null> {
  const dbManager = getCoreDatabaseManager()
  if (!dbManager.providerConfigs) {
    return null
  }

  let config: UserProviderConfig | null = null

  // 如果指定了提供商配置 ID，优先使用
  if (providerConfigId) {
    config = await dbManager.providerConfigs.getById(providerConfigId)
  }

  // 如果没有指定或找不到，尝试获取默认提供商
  if (!config) {
    config = await dbManager.providerConfigs.getDefault()
  }

  // 如果没有默认，获取第一个启用的
  if (!config) {
    const enabledConfigs = await dbManager.providerConfigs.getEnabled()
    if (enabledConfigs.length > 0) {
      config = enabledConfigs[0]
    }
  }

  if (!config || !config.apiKey) {
    return null
  }

  // 获取模板
  const template = PROVIDER_TEMPLATES.find(t => t.id === config!.templateId)
  if (!template) {
    return null
  }

  // 解密 API 密钥
  const secureStorage = getSecureStorage()
  if (!secureStorage.isInitialized()) {
    await secureStorage.initialize()
  }
  const apiKey = secureStorage.decrypt(config.apiKey)

  return { config, template, apiKey }
}

// ==================== 模型选择 fallback ====================

/** 从 ModelDefinition[] 里挑第一个支持 chat 的文本模型 id；无则 undefined */
function pickFirstChatModelId(
  models: Array<{ id: string; type?: string; features?: string[] }> | undefined | null,
): string | undefined {
  if (!Array.isArray(models) || models.length === 0) return undefined
  // 优先 type='text' 且 features 含 'chat'
  const m =
    models.find(
      (x) => x?.id && (x.type === 'text' || !x.type) && Array.isArray(x.features) && x.features.includes('chat'),
    ) ??
    // 兜底：任意 type='text' 模型
    models.find((x) => x?.id && (x.type === 'text' || !x.type)) ??
    // 最弱兜底：第一个有 id 的
    models.find((x) => !!x?.id)
  return m?.id
}

// ==================== AI 调用 ====================

/**
 * 调用 AI 生成（非流式）
 */
export async function callAI(
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 8192,
  providerConfigId?: string,
  modelId?: string
): Promise<string> {
  const providerInfo = await getProviderConfig(providerConfigId)
  if (!providerInfo) {
    throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
  }

  const { config, template, apiKey } = providerInfo

  // 确定使用的模型 — fallback 链：
  //   1) 显式传入的 modelId
  //   2) config.defaultModel（历史字段，UserProviderConfig 类型没声明，但实际可能存在）
  //   3) 用户启用的第一个文本/对话模型（config.models）
  //   4) template 内置的第一个文本/对话模型（template.models）
  //   都没有 → throw 让上层报错，user 在配置面板里加一个模型即可
  // @ts-expect-error UserProviderConfig 暂无 defaultModel 字段（历史遗留访问）
  const fromConfigDefault: string | undefined = config.defaultModel
  const fromUserModels = pickFirstChatModelId(config.models as any)
  const fromTemplateModels = pickFirstChatModelId((template as any).models)
  const effectiveModelId = modelId || fromConfigDefault || fromUserModels || fromTemplateModels
  if (!effectiveModelId) {
    throw new Error(
      '未指定模型 — 请在 设置 → 提供商配置 中为该提供商启用至少一个文本/对话模型',
    )
  }

  // 创建 Provider 实例
  const provider = createProvider(
    template.id,
    {
      apiKey,
      baseUrl: config.baseUrl,
      defaultModel: effectiveModelId
    },
    template,
    config
  )

  // 构建消息上下文
  const context: ChatContext = {
    systemPrompt: systemPrompt,
    messages: [
      { role: 'user', content: prompt }
    ]
  }

  // 调用 AI（非流式）+ 结构化日志（2026-05-10 e2e 补充）
  const t0 = Date.now()
  let result: { success: boolean; content?: string; error?: string }
  try {
    // @ts-expect-error P3 修复 · BaseProvider.chatSync 签名仅接受 context（沿用原 service 的调用方式以保持行为一致）
    result = await provider.chatSync(context, { maxTokens })
  } catch (e: any) {
    aiLogger.error('text 调用失败', {
      callType: 'text',
      providerConfigId: config.id,
      modelId: effectiveModelId,
      systemPrompt,
      userPrompt: prompt,
      durationMs: Date.now() - t0,
      error: e?.message ?? String(e),
    })
    throw e
  }

  aiLogger.info('text 调用完成', {
    callType: 'text',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    systemPrompt,
    userPrompt: prompt,
    response: result.content,
    durationMs: Date.now() - t0,
    error: result.success ? undefined : result.error,
    maxTokens,
  })

  if (!result.success) {
    throw new Error(result.error || 'AI 调用失败')
  }

  return result.content || ''
}

/**
 * 调用 VLM（视觉语言模型）— 把 image 作为 base64 data URL 喂给模型并取文本输出。
 *
 * spec 2026-05-09 ep-redesign §3.2 D5 · P-22 follow-up：参考视频解析的 VLM 推断字段。
 *
 * 注意：依赖 provider 是否实际支持 vision（OpenAI gpt-4o / DashScope qwen-vl-max / GLM-4v / 等）。
 * 调用方负责选 modelId 为 vision 模型。
 */
export async function callVLM(
  prompt: string,
  imageDataUrl: string,
  systemPrompt: string,
  maxTokens: number = 2048,
  providerConfigId?: string,
  modelId?: string,
): Promise<string> {
  const providerInfo = await getProviderConfig(providerConfigId)
  if (!providerInfo) {
    throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
  }
  const { config, template, apiKey } = providerInfo

  // @ts-expect-error UserProviderConfig 暂无 defaultModel 字段（历史遗留访问）
  const fromConfigDefault: string | undefined = config.defaultModel
  const fromUserModels = pickFirstChatModelId(config.models as any)
  const fromTemplateModels = pickFirstChatModelId((template as any).models)
  const effectiveModelId = modelId || fromConfigDefault || fromUserModels || fromTemplateModels
  if (!effectiveModelId) {
    throw new Error('未指定模型 — 请选择 vision 模型（如 qwen-vl-max / gpt-4o）')
  }

  const provider = createProvider(
    template.id,
    { apiKey, baseUrl: config.baseUrl, defaultModel: effectiveModelId },
    template,
    config,
  )

  // multimodal content blocks（OpenAI / DashScope 兼容格式）
  const context: ChatContext = {
    systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', image_url: { url: imageDataUrl } },
        ] as any,
      },
    ],
  }

  const t0 = Date.now()
  let result: { success: boolean; content?: string; error?: string }
  try {
    // @ts-expect-error 同 callAI：BaseProvider.chatSync 签名兼容
    result = await provider.chatSync(context, { maxTokens })
  } catch (e: any) {
    aiLogger.error('vlm 调用失败', {
      callType: 'vlm',
      providerConfigId: config.id,
      modelId: effectiveModelId,
      systemPrompt,
      userPrompt: prompt,
      imageDataUrlLength: imageDataUrl.length,
      durationMs: Date.now() - t0,
      error: e?.message ?? String(e),
    })
    throw e
  }
  aiLogger.info('vlm 调用完成', {
    callType: 'vlm',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    systemPrompt,
    userPrompt: prompt,
    imageDataUrlLength: imageDataUrl.length,
    response: result.content,
    durationMs: Date.now() - t0,
    error: result.success ? undefined : result.error,
  })
  if (!result.success) throw new Error(result.error || 'VLM 调用失败')
  return result.content || ''
}

// ==================== JSON 解析 ====================

/**
 * 解析 JSON 字符串，处理 AI 常见格式问题
 */
export function parseJsonString(jsonStr: string): any {
  // 移除可能存在的注释（JSON 不支持注释，但有些 AI 会添加）
  let cleaned = jsonStr
    // 移除单行注释
    .replace(/\/\/.*$/gm, '')
    // 移除多行注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 移除尾随逗号（JSON 不支持）
    .replace(/,(\s*[}\]])/g, '$1')
    // 修复可能被转义的引号问题
    .replace(/\\'/g, "'")
    // 将中文引号转换为标准双引号（AI 经常在内容中使用中文引号）
    .replace(/"/g, '"')
    .replace(/"/g, '"')

  return JSON.parse(cleaned)
}

/**
 * 从 AI 响应中提取 JSON
 * 支持 ```json```、``` 代码块及裸 JSON 三种格式
 */
export function extractJsonFromResponse(response: string): any {
  console.log('[EpisodeProductionAI] AI 响应长度:', response.length)
  console.log('[EpisodeProductionAI] AI 响应前500字符:', response.substring(0, 500))

  // 清理响应内容
  let cleanedResponse = response.trim()

  // 尝试提取 ```json ... ``` 中的内容
  const jsonMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    try {
      return parseJsonString(jsonMatch[1].trim())
    } catch (e) {
      console.warn('[EpisodeProductionAI] 解析 ```json``` 块失败:', e)
    }
  }

  // 尝试提取 ``` ... ``` 中的内容
  const codeMatch = cleanedResponse.match(/```\s*([\s\S]*?)\s*```/)
  if (codeMatch) {
    try {
      return parseJsonString(codeMatch[1].trim())
    } catch (e) {
      console.warn('[EpisodeProductionAI] 解析 ``` 块失败:', e)
    }
  }

  // 尝试直接解析整个响应
  try {
    return parseJsonString(cleanedResponse)
  } catch (e) {
    // 尝试找到第一个 { 和最后一个 }
    const start = cleanedResponse.indexOf('{')
    const end = cleanedResponse.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const jsonStr = cleanedResponse.substring(start, end + 1)
        console.log('[EpisodeProductionAI] 尝试解析提取的 JSON，长度:', jsonStr.length)
        return parseJsonString(jsonStr)
      } catch (e2) {
        console.error('[EpisodeProductionAI] 解析提取的 JSON 失败:', e2)
        console.error('[EpisodeProductionAI] 提取的 JSON 前1000字符:', cleanedResponse.substring(start, Math.min(start + 1000, end + 1)))
      }
    }

    // 输出更详细的错误信息
    console.error('[EpisodeProductionAI] 无法解析 AI 响应为 JSON 格式')
    console.error('[EpisodeProductionAI] 响应内容（前2000字符）:', cleanedResponse.substring(0, 2000))
    throw new Error('无法解析 AI 响应为 JSON 格式，请检查 AI 模型是否支持 JSON 输出')
  }
}
