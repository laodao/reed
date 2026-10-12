/**
 * AI 设定反推 service（spec 2026-05-07 §3）
 * @module platform/episode-production/assets/services/asset-setting-enrichment
 *
 * 流程：
 * 1. 加载 projectId 下所有 episodeScript，再通过 SceneScript 拼接原文段
 * 2. 加载同项目 character / location / item bindings → 拆为"已填上下文"+"待补清单"
 * 3. 三个 kind 各发一次 AI 调用（失败该 kind 跳过，不影响其他）
 * 4. 解析 AI JSON，仅当 binding 当前字段为空时写入
 *
 * callAI 通过依赖注入，便于测试 mock；handler 注入真实 callAI（narrative/ai/_helpers）。
 *
 * 多用户：通过 typeorm Repository + DataSource 注入，与现有 service 一致。
 */

import type { DataSource, Repository } from 'typeorm'
import { In } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import {
  createDefaultPromptContext,
  type PromptContext,
} from '../../prompts/prompt-context'
import { promptContextFromEpisodeAndProject } from '../../prompts/episode-prompt-context.service'
import {
  buildSettingEnrichmentSystemPrompt,
  buildSettingEnrichmentUserPrompt,
  type EnrichmentKind,
  type EnrichmentTodo,
  type EnrichmentContext,
  RACE_VALUES,
  type RaceValue,
} from '../prompts/setting-enrichment-prompt'

export type CallAIFn = (
  userPrompt: string,
  systemPrompt: string,
  maxTokens?: number,
) => Promise<string>

export interface EnrichInput {
  projectId: string
  /** Web 端通过 ALS 注入，PC 端 null */
  userId?: string | null
}

export interface EnrichSummary {
  enrichedCount: { character: number; location: number; item: number }
  failures: Array<{ kind: EnrichmentKind; reason: string }>
}

interface AIResult {
  id: string
  fields: Record<string, unknown>
  _evidence?: Record<string, string>
}

/**
 * AI 正向字段提取（spec 2026-05-09 ep-redesign §3.2 B2）
 *
 * 与 enrich() 反推（已生成图反推设定）相对：用户在自由文本"人物描述"里写完，
 * 点 ✨ → LLM 抽出结构化字段 → 前端不覆盖已填字段地填表。
 *
 * Service 层职责：调 callAI、parse JSON（带 fenced code 兜底）、校验枚举值。
 * 不覆盖逻辑放在前端（service 只返回 LLM 结果）。
 */

/**
 * race 枚举值（§3.6 单一事实源：从 setting-enrichment-prompt 导入，不再本文件手写）。
 *
 * BUG-3 修复（v2.3）：两个功能（enrich / extractFields）写入同一字段
 * CharacterBindingEntity.race，必须使用相同枚举格式，避免数据不一致。
 * 2026-10-06：枚举字面量迁到提示词模块导出，消除"两侧各写一份、改动不同步"的漂移面。
 */
const VALID_RACE_VALUES = RACE_VALUES

type RaceEnum = RaceValue

export interface ExtractFieldsInput {
  assetType: 'character' | 'location' | 'item'
  description: string
  projectId: string
  /** Web 端通过 ALS 注入；PC 端 null */
  userId?: string | null
  /** 项目级 scriptModel 配置；不传走 callAI 默认 */
  providerConfigId?: string
  modelId?: string
}

export interface ExtractedFields {
  // 三类共用
  name?: string
  styleAnchors?: string[]
  // character 专属
  gender?: '男' | '女' | '其他'
  age?: number
  race?: RaceEnum
  // location 专属
  description?: string
  locationType?: 'interior' | 'exterior' | 'mixed' | 'fantasy' | 'urban' | 'rural'
  scale?: '小' | '中' | '大' | '巨大'
  moodTags?: string[]
  timeOfDay?: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'dawn' | 'dusk'
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy'
  // item 借用 description / styleAnchors
}

export class AssetSettingEnrichmentService {
  constructor(
    private readonly ds: DataSource,
    private readonly callAI: CallAIFn,
  ) {}

  async enrich(input: EnrichInput): Promise<EnrichSummary> {
    const summary: EnrichSummary = {
      enrichedCount: { character: 0, location: 0, item: 0 },
      failures: [],
    }

    const originalText = await this.loadOriginalText(input.projectId)
    // §3.6：装配故事背景上下文——优化前设定反推无年代/地域，
    // 第一批资产（无同类参考时）反推人种/服装完全无时代锚
    const promptCtx = await this.loadPromptContext(input.projectId)
    const kinds: EnrichmentKind[] = ['character', 'location', 'item']
    for (const kind of kinds) {
      try {
        const { todo, context } = await this.collectKind(kind, input.projectId)
        if (todo.length === 0) {
          continue
        }
        const sys = buildSettingEnrichmentSystemPrompt(kind, promptCtx)
        const user = buildSettingEnrichmentUserPrompt({
          kind,
          originalText,
          existingContext: context,
          todo,
        })
        const raw = await this.callAI(user, sys, 8192)
        const results = this.parseResults(raw)
        const written = await this.applyResults(kind, input.projectId, results)
        summary.enrichedCount[kind] = written
      } catch (e: any) {
        // 未配置 provider → 整批中止（让上层不进 stage 2）
        if (typeof e?.message === 'string' && e.message.includes('未配置')) {
          throw e
        }
        summary.failures.push({ kind, reason: e?.message ?? String(e) })
        console.warn(`[AssetSettingEnrichmentService] ${kind} 反推失败：`, e)
      }
    }
    return summary
  }

  /**
   * 从 project 下所有 episode_scripts → scene_scripts 中收集 originalText
   * 链路：project_id → episode_scripts(project_id) → scene_scripts(episode_script_id)
   */
  private async loadOriginalText(projectId: string): Promise<string> {
    const scriptRepo: Repository<EpisodeScriptEntity> = this.ds.getRepository(EpisodeScriptEntity)
    const sceneRepo: Repository<SceneScriptEntity> = this.ds.getRepository(SceneScriptEntity)

    const scripts = await scriptRepo.find({ where: { projectId } as any })
    if (scripts.length === 0) return ''

    // 复核修复 P1-5：原实现外层遍历 script、内层再 await sceneRepo.find，构成 N+1
    // （m 集就是 m 次查询）。改为一次 IN 查询取回全部场景，再按 episodeScriptId 在
    // 内存分组回填——保持「script 顺序 → 该 script 下 scene 顺序」的原输出顺序。
    const scenes = await sceneRepo.find({
      where: { episodeScriptId: In(scripts.map(s => s.id)) } as any,
    })
    const scenesByScript = new Map<string, SceneScriptEntity[]>()
    for (const scene of scenes) {
      const key = String((scene as any).episodeScriptId ?? '')
      const bucket = scenesByScript.get(key)
      if (bucket) bucket.push(scene)
      else scenesByScript.set(key, [scene])
    }

    const texts: string[] = []
    for (const script of scripts) {
      for (const scene of scenesByScript.get(String(script.id)) ?? []) {
        if (scene.originalText) {
          texts.push(scene.originalText)
        }
      }
    }
    return texts.filter(Boolean).join('\n\n')
  }

  /**
   * §3.6：装配设定反推用的 PromptContext。
   *
   * 资产是项目级的，故事背景挂在剧集上——取该项目第一个剧集的背景
   * （资产反推通常发生在项目建立初期，各集背景一致）。
   */
  private async loadPromptContext(projectId: string): Promise<PromptContext> {
    try {
      const episode = await this.ds
        .getRepository(VideoEpisodeEntity)
        .findOne({ where: { projectId } as any, order: { episodeNumber: 'ASC' } as any })
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      return promptContextFromEpisodeAndProject(episode, project)
    } catch (err) {
      console.warn(
        `[asset-setting-enrichment] 装配上下文失败（回落缺省）：${err instanceof Error ? err.message : String(err)}`,
      )
      return createDefaultPromptContext()
    }
  }

  private async collectKind(
    kind: EnrichmentKind,
    projectId: string,
  ): Promise<{ todo: EnrichmentTodo[]; context: EnrichmentContext[] }> {
    if (kind === 'character') {
      const repo = this.ds.getRepository(CharacterBindingEntity)
      const all = await repo.find({ where: { projectId } as any })
      return splitForCharacter(all)
    }
    if (kind === 'location') {
      const repo = this.ds.getRepository(LocationBindingEntity)
      const all = await repo.find({ where: { projectId } as any })
      return splitForLocation(all)
    }
    const repo = this.ds.getRepository(ItemBindingEntity)
    const all = await repo.find({ where: { projectId } as any })
    return splitForItem(all)
  }

  private parseResults(raw: string): AIResult[] {
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('AI 响应非 JSON')
      parsed = JSON.parse(m[0])
    }
    if (!parsed || !Array.isArray(parsed.results)) {
      throw new Error('AI 响应缺 results 数组')
    }
    return parsed.results
  }

  private async applyResults(
    kind: EnrichmentKind,
    projectId: string,
    results: AIResult[],
  ): Promise<number> {
    if (kind === 'character') {
      return applyCharacter(this.ds.getRepository(CharacterBindingEntity), projectId, results)
    }
    if (kind === 'location') {
      return applyLocation(this.ds.getRepository(LocationBindingEntity), projectId, results)
    }
    return applyItem(this.ds.getRepository(ItemBindingEntity), projectId, results)
  }

  /**
   * AI 正向字段提取（spec 2026-05-09 ep-redesign §3.2 B2）
   *
   * 用户在自由文本"人物描述"里写完，调本方法 → LLM 抽出结构化字段。
   * 不覆盖逻辑放前端（service 只返回 LLM 结果）。
   *
   * 错误处理：
   *   - LLM 返回非 JSON / 含 markdown 围栏 → 兜底解析（剥围栏 / 提取首个 {} 块）
   *   - 完全无法解析 → throw '...JSON...'
   *   - 校验枚举值（gender / locationType / scale / timeOfDay / weather）；非法值丢弃该字段
   */
  async extractFieldsFromDescription(input: ExtractFieldsInput): Promise<ExtractedFields> {
    const sys = buildExtractFieldsSystemPrompt(input.assetType)
    const user = `用户描述：${input.description}`
    // callAI 真实签名是位置参数（v3 修订）
    const raw = await this.callAI(user, sys, 1024)
    const parsed = parseExtractFieldsJson(raw)
    return validateAndCoerceExtracted(input.assetType, parsed)
  }
}

/**
 * 系统 prompt — 三种 assetType 三个模板。
 *
 * 显式要求只输出 JSON，不要解释 / 不要 markdown 围栏；不能确定的字段不输出（让 LLM 留空 = 不抽该字段）。
 */
function buildExtractFieldsSystemPrompt(assetType: 'character' | 'location' | 'item'): string {
  if (assetType === 'character') {
    return `你是一个角色设定提取助手。从用户描述中抽出结构化字段，以 JSON 输出。

字段说明：
- name: 姓名（如有）
- gender: '男' | '女' | '其他'（推断）
- age: 数字（推断）
- race: 人种（"east_asian" / "south_asian" / "southeast_asian" / "central_asian" / "european" / "african" / "south_american" 之一，必须从枚举中选择）
- styleAnchors: 风格数组（从描述中提取，如"国风工笔"）

只输出 JSON，不要解释，不要 markdown 围栏。不能确定的字段不输出。`
  }
  if (assetType === 'location') {
    return `你是一个地点设定提取助手。从用户描述中抽出结构化字段，以 JSON 输出。

字段说明：
- name: 名称（如有）
- description: 一句话描述
- locationType: 'interior' | 'exterior' | 'mixed' | 'fantasy' | 'urban' | 'rural'
- scale: '小' | '中' | '大' | '巨大'
- moodTags: 氛围词数组（如["温馨","古朴"]）
- timeOfDay: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'dawn' | 'dusk'
- weather: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy'
- styleAnchors: 风格数组

只输出 JSON，不要解释，不要 markdown 围栏。不能确定的字段不输出。`
  }
  // item
  return `你是一个物品设定提取助手。从用户描述中抽出结构化字段，以 JSON 输出。

字段说明：
- name: 名称（如有）
- description: 一句话描述
- styleAnchors: 风格数组（如"仿古" / "赛博朋克"）

只输出 JSON，不要解释，不要 markdown 围栏。不能确定的字段不输出。`
}

/**
 * 解析 LLM 返回的 JSON，含兜底：
 *   - 直接 JSON.parse 成功 → 返回
 *   - 失败 → 剥 markdown 围栏（``` json / ```）后再 parse
 *   - 仍失败 → 提取首个 {...} 块再 parse
 *   - 全失败 → throw
 */
function parseExtractFieldsJson(raw: string): Record<string, unknown> {
  // 1. 直接 parse
  try {
    const v = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch { /* fall through */ }

  // 2. 剥 markdown 围栏
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  if (stripped !== raw.trim()) {
    try {
      const v = JSON.parse(stripped)
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch { /* fall through */ }
  }

  // 3. 提取首个 {...} 块
  const m = raw.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const v = JSON.parse(m[0])
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch { /* fall through */ }
  }

  throw new Error('AI 返回非合法 JSON，无法提取字段')
}

/**
 * 校验枚举值，非法字段丢弃。返回类型化的 ExtractedFields。
 */
function validateAndCoerceExtracted(
  assetType: 'character' | 'location' | 'item',
  data: Record<string, unknown>,
): ExtractedFields {
  const out: ExtractedFields = {}
  if (typeof data.name === 'string' && data.name.trim()) out.name = data.name.trim()
  if (typeof data.description === 'string' && data.description.trim()) out.description = data.description.trim()
  if (Array.isArray(data.styleAnchors)) {
    const sa = data.styleAnchors.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    if (sa.length > 0) out.styleAnchors = sa
  }
  if (assetType === 'character') {
    if (data.gender === '男' || data.gender === '女' || data.gender === '其他') out.gender = data.gender
    if (typeof data.age === 'number' && data.age >= 0 && data.age <= 200) out.age = data.age
    // BUG-3 修复（v2.3）：race 必须使用枚举值，与 setting-enrichment-prompt.ts 保持一致
    if (typeof data.race === 'string' && VALID_RACE_VALUES.includes(data.race as RaceEnum)) {
      out.race = data.race as RaceEnum
    }
  } else if (assetType === 'location') {
    const validLoc = ['interior', 'exterior', 'mixed', 'fantasy', 'urban', 'rural']
    if (typeof data.locationType === 'string' && validLoc.includes(data.locationType)) {
      out.locationType = data.locationType as ExtractedFields['locationType']
    }
    const validScale = ['小', '中', '大', '巨大']
    if (typeof data.scale === 'string' && validScale.includes(data.scale)) {
      out.scale = data.scale as ExtractedFields['scale']
    }
    if (Array.isArray(data.moodTags)) {
      const mt = data.moodTags.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      if (mt.length > 0) out.moodTags = mt
    }
    const validTime = ['morning', 'noon', 'afternoon', 'evening', 'night', 'dawn', 'dusk']
    if (typeof data.timeOfDay === 'string' && validTime.includes(data.timeOfDay)) {
      out.timeOfDay = data.timeOfDay as ExtractedFields['timeOfDay']
    }
    const validWeather = ['sunny', 'cloudy', 'rainy', 'snowy', 'foggy', 'stormy']
    if (typeof data.weather === 'string' && validWeather.includes(data.weather)) {
      out.weather = data.weather as ExtractedFields['weather']
    }
  }
  // item: name / description / styleAnchors 已在共用段处理
  return out
}

// ─── 拆分：todo / context ─────────────────────────────────────

function effectiveName(b: any): string {
  return b.standaloneName || b.overrideName || ''
}

function splitForCharacter(all: CharacterBindingEntity[]) {
  const todo: EnrichmentTodo[] = []
  const context: EnrichmentContext[] = []
  for (const b of all) {
    const name = effectiveName(b)
    if (!name) continue
    const filledFields = collectCharacterFilled(b)
    if (Object.keys(filledFields).length === 0) {
      todo.push({ id: b.id, name, alias: b.alias ?? null })
    } else {
      context.push({ name, fields: filledFields })
      // 即使有部分字段填好，仍可能有空字段需要补 → 也加进 todo
      if (hasCharacterEmpty(b)) {
        todo.push({ id: b.id, name, alias: b.alias ?? null })
      }
    }
  }
  return { todo, context }
}

function collectCharacterFilled(b: CharacterBindingEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (b.standaloneDescription || b.overrideDescription) {
    out.description = b.standaloneDescription || b.overrideDescription
  }
  if (b.overrideAppearance) out.appearance = b.overrideAppearance
  if (b.overrideOutfit) out.outfit = b.overrideOutfit
  if (b.role) out.role = b.role
  if (b.gender) out.gender = b.gender
  if (b.age != null) out.age = b.age
  if (b.race) out.race = b.race
  return out
}

function hasCharacterEmpty(b: CharacterBindingEntity): boolean {
  return !(
    (b.standaloneDescription || b.overrideDescription) &&
    b.overrideAppearance &&
    b.overrideOutfit &&
    b.role &&
    b.gender &&
    b.age != null &&
    b.race
  )
}

function splitForLocation(all: LocationBindingEntity[]) {
  const todo: EnrichmentTodo[] = []
  const context: EnrichmentContext[] = []
  for (const b of all as any[]) {
    const name = effectiveName(b)
    if (!name) continue
    const desc = b.standaloneDescription || b.overrideDescription
    if (desc) {
      context.push({ name, fields: { description: desc } })
    } else {
      todo.push({ id: b.id, name, alias: null })
    }
  }
  return { todo, context }
}

function splitForItem(all: ItemBindingEntity[]) {
  const todo: EnrichmentTodo[] = []
  const context: EnrichmentContext[] = []
  for (const b of all as any[]) {
    const name = effectiveName(b)
    if (!name) continue
    const desc = b.standaloneDescription || b.overrideDescription
    if (desc) {
      context.push({ name, fields: { description: desc } })
    } else {
      todo.push({ id: b.id, name, alias: null })
    }
  }
  return { todo, context }
}

// ─── 落库：仅写空字段 ─────────────────────────────────────

async function applyCharacter(
  repo: Repository<CharacterBindingEntity>,
  projectId: string,
  results: AIResult[],
): Promise<number> {
  let written = 0
  for (const r of results) {
    const b = await repo.findOne({ where: { id: r.id, projectId } as any })
    if (!b) continue
    const patch: Partial<CharacterBindingEntity> = {}
    const f = r.fields ?? {}
    if (b.sourceType === 'linked_lw') {
      if (!b.overrideDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.overrideDescription = f.description.trim()
      }
    } else {
      if (!b.standaloneDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.standaloneDescription = f.description.trim()
      }
    }
    if (!b.overrideAppearance && typeof f.appearance === 'string' && f.appearance.trim()) {
      patch.overrideAppearance = f.appearance.trim()
    }
    if (!b.overrideOutfit && typeof f.outfit === 'string' && f.outfit.trim()) {
      patch.overrideOutfit = f.outfit.trim()
    }
    if (!b.role && typeof f.role === 'string' && f.role.trim()) patch.role = f.role.trim()
    if (!b.gender && typeof f.gender === 'string' && f.gender.trim()) patch.gender = f.gender.trim()
    if (b.age == null && typeof f.age === 'number' && Number.isFinite(f.age)) {
      patch.age = Math.floor(f.age)
    }
    if (!b.race && typeof f.race === 'string' && f.race.trim()) patch.race = f.race.trim()
    if (!b.styleAnchors && Array.isArray(f.styleAnchors) && f.styleAnchors.length > 0) {
      patch.styleAnchors = JSON.stringify(f.styleAnchors)
    }
    if (!b.outfitsExtra && Array.isArray(f.outfitsExtra) && f.outfitsExtra.length > 0) {
      patch.outfitsExtra = JSON.stringify(f.outfitsExtra)
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date()
      await repo.update({ id: b.id }, patch)
      written++
    }
  }
  return written
}

async function applyLocation(
  repo: Repository<LocationBindingEntity>,
  projectId: string,
  results: AIResult[],
): Promise<number> {
  let written = 0
  for (const r of results) {
    const b: any = await repo.findOne({ where: { id: r.id, projectId } as any })
    if (!b) continue
    const f: any = r.fields ?? {}
    const patch: any = {}
    if (b.sourceType === 'linked_lw') {
      if (!b.overrideDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.overrideDescription = f.description.trim()
      }
    } else {
      if (!b.standaloneDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.standaloneDescription = f.description.trim()
      }
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date()
      await repo.update({ id: b.id }, patch)
      written++
    }
  }
  return written
}

async function applyItem(
  repo: Repository<ItemBindingEntity>,
  projectId: string,
  results: AIResult[],
): Promise<number> {
  let written = 0
  for (const r of results) {
    const b: any = await repo.findOne({ where: { id: r.id, projectId } as any })
    if (!b) continue
    const f: any = r.fields ?? {}
    const patch: any = {}
    if (b.sourceType === 'linked_lw') {
      if (!b.overrideDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.overrideDescription = f.description.trim()
      }
    } else {
      if (!b.standaloneDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.standaloneDescription = f.description.trim()
      }
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date()
      await repo.update({ id: b.id }, patch)
      written++
    }
  }
  return written
}
