/**
 * 场景绑定写入器
 * @module platform/episode-production/narrative/scene-binding-writer
 * @description 将 GeneratedScene 写入 scene_scripts + bridge tables（规范化设计）。
 *
 * 设计原则：
 * - scene_scripts 的 characters/dialogues/actions JSON 字段保留写入（向后兼容）
 * - 同时写入 scene_characters/scene_dialogues/scene_actions bridge tables
 * - bridge tables 包含 characterBindingId FK 引用
 */

import type { DataSource, EntityManager, Repository } from 'typeorm'
import { In, IsNull } from 'typeorm'
import type {
  GeneratedScene,
  SceneScript,
} from '@shared/types/episode-production'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { getCurrentUserId } from '@core/context/user-context'
import { rebuildStoryboardDialogueLinks } from './storyboard-dialogue-links'
import { nextRefId, reassignRefIds } from './ref-id-reassign'

/**
 * 场景绑定写入器
 *
 * 用于将 AI 生成的场景数据写入数据库，同时维护规范化表结构。
 */
export class SceneBindingWriter {
  /**
   * 批量创建场景及其关联记录（事务）
   *
   * @param ds DataSource
   * @param episodeScriptId 剧本 ID
   * @param scenes AI 生成的场景数据
   * @returns 创建的场景记录列表
   */
  static async createScenesWithBindings(
    ds: DataSource,
    episodeScriptId: string,
    scenes: GeneratedScene[],
  ): Promise<SceneScript[]> {
    if (scenes.length === 0) return []
    return ds.transaction(manager => this.writeScenesInTx(manager, episodeScriptId, scenes))
  }

  /**
   * 在调用方已有事务内写入（复核修复 P1-6）：供「删旧场景 + 建新场景并入
   * 同一事务」的复合场景使用——旧实现先物理删光旧场景再另起事务重建，
   * 建新中途失败时旧场景不可恢复。
   */
  static async createScenesWithBindingsIn(
    manager: EntityManager,
    episodeScriptId: string,
    scenes: GeneratedScene[],
  ): Promise<SceneScript[]> {
    return this.writeScenesInTx(manager, episodeScriptId, scenes)
  }

  private static async writeScenesInTx(
    manager: EntityManager,
    episodeScriptId: string,
    scenes: GeneratedScene[],
  ): Promise<SceneScript[]> {
    if (scenes.length === 0) return []

    // S3 修复：写库前对本批次全部场景的 dlg_/act_ id 统一重发 —— AI 每场从
    // dlg_1 编号、兜底生成又是每场独立计数，信任之必然跨场景撞主键，save 变
    // upsert 静默覆盖前一场。JSON 列与桥接表写入同一份重发后的对象，天然一致。
    const scenesToWrite = reassignRefIds(scenes)

    const userId = getCurrentUserId()
    const userScope = userId ? { userId } : {}
    // 读/改路径的租户条件：与写入侧 userScope 同语义（Web 按当前用户，
    // Electron 无 ALS userId → user_id IS NULL）——复核修复：AI 返回的
    // bindingId 不得驱动跨租户读+写
    const readScope = userId ? { userId } : { userId: IsNull() }

    {
      const sceneRepo = manager.getRepository(SceneScriptEntity)

      const result: SceneScript[] = []
      const now = new Date()

      for (const scene of scenesToWrite) {
        // 1. 创建 scene_scripts 记录
        const sceneId = this.generateSceneId()
        const sceneEntity = sceneRepo.create({
          id: sceneId,
          ...userScope,
          episodeScriptId,
          sceneNumber: scene.sceneNumber,
          location: scene.location,
          locationBindingId: scene.locationBindingId,
          locationType: scene.locationType,
          timeOfDay: scene.timeOfDay,
          weather: scene.weather ?? null,
          sceneDescription: scene.sceneDescription,
          mood: scene.mood,
          lighting: scene.lighting ?? null,
          // 向后兼容：保留 JSON 字段
          characters: scene.characters as unknown[],
          originalText: scene.originalText,
          narration: scene.narration,
          dialogues: scene.dialogues as unknown[],
          actions: scene.actions as unknown[],
          createdAt: now,
          updatedAt: now,
        })
        await sceneRepo.save(sceneEntity)

        // 2-4. scene_characters(+props) / scene_dialogues / scene_actions
        await this.writeSceneChildrenIn(manager, sceneId, userScope, scene)

        // 返回 DTO
        result.push({
          id: sceneId,
          episodeScriptId,
          sceneNumber: scene.sceneNumber,
          location: scene.location,
          locationBindingId: scene.locationBindingId,
          locationType: scene.locationType,
          timeOfDay: scene.timeOfDay,
          weather: scene.weather,
          sceneDescription: scene.sceneDescription,
          mood: scene.mood,
          lighting: scene.lighting,
          characters: scene.characters.map(c => ({
            characterBindingId: c.characterBindingId,
            characterId: c.characterId,
            characterName: c.characterName,
            portraitId: c.portraitId,
            position: c.position,
            expression: c.expression,
            action: c.action,
            outfit: c.outfit,
            props: c.props,
          })),
          originalText: scene.originalText,
          narration: scene.narration,
          dialogues: scene.dialogues.map(d => ({
            id: d.id,
            characterBindingId: d.characterBindingId,
            characterId: d.characterId,
            characterName: d.characterName,
            text: d.text,
            emotion: d.emotion,
            volume: d.volume,
            pace: d.pace,
            pause: d.pause,
            voiceId: d.voiceId,
          })),
          actions: scene.actions.map(a => ({
            id: a.id,
            characterBindingId: a.characterBindingId,
            characterId: a.characterId,
            description: a.description,
            timing: a.timing,
            duration: a.duration,
          })),
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
        })
      }

      // 5-6. 地点 baseDescription / 角色 overrideOutfit 兜底回填
      await this.syncBindingSideEffects(manager, scenesToWrite, readScope, now)

      return result
    }
  }

  /**
   * S-06 场景级局部重拆写回（tasks/2026-09-16-ep-studio-polish）：
   * 就地更新已有场景行（保留 id / sceneNumber），事务内替换其
   * scene_characters(+props) / scene_dialogues / scene_actions bridge 行。
   * 调用方负责先删该场景的分镜（storyboards）。
   */
  static async rewriteSceneWithBindings(
    ds: DataSource,
    sceneId: string,
    scene: GeneratedScene,
  ): Promise<void> {
    await ds.transaction(async manager => {
      const userId = getCurrentUserId()
      const userScope = userId ? { userId } : {}
      const readScope = userId ? { userId } : { userId: IsNull() }
      const now = new Date()

      const sceneRepo = manager.getRepository(SceneScriptEntity)
      const existing = await sceneRepo.findOne({
        where: { id: sceneId, ...readScope } as any,
      })
      if (!existing) throw new Error(`场景不存在：${sceneId}`)

      // S3 同型收尾（第三批）：删旧行前先把 AI 给的 dlg_/act_ id 对齐回旧 id。
      // 不能像批量创建那样整批重发——分镜 dialogueIds/actionIds 引用旧 id，
      // 全换会让 C3 重建的 links 全部悬空。
      const aligned = await this.alignRewriteRefIds(manager, sceneId, readScope, scene)

      // 1. 就地更新 scene_scripts 字段（id / sceneNumber / 归属不动）
      await sceneRepo.update({ id: sceneId, ...readScope } as any, {
        location: aligned.scene.location,
        locationBindingId: aligned.scene.locationBindingId,
        locationType: aligned.scene.locationType,
        timeOfDay: aligned.scene.timeOfDay,
        weather: aligned.scene.weather ?? null,
        sceneDescription: aligned.scene.sceneDescription,
        mood: aligned.scene.mood,
        lighting: aligned.scene.lighting ?? null,
        // 向后兼容：保留 JSON 字段
        characters: aligned.scene.characters as unknown[],
        originalText: aligned.scene.originalText,
        narration: aligned.scene.narration,
        dialogues: aligned.scene.dialogues as unknown[],
        actions: aligned.scene.actions as unknown[],
        updatedAt: now,
      } as any)

      // 2. 清旧 bridge 行（props 挂在 scene_characters 上，先删 props）
      const charRepo = manager.getRepository(SceneCharacterEntity)
      const propRepo = manager.getRepository(ScenePropEntity)
      const oldChars = await charRepo.find({
        where: { sceneScriptId: sceneId, ...readScope } as any,
      })
      for (const c of oldChars) {
        await propRepo.delete({ sceneCharacterId: c.id, ...readScope } as any)
      }
      await charRepo.delete({ sceneScriptId: sceneId, ...readScope } as any)
      await manager
        .getRepository(SceneDialogueEntity)
        .delete({ sceneScriptId: sceneId, ...readScope } as any)
      await manager
        .getRepository(SceneActionEntity)
        .delete({ sceneScriptId: sceneId, ...readScope } as any)

      // 3. 按新数据重建 bridge 行 + binding 兜底回填（与批量创建同规则）
      await this.writeSceneChildrenIn(manager, sceneId, userScope, aligned.scene)
      await this.syncBindingSideEffects(manager, [aligned.scene], readScope, now)

      // C3：删建 scene_dialogues 时 FK CASCADE 已把该场景全部分镜的 links 静默删掉，
      // 按各分镜 dialogueIds JSON 重建（单分镜失败不阻断整场景重写）
      const sceneStoryboards = await manager.getRepository(StoryboardEntity).find({
        where: { sceneScriptId: sceneId, ...readScope } as any,
      })
      const storyboardRepo = manager.getRepository(StoryboardEntity)
      for (const sb of sceneStoryboards) {
        // 防线重发过的 id 先同步改写分镜引用，再按新引用重建 links
        if (aligned.dialogueIdRemap.size > 0 || aligned.actionIdRemap.size > 0) {
          sb.dialogueIds = this.remapRefIds(sb.dialogueIds, aligned.dialogueIdRemap)
          sb.actionIds = this.remapRefIds(sb.actionIds, aligned.actionIdRemap)
          await storyboardRepo.save(sb)
        }
        await rebuildStoryboardDialogueLinks(manager, sb).catch((e) => {
          console.warn('[SceneBindingWriter] 重建分镜对白 links 失败:', e)
        })
      }
    })
  }

  /**
   * 单场景重写路径的 dlg_/act_ id 对齐（S3 同型收尾，第三批）。
   *
   * 与批量创建不同，这里不能整批重发 id——存活分镜的 dialogueIds/actionIds 引用
   * 旧 id，全换会让 C3 重建的 links 悬空。对齐规则（对齐回旧 id 的优先级）：
   *   1. AI 保留了旧 id（在旧集合里且未被占）→ 沿用，常规路径行为不变；
   *   2. AI 重排了 id（dlg_1 重号）→ 按归一化文本（去空白）匹配未消耗的旧行，
   *      旧行按 sortOrder 顺序消耗，重复文本不抢同一个旧 id；
   *      不按下标对齐——AI 可能调换顺序，下标对齐会把旧 id 贴到别的文本上，
   *      分镜引用反而指错对白；文本对不上宁可发新 id（引用悬空 > 指错）；
   *   3. 都对不上 → 新增条目，发 nextRefId 新 id。
   * 对齐结果结构上只含「本场景旧 id」或「新生成 id」，不会与他场景桥接行撞号；
   * 落库前仍显式排查一遍（历史脏数据防线），撞号的重发并记录 remap，由调用方
   * 同步改写分镜引用——选重发而非拒绝：撞号源于历史数据而非本次输入，拒绝会
   * 让正常重写被旧账卡死，重发后分镜引用同步改写即可自愈。
   */
  private static async alignRewriteRefIds(
    manager: EntityManager,
    sceneId: string,
    readScope: Record<string, unknown>,
    scene: GeneratedScene,
  ): Promise<{
    scene: GeneratedScene
    dialogueIdRemap: Map<string, string>
    actionIdRemap: Map<string, string>
  }> {
    const dialogueRepo = manager.getRepository(SceneDialogueEntity)
    const actionRepo = manager.getRepository(SceneActionEntity)
    const oldDialogues = await dialogueRepo.find({
      where: { sceneScriptId: sceneId, ...readScope } as any,
      order: { sortOrder: 'ASC' },
    })
    const oldActions = await actionRepo.find({
      where: { sceneScriptId: sceneId, ...readScope } as any,
      order: { sortOrder: 'ASC' },
    })

    const dialogues = this.alignRefIds(
      scene.dialogues ?? [],
      oldDialogues.map(d => ({ id: d.id, text: d.text })),
      'dlg',
      d => d.text,
    )
    const actions = this.alignRefIds(
      scene.actions ?? [],
      oldActions.map(a => ({ id: a.id, text: a.description })),
      'act',
      a => a.description,
    )

    const dialogueIdRemap = await this.reassignCollidingRefIds(
      sceneId, dialogueRepo, dialogues, 'dlg',
    )
    const actionIdRemap = await this.reassignCollidingRefIds(
      sceneId, actionRepo, actions, 'act',
    )

    return { scene: { ...scene, dialogues, actions }, dialogueIdRemap, actionIdRemap }
  }

  /** 按上述优先级为一批对白/动作分配最终 id（返回新数组，不改入参） */
  private static alignRefIds<T extends { id?: string }>(
    items: T[],
    olds: Array<{ id: string; text: string }>,
    prefix: 'dlg' | 'act',
    textOf: (item: T) => string | undefined,
  ): T[] {
    const oldIds = new Set(olds.map(o => o.id))
    const usedIds = new Set<string>()
    const idsByText = new Map<string, string[]>()
    for (const o of olds) {
      const key = this.normalizeRefText(o.text)
      const list = idsByText.get(key)
      if (list) list.push(o.id)
      else idsByText.set(key, [o.id])
    }
    return items.map(item => {
      let id: string | undefined
      if (item.id && oldIds.has(item.id) && !usedIds.has(item.id)) {
        id = item.id
      } else {
        const candidates = idsByText.get(this.normalizeRefText(textOf(item)))
        id = candidates?.find(cid => !usedIds.has(cid))
      }
      if (!id) id = nextRefId(prefix)
      usedIds.add(id)
      return { ...item, id }
    })
  }

  /** 文本归一化：去全部空白（中文对白无空格，空白差异不影响对齐） */
  private static normalizeRefText(text: string | undefined): string {
    return String(text ?? '').replace(/\s+/g, '')
  }

  /**
   * 撞号防线：排查对齐后的 id 是否与他场景桥接行撞主键（不带租户条件——
   * 主键全局唯一，撞号与租户无关），撞号的重发新 id。返回 旧id→新id 的 remap。
   */
  private static async reassignCollidingRefIds<T extends { id: string }>(
    sceneId: string,
    repo: Repository<SceneDialogueEntity> | Repository<SceneActionEntity>,
    items: T[],
    prefix: 'dlg' | 'act',
  ): Promise<Map<string, string>> {
    const remap = new Map<string, string>()
    if (items.length === 0) return remap
    const rows = await repo.find({ where: { id: In(items.map(i => i.id)) } })
    const colliding = new Set(
      rows.filter(r => r.sceneScriptId !== sceneId).map(r => r.id),
    )
    if (colliding.size === 0) return remap
    console.warn(
      `[SceneBindingWriter] 重写的 ${prefix}_ id 与他场景桥接行撞号，重发:`,
      [...colliding].join(', '),
    )
    for (const item of items) {
      if (colliding.has(item.id)) {
        const fresh = nextRefId(prefix)
        remap.set(item.id, fresh)
        item.id = fresh
      }
    }
    return remap
  }

  /** 按 remap 改写分镜的 dialogueIds/actionIds JSON（未命中 remap 的引用原样保留） */
  private static remapRefIds(ids: string[] | null, remap: Map<string, string>): string[] | null {
    if (!Array.isArray(ids)) return ids
    return ids.map(x => remap.get(String(x)) ?? x)
  }

  /**
   * 写一个场景的子表记录（scene_characters + props / scene_dialogues /
   * scene_actions）。批量创建与单场景重写共用。
   */
  private static async writeSceneChildrenIn(
    manager: EntityManager,
    sceneId: string,
    userScope: { userId?: string },
    scene: GeneratedScene,
  ): Promise<void> {
    const charRepo = manager.getRepository(SceneCharacterEntity)
    const dialogueRepo = manager.getRepository(SceneDialogueEntity)
    const actionRepo = manager.getRepository(SceneActionEntity)
    const propRepo = manager.getRepository(ScenePropEntity)

    // scene_characters 记录
    for (let i = 0; i < scene.characters.length; i++) {
      const char = scene.characters[i]
      const charId = this.generateCharId()
      await charRepo.save(
        charRepo.create({
          id: charId,
          ...userScope,
          sceneScriptId: sceneId,
          characterId: char.characterId || '',
          characterName: char.characterName,
          characterBindingId: char.characterBindingId,
          position: char.position || 'center',
          expression: char.expression ?? null,
          action: char.action ?? null,
          outfit: char.outfit ?? null,
          sortOrder: i,
        }),
      )

      // 创建 props（如果有）
      if (char.props && char.props.length > 0) {
        for (const prop of char.props) {
          await propRepo.save(
            propRepo.create({
              id: this.generatePropId(),
              ...userScope,
              sceneCharacterId: charId,
              propName: prop.name,
            }),
          )
        }
      }
    }

    // scene_dialogues 记录
    for (let i = 0; i < scene.dialogues.length; i++) {
      const dlg = scene.dialogues[i]
      await dialogueRepo.save(
        dialogueRepo.create({
          id: dlg.id || this.generateDialogueId(),
          ...userScope,
          sceneScriptId: sceneId,
          characterId: dlg.characterId || '',
          characterName: dlg.characterName,
          characterBindingId: dlg.characterBindingId,
          text: dlg.text,
          emotion: dlg.emotion ?? null,
          volume: dlg.volume || 'normal',
          pace: dlg.pace || 'normal',
          pause: dlg.pause || 0,
          voiceId: dlg.voiceId ?? null,
          audioAssetId: null,
          sortOrder: i,
        }),
      )
    }

    // scene_actions 记录
    for (let i = 0; i < scene.actions.length; i++) {
      const act = scene.actions[i]
      await actionRepo.save(
        actionRepo.create({
          id: act.id || this.generateActionId(),
          ...userScope,
          sceneScriptId: sceneId,
          characterId: act.characterId ?? null,
          characterBindingId: act.characterBindingId,
          description: act.description,
          timing: act.timing || 'during',
          duration: act.duration ?? null,
          sortOrder: i,
        }),
      )
    }
  }

  /**
   * binding 兜底回填（批量创建与单场景重写共用）：
   *   - 地点绑定的 baseDescription（为空时由 sceneDescription + locationKeyObjects 合成）
   *   - 角色绑定的 overrideOutfit（为空时取该批次首个场景的 outfit）
   */
  private static async syncBindingSideEffects(
    manager: EntityManager,
    scenes: GeneratedScene[],
    readScope: Record<string, unknown>,
    now: Date,
  ): Promise<void> {
    // 5. 同步更新地点绑定的 baseDescription（如果为空）
    const locationBindingRepo = manager.getRepository(LocationBindingEntity)
    for (const scene of scenes) {
      if (scene.locationBindingId && scene.sceneDescription) {
        const locationBinding = await locationBindingRepo.findOne({
          where: { id: scene.locationBindingId, ...readScope } as any,
        })
        if (locationBinding && !locationBinding.baseDescription) {
          // 合成 baseDescription：sceneDescription + locationKeyObjects
          let baseDesc = scene.sceneDescription
          if (scene.locationKeyObjects && scene.locationKeyObjects.length > 0) {
            baseDesc += `；关键物件：${scene.locationKeyObjects.join('、')}`
          }
          await locationBindingRepo.update(
            { id: scene.locationBindingId, ...readScope } as any,
            {
              baseDescription: baseDesc,
              updatedAt: now,
            } as any,
          )
        }
      }
    }

    // 6. 同步更新角色绑定的 overrideOutfit（如果为空）
    const characterBindingRepo = manager.getRepository(CharacterBindingEntity)
    const outfitMap = new Map<string, string>()
    for (const scene of scenes) {
      for (const char of scene.characters) {
        if (char.characterBindingId && char.outfit) {
          // 只记录第一个场景的 outfit（不覆盖后续场景的）
          if (!outfitMap.has(char.characterBindingId)) {
            outfitMap.set(char.characterBindingId, char.outfit)
          }
        }
      }
    }
    for (const bindingId of outfitMap.keys()) {
      const outfit = outfitMap.get(bindingId)!
      const characterBinding = await characterBindingRepo.findOne({
        where: { id: bindingId, ...readScope } as any,
      })
      if (characterBinding && !characterBinding.overrideOutfit) {
        await characterBindingRepo.update(
          { id: bindingId, ...readScope } as any,
          {
            overrideOutfit: outfit,
            updatedAt: now,
          } as any,
        )
      }
    }
  }

  private static generateSceneId(): string {
    return `ss_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private static generateCharId(): string {
    return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private static generateDialogueId(): string {
    return `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private static generateActionId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private static generatePropId(): string {
    return `sp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
