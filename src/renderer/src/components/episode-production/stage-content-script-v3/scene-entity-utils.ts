/**
 * scene-entity-utils · 场景与要素的反查工具
 *
 * 给定一个 EntityRef（角色/地点/物品），判断它出现于哪个场景；
 * 用于合并页右侧要素 sidebar 显示出场场景号 + 联动高亮。
 *
 * 设计原则：
 * - 纯函数，无副作用，便于单测
 * - 支持新旧两种 props 格式（string / ScenePropRef）
 * - 文本 @name 引用兜底，保障旧数据无结构化信息时也能命中
 */
import type {
  SceneScript,
  ScenePropRef,
} from '../../../../../shared/types/episode-production/narrative.types'

/** 要素种类：角色 / 地点 / 物品 */
export type EntityKind = 'character' | 'location' | 'item'

/**
 * 要素引用：用于向工具函数描述"我要找哪个要素"。
 *
 * - kind：要素类型，决定匹配策略
 * - name：要素名称，用于名字匹配和 @name 文本兜底
 * - id（可选）：binding id，精确匹配优先级最高
 *   - character → characterId 或 characterBindingId
 *   - location  → locationBindingId
 *   - item      → itemBindingId
 */
export interface EntityRef {
  kind: EntityKind
  name: string
  /** 对 character/item 是 binding id（如已绑），对 location 是 location_binding id */
  id?: string
}

/**
 * 判断某场景是否包含某 entity。
 *
 * 匹配策略：
 * - character：扫 scene.characters[]，通过 characterId / characterName / characterBindingId 任一命中即 true
 * - location：scene.location 名匹配 或 scene.locationBindingId 匹配
 * - item：先扫 SceneCharacter.props[]（支持字符串名 + ScenePropRef 两种格式），
 *         命中即 true；否则扫场景所有文本字段（originalText / narration /
 *         dialogues[].text / actions[].description）中的 `@${name}` 引用兜底
 */
export function sceneContainsEntity(scene: SceneScript, entity: EntityRef): boolean {
  if (entity.kind === 'character') {
    // 角色：通过 characterId（兼容旧数据）、characterName、characterBindingId（新数据）三路命中
    // 注意：id 匹配只在 entity.id 非空时生效，避免 undefined === undefined 的假阳性
    return (scene.characters ?? []).some(
      (c) =>
        (entity.id != null && c.characterId === entity.id) ||
        c.characterName === entity.name ||
        (entity.id != null && c.characterBindingId === entity.id),
    )
  }

  if (entity.kind === 'location') {
    // 地点：名字直接命中（兜底）或 binding id 精确命中（id 非空时才比对，避免 undefined === undefined）
    return (
      scene.location === entity.name ||
      (entity.id != null && scene.locationBindingId != null && scene.locationBindingId === entity.id)
    )
  }

  // item：先从结构化 props 精确查找
  for (const c of scene.characters ?? []) {
    for (const p of c.props ?? []) {
      if (typeof p === 'string' && p === entity.name) return true
      if (typeof p === 'object') {
        const prop = p as ScenePropRef
        // itemBindingId 精确匹配（entity.id 非空时）或名字匹配
        if (
          (entity.id != null && prop.itemBindingId != null && prop.itemBindingId === entity.id) ||
          prop.name === entity.name
        ) {
          return true
        }
      }
    }
  }

  // item 兜底：扫描所有文本字段中的 `@name` 引用
  // 覆盖尚未结构化但在旁白/对话/动作中提到道具的历史数据
  const corpus = [
    scene.originalText ?? '',
    scene.narration ?? '',
    ...(scene.dialogues?.map((d) => d.text) ?? []),
    ...(scene.actions?.map((a) => a.description) ?? []),
  ].join(' ')
  return corpus.includes(`@${entity.name}`)
}

/**
 * 返回 entity 出场的场景编号列表（升序）。
 *
 * 使用 scene.sceneNumber（不是数组 index），与场景显示编号保持一致。
 * 用于要素 sidebar 显示"出场场景：1, 3, 5"及点击联动高亮。
 */
export function entityScenes(entity: EntityRef, scenes: SceneScript[]): number[] {
  return scenes
    .filter((s) => sceneContainsEntity(s, entity))
    .map((s) => s.sceneNumber)
    .sort((a, b) => a - b)
}
