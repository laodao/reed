/**
 * 日记附件服务（spec 2026-09-24 日记增强 P3-1/P3-2）
 * @module core/packs/diary/services/diary-attachment.service
 * @description 内嵌贴图全链：上传（粘贴/拖拽）→ `.assets` 目录 → markdown 引用
 *              → 视觉模型生成中文描述（best-effort）→ alt text 进检索上下文。
 *              另含 P3-2 图片写作引子（Apple Journal 反转：从最近的附件图生成
 *              一条第一人称写作 prompt）。
 *
 * 路径纪律：markdown 里存 **dataPath 相对路径**（`diary/<folderPath>/.assets/<file>`）——
 * Electron `local-image://` 协议与 Web `/assets/` 路由都按 dataPath 解析，双端零转换可渲染。
 * 注意：自定义数据路径的桌面端，附件树（dataPath）与正文树（userData/diary）物理分离，
 * 渲染不受影响；目录重命名后既有附件链接不跟随（v1 已知边界）。
 *
 * 安全：Web 端 VLM 描述直接用上传时的 base64（不经绝对路径读文件），
 * 规避多租户下任意路径读取；导出资源内嵌同样有 dataPath 越权守卫。
 */

import * as fs from 'fs'
import * as path from 'path'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { resolveAssetPath } from '@core/utils/asset-path'
import { DiaryService } from '@core/platform/services/diary.service'
import { callVLM } from '@core/platform/services/ai-call'
import type { DiaryAttachment, DiaryIpcResponse } from '@shared/types/diary.types'

/** 上传图片大小上限（base64 前的原始字节数） */
const MAX_IMAGE_BYTES = 8 * 1024 * 1000
/** 写作引子回看的附件时间窗 */
const PROMPT_LOOKBACK_DAYS = 30

/** 附件文件名安全化：保留中文与常用字符，替换路径分隔与控制字符 */
function sanitizeFileName(name: string): string {
  const stripped = Array.from(name)
    .filter(ch => ch.charCodeAt(0) > 31)
    .join('')
  const base = stripped.replace(/[\\/:*?"<>|]/g, '_').trim()
  return (base || 'image.png').slice(0, 120)
}

export interface UploadAttachmentResult {
  attachment: DiaryAttachment
  /** 插入正文用的 markdown（alt=描述或文件名，src=dataPath 相对路径） */
  markdown: string
}

export class DiaryAttachmentService {
  /**
   * 上传附件（图片）：写文件 → 建记录 → fire-and-forget 视觉描述。
   * 返回可直接插入正文的 markdown。
   */
  async uploadAttachment(
    entryId: string,
    fileName: string,
    base64: string,
    mimeType?: string
  ): Promise<DiaryIpcResponse<UploadAttachmentResult>> {
    try {
      const db = getCoreDatabaseManager()
      const service = new DiaryService()
      const entryResp = await service.getEntry(entryId)
      if (!entryResp.success || !entryResp.data) {
        return { success: false, error: entryResp.error || '日记不存在' }
      }
      const entry = entryResp.data
      if (entry.deletedAt) {
        return { success: false, error: '日记在回收站中，请先恢复再添加图片' }
      }
      const folder = await db.diaryFolders?.findById(entry.folderId)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      const raw = Buffer.from(base64, 'base64')
      if (raw.length === 0) {
        return { success: false, error: '附件内容为空' }
      }
      if (raw.length > MAX_IMAGE_BYTES) {
        return { success: false, error: '图片超过 8MB 上限' }
      }

      // 附件目录：dataPath/diary/<folderPath>/.assets（默认安装=日记目录的 .assets，同一位置）
      const dataPath = getPathProvider().getDataPath()
      const assetsDir = path.join(dataPath, 'diary', folder.path, '.assets')
      fs.mkdirSync(assetsDir, { recursive: true })

      const safeName = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-${sanitizeFileName(fileName)}`
      const absPath = path.join(assetsDir, safeName)
      fs.writeFileSync(absPath, raw)

      // dataPath 相对路径（双端渲染协议的统一口径）
      const relPath = ['diary', folder.path, '.assets', safeName].join('/')

      const attachment = await db.diaryAttachments!.create(
        entryId,
        safeName,
        relPath,
        raw.length,
        mimeType
      )

      // 视觉描述 best-effort：不阻塞插入，失败静默（alt text 退化为文件名）
      const dataUrl = `data:${mimeType || 'image/png'};base64,${base64}`
      void this.describeInternal(attachment.id, dataUrl)

      const alt = sanitizeFileName(fileName).replace(/\.[a-z0-9]+$/i, '') || '图片'
      return {
        success: true,
        data: {
          attachment,
          markdown: `![${alt}](${relPath})`,
        },
      }
    } catch (error) {
      console.error('[DiaryAttachment] uploadAttachment error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 视觉描述（可手动重试）：用绝对路径读文件生成 dataUrl 后调 VLM。
   * 仅桌面端允许路径读取；Web 端用上传链路里已有的 base64（describeInternal）。
   */
  async describeAttachment(attachmentId: string): Promise<DiaryIpcResponse<string>> {
    try {
      const db = getCoreDatabaseManager()
      const att = await db.diaryAttachments?.findById(attachmentId)
      if (!att) return { success: false, error: '附件不存在' }

      const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron
      if (!isElectron) {
        return { success: false, error: 'Web 端请在粘贴时自动生成描述' }
      }
      const absPath = resolveAssetPath(att.filePath)
      const mime = att.mimeType || 'image/png'
      const buf = fs.readFileSync(absPath)
      return await this.describeInternal(attachmentId, `data:${mime};base64,${buf.toString('base64')}`)
    } catch (error) {
      console.error('[DiaryAttachment] describeAttachment error:', error)
      return { success: false, error: String(error) }
    }
  }

  /** VLM 描述生成 + 落库（内部共用）；永不 throw */
  private async describeInternal(attachmentId: string, dataUrl: string): Promise<DiaryIpcResponse<string>> {
    try {
      const db = getCoreDatabaseManager()
      const description = await callVLM(
        '用一句中文描述这张图片的内容（不超过 40 字，客观、具体，便于日后检索）。',
        dataUrl,
        '你是图片描述助手。',
        120
      )
      const trimmed = description.trim().slice(0, 200)
      if (!trimmed) return { success: false, error: '描述为空' }
      await db.diaryAttachments!.updateDescription(attachmentId, trimmed)
      return { success: true, data: trimmed }
    } catch (error) {
      console.warn('[DiaryAttachment] 生成视觉描述失败（忽略）:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 图片写作引子（P3-2）：最近 30 天的图片附件 → VLM 生成第一人称写作开头。
   * 无图片 / 无模型 / 调用失败 → success=false（灵感条自然隐藏该板块）。
   */
  async getWritingPrompt(): Promise<
    DiaryIpcResponse<{ attachmentId: string; fileName: string; prompt: string } | null>
  > {
    try {
      const db = getCoreDatabaseManager()
      const since = new Date(Date.now() - PROMPT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      const images = await db.diaryAttachments!.findRecentImages(since, 1)
      if (images.length === 0) {
        return { success: true, data: null }
      }
      const image = images[0]

      const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron
      let dataUrl: string
      if (isElectron) {
        const mime = image.mimeType || 'image/png'
        const buf = fs.readFileSync(resolveAssetPath(image.filePath))
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      } else {
        // Web 端：不经路径读取（多租户安全），无缓存 base64 可用则跳过
        return { success: true, data: null }
      }

      const prompt = await callVLM(
        '看这张照片。用第一人称写一个日记写作引子：一两句话，把「我」带回拍照那一刻的场景或心情，引出一段值得写下的回忆或想法。只输出引子正文，不要解释。',
        dataUrl,
        '你是日记写作引导助手。',
        150
      )
      const trimmed = prompt.trim()
      if (!trimmed) return { success: true, data: null }
      return { success: true, data: { attachmentId: image.id, fileName: image.fileName, prompt: trimmed } }
    } catch (error) {
      console.warn('[DiaryAttachment] getWritingPrompt 失败（忽略）:', error)
      return { success: true, data: null }
    }
  }

  /**
   * 删除附件：文件 + 记录（不改正文，用户自行删 markdown 引用）
   */
  async deleteAttachment(attachmentId: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getCoreDatabaseManager()
      const att = await db.diaryAttachments?.findById(attachmentId)
      if (!att) return { success: false, error: '附件不存在' }
      try {
        const absPath = resolveAssetPath(att.filePath)
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
      } catch (error) {
        console.warn('[DiaryAttachment] 删除文件失败（继续删记录）:', error)
      }
      await db.diaryAttachments!.delete(attachmentId)
      return { success: true }
    } catch (error) {
      console.error('[DiaryAttachment] deleteAttachment error:', error)
      return { success: false, error: String(error) }
    }
  }
}
