/**
 * VectorSearchProvider（步骤1 新增，vector 检索）
 * @module core/services/longwriting/context/providers/vector-search.provider
 *
 * 分区：相关历史片段（章节切片 + 相关设定，补充 CharacterProvider/LocationProvider 未标记的语义相关项）。
 * priority 8（中）。
 *
 * 与 MemoryProvider 区别：不限 entityType（检索 chapter 切片 + 其他设定），用 preview 直接作 content。
 */

import type {
  ContextProvider,
  ContextBuildInput,
  BuildContext,
  ContextSection,
  ContextItem,
} from '../context.types'
import { makeItemId } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'

export class VectorSearchProvider implements ContextProvider {
  key = 'vectorSearch'
  title = '相关历史片段'
  priority = 8 as const

  async build(input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const query = ctx.outline.summary || ctx.outline.name || ''
    if (!query) return makeSection(this.key, this.title, this.priority, [])

    const chapterNumberLte = Math.max(0, ctx.chapterNumber - 1)
    const hits = await ctx.vectorIndexService.search(input.projectId, query, {
      // 不限 entityType：检索 chapter 切片 + 设定（character/location/item/plot...）
      chapterNumberLte,
      topK: 8,
    })

    if (hits.length === 0) return makeSection(this.key, this.title, this.priority, [])

    const items: ContextItem[] = hits.map((hit) =>
      makeItem({
        id: makeItemId('vectorSearch', hit.entityId, hit.chunkId),
        type: hit.entityType === 'chapter' ? 'previousChapter' : 'memory',
        title: `[${hit.entityType}] ${hit.entityId}`,
        summary: hit.preview.slice(0, 60),
        content: hit.preview,
        source: 'vector',
        score: hit.score,
        priority: 8,
      }),
    )

    items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return makeSection(this.key, this.title, this.priority, items)
  }
}
