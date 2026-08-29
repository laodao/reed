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
    if (byId) return byId.id
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

  // 身份块字段（name/description/appearance/outfit）按 sourceType 分发
  if (binding?.sourceType === 'standalone') {
    const sp: Partial<{ name: string; description: string }> = {}
    if ('name' in patch && patch.name != null) sp.name = String(patch.name)
    if ('description' in patch && patch.description != null) sp.description = String(patch.description)
    await svc.updateStandalone(bindingId, sp)
  } else {
    const op: Partial<{
      name: string | null
      description: string | null
      appearance: string | null
      outfit: string | null
    }> = {}
    if ('name' in patch) op.name = patch.name == null ? null : String(patch.name)
    if ('description' in patch) op.description = patch.description == null ? null : String(patch.description)
    if ('appearance' in patch && kind === 'character') op.appearance = patch.appearance == null ? null : String(patch.appearance)
    if ('outfit' in patch && kind === 'character') op.outfit = patch.outfit == null ? null : String(patch.outfit)
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
    if ('alias' in patch) extra.alias = patch.alias == null ? null : String(patch.alias)
    if ('role' in patch) extra.role = patch.role == null ? null : String(patch.role)
    if ('gender' in patch) extra.gender = patch.gender == null ? null : String(patch.gender)
    if ('age' in patch) extra.age = patch.age == null ? null : Number(patch.age)
    if ('race' in patch) extra.race = patch.race == null ? null : String(patch.race)
    if ('styleAnchors' in patch) extra.styleAnchors = Array.isArray(patch.styleAnchors) ? patch.styleAnchors.map(String) : null
    if ('outfitsExtra' in patch) extra.outfitsExtra = Array.isArray(patch.outfitsExtra) ? patch.outfitsExtra.map(String) : null
    await (svc as CharacterAssetService).updateExtra(bindingId, extra)
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
  ctx: EpAgentExecutionContext,
  action: EpAgentAction,
): Promise<EpAgentActionSummary> {
  const { getDataSourceService } = await import('@core/modules/workflow/datasource/datasource.service')
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

/** 供测试用的 standalone 纯度导出（可选） */
export const __epAgentTest = {
  extractJsonObject,
  resolveScriptId,
  executeQueryDatabase,
  isReadOnlySql,
}
