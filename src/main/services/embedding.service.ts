/**
 * Embedding 向量化服务
 * @module services/embedding.service
 * @description 调用云端 API 或本地模型生成文本向量
 */

import type {
  EmbeddingModel,
  EmbeddingConfig
} from '../../shared/types/knowledge-base.types'
import { getDatabaseManager } from '../database'
import { SecureStorageService } from './secure-storage.service'

/**
 * Embedding 结果
 */
interface EmbeddingResult {
  success: boolean
  vector?: number[]
  error?: string
}

/**
 * 批量 Embedding 结果
 */
interface BatchEmbeddingResult {
  success: boolean
  vectors?: number[][]
  error?: string
}

/**
 * Embedding 服务
 */
export class EmbeddingService {
  /**
   * 生成单个文本的向量
   */
  async embed(text: string, config: EmbeddingConfig): Promise<EmbeddingResult> {
    try {
      if (!text || text.trim().length === 0) {
        return { success: false, error: '文本不能为空' }
      }

      if (config.provider === 'cloud') {
        return await this.embedWithCloud(text, config)
      } else {
        return await this.embedWithOllama(text, config)
      }
    } catch (error: any) {
      console.error('[EmbeddingService] 错误:', error)
      return { success: false, error: error.message || '向量化失败' }
    }
  }

  /**
   * 批量生成向量
   */
  async embedBatch(texts: string[], config: EmbeddingConfig): Promise<BatchEmbeddingResult> {
    try {
      if (!texts || texts.length === 0) {
        return { success: false, error: '文本列表不能为空' }
      }

      // 过滤空文本
      const validTexts = texts.filter(t => t && t.trim().length > 0)
      if (validTexts.length === 0) {
        return { success: false, error: '没有有效的文本' }
      }

      if (config.provider === 'cloud') {
        return await this.embedBatchWithCloud(validTexts, config)
      } else {
        return await this.embedBatchWithOllama(validTexts, config)
      }
    } catch (error: any) {
      console.error('[EmbeddingService] 批量向量化错误:', error)
      return { success: false, error: error.message || '批量向量化失败' }
    }
  }

  /**
   * 获取可用的 Embedding 模型列表
   */
  async getAvailableModels(): Promise<EmbeddingModel[]> {
    const models: EmbeddingModel[] = []

    // 获取云端模型
    const cloudModels = await this.getCloudEmbeddingModels()
    models.push(...cloudModels)

    // 获取本地 Ollama 模型（如果配置了）
    const localModels = await this.getLocalEmbeddingModels()
    models.push(...localModels)

    return models
  }

  // ==================== 云端 API ====================

  /**
   * 使用云端 API 生成向量
   */
  private async embedWithCloud(text: string, config: EmbeddingConfig): Promise<EmbeddingResult> {
    const result = await this.embedBatchWithCloud([text], config)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, vector: result.vectors![0] }
  }

  /**
   * 使用云端 API 批量生成向量
   */
  private async embedBatchWithCloud(texts: string[], config: EmbeddingConfig): Promise<BatchEmbeddingResult> {
    try {
      if (!config.providerConfigId) {
        return { success: false, error: '未配置云端提供商' }
      }

      const dbManager = getDatabaseManager()
      if (!dbManager.providerConfigs) {
        return { success: false, error: '数据库未初始化' }
      }

      // 获取提供商配置
      const providerConfig = await dbManager.providerConfigs.getById(config.providerConfigId)
      if (!providerConfig) {
        return { success: false, error: '提供商配置不存在' }
      }

      // 解密 API Key
      let apiKey: string
      try {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        apiKey = secureStorage.decrypt(providerConfig.apiKeyEncrypted)
      } catch {
        return { success: false, error: 'API 密钥解密失败' }
      }

      // 根据模板 ID 选择合适的 API
      const templateId = providerConfig.templateId

      if (templateId === 'openai') {
        return await this.embedWithOpenAI(texts, apiKey, providerConfig.baseUrl)
      } else if (templateId === 'bailian' || templateId === 'dashscope') {
        return await this.embedWithDashScope(texts, apiKey)
      } else if (templateId === 'zhipu') {
        return await this.embedWithZhipu(texts, apiKey, providerConfig.baseUrl)
      } else {
        // 尝试使用 OpenAI 兼容 API
        return await this.embedWithOpenAI(texts, apiKey, providerConfig.baseUrl || 'https://api.openai.com/v1')
      }
    } catch (error: any) {
      console.error('[EmbeddingService] 云端 API 错误:', error)
      return { success: false, error: error.message || '云端向量化失败' }
    }
  }

  /**
   * OpenAI Embedding API
   */
  private async embedWithOpenAI(
    texts: string[],
    apiKey: string,
    baseUrl?: string
  ): Promise<BatchEmbeddingResult> {
    try {
      const OpenAI = require('openai')
      const client = new OpenAI({
        apiKey,
        baseURL: baseUrl || 'https://api.openai.com/v1'
      })

      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts
      })

      const vectors = response.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => item.embedding)

      return { success: true, vectors }
    } catch (error: any) {
      console.error('[EmbeddingService] OpenAI 错误:', error)
      return { success: false, error: error.message || 'OpenAI API 调用失败' }
    }
  }

  /**
   * 阿里百炼（DashScope）Embedding API
   */
  private async embedWithDashScope(
    texts: string[],
    apiKey: string
  ): Promise<BatchEmbeddingResult> {
    try {
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-v2',
          input: {
            texts
          },
          parameters: {
            text_type: 'document'
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'DashScope API 调用失败')
      }

      const data = await response.json()
      const vectors = data.output.embeddings.map((item: any) => item.embedding)

      return { success: true, vectors }
    } catch (error: any) {
      console.error('[EmbeddingService] DashScope 错误:', error)
      return { success: false, error: error.message || 'DashScope API 调用失败' }
    }
  }

  /**
   * 智谱 AI Embedding API
   */
  private async embedWithZhipu(
    texts: string[],
    apiKey: string,
    baseUrl?: string
  ): Promise<BatchEmbeddingResult> {
    try {
      const response = await fetch(`${baseUrl || 'https://open.bigmodel.cn'}/api/paas/v4/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'embedding-2',
          input: texts
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || '智谱 AI API 调用失败')
      }

      const data = await response.json()
      const vectors = data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => item.embedding)

      return { success: true, vectors }
    } catch (error: any) {
      console.error('[EmbeddingService] 智谱 AI 错误:', error)
      return { success: false, error: error.message || '智谱 AI API 调用失败' }
    }
  }

  // ==================== 本地模型 ====================

  /**
   * 使用 Ollama 生成向量
   */
  private async embedWithOllama(text: string, config: EmbeddingConfig): Promise<EmbeddingResult> {
    const result = await this.embedBatchWithOllama([text], config)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, vector: result.vectors![0] }
  }

  /**
   * 使用 Ollama 批量生成向量
   */
  private async embedBatchWithOllama(texts: string[], config: EmbeddingConfig): Promise<BatchEmbeddingResult> {
    try {
      const ollamaUrl = config.ollamaBaseUrl || 'http://localhost:11434'

      const vectors: number[][] = []

      // Ollama 一次只能处理一个文本
      for (const text of texts) {
        const response = await fetch(`${ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: config.providerConfigId || 'nomic-embed-text',
            prompt: text
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Ollama 调用失败')
        }

        const data = await response.json()
        vectors.push(data.embedding)
      }

      return { success: true, vectors }
    } catch (error: any) {
      console.error('[EmbeddingService] Ollama 错误:', error)
      return { success: false, error: error.message || 'Ollama 调用失败' }
    }
  }

  // ==================== 模型列表 ====================

  /**
   * 获取云端 Embedding 模型
   */
  private async getCloudEmbeddingModels(): Promise<EmbeddingModel[]> {
    const models: EmbeddingModel[] = []

    try {
      const dbManager = getDatabaseManager()
      if (!dbManager.providerConfigs) return models

      const configs = await dbManager.providerConfigs.getEnabled()

      // 预定义的 Embedding 模型
      const embeddingModelsByProvider: Record<string, EmbeddingModel[]> = {
        openai: [
          { id: 'text-embedding-3-small', name: 'OpenAI text-embedding-3-small', provider: 'cloud', dimension: 1536, maxTokens: 8191 },
          { id: 'text-embedding-3-large', name: 'OpenAI text-embedding-3-large', provider: 'cloud', dimension: 3072, maxTokens: 8191 }
        ],
        bailian: [
          { id: 'text-embedding-v2', name: '阿里百炼 text-embedding-v2', provider: 'cloud', dimension: 1536, maxTokens: 8192 }
        ],
        dashscope: [
          { id: 'text-embedding-v2', name: 'DashScope text-embedding-v2', provider: 'cloud', dimension: 1536, maxTokens: 8192 }
        ],
        zhipu: [
          { id: 'embedding-2', name: '智谱 AI embedding-2', provider: 'cloud', dimension: 1024, maxTokens: 512 }
        ]
      }

      for (const config of configs) {
        const providerModels = embeddingModelsByProvider[config.templateId]
        if (providerModels) {
          for (const model of providerModels) {
            models.push({
              ...model,
              providerConfigId: config.id
            })
          }
        }
      }
    } catch (error) {
      console.error('[EmbeddingService] 获取云端模型错误:', error)
    }

    return models
  }

  /**
   * 获取本地 Ollama Embedding 模型
   */
  private async getLocalEmbeddingModels(): Promise<EmbeddingModel[]> {
    const models: EmbeddingModel[] = []

    try {
      // 预定义常用的 Ollama Embedding 模型
      models.push(
        { id: 'nomic-embed-text', name: 'Ollama nomic-embed-text', provider: 'local', dimension: 768, maxTokens: 8192 },
        { id: 'mxbai-embed-large', name: 'Ollama mxbai-embed-large', provider: 'local', dimension: 1024, maxTokens: 512 },
        { id: 'all-minilm', name: 'Ollama all-minilm', provider: 'local', dimension: 384, maxTokens: 512 }
      )
    } catch (error) {
      console.error('[EmbeddingService] 获取本地模型错误:', error)
    }

    return models
  }
}