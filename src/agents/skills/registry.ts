/**
 * Skill registry（spec 2026-05-09 ep-redesign §3.2 D4 · P-21）
 *
 * 把 Episode Production 的核心能力暴露为外部 Agent 可调用的 Skill。
 * 每个 Skill 内部封装现有 service / IPC handler，外部通过 HTTP API + Bearer token 调用。
 *
 * Skill 元数据（name / description / inputSchema / outputSchema / errors / rateLimitPerHour）。
 *
 * 路由（/api/agents/<skill_name>）由 src/agents/api/router.ts 实现。
 */

import type { DataSource } from 'typeorm'
import { CharacterAssetService } from '@core/modules/episode-production/assets/services/character-asset.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/modules/episode-production/assets/services/main-image-generator.service'
import { GalleryDerivationService } from '@core/modules/episode-production/assets/services/gallery-derivation.service'
import { createGalleryImageGenerator } from '@core/modules/episode-production/assets/services/image-provider-adapter'
import { ReferenceVideoAnalysisService } from '@core/modules/episode-production/reference-video/analysis.service'
import { UserAssetService } from '@core/modules/episode-production/user-asset/user-asset.service'
import { PresetDigitalHumanService } from '@core/modules/episode-production/assets/services/preset-digital-human.service'

export type SkillContext = {
  ds: DataSource
  /** 用户 ID（来自 API key 鉴权） */
  userId: string | null
  /** 文件存储根目录 */
  storageRoot?: string
  projectAssetRoot?: string
  tempDir?: string
}

export interface SkillDefinition<
  TInput = Record<string, unknown>,
  TOutput = Record<string, unknown>,
> {
  name: string
  displayName: string
  description: string
  category: 'asset' | 'narrative' | 'render' | 'compose'
  /** 简化版 JSON schema：UI 文档展示用 */
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  errors: Array<{ code: string; description: string }>
  /** rate limit 估算（单 user_id 每小时调用上限） */
  rateLimitPerHour: number
  /** 实际执行函数 */
  execute(ctx: SkillContext, input: TInput): Promise<TOutput>
}

/**
 * 10 个核心 Skill。每个 skill 简单包装现有 service。
 */
export const ALL_SKILLS: SkillDefinition[] = [
  {
    name: 'character-three-views',
    displayName: '角色三视图',
    description: '为指定角色生成正 / 3q 左 / 3q 右 三视图（character bible 形象组）',
    category: 'asset',
    inputSchema: {
      type: 'object',
      required: ['bindingId', 'prompt'],
      properties: {
        bindingId: { type: 'string', description: 'character_bindings.id' },
        prompt: { type: 'string', description: '角色身份描述' },
        baseImageId: { type: 'string', description: '可选 base 图 id；不传用 isMain=1 主图' },
      },
    },
    outputSchema: { type: 'array', items: { type: 'object' } },
    errors: [
      { code: 'BINDING_NOT_FOUND', description: '角色 binding 不存在' },
      { code: 'NO_MAIN_IMAGE', description: '需要先有主图（或显式传 baseImageId）' },
      { code: 'PROVIDER_UNAVAILABLE', description: 'image gen provider 配置错误' },
    ],
    rateLimitPerHour: 60,
    async execute(ctx, input: any) {
      const imageSvc = new AssetImageService(ctx.ds)
      const svc = new MainImageGeneratorService(imageSvc, createGalleryImageGenerator(), ctx.ds)
      return await svc.generateThreeViews({
        assetType: 'character',
        assetId: input.bindingId,
        prompt: input.prompt,
        baseImageId: input.baseImageId,
        userId: ctx.userId,
      })
    },
  },
  {
    name: 'derive-variant',
    displayName: '派生资产变体',
    description: '基于已有主图派生指定 category / label 的变体图',
    category: 'asset',
    inputSchema: {
      type: 'object',
      required: ['assetType', 'assetId', 'category', 'label'],
      properties: {
        assetType: { type: 'string', enum: ['character', 'location', 'item'] },
        assetId: { type: 'string' },
        category: { type: 'string' },
        label: { type: 'string' },
        baseImageIds: { type: 'array', items: { type: 'string' } },
        additionalPrompt: { type: 'string' },
      },
    },
    outputSchema: { type: 'object' },
    errors: [
      { code: 'BASE_IMAGE_INVALID', description: '基图不属于该 binding' },
      { code: 'GENERATION_FAILED', description: 'image gen 失败' },
    ],
    rateLimitPerHour: 120,
    async execute(ctx, input: any) {
      const imageSvc = new AssetImageService(ctx.ds)
      const svc = new GalleryDerivationService(imageSvc, createGalleryImageGenerator(), ctx.ds)
      return await svc.deriveSingle({
        assetType: input.assetType,
        assetId: input.assetId,
        category: input.category,
        label: input.label,
        baseImageIds: input.baseImageIds,
        additionalPrompt: input.additionalPrompt,
      })
    },
  },
  {
    name: 'set-character-reference-set',
    displayName: '设置角色形象组',
    description: '标记 character_binding 已有图作为生图固定参考集（multi-reference）',
    category: 'asset',
    inputSchema: {
      type: 'object',
      required: ['bindingId', 'imageIds'],
      properties: {
        bindingId: { type: 'string' },
        imageIds: { type: 'array', items: { type: 'string' } },
      },
    },
    outputSchema: { type: 'object' },
    errors: [
      { code: 'BINDING_NOT_FOUND', description: 'character binding 不存在' },
      { code: 'IMAGE_NOT_OWNED', description: 'imageId 不属于该 binding' },
    ],
    rateLimitPerHour: 60,
    async execute(ctx, input: any) {
      const svc = new CharacterAssetService(ctx.ds)
      return await svc.setReferenceSet(input.bindingId, input.imageIds ?? [])
    },
  },
  {
    name: 'analyze-reference-video',
    displayName: '解析参考视频',
    description: '上传参考视频路径 → ffmpeg 抽帧 / scene detection → ParsedShot[]',
    category: 'narrative',
    inputSchema: {
      type: 'object',
      required: ['videoPath'],
      properties: {
        videoPath: { type: 'string' },
        sceneThreshold: { type: 'number', default: 0.3 },
      },
    },
    outputSchema: { type: 'object' },
    errors: [
      { code: 'VIDEO_NOT_FOUND', description: '视频文件不存在' },
      { code: 'FFMPEG_ERROR', description: 'ffmpeg 抽帧失败' },
    ],
    rateLimitPerHour: 10,
    async execute(ctx, input: any) {
      if (!ctx.tempDir) throw new Error('Skill 上下文缺 tempDir')
      const svc = new ReferenceVideoAnalysisService(ctx.ds)
      return await svc.analyze({
        videoPath: input.videoPath,
        tempDir: ctx.tempDir,
        userId: ctx.userId,
        sceneThreshold: input.sceneThreshold,
      })
    },
  },
  {
    name: 'list-user-assets',
    displayName: '列我的资产库',
    description: '返回当前用户的 user_assets（跨项目角色库）',
    category: 'asset',
    inputSchema: {
      type: 'object',
      properties: {
        assetType: { type: 'string', enum: ['character', 'location', 'item'] },
        keyword: { type: 'string' },
      },
    },
    outputSchema: { type: 'array', items: { type: 'object' } },
    errors: [],
    rateLimitPerHour: 600,
    async execute(ctx, input: any) {
      const svc = new UserAssetService(ctx.ds)
      return await svc.listLibrary({
        assetType: input.assetType,
        keyword: input.keyword,
        userId: ctx.userId,
      })
    },
  },
  {
    name: 'add-to-user-library',
    displayName: '加入我的库',
    description: '把项目内 binding 拷贝到跨项目角色库',
    category: 'asset',
    inputSchema: {
      type: 'object',
      required: ['bindingId', 'bindingType'],
      properties: {
        bindingId: { type: 'string' },
        bindingType: { type: 'string', enum: ['character', 'location', 'item'] },
      },
    },
    outputSchema: { type: 'object' },
    errors: [{ code: 'BINDING_NOT_FOUND', description: 'binding 不存在' }],
    rateLimitPerHour: 60,
    async execute(ctx, input: any) {
      if (!ctx.storageRoot) throw new Error('Skill 上下文缺 storageRoot')
      const svc = new UserAssetService(ctx.ds)
      return await svc.addToLibrary({
        bindingId: input.bindingId,
        bindingType: input.bindingType,
        storageRoot: ctx.storageRoot,
        userId: ctx.userId,
      })
    },
  },
  {
    name: 'create-binding-from-library',
    displayName: '从我的库引用到项目',
    description: '把 user_asset 引用到 target project 创建 binding（拷 snapshot + 拷图）',
    category: 'asset',
    inputSchema: {
      type: 'object',
      required: ['userAssetId', 'targetProjectId'],
      properties: {
        userAssetId: { type: 'string' },
        targetProjectId: { type: 'string' },
      },
    },
    outputSchema: { type: 'object' },
    errors: [{ code: 'USER_ASSET_NOT_FOUND', description: 'user_asset 不存在或无权访问' }],
    rateLimitPerHour: 60,
    async execute(ctx, input: any) {
      if (!ctx.projectAssetRoot) throw new Error('Skill 上下文缺 projectAssetRoot')
      const svc = new UserAssetService(ctx.ds)
      return await svc.createFromLibrary({
        userAssetId: input.userAssetId,
        targetProjectId: input.targetProjectId,
        projectAssetRoot: ctx.projectAssetRoot,
        userId: ctx.userId,
      })
    },
  },
  {
    name: 'list-preset-digital-humans',
    displayName: '列内置数字人',
    description: '返回 12 个全局共享的预设角色',
    category: 'asset',
    inputSchema: {
      type: 'object',
      properties: { gender: { type: 'string' } },
    },
    outputSchema: { type: 'array', items: { type: 'object' } },
    errors: [],
    rateLimitPerHour: 600,
    async execute(ctx, input: any) {
      const svc = new PresetDigitalHumanService(ctx.ds)
      return await svc.list({ gender: input.gender })
    },
  },
  {
    name: 'list-skills',
    displayName: '列所有 Skill 元数据',
    description: '返回 ALL_SKILLS 元数据（name / description / inputSchema 等）',
    category: 'compose',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'array' },
    errors: [],
    rateLimitPerHour: 3600,
    async execute() {
      return ALL_SKILLS.map((s) => ({
        name: s.name,
        displayName: s.displayName,
        description: s.description,
        category: s.category,
        inputSchema: s.inputSchema,
        outputSchema: s.outputSchema,
        errors: s.errors,
        rateLimitPerHour: s.rateLimitPerHour,
      }))
    },
  },
]

export function findSkill(name: string): SkillDefinition | null {
  return ALL_SKILLS.find((s) => s.name === name) ?? null
}
