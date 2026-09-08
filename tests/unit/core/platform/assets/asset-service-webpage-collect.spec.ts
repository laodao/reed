/**
 * 网页收藏资产后端行为测试（file 型 html + markdown 正文 + 元数据）
 * @module tests/unit/core/platform/assets/asset-service-webpage-collect
 * @description 真实 sqlite + 真实临时资产目录：
 *              - createAsset file 形态可同时携带 textContent（markdown）与 metadata
 *              - 文件真实落盘、删除资产连文件一起清理
 *              - 内建分类「网页收藏」（previewMode=html）可命中
 *              - renderAssetPreview html 模式对 file 型资产读磁盘 html（而非 textContent md）
 *              - text 型资产仍走 textContent（回归）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DataSource } from 'typeorm'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { createAssetCategories } from '@core/database/migrations/create-asset-categories'
import { AssetEntity } from '@core/database/entities/asset.entity'
import { AssetCategoryEntity } from '@core/database/entities/asset-category.entity'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'
import { AssetService } from '@core/platform/assets/asset.service'
import { AssetStorageService } from '@core/platform/assets/asset-storage.service'

// ---- mock 数据目录提供器：指向真实临时目录（验证落盘） ----
let tmpRoot = ''
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => tmpRoot,
    toAssetUrl: (p: string) => `file:///${tmpRoot.replace(/\\/g, '/')}/${p}`,
  }),
}))

// ---- mock 文档工具层 ----
const documentToolsMock = {
  canRenderBinary: vi.fn(() => false),
  renderImage: vi.fn(async () => ({ buffer: Buffer.from('png-bytes'), html: '<img-html/>', format: 'image' })),
  renderHtml: vi.fn(async (input: { markdown: string; title?: string }) => `<html>${input.markdown}</html>`),
}
vi.mock('@core/platform/services/document-tools/document-tools', () => ({
  getDocumentTools: () => documentToolsMock,
}))

const HTML_BODY = `<!doctype html><html><head><meta charset="utf-8"><style>body{color:#333}</style></head><body><h1>单文件快照</h1><p>归档原文</p></body></html>`
const MD_BODY = `# 单文件快照\n\n归档原文`

async function buildService(): Promise<{ svc: AssetService; ds: DataSource }> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetEntity, AssetCategoryEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAssetsTables(ds)
  await ds.query(`ALTER TABLE assets ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  await createAssetCategories(ds)
  const svc = new AssetService(new AssetStorageService(), new AssetRepository(ds), new AssetCategoryRepository(ds))
  return { svc, ds }
}

function fileAssetInput() {
  const b64 = Buffer.from(HTML_BODY, 'utf-8').toString('base64')
  return {
    category: 'document' as const,
    subCategory: '网页收藏',
    name: '示例页.html',
    content: { kind: 'file' as const, path: `data:text/html;base64,${b64}` },
    textContent: MD_BODY,
    metadata: { sourceUrl: 'https://example.com/article', sourceTitle: '示例页', fetchedAt: '2026-09-05T00:00:00.000Z', sourceRunId: 'run_1' },
    sourceType: 'workflow',
    sourceRef: 'run_1',
  }
}

describe('网页收藏资产（file + textContent + metadata）', () => {
  let svc: AssetService
  let ds: DataSource

  beforeEach(async () => {
    vi.clearAllMocks()
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-web-collect-'))
    const built = await buildService()
    svc = built.svc
    ds = built.ds
  })

  afterEach(async () => {
    await ds.destroy()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('内建分类包含「网页收藏」（previewMode=html）', async () => {
    const defs = await svc.listAssetCategories()
    const cat = defs.find(c => c.name === '网页收藏')
    expect(cat).toBeTruthy()
    expect(cat?.previewMode).toBe('html')
    expect(cat?.code).toBe('webpage_collect')
  })

  it('createAsset file 形态落盘 html + 写 text_content 列 + metadata', async () => {
    const rec = await svc.createAsset(fileAssetInput())
    expect(rec.kind).toBe('file')
    expect(rec.category).toBe('document')
    expect(rec.subCategory).toBe('网页收藏')
    expect(rec.storagePath).toBeTruthy()
    expect(rec.textContent).toBe(MD_BODY)
    expect(rec.metadata).toMatchObject({ sourceUrl: 'https://example.com/article' })
    expect(rec.sourceRef).toBe('run_1')
    // 磁盘文件真实存在且为归档 html
    const abs = path.join(tmpRoot, ...rec.storagePath!.split('/'))
    expect(fs.existsSync(abs)).toBe(true)
    expect(fs.readFileSync(abs, 'utf-8')).toContain('单文件快照')
  })

  it('deleteAsset 删除记录并清理落盘 html 文件', async () => {
    const rec = await svc.createAsset(fileAssetInput())
    const abs = path.join(tmpRoot, ...rec.storagePath!.split('/'))
    expect(fs.existsSync(abs)).toBe(true)
    expect(await svc.deleteAsset(rec.id)).toBe(true)
    expect(fs.existsSync(abs)).toBe(false)
  })

  it('previewInfoFor：subCategory=网页收藏 命中 html 分类定义', async () => {
    const rec = await svc.createAsset(fileAssetInput())
    const info = await svc.previewInfoFor(rec)
    expect(info).toMatchObject({ mode: 'html', previewable: true })
  })

  it('renderAssetPreview：file 型网页收藏读磁盘 html 原文（而非 textContent md）', async () => {
    const rec = await svc.createAsset(fileAssetInput())
    const result = await svc.renderAssetPreview(rec)
    expect(result).not.toBeNull()
    expect(result?.mode).toBe('html')
    const html = (result as { html: string }).html
    expect(html).toContain('<h1>单文件快照</h1>')
    expect(html).not.toContain('# 单文件快照')
  })

  it('renderAssetPreview：text 型资产仍取 textContent（回归：md 渲染链路不受影响）', async () => {
    const cat = await svc.createAssetCategory({ name: 'HTML分类', previewMode: 'html' })
    const rec = await svc.createAsset({ content: { kind: 'text', text: '<h1>原生HTML</h1>' }, category: 'text', subCategory: cat.name, name: 'h' })
    const result = await svc.renderAssetPreview(rec)
    expect(result).toEqual({ mode: 'html', html: '<h1>原生HTML</h1>' })
  })
})
