/**
 * 真实素材库（stock media）类型定义
 * @module types/stock-media.types
 * @description 「短视频脚本生成视频」配图的**真实素材来源**：按脚本语义检索真实版权素材
 *              （Pexels / Pixabay），命中即用真实画面（视频优先、图片次之），
 *              未命中才回落 AI 生成。素材出处与授权必须随卡片留痕（禁止伪装自有素材）。
 */

/** 素材库 provider 标识 */
export type StockMediaProviderId = 'pexels' | 'pixabay'

/** 素材种类：视频=真实 B-roll 片段；图片=真实照片（配运镜成片段） */
export type StockMediaKind = 'image' | 'video'

/** 画幅方向（各库入参名不同，由各自 provider 映射） */
export type StockMediaOrientation = 'portrait' | 'landscape' | 'square' | 'any'

/** 素材检索请求 */
export interface StockMediaSearchRequest {
  /** 检索词（素材库以英文为主，允许多词短语） */
  query: string
  /** 素材种类 */
  kind: StockMediaKind
  /** 期望条数（各库上限不同，provider 自行裁剪） */
  perPage?: number
  /** 画幅方向（默认 portrait：竖屏短视频） */
  orientation?: StockMediaOrientation
  /** 最小宽度：低于此宽度的候选丢弃（保证成片清晰度） */
  minWidth?: number
  /** 最小时长（秒）：低于此值的视频丢弃；图片忽略 */
  minDurationSec?: number
}

/** 归一化后的单条素材 */
export interface StockMediaItem {
  provider: StockMediaProviderId
  /** 库内素材 id（缓存文件名与留痕用） */
  id: string
  kind: StockMediaKind
  /** 可直接下载的远端直链（图片=大图；视频=选定清晰度的 mp4） */
  downloadUrl: string
  /** 预览图直链（视频=封面图；图片=中等尺寸；可能为空串） */
  previewUrl: string
  width: number
  height: number
  /** 视频时长（秒）；图片为 undefined */
  durationSec?: number
  /** 素材页（授权与出处，必须随卡片留痕） */
  pageUrl: string
  /** 作者署名 */
  author?: string
  /** 作者主页 */
  authorUrl?: string
  /** 授权标识（与 provider 同名：pexels=Pexels License / pixabay=Pixabay Content License） */
  license: StockMediaProviderId
  /** 库内标题/描述 */
  title?: string
}

/** 下载落盘结果 */
export interface StockMediaDownload {
  item: StockMediaItem
  /** dataPath 相对路径（落库/卡片留痕用） */
  relPath: string
  /** 绝对路径（下游 ffmpeg / 图生视频直接用） */
  absPath: string
  /** 字节数 */
  bytes: number
  /** 是否命中本地缓存（未重复下载） */
  cached: boolean
}

/** provider 连接测试结果 */
export interface StockProviderTestResult {
  success: boolean
  message: string
}