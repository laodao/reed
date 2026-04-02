/**
 * 长文写作类型定义
 * @module shared/types/longwriting.types
 */

// ==================== 项目相关类型 ====================

/**
 * 项目类型
 */
export type LongWritingProjectType = 'story' | 'comment'

/**
 * 故事类创作阶段
 */
export type StoryStage =
  | 'overview'      // 故事概要
  | 'plot'          // 故事情节（新增）
  | 'background'    // 时代背景与地点
  | 'characters'    // 角色设定
  | 'skills'        // 技能与物品（可选）
  | 'outline'       // 大纲设计
  | 'chapters'      // 章节写作

/**
 * 评论类创作阶段
 */
export type CommentStage =
  | 'topic'         // 主题与素材
  | 'outline'       // 大纲设计
  | 'chapters'      // 章节写作

/**
 * 长文写作项目
 */
export interface LongWritingProject {
  id: string
  name: string
  type: LongWritingProjectType
  stage: StoryStage | CommentStage
  progress: number         // 进度百分比 0-100
  createdAt: number
  updatedAt: number
}

// ==================== 故事概要相关类型 ====================

/**
 * 故事类型
 */
export type StoryType =
  | 'wuxia'       // 武侠
  | 'xianxia'     // 仙侠
  | 'xuanhuan'    // 玄幻
  | 'kehuan'      // 科幻
  | 'xuanyi'      // 悬疑
  | 'dushi'       // 都市
  | 'yanqing'     // 言情
  | 'lishi'       // 历史
  | 'other'       // 其他

/**
 * 故事风格
 */
export type StoryStyle =
  | 'light'       // 轻松幽默
  | 'heavy'       // 沉重深刻
  | 'passionate'  // 热血激昂
  | 'calm'        // 冷峻沉稳
  | 'popular'     // 通俗易懂
  | 'literary'    // 文学性强

/**
 * 目标读者
 */
export type TargetReader =
  | 'teenager'    // 青少年
  | 'youth'       // 青年
  | 'middle'      // 中年
  | 'all'         // 全年龄

/**
 * 预估篇幅
 */
export type EstimatedLength =
  | 'short'       // 短篇小说（5万字以下）
  | 'medium'      // 中篇小说（5-20万字）
  | 'long'        // 长篇小说（20万字以上）

/**
 * 故事概要
 */
export interface StoryOverview {
  id: string
  projectId: string
  storyType: StoryType
  title: string
  coreIdea: string           // 核心构思
  style?: StoryStyle         // 故事风格
  targetReader?: TargetReader // 目标读者
  estimatedLength?: EstimatedLength // 预估篇幅
  otherRequirements?: string // 其他要求
  summary: string
  coreConflict: string
  estimatedChapters: number
  isLocked: boolean
  createdAt: number
  updatedAt: number
}

// ==================== 时代背景相关类型 ====================

/**
 * 时代类型
 */
export type EraType = 'ancient' | 'modern' | 'future' | 'fictional'

/**
 * 时代背景
 */
export interface StoryBackground {
  id: string
  projectId: string
  eraType: EraType
  eraDescription: string
  socialStructure: string
  techLevel: string
  specialRules: string
  createdAt: number
  updatedAt: number
}

// ==================== 地点相关类型 ====================

/**
 * 地点重要程度
 */
export type LocationImportance = 'main' | 'important' | 'auxiliary'

/**
 * 地点类型
 */
export type LocationType =
  | 'city'        // 城市
  | 'village'     // 村庄
  | 'mountain'    // 山脉
  | 'palace'      // 宫殿
  | 'forest'      // 森林
  | 'sea'         // 海域
  | 'building'    // 建筑
  | 'other'       // 其他

/**
 * 地点设定
 */
export interface StoryLocation {
  id: string
  projectId: string
  name: string
  type: LocationType
  description: string
  importance: LocationImportance
  createdAt: number
  updatedAt: number
}

// ==================== 情节相关类型 ====================

/**
 * 故事情节
 */
export interface StoryPlot {
  id: string
  projectId: string
  title: string
  summary: string
  plotOrder: number            // 排序顺序
  involvedCharacters: string[] // 涉及的角色名称列表
  involvedLocations: string[]  // 涉及的地点名称列表
  notes?: string               // 备注
  createdAt: number
  updatedAt: number
}

/**
 * 创建情节请求
 */
export interface CreatePlotRequest {
  projectId: string
  title: string
  summary: string
  involvedCharacters?: string[]
  involvedLocations?: string[]
  notes?: string
}

/**
 * 更新情节请求
 */
export interface UpdatePlotRequest {
  title?: string
  summary?: string
  plotOrder?: number
  involvedCharacters?: string[]
  involvedLocations?: string[]
  notes?: string
}

/**
 * 重排序情节请求
 */
export interface ReorderPlotsRequest {
  projectId: string
  orderList: { id: string; order: number }[]
}

/**
 * AI 生成情节请求
 */
export interface GeneratePlotsRequest {
  projectId: string
}

/**
 * AI 生成的情节项
 */
export interface GeneratedPlotItem {
  title: string
  summary: string
  involvedCharacters: string[]
}

/**
 * 润色背景请求
 */
export interface PolishBackgroundRequest {
  projectId: string
  field: 'eraDescription' | 'socialStructure' | 'techLevel' // 要润色的字段
  eraType: EraType
  content: string
}

// ==================== 角色相关类型 ====================

/**
 * 角色定位
 */
export type CharacterRolePosition = 'protagonist' | 'supporting' | 'antagonist' | 'minor'

/**
 * 角色设定
 */
export interface StoryCharacter {
  id: string
  projectId: string
  portraitId?: string        // 关联的人像形象 ID
  name: string
  gender: 'male' | 'female' | 'other'
  age: number
  appearance: string         // 外貌描述
  background: string         // 背景故事
  personality: string        // 性格特点
  abilities: string          // 能力特长
  rolePosition: CharacterRolePosition
  majorEvents: string        // 主要事件
  createdAt: number
  updatedAt: number
}

/**
 * 角色关系
 */
export interface CharacterRelation {
  id: string
  characterId: string
  relatedCharacterId: string
  relationType: string       // 师徒/仇敌/恋人等
  relationDescription: string
  createdAt: number
}

// ==================== 技能物品相关类型 ====================

/**
 * 技能类型
 */
export type SkillType = 'martial' | 'magic' | 'ability' | 'tech' | 'other'

/**
 * 技能等级
 */
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'master'

/**
 * 技能设定
 */
export interface StorySkill {
  id: string
  projectId: string
  name: string
  type: SkillType
  level: SkillLevel
  description: string
  system: string             // 所属门派/体系
  characterIds: string[]     // 掌握此技能的角色
  createdAt: number
  updatedAt: number
}

/**
 * 物品类型
 */
export type ItemType = 'weapon' | 'artifact' | 'medicine' | 'manual' | 'token' | 'other'

/**
 * 物品等级
 */
export type ItemLevel = 'common' | 'rare' | 'legendary' | 'divine'

/**
 * 物品设定
 */
export interface StoryItem {
  id: string
  projectId: string
  name: string
  type: ItemType
  level: ItemLevel
  description: string
  ownerId?: string           // 持有者角色 ID
  createdAt: number
  updatedAt: number
}

// ==================== 大纲相关类型 ====================

/**
 * 大纲节点类型
 */
export type OutlineNodeType = 'volume' | 'chapter' | 'section'

/**
 * 大纲节点状态
 */
export type OutlineStatus = 'pending' | 'progressing' | 'completed'

/**
 * 大纲节点
 */
export interface StoryOutline {
  id: string
  projectId: string
  parentId?: string          // 父节点 ID（支持嵌套）
  name: string
  level: number              // 层级：1/2/3
  nodeType: OutlineNodeType
  summary: string            // 节点概要
  involvedCharacters: string[]  // 涉及角色 ID 列表
  involvedLocations: string[]   // 涉及地点 ID 列表
  status: OutlineStatus
  estimatedWords: number
  orderIndex: number         // 排序索引
  createdAt: number
  updatedAt: number
}

// ==================== 章节内容相关类型 ====================

/**
 * 章节内容
 */
export interface StoryChapter {
  id: string
  outlineId: string
  content: string
  wordCount: number
  createdAt: number
  updatedAt: number
}

/**
 * 版本类型
 */
export type VersionType = 'generated' | 'manual'

/**
 * 章节版本
 */
export interface ChapterVersion {
  id: string
  chapterId: string
  content: string
  versionType: VersionType
  wordCount: number
  isLocked: boolean          // 是否锁定
  versionNumber: number      // 版本号
  createdAt: number
}

// ==================== 素材相关类型 ====================

/**
 * 素材类型
 */
export type MaterialType = 'file' | 'url' | 'manual'

/**
 * 素材状态
 */
export type MaterialStatus = 'pending' | 'success' | 'failed'

/**
 * 素材
 */
export interface StoryMaterial {
  id: string
  projectId: string
  name: string
  type: MaterialType
  source: string             // 文件路径或网址
  content: string            // 素材内容
  status: MaterialStatus
  errorMessage?: string
  retryCount: number         // 重试次数
  used: boolean
  createdAt: number
}

// ==================== 对话记录相关类型 ====================

/**
 * 对话消息
 */
export interface DesignMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/**
 * 设计对话记录
 */
export interface DesignConversation {
  id: string
  projectId: string
  stage: string              // 所属阶段
  messages: DesignMessage[]
  createdAt: number
  updatedAt: number
}

// ==================== API 请求/响应类型 ====================

/**
 * 创建项目请求
 */
export interface CreateProjectRequest {
  name: string
  type: LongWritingProjectType
}

/**
 * 更新项目请求
 */
export interface UpdateProjectRequest {
  name?: string
  stage?: StoryStage | CommentStage
  progress?: number
}

/**
 * 创建角色请求
 */
export interface CreateCharacterRequest {
  projectId: string
  name: string
  gender: 'male' | 'female' | 'other'
  age: number
  appearance?: string
  background?: string
  personality?: string
  abilities?: string
  rolePosition?: CharacterRolePosition
  majorEvents?: string
  portraitId?: string
}

/**
 * 更新角色请求
 */
export interface UpdateCharacterRequest {
  name?: string
  gender?: 'male' | 'female' | 'other'
  age?: number
  appearance?: string
  background?: string
  personality?: string
  abilities?: string
  rolePosition?: CharacterRolePosition
  majorEvents?: string
  portraitId?: string
}

/**
 * 创建大纲节点请求
 */
export interface CreateOutlineRequest {
  projectId: string
  parentId?: string
  name: string
  nodeType: OutlineNodeType
  summary?: string
  involvedCharacters?: string[]
  involvedLocations?: string[]
  estimatedWords?: number
}

/**
 * 更新大纲节点请求
 */
export interface UpdateOutlineRequest {
  name?: string
  summary?: string
  involvedCharacters?: string[]
  involvedLocations?: string[]
  status?: OutlineStatus
  estimatedWords?: number
}

/**
 * 生成章节请求
 */
export interface GenerateChapterRequest {
  outlineId: string
  targetWords?: number
  style?: string
}

/**
 * 创建素材请求
 */
export interface CreateMaterialRequest {
  projectId: string
  name: string
  type: MaterialType
  source: string             // 文件路径或网址或手动内容
}

/**
 * 导出请求
 */
export interface ExportRequest {
  projectId: string
  format: 'txt' | 'markdown' | 'pdf' | 'image'
  scope: 'content' | 'settings' | 'full'
  selectedItems?: string[]   // 选择导出的设定项
}

// ==================== @ 引用相关类型 ====================

/**
 * 引用类型
 */
export type ReferenceType = 'character' | 'location' | 'skill' | 'item'

/**
 * 引用信息
 */
export interface ReferenceInfo {
  type: ReferenceType
  id: string
  name: string
  info: Record<string, any>
}

/**
 * 解析引用结果
 */
export interface ParsedReference {
  reference: ReferenceInfo
  startIndex: number
  endIndex: number
}

// ==================== 全局配置相关类型 ====================

/**
 * 长文写作全局配置
 */
export interface LongWritingGlobalSettings {
  id: string
  // 故事类型选项（可自定义）
  storyTypes: string[]
  // 故事风格选项
  styles: string[]
  // 目标读者选项
  targetReaders: string[]
  // 预估字数选项
  estimatedLengths: string[]
  // 技能类型选项
  skillTypes: string[]
  // 技能等级选项
  skillLevels: string[]
  // 物品类型选项
  itemTypes: string[]
  // 物品等级选项
  itemLevels: string[]
  createdAt: number
  updatedAt: number
}

/**
 * 默认的故事类型
 */
export const DEFAULT_STORY_TYPES = [
  '武侠', '仙侠', '玄幻', '科幻', '悬疑', '都市', '言情', '历史', '其他'
]

/**
 * 默认的故事风格
 */
export const DEFAULT_STYLES = [
  '轻松幽默', '沉重深刻', '热血激昂', '冷峻沉稳', '通俗易懂', '文学性强'
]

/**
 * 默认的目标读者
 */
export const DEFAULT_TARGET_READERS = [
  '青少年', '青年', '中年', '全年龄'
]

/**
 * 默认的预估字数
 */
export const DEFAULT_ESTIMATED_LENGTHS = [
  '短篇小说（5万字以下）', '中篇小说（5-20万字）', '长篇小说（20万字以上）'
]

/**
 * 默认的技能类型
 */
export const DEFAULT_SKILL_TYPES = [
  '武功', '法术', '天赋', '科技', '其他'
]

/**
 * 默认的技能等级
 */
export const DEFAULT_SKILL_LEVELS = [
  '初级', '中级', '高级', '大师'
]

/**
 * 默认的物品类型
 */
export const DEFAULT_ITEM_TYPES = [
  '武器', '神器', '丹药', '秘籍', '信物', '其他'
]

/**
 * 默认的物品等级
 */
export const DEFAULT_ITEM_LEVELS = [
  '普通', '稀有', '传说', '神级'
]

// ==================== 字典相关类型 ====================

/**
 * 字典分类
 */
export interface DictionaryCategory {
  id: string
  code: string
  name: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 字典项
 */
export interface DictionaryItem {
  id: string
  categoryCode: string
  code: string
  name: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}