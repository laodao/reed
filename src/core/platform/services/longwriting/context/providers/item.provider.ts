/**
 * ItemProvider（步骤1 新增）
 * 分区：涉及物品。priority 7（中）。
 * 补全旧 generateChapter 未用的 outline.involvedItems。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection } from '../context.types'
import { makeItemId } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'
import { buildItemInfo } from '../entity-formatters'

export class ItemProvider implements ContextProvider {
  key = 'item'
  title = '涉及物品'
  priority = 7 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const items = ctx.involvedItemIds
      .map((id) => ctx.items.find((i: any) => i.id === id))
      .filter(Boolean)
      .map((i: any) => {
        const info = buildItemInfo(i)
        return makeItem({
          id: makeItemId('item', i.id),
          type: 'item',
          title: info.title,
          summary: info.summary,
          content: info.content,
          priority: 7,
        })
      })
    return makeSection(this.key, this.title, this.priority, items)
  }
}
