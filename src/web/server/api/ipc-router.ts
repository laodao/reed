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
 */

import { Router, type Request, type Response } from 'express'
import { invokeIpc } from '@core/ipc/ipc-bridge'
import { runWithUserAsync } from '@core/context/user-context'
import { requireAuth } from '../auth/middleware'

const router = Router()

router.post('/:channel', requireAuth, async (req: Request, res: Response) => {
  const channel = req.params.channel
  const args = Array.isArray(req.body?.args) ? req.body.args : []

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
