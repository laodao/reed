/**
 * 公共 AI 调用层
 * @module core/platform/services/ai-call
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
import { createProvider } from '@core/platform/providers/llm'
import { resolveCapabilities } from '@core/platform/providers/llm/model-capability'
import { PROVIDER_TEMPLATES, isApiKeyOptional } from '@core/platform/services/provider-template.service'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { createLogger } from '@core/utils/logger'
import { validateOutboundUrl } from '@core/utils/outbound-url'
import { isChatModel } from '@shared/utils/model-predicates'
import type { ProviderTemplate, UserProviderConfig, ChatContext } from '@shared/types'

const aiLogger = createLogger('ai-call')

// ==================== 用量落库（S-09） ====================

/**
 * 异步 insert ai_call_stats（fail-soft）：
 * 表不存在（迁移未跑/测试库）、DB 未初始化、写入失败均只静默忽略，绝不阻塞/影响调用。
 * projectId 从调用上下文拿不到就 null（调用方可经 opts.projectId 显式传入）。
 */
function recordAiCallStat(entry: {
  callType: 'text' | 'vlm' | 'stream'
  providerConfigId?: string
  modelId?: string
  durationMs?: number
  projectId?: string | null
}): void {
  void (async () => {
    try {
      const ds = getCoreDatabaseManager().dataSource
      if (!ds) return
      const isPg = ds.options.type === 'postgres'
      const id = `acs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      const ph = (n: number) => (isPg ? `$${n}` : '?')
      await ds.query(
        `INSERT INTO ai_call_stats
           (id, call_type, provider_config_id, model_id, duration_ms, project_id, created_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'})`,
        [
          id,
          entry.callType,
          entry.providerConfigId ?? null,
          entry.modelId ?? null,
          entry.durationMs ?? null,
          entry.projectId ?? null,
        ],
      )
    } catch {
      /* 落库失败静默忽略——用量统计绝不阻塞 AI 调用 */
    }
  })()
}

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

  // 获取模板（空密钥挡板需要模板判定免密钥提供商，故先于挡板解析）
  const template = config ? PROVIDER_TEMPLATES.find(t => t.id === config.templateId) : undefined
  if (!config || !template) {
    return null
  }

  // 空密钥挡板：免密钥提供商（如 llama.cpp 本地推理）允许不配置密钥
  if (!config.apiKey && !isApiKeyOptional(template)) {
    return null
  }

  // 解密 API 密钥（免密钥提供商可无密钥，置空串）
  const secureStorage = getSecureStorage()
  if (!secureStorage.isInitialized()) {
    await secureStorage.initialize()
  }
  const apiKey = config.apiKey ? secureStorage.decrypt(config.apiKey) : ''

  return { config, template, apiKey }
}

// ==================== 模型选择 fallback ====================

/** 从 ModelDefinition[] 里挑第一个支持 chat 的文本模型 id；无则 undefined */
function pickFirstChatModelId(
  models: Array<{ id: string; type?: string; features?: string[] }> | undefined | null,
): string | undefined {
  if (!Array.isArray(models) || models.length === 0) return undefined
  // 优先 chat 模型（共享谓词），兜底任意 text 模型，再兜底第一个有 id 的
  const m =
    models.find((x) => isChatModel(x)) ??
    models.find((x) => x?.id && (x.type === 'text' || !x.type)) ??
    models.find((x) => !!x?.id)
  return m?.id
}

// ==================== AI 调用 ====================

/**
 * 调用 AI 生成（非流式）
 *
 * 2026-09-16 review P0 修复：增加 opts.temperature 透传。此前结构化抽取（场景/分镜 JSON）
 * 与自由创作共用 provider 默认 0.7，格式抖动是下游解析兜底链的根因——JSON 任务建议 0.2~0.3。
 */
export async function callAI(
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 8192,
  providerConfigId?: string,
  modelId?: string,
  opts?: { temperature?: number; projectId?: string }
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
    result = await provider.chatSync(context, {
      maxTokens,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    })
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
    recordAiCallStat({
      callType: 'text',
      providerConfigId: config.id,
      modelId: effectiveModelId,
      durationMs: Date.now() - t0,
      projectId: opts?.projectId,
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
  recordAiCallStat({
    callType: 'text',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    durationMs: Date.now() - t0,
    projectId: opts?.projectId,
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
  opts?: { temperature?: number; projectId?: string },
): Promise<string> {
  return callVLMMulti(prompt, [imageDataUrl], systemPrompt, maxTokens, providerConfigId, modelId, opts)
}

/**
 * 多图版 VLM 调用（2026-09-19 关键帧一致性校验用）：
 * 第一张通常是待审图，后续是参考图（角色定妆照等），prompt 里说明各自角色。
 * 与 callVLM 同一调用链；callVLM 已改为本函数的单图委托。
 */
export async function callVLMMulti(
  prompt: string,
  imageDataUrls: string[],
  systemPrompt: string,
  maxTokens: number = 2048,
  providerConfigId?: string,
  modelId?: string,
  opts?: { temperature?: number; projectId?: string },
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

  // 视觉调用前置校验：所配模型必须声明支持图片输入（ModelDefinition.type='multimodal'）。
  // 否则底层 provider 会**静默丢弃图片块**（supportsVision=false 时按文本发送），
  // 模型看不到图却照常作答 → 表现为"质检/识图结果莫名其妙"，极难排查。
  const modelDefs = [
    ...((config.models as Array<{ id: string }> | undefined) ?? []),
    ...(((template as unknown as { models?: Array<{ id: string }> }).models) ?? []),
  ] as Array<Parameters<typeof resolveCapabilities>[1]> & Array<{ id: string }>
  const matchedDef = modelDefs.find(m => m?.id === effectiveModelId)
  if (matchedDef && !resolveCapabilities(effectiveModelId, matchedDef).supportsVision) {
    throw new Error(
      `模型「${effectiveModelId}」未声明支持图片输入（模型类型需为「多模态」）：` +
        '请在「设置 → AI 服务」把该模型类型改为多模态，或改选视觉模型',
    )
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
          ...imageDataUrls.map((url) => ({ type: 'image', image_url: { url } })),
        ] as any,
      },
    ],
  }

  const t0 = Date.now()
  let result: { success: boolean; content?: string; error?: string }
  try {
    result = await provider.chatSync(context, {
      maxTokens,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    })
  } catch (e: any) {
    aiLogger.error('vlm 调用失败', {
      callType: 'vlm',
      providerConfigId: config.id,
      modelId: effectiveModelId,
      systemPrompt,
      userPrompt: prompt,
      imageCount: imageDataUrls.length,
      durationMs: Date.now() - t0,
      error: e?.message ?? String(e),
    })
    recordAiCallStat({
      callType: 'vlm',
      providerConfigId: config.id,
      modelId: effectiveModelId,
      durationMs: Date.now() - t0,
      projectId: opts?.projectId,
    })
    throw e
  }
  aiLogger.info('vlm 调用完成', {
    callType: 'vlm',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    systemPrompt,
    userPrompt: prompt,
    imageCount: imageDataUrls.length,
    response: result.content,
    durationMs: Date.now() - t0,
    error: result.success ? undefined : result.error,
  })
  recordAiCallStat({
    callType: 'vlm',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    durationMs: Date.now() - t0,
    projectId: opts?.projectId,
  })
  if (!result.success) throw new Error(result.error || 'VLM 调用失败')
  return result.content || ''
}

// ==================== JSON 解析 ====================

/**
 * 解析 JSON 字符串，处理 AI 常见格式问题。
 *
 * 2026-09-16 review P0 修复：旧实现把「清洗」当作破坏性前置——首 parse 之前就
 * 把字符串值内的中文引号替换成未转义 ASCII 引号（对白文本极常见，如「他说："你好"」），
 * JSON.parse 必失败；`\/\/.*` 注释剥离还会砍掉值内 URL（http:// → http:）。
 * 结构化场景（场景 JSON）解析失败后上游静默丢弃场景，产出只剩正文。
 *
 * 现改为「先 parse，失败才恢复」的渐进阶梯，每级只在上一级失败后生效：
 *   1. 直接 parse —— 合规输出零损耗快路径；
 *   2. 非破坏修复 —— 仅在字符串外剥离注释 + 移除尾随逗号；
 *   3. 结构修复 —— 字符串外的中文引号转 ASCII 引号（修"整段用中文引号包裹"的输出风格），
 *      字符串**值内**的中文引号原样保留；顺带修复值内非法转义 \'。
 */
export function parseJsonString(jsonStr: string): any {
  const raw = String(jsonStr ?? '')
  // 1. 合规 JSON 直接解析——任何预处理对合法输入都是有损风险
  try {
    return JSON.parse(raw)
  } catch {
    /* 进入恢复阶梯 */
  }

  // 2. 非破坏修复：字符串外注释 + 尾随逗号
  try {
    return JSON.parse(stripTrailingCommas(stripJsonCommentsOutsideStrings(raw)))
  } catch {
    /* 下一级 */
  }

  // 3. 结构中文引号 + 非法 \' 转义
  try {
    // 顺序：先转中文引号、再剥注释——中文引号结构下剥注释扫描器只认 ASCII 引号为
    // 字符串边界，先剥会把值内 URL 的 `//` 当行注释砍掉（0916 review 复核发现）。
    const converted = stripJsonCommentsOutsideStrings(
      convertChineseQuotesOutsideStrings(raw),
    ).replace(/\\'/g, "'")
    return JSON.parse(stripTrailingCommas(converted))
  } catch {
    throw new Error('无法按 JSON 解析 AI 输出（已尝试注释/尾随逗号/中文引号恢复）')
  }
}

/** 移除对象/数组字面量末尾的逗号（JSON 不支持尾随逗号） */
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, '$1')
}

/**
 * 逐字符扫描，只对 JSON **字符串外**的部分应用注释剥离：
 * 值内 `//`（URL、路径）与中文引号内容不受影响。
 */
function stripJsonCommentsOutsideStrings(json: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === '/' && json[i + 1] === '/') {
      while (i < json.length && json[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (ch === '/' && json[i + 1] === '*') {
      i += 2
      while (i < json.length && !(json[i] === '*' && json[i + 1] === '/')) i++
      i++ // 跳过结尾 '/'（循环再 +1）
      continue
    }
    out += ch
  }
  return out
}

/**
 * 把字符串**外**的中文引号（“ ”）转换为 ASCII 双引号——修「键/值整体用中文引号包裹」
 * 的输出风格；已在 ASCII 字符串内的中文引号是对白内容，原样保留。
 */
function convertChineseQuotesOutsideStrings(json: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of json) {
    if ((ch === '“' || ch === '”') && !inString) {
      out += '"'
      continue
    }
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    out += ch
  }
  return out
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
 * 拼接续写响应（callAIWithContinue 用，导出供单测）：
 * - 续写响应从 `{` 起（可带空白/代码围栏前缀）且包含已输出内容的开头 → 模型在从头
 *   完整重输出，以续写全量为准，不再追加（旧实现此处把完整重输出又拼一份，
 *   产出两份 JSON 必解析失败）
 * - 续写开头重复了已输出内容的结尾 → 按最大重叠截断后拼接
 * - 无重叠 → 原样直接拼接（截断点可落在任意字符——续写内容可能以字符串中段开头，
 *   不能按首个 `{` 裁剪前缀，也不能插入额外空白）
 */
export function mergeContinuationResponse(fullResponse: string, continueResponse: string): string {
  const prev = fullResponse.trimEnd()
  const prevStart = prev.indexOf('{')
  const jsonSoFar = prevStart !== -1 ? prev.substring(prevStart) : prev

  const restartMatch = continueResponse.match(/^\s*(?:```(?:json)?\s*)?(\{[\s\S]*)$/)
  if (restartMatch) {
    const restartJson = restartMatch[1].replace(/```\s*$/, '')
    const compact = (s: string) => s.replace(/\s+/g, '')
    const headProbe = compact(jsonSoFar).substring(0, 50)
    if (headProbe && compact(restartJson).startsWith(headProbe)) {
      return (prevStart !== -1 ? prev.substring(0, prevStart) : '') + restartJson
    }
  }

  const maxOverlap = Math.min(jsonSoFar.length, continueResponse.length, 1000)
  for (let k = maxOverlap; k > 0; k--) {
    if (jsonSoFar.endsWith(continueResponse.substring(0, k))) {
      return prev + continueResponse.substring(k)
    }
  }

  return prev + continueResponse
}

/**
 * 调用 AI 并支持续写（当输出被截断时自动继续）
 * @param prompt 用户提示词
 * @param systemPrompt 系统提示词
 * @param maxTokens 最大 token 数
 * @param providerConfigId 提供商配置 ID
 * @param modelId 模型 ID
 * @param maxContinues 最大续写次数（默认 2）
 * @param opts 透传 callAI（temperature 等）
 * @returns AI 响应内容（可能经过拼接）
 */
export async function callAIWithContinue(
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 8192,
  providerConfigId?: string,
  modelId?: string,
  maxContinues: number = 2,
  opts?: { temperature?: number; projectId?: string }
): Promise<string> {
  let fullResponse = await callAI(prompt, systemPrompt, maxTokens, providerConfigId, modelId, opts)

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

    const continueResponse = await callAI(continuePrompt, systemPrompt, maxTokens, providerConfigId, modelId, opts)

    fullResponse = mergeContinuationResponse(fullResponse, continueResponse)

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

    // 括号平衡扫描：取第一个「完整」的 JSON 对象。模型偶发把答案输出两遍
    // （{A}{B} 拼接，deepseek-v4.1 实证）或在 JSON 后追加散文——首{到尾}截取
    // 会把两段拼在一起必炸；平衡扫描在深度归零处截断，只取第一段。
    if (start !== -1) {
      const first = parseFirstBalancedJsonObject(cleanedResponse.slice(start))
      if (first) {
        try {
          console.log('[EpisodeProductionAI] 平衡扫描截取首个 JSON 对象，长度:', first.length)
          return parseJsonString(first)
        } catch (e3) {
          console.error('[EpisodeProductionAI] 平衡扫描结果仍解析失败:', e3)
        }
      }
    }

    // 输出更详细的错误信息
    console.error('[EpisodeProductionAI] 无法解析 AI 响应为 JSON 格式')
    console.error('[EpisodeProductionAI] 响应内容（前2000字符）:', cleanedResponse.substring(0, 2000))
    throw new Error('无法解析 AI 响应为 JSON 格式，请检查 AI 模型是否支持 JSON 输出')
  }
}

/**
 * 从文本开头扫描第一个括号平衡的 `{...}` 对象（字符串字面量内的引号与转义不参与深度）。
 * 找不到完整闭合返回 null。输入应从 '{' 开始（调用方负责定位）。
 */
export function parseFirstBalancedJsonObject(text: string): string | null {
  if (text[0] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(0, i + 1)
    }
  }
  return null
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
  /** 用量落库归属（S-09）；拿不到就 null */
  projectId?: string
  /**
   * 前置对话历史（多轮）：按顺序拼在本次 prompt 之前（role: user/assistant 交替）。
   * 工作流 multiTurn 开启时由 llm-chat / skill-call 节点注入前面 LLM 轮次。
   */
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
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
    messages: [...(opts.messages ?? []), { role: 'user', content: opts.prompt }],
  }

  const t0 = Date.now()
  let usage: CallAIStreamResult['usage'] | undefined
  let content: string
  try {
    content = await provider.chatStream(
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
  } catch (e: any) {
    aiLogger.error('stream 调用失败', {
      callType: 'stream',
      providerConfigId: config.id,
      modelId: effectiveModelId,
      userPrompt: opts.prompt,
      durationMs: Date.now() - t0,
      error: e?.message ?? String(e),
    })
    recordAiCallStat({
      callType: 'stream',
      providerConfigId: config.id,
      modelId: effectiveModelId,
      durationMs: Date.now() - t0,
      projectId: opts.projectId,
    })
    throw e
  }

  aiLogger.info('stream 调用完成', {
    callType: 'stream',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    userPrompt: opts.prompt,
    responseLength: content.length,
    durationMs: Date.now() - t0,
  })
  recordAiCallStat({
    callType: 'stream',
    providerConfigId: config.id,
    modelId: effectiveModelId,
    durationMs: Date.now() - t0,
    projectId: opts.projectId,
  })

  return { content, usage }
}

// ==================== VLM 输入归一化（B5） ====================

/** 按扩展名推 MIME */
function mimeOf(path: string): string {
  const ext = path.toLowerCase().replace(/.*\./, '')
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'bmp') return 'image/bmp'
  return 'image/png'
}

/**
 * 图片输入归一化为 dataUrl（B5/P6）：
 * - data: 开头原样；http(s) 拉取（30s 超时）；绝对路径读文件；其余视为裸 base64（默认 png）
 */
export async function toImageDataUrl(input: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const raw = String(input ?? '').trim()
  if (raw.startsWith('data:')) return raw
  if (/^https?:\/\//i.test(raw)) {
    // SSRF 防护：imageInput 用户可控（可经 {{模板}} 注入），Web 多租户下
    // 拒绝内网/环回/保留地址，防止借服务器打内网/云元数据
    const guard = validateOutboundUrl(raw)
    if (!guard.ok) throw new Error(`图片 URL 校验失败：${guard.reason}`)
    const res = await fetchFn(raw, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`图片拉取失败：HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  }
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('/')) {
    // 绝对路径读文件仅桌面端允许（本机用户传自己的截图）；
    // Web 端是多租户服务器，禁用该分支——否则任意登录用户可让服务器读
    // /etc/passwd、data-web/secure-key 等任意文件并 base64 外发到 VLM provider
    const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron
    if (!isElectron) {
      throw new Error('本地文件图片输入仅在桌面端可用（Web 端请使用 dataUrl 或 http(s) URL）')
    }
    // 动态引入 fs（浏览器端不可用，此函数仅在 Node 端调用）
    const { readFileSync } = await import('fs')
    const buf = readFileSync(raw)
    return `data:${mimeOf(raw)};base64,${buf.toString('base64')}`
  }
  // 裸输入必须是合法 base64 字符集——否则（相对路径/UNC 路径等误用）尽早报错，
  // 而不是把路径文本当 base64 喂给模型
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) {
    throw new Error(`无法识别的图片输入（支持 dataUrl / http(s) URL / 绝对路径 / base64）：${raw.slice(0, 60)}`)
  }
  return `data:image/png;base64,${raw}`
}
