/**
 * AI 设定反推 service（spec 2026-05-07 §3）
 * @module modules/episode-production/assets/services/asset-setting-enrichment
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
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import {
  buildSettingEnrichmentSystemPrompt,
  buildSettingEnrichmentUserPrompt,
  type EnrichmentKind,
  type EnrichmentTodo,
  type EnrichmentContext,
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
    const kinds: EnrichmentKind[] = ['character', 'location', 'item']
    for (const kind of kinds) {
      try {
        const { todo, context } = await this.collectKind(kind, input.projectId)
        if (todo.length === 0) {
          continue
        }
        const sys = buildSettingEnrichmentSystemPrompt(kind)
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

    const texts: string[] = []
    for (const script of scripts) {
      const scenes = await sceneRepo.find({ where: { episodeScriptId: script.id } as any })
      for (const scene of scenes) {
        if (scene.originalText) {
          texts.push(scene.originalText)
        }
      }
    }
    return texts.filter(Boolean).join('\n\n')
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
