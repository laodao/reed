/**
 * FileService 资产引用解析测试（AI 对话 @ 资产）
 * @module tests/core/services/file-service-asset-ref
 * @description readAttachment 带 assetId：text 资产→文本附件、image 资产→base64 图片附件、
 *              音频/视频→元信息附件、资产不存在抛错；无 assetId 走原文件逻辑。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { FileService } from '@core/services/file.service'
import { registerAssetService, resetAssetService } from '@core/modules/assets/asset-registry'
import type { AssetService } from '@core/modules/assets/asset.service'

function mockAssetService(rows: Record<string, any>): void {
  const stub = {
    getAsset: vi.fn(async (id: string) => rows[id] ?? null),
    resolveAssetPath: vi.fn((a: any) => a.__absPath ?? ''),
  } as unknown as AssetService
  registerAssetService(stub)
}

describe('FileService.readAttachment 资产引用', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-ref-test-'))
  })
  afterEach(() => {
    resetAssetService()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('text 资产 → document + 内容文本', async () => {
    mockAssetService({
      a1: { id: 'a1', name: '早报文案', category: 'text', kind: 'text', textContent: '# 早报\n\n正文内容', mimeType: 'text/markdown' },
    })
    const content = await FileService.readAttachment({
      id: 'att-1', type: 'document', fileName: '早报文案', filePath: '', fileSize: 0, mimeType: '', assetId: 'a1', assetCategory: 'text',
    })
    expect(content.type).toBe('document')
    expect(content.textContent).toContain('# 早报')
    expect(content.fileName).toBe('早报文案')
  })

  it('json 资产 → document + JSON 内容', async () => {
    mockAssetService({
      a2: { id: 'a2', name: '数据', category: 'json', kind: 'json', jsonContent: '{"k":1}', mimeType: 'application/json' },
    })
    const content = await FileService.readAttachment({
      id: 'att-2', type: 'document', fileName: '数据', filePath: '', fileSize: 0, mimeType: '', assetId: 'a2', assetCategory: 'json',
    })
    expect(content.textContent).toContain('"k"')
  })

  it('image 资产（file 型）→ image + base64', async () => {
    const imgPath = path.join(tmpDir, 'pic.png')
    fs.writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))
    mockAssetService({
      a3: { id: 'a3', name: '配图', category: 'image', kind: 'file', storagePath: 'assets/image/xx.png', mimeType: 'image/png', __absPath: imgPath },
    })
    const content = await FileService.readAttachment({
      id: 'att-3', type: 'document', fileName: '配图', filePath: '', fileSize: 0, mimeType: '', assetId: 'a3', assetCategory: 'image',
    })
    expect(content.type).toBe('image')
    expect(content.base64Data.length).toBeGreaterThan(0)
  })

  it('audio 资产 → document + 元信息提示（模型无法直接解析音频）', async () => {
    mockAssetService({
      a4: { id: 'a4', name: '录音', category: 'audio', kind: 'file', storagePath: 'assets/audio/x.wav', mimeType: 'audio/wav' },
    })
    const content = await FileService.readAttachment({
      id: 'att-4', type: 'document', fileName: '录音', filePath: '', fileSize: 0, mimeType: '', assetId: 'a4', assetCategory: 'audio',
    })
    expect(content.type).toBe('document')
    expect(content.textContent).toContain('音频资产')
    expect(content.textContent).toContain('无法直接解析')
  })

  it('video 资产 → document + 元信息提示', async () => {
    mockAssetService({
      a5: { id: 'a5', name: '片段', category: 'video', kind: 'file', storagePath: 'assets/video/x.mp4', mimeType: 'video/mp4' },
    })
    const content = await FileService.readAttachment({
      id: 'att-5', type: 'document', fileName: '片段', filePath: '', fileSize: 0, mimeType: '', assetId: 'a5', assetCategory: 'video',
    })
    expect(content.textContent).toContain('视频资产')
  })

  it('资产不存在 → 抛错', async () => {
    mockAssetService({})
    await expect(FileService.readAttachment({
      id: 'att-6', type: 'document', fileName: 'x', filePath: '', fileSize: 0, mimeType: '', assetId: 'missing',
    })).rejects.toThrow('资产不存在')
  })

  it('无 assetId → 走原文件逻辑（文件缺失抛错）', async () => {
    await expect(FileService.readAttachment({
      id: 'att-7', type: 'document', fileName: 'x.txt', filePath: path.join(tmpDir, 'nope.txt'), fileSize: 0, mimeType: 'text/plain',
    })).rejects.toThrow('文件不存在')
  })
})
