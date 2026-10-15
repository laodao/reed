/**
 * 章节工作台：上下文组装的类型与纯函数（38 号）
 * @module core/platform/services/longwriting/chapter-context
 *
 * 预览=实际（单一事实源）：LongWritingAIService.assembleChapterGeneration 产出
 * items（可控制上下文项）+ parts（组装原料），composeChapterPrompt 按「是否启用」
 * 重组最终 prompt——面板勾选与真实生成共享同一组装逻辑，绝不两套漂移。
 */

/** 上下文分区（面板分组展示用） */
export type ChapterContextSectionKey =
  | 'overview' | 'background' | 'character' | 'location'
  | 'outline' | 'prewrite' | 'graph' | 'prevChapters'

/** 单个可控制上下文项 */
export interface ChapterContextItem {
  /** 稳定 id（`sectionKey:entityId|key`），供勾选与覆写定位 */
  id: string
  sectionKey: ChapterContextSectionKey
  title: string
  /** 注入 prompt 的原文 */
  text: string
  /** 本地估算 tokens（UTF-8 字节/4，与 ContextManager 同款口径） */
  tokens: number
  defaultChecked: boolean
}

/** 组装原料（compose 的输入；条目文本与 items 同源） */
export interface ChapterPromptParts {
  overviewText: string
  /** 世界观设定（独立受控段——42号 review 修复：曾内嵌 overviewText 致 'background' 勾选失效） */
  backgroundText: string
  /** 世界观库·常驻/命中条目（设定资产库；受控项 id='worldLibrary'——H1 修复：预览与生成都走本字段） */
  worldLibraryText: string
  taskText: string
  characterItems: ChapterContextItem[]
  locationItems: ChapterContextItem[]
  prevEndingText: string
  constraintsText: string
  prewriteContent: string
  graphSection: string
  recallSection: string
  styleText: string
  extraText: string
}

/** 预览结果（lw:chapter-context-preview 的 data） */
export interface ChapterContextResult {
  items: ChapterContextItem[]
  promptText: string
  estimateTokens: number
  windowTokens: number
}

/** token 估算：UTF-8 字节 / 4（中文场景 ≈1.3 字/token 的粗口径，与 ContextManager 一致） */
export function estimateContextTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4)
}

/**
 * 按「条目启用谓词」重组章节生成 prompt。
 * 固定骨架（章节任务/衔接建议/风格与附加要求）不受控；受控分区按条目过滤：
 * 多条目分区（角色/地点）逐条剔除，单条目分区禁用后整段回退占位文案。
 */
export function composeChapterPrompt(
  parts: ChapterPromptParts,
  isEnabled: (itemId: string) => boolean,
  opts: { targetWords: number; style?: string; extraPrompt?: string },
): string {
  const chars = parts.characterItems.filter((i) => isEnabled(i.id))
  const locs = parts.locationItems.filter((i) => isEnabled(i.id))
  const characterSection = chars.length > 0 ? chars.map((i) => i.text).join('\n') : '无特定涉及角色'
  const locationSection = locs.length > 0 ? locs.map((i) => i.text).join('\n') : '无特定涉及地点'
  const prevEnabled = isEnabled('prevEnding')
  const constraints = [
    isEnabled('memory') ? parts.constraintsText : '',
  ].filter(Boolean).join('')
  const prewriteSection = parts.prewriteContent && isEnabled('prewrite')
    ? `\n## 七、预写提纲\n\n${parts.prewriteContent}\n`
    : ''
  const graphSection = parts.graphSection && isEnabled('graph') ? parts.graphSection : '暂无图谱数据'
  const recallSection = parts.recallSection && isEnabled('recall') ? parts.recallSection : ''
  const prevEnding = prevEnabled ? parts.prevEndingText : ''

  return `# 章节写作任务

## 一、故事宏观背景

${isEnabled('overview') ? parts.overviewText : '（故事宏观背景已由用户禁用——按通识写作，避免虚构项目设定）'}

### 世界观设定

${isEnabled('background') ? (parts.backgroundText || '暂无世界观设定') : '（世界观设定已由用户禁用——按通识写作）'}

### 世界观库（设定资产库·常驻体系与规则）

${parts.worldLibraryText && isEnabled('worldLibrary') ? parts.worldLibraryText : '（无绑定世界观或世界观库已禁用）'}

---

## 二、当前章节任务

${parts.taskText}
**目标字数**：${opts.targetWords}字

---

## 三、涉及角色完整信息

${characterSection}

---

## 四、涉及场景环境

${locationSection}

---

## 五、前文衔接信息

### 上一章结尾原文（请仔细阅读，确保自然衔接）
${prevEnding || '这是开篇章节'}

### 衔接建议
- 时间线应从上一章结束时间之后开始
- 如果上一章有悬念或冲突，本章应有所呼应
- 注意角色位置和状态与上一章结束时的衔接

---

## 六、关键约束
${constraints}
${prewriteSection}---

## 七、图谱关系与事件（时间线一致性）
${graphSection}
${recallSection}---
${opts.style ? `## 八、写作风格要求

${parts.styleText}` : ''}
${opts.extraPrompt && parts.extraText ? `## 九、附加要求

${parts.extraText}` : ''}

请根据以上所有信息，撰写章节正文内容。直接开始写作，不需要标题。`
}
