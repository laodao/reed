/**
 * 网页收藏服务测试（WebCollectService 装配逻辑，stub 资产服务 + 注入抓取器）
 * @module tests/unit/platform/assets/web-collect.service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AssetRecord, SaveAssetInput } from '@shared/types/asset.types'
import type { AssetService } from '@core/platform/assets/asset.service'
import type { WebResourceFetchResult } from '@core/platform/assets/single-file-html'
import { WebCollectService, extractPageTitle } from '@core/platform/assets/web-collect.service'

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>深色模式下的资讯页</title>
<link rel="stylesheet" href="/css/site.css"></head>
<body><h1>标题甲</h1><p>正文段落<a href="/rel">相对链接</a></p>
<img src="https://img.example.com/pic.png"></body></html>`
const SITE_CSS = '.hero{background:url(/bg.png)}'
const NOW_ISO = '2026-09-05T08:00:00.000Z'

function buildService(assetCreateMock: ReturnType<typeof vi.fn>) {
  const assetService = {
    createAsset: assetCreateMock,
    // 幂等/刷新路径：缺省"无既有档" + 记录调用
    findWebCollectBySourceUrl: vi.fn(async () => null),
    updateAssetContent: vi.fn(async () => null),
    getAsset: vi.fn(async () => null),
  } as unknown as AssetService
  const svc = new WebCollectService({
    assetService,
    fetchPage: async () => ({ url: 'https://news.example.com/a', html: PAGE_HTML }),
    fetchResource: async (url: string): Promise<WebResourceFetchResult> => {
      if (url === 'https://news.example.com/css/site.css') {
        return { ok: true, text: SITE_CSS, dataUrl: '', contentType: 'text/css' }
      }
      if (url === 'https://news.example.com/bg.png') {
        return { ok: true, text: null, dataUrl: 'data:image/png;base64,QkdH', contentType: 'image/png' }
      }
      if (url === 'https://img.example.com/pic.png') {
        return { ok: true, text: null, dataUrl: 'data:image/png;base64,UElD', contentType: 'image/png' }
      }
      return { ok: false, reason: 'not-found' }
    },
    now: () => new Date(NOW_ISO),
  })
  return svc
}

/** 构造一条已存在的「网页收藏」记录 */
function existingRecord(url = 'https://news.example.com/a'): AssetRecord {
  return {
    id: 'asset-existing',
    category: 'document',
    subCategory: '网页收藏',
    name: '深色模式下的资讯页.html',
    kind: 'file',
    tags: [],
    textContent: '# 旧版正文',
    metadata: { sourceUrl: url, sourceTitle: '深色模式下的资讯页' },
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  } as AssetRecord
}

/** 可配置幂等行为的构建器：existing/更新回调可控 */
function buildBehavedService(opts: {
  existing?: AssetRecord | null
  onUpdate?: (id: string, input: Record<string, unknown>) => AssetRecord | null
}) {
  const createMock = vi.fn(async (): Promise<AssetRecord> => ({ ...existingRecord(), id: 'asset-new' }))
  const findMock = vi.fn(async () => opts.existing ?? null)
  const updateMock = vi.fn(async (id: string, input: Record<string, unknown>): Promise<AssetRecord | null> =>
    opts.onUpdate ? opts.onUpdate(id, input) : { ...existingRecord(), id, ...(input as object) },
  )
  const getMock = vi.fn(async () => opts.existing ?? null)
  const assetService = {
    createAsset: createMock,
    findWebCollectBySourceUrl: findMock,
    updateAssetContent: updateMock,
    getAsset: getMock,
  } as unknown as AssetService
  const svc = new WebCollectService({
    assetService,
    fetchPage: async () => ({ url: 'https://news.example.com/a', html: PAGE_HTML }),
    fetchResource: async () => ({ ok: false, reason: 'not-called' }),
    now: () => new Date(NOW_ISO),
  })
  return { svc, findMock, updateMock, createMock, getMock }
}

describe('WebCollectService.collectWebpage', () => {
  let assetCreateMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assetCreateMock = vi.fn(async (input: SaveAssetInput): Promise<AssetRecord> => ({ id: 'asset-1', category: 'document', name: 'x', kind: 'file', tags: [], createdAt: NOW_ISO, updatedAt: NOW_ISO } as AssetRecord))
  })

  it('抓页面 → 归档 html 落 file、markdown 入 textContent、metadata 齐全', async () => {
    const svc = buildService(assetCreateMock)
    const result = await svc.collectWebpage({ url: 'https://news.example.com/a', sourceType: 'workflow', sourceRef: 'run_9' })
    expect(result.fetched).toBe(true)
    const input = assetCreateMock.mock.calls[0][0] as SaveAssetInput
    expect(input.category).toBe('document')
    expect(input.subCategory).toBe('网页收藏')
    expect(input.name).toBe('深色模式下的资讯页.html')
    expect(input.metadata).toMatchObject({
      sourceUrl: 'https://news.example.com/a',
      sourceTitle: '深色模式下的资讯页',
      fetchedAt: NOW_ISO,
      sourceRunId: 'run_9',
    })
    // file 内容 = 自包含 html（图片已内联、样式表已内联、script 已静态化）
    const dataUrl = (input.content as { kind: 'file'; path: string }).path
    expect(dataUrl.startsWith('data:text/html;base64,')).toBe(true)
    const html = Buffer.from(dataUrl.split(',')[1], 'base64').toString('utf-8')
    expect(html).toContain('<title>深色模式下的资讯页</title>')
    expect(html).toContain('data:image/png;base64,UElD')
    expect(html).toContain('data:text/css;base64,')
    // textContent = markdown 正文（噪声已剥、相对链接解析）
    expect(input.textContent).toContain('标题甲')
    expect(input.textContent).toContain('[相对链接](https://news.example.com/rel)')
    expect(input.textContent).not.toContain('<script')
    expect(result.markdown).toBe(input.textContent)
  })

  it('传入 html 时跳过抓取（fetched=false），仍归档', async () => {
    const svc = buildService(assetCreateMock)
    const result = await svc.collectWebpage({ url: 'https://news.example.com/a', html: '<h1>已有正文</h1>' })
    expect(result.fetched).toBe(false)
    const input = assetCreateMock.mock.calls[0][0] as SaveAssetInput
    expect(input.metadata?.sourceUrl).toBe('https://news.example.com/a')
  })

  it('title 缺省从页面提取；显式 title 优先', async () => {
    const svc = buildService(assetCreateMock)
    await svc.collectWebpage({ url: 'https://news.example.com/a' })
    expect((assetCreateMock.mock.calls[0][0] as SaveAssetInput).name).toBe('深色模式下的资讯页.html')
    assetCreateMock.mockClear()
    await svc.collectWebpage({ url: 'https://news.example.com/a', title: '自定义标题' })
    expect((assetCreateMock.mock.calls[0][0] as SaveAssetInput).name).toBe('自定义标题.html')
    expect((assetCreateMock.mock.calls[0][0] as SaveAssetInput).metadata?.sourceTitle).toBe('自定义标题')
  })

  it('warnings 透传（资源抓取失败不阻断）', async () => {
    const svc = buildService(assetCreateMock)
    const result = await svc.collectWebpage({ url: 'https://news.example.com/a' })
    expect(result.record.id).toBe('asset-1')
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('非 http(s) URL 拒绝', async () => {
    const svc = buildService(assetCreateMock)
    await expect(svc.collectWebpage({ url: 'file:///etc/passwd' })).rejects.toThrow('仅支持 http(s)')
    await expect(svc.collectWebpage({ url: 'https://a.com' })).resolves.toBeTruthy()
  })
})

describe('幂等收藏与快照刷新', () => {
  it('已收藏 + 默认 skip：不抓页、不写库，返回 skipped=true 与既有档', async () => {
    const ex = existingRecord()
    const { svc, findMock, updateMock, createMock } = buildBehavedService({ existing: ex })
    const result = await svc.collectWebpage({ url: 'https://news.example.com/a' })
    expect(result.skipped).toBe(true)
    expect(result.record.id).toBe('asset-existing')
    expect(result.fetched).toBe(false)
    expect(findMock).toHaveBeenCalledWith('https://news.example.com/a')
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('已收藏 + existingPolicy=replace：就地刷新同一资产（不新建）', async () => {
    const ex = existingRecord()
    const { svc, updateMock, createMock } = buildBehavedService({
      existing: ex,
      onUpdate: (id, input) => ({ ...ex, id, textContent: String(input.textContent ?? '') }),
    })
    const result = await svc.collectWebpage({ url: 'https://news.example.com/a', existingPolicy: 'replace' })
    expect(result.skipped).toBe(false)
    expect(createMock).not.toHaveBeenCalled()
    const args = updateMock.mock.calls[0]
    expect(args[0]).toBe('asset-existing')
    const input = args[1] as Record<string, unknown>
    expect((input.dataUrl as string).startsWith('data:text/html;base64,')).toBe(true)
    expect(String(input.textContent)).toContain('标题甲')
    expect((input.metadata as Record<string, unknown>).sourceUrl).toBe('https://news.example.com/a')
    expect((input.metadata as Record<string, unknown>).sourceTitle).toBe('深色模式下的资讯页')
  })

  it('replace 后 metadata.sourceUrl 仍为输入 URL（幂等键稳定）', async () => {
    const ex = existingRecord()
    const { svc, updateMock } = buildBehavedService({ existing: ex })
    await svc.collectWebpage({ url: 'https://news.example.com/a', existingPolicy: 'replace' })
    const metadata = (updateMock.mock.calls[0][1] as { metadata: Record<string, unknown> }).metadata
    expect(metadata.sourceUrl).toBe('https://news.example.com/a')
  })

  it('refreshExisting：按记录 sourceUrl 重抓并就地更新，保留原名', async () => {
    const ex = existingRecord()
    const { svc, updateMock } = buildBehavedService({
      existing: ex,
      onUpdate: (id, input) => ({ ...ex, id, name: String((input as { name?: string }).name ?? ex.name) }),
    })
    const result = await svc.refreshExisting('asset-existing')
    expect(result.skipped).toBe(false)
    const args = updateMock.mock.calls[0]
    expect(args[0]).toBe('asset-existing')
    const input = args[1] as { name?: string; textContent?: string }
    expect(input.name).toBe('深色模式下的资讯页.html')
    expect(String(input.textContent)).toContain('标题甲')
  })

  it('refreshExisting：非网页收藏/缺 sourceUrl 报错', async () => {
    const other = { ...existingRecord(), subCategory: '早报' } as AssetRecord
    const { svc } = buildBehavedService({ existing: other })
    await expect(svc.refreshExisting('asset-other')).rejects.toThrow('仅「网页收藏」')
    const noUrl = { ...existingRecord(), metadata: {} } as AssetRecord
    const { svc: svc2 } = buildBehavedService({ existing: noUrl })
    await expect(svc2.refreshExisting('asset-no-url')).rejects.toThrow('缺少原始网页 URL')
  })
})

describe('extractPageTitle', () => {
  it('og:title 优先于 <title>', () => {
    expect(extractPageTitle('<html><head><title>Doc</title><meta property="og:title" content="分享标题"></head></html>')).toBe('分享标题')
    expect(extractPageTitle('<title>Only</title>')).toBe('Only')
    expect(extractPageTitle('<p>no title</p>')).toBe('')
  })
})
