/**
 * 实体格式化纯函数（步骤1 新增，从 longwriting-ai.service.ts 抽取）
 * @module core/platform/services/longwriting/context/entity-formatters
 *
 * 零依赖纯函数（不 import service、不 import db）。
 * service 旧路径和 ContextProvider 都调本模块，互不依赖（方案 B 轻量版）。
 *
 * 设计：函数返回结构化对象 { title, summary, content }，由调用方决定渲染成 ContextItem
 * 还是旧字符串。content 与 service 旧 builder 输出字节级一致（保回归）。
 */

// ==================== 共享映射表（从 service 原样搬） ====================

const GENDER_MAP: Record<string, string> = { male: '男', female: '女', other: '其他' }

const ROLE_POSITION_MAP: Record<string, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  minor: '小角色',
}

const LOCATION_TYPE_MAP: Record<string, string> = {
  city: '城市',
  village: '村庄',
  mountain: '山脉',
  palace: '宫殿',
  forest: '森林',
  sea: '海域',
  building: '建筑',
  other: '其他',
}

const LOCATION_IMPORTANCE_MAP: Record<string, string> = {
  main: '主要场景',
  important: '重要场景',
  auxiliary: '辅助场景',
}

const ERA_TYPE_MAP: Record<string, string> = {
  ancient: '古代',
  modern: '现代',
  future: '未来',
  fictional: '虚构世界',
}

const MEMORY_TYPE_LABELS: Record<string, string> = {
  character_event: '角色',
  location_event: '地点',
  item_event: '物品',
  relationship_change: '关系',
  faction_event: '势力',
  skill_event: '技能',
  general: '事件',
}

const STORY_TYPE_NAMES: Record<string, string> = {
  wuxia: '武侠',
  xianxia: '仙侠',
  xuanhuan: '玄幻',
  kehuan: '科幻',
  xuanyi: '悬疑',
  dushi: '都市',
  yanqing: '言情',
  lishi: '历史',
  other: '其他',
}

// ==================== 结构化结果类型 ====================

export interface FormattedEntity {
  /** 标题（如角色名） */
  title: string
  /** 一行摘要（清单展示用） */
  summary: string
  /** 完整内容（注入 prompt，与旧 builder 字节级一致） */
  content: string
}

// ==================== 工具函数 ====================

/** 统计中文字数（中文按字、英文按词）—— 从 service countChineseChars 原样搬 */
export function countChineseChars(text: string): number {
  if (!text) return 0
  const chineseChars = (text.match(/[一-龥]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}

/** 记忆类型中文标签 */
export function getMemoryTypeLabel(type: string): string {
  return MEMORY_TYPE_LABELS[type] || '事件'
}

/** 故事类型中文名 —— 从 service getStoryTypeName 原样搬 */
export function getStoryTypeName(storyType: string): string {
  return STORY_TYPE_NAMES[storyType] || storyType || '未指定'
}

/** 故事进度阶段 —— 从 service calculateStoryProgressStage 原样搬 */
export function calculateStoryProgressStage(chapterNumber: number, totalChapters: number): string {
  if (totalChapters <= 0) return '故事展开阶段'
  const progress = chapterNumber / totalChapters
  if (progress <= 0.1) return '故事开端阶段'
  if (progress <= 0.3) return '故事展开阶段'
  if (progress <= 0.5) return '故事深化阶段'
  if (progress <= 0.7) return '故事高潮铺垫阶段'
  if (progress <= 0.9) return '故事高潮阶段'
  return '故事收尾阶段'
}

/**
 * 从上一章正文结尾按段落截取指定字数 —— 从 service extractEndingContentByParagraph 原样搬
 * @param content 章节正文
 * @param targetChars 目标字数（默认 550）
 */
export function extractEndingByParagraph(content: string, targetChars = 550): string {
  if (!content || content.length <= targetChars) {
    return content || ''
  }
  const paragraphs = content.split(/\n+/).filter((p) => p.trim().length > 0)
  const resultParagraphs: string[] = []
  let totalChars = 0
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const paragraph = paragraphs[i]
    const paragraphChars = countChineseChars(paragraph)
    if (totalChars + paragraphChars > targetChars + 50 && totalChars >= 500) {
      break
    }
    resultParagraphs.unshift(paragraph)
    totalChars += paragraphChars
    if (totalChars >= targetChars - 50) {
      break
    }
  }
  return resultParagraphs.join('\n')
}

// ==================== 实体格式化（返回结构化 + 兼容旧字符串） ====================

/**
 * 构建角色完整信息 —— 从 service buildCharacterFullInfo 抽取
 * @param character StoryCharacter
 * @param stateSummary 该角色当前状态摘要（可选，来自 entityStateMap）
 */
export function buildCharacterInfo(
  character: any,
  stateSummary?: string | null,
): FormattedEntity {
  const content = renderCharacterText(character, stateSummary)
  const summary = `${character.name}（${ROLE_POSITION_MAP[character.rolePosition] || '未指定'}）`
  return { title: character.name, summary, content }
}

/** 兼容旧字符串渲染（service buildCharacterFullInfo 原样） */
export function renderCharacterText(character: any, stateSummary?: string | null): string {
  let info = `【${character.name}】\n`
  info += `- 基本信息：${GENDER_MAP[character.gender] || '未知'}，${character.age}岁`
  if (character.occupation) info += `，职业：${character.occupation}`
  info += '\n'
  if (character.appearance) info += `- 外貌特征：${character.appearance}\n`
  if (character.personality) info += `- 性格特点：${character.personality}\n`
  if (character.background) info += `- 背景故事：${character.background}\n`
  if (character.abilities) info += `- 能力特长：${character.abilities}\n`
  info += `- 角色定位：${ROLE_POSITION_MAP[character.rolePosition] || '未指定'}\n`
  if (stateSummary) info += `- 当前状态：${stateSummary}\n`
  return info
}

/**
 * 构建地点完整信息 —— 从 service buildLocationFullInfo 抽取
 */
export function buildLocationInfo(
  location: any,
  stateSummary?: string | null,
): FormattedEntity {
  const content = renderLocationText(location, stateSummary)
  const summary = `${location.name}（${LOCATION_IMPORTANCE_MAP[location.importance] || '一般'}）`
  return { title: location.name, summary, content }
}

/** 兼容旧字符串渲染（service buildLocationFullInfo 原样） */
export function renderLocationText(location: any, stateSummary?: string | null): string {
  let info = `【${location.name}】\n`
  info += `- 地点类型：${LOCATION_TYPE_MAP[location.type] || '其他'}\n`
  info += `- 重要程度：${LOCATION_IMPORTANCE_MAP[location.importance] || '一般'}\n`
  if (location.description) info += `- 详细描述：${location.description}\n`
  if (stateSummary) info += `- 当前状态：${stateSummary}\n`
  return info
}

/**
 * 构建物品信息（步骤1 新增，service 旧版没这个 builder，ItemProvider 用）
 */
export function buildItemInfo(item: any): FormattedEntity {
  const content = renderItemText(item)
  const summary = `${item.name}${item.type ? `（${item.type}）` : ''}`
  return { title: item.name, summary, content }
}

export function renderItemText(item: any): string {
  let info = `【${item.name}】\n`
  if (item.type) info += `- 物品类型：${item.type}\n`
  if (item.level) info += `- 等级：${item.level}\n`
  if (item.description) info += `- 描述：${item.description}\n`
  if (item.importance) info += `- 重要程度：${item.importance}\n`
  return info
}

/**
 * 构建背景设定 —— 从 service buildBackgroundContext 抽取
 */
export function buildBackgroundInfo(background: any | null): FormattedEntity | null {
  if (!background) return null
  const content = renderBackgroundText(background)
  const summary = `${ERA_TYPE_MAP[background.eraType] || '未知'}世界观`
  return { title: '世界观设定', summary, content }
}

/** 兼容旧字符串渲染（service buildBackgroundContext 原样，空 background 返回 ''） */
export function renderBackgroundText(background: any | null): string {
  if (!background) return ''
  let context = '【世界观设定】\n'
  context += `- 时代背景：${ERA_TYPE_MAP[background.eraType] || '未知'}\n`
  if (background.eraDescription) context += `- 时代描述：${background.eraDescription}\n`
  if (background.socialStructure) context += `- 社会结构：${background.socialStructure}\n`
  if (background.specialRules) context += `- 特殊规则：${background.specialRules}\n`
  return context
}

// ==================== 记忆格式化（MemoryProvider 用 vector 数据渲染） ====================

/** 单条记忆的结构化渲染（MemoryProvider 用 vector 检索结果渲染） */
export function formatMemoryItem(memory: {
  memoryType?: string
  title: string
  description?: string
  importance?: string
}): FormattedEntity {
  const typeLabel = getMemoryTypeLabel(memory.memoryType || 'general')
  const title = memory.title
  const summary = `[${typeLabel}] ${memory.title}`
  const content = `- [${typeLabel}] ${memory.title}：${memory.description || ''}`
  return { title, summary, content }
}
