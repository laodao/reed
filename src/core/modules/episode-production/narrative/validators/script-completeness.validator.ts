/**
 * 剧本完整性校验器（spec §4.1 强约束）
 * @module modules/episode-production/narrative/validators/script-completeness
 *
 * 剧本定稿前的"硬关卡"：所有引用必须解析到资产库中存在 + 主图就绪。
 *
 * 违例分级：
 * - error：阻断定稿（binding 未设 / 不存在 / 资产无主图）
 * - warning：提示但不阻断（dialogue 没绑 voice，老剧本动作未迁移等）
 *
 * 设计原则：
 * - validator 是 pure-ish 计算单元（IO 只走传入的 ReferenceResolver），
 *   接受"已加载好"的场景结构，便于单测
 * - 数据装载由 service 层（P4-T5 scene-script.service.validateCompleteness）完成
 * - 输出 violations 结构稳定，UI 直接渲染（可跳转）
 */

import type { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import type { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import type { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import type { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import type { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import type {
  ReferenceResolver,
  ResolvedReference,
  BatchResolveItem,
} from '@core/modules/episode-production/narrative/reference-resolver'

/** 违例等级 */
export type ViolationLevel = 'error' | 'warning'

/** 违例代码（程序判定 + 国际化用） */
export type ViolationCode =
  | 'LOCATION_BINDING_MISSING' // SceneScript.locationBindingId 为 null
  | 'LOCATION_BINDING_UNRESOLVED' // 引用了 binding 但记录已删除
  | 'LOCATION_MAIN_IMAGE_MISSING' // 主图未生成
  | 'CHARACTER_BINDING_MISSING' // SceneCharacter.characterBindingId 为 null
  | 'CHARACTER_BINDING_UNRESOLVED'
  | 'CHARACTER_MAIN_IMAGE_MISSING'
  | 'DIALOGUE_CHARACTER_MISSING'
  | 'DIALOGUE_CHARACTER_UNRESOLVED'
  | 'DIALOGUE_VOICE_MISSING' // 对话没绑声音（warning，可后续选）
  | 'ACTION_CHARACTER_UNRESOLVED' // 动作绑了 binding 但解析失败
  | 'PROP_BINDING_MISSING'
  | 'PROP_BINDING_UNRESOLVED'
  | 'PROP_MAIN_IMAGE_MISSING'

/** 单条违例 */
export interface CompletenessViolation {
  level: ViolationLevel
  code: ViolationCode
  message: string
  /** 所属场景 ID */
  sceneScriptId: string
  /** 场景编号（UI 展示用） */
  sceneNumber: number
  /** 上下文：违例对象的 ID 和类型，用于 UI 跳转 */
  context: {
    targetType: 'scene' | 'character' | 'dialogue' | 'action' | 'prop'
    targetId?: string // SceneCharacter / Dialogue / Action / Prop 的 id
    bindingId?: string // 涉及的 binding ID（如有）
  }
}

/** 单场景 + 其下属表的预加载结构 */
export interface SceneInputBundle {
  scene: SceneScriptEntity
  characters: SceneCharacterEntity[]
  dialogues: SceneDialogueEntity[]
  actions: SceneActionEntity[]
  props: ScenePropEntity[]
}

/** 完整性报告 */
export interface CompletenessReport {
  ok: boolean
  errorCount: number
  warningCount: number
  violations: CompletenessViolation[]
}

/**
 * 剧本完整性校验器。
 *
 * 用法：
 * ```ts
 * const validator = new ScriptCompletenessValidator(new ReferenceResolver(ds))
 * const report = await validator.validateScene({ scene, characters, dialogues, actions, props })
 * if (!report.ok) report.violations.forEach(v => console.warn(v.code, v.message))
 * ```
 */
export class ScriptCompletenessValidator {
  constructor(private readonly resolver: ReferenceResolver) {}

  /** 校验单场景 */
  async validateScene(bundle: SceneInputBundle): Promise<CompletenessReport> {
    const violations: CompletenessViolation[] = []
    const { scene, characters, dialogues, actions, props } = bundle

    // 收集所有要解析的 binding 引用（去重由 resolveBatch 内部处理）
    const refs: Array<{ kind: 'character' | 'location' | 'item'; bindingId: string }> = []

    if (scene.locationBindingId) {
      refs.push({ kind: 'location', bindingId: scene.locationBindingId })
    }
    for (const c of characters) {
      if (c.characterBindingId) {
        refs.push({ kind: 'character', bindingId: c.characterBindingId })
      }
    }
    for (const d of dialogues) {
      if (d.characterBindingId) {
        refs.push({ kind: 'character', bindingId: d.characterBindingId })
      }
    }
    for (const a of actions) {
      if (a.characterBindingId) {
        refs.push({ kind: 'character', bindingId: a.characterBindingId })
      }
    }
    for (const p of props) {
      if (p.itemBindingId) {
        refs.push({ kind: 'item', bindingId: p.itemBindingId })
      }
    }

    // 一次批量解析；存到查找表
    const resolved = refs.length > 0 ? await this.resolver.resolveBatch(refs) : []
    const lookup = new Map<string, BatchResolveItem>()
    for (const r of resolved) {
      lookup.set(`${r.kind}:${r.bindingId}`, r)
    }

    const get = (
      kind: 'character' | 'location' | 'item',
      bindingId: string,
    ): BatchResolveItem | undefined => lookup.get(`${kind}:${bindingId}`)

    // 1. 场景地点 location_binding_id
    if (!scene.locationBindingId) {
      violations.push({
        level: 'error',
        code: 'LOCATION_BINDING_MISSING',
        message: `场景 ${scene.sceneNumber} 未绑定地点资产`,
        sceneScriptId: scene.id,
        sceneNumber: scene.sceneNumber,
        context: { targetType: 'scene' },
      })
    } else {
      const r = get('location', scene.locationBindingId)
      if (!r || !r.found) {
        violations.push({
          level: 'error',
          code: 'LOCATION_BINDING_UNRESOLVED',
          message: `场景 ${scene.sceneNumber} 绑定的地点资产已不存在`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: { targetType: 'scene', bindingId: scene.locationBindingId },
        })
      } else if (!(r as ResolvedReference & { found: true }).mainImage) {
        violations.push({
          level: 'error',
          code: 'LOCATION_MAIN_IMAGE_MISSING',
          message: `场景 ${scene.sceneNumber} 的地点"${r.kind === 'location' ? r.effective.name : ''}"还没生成主图`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: { targetType: 'scene', bindingId: scene.locationBindingId },
        })
      }
    }

    // 2. 出场角色
    for (const c of characters) {
      if (!c.characterBindingId) {
        violations.push({
          level: 'error',
          code: 'CHARACTER_BINDING_MISSING',
          message: `场景 ${scene.sceneNumber} 角色"${c.characterName}"未绑定到角色资产`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: { targetType: 'character', targetId: c.id },
        })
        continue
      }
      const r = get('character', c.characterBindingId)
      if (!r || !r.found) {
        violations.push({
          level: 'error',
          code: 'CHARACTER_BINDING_UNRESOLVED',
          message: `场景 ${scene.sceneNumber} 角色"${c.characterName}"绑定的角色资产已不存在`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: {
            targetType: 'character',
            targetId: c.id,
            bindingId: c.characterBindingId,
          },
        })
        continue
      }
      if (!(r as ResolvedReference & { found: true }).mainImage) {
        violations.push({
          level: 'error',
          code: 'CHARACTER_MAIN_IMAGE_MISSING',
          message: `场景 ${scene.sceneNumber} 角色"${c.characterName}"还没生成主图`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: {
            targetType: 'character',
            targetId: c.id,
            bindingId: c.characterBindingId,
          },
        })
      }
    }

    // 3. 对话
    for (const d of dialogues) {
      if (!d.characterBindingId) {
        violations.push({
          level: 'error',
          code: 'DIALOGUE_CHARACTER_MISSING',
          message: `场景 ${scene.sceneNumber} 对话（${d.text.slice(0, 16)}...）未绑定角色资产`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: { targetType: 'dialogue', targetId: d.id },
        })
      } else {
        const r = get('character', d.characterBindingId)
        if (!r || !r.found) {
          violations.push({
            level: 'error',
            code: 'DIALOGUE_CHARACTER_UNRESOLVED',
            message: `场景 ${scene.sceneNumber} 对话角色资产已不存在`,
            sceneScriptId: scene.id,
            sceneNumber: scene.sceneNumber,
            context: {
              targetType: 'dialogue',
              targetId: d.id,
              bindingId: d.characterBindingId,
            },
          })
        }
      }

      // voice 缺失是 warning（后续 P5 阶段还能补）
      const charBindingResolved =
        d.characterBindingId && get('character', d.characterBindingId)
      const charVoice =
        charBindingResolved && charBindingResolved.found
          ? (charBindingResolved as ResolvedReference & { found: true }).kind === 'character'
            ? (charBindingResolved as any).effective?.voiceId ?? null
            : null
          : null
      if (!d.voiceId && !charVoice) {
        violations.push({
          level: 'warning',
          code: 'DIALOGUE_VOICE_MISSING',
          message: `场景 ${scene.sceneNumber} 对话未指定声音（角色资产也未绑 voice）`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: { targetType: 'dialogue', targetId: d.id },
        })
      }
    }

    // 4. 动作（characterBindingId null 是合法的 → 群像动作；非 null 但解析不到才是违例）
    for (const a of actions) {
      if (!a.characterBindingId) continue
      const r = get('character', a.characterBindingId)
      if (!r || !r.found) {
        violations.push({
          level: 'error',
          code: 'ACTION_CHARACTER_UNRESOLVED',
          message: `场景 ${scene.sceneNumber} 动作绑定的角色资产已不存在`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: {
            targetType: 'action',
            targetId: a.id,
            bindingId: a.characterBindingId,
          },
        })
      }
    }

    // 5. 道具
    for (const p of props) {
      if (!p.itemBindingId) {
        violations.push({
          level: 'error',
          code: 'PROP_BINDING_MISSING',
          message: `场景 ${scene.sceneNumber} 道具"${p.propName}"未绑定到物品资产`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: { targetType: 'prop', targetId: p.id },
        })
        continue
      }
      const r = get('item', p.itemBindingId)
      if (!r || !r.found) {
        violations.push({
          level: 'error',
          code: 'PROP_BINDING_UNRESOLVED',
          message: `场景 ${scene.sceneNumber} 道具"${p.propName}"绑定的物品资产已不存在`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: {
            targetType: 'prop',
            targetId: p.id,
            bindingId: p.itemBindingId,
          },
        })
        continue
      }
      if (!(r as ResolvedReference & { found: true }).mainImage) {
        violations.push({
          level: 'error',
          code: 'PROP_MAIN_IMAGE_MISSING',
          message: `场景 ${scene.sceneNumber} 道具"${p.propName}"还没生成主图`,
          sceneScriptId: scene.id,
          sceneNumber: scene.sceneNumber,
          context: {
            targetType: 'prop',
            targetId: p.id,
            bindingId: p.itemBindingId,
          },
        })
      }
    }

    return this.buildReport(violations)
  }

  /** 校验多场景（剧集级别），汇总报告 */
  async validateScenes(bundles: SceneInputBundle[]): Promise<CompletenessReport> {
    const all: CompletenessViolation[] = []
    for (const b of bundles) {
      const r = await this.validateScene(b)
      all.push(...r.violations)
    }
    return this.buildReport(all)
  }

  private buildReport(violations: CompletenessViolation[]): CompletenessReport {
    const errorCount = violations.filter((v) => v.level === 'error').length
    const warningCount = violations.length - errorCount
    return {
      ok: errorCount === 0,
      errorCount,
      warningCount,
      violations,
    }
  }
}
