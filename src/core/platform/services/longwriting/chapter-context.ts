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
  /** W2.1：超预算被裁剪的分区名（空/缺省=未触发裁剪） */
  trimmedSections?: string[]
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
${parts.styleText ? `## 八、写作风格要求

${parts.styleText}` : ''}
${opts.extraPrompt && parts.extraText ? `## 九、附加要求

${parts.extraText}` : ''}

请根据以上所有信息，撰写章节正文内容。直接开始写作，不需要标题。`
}

// ==================== W3.1：长章分段生成 ====================

/** 分段阈值：目标字数超过它才走分段路径（W3.1） */
export const CHAPTER_SEGMENT_THRESHOLD_WORDS = 5_000
/** 单段目标字数（段数 = ceil(目标/此值)，封顶 CHAPTER_SEGMENT_MAX_COUNT） */
export const CHAPTER_SEGMENT_TARGET_WORDS = 2_500
/** 段数上限（封顶单章生成时长；30000 字按 8 段 ≈ 每段 3750 字） */
export const CHAPTER_SEGMENT_MAX_COUNT = 8

/**
 * 构建分段续写指令（拼在九分区 prompt 之后）。
 * OQ-1 默认方案：均分段（不解析设计卡节拍）；R 门禁与写后检查由调用方对整章执行一次。
 */
export function buildChapterSegmentSection(
  targetWords: number,
  segCount: number,
  segIndex: number,
  segTarget: number,
  priorText: string,
): string {
  const isLast = segIndex + 1 >= segCount
  return `

## 分段续写指令（长章模式）

本章目标约 ${targetWords} 字，超长正文按 ${segCount} 个场景段顺序生成，当前是第 ${segIndex + 1} 段（本段约 ${segTarget} 字）。
${priorText ? `【本章已生成的前文】\n${priorText}\n\n请从上文结尾自然续写：禁止重复或改写已生成内容，保持人物状态、时间线与叙事视角连续。` : '这是本章的第一段：从正文开头写起。'}
${isLast ? '本段是本章最后一段：按前文要求把情节推进到本章结尾的钩子/卡点上，完成收束。' : '本段结尾不要收束本章，停在情节推进处，为下一段留出接续空间。'}
直接输出本段正文内容，不要任何说明或标题。`
}

// ==================== W2.1：上下文预算硬裁剪 ====================

/** 单个裁剪阶梯：label 供面板徽标/日志，apply 原地修改 parts 副本 */
interface TrimStep {
  label: string
  apply: (p: ChapterPromptParts) => void
}

/** 保头截断：卡片字段（姓名/性格等）集中在前部，截尾丢的是背景/弧光等低密度内容 */
function clipHead(text: string, ratio: number): string {
  if (!text) return text
  const keep = Math.max(1, Math.ceil(text.length * ratio))
  return text.length <= keep ? text : `${text.slice(0, keep)}\n（已截断以适配上下文预算）`
}

/** 保尾截断：衔接文本的价值在结尾（接到上一章末尾） */
function clipTail(text: string, keepChars: number): string {
  if (!text) return text
  return text.length <= keepChars ? text : `（前文已截断）${text.slice(-keepChars)}`
}

/**
 * 按分区价值阶梯裁剪组装原料至预算内（W2.1）。
 * - 低于预算：原样返回（steps 为空）——小项目 prompt 逐字节不变（回归安全）
 * - 裁剪顺序 = 价值从低到高：世界观库触发条目 → 地点卡 → 角色卡 → 世界观背景 →
 *   图谱段 → 上章结尾 → 约束段；任务/设计卡/风格/附加要求永不裁
 * @param buildPrompt 用（可能已裁剪的）parts 重组完整 prompt 的回调——与真实组装单一事实源
 */
export function trimChapterPartsToBudget(
  parts: ChapterPromptParts,
  systemPrompt: string,
  windowTokens: number,
  buildPrompt: (p: ChapterPromptParts) => string,
): { parts: ChapterPromptParts; steps: string[]; estimateTokens: number } {
  const measure = (p: ChapterPromptParts): number =>
    estimateContextTokens(buildPrompt(p)) + estimateContextTokens(systemPrompt)

  const estimate = measure(parts)
  if (!(windowTokens > 0) || estimate <= windowTokens) {
    return { parts, steps: [], estimateTokens: estimate }
  }

  const copy: ChapterPromptParts = { ...parts }
  const steps: TrimStep[] = [
    { label: '世界观库触发条目', apply: (p) => { p.worldLibraryText = '' } },
    { label: '涉及地点卡截半', apply: (p) => { p.locationItems = p.locationItems.map((i) => ({ ...i, text: clipHead(i.text, 0.5) })) } },
    { label: '涉及角色卡截半', apply: (p) => { p.characterItems = p.characterItems.map((i) => ({ ...i, text: clipHead(i.text, 0.5) })) } },
    { label: '世界观背景摘要化', apply: (p) => { p.backgroundText = clipHead(p.backgroundText, 0.15) } },
    { label: '图谱关系与事件段截前 60%', apply: (p) => { p.graphSection = clipHead(p.graphSection, 0.6) } },
    { label: '上一章结尾截尾保留', apply: (p) => { p.prevEndingText = clipTail(p.prevEndingText, 250) } },
    { label: '关键约束段（记忆/状态链）截前 60%', apply: (p) => { p.constraintsText = clipHead(p.constraintsText, 0.6) } },
  ]

  const fired: string[] = []
  for (const step of steps) {
    if (measure(copy) <= windowTokens) break
    step.apply(copy)
    fired.push(step.label)
  }

  return { parts: copy, steps: fired, estimateTokens: measure(copy) }
}
