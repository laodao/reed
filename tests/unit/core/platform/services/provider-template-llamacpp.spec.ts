/**
 * llama.cpp 本地推理接入单测
 * @module tests/unit/core/platform/services/provider-template-llamacpp
 *
 * 需求：AI 模型配置新增 llama.cpp（llama-server）支持。
 * 锁死的事实（llama.cpp 官方文档核对）：
 * - llama-server 缺省监听 http://127.0.0.1:8080，OpenAI 兼容端点挂在 /v1 下
 *   （/v1/chat/completions、/v1/models），密钥认证仅在 --api-key 启动参数下启用
 * - /v1/models 返回当前加载模型（无 context_window/max_output_tokens 元数据）
 *
 * 本测试同时锁死两条链路行为：
 * - 工厂分发：llamacpp 走 fallback 分支（OpenAICompatibleProvider），与其他
 *   OpenAI 兼容自定义模板一致（ai-hub 详细设计 §ai-hub 模板范式同款）
 * - 免密钥链路：apiKeyOptional 模板在 testConnection 空密钥时放行
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// import 必须在 vi.mock 之后（本 spec 无需 mock SDK——llamacpp 不走 SDK Provider）
import {
  PROVIDER_TEMPLATES,
  providerTemplateService,
  isApiKeyOptional
} from '@core/platform/services/provider-template.service'
import { createProvider } from '@core/platform/providers/llm'
import { OpenAICompatibleProvider } from '@core/platform/providers/llm/openai-compatible-provider'
import { OpenAISdkProvider } from '@core/platform/providers/llm/sdk/openai-sdk-provider'
import type { ProviderTemplate } from '@shared/types'

const TPL_ID = 'llamacpp'
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080/v1'

function getTemplate(id: string): ProviderTemplate {
  const tpl = PROVIDER_TEMPLATES.find((t) => t.id === id)
  if (!tpl) throw new Error(`模板 ${id} 不存在`)
  return tpl
}

describe('llama.cpp 模板定义', () => {
  it('注册了 llamacpp 模板卡（本地自建服务，非官方模板）', () => {
    const tpl = getTemplate(TPL_ID)
    expect(tpl.name).toContain('llama.cpp')
    expect(tpl.category).toBe('openai-compatible')
    expect(tpl.isOfficial).toBe(false)
  })

  it('缺省端点为 llama-server 默认地址且含版本段', () => {
    const tpl = getTemplate(TPL_ID)
    expect(tpl.apiConfig.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(tpl.apiConfig.requestFormat).toBe('openai')
    expect(tpl.apiConfig.chatEndpoint).toBe('/chat/completions')
    expect(tpl.apiConfig.modelsEndpoint).toBe('/models')
  })

  it('声明免密钥（apiKeyOptional）且密钥认证与 llama-server --api-key 对应', () => {
    const tpl = getTemplate(TPL_ID)
    expect(tpl.apiKeyOptional).toBe(true)
    expect(tpl.apiConfig.authType).toBe('bearer')
    expect(tpl.apiConfig.authHeader).toBe('Authorization')
    expect(tpl.apiConfig.authPrefix).toBe('Bearer ')
    // --api-key 用法写入使用须知
    const notes = (tpl.usageNotes || []).join('\n')
    expect(notes).toContain('--api-key')
  })

  it('只声明 chat 能力，模型列表动态获取且允许手动添加', () => {
    const tpl = getTemplate(TPL_ID)
    expect(tpl.capabilities).toEqual(['chat'])
    expect(tpl.supportedParams.stream).toBe(true)
    expect(tpl.supportedParams.temperature).toBe(true)
    expect(tpl.supportedParams.maxTokens).toBe(true)
    expect(tpl.models).toEqual([])
    expect(tpl.allowCustomModels).toBe(true)
  })
})

describe('llama.cpp 工厂分发与免密钥链路', () => {
  it('createProvider 走 fallback 分支（OpenAICompatibleProvider），不落 SDK Provider', () => {
    const tpl = getTemplate(TPL_ID)
    const provider = createProvider(TPL_ID, { apiKey: '' }, tpl)
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider)
    expect(provider).not.toBeInstanceOf(OpenAISdkProvider)
  })

  it('isApiKeyOptional 判定：llamacpp/comfyui 可空，云厂商不可空', () => {
    expect(isApiKeyOptional(getTemplate(TPL_ID))).toBe(true)
    expect(isApiKeyOptional(getTemplate('comfyui'))).toBe(true) // authType none
    expect(isApiKeyOptional(getTemplate('openai'))).toBe(false)
    expect(isApiKeyOptional(getTemplate('bailian'))).toBe(false)
    expect(isApiKeyOptional(undefined)).toBe(false)
  })

  it('空密钥 testConnection 放行，模型列表打到位且 URL 正确拼出 /v1/models', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        // llama.cpp /v1/models 实际响应：仅 id/object，无上下文元数据
        object: 'list',
        data: [{ id: 'Qwen3-8B-Q4_K_M', object: 'model' }]
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const result = await providerTemplateService.testConnection({
        templateId: TPL_ID,
        apiKey: undefined,
        baseUrl: undefined
      })

      expect(result.success).toBe(true)
      expect(result.models?.map((m) => m.id)).toEqual(['Qwen3-8B-Q4_K_M'])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toBe('http://127.0.0.1:8080/v1/models')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
