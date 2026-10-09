/**
 * 图像生成公共调用层（工作流节点复用）
 * @module core/platform/workflow/nodes/image-generate
 * @description 把 image-gen 节点内的「参考图归一化 → 提交（瞬时失败重试）→ 异步任务轮询 →
 *              输出形态归一（url / path / localUrl）」抽成可复用函数，
 *              供 image-gen 节点与 shot-visual（镜头画面生产）共同使用，避免两处实现漂移。
 */

import { existsSync, readFileSync } from 'fs'
import { isAbsolute, join } from 'path'
import { ImageService } from '@core/platform/services/image.service'
import { getPathProvider } from '@core/interfaces/path.interface'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'
import { stringifyValue } from '../engine/variable-resolver'
import { pollUntil } from '../engine/async-utils'
import { submitWithTransientRetry } from './retry-submit'
import type { WorkflowNodeContext } from '../engine/node-handler'

/** 生成入参 */
export interface ImageGenerateOptions {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  count?: number
  providerConfigId?: string
  modelId: string
  /** 参考图：本地文件路径数组（file 输入 .path 或下游产物路径），读取为 base64 data URL 透传 */
  referenceImages?: unknown
  /** 是否允许模型/平台扩写提示词（一致性场景必须显式 false） */
  promptExtend?: boolean
  /** 随机种子（同 prompt+seed 生成同构图） */
  seed?: number
}

/** 归一化后的生成结果（images 至少一张，否则调用方拿到的是异常） */
export interface ImageGenerateOutput {
  taskId?: string
  /** 实际使用的提示词（下游确认/重生成引用） */
  prompt: string
  seed?: number
  images: Array<{
    width?: number
    height?: number
    url?: string
    /** 本地绝对路径 */
    path?: string
    /** local-*:// 协议 URL（前端可直接加载） */
    localUrl?: string
  }>
}

/**
 * 参考图归一化：本地路径 → data:image/png;base64,...（不存在的路径直接报错，不静默跳过）
 * 已是 data: 开头的原样透传（上游可能已归一）。
 */
export function normalizeReferenceImages(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined
  const list = Array.isArray(raw) ? raw : [raw]
  const resolved: string[] = []
  for (const item of list) {
    const p = stringifyValue(item).trim()
    if (!p) continue
    if (p.startsWith('data:image/')) {
      resolved.push(p)
      continue
    }
    if (!existsSync(p)) {
      throw new Error(`参考图文件不存在: ${p}`)
    }
    resolved.push(`data:image/png;base64,${readFileSync(p).toString('base64')}`)
  }
  return resolved.length > 0 ? resolved : undefined
}

/**
 * 调用图像服务生成图片（同步/异步 provider 都归一为"已完成的图片列表"）。
 * 失败抛错（调用方决定是重试还是降级），不返回半成品。
 */
export async function generateImages(
  options: ImageGenerateOptions,
  ctx: WorkflowNodeContext,
): Promise<ImageGenerateOutput> {
  const referenceImages = normalizeReferenceImages(options.referenceImages)
  const actualPrompt = stringifyValue(options.prompt)
  const request = {
    model: options.modelId,
    prompt: actualPrompt,
    ...(options.negativePrompt ? { negativePrompt: options.negativePrompt } : {}),
    width: options.width,
    height: options.height,
    ...(options.count ? { count: options.count } : {}),
    ...(options.providerConfigId ? { providerConfigId: options.providerConfigId } : {}),
    ...(options.promptExtend !== undefined ? { promptExtend: options.promptExtend } : {}),
    ...(options.seed !== undefined && options.seed >= 0 ? { seed: options.seed } : {}),
    ...(referenceImages ? { referenceImages } : {}),
  } as never

  // 提交阶段的瞬时网络失败（fetch/连接/网关 5xx/超时）内部重试一次
  // ComfyUI 局域网网关经 VPN 隧道访问时存在间歇性断流（socket hang up，
  // 服务器侧 ComfyUI 实际执行成功、响应回不来），且单队列被 H3 任务占用时
  // 图像提交需排队数分钟——瞬时重试放宽为 8 次 × 60s 间隔覆盖抖动窗口
  // （普通云厂商首次即成功，不受影响）
  const resp = await submitWithTransientRetry(() => ImageService.generateImage(request), {
    label: '图像',
    logger: ctx.logger,
    maxAttempts: 8,
    retryDelayMs: 60_000,
  })
  if (!resp.success) {
    throw new Error(`图像生成失败: ${resp.error ?? '未知错误'}`)
  }
  let images = resp.images ?? []
  const taskId = resp.taskId ?? ''
  if (images.length === 0 && taskId) {
    const task = await pollUntil(
      async () => {
        const st = await ImageService.getTaskStatus(taskId)
        ctx.emitProgress(st.progress ?? -1)
        if (st.status === 'completed') return st
        if (st.status === 'failed') throw new Error(st.error ?? '图像生成失败')
        return undefined
      },
      {
        intervalMs: workflowRuntimeParams().polling.imageIntervalMs,
        timeoutMs: workflowRuntimeParams().polling.imageWaitTimeoutMs,
        signal: ctx.signal,
      },
    )
    images = task.images ?? []
    ctx.emitProgress(100)
  }
  if (images.length === 0) {
    throw new Error('图像服务未返回图片')
  }

  const pathProvider = getPathProvider()
  const dataRoot = pathProvider.getDataPath()
  return {
    ...(taskId ? { taskId } : {}),
    prompt: actualPrompt,
    ...(options.seed !== undefined && options.seed >= 0 ? { seed: options.seed } : {}),
    images: images.map(im => {
      const out: ImageGenerateOutput['images'][number] = {
        width: im.width,
        height: im.height,
      }
      if (im.url) out.url = im.url
      const rawPath = im.filePath
      if (rawPath) {
        const stripped = String(rawPath).replace(/^local-[a-z]+:\/\//i, '')
        const abs = isAbsolute(stripped) ? stripped : join(dataRoot, stripped.replace(/^\/+/, ''))
        out.path = abs
        out.localUrl = pathProvider.toAssetUrl(stripped, 'image')
      }
      return out
    }),
  }
}