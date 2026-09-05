/**
 * 场景剧本 service（spec §4.1）
 * @module platform/episode-production/narrative/services/scene-script
 *
 * 当前职责：暴露剧本完整性校验 API，给 P4-T6 IPC handler / P4-T8 UI 调用。
 *
 * 数据装配策略：
 * 优先从归一化的 scene_characters / scene_dialogues / scene_actions / scene_props 表读，
 * 缺数据时回退到 scene_scripts 的 JSON 列（characters/dialogues/actions）合成 entity-like
 * 对象。这样既能向前兼容（旧剧本 JSON），又能渐进迁移到新归一化结构（不破坏现有 AI
 * 生成路径）。
 *
 * PC + Web 双端共用；不引入 Electron-only 依赖。
 */

import type { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import { ReferenceResolver } from '@core/platform/episode-production/narrative/reference-resolver'
import {
  ScriptCompletenessValidator,
  type CompletenessReport,
  type SceneInputBundle,
} from '@core/platform/episode-production/narrative/validators/script-completeness.validator'
import type {
  SceneCharacter,
  Dialogue,
  ActionDescription,
  ScenePropRef,
} from '@shared/types/episode-production'

/**
 * SceneScriptService：场景剧本业务层。
 *
 * 当前仅承载 validateCompleteness / validateEpisodeCompleteness 两个方法；
 * 未来的 normalize-on-write、scene 编辑 API 等都加在这里。
 */
export class SceneScriptService {
  private readonly resolver: ReferenceResolver
  private readonly validator: ScriptCompletenessValidator

  constructor(private readonly ds: DataSource) {
    this.resolver = new ReferenceResolver(ds)
    this.validator = new ScriptCompletenessValidator(this.resolver)
  }

  /**
   * 校验单个场景的完整性。
   * @throws 当场景不存在
   */
  async validateCompleteness(sceneScriptId: string): Promise<CompletenessReport> {
    const bundle = await this.loadSceneBundle(sceneScriptId)
    return this.validator.validateScene(bundle)
  }

  /**
   * 校验整剧本（一次性聚合该 episode 下所有场景）。
   */
  async validateEpisodeCompleteness(
    episodeScriptId: string,
  ): Promise<CompletenessReport> {
    const scenes = await this.ds
      .getRepository(SceneScriptEntity)
      .find({
        where: { episodeScriptId },
        order: { sceneNumber: 'ASC' },
      })
    const bundles: SceneInputBundle[] = []
    for (const s of scenes) {
      bundles.push(await this.loadSceneBundleFromEntity(s))
    }
    return this.validator.validateScenes(bundles)
  }

  /**
   * 装配 SceneInputBundle：归一化表优先 + JSON 列回退。
   */
  private async loadSceneBundle(sceneScriptId: string): Promise<SceneInputBundle> {
    const scene = await this.ds
      .getRepository(SceneScriptEntity)
      .findOne({ where: { id: sceneScriptId } })
    if (!scene) {
      throw new Error(`SceneScript not found: ${sceneScriptId}`)
    }
    return this.loadSceneBundleFromEntity(scene)
  }

  private async loadSceneBundleFromEntity(
    scene: SceneScriptEntity,
  ): Promise<SceneInputBundle> {
    // 尝试归一化表
    const charsTable = await this.ds
      .getRepository(SceneCharacterEntity)
      .find({ where: { sceneScriptId: scene.id }, order: { sortOrder: 'ASC' } })
    const dialoguesTable = await this.ds
      .getRepository(SceneDialogueEntity)
      .find({ where: { sceneScriptId: scene.id }, order: { sortOrder: 'ASC' } })
    const actionsTable = await this.ds
      .getRepository(SceneActionEntity)
      .find({ where: { sceneScriptId: scene.id }, order: { sortOrder: 'ASC' } })

    // 道具是按 scene_character 维度存的；先收集所有 sceneCharacterId
    const charIdsForProps =
      charsTable.length > 0 ? charsTable.map((c) => c.id) : []
    const propsTable: ScenePropEntity[] = []
    if (charIdsForProps.length > 0) {
      const rows = await this.ds.getRepository(ScenePropEntity).find()
      for (const r of rows) {
        if (charIdsForProps.includes(r.sceneCharacterId)) propsTable.push(r)
      }
    }

    // 决定每类是否回退到 JSON：归一化表为空 + JSON 列非空 → 用 JSON
    const characters =
      charsTable.length > 0
        ? charsTable
        : this.synthesizeCharactersFromJson(scene)
    const dialogues =
      dialoguesTable.length > 0
        ? dialoguesTable
        : this.synthesizeDialoguesFromJson(scene)
    const actions =
      actionsTable.length > 0
        ? actionsTable
        : this.synthesizeActionsFromJson(scene)
    const props =
      propsTable.length > 0
        ? propsTable
        : this.synthesizePropsFromJson(scene, characters)

    return { scene, characters, dialogues, actions, props }
  }

  /**
   * 把 scene.characters JSON 合成为 SceneCharacterEntity-shaped 对象（不真正 save）。
   * 给 validator 看，等同结构即可。
   */
  private synthesizeCharactersFromJson(
    scene: SceneScriptEntity,
  ): SceneCharacterEntity[] {
    const arr = (scene.characters as SceneCharacter[] | null) ?? []
    return arr.map((c, i) =>
      ({
        userId: scene.userId,
        id: `synthetic-sc-${scene.id}-${i}`,
        sceneScriptId: scene.id,
        characterId: c.characterId ?? '',
        characterBindingId: c.characterBindingId ?? null,
        characterName: c.characterName ?? '',
        position: c.position ?? 'center',
        expression: c.expression ?? null,
        action: c.action ?? null,
        outfit: c.outfit ?? null,
        sortOrder: i,
      }) as SceneCharacterEntity,
    )
  }

  private synthesizeDialoguesFromJson(
    scene: SceneScriptEntity,
  ): SceneDialogueEntity[] {
    const arr = (scene.dialogues as Dialogue[] | null) ?? []
    return arr.map((d, i) =>
      ({
        userId: scene.userId,
        id: d.id || `synthetic-d-${scene.id}-${i}`,
        sceneScriptId: scene.id,
        characterId: d.characterId ?? '',
        characterBindingId: d.characterBindingId ?? null,
        characterName: d.characterName ?? '',
        text: d.text ?? '',
        emotion: d.emotion ?? null,
        volume: d.volume ?? 'normal',
        pace: d.pace ?? 'normal',
        pause: d.pause ?? 0,
        voiceId: d.voiceId ?? null,
        audioAssetId: null,
        sortOrder: i,
      }) as SceneDialogueEntity,
    )
  }

  private synthesizeActionsFromJson(
    scene: SceneScriptEntity,
  ): SceneActionEntity[] {
    const arr = (scene.actions as ActionDescription[] | null) ?? []
    return arr.map((a, i) =>
      ({
        userId: scene.userId,
        id: a.id || `synthetic-a-${scene.id}-${i}`,
        sceneScriptId: scene.id,
        characterId: a.characterId ?? null,
        characterBindingId: a.characterBindingId ?? null,
        description: a.description ?? '',
        timing: a.timing ?? 'during',
        duration: a.duration ?? null,
        sortOrder: i,
      }) as SceneActionEntity,
    )
  }

  /**
   * 道具合成：从 scene.characters JSON 中的 props 提取，挂到对应 character 的 sceneCharacterId 上。
   * props 兼容老格式（string）和新格式（{itemBindingId, name}）。
   */
  private synthesizePropsFromJson(
    scene: SceneScriptEntity,
    chars: SceneCharacterEntity[],
  ): ScenePropEntity[] {
    const result: ScenePropEntity[] = []
    const arr = (scene.characters as SceneCharacter[] | null) ?? []
    for (let ci = 0; ci < arr.length; ci++) {
      const c = arr[ci]
      const sceneChar = chars[ci]
      if (!sceneChar) continue
      const props = c.props ?? []
      for (let pi = 0; pi < props.length; pi++) {
        const p = props[pi]
        const ref: ScenePropRef =
          typeof p === 'string'
            ? { itemBindingId: null, name: p }
            : (p as ScenePropRef)
        result.push({
          userId: scene.userId,
          id: `synthetic-p-${scene.id}-${ci}-${pi}`,
          sceneCharacterId: sceneChar.id,
          propName: ref.name,
          itemBindingId: ref.itemBindingId,
        } as ScenePropEntity)
      }
    }
    return result
  }
}
