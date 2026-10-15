/**
 * episode-production · 剧集管理 · IPC handler
 * @module core/packs/episode-production/handlers/episode.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import * as path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { UpdateVideoEpisodeData, EpAiGenerateTextRequest, EpBatchCreateEpisodesRequest, EpBatchIdentifyEntitiesRequest } from '@shared/types/episode-production'
import { StoryToVideoAIService } from '@core/packs/episode-production/services/story-to-video-ai.service'
import { generateStoryText } from '@core/platform/episode-production/narrative/ai/story-text-generator'
import { EpisodeAutoBindingService } from '@core/platform/episode-production/auto-binding/episode-auto-binding.service'
import { UploadedEntityService } from '@core/platform/episode-production/auto-binding/uploaded-entity.service'
import { analyzeScriptToEpisodes } from '@core/platform/episode-production/narrative/services/script-splitter.service'
import { EpisodeReadinessService } from '@core/platform/episode-production/services/readiness.service'
import { QualityCheckService } from '@core/platform/episode-production/services/quality-check.service'
import { extractTextFromFile, inferFileType } from '@core/utils/extract-text'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron
function loadElectron(): { BrowserWindow?: any; dialog?: any } {
  if (!isElectron) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const e = require('electron')
  return { BrowserWindow: e.BrowserWindow, dialog: e.dialog }
}

export function registerEpisodeHandlers(): void {
  // ==================== 剧集管理 ====================
  ipcBridge.handle('ep:list-episodes', handleListEpisodes)
  ipcBridge.handle('ep:get-episode', handleGetEpisode)
  ipcBridge.handle('ep:create-episode', handleCreateEpisode)
  ipcBridge.handle('ep:update-episode', handleUpdateEpisode)
  ipcBridge.handle('ep:delete-episode', handleDeleteEpisode)
  // FU4-1 ① 内容 stage AI 识别要素
  ipcBridge.handle('ep:identify-uploaded-entities', handleIdentifyEntities)
  // 「AI 写剧本」：提示词 + 故事背景 → 生成故事原文（前端回填 uploadedContent）
  ipcBridge.handle('ep:ai-generate-text', handleAIGenerateText)
  // 「批量创建剧集」：选剧本文件 → 按章节拆分预览；确认后批量建集
  ipcBridge.handle('ep:analyze-script-file', handleAnalyzeScriptFile)
  ipcBridge.handle('ep:batch-create-episodes', handleBatchCreateEpisodes)
  // 「批量识别资产」：对指定剧集逐集跑 AI 识别角色/地点/物品（跨集去重）
  ipcBridge.handle('ep:batch-identify-entities', handleBatchIdentifyEntities)
  // FU5-B2 ① 内容 stage 整理 / 取舍（覆写三数组）
  ipcBridge.handle('ep:update-uploaded-entities', handleUpdateUploadedEntities)
  // S-01 阶段就绪状态机：四 tab（剧本/资产/分镜/合成）就绪评估
  ipcBridge.handle('ep:episode-readiness', handleEpisodeReadiness)
  // S-08 产出质量自检：关键帧 refs 覆盖率 / 字幕↔对白 / 时长偏差 / VLM 相似度
  ipcBridge.handle('ep:episode-quality-check', handleEpisodeQualityCheck)
}

/**
 * S-08 产出质量自检：返回四项指标（见 quality-check.service.ts），
 * 合成 tab「质量自检」面板按 status 渲红/黄/绿。
 */
async function handleEpisodeQualityCheck(
  _event: any,
  episodeId: string,
): Promise<IpcResponse> {
  try {
    if (!episodeId) return { success: false, error: 'episodeId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new QualityCheckService(db.dataSource)
    const report = await svc.checkEpisode(episodeId)
    return { success: true, data: report }
  } catch (e: any) {
    console.error('[handleEpisodeQualityCheck] 异常:', e)
    return { success: false, error: e?.message ?? '质量自检失败' }
  }
}

async function handleUpdateUploadedEntities(
  _event: any,
  episodeId: string,
  payload: {
    uploadedCharacters?: any[]
    uploadedLocations?: any[]
    uploadedItems?: any[]
  },
): Promise<IpcResponse> {
  try {
    if (!episodeId) return { success: false, error: 'episodeId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) return { success: false, error: '数据库未初始化' }
    const episode = await db.videoEpisodes.update(episodeId, {
      uploadedCharacters: payload.uploadedCharacters as any,
      uploadedLocations: payload.uploadedLocations as any,
      uploadedItems: payload.uploadedItems as any,
    } as any)
    if (!episode) return { success: false, error: '剧集不存在' }
    return { success: true, data: episode }
  } catch (e: any) {
    console.error('[handleUpdateUploadedEntities] 异常:', e)
    return { success: false, error: e?.message ?? '更新识别要素失败' }
  }
}

// ==================== S-01 阶段就绪状态机 ====================

/**
 * 评估剧集四阶段（剧本/资产/分镜/合成）就绪状态。
 * Studio 状态点 / 提示条 / 按钮 gating 共用此结果，规则见 readiness.service.ts。
 */
async function handleEpisodeReadiness(
  _event: any,
  episodeId: string,
): Promise<IpcResponse> {
  try {
    if (!episodeId) return { success: false, error: 'episodeId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new EpisodeReadinessService(db.dataSource)
    const readiness = await svc.evaluateEpisode(episodeId)
    return { success: true, data: readiness }
  } catch (e: any) {
    console.error('[handleEpisodeReadiness] 异常:', e)
    return { success: false, error: e?.message ?? '评估阶段就绪状态失败' }
  }
}

// ==================== FU4-1 AI 识别要素 ====================

type IdentifyKind = 'character' | 'location' | 'item'
const ALL_KINDS: readonly IdentifyKind[] = ['character', 'location', 'item']

async function handleIdentifyEntities(
  _event: any,
  episodeId: string,
  providerConfigId?: string,
  modelId?: string,
  kinds?: IdentifyKind[],
): Promise<IpcResponse> {
  try {
    if (!episodeId) return { success: false, error: 'episodeId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) return { success: false, error: '数据库未初始化' }
    const episode = await db.videoEpisodes.getById(episodeId)
    if (!episode) return { success: false, error: '剧集不存在' }
    if (episode.sourceType !== 'uploaded' || !episode.uploadedContent) {
      return {
        success: false,
        error: '仅 uploaded 模式 + 有长文内容时可识别',
      }
    }
    if (!providerConfigId || !modelId) {
      return {
        success: false,
        error: '请先在项目设置中配置剧本生成模型（用于 AI 识别）',
      }
    }

    const targetKinds: IdentifyKind[] =
      Array.isArray(kinds) && kinds.length > 0
        ? ALL_KINDS.filter((k) => kinds.includes(k))
        : [...ALL_KINDS]
    if (targetKinds.length === 0) {
      return { success: false, error: 'kinds 参数无有效类型' }
    }

    const aiService = StoryToVideoAIService.getInstance()
    // 选定类型并行识别（spec §0.4 IdentifyEntities）
    const want = (k: IdentifyKind): boolean => targetKinds.includes(k)
    const [characters, locations, items] = await Promise.all([
      want('character')
        ? aiService.identifyCharacters(episode.uploadedContent, providerConfigId, modelId)
        : Promise.resolve(null),
      want('location')
        ? aiService.identifyLocations(episode.uploadedContent, providerConfigId, modelId)
        : Promise.resolve(null),
      want('item')
        ? aiService.identifyItems(episode.uploadedContent, providerConfigId, modelId)
        : Promise.resolve(null),
    ])

    // 仅为本次重识别的 kind 创建/绑定资产，避免误创建未受影响 kind 的重复资产
    await UploadedEntityService.createAndBindUploadedEntities(
      episode.projectId,
      episode.id,
      characters ?? [],
      locations ?? [],
      items ?? [],
    )

    // 写回 episode.uploadedX：未识别的 kind 保留原值
    const patch: Record<string, any> = {}
    if (characters !== null) patch.uploadedCharacters = characters
    if (locations !== null) patch.uploadedLocations = locations
    if (items !== null) patch.uploadedItems = items
    await db.videoEpisodes.update(episodeId, patch)

    // 返回最新三类计数（未受影响的回填现有值）
    return {
      success: true,
      data: {
        characters:
          characters?.length ??
          (Array.isArray(episode.uploadedCharacters) ? episode.uploadedCharacters.length : 0),
        locations:
          locations?.length ??
          (Array.isArray(episode.uploadedLocations) ? episode.uploadedLocations.length : 0),
        items:
          items?.length ??
          (Array.isArray(episode.uploadedItems) ? episode.uploadedItems.length : 0),
        kinds: targetKinds,
      },
    }
  } catch (e: any) {
    console.error('[handleIdentifyEntities] 异常:', e)
    return { success: false, error: e?.message ?? 'AI 识别失败' }
  }
}

// ==================== 「AI 写剧本」生成故事原文 ====================

/**
 * 根据用户提示词 + 故事背景，生成小说体裁的故事原文。
 * 用于「创建剧集」对话框的「AI 写剧本」按钮：生成后由前端回填到 uploadedContent，
 * 后续在剧本 stage 由 EpisodeScriptGenerator 拆成结构化场景。
 *
 * 设计上独立于 createEpisode（其 JSDoc 明确"创建即返回，不在创建阶段调 AI"）；
 * 本 handler 是纯粹的"文本生成工具"，前端按需调用、拿到文本后自行回填。
 */
async function handleAIGenerateText(
  _event: any,
  req: EpAiGenerateTextRequest,
): Promise<IpcResponse> {
  try {
    if (!req?.prompt?.trim()) {
      return { success: false, error: '请输入提示词' }
    }
    const text = await generateStoryText(req)
    return { success: true, data: { text } }
  } catch (e: any) {
    console.error('[handleAIGenerateText] 异常:', e)
    return { success: false, error: e?.message ?? 'AI 生成剧本失败' }
  }
}

// ==================== 「批量创建剧集」分析 + 批量建集 ====================

/**
 * 选择剧本文件 → 提取文本 → 按章节拆分 → 返回剧集预览。
 * 桌面端用原生 dialog 选文件；支持 txt/md/docx/pdf/epub/mobi/azw3。
 * 无章节结构时返回明确提示，要求用户用「第X章」等标记分隔每集。
 */
async function handleAnalyzeScriptFile(event: any): Promise<IpcResponse> {
  if (!isElectron) {
    return { success: false, error: '该功能仅在桌面端可用' }
  }
  try {
    const { BrowserWindow, dialog } = loadElectron()
    const window = BrowserWindow?.fromWebContents(event?.sender)
    if (!window) return { success: false, error: '窗口不存在' }

    const result = await dialog.showOpenDialog(window, {
      title: '选择剧本文件',
      filters: [{ name: '剧本文件', extensions: ['txt', 'md', 'docx', 'pdf', 'epub', 'mobi', 'azw3'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '未选择文件' }
    }

    const filePath = result.filePaths[0]
    const fileName = path.basename(filePath)
    const fileType = inferFileType(fileName)
    if (!fileType) {
      return { success: false, error: `不支持的文件类型：${fileName}` }
    }

    const text = await extractTextFromFile(filePath, fileType)
    if (!text || !text.trim()) {
      return { success: false, error: '文件内容为空，无法分析' }
    }

    const analysis = analyzeScriptToEpisodes(text)
    if (!analysis.hasStructure || analysis.episodes.length === 0) {
      return {
        success: false,
        error: '未识别到章节结构，请在剧本中用「第X章 / Chapter N / # 标题」分隔每集',
      }
    }

    return {
      success: true,
      data: {
        fileName,
        hasStructure: analysis.hasStructure,
        structureType: analysis.structureType,
        episodes: analysis.episodes,
      },
    }
  } catch (e: any) {
    console.error('[handleAnalyzeScriptFile] 异常:', e)
    return { success: false, error: e?.message ?? '分析剧本文件失败' }
  }
}

/**
 * 批量创建剧集：把预览确认后的剧集候选循环落库（uploaded 模式）。
 * episodeNumber 从项目当前最大值 +1 续号；uploaded 模式不触发 AI，与 createEpisode 一致。
 *
 * 字数校验（与单建 handleCreateEpisode 同口径）：单集内容 ≤15000 字，先整体校验再落库。
 * 此前批建通道无字数校验，超长无结构文（如 5 万字）可经批建落库单集，绕过单建上限。
 */
async function handleBatchCreateEpisodes(
  _event: any,
  req: EpBatchCreateEpisodesRequest,
): Promise<IpcResponse> {
  try {
    if (!req?.projectId) return { success: false, error: 'projectId 不能为空' }
    if (!Array.isArray(req.episodes) || req.episodes.length === 0) {
      return { success: false, error: '没有可创建的剧集' }
    }

    // 字数校验（与单建同口径）：单集内容 ≤15000 字；先整体校验再落库（任何一条超限即整体拒绝）
    for (let i = 0; i < req.episodes.length; i++) {
      const ep = req.episodes[i]
      const wc = typeof ep.content === 'string' ? ep.content.length : 0
      if (wc > 15000) {
        const title = ep.title?.trim() || `第 ${i + 1} 个候选`
        return {
          success: false,
          error: `「${title}」字数超出限制，当前 ${wc} 字，最多允许 15000 字；请拆分后重试`,
        }
      }
    }

    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) return { success: false, error: '数据库未初始化' }

    // 续号：当前项目最大 episodeNumber + 1
    const existing = await db.videoEpisodes.getByProjectId(req.projectId)
    let nextNumber = existing.reduce((max, ep) => Math.max(max, ep.episodeNumber), 0) + 1

    const createdIds: string[] = []
    for (const ep of req.episodes) {
      const title = ep.title?.trim() || `第 ${nextNumber} 集`
      const episode = await db.videoEpisodes.create({
        projectId: req.projectId,
        sourceType: 'uploaded',
        uploadedContent: ep.content,
        episodeNumber: nextNumber,
        title,
      })
      if (episode) createdIds.push(episode.id)
      nextNumber++
    }

    return { success: true, data: { created: createdIds.length, episodeIds: createdIds } }
  } catch (e: any) {
    console.error('[handleBatchCreateEpisodes] 异常:', e)
    return { success: false, error: e?.message ?? '批量创建剧集失败' }
  }
}

/**
 * 批量识别资产：对指定剧集逐集跑 AI 识别角色/地点/物品，创建 project 级 binding（跨集去重）。
 * 复用 identifyCharacters/Locations/Items + createAndBindUploadedEntities（含去重）。
 * 输入源：优先该集已生成剧本的正文（episode_scripts.scriptContent），无则回退 uploadedContent；
 * 两者都无的剧集跳过，details 记录每集实际输入源 / skip 原因。
 */
async function handleBatchIdentifyEntities(
  _event: any,
  req: EpBatchIdentifyEntitiesRequest,
): Promise<IpcResponse> {
  try {
    if (!req?.projectId) return { success: false, error: 'projectId 不能为空' }
    if (!Array.isArray(req.episodeIds) || req.episodeIds.length === 0) {
      return { success: false, error: '没有可识别的剧集' }
    }
    if (!req.providerConfigId || !req.modelId) {
      return { success: false, error: '请先在项目设置中配置剧本生成模型' }
    }

    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) return { success: false, error: '数据库未初始化' }

    const aiService = StoryToVideoAIService.getInstance()
    let processed = 0
    let totalChars = 0
    let totalLocs = 0
    let totalItems = 0
    const details: Array<{ episodeId: string; source?: 'scriptContent' | 'uploadedContent'; skipped?: boolean; reason?: string }> = []

    for (const episodeId of req.episodeIds) {
      const episode = await db.videoEpisodes.getById(episodeId)
      if (!episode) {
        details.push({ episodeId, skipped: true, reason: '剧集不存在' })
        continue
      }

      // 输入源：剧本正文优先，回退导入内容
      const script = await db.episodeScripts?.getByEpisodeId?.(episodeId).catch(() => null)
      const useScript = !!script?.scriptContent?.trim()
      const content = useScript ? script!.scriptContent! : episode.uploadedContent?.trim() ? episode.uploadedContent : null
      if (!content) {
        details.push({ episodeId, skipped: true, reason: '无剧本正文且无导入内容' })
        continue
      }
      const source = useScript ? 'scriptContent' as const : 'uploadedContent' as const

      const [characters, locations, items] = await Promise.all([
        aiService.identifyCharacters(content, req.providerConfigId, req.modelId),
        aiService.identifyLocations(content, req.providerConfigId, req.modelId),
        aiService.identifyItems(content, req.providerConfigId, req.modelId),
      ])

      // createAndBindUploadedEntities 内部跨集去重（同 project 同名只建一份）
      await UploadedEntityService.createAndBindUploadedEntities(
        req.projectId,
        episodeId,
        characters ?? [],
        locations ?? [],
        items ?? [],
      )

      totalChars += characters?.length ?? 0
      totalLocs += locations?.length ?? 0
      totalItems += items?.length ?? 0
      processed++
      details.push({ episodeId, source })
    }

    return {
      success: true,
      data: { episodes: processed, characters: totalChars, locations: totalLocs, items: totalItems, details },
    }
  } catch (e: any) {
    console.error('[handleBatchIdentifyEntities] 异常:', e)
    return { success: false, error: e?.message ?? '批量识别资产失败' }
  }
}

// ==================== 剧集管理处理器 ====================

async function handleListEpisodes(
  _event: any,
  projectId: string
): Promise<IpcResponse> {
  try {
    console.log('[EpisodeProductionHandler] handleListEpisodes 被调用, projectId:', projectId)
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      console.error('[EpisodeProductionHandler] videoEpisodes 仓库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    const episodes = await db.videoEpisodes.getByProjectId(projectId)
    console.log('[EpisodeProductionHandler] 查询到的剧集数量:', episodes.length)
    console.log('[EpisodeProductionHandler] 剧集列表:', JSON.stringify(episodes, null, 2))
    return { success: true, data: episodes }
  } catch (error: any) {
    console.error('[EpisodeProductionHandler] 错误:', error)
    return { success: false, error: error.message || '获取剧集列表失败' }
  }
}

async function handleGetEpisode(
  _event: any,
  episodeId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const episode = await db.videoEpisodes.getById(episodeId)
    if (!episode) {
      return { success: false, error: '剧集不存在' }
    }

    return { success: true, data: episode }
  } catch (error: any) {
    return { success: false, error: error.message || '获取剧集失败' }
  }
}

/**
 * 创建剧集。
 *
 * 设计：创建即返回，**不在创建阶段调 AI**。
 * - outline 模式：长文项目里的 binding 已存在，直接做无 AI 的关联绑定（autoBindEntities）。
 * - uploaded 模式：仅落库 uploadedContent；要素识别 / 剧本生成等 AI 工作由用户进入
 *   ① 内容 stage（StageContentScriptView，subState='pending'）后手动触发：
 *     - "AI 识别要素"  → ep:identify-uploaded-entities（handleIdentifyEntities）
 *     - "AI 生成剧本"  → ep:generate-script（依赖已识别的要素 roster）
 *
 * 这么设计的原因（顺手记一下，避免后续又被加回来）：
 * 1. 创建对话框拿不到 providerConfigId / modelId（项目级配置在 projectStore.scriptModel），
 *    历史在 createEpisode 里调 AI 实际是拿 undefined 调，必然失败，再被 try/catch 吞掉，
 *    用户白等 30s 还看不到失败原因。
 * 2. 要素识别和剧本生成有强耦合（剧本 prompt 把 roster 喂给 AI 输出 binding_id 引用）。
 *    把识别延后到内容 stage，用户能：单类型重识别、人工增删要素、确认后再生成剧本，
 *    避免"创建一次 = 一次性出全部要素"的不可控流程。
 */
async function handleCreateEpisode(
  _event: any,
  projectId: string,
  data: {
    sourceType: 'outline' | 'uploaded'
    outlineId?: string
    uploadedContent?: string
    episodeNumber: number
    title: string
    // ─── 故事背景（spec 2026-05-08）：创建时收集，后续在内容 stage 可改 ───
    storyEra?: string
    storyRegion?: string
    storyBackgroundExtra?: string
  }
): Promise<IpcResponse> {
  console.log('[handleCreateEpisode] 收到请求:', { projectId, data })
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    // 验证参数
    if (data.sourceType === 'outline') {
      if (!data.outlineId) {
        return { success: false, error: '关联章节模式必须提供大纲ID' }
      }
    } else if (data.sourceType === 'uploaded') {
      // uploaded 模式：长文允许空（用户可在内容 stage 再粘贴）。
      // 字数下限 30 字（与 F3 AIQuickModeWizard 的 ≥30 字校验对齐）。
      // PRD `docs/review/2026-05-09-ep-redesign-spec.md` §2.2.2 F3 通道明确：用户输入"一句话"，
      // 后续 ① 内容 stage 用户可继续扩充。原 500 字硬门槛与 F3 设计冲突 — 已放开（2026-05-10 e2e bug #2）。
      if (data.uploadedContent && data.uploadedContent.length > 0) {
        const wordCount = data.uploadedContent.length
        if (wordCount < 30) {
          return { success: false, error: `字数不足，当前 ${wordCount} 字，最少需要 30 字` }
        }
        if (wordCount > 15000) {
          return { success: false, error: `字数超出限制，当前 ${wordCount} 字，最多允许 15000 字` }
        }
      }
    }

    console.log('[handleCreateEpisode] 创建剧集...')
    const episode = await db.videoEpisodes.create({
      projectId,
      sourceType: data.sourceType,
      outlineId: data.outlineId,
      uploadedContent: data.uploadedContent,
      episodeNumber: data.episodeNumber,
      title: data.title,
      storyEra: data.storyEra,
      storyRegion: data.storyRegion,
      storyBackgroundExtra: data.storyBackgroundExtra,
    })
    console.log('[handleCreateEpisode] 剧集创建成功:', episode.id)

    // outline 模式：长文项目里的 binding 已存在，直接做无 AI 的关联绑定。
    // uploaded 模式：在内容 stage 由用户手动触发 AI 识别（见上方 JSDoc）。
    if (data.sourceType === 'outline' && data.outlineId) {
      console.log('[handleCreateEpisode] outline 模式 → 自动绑定已有 binding...')
      const bindingResult = await EpisodeAutoBindingService.autoBindEntities(projectId, data.outlineId)
      console.log('[handleCreateEpisode] 自动绑定结果:', bindingResult)
    } else {
      console.log('[handleCreateEpisode] uploaded 模式 → 创建即返回，AI 识别延后到 ① 内容 stage')
    }

    return { success: true, data: episode }
  } catch (error: any) {
    console.error('[handleCreateEpisode] 创建剧集失败:', error)
    return { success: false, error: error.message || '创建剧集失败' }
  }
}

async function handleUpdateEpisode(
  _event: any,
  episodeId: string,
  data: UpdateVideoEpisodeData,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    // uploaded 模式编辑原文：与 createEpisode 同口径——
    // 允许空（用户可清空原文）；填了内容则校验字数中段（500-15000，确保 AI 识别有足够上下文）
    if (typeof data.uploadedContent === 'string' && data.uploadedContent.length > 0) {
      const wc = data.uploadedContent.length
      if (wc < 500) {
        return { success: false, error: `原文字数不足，当前 ${wc} 字，最少需要 500 字` }
      }
      if (wc > 15000) {
        return { success: false, error: `原文字数超出限制，当前 ${wc} 字，最多允许 15000 字` }
      }
    }

    const episode = await db.videoEpisodes.update(episodeId, data as any)
    if (!episode) {
      return { success: false, error: '剧集不存在' }
    }

    return { success: true, data: episode }
  } catch (error: any) {
    return { success: false, error: error.message || '更新剧集失败' }
  }
}

async function handleDeleteEpisode(
  _event: any,
  episodeId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.videoEpisodes.delete(episodeId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除剧集失败' }
  }
}
