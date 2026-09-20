/**
 * 主图（main）生成 service
 * @module platform/episode-production/assets/services/main-image-generator
 *
 * 调底层 ImageGenerator 生成一张图作为某资产（character / location / item）的主图，
 * 落表 category='main', isMain=1。如果该资产已有主图，新主图会顶替旧主图（旧的 isMain=0）。
 *
 * 派生 service（GalleryDerivationService.deriveSingle）需要资产先有主图作参考；
 * 本 service 提供"主图入口"，与派生互补。两者共用 ImageGenerator 接口。
 *
 * 双端共用：core 包，后端 service 不直接拼前端 UI 逻辑；imageGen 由 handler / router 注入
 * 真实 ImageService 适配器（src/core/...services/image-provider-adapter.ts）。
 */

import { randomBytes } from 'crypto'
import type { Repository, DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageService, type AssetType } from './asset-image.service'
import type { ImageGenerator } from './gallery-derivation.service'
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
  appendLocationBaseComposition,
  mergeLocationBaseCompositionNegative,
} from '../prompts/location-constraints'
import {
  appendCharacterIdentityPreservation,
  mergeCharacterIdentityNegative,
} from '../prompts/character-constraints'
import { fallbackToReferenceCapableModel } from './image-provider-adapter'
import {
  appendItemConstraints,
  mergeItemNegative,
} from '../prompts/item-constraints'

export interface GenerateMainInput {
  assetType: AssetType
  assetId: string
  /** 完整 prompt（应由调用方从 effective data 拉名字 / 描述 / 风格拼好） */
  prompt: string
  negativePrompt?: string
  userId?: string | null
  /**
   * 用户上传的参考图相对路径（spec 2026-05-09；来自 binding.reference_image_path）。
   * 提供时会作为 imageGen.generate.referenceImagePaths 输入，让 AI 沿用参考图的视觉风格。
   */
  referenceImagePath?: string | null
  /**
   * 多参考图（换装等场景：第一张主图作面容基准 + 用户上传的换装参考图）。
   * 优先级高于 referenceImagePath；全部非空路径会进 referenceImagePaths。
   */
  referenceImagePaths?: string[] | null
  /**
   * P-B：显式指定图像 provider/模型（资产图生成器下拉选择，如在线模型出汉字物品图）。
   * 不传 → 走 pickImageModel 自动挑启用 provider 的第一个 image 模型。
   */
  providerConfigId?: string | null
  modelId?: string | null
}

export class MainImageGeneratorService {
  /**
   * imageSvc 当前未直接调用（落表走 Repository.save），但保留构造参数以保持
   * 与 GalleryDerivationService / PanoramaGeneratorService 一致的注入签名，
   * 方便后续如果增加 main 图衍生 / 缩略图生成等需要 imageSvc 的能力。
   */
  constructor(
    private readonly _imageSvc: AssetImageService,
    private readonly imageGen: ImageGenerator,
    private readonly ds: DataSource,
  ) {
    void this._imageSvc
  }

  private get imageRepo(): Repository<AssetImageEntity> {
    return this.ds.getRepository(AssetImageEntity)
  }

  private generateId(): string {
    return `ai_${randomBytes(8).toString('hex')}`
  }

  /**
   * 故事背景锚点前缀（H12b）：asset → binding.projectId → 项目最新一集
   * （episodeNumber DESC）的 storyEra/storyRegion/storyBackgroundExtra，
   * 拼成 `时代背景：…；地域：…；故事背景：…。` 前缀，避免资产描述太薄时
   * 图像模型自由发挥成现代装（阿蘅现代装事故）。
   *
   * - 三字段全空 / 资产无 projectId（全局 preset）/ 解析失败 → 返回 ''（不拼）。
   * - 幂等：renderer 主入口（main-image-generator.ts）已在 prompt 尾部拼过
   *   「故事年代/地域/背景」段，已包含同值的段不再重复拼。
   */
  private async buildStoryAnchorPrefix(
    assetType: AssetType,
    assetId: string,
    prompt: string,
  ): Promise<string> {
    try {
      const bindingRepo =
        assetType === 'character'
          ? this.ds.getRepository(CharacterBindingEntity)
          : assetType === 'location'
            ? this.ds.getRepository(LocationBindingEntity)
            : this.ds.getRepository(ItemBindingEntity)
      const binding = await bindingRepo.findOne({ where: { id: assetId } as any })
      const projectId = (binding as any)?.projectId as string | null | undefined
      if (!projectId) return ''

      const episodes = await this.ds.getRepository(VideoEpisodeEntity).find({
        where: { projectId },
        order: { episodeNumber: 'DESC' },
      })
      const ep = episodes.find(
        (e) =>
          (e.storyEra ?? '').trim() ||
          (e.storyRegion ?? '').trim() ||
          (e.storyBackgroundExtra ?? '').trim(),
      )
      if (!ep) return ''

      const era = (ep.storyEra ?? '').trim()
      const region = (ep.storyRegion ?? '').trim()
      const extra = (ep.storyBackgroundExtra ?? '').trim()
      const segments: string[] = []
      if (era && !prompt.includes(era)) segments.push(`时代背景：${era}`)
      if (region && !prompt.includes(region)) segments.push(`地域：${region}`)
      if (extra && !prompt.includes(extra)) segments.push(`故事背景：${extra}`)
      // 项目设置的全局风格 prompt（config.stylePrompt）——此前在设置里可填但无人消费（死设置）
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      const style = ((project?.config as { stylePrompt?: string } | null | undefined)?.stylePrompt ?? '').trim()
      if (style && !prompt.includes(style)) segments.push(`风格：${style}`)
      return segments.length > 0 ? `${segments.join('；')}。` : ''
    } catch (e) {
      console.warn('[MainImageGeneratorService] 故事背景锚点解析失败（跳过拼接）:', e)
      return ''
    }
  }

  /** 资产 → 项目 config.imageModel（设置里的「画面生成」模型，此前无人消费）；无 → null */
  private async resolveProjectImageModel(
    assetType: AssetType,
    assetId: string,
  ): Promise<{ providerConfigId: string; modelId: string } | null> {
    try {
      const bindingRepo =
        assetType === 'character'
          ? this.ds.getRepository(CharacterBindingEntity)
          : assetType === 'location'
            ? this.ds.getRepository(LocationBindingEntity)
            : this.ds.getRepository(ItemBindingEntity)
      const binding = await bindingRepo.findOne({ where: { id: assetId } as any })
      const projectId = (binding as any)?.projectId as string | null | undefined
      if (!projectId) return null
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      const im = (project?.config as { imageModel?: { providerConfigId?: string; modelId?: string } } | null | undefined)
        ?.imageModel
      return im?.providerConfigId && im?.modelId
        ? { providerConfigId: im.providerConfigId, modelId: im.modelId }
        : null
    } catch (e) {
      // 解析失败回退 imageGen 自动挑模型（不阻塞生成），但必须留痕——
      // 自动挑到的模型与主图模型不同源是角色风格分叉的根因之一
      console.warn('[MainImageGeneratorService] 项目画面模型解析失败，回退自动挑模型:', e)
      return null
    }
  }

  /** 资产引用校验：assetType 合法 + assetId 非空（防止 asset_id='' 孤儿行 / 非法类型） */
  private requireAssetRef(assetType: string, assetId: string): void {
    if (assetType !== 'character' && assetType !== 'location' && assetType !== 'item') {
      throw new Error(`非法资产类型：${assetType}`)
    }
    if (!assetId || typeof assetId !== 'string' || !assetId.trim()) {
      throw new Error('缺少资产 ID（assetId 不能为空）')
    }
  }

  /**
   * 流程：
   * 1. 调 imageGen.generate（无 referenceImagePaths：主图本身没有上游图）
   * 2. 把当前 (assetType, assetId) 已有的所有 isMain=1 行改 isMain=0
   * 3. 直接 INSERT 一行 (category='main', isMain=1)，绕开 imageSvc.addImage（其内部对 isMain
   *    重复处理已涵盖，但走 INSERT 更显式 + 与流程语义对齐）
   */
  async generateMain(input: GenerateMainInput): Promise<AssetImageEntity> {
    this.requireAssetRef(input.assetType, input.assetId)
    if (!input.prompt.trim()) {
      throw new Error('生成主图需要 prompt（请检查资产 effective 数据）')
    }

    // 类资产硬约束（service 层收口；renderer 不重复加）：
    //   location → 全域无人；item → 居中干净背景；character 在 renderer 层已加 framing 约束
    const anchor = await this.buildStoryAnchorPrefix(input.assetType, input.assetId, input.prompt)
    let effectivePrompt = anchor ? `${anchor}${input.prompt}` : input.prompt
    let effectiveNegative = input.negativePrompt
    if (input.assetType === 'location') {
      effectivePrompt = appendLocationNoHumanConstraint(effectivePrompt)
      // 主图作为派生基准：补稳定全景构图锚点
      effectivePrompt = appendLocationBaseComposition(effectivePrompt)
      effectiveNegative = mergeLocationNoHumanNegative(input.negativePrompt)
      effectiveNegative = mergeLocationBaseCompositionNegative(effectiveNegative)
    }
    if (input.assetType === 'item') {
      effectivePrompt = appendItemConstraints(effectivePrompt)
      effectiveNegative = mergeItemNegative(input.negativePrompt)
    }

    const refPaths: string[] = []
    if (input.referenceImagePath && input.referenceImagePath.trim()) {
      refPaths.push(input.referenceImagePath.trim())
    }

    // 模型解析序：调用方显式指定 > 项目设置「画面生成」模型 > pickImageModel 自动
    const projectImageModel =
      input.providerConfigId && input.modelId
        ? null
        : await this.resolveProjectImageModel(input.assetType, input.assetId)

    const result = await this.imageGen.generate({
      referenceImagePaths: refPaths,
      prompt: effectivePrompt,
      negativePrompt: effectiveNegative,
      label: 'main',
      providerConfigId: input.providerConfigId ?? projectImageModel?.providerConfigId,
      modelId: input.modelId ?? projectImageModel?.modelId,
    })

    // 旧主图降级
    await this.imageRepo
      .createQueryBuilder()
      .update(AssetImageEntity)
      .set({ isMain: 0 })
      .where(
        'asset_type = :t AND asset_id = :id AND is_main = 1',
        { t: input.assetType, id: input.assetId },
      )
      .execute()

    // 复用"待生成占位行"（imagePath='' 且 category='main'）：用户在生成前编辑的提示词
    // 由 savePrompt 落在占位行上，生成成功后直接回填为真实主图，避免产生孤儿行。
    const placeholder = await this.imageRepo.findOne({
      where: {
        assetType: input.assetType,
        assetId: input.assetId,
        category: 'main',
        imagePath: '',
      },
    })
    if (placeholder) {
      await this.imageRepo.update(
        { id: placeholder.id },
        {
          label: null,
          imagePath: result.imagePath,
          thumbnailPath: result.thumbnailPath ?? null,
          isMain: 1,
          sortOrder: 0,
          derivedFromImageId: null,
          prompt: effectivePrompt,
          negativePrompt: effectiveNegative ?? null,
          updatedAt: new Date(),
        },
      )
      return (await this.imageRepo.findOne({
        where: { id: placeholder.id },
      })) as AssetImageEntity
    }

    // 写新主图
    const entity = this.imageRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      assetType: input.assetType,
      assetId: input.assetId,
      category: 'main',
      label: null,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath ?? null,
      isMain: 1,
      sortOrder: 0,
      derivedFromImageId: null,
      prompt: effectivePrompt,
      negativePrompt: effectiveNegative ?? null,
      width: null,
      height: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<AssetImageEntity>)

    return await this.imageRepo.save(entity)
  }

  /**
   * 追加一张主图（spec 2026-05-09 多主图模型，仅 location 业务调用）。
   *
   * 与 generateMain 区别：
   *   - 不降级旧 isMain=1 行；新主图 isMain=0 + category='main' + label=用户输入
   *   - 用户可通过 AssetImageService.switchDefaultMain(imageId) 之后切换默认
   *
   * 用法：
   *   1. 第一次创建该 binding 主图时，调用方可以传 makeDefault=true 使其 isMain=1（兜底主图）
   *   2. 已有主图时再创建，传 makeDefault=false（默认）；UI 可让用户随后切默认
   *
   * label 必填（区分多张主图）；metadata 可选（参与评分）。
   */
  async addAdditionalMain(input: GenerateMainInput & {
    label: string
    makeDefault?: boolean
    metadata?: Record<string, unknown> | null
  }): Promise<AssetImageEntity> {
    this.requireAssetRef(input.assetType, input.assetId)
    if (!input.prompt.trim()) {
      throw new Error('生成主图需要 prompt（请检查资产 effective 数据）')
    }
    if (!input.label?.trim()) {
      throw new Error('多主图必须提供 label（区分用途）')
    }

    const anchor = await this.buildStoryAnchorPrefix(input.assetType, input.assetId, input.prompt)
    let effectivePrompt = anchor ? `${anchor}${input.prompt}` : input.prompt
    let effectiveNegative = input.negativePrompt
    if (input.assetType === 'location') {
      effectivePrompt = appendLocationNoHumanConstraint(effectivePrompt)
      // 主图作为派生基准：补稳定全景构图锚点
      effectivePrompt = appendLocationBaseComposition(effectivePrompt)
      effectiveNegative = mergeLocationNoHumanNegative(input.negativePrompt)
      effectiveNegative = mergeLocationBaseCompositionNegative(effectiveNegative)
    }

    const refPaths: string[] = []
    // 多参考图优先（换装：第一张主图基准 + 用户上传图）；无则回退单 referenceImagePath
    const multiRefs = (input.referenceImagePaths ?? [])
      .map(p => (p ?? '').trim())
      .filter(Boolean)
    if (multiRefs.length > 0) {
      refPaths.push(...multiRefs)
    } else if (input.referenceImagePath && input.referenceImagePath.trim()) {
      refPaths.push(input.referenceImagePath.trim())
    }

    const projectImageModel =
      input.providerConfigId && input.modelId
        ? null
        : await this.resolveProjectImageModel(input.assetType, input.assetId)

    const result = await this.imageGen.generate({
      referenceImagePaths: refPaths,
      prompt: effectivePrompt,
      negativePrompt: effectiveNegative,
      label: input.label,
      providerConfigId: input.providerConfigId ?? projectImageModel?.providerConfigId,
      modelId: input.modelId ?? projectImageModel?.modelId,
    })

    // makeDefault=true 时把同 asset 已有 isMain=1 降为 0，让目标成为默认
    if (input.makeDefault) {
      await this.imageRepo
        .createQueryBuilder()
        .update(AssetImageEntity)
        .set({ isMain: 0 })
        .where(
          'asset_type = :t AND asset_id = :id AND is_main = 1',
          { t: input.assetType, id: input.assetId },
        )
        .execute()
    }

    const entity = this.imageRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      assetType: input.assetType,
      assetId: input.assetId,
      category: 'main',
      label: input.label,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath ?? null,
      isMain: input.makeDefault ? 1 : 0,
      sortOrder: 0,
      derivedFromImageId: null,
      prompt: effectivePrompt,
      negativePrompt: effectiveNegative ?? null,
      width: null,
      height: null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<AssetImageEntity>)

    return await this.imageRepo.save(entity)
  }

  /**
   * 角色一键多角度参考图（spec 2026-05-09 ep-redesign §3.2 B3）
   *
   * 串行调 imageGen 3 次（front / 3q_left / 3q_right），同一 base 主图作 reference 保一致性。
   * 落 3 个 asset_image 行 category='view' label='front'/'3q_left'/'3q_right'，
   * derivedFromImageId 都指向 baseImage。
   *
   * 流程：
   * 1. 解析 baseImage（用 baseImageId 或自动取 isMain=1 主图）
   * 2. 校验：必须有 base + prompt 非空
   * 3. 串行 3 次：每次拼"视角"前缀 + 同一 base ref → imageGen.generate
   * 4. 落 asset_image 行
   *
   * 双母语：
   *   大众用户："让 AI 在不同分镜画同一角色时不走样"
   *   专业用户：character bible / three-view sheet
   */
  async generateThreeViews(input: {
    assetType: AssetType
    assetId: string
    /** 角色身份描述（必填）— 由调用方从 effective 拼好（同 generateMain） */
    prompt: string
    negativePrompt?: string
    userId?: string | null
    /** 不传 → 自动用 isMain=1 主图作 reference */
    baseImageId?: string | null
  }): Promise<AssetImageEntity[]> {
    this.requireAssetRef(input.assetType, input.assetId)
    if (!input.prompt.trim()) {
      throw new Error('生成多角度参考图需要 prompt（请检查资产 effective 数据）')
    }

    // 1. 解析 base 图
    let baseImage: AssetImageEntity | null = null
    if (input.baseImageId) {
      baseImage = await this.imageRepo.findOne({ where: { id: input.baseImageId } })
    }
    if (!baseImage) {
      // 自动取 isMain=1 主图
      baseImage = await this.imageRepo.findOne({
        where: {
          assetType: input.assetType,
          assetId: input.assetId,
          isMain: 1,
        },
      })
    }
    if (!baseImage) {
      throw new Error('生成多角度参考图需要先有主图（或显式传 baseImageId）')
    }

    const refPaths = [baseImage.imagePath]

    // F1：三视图钉项目「画面生成」模型（与主图 generateMain 同一解析序），
    // 避免自动挑到与主图不同源的模型导致 Q版主图 vs 写实视图的风格分叉。
    // 解析不到（全局 preset / 未配置）→ 传 undefined 走 imageGen 自动挑（既有行为）。
    // F1b：钉住的模型不支持参考图（如 krea2 maxReferenceImages=0）→ 回退同 provider 的 I2I 模型。
    const projectImageModel = await fallbackToReferenceCapableModel(
      await this.resolveProjectImageModel(input.assetType, input.assetId),
    )

    // 2. 三个视角配置（label 为存储 key，promptHint 为给 AI 的视角指令）
    const views: Array<{ label: string; promptHint: string }> = [
      { label: 'front',    promptHint: '正面视角（front view, full body, looking at camera）' },
      { label: '3q_left',  promptHint: '3q_left 三分之四左侧视角（three-quarter left view, full body）' },
      { label: '3q_right', promptHint: '3q_right 三分之四右侧视角（three-quarter right view, full body）' },
    ]

    // 3. 串行调 imageGen 3 次（不并发：避免触发 rate limit + 简化 mock 计数）
    const results: AssetImageEntity[] = []
    for (const v of views) {
      let viewPrompt = `${input.prompt.trim()}，${v.promptHint}`
      let viewNegative = input.negativePrompt
      // F2：角色三视图注入身份保持约束（与派生图路径 gallery-derivation.deriveSingle 同源），
      // 此前只有文字描述+视角提示，模型容易偏离 base 主图的人物身份/画风
      if (input.assetType === 'character') {
        viewPrompt = appendCharacterIdentityPreservation(viewPrompt)
        viewNegative = mergeCharacterIdentityNegative(viewNegative)
      }
      const genResult = await this.imageGen.generate({
        referenceImagePaths: refPaths,
        prompt: viewPrompt,
        negativePrompt: viewNegative,
        label: v.label,
        providerConfigId: projectImageModel?.providerConfigId,
        modelId: projectImageModel?.modelId,
      })

      const entity = this.imageRepo.create({
        id: this.generateId(),
        userId: input.userId ?? null,
        assetType: input.assetType,
        assetId: input.assetId,
        category: 'view',
        label: v.label,
        imagePath: genResult.imagePath,
        thumbnailPath: genResult.thumbnailPath ?? null,
        isMain: 0,
        sortOrder: 0,
        derivedFromImageId: baseImage.id,
        prompt: viewPrompt,
        negativePrompt: viewNegative ?? null,
        width: null,
        height: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Partial<AssetImageEntity>)
      results.push(await this.imageRepo.save(entity))
    }

    return results
  }
}
