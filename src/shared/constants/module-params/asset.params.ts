/**
 * 「素材与图片」模块参数登记表
 * @module shared/constants/module-params/asset
 *
 * 一个 Tab 覆盖三个 settings 键（分组级 `settingsKey`）：
 * `asset:limits`（素材下载/网页收藏/整页归档） / `favicon:fetch`（站点图标） /
 * `image:polling`（图片任务轮询）。
 *
 * 用户为什么会想调（调研结论）：这些值改造前都是**内联常量**，默认值不合理时用户只能认命——
 * 慢站点下载失败、大文件被"超过 50MB 上限"拒绝、出图慢被判"任务超时，请重试"、
 * 某站点图标一直抓不到又不会重试（未命中缓存 24 小时）。
 */

import {
  ASSET_DEFAULTS as D,
  ASSET_LIMITS as L,
} from '@shared/types/asset-params.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const ASSET = SETTINGS_KEYS.assetLimits
const FAVICON = SETTINGS_KEYS.faviconFetch
const IMAGE = SETTINGS_KEYS.imagePolling

export const ASSET_PARAMS: ModuleParamDefinition = {
  key: 'asset',
  feature: 'asset-center',
  name: '素材与图片',
  description:
    '素材下载与网页收藏的超时和体积上限、整页归档的单资源上限、站点图标抓取、图片生成任务的轮询节奏。保存后立即生效。',
  settingsKey: ASSET,
  effect: 'immediate',
  groups: [
    {
      title: '素材下载与网页收藏',
      description: '超时与体积上限。调大能收下大文件/慢站点，但单次操作更久、更吃内存。',
      params: [
        {
          kind: 'number',
          path: 'downloadTimeoutMs',
          label: '素材下载超时',
          hint: '下载一个素材（图片/视频/文件）最多等多久；慢源站需要调大，否则会"下载失败"',
          unit: 'Ms',
          default: D.asset.downloadTimeoutMs,
          ceiling: L.asset.downloadTimeoutMs,
          step: 5_000,
        },
        {
          kind: 'number',
          path: 'maxDownloadBytes',
          label: '素材下载体积上限',
          hint: '超过就被拒（报错会写明上限）；收大视频/大素材包需要调大',
          unit: 'Bytes',
          default: D.asset.maxDownloadBytes,
          ceiling: L.asset.maxDownloadBytes,
          step: 10 * 1024 * 1024,
        },
        {
          kind: 'number',
          path: 'maxFileNameChars',
          label: '文件名长度上限',
          hint: '超长文件名会被截断到这么多字符（截断处可能看不出是哪个文件）',
          unit: 'Chars',
          default: D.asset.maxFileNameChars,
          ceiling: L.asset.maxFileNameChars,
          step: 10,
        },
        {
          kind: 'number',
          path: 'collectTimeoutMs',
          label: '网页收藏抓取超时',
          hint: '收藏一个网页最多等多久',
          unit: 'Ms',
          default: D.asset.collectTimeoutMs,
          ceiling: L.asset.collectTimeoutMs,
          step: 5_000,
        },
        {
          kind: 'number',
          path: 'maxCollectBytes',
          label: '网页收藏体积上限',
          hint: '网页（含内联资源）超过这个体积就拒绝收藏',
          unit: 'Bytes',
          default: D.asset.maxCollectBytes,
          ceiling: L.asset.maxCollectBytes,
          step: 10 * 1024 * 1024,
        },
        {
          kind: 'number',
          path: 'maxResourceBytes',
          label: '整页归档·单资源上限',
          hint: '把网页存成单文件时，单个图片/字体/样式超过这个体积就跳过（归档里会缺这块）',
          unit: 'Bytes',
          default: D.asset.maxResourceBytes,
          ceiling: L.asset.maxResourceBytes,
          step: 5 * 1024 * 1024,
        },
        {
          kind: 'number',
          path: 'resourceTimeoutMs',
          label: '整页归档·单资源超时',
          hint: '归档时抓单个资源最多等多久；慢站点调大能少丢资源',
          unit: 'Ms',
          default: D.asset.resourceTimeoutMs,
          ceiling: L.asset.resourceTimeoutMs,
          step: 5_000,
        },
        {
          kind: 'number',
          path: 'maxInlineResources',
          label: '整页归档·资源数上限',
          hint: '一次归档最多内联多少个资源；页面上资源很多时超出的会被跳过（归档里缺那块）',
          default: D.asset.maxInlineResources,
          ceiling: L.asset.maxInlineResources,
          step: 10,
        },
      ],
    },
    {
      title: '站点图标',
      description:
        '列表里显示的小图标（favicon）。抓不到时会缓存"未命中"一段时间，调小能让它更早重试。',
      settingsKey: FAVICON,
      params: [
        {
          kind: 'number',
          path: 'timeoutMs',
          label: '抓取超时',
          hint: '抓一个图标最多等多久；慢站点调大能少出现"没有图标"',
          unit: 'Ms',
          default: D.favicon.timeoutMs,
          ceiling: L.favicon.timeoutMs,
          step: 1_000,
        },
        {
          kind: 'number',
          path: 'htmlScanBytes',
          label: 'HTML 扫描字节数',
          hint: '在网页头部找 <link rel="icon"> 时最多读多少字节；头部很长（内联样式多）的站点调大',
          unit: 'Bytes',
          default: D.favicon.htmlScanBytes,
          ceiling: L.favicon.htmlScanBytes,
          step: 32 * 1024,
        },
        {
          kind: 'number',
          path: 'notFoundTtlMs',
          label: '未命中缓存时长',
          hint: '抓不到图标后多久内不再重试；调小能让图标更早重新尝试（代价是重复请求）',
          unit: 'Ms',
          default: D.favicon.notFoundTtlMs,
          ceiling: L.favicon.notFoundTtlMs,
          step: 3_600_000,
        },
        {
          kind: 'number',
          path: 'maxConcurrency',
          label: '抓取并发上限',
          hint: '同时最多抓几个图标；调大更快但更容易被站点限流（改动需重启客户端）',
          default: D.favicon.maxConcurrency,
          ceiling: L.favicon.maxConcurrency,
          step: 4,
          effect: 'restart',
        },
      ],
    },
    {
      title: '图片生成任务',
      description: '提交出图后多久查一次进度、查到什么时候放弃。出图慢（高峰排队）时调大等待上限。',
      settingsKey: IMAGE,
      params: [
        {
          kind: 'number',
          path: 'pollIntervalMs',
          label: '轮询间隔',
          hint: '多久查一次出图进度；调小更灵敏但请求更频繁',
          unit: 'Ms',
          default: D.image.pollIntervalMs,
          ceiling: L.image.pollIntervalMs,
          step: 1_000,
        },
        {
          kind: 'number',
          path: 'maxPolls',
          label: '最大轮询次数',
          hint: '查这么多次还没好就判"任务超时，请重试"；按当前间隔算 = 等待总时长（默认 5 秒 × 60 次 ≈ 5 分钟）',
          default: D.image.maxPolls,
          ceiling: L.image.maxPolls,
          step: 10,
        },
      ],
    },
  ],
}
