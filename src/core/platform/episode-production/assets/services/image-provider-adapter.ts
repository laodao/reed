/**
 * 图像生成 Provider 适配器
 * @module platform/episode-production/assets/services/image-provider-adapter
 *
 * 把项目通用的 ImageService.generateImage（按用户配置的 enabled provider 路由 ——
 * DashScope / Bailian / OpenAI / Volcengine / 等）适配到 episode-production 资产
 * 域内部需要的两个窄接口：
 *
 *   - ImageGenerator（gallery-derivation 用：视角 / 表情 / 服装 / 姿势 / 时间 / 天气 / 角度）
 *   - PanoramaImageGenerator（panorama-generator 用：360 全景 2:1 等距投影图）
 *
 * 双端共用（src/core）：背后只依赖 ImageService 静态方法，ImageService 自己负责
 * provider 选择、API 调用、文件落盘（saveImagesWithoutHistory）。两端共用同一份。
 *
 * **质量说明**：360 全景目前用通用图像 API + panorama prompt suffix 拼接，
 * 输出 2:1 比例的图，但**左右边缘不保证无缝**（接缝在 photo-sphere-viewer 旋转时
 * 可见）。要做到真无缝需要换专门的 panorama provider（如 Blockade Labs Skybox AI
 * 或 SDXL panorama LoRA），那是另一个 follow-up，本 adapter 仅打通"能跑"基线。
 */

import * as fs from 'fs'
import * as path from 'path'
import { ImageService } from '@core/platform/services/image.service'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { ImageGenerator } from './gallery-derivation.service'
import type { PanoramaImageGenerator } from './panorama-generator.service'

/** 允许作为参考图的本地文件扩展名 */
const ALLOWED_REF_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

/**
 * 把参考图路径解析为 dataPath 内的绝对路径（安全校验版）。
 *
 * referenceImagePaths 来自 IPC 入参（客户端可控），不能信任其指向任意文件——
 * 否则恶意调用可把 /etc/passwd、data-web/secure-key 等内容 base64 后外发到
 * 第三方图像 provider。规则：
 *   - http(s)/data:/local-image:// 等协议 URL 不是本地文件，返回 null（走纯 prompt）；
 *   - 绝对路径与 ../ 逃逸一律拒绝，解析后必须落在 dataPath 内；
 *   - 扩展名白名单（jpg/jpeg/png/webp/gif/bmp）。
 */
function resolveSafeReferencePath(relativeOrAbsPath: string): string | null {
  const raw = (relativeOrAbsPath ?? '').trim()
  if (!raw) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return null
  try {
    const dataPath = getPathProvider().getDataPath()
    const abs = path.isAbsolute(raw) ? raw : path.join(dataPath, raw)
    const normalized = path.normalize(abs)
    const prefix = dataPath.endsWith(path.sep) ? dataPath : dataPath + path.sep
    if (normalized !== dataPath && !normalized.startsWith(prefix)) {
      console.warn('[image-provider-adapter] 拒绝越界参考图路径:', raw)
      return null
    }
    const ext = path.extname(normalized).toLowerCase()
    if (!ALLOWED_REF_EXT.has(ext)) {
      console.warn('[image-provider-adapter] 拒绝非图片扩展名参考图:', raw)
      return null
    }
    return normalized
  } catch {
    return null
  }
}

/**
 * 把磁盘上的图像文件读成 data URL（用于把"主图"作为参考图传给 provider）。
 * 失败返回 undefined（让生成走纯 prompt 模式而非整个失败）。
 */
function readImageAsDataUrl(relativeOrAbsPath: string): string | undefined {
  try {
    const abs = resolveSafeReferencePath(relativeOrAbsPath)
    if (!abs || !fs.existsSync(abs)) return undefined
    const buf = fs.readFileSync(abs)
    const ext = path.extname(abs).toLowerCase().replace(/^\./, '') || 'png'
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (e) {
    console.warn('[image-provider-adapter] 读取参考图失败:', relativeOrAbsPath, e)
    return undefined
  }
}

/** 派生图默认尺寸（视角 / 表情 / 服装 / 姿势 / 时间 / 天气 / 角度通用） */
const DEFAULT_DERIVE_WIDTH = 1024
const DEFAULT_DERIVE_HEIGHT = 1024

/** 360 全景默认尺寸（equirectangular 2:1） */
const DEFAULT_PANORAMA_WIDTH = 2048
const DEFAULT_PANORAMA_HEIGHT = 1024

/**
 * 从用户已启用的 provider configs 里挑一个 image 类型 model 的 ID。
 * 优先 default provider 的第一个 image model；否则任意 enabled provider 的第一个。
 *
 * 不写死任何 model 名 —— 由用户在 settings 里启用什么模型，就用什么。
 *
 * @throws 找不到任何已启用的 image model 时抛错（用户需要先去 settings 配 image 类型模型）
 */
async function pickImageModel(): Promise<{ providerConfigId: string; model: string }> {
  const db = getCoreDatabaseManager()
  if (!db.providerConfigs) {
    throw new Error('数据库未初始化（providerConfigs 仓库不可用）')
  }
  const enabled = await db.providerConfigs.getEnabled()
  if (!enabled.length) {
    throw new Error('未配置任何 enabled image provider，请到「设置 → 模型服务」启用一个图像 provider')
  }
  // 把 default 排前面
  enabled.sort((a, b) => Number(b.isDefault ?? 0) - Number(a.isDefault ?? 0))
  for (const cfg of enabled) {
    const models = (cfg.models ?? []) as Array<{ id?: string; type?: string }>
    const imgModel = models.find(
      (m) => m.id && (m.type === 'image' || m.type === 'multimodal'),
    )
    if (imgModel?.id) {
      return { providerConfigId: cfg.id, model: imgModel.id }
    }
  }
  throw new Error(
    '已启用的 provider 中没有 image 类型模型，请到「设置 → 模型服务」' +
      '为某个 provider 添加 type=image 的模型（如阿里百炼的 wan2.7-image / qwen-image-2.0）',
  )
}

/**
 * 创建 gallery 派生用的 ImageGenerator。
 * 调 ImageService.generateImage（skipHistory=true，避免污染主图像库历史）。
 *
 * 派生图必须以"主图"作 reference image —— 否则 AI 完全按 prompt 自由发挥，
 * 跨变体的人物形象 / 风格 / 长相会漂移（实测会出现完全不同的人）。
 * 这里把主图文件读成 data URL 透传到 ImageService.generateImage 的 referenceImage
 * 字段，后续 provider 适配层负责按各家协议（DashScope reference_images /
 * OpenAI image-to-image / Volcengine prompt_image_url 等）转译。
 */
export function createGalleryImageGenerator(): ImageGenerator {
  return {
    async generate(opts) {
      // label 拼到 prompt 末尾让 provider 知道当前生成的是哪个 variant
      const fullPrompt = opts.label
        ? `${opts.prompt}, variant: ${opts.label}`
        : opts.prompt

      // spec 2026-05-09 ep-redesign §3.2 D1：multi-reference
      // 把全部 referenceImagePaths 转为 data URLs，喂给 ImageGenerationRequest.referenceImages
      // 各 provider adapter 的 collectReferences helper 会按各家形态适配（万相 1-4 / Seedream 多张 / 可灵 element_list）
      const refPaths = opts.referenceImagePaths ?? []
      const referenceImages = refPaths
        .map((p) => readImageAsDataUrl(p))
        .filter((url): url is string => !!url)
      // 兼容 referenceImage 单值（旧 provider 可能仅认此字段）
      const referenceImage = referenceImages[0]

      const { providerConfigId, model } = await pickImageModel()
      const resp = await ImageService.generateImage({
        providerConfigId,
        model,
        prompt: fullPrompt,
        negativePrompt: opts.negativePrompt,
        width: DEFAULT_DERIVE_WIDTH,
        height: DEFAULT_DERIVE_HEIGHT,
        referenceImage,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        skipHistory: true,
      })

      if (!resp.success || !resp.images?.[0]) {
        throw new Error(resp.error || '图像生成失败：provider 未返回图像')
      }

      const img = resp.images[0] as { filePath?: string; url?: string }
      const imagePath = img.filePath || img.url
      if (!imagePath) {
        throw new Error('图像生成成功但 provider 未返回可用路径 / URL')
      }
      return { imagePath, thumbnailPath: null }
    },
  }
}

/**
 * 创建 panorama 用的 PanoramaImageGenerator。
 * 与 derivation 共用同一个 ImageService 路由，仅 width/height 强制 2:1。
 *
 * 注意：panorama-generator.service.generateFor 自己已经在 prompt 末尾拼了
 * PANORAMA_PROMPT_SUFFIX（"... 360 panorama equirectangular ..."），
 * adapter 不再重复添加，避免 prompt 双重。
 *
 * referenceImagePaths：service 传入主图路径时，把主图读为 data URL 作 reference，
 * 让 panorama 在风格 / 色调 / 陈设元素上跟主图对齐。
 */
export function createPanoramaImageGenerator(): PanoramaImageGenerator {
  return {
    async generate(opts) {
      const refPath = opts.referenceImagePaths?.[0]
      const referenceImage = refPath ? readImageAsDataUrl(refPath) : undefined

      const { providerConfigId, model } = await pickImageModel()
      const resp = await ImageService.generateImage({
        providerConfigId,
        model,
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt,
        width: DEFAULT_PANORAMA_WIDTH,
        height: DEFAULT_PANORAMA_HEIGHT,
        referenceImage,
        skipHistory: true,
      })

      if (!resp.success || !resp.images?.[0]) {
        throw new Error(resp.error || '360 全景生成失败：provider 未返回图像')
      }

      const img = resp.images[0] as { filePath?: string; url?: string }
      const imagePath = img.filePath || img.url
      if (!imagePath) {
        throw new Error('360 全景生成成功但 provider 未返回可用路径 / URL')
      }
      return { imagePath, thumbnailPath: null }
    },
  }
}
