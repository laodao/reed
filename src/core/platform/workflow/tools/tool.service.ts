/**
 * 工具服务（P0 片1：第三方 API 工具）
 * @module core/platform/workflow/tools/tool.service
 * @description 凭据库（SecureStorage 加密）+ 自定义工具 CRUD + 预设工具 + 工具执行
 *              （参数映射 path/query/body + 凭据注入 + 复用 http-fetch 共享执行）。
 *
 * 安全纪律：api_key 只存密文（encrypt 后入库），仅在执行时解密注入请求头，绝不出现在日志/DTO。
 */

import { getSecureStorage } from '@core/interfaces/storage.interface'
import { executeHttpFetch, type HttpResponseType } from '../nodes/http-fetch'
import { PRESET_TOOL_MAP, PRESET_TOOLS } from './preset-tools'
import { TOOL_AUTH_TYPES, TOOL_KINDS, type CustomTool, type PresetTool, type ToolCredential } from '@shared/types/tool.types'
import type { EmailSearchParams } from '@shared/types/email.types'
import { createLogger } from '@core/utils/logger'
import { spawn } from 'node:child_process'

const logger = createLogger('ToolService')

/**
 * 平台门禁：本地命令执行能力（kind=cli / scanInstalledCommands）仅桌面端可用。
 * Web 端是多租户 HTTP 服务，若放行，任意登录用户可保存 kind=cli 工具并运行，
 * 即在服务器上执行任意命令（RCE）——与"桌面单用户信任模型"直接冲突。
 */
const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

function requireDesktopCli(): void {
  if (!isElectron) {
    throw new Error('本地命令行工具仅在桌面端可用（Web 端不支持 kind=cli）')
  }
}

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
    kind?: 'api' | 'cli'
    method: string
    url: string
    headers?: Array<{ key: string; value: string }>
    paramsSchema?: Array<{ key: string; label?: string; type?: string; required?: boolean; options?: unknown[]; default?: unknown }>
    authType?: string
    credentialId?: string | null
    command?: string
    argsTemplate?: string
    cwd?: string
    timeoutMs?: number
    stdoutType?: 'text' | 'json'
  }): Promise<CustomTool> {
    // Web 端禁止保存 kind=cli 工具（执行已拦截，保存层也一并拦截防误导）
    if (input.kind === TOOL_KINDS.cli) requireDesktopCli()
    return this.customTools.create({
      ...input,
      kind: input.kind ?? TOOL_KINDS.api,
      authType: input.authType ?? TOOL_AUTH_TYPES.none,
    })
  }

  async updateCustomTool(id: string, patch: Record<string, unknown>): Promise<CustomTool | null> {
    return this.customTools.update(id, patch)
  }

  async deleteCustomTool(id: string): Promise<void> {
    await this.customTools.delete(id)
  }

  // ==================== 本地命令工具 ====================

  /** 扫描 PATH 下可执行程序（供"已装程序选择"下拉）——仅桌面端 */
  async scanInstalledCommands(): Promise<Array<{ name: string; path: string }>> {
    requireDesktopCli()
    const fsMod = await import('node:fs')
    const pathMod = await import('node:path')
    const sep = pathMod.delimiter
    const dirs = (process.env.PATH ?? '').split(sep).filter(Boolean)
    const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', '.com'] : ['']
    const seen = new Map<string, string>()
    for (const dir of dirs) {
      let entries: string[]
      try { entries = fsMod.readdirSync(dir) } catch { continue }
      for (const f of entries) {
        const full = pathMod.join(dir, f)
        const lower = f.toLowerCase()
        if (!exts.some(e => lower.endsWith(e))) continue
        const base = f.replace(/\.[^.]+$/, '')
        if (!base || seen.has(base)) continue
        seen.set(base, full)
      }
    }
    return Array.from(seen.entries())
      .map(([name, path]) => ({ name, path }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // ==================== 预设工具 ====================

  listPresets(): PresetTool[] {
    return PRESET_TOOLS
  }

  // ==================== 执行 ====================

  async executeTool(input: ExecuteToolInput): Promise<ExecuteToolResult> {
    // 1. 取工具定义
    const tool: CustomTool | PresetTool | null =
      input.type === 'preset' ? PRESET_TOOL_MAP[input.toolId] ?? null : await this.customTools.findById(input.toolId)
    if (!tool) throw new Error(`工具不存在：${input.toolId}`)

    // CLI 工具：spawn 本地命令（参数按 argsTemplate 的 {{param}} 占位映射）——仅桌面端
    if (tool.kind === TOOL_KINDS.cli) {
      requireDesktopCli()
      return this.runCli(tool, input.params ?? {}, input.signal)
    }

    // 邮件工具：分派到 EmailService（SMTP 发 / IMAP 收，不走 HTTP 逻辑）
    if (tool.kind === TOOL_KINDS.email) {
      return this.runEmail(tool, input.params ?? {}, input.signal)
    }

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

  // ==================== 邮件工具执行 ====================

  /**
   * 邮件工具（kind=email）：从 params 取 accountId/operation，分派到 EmailService 对应方法。
   * EmailService 为静态类，自行通过 getCoreDatabaseManager() 访问数据库（同 translation.service 模式），
   * 因此这里无需额外注入 repo。结果规整成 ExecuteToolResult：结构化 JSON 放 json，text 放 JSON 字符串。
   * 注意：imapflow/nodemailer 不支持 AbortSignal，取消依赖 socketTimeout（60s）兜底，入口先做一次中止检查。
   */
  private async runEmail(tool: CustomTool | PresetTool, params: Record<string, unknown>, signal: AbortSignal): Promise<ExecuteToolResult> {
    const start = Date.now()
    try {
      if (signal?.aborted) throw new Error('邮件工具已取消')
      const accountId = (params.accountId as string) ?? tool.emailAccountId ?? ''
      if (!accountId) throw new Error('缺少邮箱账号参数 accountId（请选择工具绑定的邮箱账号）')
      const operation = (params.operation as string) ?? tool.operation ?? 'list'
      const folder = toStr(params.folder, 'INBOX')
      const uid = toNum(params.uid)

      const { EmailService } = await import('@core/platform/services/email.service')
      let result: unknown
      switch (operation) {
        case 'send': {
          const to = toStrArray(params.to)
          if (to.length === 0) throw new Error('收件人 to 不能为空（支持逗号分隔或 JSON 数组）')
          result = await EmailService.send({
            accountId,
            to,
            cc: params.cc !== undefined ? toStrArray(params.cc) : undefined,
            bcc: params.bcc !== undefined ? toStrArray(params.bcc) : undefined,
            subject: toStr(params.subject, ''),
            text: params.text !== undefined ? String(params.text) : undefined,
            html: params.html !== undefined ? String(params.html) : undefined,
            attachments: toAttachments(params.attachments),
          })
          break
        }
        case 'list':
        case 'search': {
          const p: EmailSearchParams = {
            accountId,
            folder,
            from: params.from !== undefined ? String(params.from) : undefined,
            subject: params.subject !== undefined ? String(params.subject) : undefined,
            since: params.since !== undefined ? String(params.since) : undefined,
            before: params.before !== undefined ? String(params.before) : undefined,
            unreadOnly: params.unreadOnly !== undefined ? Boolean(params.unreadOnly) : undefined,
            limit: params.limit !== undefined ? Number(params.limit) : undefined,
          }
          result = operation === 'list' ? await EmailService.list(p) : await EmailService.search(p)
          break
        }
        case 'read': {
          if (!Number.isFinite(uid)) throw new Error('缺少邮件 uid')
          result = await EmailService.read({ accountId, uid, folder })
          break
        }
        case 'mark_seen': {
          if (!Number.isFinite(uid)) throw new Error('缺少邮件 uid')
          result = await EmailService.markSeen({ accountId, uid, seen: Boolean(params.seen), folder })
          break
        }
        case 'delete': {
          if (!Number.isFinite(uid)) throw new Error('缺少邮件 uid')
          result = await EmailService.delete({ accountId, uid, folder })
          break
        }
        case 'status': {
          result = await EmailService.status({ accountId })
          break
        }
        case 'download_attachment': {
          if (!Number.isFinite(uid)) throw new Error('缺少邮件 uid')
          const filename = toStr(params.filename, '')
          if (!filename) throw new Error('缺少附件文件名 filename')
          result = await EmailService.downloadAttachment({
            accountId,
            uid,
            filename,
            folder,
            outputDir: params.outputDir !== undefined ? String(params.outputDir) : undefined,
          })
          break
        }
        default:
          throw new Error(`未知邮件操作：${operation}`)
      }

      const durationMs = Date.now() - start
      // EmailService 统一返回 { success, ... }；success=true → 200，否则 500
      const ok = !!(result && typeof result === 'object' && (result as { success?: boolean }).success === true)
      return { status: ok ? 200 : 500, ok, json: result, text: JSON.stringify(result), durationMs }
    } catch (e) {
      logger.error('[ToolService] 邮件工具执行失败', e)
      return { status: 500, ok: false, text: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start }
    }
  }

  // ==================== CLI 工具执行 ====================

  /** 本地命令工具：参数映射到 argsTemplate 的 {{param}} 占位 → spawn 执行，捕获 stdout/stderr */  private runCli(tool: CustomTool | PresetTool, params: Record<string, unknown>, signal: AbortSignal): Promise<ExecuteToolResult> {
    const command = (tool.command ?? '').trim()
    if (!command) throw new Error('CLI 工具未配置命令行')
    const rendered = (tool.argsTemplate ?? '').replace(/\{\{([\w.]+)\}\}/g, (_m, k: string) =>
      params[k] !== undefined ? String(params[k]) : ''
    )
    const args = splitArgs(rendered)
    const start = Date.now()
    const timeoutMs = tool.timeoutMs ?? 30000
    return new Promise<ExecuteToolResult>((resolve) => {
      let child = spawn(command, args, { cwd: tool.cwd || undefined, shell: false })
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (r: ExecuteToolResult) => { if (!settled) { settled = true; resolve(r) } }
      const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 已退出 */ } }, timeoutMs)
      const onAbort = () => { try { child.kill('SIGKILL') } catch { /* 已退出 */ } }
      if (signal) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
      child.once('error', err => {
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        finish({ status: 0, ok: false, text: `启动命令失败：${err.message}`, durationMs: Date.now() - start })
      })
      child.stdout?.on('data', d => { stdout += String(d) })
      child.stderr?.on('data', d => { stderr += String(d) })
      child.once('close', code => {
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        const ok = code === 0
        let json: unknown = null
        if (ok && tool.stdoutType === 'json') {
          try { json = JSON.parse(stdout) } catch { /* 非 JSON，json 保持 null */ }
        }
        finish({
          status: code ?? 0,
          ok,
          json: json,
          text: (stdout || stderr).trim(),
          durationMs: Date.now() - start,
        })
      })
    })
  }
}

/** 简单命令行参数拆分（支持空格/引号包裹，V1） */
function splitArgs(s: string): string[] {
  const m = s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
  if (!m) return []
  return m.map(t => t.replace(/^["']|["']$/g, ''))
}

// ==================== 邮件参数规整 helper ====================

/** 转字符串（缺省用 dflt） */
function toStr(v: unknown, dflt: string): string {
  if (v === undefined || v === null) return dflt
  return String(v)
}

/** 转数字（非法返回 NaN，调用方用 Number.isFinite 校验） */
function toNum(v: unknown): number {
  if (v === undefined || v === null) return NaN
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** 收件人/抄送等：JSON 数组 | 逗号分隔字符串 → string[] */
function toStrArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return []
    if (t.startsWith('[')) {
      try {
        const p = JSON.parse(t)
        if (Array.isArray(p)) return p.map(String).filter(Boolean)
      } catch { /* 不是 JSON，走逗号拆分 */ }
    }
    return t.split(',').map(s => s.trim()).filter(Boolean)
  }
  return [String(v)]
}

/** 附件参数：JSON 数组或字符串 → {filename, contentBase64?, path?}[] */
function toAttachments(v: unknown): Array<{ filename: string; contentBase64?: string; path?: string }> | undefined {
  if (v === undefined || v === null) return undefined
  let arr: unknown = v
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return undefined
    try { arr = JSON.parse(t) } catch { return undefined }
  }
  if (!Array.isArray(arr)) return undefined
  return arr
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map(it => ({
      filename: String(it.filename ?? 'attachment'),
      contentBase64: it.contentBase64 !== undefined ? String(it.contentBase64) : undefined,
      path: it.path !== undefined ? String(it.path) : undefined,
    }))
}
