/**
 * 追加剧本 service（③ 剧本 stage · 已有剧本继续增加内容）
 * @module platform/episode-production/narrative/services/script-append
 *
 * 背景：剧本常常没写完就先开机制作了（先出资产 / 分镜），后续需要**陆续**往剧本里
 * 加内容。而「重新生成剧本」「重新拆分场景」都是**覆盖式**——会删掉已有场次
 * （handleGenerateScript / handleGenerateScenes 都调 deleteByEpisodeScriptId），
 * 对已经出了分镜 / 视频的剧集是破坏性的。所以本 service 只做**增量追加**：
 *
 * - 已有剧本正文只往后拼，绝不覆盖（mergeScriptContent）
 * - 已有场次一行不动；新增场次场次号接着已有最大号往下排（nextSceneNumber + offsetSceneNumbers）
 * - 新场次的对话 / 动作 id 写库前重发，避免与既有 scene_dialogues / scene_actions 主键撞车
 * - 两阶段：prepare（只生成草稿，不落库，给用户预览确认）→ append（确认后才写库）
 *
 * 两种追加模式：
 * - `ai-continue`：用户写一句续写要求，AI 接着已有剧情往下写（正文 + 场景）
 * - `manual-text`：用户自己粘贴一段剧本正文，AI 只负责拆成结构化场景
 *
 * PC + Web 双端共用；不引入 Electron-only 依赖。
 */

import type { DataSource, EntityManager } from 'typeorm'
import { IsNull } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import {
  EpisodeScriptGenerator,
  type ContinueScriptInput,
  type SplitScriptTextInput,
} from '@core/platform/episode-production/narrative/ai/script-generator'
import { SceneBindingWriter } from '@core/platform/episode-production/narrative/scene-binding-writer'
import { buildAssetRosterForProject } from '@core/platform/episode-production/narrative/asset-roster-builder'
import type { UpdateEpisodeScriptRequest } from '@core/database/repositories/episode-script.repository'
import type {
  AppendScriptResult,
  AssetRosterForScript,
  GeneratedScene,
  PrepareScriptAppendInput,
  SceneScript,
  ScriptAppendDraft,
  ScriptAppendPreview,
} from '@shared/types/episode-production'

/** 已有场次一览里单条场景描述的最大字符数（喂 AI 的上下文，别把窗口撑爆） */
export const SCRIPT_SUMMARY_DESC_MAX = 60

/**
 * 场景写入函数签名（可注入，便于单测绕开真实事务）。
 * 复核修复 P1-6：签名从 (ds, …) 改为 (EntityManager, …)——append 把场景写入
 * 与剧本正文更新并入同一事务，注入方拿到的是事务内 manager。
 */
export type CreateScenesFn = (
  manager: EntityManager,
  episodeScriptId: string,
  scenes: GeneratedScene[],
) => Promise<SceneScript[]>

/** 资产花名册构建签名（可注入） */
export type BuildRosterFn = (
  ds: DataSource,
  projectId: string,
) => Promise<AssetRosterForScript>

/** 追加剧本用到的 AI 能力（EpisodeScriptGenerator 结构上满足） */
export interface ScriptAppendGenerator {
  continueScript(input: ContinueScriptInput): Promise<{
    synopsis: string
    scriptContent: string
    scenes: GeneratedScene[]
  }>
  splitScriptTextToScenes(input: SplitScriptTextInput): Promise<GeneratedScene[]>
}

/** 可注入依赖（默认走真实实现；单测里替换掉） */
export interface AppendScriptDeps {
  generator?: ScriptAppendGenerator
  createScenes?: CreateScenesFn
  buildRoster?: BuildRosterFn
}

/** append 的可选项 */
export interface AppendScriptOptions {
  /**
   * 已定稿剧本追加内容后是否保留 approved。
   * 默认 false —— 新内容没经过完整性校验，回到草稿态更诚实；
   * 但"边做边加"的用户可置 true，避免 ④ 分镜 stage 被门控提示打断。
   */
  keepApproved?: boolean
}

/** 场次内引用 id 的批次序号（保证同一批次内不重复） */
let refIdSeq = 0

/** 生成新的引用 id（对话 / 动作），与 SceneBindingWriter 内部风格保持一致 */
function nextRefId(prefix: 'dlg' | 'act'): string {
  refIdSeq += 1
  return `${prefix}_${Date.now().toString(36)}_${refIdSeq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

/** 内景 / 外景标签 */
function locationTypeLabel(type: string | null | undefined): string {
  if (type === 'exterior') return '外景'
  if (type === 'mixed') return '内外景'
  return '内景'
}

/** 时段标签 */
const TIME_OF_DAY_LABELS: Record<string, string> = {
  dawn: '黎明',
  morning: '清晨',
  noon: '正午',
  afternoon: '午后',
  evening: '傍晚',
  dusk: '黄昏',
  night: '夜晚',
}

function timeOfDayLabel(value: string | null | undefined): string {
  if (!value) return '未指定'
  return TIME_OF_DAY_LABELS[value] ?? value
}

export class ScriptAppendService {
  private readonly generator: ScriptAppendGenerator
  private readonly createScenes: CreateScenesFn
  private readonly buildRoster: BuildRosterFn

  constructor(
    private readonly db: ICoreDatabaseManager,
    deps: AppendScriptDeps = {},
  ) {
    this.generator = deps.generator ?? EpisodeScriptGenerator.getInstance()
    this.createScenes =
      deps.createScenes ??
      ((manager, episodeScriptId, scenes) =>
        SceneBindingWriter.createScenesWithBindingsIn(manager, episodeScriptId, scenes))
    this.buildRoster = deps.buildRoster ?? buildAssetRosterForProject
  }

  // ==================== 纯函数（无 IO，便于单测） ====================

  /**
   * 下一个可用场次号 = 已有最大场次号 + 1（无场次 → 1）。
   * 取 max 而不是 count：场次被删过留下的空洞不该被新场次复用。
   */
  static nextSceneNumber(
    existing: Array<{ sceneNumber?: number | null }>,
  ): number {
    const max = existing.reduce((acc, s) => {
      const n = typeof s?.sceneNumber === 'number' ? s.sceneNumber : 0
      return n > acc ? n : acc
    }, 0)
    return max + 1
  }

  /**
   * 把新增场次整体重编号：按数组顺序连续编号，起点为 base + 1。
   *
   * AI 未必听话（可能从 1 重来、可能给重复号），所以这里一律按顺序兜底重排，
   * 保证落库后场次号在整部剧本内连续且不与已有场次冲突。
   * 返回新对象数组，不修改入参。
   */
  static offsetSceneNumbers(
    scenes: GeneratedScene[],
    base: number,
  ): GeneratedScene[] {
    return scenes.map((scene, index) => ({
      ...scene,
      sceneNumber: base + index + 1,
    }))
  }

  /**
   * 已有场次一览（喂给 AI 当上下文，让续写剧情与场次号都接得上）。
   * 无场次返回空串（占位文本由提示词构建器统一兜底）。
   */
  static buildExistingScenesSummary(
    existing: Array<{
      sceneNumber?: number | null
      location?: string | null
      locationType?: string | null
      timeOfDay?: string | null
      sceneDescription?: string | null
    }>,
  ): string {
    if (existing.length === 0) return ''
    return existing
      .map((scene) => {
        const desc = (scene.sceneDescription ?? '').replace(/\s+/g, ' ').trim()
        const shortDesc =
          desc.length > SCRIPT_SUMMARY_DESC_MAX
            ? `${desc.slice(0, SCRIPT_SUMMARY_DESC_MAX)}…`
            : desc
        return [
          `第 ${scene.sceneNumber ?? 0} 场`,
          scene.location || '未指定地点',
          locationTypeLabel(scene.locationType),
          timeOfDayLabel(scene.timeOfDay),
          shortDesc,
        ]
          .filter((part) => part !== '')
          .join(' | ')
      })
      .join('\n')
  }

  /**
   * 正文增量拼接：已有正文原样保留，新增段接在后面（空行分隔）。
   *
   * 新增段为空时原样返回旧正文 —— 绝不允许因为一次空追加把已有正文清掉。
   */
  static mergeScriptContent(
    prev: string | null | undefined,
    addition: string,
  ): string {
    const base = (prev ?? '').trim()
    const add = (addition ?? '').trim()
    if (!add) return base
    if (!base) return add
    return `${base}\n\n${add}`
  }

  /**
   * 重发对话 / 动作 id。
   *
   * SceneBindingWriter 用 AI 给的 id 作为主键（`dlg.id || 生成`），而 AI 习惯从
   * `dlg_1` / `act_1` 开始编号 —— 追加时旧的 scene_dialogues / scene_actions 行还在库
   * 里，直接写必然主键冲突。所以追加路径统一重发 id。返回新对象数组，不修改入参。
   */
  static reassignRefIds(scenes: GeneratedScene[]): GeneratedScene[] {
    return scenes.map((scene) => ({
      ...scene,
      dialogues: (scene.dialogues ?? []).map((dialogue) => ({
        ...dialogue,
        id: nextRefId('dlg'),
      })),
      actions: (scene.actions ?? []).map((action) => ({
        ...action,
        id: nextRefId('act'),
      })),
    }))
  }

  // ==================== 编排 ====================

  /**
   * 生成追加草稿（**不落库**）：给用户预览新增了多少内容、哪些新场次，确认后才 append。
   *
   * @throws 剧本 / 剧集不存在、续写要求或正文为空、模式不合法
   */
  async prepare(input: PrepareScriptAppendInput): Promise<ScriptAppendPreview> {
    const { episodeScripts, sceneScripts, videoEpisodes, dataSource } = this.db
    if (!episodeScripts || !sceneScripts || !videoEpisodes || !dataSource) {
      throw new Error('数据库未初始化')
    }

    const script = await episodeScripts.getById(input.scriptId)
    if (!script) throw new Error('剧本不存在')

    const episode = await videoEpisodes.getById(script.episodeId)
    if (!episode) throw new Error('剧本关联的剧集不存在')

    const existingScenes = await sceneScripts.getByEpisodeScriptId(input.scriptId)
    const existingContent = script.scriptContent ?? ''
    const startSceneNumber = ScriptAppendService.nextSceneNumber(existingScenes)
    const existingScenesSummary =
      ScriptAppendService.buildExistingScenesSummary(existingScenes)
    const roster = await this.buildRoster(dataSource, episode.projectId)

    const shared = {
      roster,
      startSceneNumber,
      existingScenesSummary,
      providerConfigId: input.providerConfigId,
      modelId: input.modelId,
    }

    let draft: ScriptAppendDraft
    if (input.mode === 'manual-text') {
      const text = (input.text ?? '').trim()
      if (!text) throw new Error('请先粘贴或输入要追加的剧本正文')
      const scenes = await this.generator.splitScriptTextToScenes({
        ...shared,
        scriptText: text,
      })
      draft = { scriptContent: text, synopsis: '', scenes }
    } else if (input.mode === 'ai-continue') {
      const instruction = (input.instruction ?? '').trim()
      if (!instruction) throw new Error('请先填写续写要求')
      const result = await this.generator.continueScript({
        ...shared,
        existingScriptContent: existingContent,
        instruction,
      })
      draft = {
        scriptContent: result.scriptContent.trim(),
        synopsis: result.synopsis.trim(),
        scenes: result.scenes,
      }
    } else {
      throw new Error(`不支持的追加模式：${String(input.mode)}`)
    }

    // 场次号兜底：不管 AI 怎么编号，一律接着已有场次连续排
    draft.scenes = ScriptAppendService.offsetSceneNumbers(
      draft.scenes,
      startSceneNumber - 1,
    )

    return {
      existingSceneCount: existingScenes.length,
      existingContentLength: existingContent.length,
      startSceneNumber,
      draft,
    }
  }

  /**
   * 把草稿追加落库。**只 append，不 delete**：
   * 已有场次与其分镜 / 关键帧 / 视频一概不动，新增场次接在最后。
   *
   * @throws 剧本不存在、草稿没有任何新增内容
   */
  async append(
    scriptId: string,
    draft: ScriptAppendDraft,
    options: AppendScriptOptions = {},
  ): Promise<AppendScriptResult> {
    const { episodeScripts, sceneScripts, dataSource } = this.db
    if (!episodeScripts || !sceneScripts || !dataSource) {
      throw new Error('数据库未初始化')
    }

    const script = await episodeScripts.getById(scriptId)
    if (!script) throw new Error('剧本不存在')

    const addition = (draft.scriptContent ?? '').trim()
    const draftScenes = Array.isArray(draft.scenes) ? draft.scenes : []
    if (!addition && draftScenes.length === 0) {
      throw new Error('草稿里没有任何新增内容，未做任何改动')
    }

    // 写库边界再兜一次：场次号接续 + 引用 id 重发（渲染进程传来的草稿不可全信）
    const existingScenes = await sceneScripts.getByEpisodeScriptId(scriptId)
    const base = ScriptAppendService.nextSceneNumber(existingScenes) - 1
    const scenesToWrite = ScriptAppendService.offsetSceneNumbers(
      ScriptAppendService.reassignRefIds(draftScenes),
      base,
    )

    let addedScenes: SceneScript[] = []

    const update: UpdateEpisodeScriptRequest = {
      scriptContent: ScriptAppendService.mergeScriptContent(
        script.scriptContent,
        addition,
      ),
    }
    // 已定稿剧本追加了未校验的新内容 → 回到草稿态（除非调用方明确要求保持定稿）
    if (script.status === 'approved' && !options.keepApproved) {
      update.status = 'reviewing'
    }

    // 复核修复 P1-6：场景写入与剧本正文/状态更新并入同一事务（原实现两步
    // 各自独立提交，场景写入成功而正文更新失败会留下不一致状态）
    const userId = getCurrentUserId()
    await dataSource.transaction(async manager => {
      if (scenesToWrite.length > 0) {
        addedScenes = await this.createScenes(manager, scriptId, scenesToWrite)
      }
      // manager.update 带 user 条件（与 scoped 语义一致）
      await manager
        .getRepository(EpisodeScriptEntity)
        .update(
          { id: scriptId, ...(userId ? { userId } : { userId: IsNull() }) } as any,
          update as any,
        )
    })

    const saved = await episodeScripts.getById(scriptId)
    if (!saved) throw new Error('剧本不存在')

    return { script: saved, addedScenes }
  }
}
