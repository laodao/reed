import { describe, expect, it } from 'vitest'
import { buildWebAssetDownload } from '../../../../src/renderer/src/utils/asset-download'
import type { AssetRecord } from '@shared/types/asset.types'

function makeAsset(over: Partial<AssetRecord>): AssetRecord {
  return {
    id: 'a1',
    userId: null,
    category: 'image',
    subCategory: null,
    name: '资产',
    description: null,
    tags: [],
    kind: 'file',
    storagePath: null,
    url: null,
    textContent: null,
    jsonContent: null,
    mimeType: null,
    sizeBytes: null,
    metadata: null,
    sourceType: null,
    sourceRef: null,
    groupId: null,
    groupRole: null,
    isBuiltin: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  } as AssetRecord
}

describe('buildWebAssetDownload', () => {
  it('file 形态：取资产 URL fetch 下载，文件名用存储文件名', () => {
    const p = buildWebAssetDownload(makeAsset({ storagePath: 'image/封面.png' }), '/assets/image/封面.png')
    expect(p).not.toBeNull()
    expect(p!.fetchUrl).toBe('/assets/image/封面.png')
    expect(p!.fileName).toBe('封面.png')
    expect(p!.content).toBeUndefined()
  })

  it('text 形态：内容 + .md 文件名', () => {
    const p = buildWebAssetDownload(makeAsset({ kind: 'text', textContent: '# 早报' }), '')
    expect(p!.fileName).toBe('资产.md')
    expect(p!.content).toBe('# 早报')
    expect(p!.mimeType).toContain('markdown')
  })

  it('json 形态：内容 + .json 文件名', () => {
    const p = buildWebAssetDownload(makeAsset({ kind: 'json', jsonContent: '{"a":1}' }), '')
    expect(p!.fileName).toBe('资产.json')
    expect(p!.content).toBe('{"a":1}')
  })

  it('url 形态：InternetShortcut 内容 + .url 文件名', () => {
    const p = buildWebAssetDownload(makeAsset({ kind: 'url', url: 'https://x.com' }), '')
    expect(p!.fileName).toBe('资产.url')
    expect(p!.content).toBe('[InternetShortcut]\nURL=https://x.com\n')
  })

  it('不支持形态（无内容/未知 kind）返回 null', () => {
    expect(buildWebAssetDownload(makeAsset({ kind: 'text', textContent: null }), '')).toBeNull()
    expect(buildWebAssetDownload(makeAsset({ kind: 'url', url: null }), '')).toBeNull()
    expect(buildWebAssetDownload(makeAsset({ kind: 'file', storagePath: null }), '')).toBeNull()
  })

  it('文件名含非法字符被清洗', () => {
    const p = buildWebAssetDownload(makeAsset({ kind: 'text', textContent: 'x', name: 'a/b:c' }), '')
    expect(p!.fileName).toBe('a_b_c.md')
  })

  it('view=preview 且有渲染图：下载渲染 PNG', () => {
    const p = buildWebAssetDownload(makeAsset({ kind: 'text', name: '早报', textContent: 'x' }), '', 'preview', 'data:image/png;base64,AAAA')
    expect(p!.fileName).toBe('早报.png')
    expect(p!.fetchUrl).toBe('data:image/png;base64,AAAA')
    expect(p!.mimeType).toBe('image/png')
    expect(p!.content).toBeUndefined()
  })

  it('view=preview 但无渲染图：回退按存储形态（text→.md）', () => {
    const p = buildWebAssetDownload(makeAsset({ kind: 'text', name: '早报', textContent: 'x' }), '', 'preview', null)
    expect(p!.fileName).toBe('早报.md')
    expect(p!.content).toBe('x')
  })
})
