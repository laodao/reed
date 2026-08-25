import { describe, it, expect, vi } from 'vitest'
import {
  parseAssetRefOverrides,
  toRefCandidates,
} from '@core/modules/episode-production/render/keyframe/parse-asset-refs'

const imageSvc = (map: Record<string, Array<{ id: string }>>) => ({
  listByAsset: vi.fn((kind: string, bindingId: string) => Promise.resolve(map[`${kind}:${bindingId}`] ?? [])),
})

describe('parse-asset-refs', () => {
  it('解析 @[名字@索引] 命中场景资产，取第 N 张图生成 override', async () => {
    const assets = [
      { kind: 'character', bindingId: 'cb_1', name: '杜十娘' },
      { kind: 'location', bindingId: 'loc_1', name: '江面' },
    ] as const
    const svc = imageSvc({
      'character:cb_1': [{ id: 'img_a' }, { id: 'img_b' }, { id: 'img_c' }],
    })
    const out = await parseAssetRefOverrides('镜头画面 @[杜十娘@2] 与 @[江面] ', assets as any, svc as any)
    expect(out).toEqual([{ kind: 'character', bindingId: 'cb_1', imageId: 'img_b' }])
  })

  it('无图索引 @[名字] 不生成 override（自动评分）', async () => {
    const assets = [{ kind: 'character', bindingId: 'cb_1', name: '杜十娘' }] as const
    const svc = imageSvc({})
    const out = await parseAssetRefOverrides('@[杜十娘]', assets as any, svc as any)
    expect(out).toEqual([])
  })

  it('索引越界 / 名字不匹配 → 丢弃不生成', async () => {
    const assets = [{ kind: 'character', bindingId: 'cb_1', name: '杜十娘' }] as const
    const svc = imageSvc({ 'character:cb_1': [{ id: 'img_a' }] })
    const out1 = await parseAssetRefOverrides('@[杜十娘@99]', assets as any, svc as any)
    const out2 = await parseAssetRefOverrides('@[李四@1]', assets as any, svc as any)
    expect(out1).toEqual([])
    expect(out2).toEqual([])
  })

  it('同名同资产只生成一个 override', async () => {
    const assets = [{ kind: 'character', bindingId: 'cb_1', name: '杜十娘' }] as const
    const svc = imageSvc({ 'character:cb_1': [{ id: 'img_a' }, { id: 'img_b' }] })
    const out = await parseAssetRefOverrides('@[杜十娘@1] @[杜十娘@2]', assets as any, svc as any)
    expect(out).toHaveLength(1)
  })

  it('toRefCandidates 提取场景资产名称', () => {
    const candidates = toRefCandidates({
      characters: [{ bindingId: 'cb_1', effective: { name: '杜十娘' } }],
      location: { bindingId: 'loc_1', effective: { name: '江面' } },
      items: [{ bindingId: 'it_1', effective: { name: '百宝箱' } }],
    })
    expect(candidates).toEqual([
      { kind: 'character', bindingId: 'cb_1', name: '杜十娘' },
      { kind: 'location', bindingId: 'loc_1', name: '江面' },
      { kind: 'item', bindingId: 'it_1', name: '百宝箱' },
    ])
  })
})
