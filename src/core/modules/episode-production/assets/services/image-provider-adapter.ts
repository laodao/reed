/**
 * 图像生成 Provider 适配器
 * @module modules/episode-production/assets/services/image-provider-adapter
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

import { ImageService } from '@core/services/image.service'
import type { ImageGenerator } from './gallery-derivation.service'
import type { PanoramaImageGenerator } from './panorama-generator.service'

/** 派生图默认尺寸（视角 / 表情 / 服装 / 姿势 / 时间 / 天气 / 角度通用） */
const DEFAULT_DERIVE_WIDTH = 1024
const DEFAULT_DERIVE_HEIGHT = 1024

/** 360 全景默认尺寸（equirectangular 2:1） */
const DEFAULT_PANORAMA_WIDTH = 2048
const DEFAULT_PANORAMA_HEIGHT = 1024

/**
 * 创建 gallery 派生用的 ImageGenerator。
 * 调 ImageService.generateImage（skipHistory=true，避免污染主图像库历史）。
 *
 * referenceImagePaths 暂不传给 provider —— 各家 provider 对参考图协议不一致
 * （DashScope wanx 用 referenceImage 字段，OpenAI 用 image-to-image 端点等），
 * 当前仅做 prompt-only 派生。后续如需精细控制可引入 ControlNet / IP-Adapter。
 */
export function createGalleryImageGenerator(): ImageGenerator {
  return {
    async generate(opts) {
      // label 拼到 prompt 末尾让 provider 知道当前生成的是哪个 variant
      const fullPrompt = opts.label
        ? `${opts.prompt}, variant: ${opts.label}`
        : opts.prompt

      const resp = await ImageService.generateImage({
        model: '', // 空字符串触发 provider 默认模型选择
        prompt: fullPrompt,
        negativePrompt: opts.negativePrompt,
        width: DEFAULT_DERIVE_WIDTH,
        height: DEFAULT_DERIVE_HEIGHT,
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
 */
export function createPanoramaImageGenerator(): PanoramaImageGenerator {
  return {
    async generate(opts) {
      const resp = await ImageService.generateImage({
        model: '',
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt,
        width: DEFAULT_PANORAMA_WIDTH,
        height: DEFAULT_PANORAMA_HEIGHT,
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
