/**
 * 「素材与图片」参数测试（登记表 + 持有者 + 读取点真实行为）
 * @module tests/unit/shared/asset-params
 *
 * 背景（2026-09-13 参数设置第七批，最后一个模块 Tab）：这批是"超时与体积"型参数，
 * 改造前是**内联常量**，默认不合理时用户完全无法自救——慢站点下载失败、
 * 大文件被"超过 50MB 上限"拒绝、某站点图标抓不到又 24 小时不重试、
 * 出图慢被判"任务超时，请重试"。
 *
 * 这里既有登记表/持有者测试，也用**真实导出函数**证明设置确实生效：
 * `defaultPageFetcher` / `defaultWebResourceFetcher` 的体积上限与超时。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  assetParams,
  assetParamsFromSettings,
  resetAssetParams,
  setAssetParams,
} from '@shared/utils/asset-params'
import { ASSET_DEFAULTS, ASSET_LIMITS } from '@shared/types/asset-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'
import { defaultPageFetcher } from '@core/platform/assets/web-collect.service'
import { defaultWebResourceFetcher } from '@core/platform/assets/single-file-html'

const DEF = getModuleParams('asset')!

beforeEach(() => resetAssetParams())
afterEach(() => {
  resetAssetParams()
  vi.unstubAllGlobals()
})

/** 造一个 fetch 响应（带体积） */
function stubFetch(bodyBytes: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      url: 'https://example.com/',
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) },
      arrayBuffer: async () => new ArrayBuffer(bodyBytes),
    })),
  )
}

describe('登记表：一个 Tab 覆盖 asset/favicon/image 三个键', () => {
  it('归属键与默认值（= 改造前写死的常量）', () => {
    expect(DEF.name).toBe('素材与图片')
    expect(moduleParamSettingsKeys(DEF).sort()).toEqual(
      [SETTINGS_KEYS.assetLimits, SETTINGS_KEYS.faviconFetch, SETTINGS_KEYS.imagePolling].sort(),
    )
    const r = resolveModuleParams(DEF, {})
    expect(r.values['downloadTimeoutMs']).toBe(30_000)
    expect(r.values['maxDownloadBytes']).toBe(50 * 1024 * 1024)
    expect(r.values['maxFileNameChars']).toBe(120)
    expect(r.values['maxCollectBytes']).toBe(50 * 1024 * 1024)
    expect(r.values['maxResourceBytes']).toBe(10 * 1024 * 1024)
    expect(r.values['maxInlineResources']).toBe(40)
    expect(r.values['timeoutMs']).toBe(6_000)
    expect(r.values['htmlScanBytes']).toBe(131_072)
    expect(r.values['notFoundTtlMs']).toBe(24 * 60 * 60 * 1000)
    expect(r.values['maxConcurrency']).toBe(16)
    expect(r.values['pollIntervalMs']).toBe(5_000)
    expect(r.values['maxPolls']).toBe(60)

    const key = (k: string) => r.groups.flatMap((g) => g.entries).find((e) => e.valueKey === k)?.settingsKey
    expect(key('maxDownloadBytes')).toBe(SETTINGS_KEYS.assetLimits)
    expect(key('timeoutMs')).toBe(SETTINGS_KEYS.faviconFetch)
    expect(key('maxPolls')).toBe(SETTINGS_KEYS.imagePolling)
  })

  it('默认值不超过硬上限', () => {
    for (const group of Object.keys(ASSET_DEFAULTS) as Array<'asset' | 'favicon' | 'image'>) {
      const d = ASSET_DEFAULTS[group] as unknown as Record<string, number>
      const l = ASSET_LIMITS[group] as unknown as Record<string, number>
      for (const key of Object.keys(d)) expect(d[key], `${group}.${key}`).toBeLessThanOrEqual(l[key])
    }
  })

  it('favicon 并发是唯一"需重启"的项（进程级信号量）', () => {
    const r = resolveModuleParams(DEF, {})
    const concurrency = r.groups.flatMap((g) => g.entries).find((e) => e.valueKey === 'maxConcurrency')!
    expect(concurrency.effect).toBe('restart')
    const others = r.groups.flatMap((g) => g.entries).filter((e) => e.valueKey !== 'maxConcurrency')
    expect(others.every((e) => e.effect === 'immediate')).toBe(true)
  })
})

describe('持有者与从 settings 解析', () => {
  it('覆盖生效、超限夹取、非法值保留', () => {
    expect(assetParams().image.maxPolls).toBe(60)
    setAssetParams({ image: { maxPolls: 300 } })
    expect(assetParams().image.maxPolls).toBe(300)
    setAssetParams({ image: { maxPolls: 999_999, pollIntervalMs: -1 } })
    expect(assetParams().image.maxPolls).toBe(ASSET_LIMITS.image.maxPolls)
    expect(assetParams().image.pollIntervalMs).toBe(ASSET_DEFAULTS.image.pollIntervalMs)
  })

  it('三个键分别解析并夹取', () => {
    const parsed = assetParamsFromSettings({
      [SETTINGS_KEYS.assetLimits]: { maxDownloadBytes: 200 * 1024 * 1024 },
      [SETTINGS_KEYS.faviconFetch]: { timeoutMs: 12_000, maxConcurrency: 999 },
      [SETTINGS_KEYS.imagePolling]: { maxPolls: 9_999 },
    })
    expect(parsed.asset.maxDownloadBytes).toBe(200 * 1024 * 1024)
    expect(parsed.favicon.timeoutMs).toBe(12_000)
    expect(parsed.favicon.maxConcurrency).toBe(ASSET_LIMITS.favicon.maxConcurrency)
    expect(parsed.image.maxPolls).toBe(ASSET_LIMITS.image.maxPolls)
    expect(parsed.asset.maxFileNameChars).toBe(ASSET_DEFAULTS.asset.maxFileNameChars)
  })

  it('垃圾载荷回落默认', () => {
    expect(assetParamsFromSettings({})).toEqual(ASSET_DEFAULTS)
    expect(assetParamsFromSettings({ [SETTINGS_KEYS.assetLimits]: 42 })).toEqual(ASSET_DEFAULTS)
  })
})

describe('读取点接线（真实行为改变）', () => {
  it('网页收藏体积上限：调小后同一个页面被拒（报错写明当前上限）', async () => {
    stubFetch(2 * 1024 * 1024) // 2MB 页面
    // 默认 50MB：放行
    await expect(defaultPageFetcher('https://example.com/')).resolves.toMatchObject({ url: 'https://example.com/' })

    setAssetParams({ asset: { maxCollectBytes: 1024 * 1024 } }) // 收到 1MB
    await expect(defaultPageFetcher('https://example.com/')).rejects.toThrow(/1MB 上限/)
  })

  it('整页归档单资源上限：调小后同一个资源被跳过并给出原因', async () => {
    stubFetch(512 * 1024) // 512KB 资源
    const ok = await defaultWebResourceFetcher('https://example.com/a.png')
    expect(ok.ok).toBe(true)

    setAssetParams({ asset: { maxResourceBytes: 128 * 1024 } })
    const denied = await defaultWebResourceFetcher('https://example.com/a.png')
    expect(denied.ok).toBe(false)
    expect(denied.reason).toContain('上限')
  })

  it('素材下载超时：注入 20ms 后，挂住的请求快速失败（而不是等默认 30s）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )
    setAssetParams({ asset: { resourceTimeoutMs: 20 } })
    const t0 = Date.now()
    const res = await defaultWebResourceFetcher('https://example.com/slow.css')
    const elapsed = Date.now() - t0
    expect(res.ok).toBe(false)
    expect(elapsed).toBeLessThan(2_000) // 默认 30s，这里 20ms 就返回 → 证明读到了配置
  })
})
