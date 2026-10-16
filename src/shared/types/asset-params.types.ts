/**
 * 素材与图片参数默认值 / 硬上限
 * @module shared/types/asset-params.types
 *
 * ── 为什么这些要开放 ──
 * 这一批是"体积与超时"型参数，默认值不合理时用户**完全无法自救**：
 * - 素材下载/网页收藏/整页归档的超时都是**内联写死**的 30s（`AbortSignal.timeout(30_000)`），
 *   慢站点直接失败；
 * - 体积上限写死 10MB / 50MB（"超过 50MB 上限"这类报错用户改不了）；
 * - 站点图标：抓取超时 6s、HTML 扫描 128KB、未命中缓存 24h、抓取并发 16；
 * - 图片任务：5 秒轮询一次、最多 60 次（约 5 分钟），出图慢就"任务超时，请重试"。
 *
 * 归入「参数设置 → 素材与图片」Tab（三个 settings 键：`asset:limits` / `favicon:fetch` /
 * `image:polling`）。
 */

/** 素材下载与网页收藏 */
export interface AssetLimitsParams {
  /** 素材下载超时（毫秒） */
  downloadTimeoutMs: number
  /** 素材下载体积上限（字节） */
  maxDownloadBytes: number
  /** 文件名净化后的长度上限（字符） */
  maxFileNameChars: number
  /** 网页收藏抓取超时（毫秒） */
  collectTimeoutMs: number
  /** 网页收藏体积上限（字节） */
  maxCollectBytes: number
  /** 整页归档：单个资源体积上限（字节） */
  maxResourceBytes: number
  /** 整页归档：单个资源抓取超时（毫秒） */
  resourceTimeoutMs: number
  /** 整页归档：最多内联多少个资源（图片/样式/字体） */
  maxInlineResources: number
}

/** 站点图标（favicon） */
export interface FaviconFetchParams {
  /** 抓取超时（毫秒） */
  timeoutMs: number
  /** 扫描 HTML 头部的字节数（找 <link rel="icon">） */
  htmlScanBytes: number
  /** 未命中缓存的过期时间（毫秒；过期后自动重试） */
  notFoundTtlMs: number
  /** 抓取并发上限 */
  maxConcurrency: number
}

/** 图片生成任务轮询 */
export interface ImagePollingParams {
  /** 轮询间隔（毫秒） */
  pollIntervalMs: number
  /** 最多轮询次数（超过即判"任务超时"） */
  maxPolls: number
}

/** 素材与图片参数（分组；跨三个 settings 键） */
export interface AssetRuntimeParams {
  asset: AssetLimitsParams
  favicon: FaviconFetchParams
  image: ImagePollingParams
}

/** 内置默认值（= 改造前写死在各自模块里的常量） */
export const ASSET_DEFAULTS: AssetRuntimeParams = {
  asset: {
    downloadTimeoutMs: 30_000,
    maxDownloadBytes: 50 * 1024 * 1024,
    maxFileNameChars: 120,
    collectTimeoutMs: 30_000,
    maxCollectBytes: 50 * 1024 * 1024,
    maxResourceBytes: 10 * 1024 * 1024,
    resourceTimeoutMs: 30_000,
    maxInlineResources: 40,
  },
  favicon: {
    timeoutMs: 6_000,
    htmlScanBytes: 131_072,
    notFoundTtlMs: 24 * 60 * 60 * 1000,
    maxConcurrency: 16,
  },
  image: {
    pollIntervalMs: 5_000,
    maxPolls: 60,
  },
}

/** 代码级硬上限（配置值一律夹到这里） */
export const ASSET_LIMITS: AssetRuntimeParams = {
  asset: {
    downloadTimeoutMs: 600_000,
    maxDownloadBytes: 1024 * 1024 * 1024,
    maxFileNameChars: 200,
    collectTimeoutMs: 600_000,
    maxCollectBytes: 1024 * 1024 * 1024,
    maxResourceBytes: 256 * 1024 * 1024,
    resourceTimeoutMs: 600_000,
    maxInlineResources: 200,
  },
  favicon: {
    timeoutMs: 60_000,
    htmlScanBytes: 4 * 1024 * 1024,
    notFoundTtlMs: 30 * 24 * 60 * 60 * 1000,
    maxConcurrency: 64,
  },
  image: {
    pollIntervalMs: 60_000,
    maxPolls: 1_200,
  },
}
