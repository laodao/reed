/**
 * StoryOverviewProvider（步骤1 新增）
 * @module core/platform/services/longwriting/context/providers/story-overview.provider
 *
 * 分区：故事宏观背景（核心冲突 + 概要 + 进度）。priority 4（必留）。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection, ContextItem } from '../context.types'
import { makeItemId } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'
import { getStoryTypeName, calculateStoryProgressStage } from '../entity-formatters'

export class StoryOverviewProvider implements ContextProvider {
  key = 'storyOverview'
  title = '故事宏观背景'
  priority = 4 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const items: ContextItem[] = []
    const overview = ctx.overview

    if (overview) {
      const storyTypeName = getStoryTypeName(overview.storyType || '')
      const progressStage = calculateStoryProgressStage(ctx.chapterNumber, ctx.totalChapters)
      const content = `**故事标题**：${overview.title || '未命名'}\n**故事类型**：${storyTypeName}\n**核心冲突**：${overview.coreConflict || '未指定'}\n**预估总章节数**：${ctx.totalChapters}章\n**当前进度**：第${ctx.chapterNumber}章（${progressStage}）`
      items.push(
        makeItem({
          id: makeItemId('storyOverview', 'overview'),
          type: 'storyOverview',
          title: overview.title || '故事概要',
          summary: `${storyTypeName} · ${overview.coreConflict || '无核心冲突'}`,
          content,
          priority: 4,
        }),
      )
    }

    // 核心构思单独成项（若存在且较长）
    if (overview?.coreIdea) {
      items.push(
        makeItem({
          id: makeItemId('storyOverview', 'coreIdea'),
          type: 'storyOverview',
          title: '核心构思',
          summary: overview.coreIdea.slice(0, 60),
          content: `**核心构思**：${overview.coreIdea}`,
          priority: 4,
        }),
      )
    }

    return makeSection(this.key, this.title, this.priority, items)
  }
}
