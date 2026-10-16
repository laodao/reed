/**
 * BackgroundProvider（步骤1 新增）
 * 分区：世界观设定。priority 10（低，超预算先压缩）。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection } from '../context.types'
import { makeItemId } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'
import { buildBackgroundInfo } from '../entity-formatters'

export class BackgroundProvider implements ContextProvider {
  key = 'background'
  title = '世界背景设定'
  priority = 10 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const formatted = buildBackgroundInfo(ctx.background)
    if (!formatted) return makeSection(this.key, this.title, this.priority, [])
    return makeSection(this.key, this.title, this.priority, [
      makeItem({
        id: makeItemId('background', 'world'),
        type: 'background',
        title: formatted.title,
        summary: formatted.summary,
        content: formatted.content,
        priority: 10,
      }),
    ])
  }
}
