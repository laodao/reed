/**
 * 日记附件上传类型校验单测（review M4 回归）
 *
 * 背景：uploadAttachment 此前只校验大小与非空——任意扩展名可入库（含 .html），
 * Web 端 /assets 按扩展名以 text/html 同源伺服构成存储型 XSS；mimeType 由调用方
 * 任意声明。修复后：扩展名白名单（png/jpg/jpeg/gif/webp）+ 魔数嗅探 + 两者一致
 * 三重校验，落库 mimeType 以嗅探结果为准。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-att-'))

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    diaryFolders: { findById: async () => ({ id: 'f1', path: 'default' }) },
    diaryAttachments: {
      create: async (
        _entryId: string,
        fileName: string,
        relPath: string,
        size: number,
        mime?: string
      ) => ({ id: 'att1', fileName, filePath: relPath, fileSize: size, mimeType: mime }),
      updateDescription: async () => undefined
    }
  })
}))

vi.mock('@core/platform/services/diary.service', () => ({
  DiaryService: class {
    async getEntry() {
      return { success: true, data: { id: 'e1', folderId: 'f1', deletedAt: null } }
    }
  }
}))

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => tmpRoot })
}))

vi.mock('@core/platform/services/ai-call', () => ({
  callVLM: async () => '一张测试图片'
}))

import { DiaryAttachmentService } from '@core/packs/diary/services/diary-attachment.service'

const svc = new DiaryAttachmentService()

/** 1x1 PNG（真实魔数） */
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001',
  'hex'
)
const JPEG_BYTES = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex')
const GIF_BYTES = Buffer.from('47494638396101000100800000000000', 'hex')

describe('uploadAttachment 类型三重校验（M4）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('合法 PNG 通过，落库 mimeType 为嗅探结果（非调用方声明）', async () => {
    const r = await svc.uploadAttachment('e1', 'a.png', PNG_BYTES.toString('base64'), 'text/html')
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data!.attachment.mimeType).toBe('image/png')
      expect(r.data!.markdown).toContain('](diary/default/.assets/')
    }
  })

  it('JPEG/GIF 魔数与扩展一致时通过', async () => {
    const j = await svc.uploadAttachment('e1', 'b.jpg', JPEG_BYTES.toString('base64'))
    expect(j.success).toBe(true)
    const g = await svc.uploadAttachment('e1', 'c.gif', GIF_BYTES.toString('base64'))
    expect(g.success).toBe(true)
    if (g.success) expect(g.data!.attachment.mimeType).toBe('image/gif')
  })

  it('.html 扩展名直接拒绝（存储型 XSS 封堵）', async () => {
    const html = Buffer.from('<script>alert(1)</script>')
    const r = await svc.uploadAttachment('e1', 'evil.html', html.toString('base64'), 'text/html')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toContain('不支持的图片格式')
  })

  it('无扩展名 / 白名单外扩展（svg）拒绝', async () => {
    const noExt = await svc.uploadAttachment('e1', 'photo', PNG_BYTES.toString('base64'))
    expect(noExt.success).toBe(false)
    const svg = await svc.uploadAttachment(
      'e1',
      'x.svg',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
      'image/svg+xml'
    )
    expect(svg.success).toBe(false)
  })

  it('魔数不匹配拒绝（扩展 png 但内容是文本）', async () => {
    const r = await svc.uploadAttachment(
      'e1',
      'fake.png',
      Buffer.from('this is not an image at all').toString('base64')
    )
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toContain('魔数校验')
  })

  it('扩展与魔数不一致拒绝（扩展 png 但内容是 JPEG）', async () => {
    const r = await svc.uploadAttachment('e1', 'fake.png', JPEG_BYTES.toString('base64'))
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toContain('不一致')
  })
})
