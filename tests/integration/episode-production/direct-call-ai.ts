/**
 * A/B 测试直接调用 AI 的辅助函数
 *
 * 不依赖 Electron 数据库，通过环境变量配置 API 密钥，
 * 使用 OpenAI SDK（兼容 DeepSeek、通义千问等支持 OpenAI API 格式的提供商）。
 *
 * 环境变量：
 *   AB_TEST_DEEPSEEK_API_KEY   - DeepSeek API 密钥
 *   AB_TEST_QWEN_API_KEY       - 通义千问 API 密钥（阿里云 DashScope）
 *   AB_TEST_DEEPSEEK_BASE_URL  - DeepSeek API 基础 URL（可选，默认 https://api.deepseek.com）
 *   AB_TEST_QWEN_BASE_URL      - 通义千问 API 基础 URL（可选，默认 https://dashscope.aliyuncs.com/compatible-mode）
 *
 * 用法：
 *   const callAI = createDirectCallAI('deepseek-chat')
 *   const response = await callAI(prompt, systemPrompt, 4096, undefined, 'deepseek-chat')
 */

import OpenAI from 'openai'

/**
 * 模型 ID 到提供商的映射
 */
function getProviderForModel(modelId: string): 'deepseek' | 'qwen' {
  if (modelId.startsWith('deepseek') || modelId.startsWith('ds')) {
    return 'deepseek'
  }
  if (modelId.startsWith('qwen') || modelId.startsWith('qw')) {
    return 'qwen'
  }
  // 默认使用 deepseek
  return 'deepseek'
}

/**
 * 创建直接调用 AI 的函数（不依赖 Electron 数据库）
 *
 * @param defaultModel 默认模型 ID（可在调用时覆盖）
 * @returns callAIFn 兼容的函数
 */
export function createDirectCallAI(
  defaultModel: string = 'deepseek-chat',
): (
  prompt: string,
  systemPrompt: string,
  maxTokens: number,
  providerConfigId: string | undefined,
  modelId: string,
) => Promise<string> {
  return async (
    prompt: string,
    systemPrompt: string,
    maxTokens: number,
    _providerConfigId: string | undefined,
    modelId: string,
  ): Promise<string> => {
    const effectiveModel = modelId || defaultModel
    const provider = getProviderForModel(effectiveModel)

    let apiKey: string | undefined
    let baseUrl: string | undefined

    switch (provider) {
      case 'deepseek':
        apiKey = process.env.AB_TEST_DEEPSEEK_API_KEY
        baseUrl = process.env.AB_TEST_DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
        break
      case 'qwen':
        apiKey = process.env.AB_TEST_QWEN_API_KEY
        baseUrl = process.env.AB_TEST_QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode'
        break
    }

    if (!apiKey) {
      throw new Error(
        `未配置 ${provider} 的 API 密钥。请设置环境变量 AB_TEST_${provider.toUpperCase()}_API_KEY`,
      )
    }

    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    })

    const response = await client.chat.completions.create({
      model: effectiveModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error(`AI 返回空内容: ${JSON.stringify(response.choices)}`)
    }

    return content
  }
}

/**
 * 检查是否可以运行真实测试（API 密钥是否已配置）
 */
export function canRunRealTest(models: string[]): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  const checkedProviders = new Set<string>()

  for (const model of models) {
    const provider = getProviderForModel(model)
    if (checkedProviders.has(provider)) continue
    checkedProviders.add(provider)

    const envKey = `AB_TEST_${provider.toUpperCase()}_API_KEY`
    if (!process.env[envKey]) {
      missing.push(envKey)
    }
  }

  return {
    ready: missing.length === 0,
    missing,
  }
}
