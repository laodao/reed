/**
 * 工具服务（P0 片1：第三方 API 工具）
 * @module core/modules/workflow/tools/tool.service
 * @description 凭据库（SecureStorage 加密）+ 自定义工具 CRUD + 预设工具 + 工具执行
 *              （参数映射 path/query/body + 凭据注入 + 复用 http-fetch 共享执行）。
 *
 * 安全纪律：api_key 只存密文（encrypt 后入库），仅在执行时解密注入请求头，绝不出现在日志/DTO。
 */

import { getSecureStorage } from '@core/interfaces/storage.interface'
import { executeHttpFetch, type HttpResponseType } from '../nodes/http-fetch'
import { PRESET_TOOL_MAP, PRESET_TOOLS } from './preset-tools'
import { TOOL_AUTH_TYPES, type CustomTool, type PresetTool, type ToolCredential } from '@shared/types/tool.types'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('ToolService')

type CredentialRepoLike = {
  list(): Promise<ToolCredential[]>
  findById(id: string): Promise<ToolCredential | null>
  create(i: { name: string; apiKeyEnc: string; baseUrl?: string | null }): Promise<ToolCredential>
  delete(id: string): Promise<number>
}

type CustomToolRepoLike = {
  list(): Promise<CustomTool[]>
  findById(id: string): Promise<CustomTool | null>
  create(i: {
    name: string
    description?: string | null
    method: string
    url: string
    headers?: Array<{ key: string; value: string }>
    paramsSchema?: Array<{ key: string; label?: string; type?: string; required?: boolean; options?: unknown[]; default?: unknown }>
    authType?: string
    credentialId?: string | null
  }): Promise<CustomTool>
  update(id: string, patch: Record<string, unknown>): Promise<CustomTool | null>
  delete(id: string): Promise<number>
}

export interface ExecuteToolInput {
  type: 'custom' | 'preset'
  toolId: string
  credentialId?: string | null
  params?: Record<string, unknown>
  signal: AbortSignal
  /** 响应处理模式（缺省 auto：二进制→落盘路径） */
  responseType?: HttpResponseType
  /** file 模式落盘目录（缺省 dataPath/workflow-media/http） */
  outputDir?: string
}

export interface ExecuteToolResult {
  status: number
  ok: boolean
  json?: unknown
  text: string
  durationMs: number
  /** 二进制响应（base64 模式） */
  base64?: string
  /** 二进制响应（base64 模式）：data:<mime>;base64,... */
  dataUrl?: string
  /** 二进制响应（file/auto 模式）落盘路径 */
  filePath?: string
  mimeType?: string
  sizeBytes?: number
}

export class ToolService {
  constructor(
    private readonly credentials: CredentialRepoLike,
    private readonly customTools: CustomToolRepoLike,
  ) {}

  // ==================== 凭据 ====================

  async listCredentials(): Promise<ToolCredential[]> {
    return this.credentials.list()
  }

  /** 保存凭据：apiKey 加密后落库（绝不明文） */
  async saveCredential(input: { name: string; apiKey: string; baseUrl?: string }): Promise<ToolCredential> {
    const secureStorage = getSecureStorage()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const apiKeyEnc = secureStorage.encrypt(input.apiKey)
    return this.credentials.create({ name: input.name, apiKeyEnc, baseUrl: input.baseUrl })
  }

  async deleteCredential(id: string): Promise<void> {
    await this.credentials.delete(id)
  }

  /** 解密凭据 key（执行时注入请求头用） */
  private decryptKey(cred: ToolCredential): string {
    try {
      return getSecureStorage().decrypt(cred.apiKeyEnc)
    } catch (e) {
      logger.error('[ToolService] 凭据解密失败', { credId: cred.id })
      throw new Error(`凭据「${cred.name}」解密失败，请重新保存`)
    }
  }

  // ==================== 自定义工具 ====================

  async listCustomTools(): Promise<CustomTool[]> {
    return this.customTools.list()
  }

  async saveCustomTool(input: {
    name: string
    description?: string
    method: string
    url: string
    headers?: Array<{ key: string; value: string }>
    paramsSchema?: Array<{ key: string; label?: string; type?: string; required?: boolean; options?: unknown[]; default?: unknown }>
    authType?: string
    credentialId?: string | null
  }): Promise<CustomTool> {
    return this.customTools.create({ ...input, authType: input.authType ?? TOOL_AUTH_TYPES.none })
  }

  async updateCustomTool(id: string, patch: Record<string, unknown>): Promise<CustomTool | null> {
    return this.customTools.update(id, patch)
  }

  async deleteCustomTool(id: string): Promise<void> {
    await this.customTools.delete(id)
  }

  // ==================== 预设工具 ====================

  listPresets(): PresetTool[] {
    return PRESET_TOOLS
  }

  // ==================== 执行 ====================

  async executeTool(input: ExecuteToolInput): Promise<ExecuteToolResult> {
    // 1. 取工具定义
    const tool: { method: string; url: string; headers: Array<{ key: string; value: string }>; authType: string } | null =
      input.type === 'preset' ? PRESET_TOOL_MAP[input.toolId] ?? null : await this.customTools.findById(input.toolId)
    if (!tool) throw new Error(`工具不存在：${input.toolId}`)

    // 2. 凭据（可选）
    let apiKey = ''
    if (input.credentialId) {
      const cred = await this.credentials.findById(input.credentialId)
      if (cred) apiKey = this.decryptKey(cred)
    }

    // 3. 组装 URL：path 占位替换 + GET 参数进 query / 其余进 body
    let url = tool.url
    const query: string[] = []
    const bodyParams: Record<string, unknown> = {}
    const params = input.params ?? {}
    for (const [k, v] of Object.entries(params)) {
      const ph = `{{${k}}}`
      if (url.includes(ph)) {
        url = url.split(ph).join(encodeURIComponent(String(v)))
      } else if (tool.method === 'GET') {
        query.push(`${k}=${encodeURIComponent(String(v))}`)
      } else {
        bodyParams[k] = v
      }
    }
    if (query.length > 0) url += (url.includes('?') ? '&' : '?') + query.join('&')

    // 4. headers：{{credential}} 占位替换 + 无占位且 authType=credential 自动 Bearer
    const headers: Record<string, string> = {}
    let hasCredentialPlaceholder = false
    for (const h of tool.headers) {
      if (!h.key) continue
      const hv = h.value.includes('{{credential}}') ? h.value.split('{{credential}}').join(apiKey) : h.value
      if (h.value.includes('{{credential}}')) hasCredentialPlaceholder = true
      headers[h.key] = hv
    }
    if (apiKey && tool.authType === TOOL_AUTH_TYPES.credential && !hasCredentialPlaceholder) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // 5. 执行（复用 http-fetch：超时封顶/取消合并/统一输出；responseType 透传支持二进制响应）
    const body = tool.method === 'GET' || Object.keys(bodyParams).length === 0 ? undefined : JSON.stringify(bodyParams)
    const start = Date.now()
    const resp = await executeHttpFetch(
      {
        method: tool.method,
        url,
        headers,
        body,
        responseType: input.responseType,
        outputDir: input.outputDir,
      },
      input.signal
    )
    const durationMs = Date.now() - start
    if (!resp.ok) {
      return { status: 0, ok: false, text: resp.error, durationMs }
    }
    return {
      status: resp.output.status,
      ok: resp.output.status >= 200 && resp.output.status < 300,
      json: resp.output.json,
      text: resp.output.body,
      base64: resp.output.base64,
      dataUrl: resp.output.dataUrl,
      filePath: resp.output.filePath,
      mimeType: resp.output.mimeType,
      sizeBytes: resp.output.sizeBytes,
      durationMs,
    }
  }
}
