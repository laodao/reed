/**
 * AI Hub 网关接入层类型定义
 * @module platform/aihub/types
 * @description 对齐 ai-hub 接入手册（third-party-system-integration-guide.md）
 *              §7.6 account session 直连 / §4.7 模型列表 / §8.4 计费自助端点。
 *
 *              the-bot 是第一方客户端：登录即 `POST /api/account/login` 拿 account JWT，
 *              模型 API 用 `Authorization: Bearer <jwt>` 调用，无 HMAC / OAuth2 PKCE。
 */

/** ai-hub 网关默认地址（本地开发部署；可在 AI Hub 设置面板修改） */
export const AIHUB_DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8081'

/** ai-hub 接入方模板 ID（provider_configs.template_id） */
export const AIHUB_TEMPLATE_ID = 'ai-hub'

/** 会话在 settings KV 的存储键前缀（按用户隔离：Electron 单用户 / Web 按 ALS userId） */
export const AIHUB_SESSION_KEY_PREFIX = 'aihub_session'
/** 网关配置（网关地址 / 充值门户地址）在 settings KV 的存储键前缀 */
export const AIHUB_GATEWAY_CONFIG_KEY_PREFIX = 'aihub_gateway'
/** ai-hub config 的 customParams 中「系统因登出/401 自动禁用」标记键 */
export const AIHUB_AUTO_DISABLED_FLAG = 'aihubAutoDisabled'

/**
 * 错误码约定（渲染端按前缀映射为登录引导 / 充值引导，见 dialog store 与 Chat.vue）：
 * - [AIHUB_NOT_LOGGED_IN]      未登录就调用网关模型
 * - [AIHUB_SESSION_EXPIRED]    JWT 过期/被吊销（401）
 * - [AIHUB_INSUFFICIENT_BALANCE] 余额不足（402）
 */
export const AIHUB_ERR_NOT_LOGGED_IN = '[AIHUB_NOT_LOGGED_IN]'
export const AIHUB_ERR_SESSION_EXPIRED = '[AIHUB_SESSION_EXPIRED]'
export const AIHUB_ERR_INSUFFICIENT_BALANCE = '[AIHUB_INSUFFICIENT_BALANCE]'

/** 账号会话（settings KV 中加密存储的明文结构） */
export interface AihubSession {
  /** ai-hub 账号 ID（acc_ 前缀） */
  accountId: string
  /** 登录邮箱 */
  email: string
  /** account JWT（Bearer 凭证，默认 7 天） */
  jwt: string
  /** 过期时间（ISO 字符串，来自 /api/account/login 的 expires_at） */
  expiresAt: string
  /** 网关地址（不含 /v1 版本段，如 http://127.0.0.1:8081） */
  gatewayUrl: string
}

/** 网关配置（登录面板可编辑；settings KV 明文存储——不含机密） */
export interface AihubGatewayConfig {
  /** 网关地址（不含 /v1） */
  gatewayUrl: string
  /** 托管充值门户地址（可选，如 https://ai-hub-web/#/recharge）；为空时 UI 只提示兑换码充值 */
  rechargeUrl?: string
}

/** POST /api/account/login|register 响应 data */
export interface AihubAccountTokenResponse {
  id: string
  email?: string
  token: string
  expires_at: string
}

/** ai-hub 统一响应信封（/api/* 与 /v1/tasks* 等） */
export interface AihubEnvelope<T = unknown> {
  code: number
  message: string
  data?: T
  trace_id?: string
}

/** GET /v1/models 条目（OpenAI 标准格式 + x-ai-hub 扩展） */
export interface AihubModelListItem {
  id: string
  object?: string
  created?: number
  /** OpenAI 标准无 model_type 字段，分类一律读 x-ai-hub（手册 §7.6.1） */
  'x-ai-hub'?: {
    model_type?: 'chat' | 'image' | 'video' | 'music' | 'audio' | 'embedding' | 'rerank'
    billing_mode?: string
    capabilities?: string[]
    context_length?: number
    supports_streaming?: boolean
    supports_function_calling?: boolean
    supports_vision?: boolean
  }
}

/** GET /api/v1/me/balance 响应 data（金额均为 int64 微积分，展示 ÷10^6 为积分） */
export interface AihubBalance {
  user_id: string
  balance: number
  frozen: number
  total_consumed: number
}

/** POST /api/v1/me/redeem 响应 data */
export interface AihubRedeemResult {
  user_id: string
  balance: number
  amount: number
}

/** aihub:session IPC 响应（渲染端设置面板 / 选择器刷新用） */
export interface AihubSessionInfo {
  loggedIn: boolean
  /** 会话存在且未过期 */
  valid: boolean
  email?: string
  expiresAt?: string
  gatewayUrl?: string
  rechargeUrl?: string
}

/** 兑换码 errcode → 中文提示（手册 §8.4） */
export const AIHUB_REDEEM_ERRCODE_MESSAGES: Record<number, string> = {
  70015: '兑换码不存在，请检查输入',
  70011: '兑换码已被使用',
  70012: '兑换码已过期',
  70014: '兑换码批次已禁用',
  70010: '兑换码不适用于当前工作空间',
  70016: '该批次兑换次数已达上限',
  7: '操作过于频繁，请稍后再试'
}
