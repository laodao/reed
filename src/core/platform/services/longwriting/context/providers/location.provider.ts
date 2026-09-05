/**
 * LocationProvider（步骤1 新增）
 * 分区：涉及场景环境。priority 7（中）。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection } from '../context.types'
import { makeItemId } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'
import { buildLocationInfo } from '../entity-formatters'

export class LocationProvider implements ContextProvider {
  key = 'location'
  title = '涉及场景环境'
  priority = 7 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const items = ctx.involvedLocationIds
      .map((id) => ctx.locations.find((l: any) => l.id === id))
      .filter(Boolean)
      .map((l: any) => {
        const stateSummary = ctx.entityStateMap.get(`location:${l.id}`) ?? null
        const info = buildLocationInfo(l, stateSummary)
        return makeItem({
          id: makeItemId('location', l.id),
          type: 'location',
          title: info.title,
          summary: info.summary,
          content: info.content,
          priority: 7,
        })
      })
    return makeSection(this.key, this.title, this.priority, items)
  }
}
