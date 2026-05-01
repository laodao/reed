/**
 * 资源（图像 / 音频 / 视频）路由
 * @module web/server/api/assets-router
 * @description GET /assets/<path>：把客户端请求的相对路径解析为
 *              <userDataPath>/<rel-path> 的文件，并返回流。
 *
 *              安全：用 path.resolve + startsWith 检查，禁止 ../ 越权读取
 *              用户目录之外的文件。
 */

import { Router, type Request, type Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { runWithUserAsync } from '@core/context/user-context'
import { getPathProvider } from '@core/interfaces/path.interface'
import { requireAuth } from '../auth/middleware'

const router = Router()

router.get('/*splat', requireAuth, async (req: Request, res: Response) => {
  const splat = (req.params as any).splat
  const relRaw = Array.isArray(splat) ? splat.join('/') : (splat ?? '')
  const rel = decodeURIComponent(relRaw)
  if (!rel) {
    res.status(400).json({ ok: false, error: 'missing path' })
    return
  }

  await runWithUserAsync(req.user!.userId, async () => {
    const dataPath = getPathProvider().getDataPath()
    const abs = path.resolve(dataPath, rel)
    // 防越权：必须在 dataPath 内
    const dataPathResolved = path.resolve(dataPath)
    if (!abs.startsWith(dataPathResolved + path.sep) && abs !== dataPathResolved) {
      res.status(403).json({ ok: false, error: 'forbidden' })
      return
    }
    if (!fs.existsSync(abs)) {
      res.status(404).json({ ok: false, error: 'not found' })
      return
    }
    res.sendFile(abs)
  })
})

export default router
