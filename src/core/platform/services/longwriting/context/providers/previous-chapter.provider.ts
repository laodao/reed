/**
 * PreviousChapterProvider（步骤1 新增）
 * 分区：前文衔接（上一章结尾原文 + 上一章状态摘要）。priority 3（必留）。
 * 复用 BuildContext.previousChapterEnding（已用 extractEndingByParagraph 截取）+ chapterStateSummary。
 */

import type { ContextProvider, ContextBuildInput, BuildContext, ContextSection, ContextItem } from '../context.types'
import { makeSection, makeItem } from './provider-helpers'

export class PreviousChapterProvider implements ContextProvider {
  key = 'previousChapter'
  title = '前文衔接'
  priority = 3 as const

  async build(_input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection> {
    const items: ContextItem[] = []

    // 上一章结尾原文
    if (ctx.previousChapterEnding) {
      items.push(
        makeItem({
          id: 'previousChapter:ending',
          type: 'previousChapter',
          title: '上一章结尾原文',
          summary: ctx.previousChapterEnding.slice(0, 60),
          content: `### 上一章结尾原文（请仔细阅读，确保自然衔接）\n${ctx.previousChapterEnding}`,
          priority: 3,
        }),
      )
    } else {
      items.push(
        makeItem({
          id: 'previousChapter:opening',
          type: 'previousChapter',
          title: '开篇章节',
          summary: '这是开篇章节，无前文',
          content: '这是开篇章节',
          priority: 3,
          included: true,
          editable: false,
        }),
      )
    }

    // 上一章状态摘要（storyTime/location/characterStates/pendingEvents）
    const summary = ctx.chapterStateSummary
    if (summary) {
      const lines: string[] = []
      if (summary.storyTime) lines.push(`- 故事时间：${summary.storyTime}`)
      if (summary.currentLocation) lines.push(`- 当前地点：${summary.currentLocation}`)
      if (summary.characterStates) lines.push(`- 角色状态：${summary.characterStates}`)
      if (summary.pendingEvents) lines.push(`- 待处理事件：${summary.pendingEvents}`)
      if (lines.length > 0) {
        items.push(
          makeItem({
            id: 'chapterStateSummary:latest',
            type: 'chapterStateSummary',
            title: '上一章结束状态',
            summary: lines[0].replace('- ', ''),
            content: `### 上一章结束状态\n${lines.join('\n')}`,
            priority: 3,
          }),
        )
      }
    }

    return makeSection(this.key, this.title, this.priority, items)
  }
}
