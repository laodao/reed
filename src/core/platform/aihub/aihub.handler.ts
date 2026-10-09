/**
 * AI Hub IPC 处理器（平台基础设施，非业务包）
 * @module platform/aihub/handler
 * @description 账号（login/register/logout/session）+ 模型刷新 + 计费（balance/redeem/recharge-url）。
 *              Electron 主进程与 Web server 共用同一 register 函数（ipcBridge 跨平台桥）。
 *
 *              事件：aihub:session-changed（登录/登出/401 广播）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import {
  aihubLogin,
  aihubLogout,
  aihubRegister,
  getAihubSession,
  getAihubSessionInfo,
  onAihubTokenExpired,
  saveAihubGatewayConfig
} from './aihub-auth.service'
import { refreshAihubModels } from './aihub-models.service'
import {
  getAihubBalance,
  getAihubRechargeUrl,
  redeemAihubCode,
  redeemErrcodeMessage
} from './aihub-billing.service'
import type { AihubBalanceInfo } from './aihub-billing.service'
import { AihubError } from './aihub-client'

/** 统一错误文案：保留 message（渲染端按 [AIHUB_*] 前缀映射引导） */
function toErrorMessage(e: unknown): string {
  if (e instanceof AihubError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

export function registerAihubHandlers(): void {
  ipcBridge.handle('aihub:login', async (_event, params: {
    gatewayUrl?: string
    identity: string
    password: string
  }) => {
    try {
      const session = await aihubLogin(params ?? { identity: '', password: '' })
      return { success: true, session }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  ipcBridge.handle('aihub:register', async (_event, params: {
    gatewayUrl?: string
    email: string
    password: string
  }) => {
    try {
      const session = await aihubRegister(params ?? { email: '', password: '' })
      return { success: true, session }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  ipcBridge.handle('aihub:logout', async () => {
    try {
      await aihubLogout()
      return { success: true }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  ipcBridge.handle('aihub:session', async () => {
    try {
      const session = await getAihubSessionInfo()
      return { success: true, session }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  ipcBridge.handle('aihub:refresh-models', async () => {
    try {
      const session = await getAihubSession()
      if (!session) return { success: false, error: '未登录 AI Hub，请先登录' }
      const models = await refreshAihubModels(session)
      return { success: true, count: models.length }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  // 会话过期时由 LLM provider 的 401 特判调用（清会话 + 禁用 config + 广播）
  ipcBridge.handle('aihub:token-expired', async () => {
    try {
      await onAihubTokenExpired()
      return { success: true }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  ipcBridge.handle('aihub:save-gateway-config', async (_event, config: {
    gatewayUrl: string
    rechargeUrl?: string
  }) => {
    try {
      await saveAihubGatewayConfig(config ?? { gatewayUrl: '' })
      return { success: true }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  ipcBridge.handle('aihub:balance', async (): Promise<{ success: boolean; balance?: AihubBalanceInfo; error?: string }> => {
    try {
      return { success: true, balance: await getAihubBalance() }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })

  ipcBridge.handle('aihub:redeem', async (_event, params: { code: string }) => {
    try {
      const result = await redeemAihubCode(params?.code ?? '')
      return { success: true, result }
    } catch (e) {
      const msg = e instanceof AihubError ? redeemErrcodeMessage(e.code, e.message) : toErrorMessage(e)
      return { success: false, error: msg }
    }
  })

  ipcBridge.handle('aihub:recharge-url', async () => {
    try {
      const url = await getAihubRechargeUrl()
      return { success: true, url }
    } catch (e) {
      return { success: false, error: toErrorMessage(e) }
    }
  })
}

export function unregisterAihubHandlers(): void {
  for (const ch of [
    'aihub:login',
    'aihub:register',
    'aihub:logout',
    'aihub:session',
    'aihub:refresh-models',
    'aihub:token-expired',
    'aihub:save-gateway-config',
    'aihub:balance',
    'aihub:redeem',
    'aihub:recharge-url'
  ]) {
    ipcBridge.removeHandler(ch)
  }
}
