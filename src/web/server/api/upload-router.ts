/**
 * 文件上传路由（multipart/form-data）
 * @module web/server/api/upload-router
 * @description 与 /api/ipc/<channel>（JSON 透传）并行的独立路由族，专门处理需要二进制
 *              字节流的资源上传。当前仅 panorama 一项，后续可扩展（headshot / item 主图等）。
 *
 * 路由：POST /api/upload/panorama
 * Body: multipart/form-data
 *   - file: 必填 · 360 全景图（jpeg/png/webp，2:1 比例 ±2%，≤50MB）
 *   - locationBindingId: 必填 · 关联地点 binding ID
 *   - label: 可选 · panorama 标签
 *
 * 响应: { ok: true, data: AssetImageEntity } | { ok: false, error: string }
 *
 * 多租户：requireAuth + runWithUserAsync 把当前请求 userId 注入 ALS，
 * 与 /api/ipc 路由保持一致的隔离规则。
 */

import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { runWithUserAsync } from '@core/context/user-context'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import {
  PanoramaGeneratorService,
  type PanoramaImageGenerator,
} from '@core/modules/episode-production/assets/services/panorama-generator.service'
import {
  PanoramaUploadService,
  PanoramaUploadValidationError,
} from '@core/modules/episode-production/assets/services/panorama-upload.service'
import { requireAuth } from '../auth/middleware'

const router = Router()

/** 与 panorama.handler.ts 对齐的 stub generator（upload 路径不会调它，仅占位） */
const stubPanoramaGen: PanoramaImageGenerator = {
  async generate() {
    throw new Error('panorama AI 生成走 IPC 路由，非 upload')
  },
}

/**
 * multer 配置：内存存储；50MB 硬上限（service 层会再校一次，提前拦截避免读完整体）。
 * 单字段 file。
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
})

router.post(
  '/panorama',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response) => {
    const file = (req as any).file as Express.Multer.File | undefined
    const locationBindingId = String(req.body?.locationBindingId ?? '').trim()
    const label = req.body?.label ? String(req.body.label) : null

    if (!file) {
      res.status(400).json({ ok: false, error: '缺少 file 字段' })
      return
    }
    if (!locationBindingId) {
      res.status(400).json({ ok: false, error: '缺少 locationBindingId' })
      return
    }

    try {
      const userId = req.user!.userId
      const result = await runWithUserAsync(userId, async () => {
        const db = getCoreDatabaseManager()
        if (!db.dataSource) throw new Error('数据库未初始化')
        const imageSvc = new AssetImageService(db.dataSource)
        const genSvc = new PanoramaGeneratorService(imageSvc, stubPanoramaGen)
        const svc = new PanoramaUploadService(getPathProvider(), genSvc)
        return await svc.upload({
          buffer: file.buffer,
          fileName: file.originalname,
          locationBindingId,
          label,
          userId,
        })
      })
      // 双层 envelope：外层 ok 是 HTTP 层；内层 success 是 IpcResponse（与 /api/ipc/<channel> 对齐）
      res.json({ ok: true, data: { success: true, data: result } })
    } catch (e: any) {
      if (e instanceof PanoramaUploadValidationError) {
        res
          .status(400)
          .json({
            ok: true,
            data: { success: false, error: `[${e.code}] ${e.message}` },
          })
        return
      }
      res
        .status(500)
        .json({
          ok: true,
          data: { success: false, error: e?.message ?? String(e) },
        })
    }
  },
)

export default router
