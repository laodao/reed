/**
 * 剧集制作 Agent 动作分发执行
 * @module platform/episode-production/agent/ep-agent-actions
 *
 * 动作 → 现有生成/落库方法 → 解析 → 落库。每个动作独立 try/catch：
 * 失败不阻断后续动作，错误进执行摘要。
 *
 * 全部映射到现有 episode-production 真实服务（script / scene / storyboard / asset），
 * 严禁写死 / 假数据。签名以源码为准（详见调研笔记）。
 */

import * as path from 'path'
import * as fs from 'fs'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { getPathProvider } from '@core/interfaces/path.interface'
import { buildAssetRosterForProject } from '@core/platform/episode-production/narrative/asset-roster-builder'
import {
  rebuildScenesForScript,
  upsertScriptAndRebuildScenes,
} from '@core/platform/episode-production/narrative/services/script-scene-rebuild.service'
import { EpisodeScriptGenerator } from '@core/platform/episode-production/narrative/ai/script-generator'
import { StoryboardCogenService } from '@core/platform/episode-production/narrative/services/storyboard-cogen.service'
import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'
import { LocationAssetService } from '@core/platform/episode-production/assets/services/location-asset.service'
import { ItemAssetService } from '@core/platform/episode-production/assets/services/item-asset.service'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/platform/episode-production/assets/services/main-image-generator.service'
import { createGalleryImageGenerator } from '@core/platform/episode-production/assets/services/image-provider-adapter'
import { buildAssetIdentityPrompt } from '@core/platform/episode-production/assets/prompts/asset-identity-prompt'
import {
  appendCharacterConstraints,
  mergeCharacterNegative,
} from '@core/platform/episode-production/assets/prompts/character-constraints'
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
} from '@core/platform/episode-production/assets/prompts/location-constraints'
import {
  appendItemConstraints,
  mergeItemNegative,
} from '@core/platform/episode-production/assets/prompts/item-constraints'
import { KeyframeGenerationService } from '@core/platform/episode-production/render/keyframe/keyframe-generation.service'
import { VideoSegmentService } from '@core/platform/episode-production/render/video/video-segment.service'
import { SegmentVideoService } from '@core/platform/episode-production/render/video/segment-video.service'
import { EpSegmentationService } from '@core/platform/episode-production/render/video/ep-segmentation.service'
import { createAdapterForProviderWithReason } from '@core/platform/episode-production/render/video/adapter-factory'
import { SceneAudioOrchestratorService } from '@core/platform/episode-production/render/audio/scene-audio-orchestrator.service'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { segmentProvidesVideo } from '@core/platform/episode-production/services/shot-video-readiness'
import type {
  EpAgentAction,
  EpAgentActionSummary,
  EpAgentExecutionContext,
  EpAgentPanelSection,
  EpAgentProductionState,
} from './ep-agent.types'
import { checkEpActionDependency, computeEpProductionState } from './ep-agent-deps'

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
  generate_keyframes: '生成关键帧',
  generate_segment_video: '生成分镜视频',
  generate_scene_audio: '生成配音',
  export_mp4: '导出成片',
  generate_char_asset: '生成角色定妆',
  generate_location_asset: '生成地点图',
  generate_item_asset: '生成物品图',
  update_entity: '修改资产',
  delete_entity: '删除资产',
  query_database: '查询数据库',
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
  // 依赖校验用"当前"生产状态而非决策前快照（#49）：同一轮前面动作可能已生成剧本/场景，
  // 复用快照会让后续依赖动作被误判 skipped（如 generate_script → split_scenes）。
  let currentState = state
  for (const action of actions) {
    if (!action?.type) continue

    const dep = checkEpActionDependency(action.type, currentState)
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
    // 动作实际执行（成功或失败）后重算生产状态，供后续动作的依赖校验读取最新值；
    // 失败也需重算——动作可能部分写入（如脚本已生成）。skipped 未执行则跳过。
    if (summary.status !== 'skipped') {
      currentState = await computeEpProductionState(ctx.db, ctx.projectId, ctx.episodeId)
    }
  }
  return summaries
}

/**
 * 单动作执行（M6.5-a 工具化路径，35 号）：语义与 executeEpActions 循环体一致——
 * 依赖检查（skipped 不执行）→ action:start → dispatch → 重算生产状态（#49 同轮依赖）→ action:done。
 * 工具每次调用前由调用方传"当前"状态（工具自身不缓存快照）。
 */
export async function executeSingleEpAction(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
  currentState: EpAgentProductionState,
): Promise<{ summary: EpAgentActionSummary; nextState: EpAgentProductionState }> {
  if (!action?.type) throw new Error('动作缺少 type')
  const dep = checkEpActionDependency(action.type, currentState)
  if (!dep.ok) {
    const s: EpAgentActionSummary = {
      type: action.type,
      status: 'skipped',
      message: `「${ACTION_LABELS[action.type] || action.type}」暂缓：缺少${dep.missing.join('、')}`,
    }
    ctx.emit({ type: 'action:done', summary: s })
    return { summary: s, nextState: currentState }
  }
  ctx.emit({ type: 'action:start', actionType: action.type, label: ACTION_LABELS[action.type] || action.type })
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
  ctx.emit({ type: 'action:done', summary })
  const nextState = summary.status !== 'skipped'
    ? await computeEpProductionState(ctx.db, ctx.projectId, ctx.episodeId)
    : currentState
  return { summary, nextState }
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
    case 'generate_keyframes': return executeGenerateKeyframes(ctx, action)
    case 'generate_segment_video': return executeGenerateSegmentVideo(ctx, action)
    case 'generate_scene_audio': return executeGenerateSceneAudio(ctx, action)
    case 'export_mp4': return executeExportMp4(ctx, action)
    case 'generate_char_asset': return executeGenerateAsset(ctx, 'character', action)
    case 'generate_location_asset': return executeGenerateAsset(ctx, 'location', action)
    case 'generate_item_asset': return executeGenerateAsset(ctx, 'item', action)
    case 'update_entity': return executeUpdateEntity(ctx, action)
    case 'delete_entity': return executeDeleteEntity(ctx, action)
    case 'query_database': return executeQueryDatabase(ctx, action)
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

  // ④–⑦ S5（2026-09-25 一致性修复第二批）：剧本 upsert + 级联删旧分镜 +
  // 删旧场景建新场景 + 状态收敛 scripting，与 handler 同公共 service 单事务——
  // 原实现 deleteByEpisodeScriptId 裸删（旧分镜/关键帧成孤儿）、删建非事务、
  // 状态晚于 scripting 不回退
  const { scriptId } = await upsertScriptAndRebuildScenes(
    m.dataSource,
    { id: episode.id, projectId: episode.projectId, outlineId: episode.outlineId },
    { synopsis: result.synopsis, scriptContent: result.scriptContent, scenes: result.scenes },
  )

  const changed: EpAgentPanelSection[] = ['script', 'scenes']
  return {
    type: 'generate_script',
    status: 'ok',
    message: `已生成剧本：梗概 ${result.synopsis.length} 字、正文 ${result.scriptContent.length} 字、场景 ${result.scenes.length} 场`,
    changed,
    data: {
      scriptId,
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

  // S5：删旧场景（级联清旧分镜）+ 建新场景单事务 + 状态回退，与 handler 同公共 service
  const sceneRecords = await rebuildScenesForScript(
    m.dataSource,
    episode.id,
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
  _action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const m = ctx.db ?? getCoreDatabaseManager()
  if (!m.dataSource) throw new Error('数据库未初始化')

  // O4（2026-09-16 ep-optimization）：agent 拆镜改走 cogen 联合生成——资产识别 + 分镜
  // 一次 LLM 调用，代码侧建/复用 binding 并回填全部 ID（旧逐镜生成器无绑定能力，
  // 生成结果角色全部未绑定）。force：助手语境「生成分镜」=重写（与 renderer 批量按钮一致）。
  const result = await new StoryboardCogenService(m.dataSource).cogenStoryboardsForEpisode(
    ctx.episodeId,
    { force: true },
    (progress) => {
      ctx.emit({
        type: 'action:start',
        actionType: 'generate_storyboards',
        label: `生成分镜 场景 ${progress.sceneNumber}/${progress.totalScenes}`,
      })
    },
  )

  const succeeded = result.results.filter((r) => !r.error)
  const failed = result.results.filter((r) => r.error)
  const total = succeeded.reduce((sum, r) => sum + r.shotCount, 0)

  // 落库后重读分镜列表（保持旧返回结构里的 storyboards 字段）
  const scriptId = await resolveScriptId(m, ctx.episodeId)
  const scenes = scriptId ? ((await m.sceneScripts?.getByEpisodeScriptId(scriptId)) || []) : []
  const storyboards: any[] = []
  for (const scene of scenes) {
    storyboards.push(...((await m.storyboards?.getBySceneScriptId(scene.id)) || []))
  }

  // cogen 由代码构造绑定并断言 characterId 全非空（D4-2），unboundCharacters 恒空（字段保留兼容）
  const failNote =
    failed.length > 0
      ? `；${failed.length} 个场景失败（场景 ${failed[0].sceneNumber}：${failed[0].error}）`
      : ''
  const changed: EpAgentPanelSection[] = ['storyboards']
  return {
    type: 'generate_storyboards',
    status: succeeded.length > 0 ? 'ok' : 'error',
    message: `已为 ${succeeded.length}/${scenes.length} 场生成 ${total} 个分镜（含资产绑定）${failNote}`,
    changed,
    data: {
      scenesCount: scenes.length,
      storyboardsCount: total,
      storyboards,
      unboundCharacters: [],
      unboundCount: 0,
    },
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

  // 1. 定位资产（只定位不创建——2026-09-16 P2-AG3：旧 ensureBinding 找不到名字就静默
  //    createStandalone，模型幻觉一个名字 = 静默建资产 + 烧一次图费；与 update/delete 对齐：
  //    定位失败即报错并给出现有名单，模型可自纠）
  const bindingId = await resolveBindingId(m, kind, projectId, {
    id: action.params?.id ? String(action.params.id) : undefined,
    name,
  })
  if (!bindingId) {
    const known = await listAssetNames(m, kind, projectId)
    throw new Error(
      `项目中没有${assetLabel(kind)}「${name}」。现有${assetLabel(kind)}：${
        known.slice(0, 8).join('、') || '（无）'
      }。请改用现有资产名，或先由用户在资产页创建。`,
    )
  }

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

  const label = assetLabel(kind)
  // H11（2026-09-16 ep-hardening）：写后核验——asset_image 行必须真实存在且已出图，
  // 不符则按失败语义返回，让助手的回复基于真实落库状态而非 service 的返回承诺。
  const verified = await new AssetImageService(m.dataSource).getById(img.id).catch(() => null)
  if (!verified?.imagePath) {
    return {
      type: kind === 'character'
        ? 'generate_char_asset'
        : kind === 'location'
          ? 'generate_location_asset'
          : 'generate_item_asset',
      status: 'error',
      message: `为${label}「${name}」生成主图实际未生效：数据库核验未找到图片记录（assetId=${bindingId}），请勿向用户声称已生成`,
      error: 'DB 核验失败：asset_image 行不存在或 imagePath 为空',
      data: { assetType: kind, assetId: bindingId },
    }
  }

  const changed: EpAgentPanelSection[] = ['assets']
  return {
    type: kind === 'character'
      ? 'generate_char_asset'
      : kind === 'location'
        ? 'generate_location_asset'
        : 'generate_item_asset',
    status: 'ok',
    message: `已为${label}「${name}」生成主图（asset_image 已落库）`,
    changed,
    data: { assetType: kind, assetId: bindingId, imagePath: verified.imagePath },
    nav: { tab: 'asset', asset: { kind, id: bindingId, name } },
  }
}

// ==================== 辅助 ====================

/** 项目内某类资产的现有名单（≤20；供定位失败时给模型自纠线索） */
async function listAssetNames(m: any, kind: AssetKind, projectId: string): Promise<string[]> {
  const svc = getAssetServiceFor(kind, m)
  const rows = await svc.listByProject(projectId)
  const names: string[] = []
  for (const r of rows.slice(0, 20)) {
    const eff = await safeEffective(svc.getEffectiveData(r.id))
    if (eff?.name) names.push(String(eff.name))
  }
  return names
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

// ==================== 动作：update_entity / delete_entity（修改/删除资产） ====================

/**
 * 按 id 或名称解析资产 binding（只解析不创建）。
 * 决策上下文只向 AI 暴露资产名称（不暴露内部 id），因此 name 是主定位键；
 * id 传入时优先精确匹配。找不到返回 null。
 */
async function resolveBindingId(
  m: any,
  kind: AssetKind,
  projectId: string,
  params: Record<string, unknown>,
): Promise<string | null> {
  if (params.id && typeof params.id === 'string') {
    const byId = await getBindingById(m, kind, params.id)
    if (byId) {
      // 越权校验（M6.5 评审 P2-4）：byId 直取不经过项目过滤，id 指向他项目资产必须拒绝
      if (byId.projectId !== projectId) {
        throw new Error(`越权：目标${kind}资产不属于当前项目`)
      }
      return byId.id
    }
  }
  if (params.name && typeof params.name === 'string') {
    const byName = await findBindingByName(m, kind, projectId, params.name)
    if (byName) return byName.id
  }
  return null
}

/** 实例化对应类型的资产服务（供 update/delete 动作复用） */
function getAssetServiceFor(kind: AssetKind, m: any) {
  if (kind === 'character') return new CharacterAssetService(m.dataSource)
  if (kind === 'location') return new LocationAssetService(m.dataSource, new AssetImageService(m.dataSource))
  return new ItemAssetService(m.dataSource)
}

/**
 * 修改资产（update_entity）。
 * params: { type: 'character'|'location'|'item', id? / name?, patch: { name?, description?, appearance?, outfit?, ... } }
 * - 定位失败（id/name 都找不到）→ 明确报错，不静默创建（与 generate_*_asset 的 ensureBinding 语义不同）。
 * - linked_lw 走 override 字段，standalone 走 standalone 字段；character 额外支持身份块字段。
 */
async function executeUpdateEntity(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const { db } = ctx
  const m = db ?? getCoreDatabaseManager()
  const params = (action.params || {}) as Record<string, any>
  const kind = normalizeAssetKind(params.type)
  if (!kind) throw new Error('修改资产：缺少 type（character / location / item）')

  const projectId = await resolveProjectId(m, ctx.episodeId)
  if (!projectId) throw new Error('剧集所属项目不存在，无法修改资产')

  const bindingId = await resolveBindingId(m, kind, projectId, params)
  if (!bindingId) {
    const target = params.name ?? params.id ?? ''
    throw new Error(`项目中没有${assetLabel(kind)}「${target}」，无法修改`)
  }

  const patch = (params.patch ?? {}) as Record<string, any>
  if (typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0) {
    throw new Error('修改资产：patch 为空，请告诉我要改什么')
  }

  const svc = getAssetServiceFor(kind, m)
  const binding = await getBindingById(m, kind, bindingId)

  // H11：记录本次实际写入的列 → 期望值，写后重查核验（见函数末尾）
  const writtenCols: Record<string, unknown> = {}

  // 身份块字段（name/description/appearance/outfit）按 sourceType 分发
  if (binding?.sourceType === 'standalone') {
    const sp: Partial<{ name: string; description: string }> = {}
    if ('name' in patch && patch.name != null) {
      sp.name = String(patch.name)
      writtenCols.standaloneName = sp.name
    }
    if ('description' in patch && patch.description != null) {
      sp.description = String(patch.description)
      writtenCols.standaloneDescription = sp.description
    }
    await svc.updateStandalone(bindingId, sp)
  } else {
    const op: Partial<{
      name: string | null
      description: string | null
      appearance: string | null
      outfit: string | null
    }> = {}
    if ('name' in patch) {
      op.name = patch.name == null ? null : String(patch.name)
      writtenCols.overrideName = op.name
    }
    if ('description' in patch) {
      op.description = patch.description == null ? null : String(patch.description)
      writtenCols.overrideDescription = op.description
    }
    if ('appearance' in patch && kind === 'character') {
      op.appearance = patch.appearance == null ? null : String(patch.appearance)
      writtenCols.overrideAppearance = op.appearance
    }
    if ('outfit' in patch && kind === 'character') {
      op.outfit = patch.outfit == null ? null : String(patch.outfit)
      writtenCols.overrideOutfit = op.outfit
    }
    await svc.updateOverride(bindingId, op)
  }

  // character 扩展字段（gender/age/race/alias/role/styleAnchors/outfitsExtra）
  if (kind === 'character') {
    const extra: Partial<{
      alias: string | null
      role: string | null
      gender: string | null
      age: number | null
      race: string | null
      voiceSpeed: number | null
      voicePitch: number | null
      voiceEmotion: string | null
      styleAnchors: string[] | null
      outfitsExtra: string[] | null
    }> = {}
    if ('alias' in patch) {
      extra.alias = patch.alias == null ? null : String(patch.alias)
      writtenCols.alias = extra.alias
    }
    if ('role' in patch) {
      extra.role = patch.role == null ? null : String(patch.role)
      writtenCols.role = extra.role
    }
    if ('gender' in patch) {
      extra.gender = patch.gender == null ? null : String(patch.gender)
      writtenCols.gender = extra.gender
    }
    if ('age' in patch) {
      extra.age = patch.age == null ? null : Number(patch.age)
      writtenCols.age = extra.age
    }
    if ('race' in patch) {
      extra.race = patch.race == null ? null : String(patch.race)
      writtenCols.race = extra.race
    }
    if ('styleAnchors' in patch) {
      extra.styleAnchors = Array.isArray(patch.styleAnchors) ? patch.styleAnchors.map(String) : null
      writtenCols.styleAnchors = extra.styleAnchors ? JSON.stringify(extra.styleAnchors) : null
    }
    if ('outfitsExtra' in patch) {
      extra.outfitsExtra = Array.isArray(patch.outfitsExtra) ? patch.outfitsExtra.map(String) : null
      writtenCols.outfitsExtra = extra.outfitsExtra ? JSON.stringify(extra.outfitsExtra) : null
    }
    await (svc as CharacterAssetService).updateExtra(bindingId, extra)
  }

  // H11：写后核验——重查 binding，逐列比对实际值与本次写入的期望值；
  // 不符则按失败语义返回（防"声称已改但库里没变"，如 user_id scope 不匹配导致的静默 no-op）。
  const after = await getBindingById(m, kind, bindingId).catch(() => null)
  const mismatches: string[] = []
  if (!after) {
    mismatches.push('binding 行不存在')
  } else {
    for (const [col, expected] of Object.entries(writtenCols)) {
      const actual = (after as any)[col]
      if (String(actual ?? null) !== String(expected ?? null)) mismatches.push(col)
    }
  }
  if (mismatches.length > 0) {
    return {
      type: 'update_entity',
      status: 'error',
      message: `修改${assetLabel(kind)}「${params.name ?? bindingId}」实际未生效：数据库核验不符（${mismatches.join('、')} 未写入），请勿向用户声称已修改`,
      error: `DB 核验失败：${mismatches.join('、')} 与期望值不一致`,
      data: { assetType: kind, assetId: bindingId },
    }
  }

  return {
    type: 'update_entity',
    status: 'ok',
    message: `已修改${assetLabel(kind)}「${params.name ?? bindingId}」：${Object.keys(patch).join('、')}`,
    changed: ['assets'],
    data: { assetType: kind, assetId: bindingId },
    nav: { tab: 'asset', asset: { kind, id: bindingId, name: (params.name as string) ?? undefined } },
  }
}

/**
 * 删除资产（delete_entity）。
 * params: { type: 'character'|'location'|'item', id? / name? }
 */
async function executeDeleteEntity(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const { db } = ctx
  const m = db ?? getCoreDatabaseManager()
  const params = (action.params || {}) as Record<string, any>
  const kind = normalizeAssetKind(params.type)
  if (!kind) throw new Error('删除资产：缺少 type（character / location / item）')

  const projectId = await resolveProjectId(m, ctx.episodeId)
  if (!projectId) throw new Error('剧集所属项目不存在，无法删除资产')

  const bindingId = await resolveBindingId(m, kind, projectId, params)
  if (!bindingId) {
    const target = params.name ?? params.id ?? ''
    throw new Error(`项目中没有${assetLabel(kind)}「${target}」，无法删除`)
  }

  const svc = getAssetServiceFor(kind, m)
  await svc.delete(bindingId)

  // H11：写后核验——删除后重查，行必须不存在（防 repo.delete 静默 no-op，
  // 如 user_id scope 不匹配时"声称已删但库里还在"）。
  const stillThere = await getBindingById(m, kind, bindingId).catch(() => null)
  if (stillThere) {
    return {
      type: 'delete_entity',
      status: 'error',
      message: `删除${assetLabel(kind)}「${params.name ?? bindingId}」实际未生效：数据库核验发现记录仍存在，请勿向用户声称已删除`,
      error: 'DB 核验失败：删除后记录仍存在',
      data: { assetType: kind, assetId: bindingId },
    }
  }

  return {
    type: 'delete_entity',
    status: 'ok',
    message: `已删除${assetLabel(kind)}「${params.name ?? bindingId}」`,
    changed: ['assets'],
    data: { assetType: kind, assetId: bindingId },
    nav: { tab: 'asset' },
  }
}

/** 归一化资产类型参数（容错 AI 输出的别名） */
function normalizeAssetKind(raw: unknown): AssetKind | null {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'character' || v === '角色' || v === '人物') return 'character'
  if (v === 'location' || v === '地点' || v === '场景') return 'location'
  if (v === 'item' || v === '物品' || v === '道具') return 'item'
  return null
}

// ==================== 动作：query_database（外部数据库查询） ====================

/**
 * 只读 SQL 守卫（防 Agent 生成 / 提示词注入的 SQL 改外部库）。
 *
 * 防线（判定前先剥离字符串字面量与注释，避免 `SELECT 'delete'` 等误伤）：
 *  1. 语句必须以 select / with 开头；
 *  2. 拒绝多语句——剥离后出现分号且其后还有内容（`SELECT 1; DROP TABLE t`）；
 *  3. 拒绝写关键字——剥离后含 insert/update/delete/merge/drop/... 即拒，
 *     覆盖 CTE 写（`WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d`）与
 *     数据修改 CTE、`SELECT ... FOR UPDATE` 等伪装写法。
 *
 * 注意：本守卫不是完整 SQL 解析器，只读数据库账号仍是最终兜底（建议在设置页提示用户）。
 */
export function isReadOnlySql(sql: string): { ok: boolean; reason?: string } {
  const t = (sql ?? '').trim()
  if (!t) return { ok: false, reason: 'SQL 为空' }
  const stripped = stripSqlLiterals(t).trim()
  if (!/^(select|with)\b/i.test(stripped)) {
    return { ok: false, reason: '仅允许 SELECT 查询（写操作请在工作流「数据表」节点中显式配置）' }
  }
  // 多语句：剥离字符串后检查分号（允许语句末尾一个分号）
  const semiIdx = stripped.indexOf(';')
  if (semiIdx !== -1 && stripped.slice(semiIdx + 1).trim() !== '') {
    return { ok: false, reason: '仅允许单条查询语句（拒绝多语句）' }
  }
  // 写关键字（词边界；已剥离字符串字面量，列名/字符串里的字样不误伤）
  // 含 `into`：`SELECT ... INTO new_table`（POSTGRES/MySQL）会**建表/写文件**，
  // 属写操作却以 select 开头且无分号，不加 `into` 即可绕过只读守卫。
  if (/\b(insert|update|delete|merge|drop|alter|truncate|create|grant|revoke|copy|call|replace|vacuum|attach|detach|comment|reindex|do|execute|into)\b/i.test(stripped)) {
    return { ok: false, reason: '仅允许只读查询（检测到写操作关键字）' }
  }
  return { ok: true }
}

/** 剥离 SQL 字符串字面量 / 标识符引用 / 注释，返回只剩语法骨架的文本 */
function stripSqlLiterals(sql: string): string {
  return sql
    // 美元引用（$$...$$ 与 tag$$...$$）
    .replace(/([a-z_]*)\$\$[\s\S]*?\$\$/gi, ' ')
    // 单引号字符串（含 '' 转义）
    .replace(/'([^']|'')*'/g, ' ')
    // 双引号标识符（含 "" 转义）
    .replace(/"([^"]|"")*"/g, ' ')
    // 反引号标识符
    .replace(/`[^`]*`/g, ' ')
    // 行注释
    .replace(/--[^\n]*/g, ' ')
    // 块注释
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * 查询外部数据库（工作流数据源）。参数化 SQL，禁止字符串拼接（防注入）。
 * - params.dataSourceId（必填，数据源 id，用户经 choice 选择）
 * - params.sql（必填，SQL 模板，参数用 $1,$2 占位）
 * - params.params（可选，JSON 数组，与占位符一一对应）
 * 结果摘要：rows 前若干行 + 行数。不落库、不改剧集数据——纯读取。
 */
async function executeQueryDatabase(
  _ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const { getDataSourceService } = await import('@core/platform/workflow/datasource/datasource.service')
  const ds = getDataSourceService()
  const params = action.params || {}
  const dataSourceId = params.dataSourceId
  const sql = params.sql
  if (!dataSourceId || typeof dataSourceId !== 'string') {
    return { type: 'query_database', status: 'error', message: '查询数据库：缺少数据源（请先选择要查询的数据源）' }
  }
  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return { type: 'query_database', status: 'error', message: '查询数据库：缺少 SQL 语句' }
  }

  let parameters: unknown[] = []
  if (params.params !== undefined) {
    if (!Array.isArray(params.params)) {
      return { type: 'query_database', status: 'error', message: '查询数据库：params 必须是数组' }
    }
    parameters = params.params
  }

  // 只允许 SELECT 查询（防止 Agent 通过该动作改外部库数据；写操作走工作流节点显式配置）
  const guard = isReadOnlySql(sql)
  if (!guard.ok) {
    return { type: 'query_database', status: 'error', message: `查询数据库：${guard.reason}` }
  }

  try {
    // choice / 决策上下文提供给 Agent 的是数据源**名称**（用户可见），而执行按主键 id 查库。
    // 这里做 name→id 兜底：先按 id 精确匹配，失败则按启用名单中的名称精确匹配一次，
    // 否则原样交给 execute（其内部会报"数据源不存在"）。mock/降级环境下 get/listEligible
    // 可能不可用，用 try/catch 兜住，不影响主路径。
    let resolvedDataSourceId = dataSourceId
    try {
      const config = await ds.get(dataSourceId)
      if (!config) {
        const eligible = await ds.listEligible()
        const hit = eligible.find((s) => s.name === dataSourceId)
        if (hit) resolvedDataSourceId = hit.id
      }
    } catch {
      // 保持原 id 交给 execute 层反馈
    }
    const result = await ds.execute(resolvedDataSourceId, sql, parameters)
    const preview = result.rows.slice(0, 8)
    const previewText = JSON.stringify(preview).slice(0, 600)
    return {
      type: 'query_database',
      status: 'ok',
      message: `查询数据库成功：返回 ${result.rowCount} 行（${result.durationMs}ms）`,
      data: { columns: result.columns, rows: preview, rowCount: result.rowCount, full: false, previewText },
    }
  } catch (e: any) {
    return { type: 'query_database', status: 'error', message: `查询数据库失败：${e?.message || '未知错误'}`, error: e?.message }
  }
}


// ==================== 动作：后半程四件（2026-09-16 review 第一批·agent 视频制作闭环） ====================

/**
 * 批量分页纪律（0916 晚 review）：补缺省批量是"本集全部"，40+ 镜 × 分钟级产物极易
 * 超 30min 工具超时——按上限分页（模型带着"已完成 X/Y"回执自行续调）；关键帧/配音
 * 循环体在步边界感知 ctx.signal（用户取消/超时中止），已开始的一项无法打断，但后续不再启动。
 * 2026-09-16 S-04：视频/导出改 started 语义（见下方"分钟级任务启动器"）——动作只启动
 * 后台任务并立即返回，批量视频的后台循环逐段执行、终态补发 action:done。
 */
const KEYFRAME_BATCH_LIMIT = 8
const VIDEO_BATCH_LIMIT = 4
const AUDIO_BATCH_LIMIT = 6
function batchAborted(ctx: EpAgentExecutionContext): boolean {
  return ctx.signal?.aborted === true
}
function batchCapNote(remaining: number, limit: number): string {
  return remaining > 0 ? `；剩余 ${remaining} 个未生成（本轮上限 ${limit}，再次调用继续）` : ''
}
function batchAbortNote(interrupted: boolean): string {
  return interrupted ? '；执行被中止（取消/超时），未开始的项不再启动' : ''
}

// ==================== 分钟级任务启动器（2026-09-16 S-04 started 语义） ====================
//
// generateForSegment / exportEpisodeToMp4 均同步等到产物落地（视频 4~45 分钟/段），
// agent 工具不允许阻塞整轮：grace 窗口内同步捕获前置校验失败（缺视频/无入选分镜等
// 立即抛给模型自纠）；越过窗口视为"已启动"返回，终态经 action:done 事件与落库呈现。
// H11 核验语义相应调整为"任务确实起来了"（在途登记 + 前置校验通过），不承诺产物完成。

/** 启动宽限：视频=选模式/拼 prompt/提交 provider 的早期失败窗口；导出=时间线构建+末端硬锁校验窗口 */
const VIDEO_START_GRACE_MS = 12_000
const EXPORT_START_GRACE_MS = 15_000

/** 视频在途目标（segmentId 或 storyboardId）：进程内防重 guard，DB status 为最终事实 */
const inFlightVideoTargets = new Set<string>()
/** 导出在途（episodeId）：整集合成一集同时只允许一个 */
const inFlightExports = new Set<string>()

async function launchLongRunning<T>(
  job: Promise<T>,
  graceMs: number,
  onDone: (r: T) => void,
  onFail: (e: any) => void,
  flight?: { set: Set<string>; key: string },
): Promise<{ kind: 'started' } | { kind: 'finished'; result: T }> {
  let settled: { ok: boolean; value?: T; error?: any } | null = null
  const watched = job.then(
    (v) => { settled = { ok: true, value: v } },
    (e) => { settled = { ok: false, error: e } },
  )
  await Promise.race([watched, new Promise((r) => setTimeout(r, graceMs))])
  if (settled) {
    const s = settled as { ok: boolean; value?: T; error?: any }
    // grace 内落终态（含前置校验失败）：在途登记同步解除，不残留假 guard
    if (flight) flight.set.delete(flight.key)
    if (s.ok) return { kind: 'finished', result: s.value as T }
    throw s.error
  }
  void watched.then(() => {
    const s = settled as { ok: boolean; value?: T; error?: any } | null
    if (!s) return
    if (flight) flight.set.delete(flight.key)
    if (s.ok) onDone(s.value as T)
    else onFail(s.error)
  })
  return { kind: 'started' }
}

/** 后台终态回流：完成后补发 action:done（轮内 tap 已解订阅也不影响——事件总线留痕给任意订阅方） */
function emitBackgroundDone(
  ctx: EpAgentExecutionContext,
  summary: EpAgentActionSummary,
): void {
  try {
    ctx.emit({ type: 'action:done', summary })
  } catch { /* 轮结束后 emit 失败仅弃事件 */ }
}

/**
 * 生成关键帧（generate_keyframes）。
 * params: { storyboardId? , scriptId? }
 * 不传 storyboardId → 为本集全部"尚无关键帧图"的分镜生成（幂等，不重烧已有帧）。
 */
async function executeGenerateKeyframes(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const m = ctx.db ?? getCoreDatabaseManager()
  if (!m.dataSource) throw new Error('数据库未初始化')
  const scriptId = action.params?.scriptId
    ? String(action.params.scriptId)
    : await resolveScriptId(m, ctx.episodeId)
  if (!scriptId) throw new Error('剧本不存在，无法生成关键帧')

  const scenes = (await m.sceneScripts?.getByEpisodeScriptId?.(scriptId)) || []
  let targets: any[] = []
  for (const scene of scenes) {
    targets.push(...((await m.storyboards?.getBySceneScriptId?.(scene.id)) || []))
  }
  const wantStoryboardId = action.params?.storyboardId ? String(action.params.storyboardId) : ''
  if (wantStoryboardId) {
    targets = targets.filter((sb) => sb.id === wantStoryboardId)
    if (targets.length === 0) {
      throw new Error('指定的分镜不存在（id 需来自查询结果或用户消息，不要编造）')
    }
  } else {
    // 只补缺失：已有任一关键帧图的分镜跳过（重烧=白烧图费）
    const withImage = new Set<string>()
    for (const sb of targets) {
      try {
        const kfs = (await m.storyboardKeyframes?.listByStoryboard?.(sb.id)) || []
        if (kfs.some((kf: any) => !!kf.imageAssetId)) withImage.add(sb.id)
      } catch { /* 查询失败按未生成处理 */ }
    }
    targets = targets.filter((sb) => !withImage.has(sb.id))
  }
  if (targets.length === 0) {
    return { type: 'generate_keyframes', status: 'ok', message: '所有分镜都已有关键帧图，无需生成' }
  }

  const svc = new KeyframeGenerationService(m.dataSource)
  let done = 0
  let interrupted = false
  const failed: string[] = []
  const batch = targets.slice(0, KEYFRAME_BATCH_LIMIT)
  for (const sb of batch) {
    if (batchAborted(ctx)) {
      interrupted = true
      break
    }
    ctx.emit({
      type: 'action:start',
      actionType: 'generate_keyframes',
      label: `生成关键帧 ${done + 1}/${targets.length}`,
    })
    try {
      await svc.generateKeyframesForStoryboard({ storyboardId: sb.id })
      done++
    } catch (e: any) {
      failed.push(`分镜${sb.shotNumber}:${e?.message || '未知错误'}`)
    }
  }
  const suffix = failed.length > 0 ? `；失败 ${failed.length} 个（${failed.slice(0, 3).join('、')}）` : ''
  return {
    type: 'generate_keyframes',
    status: done > 0 ? 'ok' : 'error',
    message: `已为 ${done}/${targets.length} 个分镜生成关键帧${suffix}${batchCapNote(targets.length - batch.length, KEYFRAME_BATCH_LIMIT)}${batchAbortNote(interrupted)}`,
    changed: ['storyboards'],
    data: { generated: done, total: targets.length },
    nav: { tab: 'storyboard' },
  }
}

/**
 * 生成分镜/片段视频（generate_segment_video）。
 * params: { segmentId? / storyboardId? / providerConfigId? / modelId? }
 * 都不传 → 为本集全部缺视频的片段逐个后台生成（无片段时先自动分段）。
 *
 * 模型解析序（2026-09-16 S-04）：显式参数 > 项目设置 config.videoModel > 自动挑第一个
 * 启用的视频模型；全落空 → 引导错误。quality/steps 由服务层读项目 config.videoQuality/
 * videoSteps（resolveVideoParamsForEpisode，未配置 → provider 默认 high/20）。
 *
 * started 语义：generateForSegment 同步等产物落地（分钟级），动作只"启动+确认已启动"——
 * grace 窗口内前置校验失败同步报错；越过窗口返回"已启动，需数分钟"，终态补发 action:done。
 *
 * 批量主路径（2026-10-04 一致性修复第三批 V3）：批量默认走片段级
 * SegmentVideoService.generateForSegment（尊重项目 renderPath=assetRef 缺省 + provider 守卫），
 * 逐分镜的旧单镜路径只在显式指定 storyboardId 时使用——旧批量路径无关键帧时
 * text2video 打 ComfyUI H3（textToVideo:false）必败。
 */
async function executeGenerateSegmentVideo(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const m = ctx.db ?? getCoreDatabaseManager()
  if (!m.dataSource) throw new Error('数据库未初始化')

  let providerConfigId = action.params?.providerConfigId ? String(action.params.providerConfigId) : undefined
  let modelId = action.params?.modelId ? String(action.params.modelId) : undefined
  if (!providerConfigId || !modelId) {
    // 项目设置优先（与分镜/合成页下拉默认同源：config.videoModel）
    try {
      const project = await m.videoProjects?.getById?.(ctx.projectId)
      const vm = (project?.config as Record<string, any> | undefined)?.videoModel
      if (vm?.providerConfigId && vm?.modelId) {
        providerConfigId = providerConfigId ?? String(vm.providerConfigId)
        modelId = modelId ?? String(vm.modelId)
      }
    } catch { /* 项目配置读取失败继续走自动挑选 */ }
  }
  if (!providerConfigId || !modelId) {
    // 自动挑选：第一个启用 provider 里的第一个 video 模型（与文本模型兜底同策略）
    const cfgs = (await m.providerConfigs?.getEnabled?.()) || []
    outer: for (const c of cfgs) {
      for (const mm of (c.models ?? []) as Array<{ id?: string; type?: string }>) {
        if (mm.type === 'video' && mm.id) {
          providerConfigId = providerConfigId ?? c.id
          modelId = modelId ?? mm.id
          break outer
        }
      }
    }
    if (!providerConfigId || !modelId) {
      throw new Error('未配置视频模型：请先在 项目设置 → 视频模型（或 设置 → 提供商配置）中选择/启用视频模型（如 wan2.x-i2v / kling-v2），然后再让我生成视频')
    }
  }
  const { adapter, reason } = await createAdapterForProviderWithReason(providerConfigId, modelId)
  if (!adapter) throw new Error(`创建视频适配失败：${reason}`)

  const segmentId = action.params?.segmentId ? String(action.params.segmentId) : ''
  const storyboardId = action.params?.storyboardId ? String(action.params.storyboardId) : ''

  if (segmentId) {
    // 归属校验（0916 review 多租户防线）：姊妹工具都按本集 targets 过滤 id，唯独视频
    // 曾把模型给的任意 id 直通服务层全库查找并写库+烧费——对话注入他项目 id 即越权。
    const seg = await m.dataSource
      .getRepository(EpVideoSegmentEntity)
      .findOne({ where: { id: segmentId } as any })
    if (!seg || seg.episodeId !== ctx.episodeId) {
      throw new Error('指定的片段不存在于当前剧集（id 需来自查询结果或用户消息，不要编造）')
    }
    if (seg.status === 'generating' || inFlightVideoTargets.has(segmentId)) {
      return {
        type: 'generate_segment_video',
        status: 'ok',
        message: '该片段视频已在生成中（后台任务，需数分钟），完成后片段状态会变为已完成，请勿重复启动',
        changed: ['compose'],
        data: { segmentId, started: false, alreadyRunning: true },
        nav: { tab: 'compose' },
      }
    }
    const svc = new SegmentVideoService(m.dataSource, adapter)
    inFlightVideoTargets.add(segmentId)
    const outcome = await launchLongRunning(
      svc.generateForSegment({ segmentId, providerId: providerConfigId, modelId }),
      VIDEO_START_GRACE_MS,
      (r) => {
        emitBackgroundDone(ctx, {
          type: 'generate_segment_video',
          status: 'ok',
          message: `片段视频已完成（模式 ${r.match.mode}，${r.output.durationSec}s），联动 ${r.completedStoryboardIds.length} 个分镜`,
          changed: ['storyboards', 'compose'],
          data: { segmentId, mode: r.match.mode, durationSec: r.output.durationSec },
          nav: { tab: 'compose' },
        })
      },
      (e) => {
        emitBackgroundDone(ctx, {
          type: 'generate_segment_video',
          status: 'error',
          message: `片段视频生成失败：${e?.message || '未知错误'}`,
          error: e?.message || '未知错误',
          data: { segmentId },
        })
      },
      { set: inFlightVideoTargets, key: segmentId },
    )
    if (outcome.kind === 'finished') {
      const r = outcome.result
      return {
        type: 'generate_segment_video',
        status: 'ok',
        message: `片段视频已生成（模式 ${r.match.mode}，${r.output.durationSec}s），联动 ${r.completedStoryboardIds.length} 个分镜`,
        changed: ['storyboards', 'compose'],
        data: { segmentId, mode: r.match.mode, durationSec: r.output.durationSec },
        nav: { tab: 'compose' },
      }
    }
    return {
      type: 'generate_segment_video',
      status: 'ok',
      message: `片段视频生成已启动（后台执行，需数分钟；完成后片段状态自动变为已完成，不要重复调用或等待）。视频模型：${modelId}`,
      changed: ['storyboards', 'compose'],
      data: { segmentId, started: true, providerConfigId, modelId },
      nav: { tab: 'compose' },
    }
  }

  if (storyboardId) {
    // 同上：storyboardId 也校验本集归属
    const scriptIdForCheck = await resolveScriptId(m, ctx.episodeId)
    const scenesForCheck = scriptIdForCheck
      ? (await m.sceneScripts?.getByEpisodeScriptId?.(scriptIdForCheck)) || []
      : []
    const validSbIds = new Set<string>()
    for (const sc of scenesForCheck) {
      for (const sb of (await m.storyboards?.getBySceneScriptId?.(sc.id)) || []) validSbIds.add(sb.id)
    }
    if (!validSbIds.has(storyboardId)) {
      throw new Error('指定的分镜不存在于当前剧集（id 需来自查询结果或用户消息，不要编造）')
    }
    if (inFlightVideoTargets.has(storyboardId)) {
      return {
        type: 'generate_segment_video',
        status: 'ok',
        message: '该分镜视频已在生成中（后台任务，需数分钟），请勿重复启动',
        changed: ['storyboards'],
        data: { storyboardId, started: false, alreadyRunning: true },
      }
    }
    const svc = new VideoSegmentService(m.dataSource, adapter)
    inFlightVideoTargets.add(storyboardId)
    const outcome = await launchLongRunning(
      svc.generateForStoryboard({ storyboardId, providerId: providerConfigId, modelId }),
      VIDEO_START_GRACE_MS,
      (r) => {
        emitBackgroundDone(ctx, {
          type: 'generate_segment_video',
          status: 'ok',
          message: `分镜视频已完成（模式 ${r.match.mode}，${r.output.durationSec}s）`,
          changed: ['storyboards'],
          data: { storyboardId, mode: r.match.mode, durationSec: r.output.durationSec },
          nav: { tab: 'storyboard' },
        })
      },
      (e) => {
        emitBackgroundDone(ctx, {
          type: 'generate_segment_video',
          status: 'error',
          message: `分镜视频生成失败：${e?.message || '未知错误'}`,
          error: e?.message || '未知错误',
          data: { storyboardId },
        })
      },
      { set: inFlightVideoTargets, key: storyboardId },
    )
    if (outcome.kind === 'finished') {
      const r = outcome.result
      return {
        type: 'generate_segment_video',
        status: 'ok',
        message: `分镜视频已生成（模式 ${r.match.mode}，${r.output.durationSec}s）`,
        changed: ['storyboards'],
        data: { storyboardId, mode: r.match.mode, durationSec: r.output.durationSec },
        nav: { tab: 'storyboard' },
      }
    }
    return {
      type: 'generate_segment_video',
      status: 'ok',
      message: `分镜视频生成已启动（后台执行，需数分钟；完成后分镜状态自动变为已完成，不要重复调用或等待）。视频模型：${modelId}`,
      changed: ['storyboards'],
      data: { storyboardId, started: true, providerConfigId, modelId },
      nav: { tab: 'storyboard' },
    }
  }

  // 批量（V3）：本集全部缺视频片段——片段级 generateForSegment 后台逐段执行，
  // 动作立即返回"已启动"。片段按 episodeId 查询，天然满足本集归属校验。
  const scriptId = await resolveScriptId(m, ctx.episodeId)
  if (!scriptId) throw new Error('剧本不存在，无法生成分镜视频')
  const scenes = (await m.sceneScripts?.getByEpisodeScriptId?.(scriptId)) || []
  // 双口径（与第一批 Task4 同一思想）：片段本身无成片，但片内分镜均已有单镜视频
  // （旧单镜路径产物，导出时间线双口径可用）→ 不再重烧整段
  const sbHasOwnVideo = new Map<string, boolean>()
  for (const scene of scenes) {
    const sbs = (await m.storyboards?.getBySceneScriptId?.(scene.id)) || []
    for (const sb of sbs as any[]) sbHasOwnVideo.set(sb.id, !!sb.videoPath)
  }
  const segSvc = new EpSegmentationService(m.dataSource)
  // 无 live 片段、或存在不属于任何 live 片段的孤儿分镜（重生分镜后旧段 superseded）
  // 时先 recompute 分段（幂等：completed/generating 段保留，其余按当前分镜重切——
  // V6 守卫保证 generating 段不被删，其分镜计入 live 归属、不会误判孤儿；
  // 口径与前端 StageStoryboardView.autoEnsureSegments 一致，preview 默认排除 superseded）
  let preview = await segSvc.preview(ctx.episodeId)
  const segmentedIds = new Set<string>()
  for (const seg of preview.segments) for (const id of seg.storyboardIds) segmentedIds.add(id)
  const hasOrphanShots = [...sbHasOwnVideo.keys()].some((id) => !segmentedIds.has(id))
  if (preview.segments.length === 0 || hasOrphanShots) {
    preview = await segSvc.recompute(ctx.episodeId)
  }
  const targets = preview.segments.filter((seg) =>
    seg.status !== 'generating'
    && !segmentProvidesVideo(seg)
    && seg.storyboardIds.some((id) => !sbHasOwnVideo.get(id))
    && !inFlightVideoTargets.has(seg.segmentId))
  if (targets.length === 0) {
    return { type: 'generate_segment_video', status: 'ok', message: '所有片段都已有视频或正在生成中，无需启动' }
  }
  const svc = new SegmentVideoService(m.dataSource, adapter)
  const batch = targets.slice(0, VIDEO_BATCH_LIMIT)
  for (const seg of batch) inFlightVideoTargets.add(seg.segmentId)
  const totalTargets = targets.length
  void (async () => {
    let done = 0
    let interrupted = false
    const failed: string[] = []
    for (let i = 0; i < batch.length; i++) {
      const seg = batch[i]
      if (batchAborted(ctx)) {
        interrupted = true
        // 未开始的项同步解除在途登记，避免残留假 guard 挡住后续调用
        for (let j = i; j < batch.length; j++) inFlightVideoTargets.delete(batch[j].segmentId)
        break
      }
      ctx.emit({
        type: 'action:start',
        actionType: 'generate_segment_video',
        label: `生成片段视频 ${done + 1}/${batch.length}`,
      })
      try {
        await svc.generateForSegment({ segmentId: seg.segmentId, providerId: providerConfigId, modelId })
        done++
      } catch (e: any) {
        failed.push(`片段#${seg.seq}:${e?.message || '未知错误'}`)
      } finally {
        inFlightVideoTargets.delete(seg.segmentId)
      }
    }
    const suffix = failed.length > 0 ? `；失败 ${failed.length} 个（${failed.slice(0, 3).join('、')}）` : ''
    emitBackgroundDone(ctx, {
      type: 'generate_segment_video',
      status: done > 0 ? 'ok' : 'error',
      message: `后台片段视频批次完成：成功 ${done}/${batch.length}${suffix}${batchAbortNote(interrupted)}`,
      changed: ['storyboards', 'compose'],
      data: { generated: done, batch: batch.length, total: totalTargets },
      nav: { tab: 'compose' },
    })
  })().catch(() => { /* 循环体内已逐项捕获；兜底防未处理拒绝 */ })
  return {
    type: 'generate_segment_video',
    status: 'ok',
    message: `已启动 ${batch.length}/${totalTargets} 个片段视频的后台生成（逐段执行，每段需数分钟，完成后状态自动更新，不要重复调用或等待）${batchCapNote(totalTargets - batch.length, VIDEO_BATCH_LIMIT)}。视频模型：${modelId}`,
    changed: ['storyboards', 'compose'],
    data: { started: true, batch: batch.length, total: totalTargets, providerConfigId, modelId },
    nav: { tab: 'compose' },
  }
}

/**
 * 场景配音（generate_scene_audio）：对白 + 旁白 TTS，产物落库（audioAsset/narration_audio_path），
 * 导出时自动混入音轨。
 * params: { sceneId? }；不传 → 为本集全部未配音场景生成。
 */
async function executeGenerateSceneAudio(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const m = ctx.db ?? getCoreDatabaseManager()
  if (!m.dataSource) throw new Error('数据库未初始化')
  const scriptId = await resolveScriptId(m, ctx.episodeId)
  if (!scriptId) throw new Error('剧本不存在，无法配音')

  let scenes = (await m.sceneScripts?.getByEpisodeScriptId?.(scriptId)) || []
  const wantSceneId = action.params?.sceneId ? String(action.params.sceneId) : ''
  if (wantSceneId) {
    scenes = scenes.filter((s: any) => s.id === wantSceneId)
    if (scenes.length === 0) throw new Error('指定的场景不存在')
  } else {
    scenes = scenes.filter((s: any) => {
      if ((s as any).narrationAudioPath) return false
      return !((s as any).dialogues ?? []).some((d: any) => !!d?.audioAsset?.audioPath)
    })
  }
  if (scenes.length === 0) {
    return { type: 'generate_scene_audio', status: 'ok', message: '所有场景都已有配音，无需生成' }
  }

  const svc = new SceneAudioOrchestratorService(m.dataSource)
  const userDataPath = getPathProvider().getUserDataPath()
  let done = 0
  let fallbackCount = 0
  let interrupted = false
  const failed: string[] = []
  const batch = scenes.slice(0, AUDIO_BATCH_LIMIT)
  for (const scene of batch) {
    if (batchAborted(ctx)) {
      interrupted = true
      break
    }
    ctx.emit({
      type: 'action:start',
      actionType: 'generate_scene_audio',
      label: `生成配音 ${done + 1}/${scenes.length}（场景${scene.sceneNumber}）`,
    })
    try {
      const result = await svc.orchestrateScene({
        sceneScriptId: scene.id,
        outputDir: path.join(userDataPath, 'episode-production', 'audio', scene.id),
      })
      await svc.persistToScene(scene.id, result)
      fallbackCount += result.fallbackDialogueCount
      // 假成功防线与 UI 同口径（0916 晚复核 P1）：有待合成内容却一条产物都没有 → 视为失败。
      // 注意无旁白文本的场景 narrationFailed 恒 false，须同时看对白失败数。
      const producedAny = !!result.narrationPath || result.dialoguePaths.size > 0
      if ((result.narrationFailed || result.dialogueFailCount > 0) && !producedAny) {
        failed.push(`场景${scene.sceneNumber}:配音生成失败（旁白与全部对白均未合成成功）`)
      } else {
        done++
      }
    } catch (e: any) {
      failed.push(`场景${scene.sceneNumber}:${e?.message || '未知错误'}`)
    }
  }
  const fallbackNote = fallbackCount > 0 ? `（${fallbackCount} 条对白用了系统默认音色，可在资产页为角色绑定音色）` : ''
  const suffix = failed.length > 0 ? `；失败 ${failed.length} 个（${failed.slice(0, 3).join('、')}）` : ''
  return {
    type: 'generate_scene_audio',
    status: done > 0 ? 'ok' : 'error',
    message: `已为 ${done}/${scenes.length} 个场景生成配音${fallbackNote}${suffix}${batchCapNote(scenes.length - batch.length, AUDIO_BATCH_LIMIT)}${batchAbortNote(interrupted)}`,
    changed: ['scenes'],
    data: { generated: done, total: scenes.length },
  }
}

/**
 * 整集导出 MP4（export_mp4）：合成末端硬锁 + 音轨混入（含 TTS）+ 状态闭环（composing/completed）。
 * params: { outputPath?, burnSubtitles? }
 *
 * started 语义（2026-09-16 S-04）：ffmpeg 合成为分钟级，动作只"启动+确认已启动"——
 * grace 窗口内完成时间线构建与末端硬锁校验（缺视频/无入选分镜立即同步报错）；
 * 越过窗口返回"已启动"，终态补发 action:done。同一剧集同时只允许一个导出任务。
 */
async function executeExportMp4(
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const m = ctx.db ?? getCoreDatabaseManager()
  if (!m.dataSource) throw new Error('数据库未初始化')
  const scriptId = await resolveScriptId(m, ctx.episodeId)
  if (!scriptId) throw new Error('剧本不存在，无法导出')

  if (inFlightExports.has(ctx.episodeId)) {
    return {
      type: 'export_mp4',
      status: 'ok',
      message: '本集已有导出任务在后台执行中，请勿重复启动（完成后剧集状态会变为已完成）',
      changed: ['compose'],
      data: { started: false, alreadyRunning: true },
      nav: { tab: 'compose' },
    }
  }

  const { EpisodeMp4ExporterService } = await import('../compose/episode-mp4-exporter.service')
  // 惰性 import：runner 引 fs/fluent-ffmpeg 与 ffmpeg binary 探测，仅在真导出时加载
  const { FluentFfmpegRunner, NodeFileWriter } = await import(
    '@core/packs/episode-production/handlers/compose/episode-mp4-exporter.runner'
  )

  const userDataPath = getPathProvider().getUserDataPath()
  const defaultDir = path.join(userDataPath, 'episode-production', 'exports')
  let outputPath = action.params?.outputPath ? String(action.params.outputPath).trim() : ''
  if (!outputPath) {
    outputPath = path.join(defaultDir, `${scriptId}-${Date.now()}.mp4`)
  } else {
    // 安全收口（0916 review）：导出路径强制落在应用导出目录内——只接受文件名，
    // 绝对路径/目录穿越一律拒绝（此前模型被对话注入即可用 mp4 内容覆盖任意可写文件）
    if (path.isAbsolute(outputPath)) {
      throw new Error(`outputPath 只接受文件名（导出固定写入 ${defaultDir}），不要传绝对路径`)
    }
    if (outputPath.split(/[\\/]/).some((seg) => seg === '..')) {
      throw new Error('outputPath 不允许包含 ..（导出固定写入应用导出目录）')
    }
    outputPath = path.join(defaultDir, outputPath)
  }
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const svc = new EpisodeMp4ExporterService(
    m.dataSource,
    new FluentFfmpegRunner(),
    new NodeFileWriter('default'),
  )
  inFlightExports.add(ctx.episodeId)
  const outcome = await launchLongRunning(
    svc.exportEpisodeToMp4({
      episodeScriptId: scriptId,
      outputPath,
      burnSubtitles: action.params?.burnSubtitles !== false,
    }),
    EXPORT_START_GRACE_MS,
    (result) => {
      emitBackgroundDone(ctx, {
        type: 'export_mp4',
        status: 'ok',
        message: `MP4 导出完成（${(result.durationSec || 0).toFixed(1)}s）：${result.outputPath}`,
        changed: ['compose'],
        data: { outputPath: result.outputPath, durationSec: result.durationSec },
        nav: { tab: 'compose' },
      })
    },
    (e) => {
      emitBackgroundDone(ctx, {
        type: 'export_mp4',
        status: 'error',
        message: `MP4 导出失败：${e?.message || '未知错误'}`,
        error: e?.message || '未知错误',
        data: { outputPath },
      })
    },
    { set: inFlightExports, key: ctx.episodeId },
  )
  if (outcome.kind === 'finished') {
    const result = outcome.result
    return {
      type: 'export_mp4',
      status: 'ok',
      message: `已导出 MP4（${(result.durationSec || 0).toFixed(1)}s）：${result.outputPath}`,
      changed: ['compose'],
      data: { outputPath: result.outputPath, durationSec: result.durationSec },
      nav: { tab: 'compose' },
    }
  }
  return {
    type: 'export_mp4',
    status: 'ok',
    message: `导出已启动（后台合成需数分钟）：${outputPath}。完成后剧集状态自动变为已完成、文件写入应用导出目录，不要重复调用或等待`,
    changed: ['compose'],
    data: { outputPath, started: true },
    nav: { tab: 'compose' },
  }
}


/** 供测试用的 standalone 纯度导出（可选） */
export const __epAgentTest = {
  extractJsonObject,
  resolveScriptId,
  executeQueryDatabase,
  isReadOnlySql,
}
