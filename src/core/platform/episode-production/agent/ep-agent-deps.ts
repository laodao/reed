/**
 * 剧集制作 Agent 引擎：生产状态计算 + 依赖规则 + 下一步建议
 * @module platform/episode-production/agent/ep-agent-deps
 *
 * 状态以 episode 为粒度（单集制作），资产为项目级（所有剧集共享）。
 * 依赖规则与下一步建议只做"最小前置约束"，顺序/决策由 AI 推进。
 */

import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'
import { LocationAssetService } from '@core/platform/episode-production/assets/services/location-asset.service'
import { ItemAssetService } from '@core/platform/episode-production/assets/services/item-asset.service'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import type { EpAgentActionType, EpAgentProductionState } from './ep-agent.types'

// ==================== 状态计算 ====================

export async function computeEpProductionState(
  db: any,
  projectId: string,
  episodeId: string,
): Promise<EpAgentProductionState> {
  const ds = db?.dataSource ?? null

  const state: EpAgentProductionState = {
    episode: {
      id: episodeId,
      title: null,
      episodeNumber: null,
      status: null,
      hasScript: false,
      synopsis: null,
      scriptContent: null,
      composedVideoPath: null,
    },
    scenes: { total: 0, countWithBindings: 0, locations: [] },
    storyboards: { total: 0, scenesCovered: 0, scenesTotal: 0 },
    assets: { characters: { count: 0, names: [] }, locations: { count: 0, names: [] }, items: { count: 0, names: [] } },
    production: { storyboardsWithVideo: 0, storyboardsWithKeyframes: 0, scenesWithAudio: 0 },
    dataSources: [],
  }

  if (!db || !episodeId) return state

  // 1. episode
  try {
    const ep = await db.videoEpisodes?.getById?.(episodeId)
    if (ep) {
      state.episode.title = ep.title ?? null
      state.episode.episodeNumber = ep.episodeNumber ?? null
      state.episode.status = ep.status ?? null
      state.episode.hasScript = !!ep.scriptId
      state.episode.composedVideoPath = (ep as any).composedVideoPath ?? null
      if (ep.scriptId) {
        const script = await db.episodeScripts?.getById?.(ep.scriptId)
        if (script) {
          state.episode.synopsis = script.synopsis ?? null
          state.episode.scriptContent = script.scriptContent ?? null
        }
      }
    }
  } catch (e) {
    console.warn('[EpAgent] 读取 episode 失败', e)
  }

  // 2. scenes（需要 scriptId）
  let cachedScenes: any[] | null = null
  try {
    const scriptId = await resolveScriptId(db, episodeId)
    if (scriptId) {
      const scenes = (await db.sceneScripts?.getByEpisodeScriptId?.(scriptId)) || []
      cachedScenes = scenes
      state.scenes.total = scenes.length
      state.scenes.locations = Array.from(
        new Set(scenes.map((s: any) => s.location).filter(Boolean)),
      ).slice(0, 8)
      state.scenes.countWithBindings = scenes.filter(
        (s: any) => s.locationBindingId || (s.characters?.length ?? 0) > 0,
      ).length
      // 配音进度（P0-CM1）：旁白音频或任一对白有音频产物即视为已配音
      state.production!.scenesWithAudio = scenes.filter((s: any) => {
        if ((s as any).narrationAudioPath) return true
        return ((s as any).dialogues ?? []).some((d: any) => !!d?.audioAsset?.audioPath)
      }).length
    }
  } catch (e) {
    console.warn('[EpAgent] 读取 scenes 失败', e)
  }

  // 3. storyboards（跨所有场景聚合）
  try {
    if (cachedScenes) {
      const scenes = cachedScenes
      state.storyboards.scenesTotal = scenes.length
      let total = 0
      let withVideo = 0
      let withKeyframes = 0
      const covered = new Set<string>()
      for (const scene of scenes) {
        const sbs = (await db.storyboards?.getBySceneScriptId?.(scene.id)) || []
        if (sbs.length > 0) covered.add(scene.id)
        total += sbs.length
        withVideo += sbs.filter((sb: any) => !!sb.videoPath).length
        for (const sb of sbs) {
          try {
            const kfs = (await db.storyboardKeyframes?.listByStoryboard?.(sb.id)) || []
            if (kfs.some((kf: any) => !!kf.imageAssetId)) withKeyframes++
          } catch { /* 单分镜关键帧查询失败不阻断统计 */ }
        }
      }
      state.storyboards.total = total
      state.storyboards.scenesCovered = covered.size
      state.production!.storyboardsWithVideo = withVideo
      state.production!.storyboardsWithKeyframes = withKeyframes
    }
  } catch (e) {
    console.warn('[EpAgent] 读取 storyboards 失败', e)
  }

  // 4. assets（项目级）
  try {
    if (ds) {
      const imageSvc = new AssetImageService(ds)
      const charSvc = new CharacterAssetService(ds)
      const locSvc = new LocationAssetService(ds, imageSvc)
      const itemSvc = new ItemAssetService(ds)

      const [chars, locs, items] = await Promise.all([
        charSvc.listByProject(projectId),
        locSvc.listByProject(projectId),
        itemSvc.listByProject(projectId),
      ])
      state.assets.characters.count = chars.length
      state.assets.locations.count = locs.length
      state.assets.items.count = items.length

      // 用 effective data 拿名字
      for (const c of chars.slice(0, 8)) {
        try {
          state.assets.characters.names.push((await charSvc.getEffectiveData(c.id)).name)
        } catch { /* skip */ }
      }
      for (const l of locs.slice(0, 8)) {
        try {
          state.assets.locations.names.push((await locSvc.getEffectiveData(l.id)).name)
        } catch { /* skip */ }
      }
      for (const i of items.slice(0, 8)) {
        try {
          state.assets.items.names.push((await itemSvc.getEffectiveData(i.id)).name)
        } catch { /* skip */ }
      }
    }
  } catch (e) {
    console.warn('[EpAgent] 读取 assets 失败', e)
  }

  // 5. 数据源名单（query_database 决策依据；0916 review P1-AG2：harness 快照此前无名单，
  //    模型无从枚举 dataSourceId，工具基本不可用）
  try {
    const { getDataSourceService } = await import('@core/platform/workflow/datasource/datasource.service')
    const eligible = await getDataSourceService().listEligible()
    state.dataSources = eligible
      .slice(0, 5)
      .map((s: { id: string; name: string }) => `${s.name}（${s.id}）`)
  } catch {
    state.dataSources = []
  }

  return state
}

/** 解析 episode 的 scriptId（ep.scriptId 或 ep.episodeScriptId 兜底） */
async function resolveScriptId(db: any, episodeId: string): Promise<string | null> {
  try {
    const ep = await db.videoEpisodes?.getById?.(episodeId)
    if (ep?.scriptId) return ep.scriptId
    if (ep?.episodeScriptId) return ep.episodeScriptId
    const script = await db.episodeScripts?.getByEpisodeId?.(episodeId)
    return script?.id ?? null
  } catch {
    return null
  }
}

// ==================== 状态摘要（喂给 AI 决策） ====================

export function epStateToSummary(s: EpAgentProductionState): string {
  const lines: string[] = []

  lines.push(
    `剧集：${s.episode.title || '未命名'}${s.episode.episodeNumber ? `（第 ${s.episode.episodeNumber} 集）` : ''}` +
      `，状态：${s.episode.status || '未开始'}`,
  )

  lines.push(
    `剧本：${s.episode.hasScript ? '已生成✓' : '未生成✗'}` +
      (s.episode.synopsis ? `，梗概：${s.episode.synopsis.slice(0, 50)}${s.episode.synopsis.length > 50 ? '…' : ''}` : ''),
  )

  lines.push(
    `场景：共 ${s.scenes.total} 场` +
      (s.scenes.locations.length > 0 ? `，地点：${s.scenes.locations.slice(0, 5).join('、')}` : ''),
  )

  lines.push(
    `分镜：共 ${s.storyboards.total} 个镜头` +
      (s.storyboards.scenesTotal > 0 ? `，覆盖 ${s.storyboards.scenesCovered}/${s.storyboards.scenesTotal} 场` : ''),
  )

  lines.push(
    `资产（项目级）：角色 ${s.assets.characters.count} 位` +
      (s.assets.characters.names.length > 0 ? `（${s.assets.characters.names.slice(0, 5).join('、')}）` : '') +
      `、地点 ${s.assets.locations.count} 处` +
      (s.assets.locations.names.length > 0 ? `（${s.assets.locations.names.slice(0, 3).join('、')}）` : '') +
      `、物品 ${s.assets.items.count} 件` +
      (s.assets.items.names.length > 0 ? `（${s.assets.items.names.slice(0, 3).join('、')}）` : ''),
  )

  return lines.join('\n')
}

// ==================== 依赖规则 ====================

const ACTION_DEPENDENCIES: Record<EpAgentActionType, (s: EpAgentProductionState) => string[]> = {
  generate_script: () => [],
  split_scenes: (s) => (s.episode.hasScript ? [] : ['剧本']),
  generate_storyboards: (s) => (s.scenes.total > 0 ? [] : ['场景']),
  generate_keyframes: (s) => (s.storyboards.total > 0 ? [] : ['分镜']),
  generate_segment_video: (s) => (s.storyboards.total > 0 ? [] : ['分镜']),
  generate_scene_audio: (s) => (s.scenes.total > 0 ? [] : ['场景']),
  export_mp4: (s) => (s.storyboards.total > 0 ? [] : ['分镜']),
  generate_char_asset: () => [],
  generate_location_asset: () => [],
  generate_item_asset: () => [],
  update_entity: () => [],
  delete_entity: () => [],
  query_database: () => [],
}

export function checkEpActionDependency(
  type: EpAgentActionType,
  state: EpAgentProductionState,
): { ok: boolean; missing: string[] } {
  const dep = ACTION_DEPENDENCIES[type]
  if (!dep) return { ok: true, missing: [] }
  const missing = dep(state)
  return { ok: missing.length === 0, missing }
}

// ==================== 下一步建议 ====================

export function buildEpSuggestions(state: EpAgentProductionState): string[] {
  const suggestions: string[] = []
  const prod = state.production ?? { storyboardsWithVideo: 0, storyboardsWithKeyframes: 0, scenesWithAudio: 0 }

  if (!state.episode.hasScript) {
    suggestions.push('帮我生成这集的剧本')
  } else if (state.scenes.total === 0) {
    suggestions.push('从剧本拆出场景')
  }

  if (state.scenes.total > 0 && state.storyboards.total === 0) {
    suggestions.push('为所有场景生成分镜')
  }

  if (state.storyboards.total > 0 && prod.storyboardsWithKeyframes < state.storyboards.total) {
    suggestions.push('为分镜生成关键帧')
  }

  if (state.storyboards.total > 0 && prod.storyboardsWithVideo < state.storyboards.total) {
    suggestions.push('为分镜生成视频')
  }

  if (state.scenes.total > 0 && prod.scenesWithAudio < state.scenes.total) {
    suggestions.push('为场景生成配音')
  }

  if (state.storyboards.total > 0 && prod.storyboardsWithVideo === state.storyboards.total && !state.episode.composedVideoPath) {
    suggestions.push('合成导出这一集的 MP4')
  }

  if (state.assets.characters.count === 0) {
    suggestions.push('先建立角色资产')
  } else if (state.assets.characters.count > 0) {
    suggestions.push('为某个角色生成定妆图')
  }

  return suggestions.slice(0, 5)
}
