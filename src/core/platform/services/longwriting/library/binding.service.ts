/**
 * 项目侧绑定与导入服务（设定资产库 P0-2026-09-24）
 * @module platform/services/longwriting/library/binding.service
 *
 * 引用分层（设计 §3.1 决策二）：
 * - IP 角色 → 导入即实例化：在 lw_story_characters 建项目内行（sourceType='library'），
 *   血缘列记库 id/版本，四层人设（motivation/flaw/characterArc）一并落列；库改不自动写穿。
 * - 世界条目 → importWorldEntry 按 kind 映射落既有项目表（location/faction/skill/item/custom），
 *   供名册/图谱/一致性机制直接消费。
 * - 体系/规则文本不走这里——写作时由 library-context.ts 活引用直注入。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type {
  WorldBinding,
  IpBinding,
  WorldBindingConfig,
  BindWorldRequest,
  ImportIpCharacterRequest,
} from '@shared/types/lw-library.types'

/** 世界条目 kind → 项目既有表的导入映射（未映射的落 custom_entities） */
const KIND_IMPORT_TARGET: Record<string, 'location' | 'faction' | 'skill' | 'item'> = {
  region: 'location',
  country: 'faction',
  sect: 'faction',
  camp: 'faction',
  weapon: 'item',
  pill: 'item',
  herb: 'item',
  spell: 'skill',
  art: 'skill',
}

export class LibraryBindingService {
  private db() {
    return getCoreDatabaseManager()
  }

  // ---------- 世界绑定 ----------

  async listWorldBindings(projectId: string): Promise<WorldBinding[]> {
    return this.db().lwWorldBindings!.listByProjectId(projectId)
  }

  async bindWorld(req: BindWorldRequest): Promise<WorldBinding> {
    const existing = await this.db().lwWorldBindings!.getByProjectAndWorld(req.projectId, req.worldId)
    if (existing) return existing
    const world = await this.db().lwWorlds!.getById(req.worldId)
    if (!world) throw new Error('世界观库不存在或已删除')
    // 首个绑定自动成为主世界
    const bindings = await this.db().lwWorldBindings!.listByProjectId(req.projectId)
    const isPrimary = bindings.length === 0 ? true : req.isPrimary !== false
    const binding = await this.db().lwWorldBindings!.create({
      ...req,
      worldName: world.name,
      isPrimary,
    })
    if (isPrimary && bindings.length > 0) {
      await this.db().lwWorldBindings!.setPrimary(req.projectId, binding.id)
    }
    return binding
  }

  async unbindWorld(projectId: string, worldId: string): Promise<boolean> {
    const binding = await this.db().lwWorldBindings!.getByProjectAndWorld(projectId, worldId)
    if (!binding) return false
    return this.db().lwWorldBindings!.deleteRow(binding.id)
  }

  async setPrimaryWorld(projectId: string, bindingId: string): Promise<void> {
    await this.db().lwWorldBindings!.setPrimary(projectId, bindingId)
  }

  async updateWorldBindingConfig(id: string, config: WorldBindingConfig | null): Promise<WorldBinding | null> {
    return this.db().lwWorldBindings!.updateConfig(id, config)
  }

  // ---------- 世界条目导入（实例化到项目既有表） ----------

  async importWorldEntry(
    projectId: string,
    entryId: string,
  ): Promise<{ ok: boolean; target: string; projectEntityId: string | null; message: string }> {
    const entry = await this.db().lwWorldEntries!.getById(entryId)
    if (!entry) return { ok: false, target: 'none', projectEntityId: null, message: '库条目不存在' }
    const world = await this.db().lwWorlds!.getById(entry.worldId)
    const lineage = {
      libraryWorldId: entry.worldId,
      libraryEntryId: entry.id,
      libraryVersion: world?.version ?? 1,
    }
    const db = this.db()
    const target = KIND_IMPORT_TARGET[entry.kindKey]

    try {
      if (target === 'location') {
        const row = await db.lwLocations!.create({
          projectId,
          name: entry.name,
          type: 'other',
          importance: 'main',
          description: entry.summary || '',
        })
        await db.lwLocations!.applyLibraryLineage?.(row.id, lineage)
        return { ok: true, target, projectEntityId: row.id, message: '已导入到项目地点' }
      }
      if (target === 'faction') {
        const factionType = entry.kindKey === 'country' ? 'country' : entry.kindKey === 'camp' ? 'camp' : 'sect'
        const row = await db.lwFactions!.create({
          projectId,
          factionType: factionType as any,
          name: entry.name,
          description: entry.summary || '',
        })
        await db.lwFactions!.applyLibraryLineage?.(row.id, lineage)
        return { ok: true, target, projectEntityId: row.id, message: '已导入到项目势力' }
      }
      if (target === 'skill') {
        const row = await db.lwSkills!.create({
          projectId,
          name: entry.name,
          type: 'other',
          level: String((entry.fields as any)?.rank ?? ''),
          description: entry.summary || '',
          system: '库导入',
        } as any)
        await db.lwSkills!.applyLibraryLineage?.(row.id, lineage)
        return { ok: true, target, projectEntityId: row.id, message: '已导入到项目技能' }
      }
      if (target === 'item') {
        const row = await db.lwItems!.create({
          projectId,
          name: entry.name,
          type: 'other',
          level: String((entry.fields as any)?.rank ?? ''),
          description: entry.summary || '',
          importance: 'secondary',
        } as any)
        await db.lwItems!.applyLibraryLineage?.(row.id, lineage)
        return { ok: true, target, projectEntityId: row.id, message: '已导入到项目物品' }
      }
      // 未映射 kind（力量体系/境界/规则/经济/历史等体系类）→ custom_entities
      const row = await db.lwCustomEntities!.createRow(
        projectId,
        entry.kindKey,
        entry.name,
        { summary: entry.summary, ...(entry.fields ?? {}), __aliases: entry.aliases },
        { type: 'extract', libraryWorldId: entry.worldId, libraryEntryId: entry.id, libraryVersion: world?.version ?? 1 },
      )
      return { ok: true, target: 'custom', projectEntityId: row.id, message: '已导入到项目自定义设定' }
    } catch (err: any) {
      return { ok: false, target: target ?? 'custom', projectEntityId: null, message: `导入失败：${err?.message || err}` }
    }
  }

  // ---------- IP 角色绑定导入 ----------

  async listIpBindings(projectId: string): Promise<IpBinding[]> {
    return this.db().lwIpBindings!.listByProjectId(projectId)
  }

  async listProjectsByIp(ipCharacterId: string): Promise<IpBinding[]> {
    return this.db().lwIpBindings!.listByIpCharacterId(ipCharacterId)
  }

  /**
   * 导入即实例化：建项目角色行 + 血缘 + 四层人设，回填绑定。
   * 返回项目角色 id（前端跳编辑或刷新列表）。
   */
  async importIpCharacter(req: ImportIpCharacterRequest): Promise<{ ipBinding: IpBinding; projectCharacterId: string }> {
    const db = this.db()
    const ip = await db.lwIpCharacters!.getById(req.ipCharacterId)
    if (!ip) throw new Error('IP 角色不存在或已删除')
    const existing = await db.lwIpBindings!.getByProjectAndIp(req.projectId, req.ipCharacterId)
    if (existing?.projectCharacterId) {
      return { ipBinding: existing, projectCharacterId: existing.projectCharacterId }
    }
    const world = ip.worldId ? await db.lwWorlds!.getById(ip.worldId) : null
    const character = await db.lwCharacters!.create({
      projectId: req.projectId,
      name: ip.name,
      gender: (ip.gender as any) || 'male',
      age: undefined as any,
      race: (ip.race as any) ?? undefined,
      occupation: ip.occupation ?? undefined,
      appearance: ip.appearance ?? '',
      background: ip.background ?? '',
      personality: ip.personality ?? '',
      abilities: [ip.talents, ip.abilities].filter(Boolean).join('；'),
      aliases: ip.aliases.length > 0 ? ip.aliases : undefined,
      rolePosition: (req.rolePosition as any) || 'supporting',
      sourceType: 'library',
    })
    await db.lwCharacters!.applyLibraryLineage(character.id, {
      libraryIpId: ip.id,
      libraryWorldId: ip.worldId ?? undefined,
      libraryVersion: world?.version ?? 1,
      motivation: ip.motivation,
      flaw: ip.flaw,
      characterArc: ip.characterArc,
    })
    let binding = existing
    if (binding) {
      await db.lwIpBindings!.fillProjectCharacterId(binding.id, character.id)
      binding = { ...binding, projectCharacterId: character.id }
    } else {
      binding = await db.lwIpBindings!.create({
        projectId: req.projectId,
        ipCharacterId: ip.id,
        ipName: ip.name,
        rolePosition: req.rolePosition ?? null,
      })
      await db.lwIpBindings!.fillProjectCharacterId(binding.id, character.id)
      binding = { ...binding, projectCharacterId: character.id }
    }
    return { ipBinding: binding, projectCharacterId: character.id }
  }

  /** 解绑：默认保留项目内已生成的角色（故事资产不因解绑丢失） */
  async unbindIpCharacter(projectId: string, ipCharacterId: string, deleteProjectCharacter = false): Promise<boolean> {
    const db = this.db()
    const binding = await db.lwIpBindings!.getByProjectAndIp(projectId, ipCharacterId)
    if (!binding) return false
    if (deleteProjectCharacter && binding.projectCharacterId) {
      await db.lwCharacters!.delete(binding.projectCharacterId)
    }
    return db.lwIpBindings!.deleteRow(binding.id)
  }
}
