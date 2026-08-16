/**
 * CharacterProvider（步骤1 新增）
 * 分区：涉及角色完整信息 + 当前状态。priority 2（必留）。
 * 复用 entity-formatters.buildCharacterInfo + BuildContext.entityStateMap。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection } from '../context.types'
import { makeItemId } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'
import { buildCharacterInfo } from '../entity-formatters'

export class CharacterProvider implements ContextProvider {
  key = 'character'
  title = '涉及角色完整信息'
  priority = 2 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const items = ctx.involvedCharacterIds
      .map((id) => ctx.characters.find((c: any) => c.id === id))
      .filter(Boolean)
      .map((c: any) => {
        const stateSummary = ctx.entityStateMap.get(`character:${c.id}`) ?? null
        const info = buildCharacterInfo(c, stateSummary)
        return makeItem({
          id: makeItemId('character', c.id),
          type: 'character',
          title: info.title,
          summary: info.summary,
          content: info.content,
          priority: 2,
        })
      })
    return makeSection(this.key, this.title, this.priority, items)
  }
}
