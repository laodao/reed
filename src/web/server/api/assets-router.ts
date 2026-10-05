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

/**
 * 可内联渲染的扩展名 → Content-Type 白名单（review M4 防御纵深）。
 * 白名单外的扩展一律 application/octet-stream：遗留数据里可能仍有任意扩展名的
 * 附件（上传侧白名单上线前的存量），sendFile 默认按扩展名推断 Content-Type，
 * .html 会以 text/html 同源伺服构成存储型 XSS。svg 故意不在名单（可内嵌脚本）。
 */
const SAFE_INLINE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  txt: 'text/plain'
}

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
    const ext = path.extname(abs).slice(1).toLowerCase()
    res.sendFile(abs, {
      // nosniff：禁止浏览器对 octet-stream 等响应做 MIME 嗅探升级
      headers: { 'X-Content-Type-Options': 'nosniff' },
      setHeaders: r => {
        const mime = SAFE_INLINE_MIME[ext]
        // 白名单内固定已知安全类型；白名单外强制下载（octet-stream），不猜 Content-Type
        r.set('Content-Type', mime ?? 'application/octet-stream')
      }
    })
  })
})

export default router
