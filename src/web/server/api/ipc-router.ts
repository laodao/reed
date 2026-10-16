/**
 * IPC HTTP 路由
 * @module web/server/api/ipc-router
 * @description POST /api/ipc/<channel> 把 body.args 透传给 invokeIpc，返回结果。
 *              所有 channel 都需要登录后才能调用。
 *              channel 处理函数从 ipc-bridge 注册表中读取（业务侧只需 registerIpc）。
 *
 *              多租户：runWithUserAsync 把当前请求 userId 注入 ALS，
 *              core 层 BaseRepository 在所有查询/写入前自动按此 userId
 *              过滤 / 填充 user_id 列。
 *
 *              管理面收敛：共享配置/事件运维/平台字典等"全局一份"的写通道
 *              （useRawRepo 仓储，无租户列）仅 admin 可调用——Web 多租户下
 *              任意注册用户可改写会劫持全体用户的 AI 出口/停启业务包/删除
 *              共享字典。读通道保持全员可用（模型下拉等 UI 依赖）。
 *              Electron 单用户不走此路由（默认账号即 admin），不受影响。
 */

import { Router, type Request, type Response } from 'express'
import { invokeIpc } from '@core/ipc/ipc-bridge'
import { runWithUserAsync } from '@core/context/user-context'
import { requireAuth } from '../auth/middleware'

const router = Router()

/** admin 前缀门禁：该前缀下全部 channel 仅 admin */
const ADMIN_CHANNEL_PREFIXES = ['event-admin:']

/** admin 精确门禁：全局共享配置/字典的写与危险操作（读通道不收口） */
const ADMIN_CHANNELS = new Set([
  // provider / api-key：共享 AI 出口（改 baseUrl/apiKey 可劫持全体用户流量）
  'provider-config:create',
  'provider-config:update',
  'provider-config:delete',
  'provider-config:set-default',
  'api-key:set',
  'api-key:delete',
  // OSS / 搜索引擎 / 数据源：共享凭据写
  'oss:create-config',
  'oss:update-config',
  'oss:delete-config',
  'oss:set-default',
  'oss:toggle-enabled',
  'search-engine:create',
  'search-engine:update',
  'search-engine:delete',
  'search-engine:set-default',
  'search-engine:set-quick-enabled',
  'datasource:create',
  'datasource:update',
  'datasource:delete',
  'datasource:toggle-enabled',
  // 全局设置 / 平台包启停
  'settings:set',
  'pack:setEnabled',
  // AI Hub 功能总开关：全局开关（开启后所有用户可见登录入口与网关模型），仅 admin
  'aihub:set-enabled',
  // 长文写作共享字典（表设计无租户列，属全局引用数据）：写操作收敛为 admin
  'longwriting:createDictionaryCategory',
  'longwriting:updateDictionaryCategory',
  'longwriting:deleteDictionaryCategory',
  'longwriting:createDictionaryItem',
  'longwriting:updateDictionaryItem',
  'longwriting:deleteDictionaryItem',
  'longwriting:reorderDictionary',
  // Obsidian 导出：handler 内部已有 isElectron 守卫（Web 端返回仅桌面端可用），
  // 这里再加一层路由门禁兜底，防止未来守卫被移除后 vaultPath 任意写复发（review H1）
  'export:to-obsidian',
  'export:get-vault-directories',
  'export:get-vault-files',
  'export:get-obsidian-vaults'
])

function isAdminChannel(channel: string): boolean {
  return ADMIN_CHANNELS.has(channel) || ADMIN_CHANNEL_PREFIXES.some(p => channel.startsWith(p))
}

router.post('/:channel', requireAuth, async (req: Request, res: Response) => {
  // express 5 类型下路由参数是 string | string[]，此路由无通配符，运行时恒为 string
  const channel = req.params.channel as string
  const args = Array.isArray(req.body?.args) ? req.body.args : []

  if (isAdminChannel(channel) && req.user!.role !== 'admin') {
    res.status(403).json({ ok: false, error: `通道 ${channel} 需要管理员权限` })
    return
  }

  try {
    const userId = req.user!.userId
    const result = await runWithUserAsync(userId, async () => {
      return await invokeIpc(channel, args)
    })
    res.json({ ok: true, data: result })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message ?? String(e) })
  }
})

export default router
