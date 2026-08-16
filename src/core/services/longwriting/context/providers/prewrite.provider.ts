/**
 * PrewriteProvider（步骤1 新增）
 * 分区：预写提纲。priority 5（高）。
 * 复用 BuildContext.prewrite（loadBuildContext 已查）。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'

export class PrewriteProvider implements ContextProvider {
  key = 'prewrite'
  title = '预写提纲'
  priority = 5 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    if (!ctx.prewrite?.content) {
      return makeSection(this.key, this.title, this.priority, [])
    }
    return makeSection(this.key, this.title, this.priority, [
      makeItem({
        id: 'prewrite:outline',
        type: 'prewrite',
        title: 'AI 预写提纲',
        summary: ctx.prewrite.content.slice(0, 60),
        content: ctx.prewrite.content,
        priority: 5,
      }),
    ])
  }
}
