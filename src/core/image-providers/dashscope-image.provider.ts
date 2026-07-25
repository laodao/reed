/**
 * DashScope 图像生成 Provider
 * @module image-providers/dashscope-image-provider
 * @description 实现阿里云 DashScope 平台的图像生成 API（使用 Bearer Token 认证）
 */

import type {
  ImageProviderConfig,
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  GeneratedImage
} from '@shared/types/image-provider.types'
import { BaseImageProvider, collectReferences } from './base-image-provider'

/**
 * DashScope 原生 API 响应格式
 */
interface DashScopeApiResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
    submit_time?: string
    scheduled_time?: string
    start_time?: string
    end_time?: string
    results?: Array<{
      url?: string
      code?: string
      message?: string
    }>
    task_metrics?: {
      TOTAL?: number
      SUCCEEDED?: number
      FAILED?: number
    }
    message?: string
  }
}

/**
 * DashScope 多模态图像生成响应
 */
interface DashScopeMultimodalResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    choices?: Array<{
      finish_reason?: string
      message?: {
        role?: string
        content?: Array<{
          text?: string
          image?: string
        }>
      }
    }>
  }
}

/**
 * OpenAI 兼容格式响应
 */
interface OpenAIImageResponse {
  created?: number
  data?: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
  error?: {
    message: string
    type: string
    code: string
  }
}

/**
 * DashScope 图像生成 Provider
 *
 * 使用阿里云 DashScope 平台的通义万相模型进行图像生成。
 * 使用 Bearer Token 认证（与 DashScope 对话 API 相同）。
 *
 * 支持两种 API 格式：
 * 1. 原生 API (wanx-* 模型): 百炼原生图像合成 API
 * 2. OpenAI 兼容 API (qwen-image 模型): OpenAI 格式的图像生成 API
 *
 * @see https://help.aliyun.com/document_detail/2892275.html
 */
export class DashScopeImageProvider extends BaseImageProvider {
  /**
   * DashScope 默认 host
   */
  private static DEFAULT_HOST = 'https://dashscope.aliyuncs.com'

  /**
   * 各类 API 的 endpoint path（host 之外的部分）。getApiUrl 根据模型类型挑选，
   * 再与 host 拼接。这样无论用户/模板传入的 baseUrl 是 host 还是完整 endpoint，
   * 都能解析出正确 host 后拼出对应模型该用的 endpoint。
   */
  private static NATIVE_PATH = '/api/v1/services/aigc/text2image/image-synthesis'
  private static MULTIMODAL_PATH = '/api/v1/services/aigc/multimodal-generation/generation'
  private static OPENAI_PATH = '/compatible-mode/v1/images/generations'
  private static KLING_PATH = '/api/v1/services/aigc/image-generation/generation'
  private static TASK_PATH = '/api/v1/tasks'

  /**
   * 可灵负面词并入正向 prompt 的连接语（官方建议把排除内容写进正向 prompt；
   * 措辞独立为常量便于实测微调）。design §5.1
   */
  private static KLING_NEGATIVE_JOINER = '. Avoid: '

  /**
   * 判断是否为可灵模型（百炼托管 kling/*，走 image-generation 端点 + 异步头）
   */
  private isKlingModel(model: string): boolean {
    return model.startsWith('kling/')
  }

  /**
   * 判断是否使用多模态图像生成格式
   * qwen-image 系列和 wan2.7-image 系列模型使用多模态聊天格式
   */
  private isMultimodalImageModel(model: string): boolean {
    // qwen-image 系列模型使用多模态聊天格式
    if (model.startsWith('qwen-image')) {
      return true
    }
    // wan2.7-image 系列是新一代模型，也使用多模态格式
    if (model.startsWith('wan2.7-image') || model.startsWith('wan2-7-image') || model.startsWith('wan27-image')) {
      return true
    }
    return false
  }

  /**
   * 判断是否使用 OpenAI 兼容格式
   */
  private isOpenAIFormat(model: string): boolean {
    // 其他以 qwen- 开头的模型使用 OpenAI 兼容格式
    return model.startsWith('qwen-') && !this.isMultimodalImageModel(model)
  }

  /**
   * 判断是否使用原生格式（旧版 wanx-* 模型）
   */
  private isNativeFormat(model: string): boolean {
    // 只有 wanx-v1 和 wanx-sketch-to-image-v1 使用原生格式
    // 新版 wan2.7-image 系列使用多模态格式
    return model.startsWith('wanx-') && !this.isMultimodalImageModel(model)
  }

  /**
   * 从 config.baseUrl 中解析出 host（如 https://dashscope.aliyuncs.com）。
   * 用户/模板传进来的可能是 host base、完整 endpoint，甚至是 chat 端点，
   * 都统一只取 protocol+host，不沿用其 path。
   */
  private resolveHost(): string {
    const raw = this.config.baseUrl
    if (raw) {
      try {
        const u = new URL(raw)
        return `${u.protocol}//${u.host}`
      } catch {
        // baseUrl 不是合法 URL，回退到默认 host
      }
    }
    return DashScopeImageProvider.DEFAULT_HOST
  }

  /**
   * 根据模型类型选择 endpoint，再与解析出的 host 拼接。
   * 旧实现"用户配了 baseUrl 就直接用"会让 wanx 端点被 qwen-image 多模态模型误用，
   * 导致请求到错误端点而失败。
   */
  private getApiUrl(model: string): string {
    const host = this.resolveHost()
    let endpointPath: string
    if (this.isKlingModel(model)) {
      // 可灵走官方 image-generation 端点（design §5.1 修正错误 A：
      // 此前一切模型都落 image-synthesis，可灵在该端点不可用）
      endpointPath = DashScopeImageProvider.KLING_PATH
    } else if (this.isMultimodalImageModel(model)) {
      endpointPath = DashScopeImageProvider.MULTIMODAL_PATH
    } else if (this.isOpenAIFormat(model)) {
      endpointPath = DashScopeImageProvider.OPENAI_PATH
    } else {
      endpointPath = DashScopeImageProvider.NATIVE_PATH
    }
    return host + endpointPath
  }

  /**
   * 获取任务查询 URL 基础路径（同样基于解析后的 host）
   */
  private get taskBaseUrl(): string {
    return this.resolveHost() + DashScopeImageProvider.TASK_PATH
  }

  /**
   * Provider 唯一标识
   */
  get id(): string {
    return 'dashscope'
  }

  /**
   * Provider 显示名称
   */
  get name(): string {
    return 'DashScope (通义万相)'
  }

  /**
   * 获取支持的模型列表
   * @returns 模型列表
   */
  async getModels(): Promise<ImageModel[]> {
    return [
      {
        id: 'wanx-v1',
        name: '通义万相 v1',
        providerId: 'dashscope',
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: true,
          imageEdit: false,
          maxResolution: '2048x2048',
          supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024', '720x1280', '1280x720']
        }
      },
      {
        id: 'wanx-sketch-to-image-v1',
        name: '通义万相-素描生图',
        providerId: 'dashscope',
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: true,
          imageEdit: false,
          maxResolution: '2048x2048',
          supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024']
        }
      },
      {
        id: 'wan2.7-image-pro',
        name: '万相 2.7 Pro',
        providerId: 'dashscope',
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: true,
          imageEdit: false,
          maxResolution: '2048x2048',
          supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024', '1920x1080', '1080x1920']
        }
      },
      {
        id: 'qwen-image',
        name: 'Qwen Image',
        providerId: 'dashscope',
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: false,
          imageEdit: false,
          maxResolution: '2048x2048',
          supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024', '2048x2048']
        }
      },
      {
        id: 'qwen-image-2.0-pro',
        name: 'Qwen Image 2.0 Pro',
        providerId: 'dashscope',
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: false,
          imageEdit: false,
          maxResolution: '2048x2048',
          supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024', '2048x2048']
        }
      },
      {
        id: 'kling/kling-v3-image-generation',
        name: '可灵 v3 图像（单参考图）',
        providerId: 'dashscope',
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: true,
          imageEdit: false,
          maxResolution: '2k',
          supportedSizes: ['1080x1920', '1024x1024', '1920x1080']
        }
      },
      {
        id: 'kling/kling-v3-omni-image-generation',
        name: '可灵 v3 Omni 图像（多参考图/组图）',
        providerId: 'dashscope',
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: true,
          imageEdit: false,
          maxResolution: '4k',
          supportedSizes: ['1080x1920', '1024x1024', '1920x1080']
        }
      }
    ]
  }

  /**
   * 生成图像
   *
   * 根据模型类型选择不同的 API 格式：
   * - qwen-image: 使用多模态聊天格式
   * - qwen-*: 使用 OpenAI 兼容格式
   * - wanx-*: 使用百炼原生格式
   *
   * @param request - 图像生成请求
   * @returns 生成响应，包含任务 ID 或直接返回图像
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      // 检查是否指定了模型，如果没有则抛出错误
      if (!request.model) {
        return {
          success: false,
          error: '未指定图像生成模型，请在项目设置中配置图像模型'
        }
      }
      const model = request.model

      console.log('[DashScope] generateImage 模型:', model,
        'isMultimodal:', this.isMultimodalImageModel(model),
        'isOpenAI:', this.isOpenAIFormat(model),
        'isNative:', this.isNativeFormat(model))

      if (this.isKlingModel(model)) {
        return await this.generateImageKling(request)
      } else if (this.isMultimodalImageModel(model)) {
        return await this.generateImageMultimodal(request)
      } else if (this.isOpenAIFormat(model)) {
        return await this.generateImageOpenAI(request)
      } else if (this.isNativeFormat(model)) {
        return await this.generateImageNative(request)
      } else {
        // 未知模型类型，尝试使用多模态格式（适用于新模型）
        console.log('[DashScope] 未知模型类型，尝试使用多模态格式')
        return await this.generateImageMultimodal(request)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        error: `图像生成失败: ${errorMessage}`
      }
    }
  }

  /**
   * 使用可灵官方参数集生成图像（kling/* 模型）
   *
   * design §5.1：只发官方支持参数（n/aspect_ratio/resolution/watermark），
   * 负面词并入正向 prompt；seed/style/quality/size 一律不发。
   * 官方强制异步（X-DashScope-Async: enable），返回 task_id 走统一轮询。
   */
  private async generateImageKling(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const model = request.model!
    const url = this.getApiUrl(model)
    const body = this.buildKlingRequestBody(request)

    console.log('[DashScope] 使用可灵格式, URL:', url, 'Body:', body)

    const response = await this.sendRequest<DashScopeApiResponse>(
      url, 'POST', body, { 'X-DashScope-Async': 'enable' },
    )

    if (response.code && response.code !== 'Success' && response.code !== '200') {
      return {
        success: false,
        error: response.message || '图像生成请求失败'
      }
    }

    if (response.output?.task_id) {
      return { success: true, taskId: response.output.task_id }
    }

    return { success: false, error: '未获取到任务 ID' }
  }

  /**
   * 构建可灵官方请求体（messages 格式 + 可灵参数集）
   */
  private buildKlingRequestBody(request: ImageGenerationRequest): Record<string, any> {
    // 负面词并入正向 prompt（官方：排除内容写进正向 prompt）
    const text = request.negativePrompt
      ? `${request.prompt}${DashScopeImageProvider.KLING_NEGATIVE_JOINER}${request.negativePrompt}`
      : request.prompt

    const content: Array<{ text?: string; image?: string }> = [{ text }]
    const refs = collectReferences(request)
    for (const ref of refs) {
      content.push({ image: ref })
    }

    const { aspectRatio, resolution } = mapPixelsToKlingSize(request.width, request.height)

    return {
      model: request.model,
      input: {
        messages: [{ role: 'user', content }]
      },
      parameters: {
        n: request.count || 1,
        aspect_ratio: aspectRatio,
        resolution,
        watermark: false,
      }
    }
  }

  /**
   * 使用多模态聊天格式生成图像（qwen-image 模型）
   * 支持图生图（reference image）功能
   */
  private async generateImageMultimodal(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    // 模型必须已指定（在 generateImage 中已检查）
    const model = request.model!
    const url = this.getApiUrl(model)

    // 构建 content 数组
    const content: Array<{ text?: string; image?: string }> = []

    // spec 2026-05-09 ep-redesign §3.2 D1：multi-reference 优先；保留 referenceImage 单值兼容
    const refs = collectReferences(request)
    if (refs.length > 0) {
      // DashScope content 数组支持多张 image — 全部喂入；老调用 referenceImage 单值也走此路径
      for (const ref of refs) {
        content.push({ image: ref })
      }
      console.log(`[DashScope] 使用 ${refs.length} 张参考图（multi-reference）`)
    }

    // 添加文本提示词
    content.push({
      text: request.prompt
    })

    const body: Record<string, any> = {
      model: model,
      input: {
        messages: [
          {
            role: 'user',
            content: content
          }
        ]
      },
      parameters: {
        size: `${request.width}*${request.height}`,
        watermark: false,
        // design §5.3：缺省 = 官方默认 true（保现状）；
        // 人像一致性场景由 service 显式传 false，防止一致性 prompt 被 LLM 改写
        prompt_extend: request.promptExtend ?? true
      }
    }

    // 添加负面提示词
    if (request.negativePrompt) {
      body.parameters.negative_prompt = request.negativePrompt
    }

    // 添加种子（保持一致性）
    if (request.seed !== undefined && request.seed >= 0) {
      body.parameters.seed = request.seed
    }

    console.log('[DashScope] 使用多模态格式, URL:', url, 'Body:', JSON.stringify(body, null, 2))

    const response = await this.sendRequest<DashScopeMultimodalResponse>(url, 'POST', body)

    if (response.code && response.code !== 'Success' && response.code !== '200') {
      return {
        success: false,
        error: response.message || '图像生成请求失败'
      }
    }

    // 从响应中提取图像
    if (response.output?.choices && response.output.choices.length > 0) {
      const images: { url: string }[] = []
      for (const choice of response.output.choices) {
        if (choice.message?.content) {
          for (const content of choice.message.content) {
            if (content.image) {
              // image 可能是 URL 或 base64
              if (content.image.startsWith('http')) {
                images.push({ url: content.image })
              } else {
                // base64 格式，需要保存为文件
                // 暂时返回 base64，由 ImageService 处理
                images.push({ url: `data:image/png;base64,${content.image}` })
              }
            }
          }
        }
      }

      if (images.length > 0) {
        return {
          success: true,
          images: images
        }
      }
    }

    return {
      success: false,
      error: '未获取到生成结果'
    }
  }

  /**
   * 使用 OpenAI 兼容格式生成图像
   */
  private async generateImageOpenAI(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const model = request.model || 'qwen-image'
    const url = this.getApiUrl(model)

    const body = {
      model: model,
      prompt: request.prompt,
      n: request.count || 1,
      size: `${request.width}x${request.height}`
    }

    console.log('[DashScope] 使用 OpenAI 兼容格式, URL:', url, 'Body:', body)

    const response = await this.sendRequest<OpenAIImageResponse>(url, 'POST', body)

    if (response.error) {
      return {
        success: false,
        error: response.error.message || '图像生成请求失败'
      }
    }

    if (response.data && response.data.length > 0) {
      const images: { url: string }[] = []
      for (const item of response.data) {
        if (item.url) {
          images.push({ url: item.url })
        }
      }

      if (images.length > 0) {
        return {
          success: true,
          images: images
        }
      }
    }

    return {
      success: false,
      error: '未获取到生成结果'
    }
  }

  /**
   * 使用原生格式生成图像
   */
  private async generateImageNative(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const model = request.model || 'wanx-v1'
    const url = this.getApiUrl(model)
    const body = this.buildNativeRequestBody(request)

    console.log('[DashScope] 使用原生格式, URL:', url, 'Body:', body)

    const response = await this.sendRequest<DashScopeApiResponse>(url, 'POST', body)

    if (response.code && response.code !== 'Success' && response.code !== '200') {
      return {
        success: false,
        error: response.message || '图像生成请求失败'
      }
    }

    // 同步模式：直接在 output.results 中返回结果
    if (response.output?.results && response.output.results.length > 0) {
      const images: { url: string }[] = []
      for (const result of response.output.results) {
        if (result.url) {
          images.push({ url: result.url })
        }
      }

      if (images.length > 0) {
        return {
          success: true,
          images: images
        }
      }
    }

    // 兼容异步模式：如果有 task_id，返回任务 ID
    if (response.output?.task_id) {
      return {
        success: true,
        taskId: response.output.task_id
      }
    }

    return {
      success: false,
      error: '未获取到生成结果'
    }
  }

  /**
   * 查询异步任务状态
   *
   * 查询图像生成任务的执行状态和结果。
   *
   * @param taskId - 任务 ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: string): Promise<ImageTaskStatus> {
    try {
      const url = `${this.taskBaseUrl}/${taskId}`
      const response = await this.sendRequest<DashScopeApiResponse>(url, 'GET')

      if (response.code && response.code !== 'Success' && response.code !== '200') {
        return {
          taskId,
          status: 'failed',
          error: response.message || '查询任务状态失败'
        }
      }

      const output = response.output
      if (!output) {
        return {
          taskId,
          status: 'failed',
          error: '未获取到任务数据'
        }
      }

      // 映射 DashScope 任务状态到通用状态
      const status = this.mapTaskStatus(output.task_status || '')

      const result: ImageTaskStatus = {
        taskId,
        status
      }

      // 如果任务完成，提取图像 URL
      if (status === 'completed' && output.results && output.results.length > 0) {
        const images: GeneratedImage[] = []
        for (const img of output.results) {
          if (img.url) {
            images.push({ url: img.url })
          }
        }
        result.images = images
      }

      // 如果任务失败，提取错误信息
      if (status === 'failed') {
        // 检查是否有失败的图像
        const failedImg = output.results?.find(img => img.code && img.code !== 'Success')
        result.error = failedImg?.message || output.message || '任务执行失败'
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        taskId,
        status: 'failed',
        error: `查询任务状态失败: ${errorMessage}`
      }
    }
  }

  /**
   * 测试 Provider 连接
   *
   * 验证 API Key 是否有效。
   *
   * @returns 测试结果
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // 尝试获取模型列表作为连接测试
      const models = await this.getModels()
      return {
        success: true,
        message: `连接成功，支持 ${models.length} 个模型`
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        message: `连接失败: ${errorMessage}`
      }
    }
  }

  /**
   * 构建请求头
   *
   * @returns 请求头对象
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }
  }

  /**
   * 构建原生格式请求体
   *
   * @param request - 图像生成请求
   * @returns 请求体对象
   */
  private buildNativeRequestBody(request: ImageGenerationRequest): Record<string, any> {
    const body: Record<string, any> = {
      model: request.model || 'wanx-v1',
      input: {
        prompt: request.prompt
      },
      parameters: {
        size: `${request.width}*${request.height}`,
        n: request.count || 1
      }
    }

    // 添加负面提示词
    if (request.negativePrompt) {
      body.input.negative_prompt = request.negativePrompt
    }

    // 添加风格
    if (request.style) {
      body.parameters.style = request.style
    }

    // 添加质量
    if (request.quality === 'hd') {
      body.parameters.quality = 'hd'
    }

    // 添加种子
    if (request.seed !== undefined && request.seed >= 0) {
      body.parameters.seed = request.seed
    }

    // design §5.3 + plan A0-1：native 路径与 multimodal 一致透传 prompt_extend。
    // 缺省 = 官方默认 true（与"不传"行为一致，仅日志更明确）；
    // 人像一致性场景由 service 显式传 false
    body.parameters.prompt_extend = request.promptExtend ?? true

    // spec 2026-05-09 ep-redesign §3.2 D1：multi-reference 优先；该 wanx2.5/2.6 image-edit
    // API 用 ref_images 数组，1-4 张；超出截前 4 张；fallback 兼容 referenceImage 单值
    const refs = collectReferences(request)
    if (refs.length > 0) {
      body.input.ref_images = refs.slice(0, 4)
      // 维持兼容老 image_url 字段（若 provider 实现仍认）
      body.input.image_url = refs[0]
    }

    return body
  }

  /**
   * 映射 DashScope 任务状态到通用状态
   *
   * @param status - DashScope 任务状态
   * @returns 通用任务状态
   */
  private mapTaskStatus(status: string): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (status?.toUpperCase()) {
      case 'PENDING':
        return 'pending'
      case 'RUNNING':
      case 'PROCESSING':
        return 'processing'
      case 'SUCCEEDED':
      case 'COMPLETED':
        return 'completed'
      case 'FAILED':
      case 'ERROR':
      case 'UNKNOWN':
        return 'failed'
      default:
        return 'pending'
    }
  }

  /**
   * 发送 API 请求
   *
   * @param url - 完整的 API URL
   * @param method - HTTP 方法
   * @param body - 请求体（可选）
   * @returns API 响应
   */
  private async sendRequest<T>(
    url: string,
    method: string,
    body?: Record<string, any>,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers = { ...this.buildHeaders(), ...(extraHeaders ?? {}) }

    // 检查 API Key
    if (!this.config.apiKey) {
      throw new Error('未配置 API Key，请在设置中配置 DashScope API Key')
    }

    console.log('[DashScope] 发送请求:', {
      url,
      method,
      headers: { ...headers, Authorization: 'Bearer ***' },
      body
    })

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    const responseText = await response.text()
    console.log('[DashScope] 响应状态:', response.status)
    console.log('[DashScope] 响应内容:', responseText)

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`

      try {
        const errorJson = JSON.parse(responseText)
        errorMessage = errorJson.message || errorJson.Message || errorMessage
      } catch {
        // 无法解析为 JSON，使用原始文本
        if (responseText) {
          errorMessage = responseText
        }
      }

      throw new Error(errorMessage)
    }

    return JSON.parse(responseText)
  }

  /**
   * 获取 Provider 支持的功能特性
   *
   * @returns 功能特性描述
   */
  getFeatures(): {
    supportsAsyncTask: boolean
    supportsCancel: boolean
    supportsImageToImage: boolean
    supportsImageEdit: boolean
  } {
    return {
      supportsAsyncTask: true,
      supportsCancel: false,
      supportsImageToImage: true,
      supportsImageEdit: false
    }
  }
}
/**
 * 可灵尺寸映射（design §5.1）：宽x高像素 → 官方 aspect_ratio + resolution。
 * 官方宽高比集合仅 16:9 / 9:16 / 1:1（3:4、2:3 等竖版一律归 9:16）。
 * 分辨率规则：长边 ≥1792 → 2k，否则 1k。
 */
export function mapPixelsToKlingSize(
  width: number,
  height: number,
): { aspectRatio: '16:9' | '9:16' | '1:1'; resolution: '1k' | '2k' } {
  const ratio = width / height
  let aspectRatio: '16:9' | '9:16' | '1:1'
  if (Math.abs(ratio - 1) < 0.12) {
    aspectRatio = '1:1'
  } else if (ratio > 1) {
    aspectRatio = '16:9'
  } else {
    aspectRatio = '9:16'
  }
  const longEdge = Math.max(width, height)
  return { aspectRatio, resolution: longEdge >= 1792 ? '2k' : '1k' }
}
