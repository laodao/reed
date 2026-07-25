/**
 * 人像设计服务
 * @module services/portrait.service
 * @description 处理人像设计的核心服务
 */

import * as path from 'path'
import * as fs from 'fs'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { toAssetUrl, resolveAssetPath } from '@core/utils/asset-path'
import { ImageService } from '@core/services/image.service'
import type {
  PortraitProject,
  PortraitCharacter,
  PortraitVariant,
  PortraitAngle,
  PortraitVariantType,
  CreatePortraitProjectRequest,
  UpdatePortraitProjectRequest,
  CreatePortraitCharacterRequest,
  UpdatePortraitCharacterRequest,
  GeneratePortraitRequest,
  GeneratePortraitResponse,
  ChangeClothesRequest,
  ChangeClothesResponse,
  ChangeBackgroundRequest,
  ChangeBackgroundResponse,
  ExportPortraitRequest,
  ExportPortraitResponse,
  GenerateAnglesRequest,
  GenerateAnglesResponse,
  EditImageRequest,
  EditImageResponse,
  GenerateFullBodyRequest,
  GenerateFullBodyResponse,
  EditFaceRequest,
  EditFaceResponse,
  ANGLE_PROMPTS,
  PortraitGender,
  PortraitRace
} from '@shared/types/portrait.types'
import { DEFAULT_PORTRAIT_WIDTH, DEFAULT_PORTRAIT_HEIGHT, FRAMING_PROMPT_SUFFIX } from '@shared/types/portrait.types'
import type { PortraitFraming, PromptTemplateCategory, PortraitGenerationScene } from '@shared/types/portrait.types'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import archiver from 'archiver'

/**
 * 角度提示词映射
 */
const ANGLE_PROMPT_MAP: Record<PortraitAngle, string> = {
  front: 'front view, facing the camera directly',
  left: 'left side view, profile from the left, viewer sees the left side of the face, the left ear and left cheek are visible, facing left direction',
  right: 'right side view, profile from the right, viewer sees the right side of the face, the right ear and right cheek are visible, facing right direction',
  back: 'back view, showing the back of the person, full back visible'
}

/**
 * 全身照片要求的固定后缀
 */
const FULL_BODY_SUFFIX = 'full body shot, standing upright, complete figure from head to toe'

/**
 * 默认负面提示词 - 确保全身照和一致性
 */
const DEFAULT_NEGATIVE_PROMPT = 'cropped, half body, close-up, missing feet, missing head, multiple people, different person, different face, different clothes, different hairstyle, different background, low quality, blurry, distorted'

/**
 * 人物一致性提示词前缀
 */
const CONSISTENCY_PREFIX = 'generate the exact same person as shown in the reference image'

/**
 * 背景一致性提示词
 */
const BACKGROUND_CONSISTENCY_SUFFIX = 'Keep the exact same background as in the reference image, same background color, same background style, no background change'

/**
 * 新方法专用的 prompt 默认配置（spec 2026-07-24 §5.2）：
 * 可通过 buildPortraitPrompt 的 overrides 覆盖，新代码不写死。
 * 注意：上面的 FULL_BODY_SUFFIX / DEFAULT_NEGATIVE_PROMPT / CONSISTENCY_PREFIX 等
 * 旧常量保留不动，现有方法继续使用（后端只新增行为，不改现有行为）。
 */
export const PORTRAIT_PROMPT_DEFAULTS = {
  consistencyPrefix: CONSISTENCY_PREFIX,
  backgroundConsistencySuffix: BACKGROUND_CONSISTENCY_SUFFIX,
  negativePrompt: DEFAULT_NEGATIVE_PROMPT,
}

/**
 * 从角色信息提取基本英文描述
 * 用于多角度生成时提供基本人物特征
 */
function extractBasicCharacterInfo(character: PortraitCharacter): string {
  const parts: string[] = []

  // 性别
  if (character.gender === 'male') {
    parts.push('adult male')
  } else if (character.gender === 'female') {
    parts.push('adult female')
  }

  // 年龄范围
  if (character.age) {
    if (character.age < 20) {
      parts.push('young')
    } else if (character.age < 40) {
      parts.push('adult')
    } else if (character.age < 60) {
      parts.push('middle-aged')
    } else {
      parts.push('senior')
    }
  }

  // 种族
  if (character.race === 'asian') {
    parts.push('Asian')
  } else if (character.race === 'caucasian') {
    parts.push('Caucasian')
  } else if (character.race === 'african') {
    parts.push('African')
  }

  return parts.join(' ')
}

/**
 * 将本地文件路径（绝对或相对）转换为渲染端可加载的 URL。
 * 实际协议由 PathProvider 决定（Electron: local-image://，Web: /assets/...）。
 */
function localPathToUrl(filePath: string): string {
  if (!filePath) return ''
  return toAssetUrl(filePath, 'image')
}

/**
 * 将 URL 转换回本地文件路径（兼容历史数据中带协议的字段）。
 * 业务侧不应再产生带协议的存储值；本函数仅作旧数据读取兼容。
 */
function urlToLocalPath(url: string): string {
  if (!url) return ''
  // local-image://abs 或 local-image:///abs：剥协议
  const m = url.match(/^local-(?:image|video|file):\/\/(\/?.+)$/i)
  if (m) {
    let filePath = m[1]
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\')
    }
    return filePath
  }
  // /assets/<rel>：剥前缀，得到相对路径
  if (url.startsWith('/assets/')) {
    return url.slice('/assets/'.length)
  }
  return url
}

/**
 * 人像设计服务
 */
export class PortraitService {
  // ==================== prompt 拼装（新方法专用入口） ====================

  /**
   * 统一人像 prompt 拼装（spec 2026-07-24 §5.2，新方法专用）。
   * framing 决定取景后缀（默认 full）；overrides 可覆盖任一默认片段。
   */
  static buildPortraitPrompt(params: {
    basePrompt: string
    anglePrompt?: string
    framing?: PortraitFraming
    consistencyPrefix?: boolean
    overrides?: { framingSuffix?: string; prefix?: string; suffix?: string }
  }): string {
    const framing = params.framing ?? 'full'
    const framingSuffix = params.overrides?.framingSuffix ?? FRAMING_PROMPT_SUFFIX[framing]
    const parts: string[] = []
    if (params.overrides?.prefix) parts.push(params.overrides.prefix)
    if (params.consistencyPrefix) parts.push(PORTRAIT_PROMPT_DEFAULTS.consistencyPrefix)
    parts.push(params.basePrompt)
    if (params.anglePrompt) parts.push(params.anglePrompt)
    parts.push(framingSuffix)
    if (params.overrides?.suffix) parts.push(params.overrides.suffix)
    return parts.join(', ')
  }

  // ==================== 提示词模板（spec 2026-07-24 §5.2） ====================

  /** 模板列表（可按分类过滤） */
  static async listPromptTemplates(category?: PromptTemplateCategory) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    const data = await db.portraitPromptTemplates.list(category)
    return { success: true as const, data }
  }

  /** 应用模板：{name}/{gender}/{age} 等占位符替换；未知占位符保留原文 */
  static async applyTemplate(templateId: string, vars: Record<string, string | number>) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    const tpl = await db.portraitPromptTemplates.getById(templateId)
    if (!tpl) return { success: false as const, error: '模板不存在' }
    const data = tpl.content.replace(/\{(\w+)\}/g, (m, key) =>
      vars[key] !== undefined ? String(vars[key]) : m,
    )
    return { success: true as const, data }
  }

  /** 保存模板：无 id 新建（强制非内置）；有 id 更新（内置模板拒绝） */
  static async savePromptTemplate(input: {
    id?: string
    name: string
    category: PromptTemplateCategory
    content: string
    applyTo: PortraitGenerationScene[]
    sortOrder?: number
  }) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    if (input.id) {
      const existing = await db.portraitPromptTemplates.getById(input.id)
      if (!existing) return { success: false as const, error: '模板不存在' }
      if (existing.builtin) return { success: false as const, error: '内置模板不可修改' }
      const data = await db.portraitPromptTemplates.update(input.id, {
        name: input.name,
        category: input.category,
        content: input.content,
        applyTo: input.applyTo,
        sortOrder: input.sortOrder,
      })
      return { success: true as const, data }
    }
    const data = await db.portraitPromptTemplates.create({ ...input, builtin: false })
    return { success: true as const, data }
  }

  /** 删除模板（内置模板拒绝） */
  static async deletePromptTemplate(id: string) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    const existing = await db.portraitPromptTemplates.getById(id)
    if (!existing) return { success: false as const, error: '模板不存在' }
    if (existing.builtin) return { success: false as const, error: '内置模板不可删除' }
    await db.portraitPromptTemplates.remove(id)
    return { success: true as const }
  }

  // ==================== 新版人像设计：生成全身 / 修改面部（spec 2026-07-24） ====================

  /**
   * 读取图片为 base64 data-url（供参考图使用）。
   * DB 中 imagePath 存相对路径，需 resolveAssetPath 拼绝对路径；绝对路径输入兼容旧数据。
   * 与 generateAngles 内既有读取逻辑一致，抽取共用。
   */
  private static readImageAsBase64(imagePath: string): string | null {
    if (!imagePath) return null
    const absPath = resolveAssetPath(imagePath)
    if (!absPath || !fs.existsSync(absPath)) return null
    const imageBuffer = fs.readFileSync(absPath)
    return `data:image/png;base64,${imageBuffer.toString('base64')}`
  }

  /**
   * 基于半身扩展全身（spec 2026-07-24 §5.2）：
   * 以源半身 variant 为首参考图，保持面部一致，产出 type=base / framing=full variant。
   */
  static async generateFullBody(request: GenerateFullBodyRequest): Promise<GenerateFullBodyResponse> {
    const db = getCoreDatabaseManager()
    if (!db.portraitVariants || !db.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const source = await db.portraitVariants.getById(request.sourceVariantId)
      if (!source) return { success: false, error: '源形象不存在' }
      const character = await db.portraitCharacters.getById(request.characterId)
      if (!character) return { success: false, error: '角色不存在' }

      const sourceImage = this.readImageAsBase64(source.imagePath)
      if (!sourceImage) return { success: false, error: '源形象图片读取失败' }

      const userPrompt = request.prompt?.trim() ||
        'same person as reference, consistent face and facial features unchanged, front view, facing camera'
      const prompt = this.buildPortraitPrompt({
        basePrompt: userPrompt,
        framing: 'full',
        overrides: { suffix: 'solid background' },
      })

      const width = request.width ?? (source.config?.width as number) ?? DEFAULT_PORTRAIT_WIDTH
      const height = request.height ?? (source.config?.height as number) ?? DEFAULT_PORTRAIT_HEIGHT
      const strength = request.strength ?? 0.55

      const result = await ImageService.generateImage({
        providerConfigId: request.providerId ?? character.providerId,
        model: request.modelId ?? character.modelId,
        prompt,
        negativePrompt: request.negativePrompt ?? PORTRAIT_PROMPT_DEFAULTS.negativePrompt,
        width,
        height,
        seed: source.config?.seed as number | undefined,
        referenceImages: [sourceImage, ...(request.referenceImages ?? [])],
        strength,
        // design §5.3：人像一致性场景显式关闭提示词改写，保护一致性 prompt
        promptExtend: false,
        skipHistory: true,
      } as Parameters<typeof ImageService.generateImage>[0])

      if (!result.success || !result.images?.[0]) {
        return { success: false, error: result.error || '生成失败' }
      }

      const variant = await db.portraitVariants.create({
        characterId: request.characterId,
        type: 'base',
        framing: 'full',
        parentId: source.id,
        angle: 'front',
        imagePath: result.images[0].filePath || '',
        prompt,
        config: { width, height, seed: source.config?.seed, strength },
      })

      this.sendPortraitEvent({ type: 'generation-completed', characterId: request.characterId } as Parameters<typeof this.sendPortraitEvent>[0])
      return { success: true, variant }
    } catch (error: unknown) {
      console.error('[PortraitService.generateFullBody] 错误:', error)
      return { success: false, error: error instanceof Error ? error.message : '生成失败' }
    }
  }

  /**
   * 保存算法变形结果为面部变体（spec 2026-07-25 面容几何工作室 §F5）。
   * 零 AI 成本：canvas 变形结果直接落盘建 face 变体；原图不变。
   */
  static async saveFaceVariantFromDataUrl(request: {
    characterId: string
    sourceVariantId: string
    dataUrl: string
    faceParams?: Record<string, number>
  }): Promise<{ success: boolean; variant?: PortraitVariant; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.portraitVariants || !db.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const source = await db.portraitVariants.getById(request.sourceVariantId)
      if (!source) return { success: false, error: '源形象不存在' }
      const character = await db.portraitCharacters.getById(request.characterId)
      if (!character) return { success: false, error: '角色不存在' }

      const saved = await ImageService.saveDataUrlImage(request.dataUrl)
      if (!saved.success || !saved.filePath) {
        return { success: false, error: saved.error || '保存图像失败' }
      }

      const variant = await db.portraitVariants.create({
        characterId: request.characterId,
        type: 'face',
        framing: source.framing ?? 'full',
        parentId: source.parentId ?? source.id,
        angle: source.angle,
        imagePath: saved.filePath,
        prompt: `algorithmic face warp: ${JSON.stringify(request.faceParams ?? {})}`,
        config: { ...source.config, faceParams: request.faceParams },
        variantInfo: {
          faceDescription: `算法变形（中庭 ${((request.faceParams?.midface ?? 0) * 100).toFixed(0)}%）`,
        },
      })

      this.sendPortraitEvent({ type: 'generation-completed', characterId: request.characterId } as Parameters<typeof this.sendPortraitEvent>[0])
      return { success: true, variant }
    } catch (error: unknown) {
      console.error('[PortraitService.saveFaceVariantFromDataUrl] 错误:', error)
      return { success: false, error: error instanceof Error ? error.message : '保存失败' }
    }
  }

  /**
   * 只修改面部（spec 2026-07-24 §5.2 D5）：
   * 模板（目标脸型蓝图，占位符解析）+ 指令（微调）叠加，源形象为首参考图，
   * 产出独立 type='face' variant；原图不变，身体/服装/背景不变。
   */
  static async editFace(request: EditFaceRequest): Promise<EditFaceResponse> {
    const db = getCoreDatabaseManager()
    if (!db.portraitVariants || !db.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const source = await db.portraitVariants.getById(request.variantId)
      if (!source) return { success: false, error: '源形象不存在' }
      const character = await db.portraitCharacters.getById(request.characterId)
      if (!character) return { success: false, error: '角色不存在' }

      // 模板解析（可选；模板不存在按无模板继续，不阻断）
      let templateText = ''
      if (request.faceTemplateId) {
        const applied = await this.applyTemplate(request.faceTemplateId, {
          name: character.name,
          gender: character.gender,
          age: character.age,
        })
        if (applied.success && applied.data) templateText = applied.data
      }

      const focusRegion = request.focusRegion ?? 'face'
      const regionWords: Record<string, string> = {
        face: 'modify only the face, keep hair, clothing, body, pose and background exactly the same',
        face_and_hair: 'modify only the face and hair, keep clothing, body, pose and background exactly the same',
        upper: 'modify the upper body, keep pose and background exactly the same',
      }
      // prompt 采用「编辑指令式」措辞（用户反馈：旧措辞 'generate the exact same person'
      // 约束过强，把修改指令中和掉导致零变化）。
      // 结构：编辑意图 → 模板/指令 → 身份保持 → 范围约束。
      const prompt = [
        'edit this portrait photo, apply the following facial changes while keeping the exact same person and identity',
        templateText,
        request.facePrompt?.trim() ?? '',
        regionWords[focusRegion],
      ]
        .filter(Boolean)
        .join(', ')

      const sourceImage = this.readImageAsBase64(source.imagePath)
      if (!sourceImage) return { success: false, error: '源形象图片读取失败' }

      const width = request.width ?? (source.config?.width as number) ?? DEFAULT_PORTRAIT_WIDTH
      const height = request.height ?? (source.config?.height as number) ?? DEFAULT_PORTRAIT_HEIGHT
      const strength = request.strength ?? 0.5

      const result = await ImageService.generateImage({
        providerConfigId: character.providerId,
        model: character.modelId,
        prompt,
        negativePrompt: PORTRAIT_PROMPT_DEFAULTS.negativePrompt,
        width,
        height,
        seed: source.config?.seed as number | undefined,
        referenceImages: [sourceImage, ...(request.referenceImages ?? [])],
        strength,
        focusRegion,
        // design §5.3：人像一致性场景显式关闭提示词改写，保护一致性 prompt
        promptExtend: false,
        skipHistory: true,
      })

      if (!result.success || !result.images?.[0]) {
        return { success: false, error: result.error || '生成失败' }
      }

      const variant = await db.portraitVariants.create({
        characterId: request.characterId,
        type: 'face',
        framing: source.framing ?? 'full',
        parentId: source.parentId ?? source.id,
        angle: source.angle,
        imagePath: result.images[0].filePath || '',
        prompt,
        config: { width, height, seed: source.config?.seed, strength, focusRegion },
        variantInfo: {
          faceDescription: request.facePrompt,
          faceTemplateId: request.faceTemplateId,
        },
      })

      this.sendPortraitEvent({ type: 'generation-completed', characterId: request.characterId } as Parameters<typeof this.sendPortraitEvent>[0])
      return { success: true, variant }
    } catch (error: unknown) {
      console.error('[PortraitService.editFace] 错误:', error)
      return { success: false, error: error instanceof Error ? error.message : '生成失败' }
    }
  }

  // ==================== 项目管理 ====================

  /**
   * 创建项目
   */
  static async createProject(request: CreatePortraitProjectRequest): Promise<{ success: boolean; data?: PortraitProject; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.create(request)
      return { success: true, data: project }
    } catch (error: any) {
      console.error('[PortraitService.createProject] 错误:', error)
      return { success: false, error: error.message || '创建项目失败' }
    }
  }

  /**
   * 获取项目列表
   */
  static async listProjects(page: number = 1, pageSize: number = 20): Promise<{ success: boolean; data?: { projects: PortraitProject[]; total: number }; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const result = await dbManager.portraitProjects.getList(page, pageSize)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[PortraitService.listProjects] 错误:', error)
      return { success: false, error: error.message || '获取列表失败' }
    }
  }

  /**
   * 获取项目详情
   */
  static async getProject(id: string): Promise<{ success: boolean; data?: PortraitProject; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.getById(id)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }
      return { success: true, data: project }
    } catch (error: any) {
      console.error('[PortraitService.getProject] 错误:', error)
      return { success: false, error: error.message || '获取项目失败' }
    }
  }

  /**
   * 删除项目
   */
  static async deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitProjects || !dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取项目下所有角色，删除图片文件
      const characters = await dbManager.portraitCharacters.getByProjectId(id)
      for (const character of characters) {
        const variants = await dbManager.portraitVariants.getByCharacterId(character.id)
        for (const variant of variants) {
          if (variant.imagePath && fs.existsSync(resolveAssetPath(variant.imagePath))) {
            fs.unlinkSync(resolveAssetPath(variant.imagePath))
          }
        }
      }

      // 删除项目（会级联删除角色和变体）
      await dbManager.portraitProjects.delete(id)
      return { success: true }
    } catch (error: any) {
      console.error('[PortraitService.deleteProject] 错误:', error)
      return { success: false, error: error.message || '删除项目失败' }
    }
  }

  /**
   * 更新项目（重命名等）
   */
  static async updateProject(request: UpdatePortraitProjectRequest): Promise<{ success: boolean; data?: PortraitProject; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.update(request)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }
      return { success: true, data: project }
    } catch (error: any) {
      console.error('[PortraitService.updateProject] 错误:', error)
      return { success: false, error: error.message || '更新项目失败' }
    }
  }

  // ==================== 角色管理 ====================

  /**
   * 创建角色
   */
  static async createCharacter(request: CreatePortraitCharacterRequest): Promise<{ success: boolean; data?: PortraitCharacter; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.create(request)
      return { success: true, data: character }
    } catch (error: any) {
      console.error('[PortraitService.createCharacter] 错误:', error)
      return { success: false, error: error.message || '创建角色失败' }
    }
  }

  /**
   * 获取项目的角色列表
   */
  static async listCharacters(projectId: string): Promise<{ success: boolean; data?: PortraitCharacter[]; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const characters = await dbManager.portraitCharacters.getByProjectId(projectId)
      return { success: true, data: characters }
    } catch (error: any) {
      console.error('[PortraitService.listCharacters] 错误:', error)
      return { success: false, error: error.message || '获取角色列表失败' }
    }
  }

  /**
   * 获取角色详情
   */
  static async getCharacter(id: string): Promise<{ success: boolean; data?: PortraitCharacter; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(id)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }
      return { success: true, data: character }
    } catch (error: any) {
      console.error('[PortraitService.getCharacter] 错误:', error)
      return { success: false, error: error.message || '获取角色失败' }
    }
  }

  /**
   * 更新角色
   */
  static async updateCharacter(request: UpdatePortraitCharacterRequest): Promise<{ success: boolean; data?: PortraitCharacter; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.update(request)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }
      return { success: true, data: character }
    } catch (error: any) {
      console.error('[PortraitService.updateCharacter] 错误:', error)
      return { success: false, error: error.message || '更新角色失败' }
    }
  }

  /**
   * 删除角色
   */
  static async deleteCharacter(id: string): Promise<{ success: boolean; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取角色的所有变体，删除图片文件
      const variants = await dbManager.portraitVariants.getByCharacterId(id)
      for (const variant of variants) {
        if (variant.imagePath && fs.existsSync(resolveAssetPath(variant.imagePath))) {
          fs.unlinkSync(resolveAssetPath(variant.imagePath))
        }
      }

      // 删除角色（会级联删除变体）
      await dbManager.portraitCharacters.delete(id)
      return { success: true }
    } catch (error: any) {
      console.error('[PortraitService.deleteCharacter] 错误:', error)
      return { success: false, error: error.message || '删除角色失败' }
    }
  }

  // ==================== 变体管理 ====================

  /**
   * 获取角色的变体列表
   */
  static async listVariants(characterId: string): Promise<{ success: boolean; data?: PortraitVariant[]; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const variants = await dbManager.portraitVariants.getByCharacterId(characterId)
      // 转换图片路径为可访问的 URL
      const result = variants.map(v => ({
        ...v,
        imagePath: localPathToUrl(v.imagePath)
      }))
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[PortraitService.listVariants] 错误:', error)
      return { success: false, error: error.message || '获取变体列表失败' }
    }
  }

  /**
   * 生成人物形象
   */
  static async generatePortrait(    request: GeneratePortraitRequest
  ): Promise<GeneratePortraitResponse> {
    console.log('[PortraitService.generatePortrait] 开始生成人物')

    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取角色信息
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 生成基础种子，确保四角度一致性
      const baseSeed = request.config.seed ?? Math.floor(Math.random() * 2147483647)

      // 为每个角度生成图像
      const angles = request.config.angles
      const variants: PortraitVariant[] = []
      const __pp = getPathProvider()
      const userDataPath = __pp.getDataPath()

      // 记录失败的角度
      const failedAngles: string[] = []
      const failedErrors: string[] = []

      // 发送进度事件
      this.sendPortraitEvent({
        type: 'generation-started',
        characterId: character.id,
        angles: angles
      })

      for (let i = 0; i < angles.length; i++) {
        const angle = angles[i]

        // 发送进度
        this.sendPortraitEvent({
          type: 'generation-progress',
          characterId: character.id,
          angle: angle,
          progress: (i / angles.length) * 100
        })

        // 构建角度特定的提示词（纯英文避免内容审核）
        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        // framing 可选参数（spec 2026-07-24 §5.2）：不传时保持现状（full 后缀）；
        // 传入时走 buildPortraitPrompt（新工作台显式传 'half'）
        const fullPrompt = request.framing
          ? this.buildPortraitPrompt({
              basePrompt: request.prompt,
              anglePrompt,
              framing: request.framing,
              overrides: { suffix: 'consistent character, same person, solid background' },
            })
          : `${request.prompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, consistent character, same person, solid background`
        // 组合负面提示词，确保排除半身照
        const fullNegativePrompt = request.negativePrompt
          ? `${request.negativePrompt}, ${DEFAULT_NEGATIVE_PROMPT}`
          : DEFAULT_NEGATIVE_PROMPT

        // 调用图像生成
        const imageWidth = request.config.width || 1024
        const imageHeight = request.config.height || 1024
        const imageResult = await ImageService.generateImage({
          providerConfigId: request.providerId,
          model: request.modelId,
          prompt: fullPrompt,
          negativePrompt: fullNegativePrompt,
          width: imageWidth,
          height: imageHeight,
          seed: baseSeed,
          // 可选质量参数（additive，不传 = 现状行为；透传给支持 quality 的 provider）
          quality: request.config.quality,
          referenceImages: request.referenceImages?.length ? request.referenceImages : undefined,
          // design §5.3：带参考图的一致性生成场景显式关闭提示词改写
          ...(request.referenceImages?.length ? { promptExtend: false } : {}),
          skipHistory: true
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 生成角度 ${angle} 失败:`, imageResult.error)
          failedAngles.push(angle)
          failedErrors.push(`角度 ${angle}: ${imageResult.error || '生成失败'}`)
          continue
        }

        // 保存变体记录
        const image = imageResult.images[0]
        const actualImagePath = (image.filePath || '')

        const variant = await dbManager.portraitVariants.create({
          characterId: character.id,
          type: 'base',
          angle: angle,
          framing: request.framing ?? 'full',
          imagePath: actualImagePath,
          prompt: fullPrompt,
          config: {
            seed: baseSeed,
            width: imageWidth,
            height: imageHeight
          }
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      // 检查是否所有角度都失败
      if (variants.length === 0) {
        const errorMessage = failedErrors.length > 0
          ? `图像生成失败: ${failedErrors.join('; ')}`
          : '图像生成失败，请检查模型配置或网络连接'
        return {
          success: false,
          error: errorMessage
        }
      }

      // 发送完成事件
      this.sendPortraitEvent({
        type: 'generation-completed',
        characterId: character.id,
        variants: variants
      })

      // 如果部分成功，返回成功但有警告
      if (failedAngles.length > 0) {
        return {
          success: true,
          characterId: character.id,
          variants: variants,
          warning: `部分角度生成失败: ${failedErrors.join('; ')}`
        }
      }

      return {
        success: true,
        characterId: character.id,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.generatePortrait] 错误:', error)
      return { success: false, error: error.message || '生成失败' }
    }
  }

  /**
   * 换衣功能
   */
  static async changeClothes(    request: ChangeClothesRequest
  ): Promise<ChangeClothesResponse> {
    console.log('[PortraitService.changeClothes] 开始换衣')

    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 获取基础变体作为参考
      const baseVariants = await dbManager.portraitVariants.getBaseVariants(request.characterId)
      if (baseVariants.length === 0) {
        return { success: false, error: '没有基础形象可参考' }
      }

      const variants: PortraitVariant[] = []

      // 先生成正面图，获取其 id 作为其他角度的 parentId
      let frontVariantId: string | undefined
      const frontAngle = request.angles.find(a => a === 'front')
      const otherAngles = request.angles.filter(a => a !== 'front')

      // 1. 先生成正面图
      if (frontAngle) {
        const baseVariant = baseVariants.find(v => v.angle === 'front')
        if (baseVariant) {
          const anglePrompt = ANGLE_PROMPT_MAP['front']
          let fullPrompt = `${character.prompt}, wearing ${request.clothesDescription}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, same person, solid background`
          // 补充提示词（spec 2026-07-24 D5b，可选；不传 = 现状行为）
          if (request.prompt?.trim()) fullPrompt += `, ${request.prompt.trim()}`

          let referenceImageBase64: string | undefined = undefined
          if (request.referenceImage) {
            referenceImageBase64 = request.referenceImage
          } else if (baseVariant.imagePath && fs.existsSync(resolveAssetPath(baseVariant.imagePath))) {
            const imageBuffer = fs.readFileSync(resolveAssetPath(baseVariant.imagePath))
            referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
          }
          // 多参考图（D5b）：base 参考置首，追加参考随后；空则 undefined（现状行为）
          const mergedRefs = [
            ...(referenceImageBase64 ? [referenceImageBase64] : []),
            ...(request.referenceImages ?? []),
          ]

          const imageWidth = request.width || baseVariant.config?.width || DEFAULT_PORTRAIT_WIDTH
          const imageHeight = request.height || baseVariant.config?.height || DEFAULT_PORTRAIT_HEIGHT

          const imageResult = await ImageService.generateImage({
            providerConfigId: character.providerId,
            model: character.modelId,
            prompt: fullPrompt,
            negativePrompt: DEFAULT_NEGATIVE_PROMPT,
            width: imageWidth,
            height: imageHeight,
            seed: baseVariant.config?.seed,
            referenceImages: mergedRefs.length > 0 ? mergedRefs : undefined,
            // design §5.3：一致性场景关闭提示词改写
            promptExtend: false,
            skipHistory: true
          })

          if (imageResult.success && imageResult.images?.length) {
            const image = imageResult.images[0]
            const variant = await dbManager.portraitVariants.create({
              characterId: request.characterId,
              type: 'clothes',
              parentId: request.variantId || baseVariant.id,
              angle: 'front',
              imagePath: (image.filePath || ''),
              prompt: fullPrompt,
              config: { ...baseVariant.config, width: imageWidth, height: imageHeight },
              variantInfo: {
                clothesDescription: request.clothesDescription
              }
            })
            frontVariantId = variant.id
            variants.push({
              ...variant,
              imagePath: localPathToUrl(variant.imagePath)
            })
          }
        }
      }

      // 2. 生成其他角度，parentId 指向正面图的 id
      for (const angle of otherAngles) {
        const baseVariant = baseVariants.find(v => v.angle === angle)
        if (!baseVariant) continue

        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        let fullPrompt = `${character.prompt}, wearing ${request.clothesDescription}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, same person, solid background`
        // 补充提示词（spec 2026-07-24 D5b，可选；不传 = 现状行为）
        if (request.prompt?.trim()) fullPrompt += `, ${request.prompt.trim()}`

        let referenceImageBase64: string | undefined = undefined
        if (request.referenceImage) {
          referenceImageBase64 = request.referenceImage
        } else if (baseVariant.imagePath && fs.existsSync(resolveAssetPath(baseVariant.imagePath))) {
          const imageBuffer = fs.readFileSync(resolveAssetPath(baseVariant.imagePath))
          referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
        }
        // 多参考图（D5b）：base 参考置首，追加参考随后；空则 undefined（现状行为）
        const mergedRefs = [
          ...(referenceImageBase64 ? [referenceImageBase64] : []),
          ...(request.referenceImages ?? []),
        ]

        const imageWidth = request.width || baseVariant.config?.width || DEFAULT_PORTRAIT_WIDTH
        const imageHeight = request.height || baseVariant.config?.height || DEFAULT_PORTRAIT_HEIGHT

        const imageResult = await ImageService.generateImage({
          providerConfigId: character.providerId,
          model: character.modelId,
          prompt: fullPrompt,
          negativePrompt: DEFAULT_NEGATIVE_PROMPT,
          width: imageWidth,
          height: imageHeight,
          seed: baseVariant.config?.seed,
          referenceImages: mergedRefs.length > 0 ? mergedRefs : undefined,
          // design §5.3：一致性场景关闭提示词改写
          promptExtend: false,
          skipHistory: true
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 换衣角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          characterId: request.characterId,
          type: 'clothes',
          parentId: frontVariantId || request.variantId || baseVariant.id, // 优先使用正面图 id
          angle: angle,
          imagePath: (image.filePath || ''),
          prompt: fullPrompt,
          config: { ...baseVariant.config, width: imageWidth, height: imageHeight },
          variantInfo: {
            clothesDescription: request.clothesDescription
          }
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      return {
        success: true,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.changeClothes] 错误:', error)
      return { success: false, error: error.message || '换衣失败' }
    }
  }

  /**
   * 换背景功能
   */
  static async changeBackground(    request: ChangeBackgroundRequest
  ): Promise<ChangeBackgroundResponse> {
    console.log('[PortraitService.changeBackground] 开始换背景')

    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 获取基础变体作为参考
      const baseVariants = await dbManager.portraitVariants.getBaseVariants(request.characterId)
      if (baseVariants.length === 0) {
        return { success: false, error: '没有基础形象可参考' }
      }

      // 构建背景描述
      let backgroundDescription = ''
      let referenceImageBase64: string | undefined = undefined

      if (request.backgroundType === 'solid' && request.backgroundColor) {
        backgroundDescription = `solid ${request.backgroundColor} background`
      } else if (request.backgroundType === 'preset' && request.presetScene) {
        const presetNames: Record<string, string> = {
          indoor: 'indoor environment',
          outdoor: 'outdoor nature scene',
          office: 'professional office',
          studio: 'professional photography studio',
          gallery: 'art gallery',
          street: 'city street',
          beach: 'beach scene',
          mountain: 'mountain landscape'
        }
        backgroundDescription = presetNames[request.presetScene] || request.presetScene
      } else if (request.backgroundType === 'custom' && request.customDescription) {
        backgroundDescription = request.customDescription
      } else if (request.backgroundType === 'image' && request.backgroundImage) {
        backgroundDescription = 'custom background from uploaded image'
        referenceImageBase64 = request.backgroundImage
      }

      const variants: PortraitVariant[] = []

      // 先生成正面图，获取其 id 作为其他角度的 parentId
      let frontVariantId: string | undefined
      const frontAngle = request.angles.find(a => a === 'front')
      const otherAngles = request.angles.filter(a => a !== 'front')

      // 1. 先生成正面图
      if (frontAngle) {
        const baseVariant = baseVariants.find(v => v.angle === 'front')
        if (baseVariant) {
          const anglePrompt = ANGLE_PROMPT_MAP['front']
          let fullPrompt = `${character.prompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, same person, ${backgroundDescription}`
          // 补充提示词（spec 2026-07-24 D5b，可选；不传 = 现状行为）
          if (request.prompt?.trim()) fullPrompt += `, ${request.prompt.trim()}`

          let refImage = referenceImageBase64
          if (!refImage && baseVariant.imagePath && fs.existsSync(resolveAssetPath(baseVariant.imagePath))) {
            const imageBuffer = fs.readFileSync(resolveAssetPath(baseVariant.imagePath))
            refImage = `data:image/png;base64,${imageBuffer.toString('base64')}`
          }
          // 多参考图（D5b）：base 参考置首，追加参考随后；空则 undefined（现状行为）
          const mergedRefs = [...(refImage ? [refImage] : []), ...(request.referenceImages ?? [])]

          const imageWidth = request.width || baseVariant.config?.width || DEFAULT_PORTRAIT_WIDTH
          const imageHeight = request.height || baseVariant.config?.height || DEFAULT_PORTRAIT_HEIGHT

          const imageResult = await ImageService.generateImage({
            providerConfigId: character.providerId,
            model: character.modelId,
            prompt: fullPrompt,
            negativePrompt: DEFAULT_NEGATIVE_PROMPT,
            width: imageWidth,
            height: imageHeight,
            seed: baseVariant.config?.seed,
            referenceImages: mergedRefs.length > 0 ? mergedRefs : undefined,
            // design §5.3：一致性场景关闭提示词改写
            promptExtend: false,
            skipHistory: true
          })

          if (imageResult.success && imageResult.images?.length) {
            const image = imageResult.images[0]
            const variant = await dbManager.portraitVariants.create({
              characterId: request.characterId,
              type: 'background',
              parentId: request.variantId || baseVariant.id,
              angle: 'front',
              imagePath: (image.filePath || ''),
              prompt: fullPrompt,
              config: { ...baseVariant.config, width: imageWidth, height: imageHeight },
              variantInfo: {
                backgroundDescription: backgroundDescription,
                backgroundType: request.backgroundType,
                backgroundColor: request.backgroundColor,
                presetScene: request.presetScene
              }
            })
            frontVariantId = variant.id
            variants.push({
              ...variant,
              imagePath: localPathToUrl(variant.imagePath)
            })
          }
        }
      }

      // 2. 生成其他角度，parentId 指向正面图的 id
      for (const angle of otherAngles) {
        const baseVariant = baseVariants.find(v => v.angle === angle)
        if (!baseVariant) continue

        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        let fullPrompt = `${character.prompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, same person, ${backgroundDescription}`
        // 补充提示词（spec 2026-07-24 D5b，可选；不传 = 现状行为）
        if (request.prompt?.trim()) fullPrompt += `, ${request.prompt.trim()}`

        let refImage = referenceImageBase64
        if (!refImage && baseVariant.imagePath && fs.existsSync(resolveAssetPath(baseVariant.imagePath))) {
          const imageBuffer = fs.readFileSync(resolveAssetPath(baseVariant.imagePath))
          refImage = `data:image/png;base64,${imageBuffer.toString('base64')}`
        }
        // 多参考图（D5b）：base 参考置首，追加参考随后；空则 undefined（现状行为）
        const mergedRefs = [...(refImage ? [refImage] : []), ...(request.referenceImages ?? [])]

        const imageWidth = request.width || baseVariant.config?.width || DEFAULT_PORTRAIT_WIDTH
        const imageHeight = request.height || baseVariant.config?.height || DEFAULT_PORTRAIT_HEIGHT

        const imageResult = await ImageService.generateImage({
          providerConfigId: character.providerId,
          model: character.modelId,
          prompt: fullPrompt,
          negativePrompt: DEFAULT_NEGATIVE_PROMPT,
          width: imageWidth,
          height: imageHeight,
          seed: baseVariant.config?.seed,
          referenceImages: mergedRefs.length > 0 ? mergedRefs : undefined,
          // design §5.3：一致性场景关闭提示词改写
          promptExtend: false,
          skipHistory: true
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 换背景角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          characterId: request.characterId,
          type: 'background',
          parentId: frontVariantId || request.variantId || baseVariant.id, // 优先使用正面图 id
          angle: angle,
          imagePath: (image.filePath || ''),
          prompt: fullPrompt,
          config: { ...baseVariant.config, width: imageWidth, height: imageHeight },
          variantInfo: {
            backgroundDescription: backgroundDescription,
            backgroundType: request.backgroundType,
            backgroundColor: request.backgroundColor,
            presetScene: request.presetScene
          }
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      return {
        success: true,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.changeBackground] 错误:', error)
      return { success: false, error: error.message || '换背景失败' }
    }
  }

  /**
   * 删除变体
   */
  static async deleteVariant(id: string): Promise<{ success: boolean; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const variant = await dbManager.portraitVariants.getById(id)
      if (variant?.imagePath && fs.existsSync(resolveAssetPath(variant.imagePath))) {
        fs.unlinkSync(resolveAssetPath(variant.imagePath))
      }

      await dbManager.portraitVariants.delete(id)
      return { success: true }
    } catch (error: any) {
      console.error('[PortraitService.deleteVariant] 错误:', error)
      return { success: false, error: error.message || '删除失败' }
    }
  }

  /**
   * 生成多角度（第二步）
   */
  static async generateAngles(    request: GenerateAnglesRequest
  ): Promise<GenerateAnglesResponse> {
    console.log('[PortraitService.generateAngles] 开始生成多角度')

    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 获取参考变体
      let referenceVariant: PortraitVariant | null = null
      if (request.variantId) {
        console.log('[PortraitService.generateAngles] 收到 variantId:', request.variantId)
        referenceVariant = await dbManager.portraitVariants.getById(request.variantId)
      }
      if (!referenceVariant) {
        referenceVariant = await dbManager.portraitVariants.getFrontVariant(request.characterId)
        console.log('[PortraitService.generateAngles] 使用正面基础变体作为参考')
      }

      if (!referenceVariant) {
        return { success: false, error: '没有正面形象可参考，请先生成正面形象' }
      }

      const variants: PortraitVariant[] = []

      // 读取参考图文件 - 这是最重要的参考
      // DB 中 imagePath 存的是相对路径（如 images/2026/05/01/xxx.png），需要 resolveAssetPath
      // 拼成绝对路径才能 fs.readFileSync。绝对路径输入也兼容（旧数据）。
      let referenceImageBase64: string | undefined = undefined
      const refRel = referenceVariant.imagePath
      const referenceImagePath = refRel ? resolveAssetPath(refRel) : ''
      if (referenceImagePath && fs.existsSync(referenceImagePath)) {
        const imageBuffer = fs.readFileSync(referenceImagePath)
        referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
        console.log('[PortraitService.generateAngles] 已加载参考图作为参考图像:', referenceImagePath)
      } else {
        console.error('[PortraitService.generateAngles] 参考图不存在:', refRel, '→', referenceImagePath)
        return { success: false, error: '无法读取参考图片' }
      }

      // 发送进度事件
      this.sendPortraitEvent({
        type: 'generation-started',
        characterId: request.characterId,
        angles: request.angles
      })

      // 记录失败的角度
      const failedAngles: string[] = []
      const failedErrors: string[] = []

      // 提取基本人物特征（用于辅助描述，避免完全无特征）
      const basicInfo = extractBasicCharacterInfo(character)
      console.log('[PortraitService.generateAngles] 基本人物特征:', basicInfo)

      // 最大重试次数
      const MAX_RETRIES = 2

      for (let i = 0; i < request.angles.length; i++) {
        const angle = request.angles[i]

        this.sendPortraitEvent({
          type: 'generation-progress',
          characterId: request.characterId,
          angle: angle,
          progress: (i / request.angles.length) * 100
        })

        // 角度专用提示词
        const anglePrompt = ANGLE_PROMPT_MAP[angle]

        // 构建完整提示词：
        // 1. 一致性要求（最重要的）
        // 2. 基本人物特征（辅助模型理解）
        // 3. 角度要求
        // 4. 全身照要求
        // 5. 背景一致性（确保背景不变）
        // 6. 人物特征一致性
        let fullPrompt = `${CONSISTENCY_PREFIX}. ${basicInfo}. ${anglePrompt}. ${FULL_BODY_SUFFIX}. ${BACKGROUND_CONSISTENCY_SUFFIX}. Keep the same facial features, hairstyle, clothing, and posture as in the reference image.`
        // 追加提示词（可选；用户可用于加强背景/质感约束，如 clean solid background）
        if (request.prompt?.trim()) fullPrompt += `, ${request.prompt.trim()}`
        // 追加反向提示词（可选；置于默认反向词前，用户可用于抑制噪点）
        const fullNegativePrompt = request.negativePrompt?.trim()
          ? `${request.negativePrompt.trim()}, ${DEFAULT_NEGATIVE_PROMPT}`
          : DEFAULT_NEGATIVE_PROMPT

        console.log(`[PortraitService.generateAngles] 角度 ${angle} 提示词:`, fullPrompt)

        const imageWidth = request.width || referenceVariant.config?.width || DEFAULT_PORTRAIT_WIDTH
        const imageHeight = request.height || referenceVariant.config?.height || DEFAULT_PORTRAIT_HEIGHT

        // 添加重试机制
        let imageResult: any = null
        let retryCount = 0
        let lastError = ''

        while (retryCount <= MAX_RETRIES) {
          imageResult = await ImageService.generateImage({
            providerConfigId: character.providerId,
            model: character.modelId,
            prompt: fullPrompt,
            negativePrompt: fullNegativePrompt,
            width: imageWidth,
            height: imageHeight,
            seed: referenceVariant.config?.seed,
            referenceImage: referenceImageBase64,
            // design §5.3：多角度是一致性场景，显式关闭提示词改写，
            // 防止 "keep the exact same background/facial features" 约束被 LLM 稀释
            // （用户反馈：全身多角度背景变化、噪点多，主因即此）
            promptExtend: false,
            skipHistory: true
          })

          if (imageResult.success && imageResult.images?.length) {
            break  // 成功则跳出重试循环
          }

          lastError = imageResult.error || '生成失败'
          retryCount++
          if (retryCount <= MAX_RETRIES) {
            console.log(`[PortraitService] 角度 ${angle} 第 ${retryCount} 次生成失败，准备重试...`)
            // 等待一段时间再重试
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }

        if (!imageResult?.success || !imageResult?.images?.length) {
          const errorMsg = lastError || '生成失败'
          console.error(`[PortraitService] 角度 ${angle} 经过 ${MAX_RETRIES} 次重试后仍失败:`, errorMsg)
          failedAngles.push(angle)
          failedErrors.push(`角度 ${angle}: ${errorMsg}`)
          continue
        }

        const image = imageResult.images[0]
        const imagePath = (image.filePath || '')

        const variant = await dbManager.portraitVariants.create({
          characterId: request.characterId,
          type: referenceVariant.type,
          parentId: referenceVariant.id,
          angle: angle,
          imagePath: imagePath,
          prompt: fullPrompt,
          config: { ...referenceVariant.config, width: imageWidth, height: imageHeight },
          variantInfo: referenceVariant.variantInfo
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })

        console.log(`[PortraitService.generateAngles] 角度 ${angle} 生成成功`)
      }

      // 检查是否所有角度都失败
      if (variants.length === 0 && failedAngles.length > 0) {
        return {
          success: false,
          error: `所有角度生成失败: ${failedErrors.join('; ')}`
        }
      }

      this.sendPortraitEvent({
        type: 'generation-completed',
        characterId: request.characterId,
        variants: variants
      })

      if (failedAngles.length > 0) {
        return {
          success: true,
          variants: variants,
          warning: `部分角度生成失败: ${failedErrors.join('; ')}`
        }
      }

      return {
        success: true,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.generateAngles] 错误:', error)
      return { success: false, error: error.message || '生成失败' }
    }
  }

  /**
   * 编辑图像
   */
  static async editImage(    request: EditImageRequest
  ): Promise<EditImageResponse> {
    console.log('[PortraitService.editImage] 开始编辑图像')

    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      const variant = await dbManager.portraitVariants.getById(request.variantId)
      if (!variant) {
        return { success: false, error: '变体不存在' }
      }

      // 读取原图作为参考
      const originalImagePath = variant.imagePath
      let referenceImageBase64: string | undefined = undefined
      if (originalImagePath && fs.existsSync(originalImagePath)) {
        const imageBuffer = fs.readFileSync(originalImagePath)
        referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
      }

      const basePrompt = character.prompt || ''
      // 编辑提示词：在原有基础上添加编辑指令（纯英文避免内容审核）
      const editPrompt = `${basePrompt}, ${request.editPrompt}, same person, ${FULL_BODY_SUFFIX}, solid background`

      const imageWidth = request.width || variant.config?.width || DEFAULT_PORTRAIT_WIDTH
      const imageHeight = request.height || variant.config?.height || DEFAULT_PORTRAIT_HEIGHT

      const imageResult = await ImageService.generateImage({
        providerConfigId: character.providerId,
        model: character.modelId,
        prompt: editPrompt,
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        width: imageWidth,
        height: imageHeight,
        seed: variant.config?.seed,
        referenceImage: referenceImageBase64,
        skipHistory: true
      })

      if (!imageResult.success || !imageResult.images?.length) {
        return { success: false, error: imageResult.error || '编辑失败' }
      }

      const image = imageResult.images[0]
      const updatedVariant = await dbManager.portraitVariants.update(variant.id, {
        imagePath: (image.filePath || ''),
        prompt: editPrompt,
        // 回写实际生效尺寸到 config（simple-json 整列替换，必须展开保留 seed 等字段）。
        // 修复：此前 update 不写 config，导致用户改尺寸后下次编辑丢失所选尺寸。
        config: { ...variant.config, width: imageWidth, height: imageHeight }
      })

      if (!updatedVariant) {
        return { success: false, error: '更新变体失败' }
      }

      return {
        success: true,
        variant: {
          ...updatedVariant,
          imagePath: localPathToUrl(updatedVariant.imagePath)
        }
      }
    } catch (error: any) {
      console.error('[PortraitService.editImage] 错误:', error)
      return { success: false, error: error.message || '编辑失败' }
    }
  }

  /**
   * 导出人物形象
   */
  static async exportPortraits(request: ExportPortraitRequest): Promise<ExportPortraitResponse> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      let variants: PortraitVariant[]
      if (request.variantIds && request.variantIds.length > 0) {
        variants = []
        for (const id of request.variantIds) {
          const variant = await dbManager.portraitVariants.getById(id)
          if (variant) variants.push(variant)
        }
      } else {
        variants = await dbManager.portraitVariants.getByCharacterId(request.characterId)
      }

      if (variants.length === 0) {
        return { success: false, error: '没有可导出的图片' }
      }

      const __pp = getPathProvider()
      const exportDir = path.join(__pp.getDataPath(), 'exports', 'portraits')

      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

      if (request.type === 'single') {
        const variant = variants[0]
        const localImagePath = urlToLocalPath(variant.imagePath)
        if (!fs.existsSync(localImagePath)) {
          return { success: false, error: `图片文件不存在: ${localImagePath}` }
        }
        const ext = path.extname(localImagePath) || '.png'
        const fileName = `portrait_${variant.angle}_${timestamp}${ext}`
        const outputPath = path.join(exportDir, fileName)
        fs.copyFileSync(localImagePath, outputPath)
        return { success: true, filePath: outputPath }
      } else if (request.type === 'grid') {
        // 拼接图导出
        const localPaths: { path: string; angle: string }[] = []

        for (const variant of variants) {
          const localPath = urlToLocalPath(variant.imagePath)
          if (fs.existsSync(localPath)) {
            localPaths.push({ path: localPath, angle: variant.angle })
          }
        }

        if (localPaths.length === 0) {
          return { success: false, error: '没有有效的图片文件' }
        }

        // 加载所有图片
        const images = await Promise.all(
          localPaths.map(async (item) => ({
            buffer: await sharp(item.path).png().toBuffer(),
            metadata: await sharp(item.path).metadata(),
            angle: item.angle
          }))
        )

        // 计算拼接后的尺寸
        const gridLayout = request.gridLayout || 'horizontal'
        let outputWidth = 0
        let outputHeight = 0

        if (gridLayout === 'horizontal') {
          outputWidth = images.reduce((sum, img) => sum + (img.metadata.width || 0), 0)
          outputHeight = Math.max(...images.map(img => img.metadata.height || 0))
        } else if (gridLayout === 'vertical') {
          outputWidth = Math.max(...images.map(img => img.metadata.width || 0))
          outputHeight = images.reduce((sum, img) => sum + (img.metadata.height || 0), 0)
        } else {
          // 2x2 网格
          const cols = 2
          const rows = Math.ceil(images.length / cols)
          const maxWidth = Math.max(...images.map(img => img.metadata.width || 0))
          const maxHeight = Math.max(...images.map(img => img.metadata.height || 0))
          outputWidth = maxWidth * cols
          outputHeight = maxHeight * rows
        }

        // 创建拼接图
        const compositeOps = []
        let x = 0
        let y = 0
        let col = 0

        for (const img of images) {
          compositeOps.push({
            input: img.buffer,
            left: x,
            top: y
          })

          if (gridLayout === 'horizontal') {
            x += img.metadata.width || 0
          } else if (gridLayout === 'vertical') {
            y += img.metadata.height || 0
          } else {
            // 2x2 网格
            col++
            if (col >= 2) {
              col = 0
              x = 0
              y += img.metadata.height || 0
            } else {
              x += img.metadata.width || 0
            }
          }
        }

        const outputPath = path.join(exportDir, `portrait_grid_${timestamp}.png`)
        await sharp({
          create: {
            width: outputWidth,
            height: outputHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          }
        })
          .composite(compositeOps)
          .png()
          .toFile(outputPath)

        return { success: true, filePath: outputPath }
      } else {
        const fileName = `portrait_export_${timestamp}.zip`
        const outputPath = path.join(exportDir, fileName)

        return new Promise((resolve) => {
          const output = fs.createWriteStream(outputPath)
          const archive = archiver('zip', { zlib: { level: 9 } })

          output.on('close', () => {
            resolve({ success: true, filePath: outputPath })
          })

          archive.on('error', (err: Error) => {
            resolve({ success: false, error: err.message })
          })

          archive.pipe(output)

          // 按套图分组 - 与前端 variantGroups 逻辑一致
          // 基础形象所有角度归到 'base' 组，换衣/换背景正面图用自己 id，其他角度用 parentId
          const groups: Record<string, { variants: PortraitVariant[]; createdAt: Date }> = {}

          variants.forEach(v => {
            let groupKey: string

            if (v.type === 'base') {
              // 基础形象所有角度归到同一组
              groupKey = 'base'
            } else if (v.angle === 'front') {
              // 换衣/换背景的正面图用自己 id 作为组标识
              groupKey = v.id
            } else {
              // 其他角度用 parentId
              groupKey = v.parentId || v.id
            }

            if (!groups[groupKey]) {
              groups[groupKey] = { variants: [], createdAt: new Date(v.createdAt || 0) }
            }
            groups[groupKey].variants.push(v)

            // 记录最早的创建时间
            const variantDate = new Date(v.createdAt || 0)
            if (variantDate < groups[groupKey].createdAt) {
              groups[groupKey].createdAt = variantDate
            }
          })

          // 排序：基础形象在前，其他按创建时间
          const sortedGroups = Object.entries(groups).sort((a, b) => {
            const typeA = a[1].variants[0]?.type || 'base'
            const typeB = b[1].variants[0]?.type || 'base'
            if (typeA === 'base' && typeB !== 'base') return -1
            if (typeA !== 'base' && typeB === 'base') return 1
            return a[1].createdAt.getTime() - b[1].createdAt.getTime()
          })

          // 添加到压缩包，每个套图一个子文件夹，统一命名为"套图"
          sortedGroups.forEach(([_, group], index) => {
            const folderName = `${String(index + 1).padStart(2, '0')}_套图`
            group.variants.forEach((variant) => {
              const localImagePath = urlToLocalPath(variant.imagePath)
              if (fs.existsSync(localImagePath)) {
                const ext = path.extname(localImagePath) || '.png'
                archive.file(localImagePath, { name: `${folderName}/${variant.angle}${ext}` })
              }
            })
          })

          archive.finalize()
        })
      }
    } catch (error: any) {
      console.error('[PortraitService.exportPortraits] 错误:', error)
      return { success: false, error: error.message || '导出失败' }
    }
  }

  /**
   * 发送人像设计事件到渲染进程
   */
  private static sendPortraitEvent(
    event: {
      type: string
      [key: string]: any
    }
  ): void {
    getEventEmitter().emit('portrait:generation-event', event)
  }
}