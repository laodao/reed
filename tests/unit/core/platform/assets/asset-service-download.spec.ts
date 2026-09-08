/**
 * 资产下载载荷测试（AssetService.buildDownloadPayload）
 * @module tests/unit/core/platform/assets/asset-service-download
 * @description 真实 sqlite：四种形态（file/text/json/url）的下载文件名与内容组装，
 *              文件名清洗/扩展名补齐/URL 快捷方式格式。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync, unlinkSync } from 'node:fs'
import { DataSource } from 'typeorm'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { AssetEntity } from '@core/database/entities/asset.entity'
import { AssetGroupEntity } from '@core/database/entities/asset-group.entity'
import { AssetCategoryEntity } from '@core/database/entities/asset-category.entity'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { AssetGroupRepository } from '@core/database/repositories/asset-group.repository'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'
import { AssetService } from '@core/platform/assets/asset.service'
import { AssetStorageService } from '@core/platform/assets/asset-storage.service'

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => 'C:/mock-data',
    toAssetUrl: (p: string) => `file:///C:/mock-data/${p}`,
  }),
}))

async function buildService() {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetEntity, AssetGroupEntity, AssetCategoryEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAssetsTables(ds)
  await ds.query(`ALTER TABLE assets ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  const svc = new AssetService(
    new AssetStorageService(),
    new AssetRepository(ds),
    new AssetCategoryRepository(ds),
    new AssetGroupRepository(ds),
  )
  return { svc, ds }
}

describe('AssetService.buildDownloadPayload', () => {
  let svc: AssetService

  beforeEach(async () => {
    vi.clearAllMocks()
    const built = await buildService()
    svc = built.svc
  })

  it('file 形态：复制源文件，文件名取存储文件名，sourcePath 为绝对路径', async () => {
    const tmpFile = join(tmpdir(), `dl-src-${Date.now()}.png`)
    writeFileSync(tmpFile, 'PNG')
    try {
      const a = await svc.createAsset({ content: { kind: 'file', path: tmpFile }, name: '封面.png' })
      const payload = await svc.buildDownloadPayload(a)
      expect(payload.kind).toBe('file')
      // 存储落盘会同名去重（封面-2.png），文件名应取存储后的实际文件名
      expect(payload.fileName).toBe(a.storagePath!.split('/').pop()!)
      expect(payload.fileName).toMatch(/\.png$/)
      expect(payload.sourcePath).toBeTruthy()
      expect(payload.sourcePath!.replace(/\\/g, '/').startsWith('C:/mock-data/assets/')).toBe(true)
    } finally {
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
    }
  })

  it('text 形态：文件名补 .md，内容为 textContent', async () => {
    const a = await svc.createAsset({ content: { kind: 'text', text: '# 报告\n内容' }, name: '每日早报' })
    const payload = await svc.buildDownloadPayload(a)
    expect(payload.kind).toBe('text')
    expect(payload.fileName).toBe('每日早报.md')
    expect(payload.content).toBe('# 报告\n内容')
  })

  it('text 形态：name 已带 .md 不重复补齐', async () => {
    const a = await svc.createAsset({ content: { kind: 'text', text: 'x' }, name: '说明.md' })
    const payload = await svc.buildDownloadPayload(a)
    expect(payload.fileName).toBe('说明.md')
  })

  it('json 形态：文件名补 .json，内容为 jsonContent', async () => {
    const a = await svc.createAsset({ content: { kind: 'json', json: '{"a":1}' }, name: '结果' })
    const payload = await svc.buildDownloadPayload(a)
    expect(payload.kind).toBe('text')
    expect(payload.fileName).toBe('结果.json')
    expect(payload.content).toBe('{"a":1}')
  })

  it('url 形态：文件名补 .url，内容为 InternetShortcut 快捷方式', async () => {
    const a = await svc.createAsset({ content: { kind: 'url', url: 'https://example.com/x' }, name: '来源链接' })
    const payload = await svc.buildDownloadPayload(a)
    expect(payload.kind).toBe('text')
    expect(payload.fileName).toBe('来源链接.url')
    expect(payload.content).toBe('[InternetShortcut]\nURL=https://example.com/x\n')
  })

  it('无可下载内容（空文本）抛错', async () => {
    const a = await svc.createAsset({ content: { kind: 'text', text: '   ' }, name: '空白' })
    await expect(svc.buildDownloadPayload(a)).rejects.toThrow(/无文本内容/)
  })

  it('view=preview 且可渲染长图：下载渲染 PNG（看图片下图片）', async () => {
    const a = await svc.createAsset({ content: { kind: 'text', text: '# 早报\n内容' }, name: '每日早报' })
    const spy = vi.spyOn(svc, 'renderAssetPreview').mockResolvedValue({ mode: 'image', url: 'data:image/png;base64,AAAA', html: '' })
    const payload = await svc.buildDownloadPayload(a, 'preview')
    expect(payload.kind).toBe('image')
    expect(payload.fileName).toBe('每日早报.png')
    expect(payload.base64Data).toBe('AAAA')
    expect(payload.mimeType).toBe('image/png')
    expect(spy).toHaveBeenCalledWith(a)
  })

  it('view=source 时按存储形态下载文本（看文本下文本），不触发渲染', async () => {
    const a = await svc.createAsset({ content: { kind: 'text', text: '# 早报\n内容' }, name: '每日早报' })
    const spy = vi.spyOn(svc, 'renderAssetPreview')
    const payload = await svc.buildDownloadPayload(a, 'source')
    expect(payload.kind).toBe('text')
    expect(payload.fileName).toBe('每日早报.md')
    expect(payload.content).toBe('# 早报\n内容')
    expect(spy).not.toHaveBeenCalled()
  })

  it('view=preview 但渲染不出图：回退按存储形态', async () => {
    const a = await svc.createAsset({ content: { kind: 'text', text: '# 早报\n内容' }, name: '每日早报' })
    vi.spyOn(svc, 'renderAssetPreview').mockResolvedValue(null)
    const payload = await svc.buildDownloadPayload(a, 'preview')
    expect(payload.kind).toBe('text')
    expect(payload.fileName).toBe('每日早报.md')
  })
})
