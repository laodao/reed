/**
 * AI Hub 账号会话服务（account session 直连，手册 §7.6）
 * @module platform/aihub/auth
 * @description 注册/登录/登出/会话查询 + JWT 加密持久化 + JWT 物化进 ai-hub provider config。
 *
 * 核心机制（设计文档 2026-09-15 §2.2.1 决策一/决策五）：
 * - 真源：会话（JWT/email/expiresAt/gatewayUrl）按用户存 settings KV（SecureStorage 加密）；
 * - 物化：登录成功时把 JWT 加密写入 ai-hub config 的 api_key_encrypted——现有全部
 *   调用链（apiKey 前置检查/decrypt/Bearer）零改动天然通过；
 * - 状态机：登出/401 清物化 Key 并把 config 置 disabled（customParams 记 aihubAutoDisabled
 *   标记）；重新登录时仅当该标记为 true 才恢复启用——用户手动禁用的偏好不被冲掉。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { getCurrentUserId, LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { PROVIDER_TEMPLATES } from '@core/platform/services/provider-template.service'
import type { UserProviderConfig } from '@shared/types/provider-template.types'
import { aihubRequest, normalizeGatewayUrl } from './aihub-client'
import { refreshAihubModels, findAihubConfig } from './aihub-models.service'
import {
  AIHUB_AUTO_DISABLED_FLAG,
  AIHUB_DEFAULT_GATEWAY_URL,
  AIHUB_GATEWAY_CONFIG_KEY_PREFIX,
  AIHUB_SESSION_KEY_PREFIX,
  AIHUB_TEMPLATE_ID,
  type AihubAccountTokenResponse,
  type AihubGatewayConfig,
  type AihubSession,
  type AihubSessionInfo
} from './aihub.types'

/** 会话 KV 键：按用户隔离（Electron 单用户回落 local-default-user） */
function sessionKey(): string {
  return `${AIHUB_SESSION_KEY_PREFIX}:${getCurrentUserId() ?? LOCAL_DEFAULT_USER_ID}`
}

/** 网关配置 KV 键（同会话粒度） */
function gatewayConfigKey(): string {
  return `${AIHUB_GATEWAY_CONFIG_KEY_PREFIX}:${getCurrentUserId() ?? LOCAL_DEFAULT_USER_ID}`
}

async function getSettingsRepo() {
  const settings = getCoreDatabaseManager().settings
  if (!settings) throw new Error('数据库未初始化（settings 仓储不可用）')
  return settings
}

/** 广播会话变化事件（渲染端设置面板/选择器据此刷新） */
function broadcastSessionChanged(loggedIn: boolean): void {
  try {
    getEventEmitter().emit('aihub:session-changed', { loggedIn })
  } catch {
    // 启动早期 EventEmitter 未注册时静默忽略
  }
}

/** 广播配置变化（复用 provider-config:changed，驱动各模型选择器刷新） */
function broadcastConfigChanged(): void {
  try {
    getEventEmitter().emit('provider-config:changed', {})
  } catch {
    // 同上
  }
}

// ==================== 会话存取 ====================

/** 读取当前用户会话；过期视为未登录（但不主动清除——401/登出时才清） */
export async function getAihubSession(): Promise<AihubSession | null> {
  try {
    const settings = await getSettingsRepo()
    const encrypted = await settings.get(sessionKey())
    if (typeof encrypted !== 'string' || !encrypted) return null
    const secureStorage = getSecureStorage()
    if (!secureStorage.isInitialized()) await secureStorage.initialize()
    const raw = secureStorage.decrypt(encrypted)
    const session = JSON.parse(raw) as AihubSession
    if (!session?.jwt) return null
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

/** 会话是否存在且未过期（runtimeUsable / UI 引导判定用） */
export async function hasValidAihubSession(): Promise<boolean> {
  return (await getAihubSession()) !== null
}

async function saveSession(session: AihubSession): Promise<void> {
  const settings = await getSettingsRepo()
  const secureStorage = getSecureStorage()
  if (!secureStorage.isInitialized()) await secureStorage.initialize()
  await settings.set(sessionKey(), secureStorage.encrypt(JSON.stringify(session)))
}

async function clearSession(): Promise<void> {
  const settings = await getSettingsRepo()
  await settings.delete(sessionKey())
}

// ==================== 网关配置 ====================

/** 读取网关配置（网关地址/充值门户）；无记录时回落会话里的地址，再回落默认值 */
export async function getAihubGatewayConfig(): Promise<AihubGatewayConfig> {
  const fallback: AihubGatewayConfig = { gatewayUrl: AIHUB_DEFAULT_GATEWAY_URL }
  try {
    const settings = await getSettingsRepo()
    const stored = (await settings.get(gatewayConfigKey())) as AihubGatewayConfig | null
    if (stored?.gatewayUrl) return stored
    const session = await getAihubSession()
    if (session?.gatewayUrl) return { gatewayUrl: session.gatewayUrl }
  } catch {
    // 存储不可用时回落默认值
  }
  return fallback
}

async function saveGatewayConfig(config: AihubGatewayConfig): Promise<void> {
  const settings = await getSettingsRepo()
  await settings.set(gatewayConfigKey(), config)
}

// ==================== config 物化与状态机 ====================

/** 首次登录自动创建 ai-hub config（isEnabled=true，baseUrl=网关地址+/v1） */
async function ensureAihubConfig(gatewayUrl: string): Promise<UserProviderConfig> {
  const dbManager = getCoreDatabaseManager()
  if (!dbManager.providerConfigs) throw new Error('数据库未初始化（providerConfigs 仓储不可用）')

  const existing = await findAihubConfig()
  if (existing) return existing

  const template = PROVIDER_TEMPLATES.find((t) => t.id === AIHUB_TEMPLATE_ID)
  return dbManager.providerConfigs.create({
    templateId: AIHUB_TEMPLATE_ID,
    name: template?.name ?? 'AI Hub（统一网关）',
    baseUrl: `${normalizeGatewayUrl(gatewayUrl)}/v1`,
    isEnabled: true,
    isDefault: false
  })
}

/** 把 JWT 加密物化进 ai-hub config（主进程直写库，不经渲染端表单——掩码哨兵会吞掉明文） */
async function materializeJwt(configId: string, jwt: string): Promise<void> {
  const dbManager = getCoreDatabaseManager()
  if (!dbManager.providerConfigs) throw new Error('数据库未初始化')
  const secureStorage = getSecureStorage()
  if (!secureStorage.isInitialized()) await secureStorage.initialize()
  await dbManager.providerConfigs.update(configId, { apiKey: secureStorage.encrypt(jwt) })
}

/**
 * 登出/401 共用：清物化 Key + 置 disabled + 记 autoDisabled 标记。
 * 保留用户的其他 customParams 字段。
 */
async function disableAihubConfig(): Promise<void> {
  const config = await findAihubConfig()
  if (!config) return
  const dbManager = getCoreDatabaseManager()
  if (!dbManager.providerConfigs) return
  await dbManager.providerConfigs.update(config.id, {
    apiKey: undefined,
    isEnabled: false,
    customParams: { ...(config.customParams ?? {}), [AIHUB_AUTO_DISABLED_FLAG]: true }
  })
}

// ==================== 对外动作 ====================

export interface AihubLoginParams {
  /** 网关地址（不含 /v1）；空则用已存配置或默认值 */
  gatewayUrl?: string
  /** 登录标识：邮箱/手机号/用户名 */
  identity: string
  password: string
}

/**
 * 登录：`POST /api/account/login` → 存会话 → 建/更新 config → 物化 JWT → 刷新模型。
 * autoDisabled 状态机：仅当上次是系统禁用（标记为 true）才恢复启用。
 */
export async function aihubLogin(params: AihubLoginParams): Promise<AihubSessionInfo> {
  const gatewayCfg = await getAihubGatewayConfig()
  const gatewayUrl = normalizeGatewayUrl(params.gatewayUrl?.trim() || gatewayCfg.gatewayUrl)
  if (!params.identity?.trim() || !params.password) {
    throw new Error('请输入登录标识（邮箱）与密码')
  }

  const data = await aihubRequest<AihubAccountTokenResponse>({
    gatewayUrl,
    path: '/api/account/login',
    method: 'POST',
    body: { identity: params.identity.trim(), password: params.password }
  })

  return persistAihubSession(
    {
      accountId: data.id,
      email: data.email || params.identity.trim(),
      jwt: data.token,
      expiresAt: data.expires_at,
      gatewayUrl
    },
    gatewayCfg
  )
}

export interface AihubRegisterParams {
  gatewayUrl?: string
  email: string
  password: string
}

/**
 * 注册：`POST /api/account/register`（注册即自动建个人 workspace + 授权全部已注册模型）。
 * 响应直接携带 token，等价于登录成功——复用登录的物化流程。
 */
export async function aihubRegister(params: AihubRegisterParams): Promise<AihubSessionInfo> {
  const gatewayCfg = await getAihubGatewayConfig()
  const gatewayUrl = normalizeGatewayUrl(params.gatewayUrl?.trim() || gatewayCfg.gatewayUrl)
  if (!params.email?.trim() || !params.password) {
    throw new Error('请输入邮箱与密码')
  }

  const data = await aihubRequest<AihubAccountTokenResponse>({
    gatewayUrl,
    path: '/api/account/register',
    method: 'POST',
    body: { email: params.email.trim(), password: params.password }
  })

  return persistAihubSession(
    {
      accountId: data.id,
      email: data.email || params.email.trim(),
      jwt: data.token,
      expiresAt: data.expires_at,
      gatewayUrl
    },
    gatewayCfg
  )
}

/**
 * 登出：清会话 + 清物化 Key + config 置 disabled（autoDisabled 标记）。
 * 自有 Key 的 provider 不受任何影响。
 */
export async function aihubLogout(): Promise<void> {
  await clearSession()
  await disableAihubConfig()
  broadcastConfigChanged()
  broadcastSessionChanged(false)
}

/**
 * JWT 失效处理（LLM 401 路径调用）：语义等同登出。
 * 无 refresh 机制（手册 §7.6.2），401 的统一处理就是重新登录。
 */
export async function onAihubTokenExpired(): Promise<void> {
  await clearSession()
  await disableAihubConfig()
  broadcastConfigChanged()
  broadcastSessionChanged(false)
}

/** 保存网关配置（设置面板「保存地址」用） */
export async function saveAihubGatewayConfig(config: AihubGatewayConfig): Promise<void> {
  await saveGatewayConfig({
    gatewayUrl: normalizeGatewayUrl(config.gatewayUrl),
    rechargeUrl: config.rechargeUrl?.trim() || undefined
  })
}

/** 查询当前登录态（渲染端启动与各选择器用） */
export async function getAihubSessionInfo(): Promise<AihubSessionInfo> {
  const gatewayCfg = await getAihubGatewayConfig()
  const session = await getAihubSession()
  return buildSessionInfo(session, gatewayCfg.rechargeUrl)
}

/**
 * 登录/注册共用的落地流程：存会话 → config 状态机 → 物化 JWT → 刷新模型 → 广播。
 * autoDisabled 状态机：仅当上次是系统禁用（标记为 true）才恢复启用——
 * 用户登录期间手动禁用的（标记 false/缺失）保持禁用，尊重用户偏好。
 */
async function persistAihubSession(
  session: AihubSession,
  gatewayCfg: AihubGatewayConfig
): Promise<AihubSessionInfo> {
  await saveGatewayConfig({ ...gatewayCfg, gatewayUrl: session.gatewayUrl })
  await saveSession(session)

  const config = await ensureAihubConfig(session.gatewayUrl)
  const wasAutoDisabled = (config.customParams as Record<string, unknown> | undefined)?.[
    AIHUB_AUTO_DISABLED_FLAG
  ]
  const dbManager = getCoreDatabaseManager()
  if (wasAutoDisabled === true && dbManager.providerConfigs) {
    await dbManager.providerConfigs.update(config.id, {
      isEnabled: true,
      customParams: { ...(config.customParams ?? {}), [AIHUB_AUTO_DISABLED_FLAG]: false }
    })
  }

  await materializeJwt(config.id, session.jwt)
  try {
    await refreshAihubModels(session)
  } catch (e) {
    // 模型刷新失败不阻断登录（网关 /v1/models 偶发不可用时可手动刷新）
    console.warn('[aihub] 登录后刷新模型清单失败（可稍后手动刷新）:', e)
  }

  broadcastConfigChanged()
  broadcastSessionChanged(true)
  return buildSessionInfo(session, gatewayCfg.rechargeUrl)
}

function buildSessionInfo(
  session: AihubSession | null,
  rechargeUrl?: string
): AihubSessionInfo {
  if (!session) return { loggedIn: false, valid: false, gatewayUrl: AIHUB_DEFAULT_GATEWAY_URL, rechargeUrl }
  return {
    loggedIn: true,
    valid: new Date(session.expiresAt).getTime() > Date.now(),
    email: session.email,
    expiresAt: session.expiresAt,
    gatewayUrl: session.gatewayUrl,
    rechargeUrl
  }
}
