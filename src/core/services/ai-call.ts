/**
 * 公共 AI 调用层
 * @module core/services/ai-call
 * @description 供全系统复用的 LLM/VLM 调用入口（自 episode-production/narrative/ai/_helpers
 *              提升为公共层——该文件原为 narrative 私有工具，已有 5 个跨模块借用者）。
 *
 *              能力：
 *              - getProviderConfig：Provider 解析（指定ID→默认→首个启用 + 密钥解密）
 *              - callAI / callAIWithContinue / callVLM：非流式调用（JSON 续写容错）
 *              - callAIStream：流式调用（AbortSignal 真取消 + 增量回调）
 *              - 统一 modelId fallback 链：显式传入 → config.defaultModel →
 *                用户启用的首个文本模型 → 模板内置模型
 *              - extractJsonFromResponse 等响应解析工具
 *
 *              日志走 createLogger('ai-call') 结构化落盘。
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
  const cleaned = jsonStr
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
 * 检测 JSON 是否被截断（末尾没有正确闭合）
 */
export function isJsonTruncated(response: string): boolean {
  // 提取可能的 JSON 部分
  const start = response.indexOf('{')
  if (start === -1) return false

  const jsonPart = response.substring(start)

  // 统计括号数量
  let braceCount = 0
  let bracketCount = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < jsonPart.length; i++) {
    const char = jsonPart[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"' && !escapeNext) {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') braceCount++
      if (char === '}') braceCount--
      if (char === '[') bracketCount++
      if (char === ']') bracketCount--
    }
  }

  // 如果括号没有闭合，说明被截断
  return braceCount > 0 || bracketCount > 0
}

/**
 * 调用 AI 并支持续写（当输出被截断时自动继续）
 * @param prompt 用户提示词
 * @param systemPrompt 系统提示词
 * @param maxTokens 最大 token 数
 * @param providerConfigId 提供商配置 ID
 * @param modelId 模型 ID
 * @param maxContinues 最大续写次数（默认 2）
 * @returns AI 响应内容（可能经过拼接）
 */
export async function callAIWithContinue(
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 8192,
  providerConfigId?: string,
  modelId?: string,
  maxContinues: number = 2
): Promise<string> {
  let fullResponse = await callAI(prompt, systemPrompt, maxTokens, providerConfigId, modelId)

  let continueCount = 0
  while (continueCount < maxContinues && isJsonTruncated(fullResponse)) {
    aiLogger.warn('JSON 输出被截断，尝试续写', { continueCount, responseLength: fullResponse.length })

    // 提取已输出的 JSON 部分（去掉可能的非 JSON 内容）
    const start = fullResponse.indexOf('{')
    const jsonSoFar = start !== -1 ? fullResponse.substring(start) : fullResponse

    // 续写提示
    const continuePrompt = `上一轮你的 JSON 输出被截断了，请继续输出，从上次截断的地方继续完成 JSON。

这是你上次输出的内容（被截断）：
${jsonSoFar}

请直接继续输出剩余的 JSON 内容，不要重复已经输出的部分，不要添加任何解释说明。`

    const continueResponse = await callAI(continuePrompt, systemPrompt, maxTokens, providerConfigId, modelId)

    // 拼接：去掉可能的重复开头
    const continueStart = continueResponse.indexOf('{')
    if (continueStart !== -1) {
      // 检查续写内容是否重复了开头
      const continueJson = continueResponse.substring(continueStart)
      // 如果续写内容开头和已输出内容开头重复，尝试智能拼接
      if (jsonSoFar.startsWith(continueJson.substring(0, 50))) {
        // 重复了，只取续写的新部分
        fullResponse = fullResponse.trimEnd() + '\n' + continueJson
      } else {
        // 没重复，直接拼接
        fullResponse = fullResponse.trimEnd() + continueJson
      }
    } else {
      fullResponse = fullResponse.trimEnd() + continueResponse
    }

    continueCount++
  }

  return fullResponse
}

/**
 * 从 AI 响应中提取 JSON
 * 支持 ```json```、``` 代码块及裸 JSON 三种格式
 */
export function extractJsonFromResponse(response: string): any {
  console.log('[EpisodeProductionAI] AI 响应长度:', response.length)
  console.log('[EpisodeProductionAI] AI 响应前500字符:', response.substring(0, 500))

  // 清理响应内容
  const cleanedResponse = response.trim()

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


// ==================== 流式调用（可取消） ====================

/** 流式调用选项 */
export interface CallAIStreamOptions {
  prompt: string
  systemPrompt?: string
  maxTokens?: number
  providerConfigId?: string
  modelId?: string
  temperature?: number
  /** 取消信号（AbortSignal 真中断——所有 provider 实现均支持） */
  signal?: AbortSignal
  /** 增量回调（每个 delta 触发一次） */
  onDelta?: (delta: string) => void
}

/** 流式调用结果 */
export interface CallAIStreamResult {
  content: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

/**
 * 流式调用 AI（与 callAI 同一 fallback 链；支持取消与增量回调）。
 * 工作流 llm-chat 节点等需要取消/进度推送的场景使用。
 */
export async function callAIStream(opts: CallAIStreamOptions): Promise<CallAIStreamResult> {
  const providerInfo = await getProviderConfig(opts.providerConfigId)
  if (!providerInfo) {
    throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
  }
  const { config, template, apiKey } = providerInfo

  // 与 callAI 一致的 modelId fallback 链
  // @ts-expect-error UserProviderConfig 暂无 defaultModel 字段（历史遗留访问）
  const fromConfigDefault: string | undefined = config.defaultModel
  const fromUserModels = pickFirstChatModelId(config.models as any)
  const fromTemplateModels = pickFirstChatModelId((template as any).models)
  const effectiveModelId =
    opts.modelId || fromConfigDefault || fromUserModels || fromTemplateModels
  if (!effectiveModelId) {
    throw new Error('未指定模型 — 请在 设置 → 提供商配置 中为该提供商启用至少一个文本/对话模型')
  }

  const provider = createProvider(
    template.id,
    { apiKey, baseUrl: config.baseUrl, defaultModel: effectiveModelId },
    template,
    config
  )

  const context: ChatContext = {
    systemPrompt: opts.systemPrompt ?? '',
    messages: [{ role: 'user', content: opts.prompt }],
  }

  const t0 = Date.now()
  let usage: CallAIStreamResult['usage'] | undefined
  const content = await provider.chatStream(
    context,
    event => {
      if (event.type === 'delta' && event.content) {
        opts.onDelta?.(event.content)
      }
      if (event.type === 'done' && event.usage) {
        usage = event.usage
      }
    },
    opts.signal,
    {
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    }
  )

  aiLogger.info('stream 调用完成', {
    callType: 'stream',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    userPrompt: opts.prompt,
    responseLength: content.length,
    durationMs: Date.now() - t0,
  })

  return { content, usage }
}
