/**
 * MemoryProvider（步骤1 新增，vector 检索）
 * @module core/platform/services/longwriting/context/providers/memory.provider
 *
 * 分区：关键记忆（语义检索，替代旧 getMemoryContext 的按章节号截断）。priority 6（高）。
 *
 * 流程：vector search(entityType='memory', chapterNumberLte=chapterNumber-1) →
 *      拿 memoryId 列表 → 回查 lwMemories.getById 取完整 memory → formatMemoryItem 渲染。
 *
 * 决策：vector 空就空 items，不降级到旧 SQL（严格满足验收 1.2：getMemoriesBeforeChapter 调用=0）。
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
import { formatMemoryItem } from '../entity-formatters'

/** query 构造：大纲摘要 + 章节名 + 涉及角色名 */
function buildMemoryQuery(ctx: BuildContext): string {
  const parts: string[] = []
  if (ctx.outline.summary) parts.push(ctx.outline.summary)
  if (ctx.outline.name) parts.push(ctx.outline.name)
  const charNames = ctx.involvedCharacterIds
    .map((id) => ctx.characters.find((c: any) => c.id === id)?.name)
    .filter(Boolean)
  if (charNames.length > 0) parts.push(charNames.join(' '))
  return parts.join(' ').trim() || ctx.outline.name || ''
}

export class MemoryProvider implements ContextProvider {
  key = 'memory'
  title = '关键记忆'
  priority = 6 as const

  async build(input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const query = buildMemoryQuery(ctx)
    if (!query) return makeSection(this.key, this.title, this.priority, [])

    // vector 检索（不检索未写章节：chapterNumberLte = chapterNumber - 1）
    const chapterNumberLte = Math.max(0, ctx.chapterNumber - 1)
    const hits = await ctx.vectorIndexService.search(input.projectId, query, {
      entityType: 'memory',
      chapterNumberLte,
      topK: 15,
    })

    if (hits.length === 0) return makeSection(this.key, this.title, this.priority, [])

    // 回查完整 memory（vector 结果只有 preview + entityId）
    const items: ContextItem[] = []
    for (const hit of hits) {
      const memory = ctx.dbManager.lwMemories
        ? await ctx.dbManager.lwMemories.getById(hit.entityId)
        : null
      if (!memory) continue
      const info = formatMemoryItem({
        memoryType: memory.memoryType as string,
        title: memory.title,
        description: memory.description ?? undefined,
        importance: memory.importance as string,
      })
      items.push(
        makeItem({
          id: makeItemId('memory', memory.id, hit.chunkId),
          type: 'memory',
          title: info.title,
          summary: info.summary,
          content: info.content,
          source: 'vector',
          score: hit.score,
          priority: 6,
        }),
      )
    }

    // 按 score 降序（同分区内）
    items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return makeSection(this.key, this.title, this.priority, items)
  }
}
