/**
 * 资产分类定义服务测试（AssetService 分类管理 + 分类驱动预览）
 * @module tests/core/modules/assets/asset-service-category
 * @description 真实 sqlite（assets + asset_categories 表）+ mock path provider / document-tools：
 *              分类 CRUD 校验、内置禁改禁删、listAssetCategories 计数合并、
 *              previewInfoFor 命中规则、renderAssetPreview 各预览模式渲染分支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { createAssetCategories } from '@core/database/migrations/create-asset-categories'
import { AssetEntity } from '@core/database/entities/asset.entity'
import { AssetCategoryEntity } from '@core/database/entities/asset-category.entity'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'
import { AssetService } from '@core/modules/assets/asset.service'
import { AssetStorageService } from '@core/modules/assets/asset-storage.service'

// ---- mock 数据目录提供器 ----
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => 'C:/mock-data',
    toAssetUrl: (p: string) => `file:///C:/mock-data/${p}`,
  }),
}))

// ---- mock 文档工具层（分类预览渲染入口） ----
const documentToolsMock = {
  canRenderBinary: vi.fn(() => false),
  renderImage: vi.fn(async () => ({ buffer: Buffer.from('png-bytes'), html: '<img-html/>', format: 'image' })),
  renderHtml: vi.fn(async (input: { markdown: string; title?: string }) => `<html>${input.markdown}</html>`),
}
vi.mock('@core/services/document-tools/document-tools', () => ({
  getDocumentTools: () => documentToolsMock,
}))

async function buildService(): Promise<{ svc: AssetService; ds: DataSource }> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetEntity, AssetCategoryEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAssetsTables(ds)
  // is_builtin 列由 create-builtin-apps 迁移补（本测试聚焦分类，手动补齐）
  await ds.query(`ALTER TABLE assets ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  await createAssetCategories(ds)
  const svc = new AssetService(new AssetStorageService(), new AssetRepository(ds), new AssetCategoryRepository(ds))
  return { svc, ds }
}

describe('AssetService 分类定义管理', () => {
  let svc: AssetService
  let ds: DataSource

  beforeEach(async () => {
    vi.clearAllMocks()
    const built = await buildService()
    svc = built.svc
    ds = built.ds
  })

  it('listAssetCategories：内置 9 分类 + 当前大类资产计数合并', async () => {
    // 早报分类下 2 条 text 资产 + 1 条 image 资产
    await svc.createAsset({ content: { kind: 'text', text: '# 早报A' }, category: 'text', subCategory: '早报', name: 'A' })
    await svc.createAsset({ content: { kind: 'text', text: '# 早报B' }, category: 'text', subCategory: '早报', name: 'B' })
    await svc.createAsset({ content: { kind: 'text', text: 'x' }, category: 'image', subCategory: '早报', name: 'C' })
    const all = await svc.listAssetCategories()
    expect(all.length).toBe(9)
    const textStats = await svc.listAssetCategories('text')
    const morning = textStats.find(c => c.name === '早报')
    expect(morning?.count).toBe(2)
  })

  it('createAssetCategory：成功写入（含 report 模板）', async () => {
    const cat = await svc.createAssetCategory({ name: '产品周报', previewMode: 'report', previewTemplateId: 'industryWeekly', allowedKinds: ['text'] })
    expect(cat.name).toBe('产品周报')
    expect(cat.previewMode).toBe('report')
    expect(cat.isBuiltin).toBe(false)
    expect(await svc.listAssetCategories()).toHaveLength(10)
  })

  it('createAssetCategory：重名抛错', async () => {
    await expect(svc.createAssetCategory({ name: '早报' })).rejects.toThrow('已存在')
  })

  it('createAssetCategory：report 模式必须指定存在的渲染模板', async () => {
    await expect(svc.createAssetCategory({ name: '周报2', previewMode: 'report' })).rejects.toThrow('必须指定渲染模板')
    await expect(svc.createAssetCategory({ name: '周报2', previewMode: 'report', previewTemplateId: 'no-such-tpl' })).rejects.toThrow('渲染模板不存在')
  })

  it('updateAssetCategory：内置禁改；自有可改', async () => {
    const builtin = (await svc.listAssetCategories()).find(c => c.name === '早报')!
    await expect(svc.updateAssetCategory(builtin.id, { previewMode: 'text' })).rejects.toThrow('内置分类不可修改')
    const mine = await svc.createAssetCategory({ name: '我的分类', previewMode: 'text' })
    const upd = await svc.updateAssetCategory(mine.id, { previewMode: 'markdown' })
    expect(upd?.previewMode).toBe('markdown')
    expect(upd?.name).toBe('我的分类')
  })

  it('updateAssetCategory：IPC 场景（patch 带显式 undefined 字段）不覆盖既有字段', async () => {
    const mine = await svc.createAssetCategory({ name: 'IPC分类', previewMode: 'report', previewTemplateId: 'morningReport' })
    // 模拟 handler 展开传参：未提供的字段为 undefined
    const upd = await svc.updateAssetCategory(mine.id, {
      name: undefined,
      code: undefined,
      allowedKinds: undefined,
      allowedCategories: undefined,
      previewable: undefined,
      previewMode: 'text',
      previewTemplateId: undefined,
      sortOrder: undefined,
    })
    expect(upd?.previewMode).toBe('text')
    expect(upd?.name).toBe('IPC分类')
    expect(upd?.previewTemplateId).toBe('morningReport')
  })

  it('updateAssetCategory：改名与其他分类冲突抛错；自身改名成功', async () => {
    const mine = await svc.createAssetCategory({ name: '我的分类' })
    await expect(svc.updateAssetCategory(mine.id, { name: '行业周报' })).rejects.toThrow('已存在')
    const upd = await svc.updateAssetCategory(mine.id, { name: '我的新分类' })
    expect(upd?.name).toBe('我的新分类')
  })

  it('deleteAssetCategory：内置禁删抛错；自有可删', async () => {
    const builtin = (await svc.listAssetCategories()).find(c => c.name === '早报')!
    await expect(svc.deleteAssetCategory(builtin.id)).rejects.toThrow('内置分类不可删除')
    const mine = await svc.createAssetCategory({ name: '临时分类' })
    expect(await svc.deleteAssetCategory(mine.id)).toBe(true)
  })

  it('listPreviewTemplates 包含早报/周报模板', () => {
    const tpls = svc.listPreviewTemplates()
    const ids = tpls.map(t => t.value)
    expect(ids).toContain('morningReport')
    expect(ids).toContain('industryWeekly')
    expect(ids).toContain('generic')
  })
})

describe('AssetService 分类驱动预览', () => {
  let svc: AssetService
  let ds: DataSource

  beforeEach(async () => {
    vi.clearAllMocks()
    const built = await buildService()
    svc = built.svc
    ds = built.ds
  })

  it('previewInfoFor：命中内置分类（早报 → report + morningReport）', async () => {
    const rec = await svc.createAsset({ content: { kind: 'text', text: '# 早报' }, category: 'text', subCategory: '早报', name: '早报' })
    const info = await svc.previewInfoFor(rec)
    expect(info).toMatchObject({ mode: 'report', templateId: 'morningReport' })
  })

  it('previewInfoFor：无 subCategory / 未定义分类 → null', async () => {
    const noSub = await svc.createAsset({ content: { kind: 'text', text: 'x' }, category: 'text', name: '无分类' })
    expect(await svc.previewInfoFor(noSub)).toBeNull()
    const unknown = await svc.createAsset({ content: { kind: 'text', text: 'x' }, category: 'text', subCategory: '未定义组', name: '未知' })
    expect(await svc.previewInfoFor(unknown)).toBeNull()
  })

  it('renderAssetPreview：text 模式分类 → null（前端原生呈现）', async () => {
    const cat = await svc.createAssetCategory({ name: '纯文本分类', previewMode: 'text' })
    const rec = await svc.createAsset({ content: { kind: 'text', text: 'hello' }, category: 'text', subCategory: cat.name, name: 't' })
    expect(await svc.renderAssetPreview(rec)).toBeNull()
  })

  it('renderAssetPreview：markdown 模式 → generic 模板渲染 HTML', async () => {
    const rec = await svc.createAsset({ content: { kind: 'text', text: '# 报告模板\n正文' }, category: 'template', subCategory: '报告模板', name: '模板' })
    const result = await svc.renderAssetPreview(rec)
    expect(result?.mode).toBe('html')
    const input = documentToolsMock.renderHtml.mock.calls[0][0]
    expect(input.template.id).toBe('generic')
    expect(input.markdown).toContain('# 报告模板')
  })

  it('renderAssetPreview：report 模式无平台渲染器 → HTML 降级（业务模板）', async () => {
    documentToolsMock.canRenderBinary.mockReturnValue(false)
    const rec = await svc.createAsset({ content: { kind: 'text', text: '# 早报正文' }, category: 'text', subCategory: '早报', name: '早报' })
    const result = await svc.renderAssetPreview(rec)
    expect(result?.mode).toBe('html')
    const input = documentToolsMock.renderHtml.mock.calls[0][0]
    expect(input.template.id).toBe('morningReport')
  })

  it('renderAssetPreview：report 模式有平台渲染器 → PNG data URL 长图', async () => {
    documentToolsMock.canRenderBinary.mockReturnValue(true)
    documentToolsMock.renderImage.mockResolvedValue({ buffer: Buffer.from([1, 2, 3]), html: '<img-html/>', format: 'image' })
    const rec = await svc.createAsset({ content: { kind: 'text', text: '# 早报正文' }, category: 'text', subCategory: '早报', name: '早报' })
    const result = await svc.renderAssetPreview(rec)
    expect(result?.mode).toBe('image')
    expect((result as { url: string }).url).toBe('data:image/png;base64,AQID')
    const input = documentToolsMock.renderImage.mock.calls[0][0]
    expect(input.template.id).toBe('morningReport')
  })

  it('renderAssetPreview：html 模式 → 原样返回内容', async () => {
    const cat = await svc.createAssetCategory({ name: 'HTML分类', previewMode: 'html' })
    const rec = await svc.createAsset({ content: { kind: 'text', text: '<h1>原生HTML</h1>' }, category: 'text', subCategory: cat.name, name: 'h' })
    const result = await svc.renderAssetPreview(rec)
    expect(result).toEqual({ mode: 'html', html: '<h1>原生HTML</h1>' })
  })

  it('renderAssetPreview：内容为空 → null', async () => {
    const rec = await svc.createAsset({ content: { kind: 'text', text: '   ' }, category: 'text', subCategory: '早报', name: '空' })
    expect(await svc.renderAssetPreview(rec)).toBeNull()
  })

  it('renderAssetPreview：未命中分类定义 → null', async () => {
    const rec = await svc.createAsset({ content: { kind: 'text', text: 'x' }, category: 'text', name: '无分类' })
    expect(await svc.renderAssetPreview(rec)).toBeNull()
  })
})
