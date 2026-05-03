/**
 * panorama 生成 service（spec §4.5.10 step 1）
 * @module modules/episode-production/assets/services/panorama-generator
 *
 * AI 生成 360 全景或用户上传，写入 asset_image (category='panorama_360')。
 *
 * 本 service 只承担"请求构造 + 提交给 image API + 写回 asset_image"的编排逻辑，
 * 底层图像生成通过依赖注入的 PanoramaImageGenerator 抽象接口完成，
 * 不直接耦合具体 image.service 实现，便于测试 mock 与后续切换 provider。
 *
 * 真实 image API 适配在 IPC handler 层做（PC/Web 双端各自接入对应 provider）。
 */

import type { AssetImageService } from './asset-image.service'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

/**
 * 抽象 360 全景图像生成器接口（依赖注入）。
 *
 * 实现方负责：根据 prompt 生成 2:1 等距投影全景图，
 * 落地为本地或远端文件路径，并返回主图路径与可选缩略图路径。
 */
export interface PanoramaImageGenerator {
  generate(opts: {
    prompt: string
    negativePrompt?: string
    aspectRatio: '2:1'
  }): Promise<{ imagePath: string; thumbnailPath: string | null }>
}

/** AI 生成 360 全景入参 */
export interface GenerateForInput {
  /** 关联的 location_bindings.id */
  locationBindingId: string
  /** 地点风格描述（如 "茶馆 古风 工笔国风"） */
  stylePrompt: string
  /** 额外 prompt 追加（与 stylePrompt 之间以空格拼接） */
  additionalPrompt?: string
  negativePrompt?: string
  userId?: string | null
}

/** 用户上传现成 360 全景图入参 */
export interface UploadForInput {
  /** 关联的 location_bindings.id */
  locationBindingId: string
  /** 上传图片落地后的路径 */
  imagePath: string
  userId?: string | null
}

/** 360 全景 prompt 后缀（强制等距投影 + 2:1 比例） */
const PANORAMA_PROMPT_SUFFIX =
  ' equirectangular panoramic 360 view 2:1 aspect ratio'

/**
 * 360 全景生成 / 上传服务。
 *
 * 用法：
 * ```ts
 * const svc = new PanoramaGeneratorService(imageSvc, panoramaGen)
 * await svc.generateFor({ locationBindingId, stylePrompt: '茶馆 古风' })
 * await svc.uploadFor({ locationBindingId, imagePath: '/uploaded/x.jpg' })
 * ```
 */
export class PanoramaGeneratorService {
  constructor(
    private readonly imageSvc: AssetImageService,
    private readonly imageGen: PanoramaImageGenerator,
  ) {}

  /**
   * AI 生成 360 全景：
   * 1. 拼接 prompt = stylePrompt + (additionalPrompt 拼空格) + 等距投影后缀
   * 2. 调 imageGen.generate 出图（aspectRatio 强制 2:1）
   * 3. 写入 asset_image (assetType='location', category='panorama_360', isMain=0)
   */
  async generateFor(input: GenerateForInput): Promise<AssetImageEntity> {
    const fullPrompt =
      input.stylePrompt +
      (input.additionalPrompt ? ' ' + input.additionalPrompt : '') +
      PANORAMA_PROMPT_SUFFIX

    const result = await this.imageGen.generate({
      prompt: fullPrompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: '2:1',
    })

    return await this.imageSvc.addImage({
      assetType: 'location',
      assetId: input.locationBindingId,
      category: 'panorama_360',
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath ?? undefined,
      isMain: false,
      prompt: fullPrompt,
      negativePrompt: input.negativePrompt,
      userId: input.userId,
    })
  }

  /**
   * 用户上传现成 360 全景图：
   * 不调 imageGen，直接落表（不带 prompt / negativePrompt）。
   */
  async uploadFor(input: UploadForInput): Promise<AssetImageEntity> {
    return await this.imageSvc.addImage({
      assetType: 'location',
      assetId: input.locationBindingId,
      category: 'panorama_360',
      imagePath: input.imagePath,
      isMain: false,
      userId: input.userId,
    })
  }

  /** 列出某地点的全部 panorama_360 */
  async listForLocation(
    locationBindingId: string,
  ): Promise<AssetImageEntity[]> {
    return await this.imageSvc.listByCategory(
      'location',
      locationBindingId,
      'panorama_360',
    )
  }

  /** 删除一张 panorama */
  async deletePanorama(panoramaImageId: string): Promise<void> {
    await this.imageSvc.deleteImage(panoramaImageId)
  }
}
