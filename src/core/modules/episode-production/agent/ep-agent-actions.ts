/**
 * 剧集制作 Agent 动作分发执行
 * @module modules/episode-production/agent/ep-agent-actions
 *
 * 动作 → 现有生成/落库方法 → 解析 → 落库。每个动作独立 try/catch：
 * 失败不阻断后续动作，错误进执行摘要。
 *
 * 全部映射到现有 episode-production 真实服务（script / scene / storyboard / asset），
 * 严禁写死 / 假数据。签名以源码为准（详见调研笔记）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { buildAssetRosterForProject } from '@core/modules/episode-production/narrative/asset-roster-builder'
import { SceneBindingWriter } from '@core/modules/episode-production/narrative/scene-binding-writer'
import { EpisodeScriptGenerator } from '@core/modules/episode-production/narrative/ai/script-generator'
import { EpisodeStoryboardGenerator } from '@core/modules/episode-production/narrative/ai/storyboard-generator'
import { CharacterAssetService } from '@core/modules/episode-production/assets/services/character-asset.service'
import { LocationAssetService } from '@core/modules/episode-production/assets/services/location-asset.service'
import { ItemAssetService } from '@core/modules/episode-production/assets/services/item-asset.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/modules/episode-production/assets/services/main-image-generator.service'
import { createGalleryImageGenerator } from '@core/modules/episode-production/assets/services/image-provider-adapter'
import { buildAssetIdentityPrompt } from '@core/modules/episode-production/assets/prompts/asset-identity-prompt'
import {
  appendCharacterConstraints,
  mergeCharacterNegative,
} from '@core/modules/episode-production/assets/prompts/character-constraints'
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
} from '@core/modules/episode-production/assets/prompts/location-constraints'
import {
  appendItemConstraints,
  mergeItemNegative,
} from '@core/modules/episode-production/assets/prompts/item-constraints'
import type {
  EpAgentAction,
  EpAgentActionSummary,
  EpAgentExecutionContext,
  EpAgentPanelSection,
  EpAgentProductionState,
} from './ep-agent.types'
import { checkEpActionDependency } from './ep-agent-deps'

// ==================== JSON 容错解析（复用长文 agent 实现） ====================

/** 从 AI 输出提取 JSON 对象（容忍 markdown 代码块/前后杂文） */
export function extractJsonObject(text: string): any | null {
  if (!text) return null
  let s = text.trim()
  s = s.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(s.substring(first, last + 1))
    } catch {
      /* 尝试数组提取 */
    }
  }
  return null
}

// ==================== 动作执行 ====================

const ACTION_LABELS: Record<string, string> = {
  generate_script: '生成剧本',
  split_scenes: '拆分场景',
  generate_storyboards: '生成分镜',
  generate_char_asset: '生成角色定妆',
  generate_location_asset: '生成地点图',
  generate_item_asset: '生成物品图',
  update_entity: '修改资产',
  delete_entity: '删除资产',
}

/**
 * 顺序执行动作（依赖不满足的标记 skipped，不执行）。
 */
export async function executeEpActions(
  ctx: EpAgentExecutionContext,
  actions: EpAgentAction[],
  state: EpAgentProductionState,
): Promise<EpAgentActionSummary[]> {
  const summaries: EpAgentActionSummary[] = []
  for (const action of actions) {
    if (!action?.type) continue

    const dep = checkEpActionDependency(action.type, state)
    if (!dep.ok) {
      const s: EpAgentActionSummary = {
        type: action.type,
        status: 'skipped',
        message: `「${ACTION_LABELS[action.type] || action.type}」暂缓：缺少${dep.missing.join('、')}`,
      }
      summaries.push(s)
      ctx.emit({ type: 'action:done', summary: s })
      continue
    }

    ctx.emit({
      type: 'action:start',
      actionType: action.type,
      label: ACTION_LABELS[action.type] || action.type,
    })

    let summary: EpAgentActionSummary
    try {
      summary = await dispatchEpAction(ctx, action)
    } catch (e: any) {
      summary = {
        type: action.type,
        status: 'error',
        message: `「${ACTION_LABELS[action.type] || action.type}」执行失败：${e.message || '未知错误'}`,
        error: e.message || '未知错误',
      }
    }
    summaries.push(summary)
    ctx.emit({ type: 'action:done', summary })
  }
  return summaries
}

/** 按类型分发到具体执行函数 */
async function dispatchEpAction(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  switch (action.type) {
    case 'generate_script': return executeGenerateScript(ctx, action)
    case 'split_scenes': return executeSplitScenes(ctx)
    case 'generate_storyboards': return executeGenerateStoryboards(ctx, action)
    case 'generate_char_asset': return executeGenerateAsset(ctx, 'character', action)
    case 'generate_location_asset': return executeGenerateAsset(ctx, 'location', action)
    case 'generate_item_asset': return executeGenerateAsset(ctx, 'item', action)
    default:
      return { type: action.type, status: 'error', message: `未知动作类型：${action.type}` }
  }
}

// ==================== 动作1：generate_script ====================

async function executeGenerateScript(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const { db, providerConfigId, modelId } = ctx
  const m = db ?? getCoreDatabaseManager()

  const episode = await m.videoEpisodes?.getById(ctx.episodeId)
  if (!episode) throw new Error('剧集不存在，无法生成剧本')
  const project = await m.videoProjects?.getById(episode.projectId)
  if (!project) throw new Error('项目不存在，无法生成剧本')

  // ① 取 chapterContent
  let chapterContent = ''
  if (action.params?.chapterContent && String(action.params.chapterContent).trim()) {
    chapterContent = String(action.params.chapterContent).trim()
  } else {
    chapterContent = await resolveChapterContent(m, episode, project)
  }
  if (!chapterContent) {
    throw new Error('未找到章节内容，请先在长文写作中完成章节内容或填充分镜原文')
  }

  // ② 资产花名册
  if (!m.dataSource) throw new Error('数据库未初始化（dataSource 不可用）')
  const roster = await buildAssetRosterForProject(m.dataSource, episode.projectId)

  // ③ AI 生成完整剧本
  const result = await EpisodeScriptGenerator.getInstance().generateFullScript(
    chapterContent,
    roster,
    providerConfigId,
    modelId,
  )

  // ④ 剧本 upsert
  const existingScript = await m.episodeScripts?.getByEpisodeId(episode.id)
  let script: any
  if (existingScript) {
    script = await m.episodeScripts?.update(existingScript.id, {
      synopsis: result.synopsis,
      scriptContent: result.scriptContent,
      scriptFormat: 'standard',
      status: 'reviewing',
    })
  } else {
    script = await m.episodeScripts?.create({
      projectId: episode.projectId,
      episodeId: episode.id,
      outlineId: episode.outlineId,
      synopsis: result.synopsis,
      scriptContent: result.scriptContent,
      scriptFormat: 'standard',
    })
    script = await m.episodeScripts?.update(script.id, { status: 'reviewing' })
    await m.videoEpisodes?.update(episode.id, { scriptId: script.id })
  }

  // ⑤ 删旧场景 → ⑥ 写新场景+桥接表
  if (existingScript) await m.sceneScripts?.deleteByEpisodeScriptId(existingScript.id)
  const sceneRecords = await SceneBindingWriter.createScenesWithBindings(
    m.dataSource,
    script.id,
    result.scenes,
  )

  // ⑦ 阶段推进
  if (episode.status === 'pending' || episode.status === 'asset_prep') {
    await m.videoEpisodes?.update(episode.id, { status: 'scripting' })
  }

  const changed: EpAgentPanelSection[] = ['script', 'scenes']
  return {
    type: 'generate_script',
    status: 'ok',
    message: `已生成剧本：梗概 ${result.synopsis.length} 字、正文 ${result.scriptContent.length} 字、场景 ${result.scenes.length} 场`,
    changed,
    data: {
      scriptId: script.id,
      synopsis: result.synopsis,
      scenesCount: result.scenes.length,
    },
    nav: { tab: 'script' },
  }
}

/** 解析剧集要生成的章节内容：uploaded 原文 或 关联长文章节拼接 */
async function resolveChapterContent(m: any, episode: any, project: any): Promise<string> {
  // uploaded 模式
  if (episode.sourceType === 'uploaded' && episode.uploadedContent) {
    return String(episode.uploadedContent)
  }
  // outline 模式：关联 lwOutlineId → 聚合章节
  if (episode.outlineId && project.longWritingProjectId) {
    const outline = await m.lwOutlines?.getById(episode.outlineId)
    if (outline) {
      const chapters = (await m.lwOutlines?.getChildren(episode.outlineId)) || []
      const contents: string[] = []
      for (const chapter of chapters) {
        const sections = (await m.lwOutlines?.getChildren(chapter.id)) || []
        for (const section of sections) {
          const ch = await m.lwChapters?.getByOutlineId(section.id)
          if (ch?.content) contents.push(`【${chapter.name}-${section.name}】\n${ch.content}`)
        }
      }
      return contents.join('\n\n')
    }
  }
  return ''
}

// ==================== 动作2：split_scenes ====================

async function executeSplitScenes(ctx: EpAgentExecutionContext): Promise<EpAgentActionSummary> {
  const { db, providerConfigId, modelId } = ctx
  const m = db ?? getCoreDatabaseManager()

  const scriptId = await resolveScriptId(m, ctx.episodeId)
  if (!scriptId) throw new Error('剧本不存在，无法拆分场景')

  const script = await m.episodeScripts?.getById(scriptId)
  if (!script) throw new Error('剧本不存在')
  if (!script.synopsis) throw new Error('剧本缺少 synopsis，无法拆分场景')
  const episode = await m.videoEpisodes?.getById(script.episodeId)
  if (!episode) throw new Error('剧集不存在')
  if (!m.dataSource) throw new Error('数据库未初始化')

  const roster = await buildAssetRosterForProject(m.dataSource, episode.projectId)
  const generatedScenes = await EpisodeScriptGenerator.getInstance().generateScenesFromSynopsis(
    script.synopsis,
    roster,
    providerConfigId,
    modelId,
  )

  await m.sceneScripts?.deleteByEpisodeScriptId(scriptId)
  const sceneRecords = await SceneBindingWriter.createScenesWithBindings(
    m.dataSource,
    scriptId,
    generatedScenes,
  )

  const changed: EpAgentPanelSection[] = ['scenes']
  return {
    type: 'split_scenes',
    status: 'ok',
    message: `已从剧本拆分出 ${sceneRecords.length} 场`,
    changed,
    data: { scenesCount: sceneRecords.length },
    nav: { tab: 'script' },
  }
}

// ==================== 动作3：generate_storyboards ====================

async function executeGenerateStoryboards(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const { db, providerConfigId, modelId } = ctx
  const m = db ?? getCoreDatabaseManager()

  const scriptId = action.params?.scriptId
    ? String(action.params.scriptId)
    : await resolveScriptId(m, ctx.episodeId)
  if (!scriptId) throw new Error('剧本不存在，无法生成分镜')

  const scenes = await m.sceneScripts?.getByEpisodeScriptId(scriptId)
  if (!scenes || scenes.length === 0) throw new Error('没有场景，请先生成场景')

  // AI 批量生成（逐个分镜模式）
  const results = await EpisodeStoryboardGenerator.getInstance().generateStoryboards(
    scenes,
    providerConfigId,
    modelId,
    (sceneIndex, total, shotProgress) => {
      ctx.emit({
        type: 'action:start',
        actionType: 'generate_storyboards',
        label: `生成分镜 ${sceneIndex + 1}/${total}${shotProgress ? `（镜头 ${shotProgress.current}/${shotProgress.total}）` : ''}`,
      })
    },
  )

  // 持久化（每场景先删后写）
  let total = 0
  for (const [sceneId, result] of results) {
    await m.storyboards?.deleteBySceneScriptId(sceneId)
    for (const sb of result.storyboards) {
      await m.storyboards?.create({
        sceneScriptId: sceneId,
        shotNumber: sb.shotNumber,
        shotType: sb.shotType,
        cameraAngle: sb.cameraAngle,
        cameraMovement: sb.cameraMovement,
        movementDuration: sb.movementDuration ?? null,
        frameDescription: sb.frameDescription,
        subject: sb.subject ?? null,
        composition: sb.composition ?? null,
        characters: sb.characters,
        narrationId: sb.narrationId ?? null,
        dialogueIds: sb.dialogueIds,
        actionIds: sb.actionIds,
        duration: sb.duration,
        transition: sb.transition,
      })
      total++
    }
  }

  const changed: EpAgentPanelSection[] = ['storyboards']
  return {
    type: 'generate_storyboards',
    status: 'ok',
    message: `已为 ${scenes.length} 场生成 ${total} 个分镜`,
    changed,
    data: { scenesCount: scenes.length, storyboardsCount: total },
    nav: { tab: 'storyboard' },
  }
}

// ==================== 动作4：generate_*_asset（角色/地点/物品） ====================

type AssetKind = 'character' | 'location' | 'item'

async function executeGenerateAsset(
  ctx: EpAgentExecutionContext,
  kind: AssetKind,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const { db } = ctx
  const m = db ?? getCoreDatabaseManager()
  if (!m.dataSource) throw new Error('数据库未初始化')

  const name = action.params?.name ? String(action.params.name).trim() : ''
  if (!name) throw new Error(`生成${assetLabel(kind)}需要指定名称（params.name）`)

  const projectId = await resolveProjectId(m, ctx.episodeId)
  if (!projectId) throw new Error('剧集所属项目不存在')

  // 1. 定位 / 创建 binding
  const bindingId = await ensureBinding(m, kind, projectId, name, action)
  if (!bindingId) throw new Error(`项目中没有资产「${name}」，已尝试创建失败`)

  // 2. 取生效数据 + 拼图片 prompt
  const storyBg = await readStoryBackground(m, ctx.episodeId)
  const eff = await getEffective(m, kind, bindingId)
  let prompt = buildAssetIdentityPrompt(kind, eff, storyBg)
  let negativePrompt: string | undefined
  if (kind === 'character') {
    prompt = appendCharacterConstraints(prompt, 'fullBody')
    negativePrompt = mergeCharacterNegative(undefined, 'fullBody')
  } else if (kind === 'location') {
    prompt = appendLocationNoHumanConstraint(prompt)
    negativePrompt = mergeLocationNoHumanNegative(undefined)
  } else if (kind === 'item') {
    prompt = appendItemConstraints(prompt)
    negativePrompt = mergeItemNegative(undefined)
  }

  // 3. 生成主图（落盘 + 关联一步完成）
  const svc = new MainImageGeneratorService(
    new AssetImageService(m.dataSource),
    createGalleryImageGenerator(),
    m.dataSource,
  )
  const img = await svc.generateMain({
    assetType: kind,
    assetId: bindingId,
    prompt,
    negativePrompt,
    referenceImagePath: eff.referenceImagePath ?? null,
    userId: getCurrentUserId(),
  })

  const changed: EpAgentPanelSection[] = ['assets']
  const label = assetLabel(kind)
  return {
    type: kind === 'character'
      ? 'generate_char_asset'
      : kind === 'location'
        ? 'generate_location_asset'
        : 'generate_item_asset',
    status: 'ok',
    message: `已为${label}「${name}」生成主图（asset_image 已落库）`,
    changed,
    data: { assetType: kind, assetId: bindingId, imagePath: img.imagePath },
    nav: { tab: 'asset', asset: { kind, id: bindingId, name } },
  }
}

// ==================== 辅助 ====================

/** 定位或创建一个 binding，返回 bindingId */
async function ensureBinding(
  m: any,
  kind: AssetKind,
  projectId: string,
  name: string,
  action: EpAgentAction,
): Promise<string | null> {
  // 优先按 id 定位
  if (action.params?.id) {
    const byId = await getBindingById(m, kind, String(action.params.id))
    if (byId) return byId.id
  }
  // 其次按 name 定位（listByProject 中找同名）
  const found = await findBindingByName(m, kind, projectId, name)
  if (found) return found.id
  // 都没有 → 创建 standalone
  const userId = getCurrentUserId()
  const svc = m.dataSource
    ? kind === 'character'
      ? new CharacterAssetService(m.dataSource)
      : new LocationAssetService(m.dataSource, new AssetImageService(m.dataSource))
    : null
  if (kind === 'character' && svc) {
    return (svc as CharacterAssetService).createStandalone({
      projectId,
      name,
      description: action.params?.description ? String(action.params.description) : undefined,
      userId,
    }).then((b) => b.id)
  }
  if (kind === 'location' && svc) {
    return (svc as LocationAssetService).createStandalone({
      projectId,
      name,
      description: action.params?.description ? String(action.params.description) : undefined,
      userId,
    }).then((b) => b.id)
  }
  if (kind === 'item' && m.dataSource) {
    const itemSvc = new ItemAssetService(m.dataSource)
    return itemSvc.createStandalone({
      projectId,
      name,
      description: action.params?.description ? String(action.params.description) : undefined,
      userId,
    }).then((b) => b.id)
  }
  return null
}

async function getBindingById(m: any, kind: AssetKind, id: string): Promise<any | null> {
  const repo = kind === 'character' ? m.characterBindings : kind === 'location' ? m.locationBindings : m.itemBindings
  return repo?.getById?.(id) ?? null
}

async function findBindingByName(
  m: any,
  kind: AssetKind,
  projectId: string,
  name: string,
): Promise<any | null> {
  if (!m.dataSource) return null
  const norm = name.trim().toLowerCase()
  if (kind === 'character') {
    const svc = new CharacterAssetService(m.dataSource)
    const rows = await svc.listByProject(projectId)
    for (const r of rows) {
      const eff = await safeEffective(svc.getEffectiveData(r.id))
      if (eff?.name?.trim().toLowerCase() === norm) return r
    }
  } else if (kind === 'location') {
    const svc = new LocationAssetService(m.dataSource, new AssetImageService(m.dataSource))
    const rows = await svc.listByProject(projectId)
    for (const r of rows) {
      const eff = await safeEffective(svc.getEffectiveData(r.id))
      if (eff?.name?.trim().toLowerCase() === norm) return r
    }
  } else {
    const svc = new ItemAssetService(m.dataSource)
    const rows = await svc.listByProject(projectId)
    for (const r of rows) {
      const eff = await safeEffective(svc.getEffectiveData(r.id))
      if (eff?.name?.trim().toLowerCase() === norm) return r
    }
  }
  return null
}

async function getEffective(m: any, kind: AssetKind, bindingId: string): Promise<any> {
  if (kind === 'character') {
    const svc = new CharacterAssetService(m.dataSource)
    return svc.getEffectiveData(bindingId)
  }
  if (kind === 'location') {
    const svc = new LocationAssetService(m.dataSource, new AssetImageService(m.dataSource))
    return svc.getEffectiveData(bindingId)
  }
  const svc = new ItemAssetService(m.dataSource)
  return svc.getEffectiveData(bindingId)
}

async function safeEffective(p: Promise<any>): Promise<any | null> {
  try {
    return await p
  } catch {
    return null
  }
}

async function resolveProjectId(m: any, episodeId: string): Promise<string | null> {
  const ep = await m.videoEpisodes?.getById(episodeId)
  return ep?.projectId ?? null
}

async function readStoryBackground(m: any, episodeId: string): Promise<{ era?: string | null; region?: string | null; extra?: string | null }> {
  const ep = await m.videoEpisodes?.getById(episodeId)
  return {
    era: ep?.storyEra ?? null,
    region: ep?.storyRegion ?? null,
    extra: ep?.storyBackgroundExtra ?? null,
  }
}

async function resolveScriptId(m: any, episodeId: string): Promise<string | null> {
  const ep = await m.videoEpisodes?.getById(episodeId)
  if (ep?.scriptId) return ep.scriptId
  const script = await m.episodeScripts?.getByEpisodeId(episodeId)
  return script?.id ?? null
}

function assetLabel(kind: AssetKind): string {
  return kind === 'character' ? '角色' : kind === 'location' ? '地点' : '物品'
}

/** 供测试用的 standalone ensureBinding 纯度导出（可选） */
export const __epAgentTest = {
  extractJsonObject,
  resolveScriptId,
}
