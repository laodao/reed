/**
 * AI Hub 计费服务（余额 / 兑换码 / 充值门户）
 * @module platform/aihub/billing
 * @description account session 的个人 workspace 余额查询、兑换码充值、托管充值门户地址。
 *              金额口径：int64 微积分（μpt），1 元 = 10 积分 = 10^7 微积分；展示 ÷10^6 为积分。
 */

import { aihubRequest } from './aihub-client'
import { getAihubSession, getAihubGatewayConfig } from './aihub-auth.service'
import {
  AIHUB_REDEEM_ERRCODE_MESSAGES,
  type AihubBalance,
  type AihubRedeemResult
} from './aihub.types'

export interface AihubBalanceInfo extends AihubBalance {
  /** 积分（= 微积分 ÷ 10^6，展示用） */
  balancePoints: number
  frozenPoints: number
  totalConsumedPoints: number
}

/** 查询个人 workspace 余额（需已登录；未登录抛错由 handler 转文案） */
export async function getAihubBalance(): Promise<AihubBalanceInfo> {
  const session = await getAihubSession()
  if (!session) throw new Error('未登录 AI Hub，请先登录')
  const data = await aihubRequest<AihubBalance>({
    gatewayUrl: session.gatewayUrl,
    path: '/api/v1/me/balance',
    jwt: session.jwt,
    timeoutMs: 15_000
  })
  return {
    ...data,
    balancePoints: data.balance / 1_000_000,
    frozenPoints: data.frozen / 1_000_000,
    totalConsumedPoints: data.total_consumed / 1_000_000
  }
}

/** 兑换码充值（卡密不区分大小写，空白由调用方 trim） */
export async function redeemAihubCode(code: string): Promise<AihubRedeemResult> {
  const trimmed = code?.trim()
  if (!trimmed) throw new Error('请输入兑换码')
  const session = await getAihubSession()
  if (!session) throw new Error('未登录 AI Hub，请先登录')
  return aihubRequest<AihubRedeemResult>({
    gatewayUrl: session.gatewayUrl,
    path: '/api/v1/me/redeem',
    method: 'POST',
    jwt: session.jwt,
    body: { code: trimmed },
    timeoutMs: 15_000
  })
}

/** 兑换码 errcode → 中文提示（优先映射表，兜底信封 message） */
export function redeemErrcodeMessage(code: number, fallback: string): string {
  return AIHUB_REDEEM_ERRCODE_MESSAGES[code] ?? fallback
}

/** 托管充值门户地址（设置面板配置；未配置返回 null → UI 提示用兑换码） */
export async function getAihubRechargeUrl(): Promise<string | null> {
  const cfg = await getAihubGatewayConfig()
  return cfg.rechargeUrl ?? null
}
