/**
 * EntityStateProvider（步骤1 新增）
 * 分区：涉及实体当前状态一致性约束。priority 2（必留）。
 *
 * 与 CharacterProvider/LocationProvider 互补：那些分区注入实体完整信息，
 * 本分区注入"状态一致性约束"（提醒 AI 不要违反实体当前状态）。
 * 复用 BuildContext.entityStateMap（loadBuildContext 已查 involved 实体状态）。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection, ContextItem } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'

export class EntityStateProvider implements ContextProvider {
  key = 'entityState'
  title = '实体状态一致性'
  priority = 2 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const items: ContextItem[] = []

    // 遍历 involved 实体，每个有状态的生成一个约束项
    const collect = (ids: string[], type: string, names: { id: string; name: string }[]) => {
      for (const id of ids) {
        const state = ctx.entityStateMap.get(`${type}:${id}`)
        if (!state) continue
        const name = names.find((n) => n.id === id)?.name || id
        items.push(
          makeItem({
            id: `entityState:${type}:${id}`,
            type: 'entityState',
            title: `${name} 当前状态`,
            summary: state.slice(0, 60),
            content: `- ${name}：${state}`,
            priority: 2,
          }),
        )
      }
    }

    collect(
      ctx.involvedCharacterIds,
      'character',
      ctx.characters.map((c: any) => ({ id: c.id, name: c.name })),
    )
    collect(
      ctx.involvedLocationIds,
      'location',
      ctx.locations.map((l: any) => ({ id: l.id, name: l.name })),
    )

    return makeSection(this.key, this.title, this.priority, items)
  }
}
