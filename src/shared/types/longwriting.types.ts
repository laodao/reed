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
  | 'embedding'     // 向量化模型配置（向量索引基础设施用，非创作步骤）

/**
 * 评论类创作阶段
 */
export type CommentStage =
  | 'topic'         // 主题与素材
  | 'outline'       // 大纲设计
  | 'chapters'      // 章节写作

/**
 * 步骤模型配置
 */
export interface StageModelConfig {
  id: string
  projectId: string
  stage: StoryStage | CommentStage
  providerConfigId: string
  modelId: string
  createdAt: number
  updatedAt: number
}

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
 * 功能开关类型
 */
export type FeatureToggle = 'country' | 'faction' | 'sect' | 'map' | 'skill' | 'item'

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
  keyCharacters: KeyCharacter[]   // 关键角色（AI生成）
  keyLocations: KeyLocation[]     // 主要场景（AI生成）
  estimatedChapters: number
  enabledFeatures?: FeatureToggle[] // 启用的功能（国别、阵营、门派、技能、物品）
  isLocked: boolean
  isSaved: boolean           // 表单是否已保存
  createdAt: number
  updatedAt: number
}

/**
 * 关键角色（故事概要中的角色摘要）
 */
export interface KeyCharacter {
  name: string               // 角色名称
  role: string               // 角色定位（主角/配角/反派等）
  brief: string              // 简要描述
  importance: 'main' | 'secondary' | 'minor'  // 重要性
}

/**
 * 主要场景（故事概要中的地点摘要）
 */
export interface KeyLocation {
  name: string               // 场景名称
  type: string               // 场景类型
  brief: string              // 简要描述
  importance: 'main' | 'secondary' | 'minor'  // 重要性
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
  factionDistribution: string    // 势力分布描述
  geographicOrientation: string  // 地理方位描述
  createdAt: number
  updatedAt: number
}

// ==================== 地图相关类型 ====================

/**
 * 地图方位
 */
export type MapOrientation =
  | 'north'       // 北方
  | 'south'       // 南方
  | 'east'        // 东方
  | 'west'        // 西方
  | 'central'     // 中央
  | 'northeast'   // 东北
  | 'northwest'   // 西北
  | 'southeast'   // 东南
  | 'southwest'   // 西南
  | 'other'       // 其他

/**
 * 地图方位显示名称
 */
export const MAP_ORIENTATION_NAMES: Record<MapOrientation, string> = {
  north: '北方',
  south: '南方',
  east: '东方',
  west: '西方',
  central: '中央',
  northeast: '东北',
  northwest: '西北',
  southeast: '东南',
  southwest: '西南',
  other: '其他'
}

/**
 * AI 生成的地图数据结构
 */
export interface MapGeneratedData {
  regions: Array<{
    name: string
    description: string
    features: string[]
  }>
  landmarks: Array<{
    name: string
    type: string
    description: string
  }>
  terrain: Array<{
    type: string
    description: string
    area: string
  }>
  climate: string
  resources: string[]
  conflicts: Array<{
    type: string
    description: string
    parties: string[]
  }>
}

/**
 * 地图设定
 */
export interface StoryMap {
  id: string
  projectId: string
  name: string
  orientation: MapOrientation
  characteristics: string
  imagePath?: string
  aiGeneratedData?: MapGeneratedData
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 创建地图请求
 */
export interface CreateMapRequest {
  projectId: string
  name: string
  orientation?: MapOrientation
  characteristics?: string
}

/**
 * 更新地图请求
 */
export interface UpdateMapRequest {
  name?: string
  orientation?: MapOrientation
  characteristics?: string
  imagePath?: string
  aiGeneratedData?: MapGeneratedData
  sortOrder?: number
}

/**
 * AI 生成地图数据请求
 */
export interface GenerateMapDataRequest {
  projectId: string
  mapId?: string
  prompt?: string
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
  entityImportance: EntityImportance    // 实体重要性分类
  templateType?: TemporaryLocationTemplateType  // 临时实体模板类型
  // generatedImageId 已移至 asset_image 表（P2 Task 6）
  mapId?: string            // 关联地图 ID
  sourceType?: EntitySourceType  // 来源类型：longwriting 或 uploaded
  sourceEpisodeId?: string      // 来源剧集ID（uploaded模式时使用）
  createdAt: number
  updatedAt: number
}

// ==================== 势力相关类型 ====================

/**
 * 势力类型
 */
export type FactionType = 'country' | 'camp' | 'sect'

/**
 * 势力类型显示名称
 */
export const FACTION_TYPE_NAMES: Record<FactionType, string> = {
  country: '国别',
  camp: '阵营',
  sect: '门派'
}

/**
 * 势力设定
 */
export interface StoryFaction {
  id: string
  projectId: string
  factionType: FactionType     // 势力类型
  name: string                 // 势力名称
  locationId?: string          // 所在地（关联地点ID）
  description: string          // 主要特点
  sortOrder: number            // 排序顺序
  createdAt: number
  updatedAt: number
}

/**
 * 创建势力请求
 */
export interface CreateFactionRequest {
  projectId: string
  factionType: FactionType
  name: string
  locationId?: string
  description?: string
}

/**
 * 更新势力请求
 */
export interface UpdateFactionRequest {
  factionType?: FactionType
  name?: string
  locationId?: string
  description?: string
  sortOrder?: number
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
  field: 'eraDescription' | 'socialStructure' | 'techLevel' | 'specialRules' | 'factionDistribution' | 'geographicOrientation' // 要润色的字段
  eraType: EraType
  content: string
}

/**
 * AI 生成的地点项
 */
export interface GeneratedLocationItem {
  name: string
  type: LocationType
  importance: LocationImportance
  description: string
  suggestedMapId?: string  // 建议关联的地图ID
}

/**
 * AI 生成的势力项
 */
export interface GeneratedFactionItem {
  factionType: FactionType
  name: string
  suggestedLocationName?: string  // 建议关联的地点名称（用于自动匹配）
  description: string
}

/**
 * AI 生成地点请求
 */
export interface GenerateLocationsRequest {
  projectId: string
}

/**
 * AI 生成势力请求
 */
export interface GenerateFactionsRequest {
  projectId: string
}

// ==================== 实体重要性类型 ====================

/**
 * 实体来源类型
 * 用于区分实体来源于长文项目还是上传的剧本
 */
export type EntitySourceType = 'longwriting' | 'uploaded'

/**
 * 实体重要性分类
 * 用于区分角色、地点、物品的重要程度
 */
export type EntityImportance = 'main' | 'secondary' | 'temporary'

/**
 * 实体重要性显示名称
 */
export const ENTITY_IMPORTANCE_NAMES: Record<EntityImportance, string> = {
  main: '主要',
  secondary: '次要',
  temporary: '临时'
}

// ==================== 临时实体模板相关类型 ====================

/**
 * 临时角色模板类型
 * 用于为临时角色生成固定形象
 */
export type TemporaryCharacterTemplateType =
  | 'male_passerby'        // 男性路人
  | 'female_passerby'      // 女性路人
  | 'elderly_male'         // 老年男性
  | 'elderly_female'       // 老年女性
  | 'child'                // 儿童
  | 'shopkeeper'           // 店家
  | 'servant'              // 仆人
  | 'guard'                // 守卫
  | 'soldier'              // 士兵
  | 'merchant'             // 商人
  | 'beggar'               // 乞丐
  | 'traveler'             // 旅行者
  | 'villager_male'        // 男性村民
  | 'villager_female'      // 女性村民
  | 'noble_male'           // 男性贵族
  | 'noble_female'         // 女性贵族
  | 'custom'               // 自定义

/**
 * 临时地点模板类型
 */
export type TemporaryLocationTemplateType =
  | 'street'               // 街道
  | 'room'                 // 房间
  | 'courtyard'            // 院子
  | 'forest_edge'          // 森林边缘
  | 'mountain_path'        // 山路
  | 'riverbank'            // 河岸
  | 'market'               // 市场
  | 'inn'                  // 客栈
  | 'temple'               // 庙宇
  | 'custom'

/**
 * 临时角色模板（数据库存储）
 */
export interface TemporaryCharacterTemplateRecord {
  id: string
  type: TemporaryCharacterTemplateType
  name: string                    // 模板显示名称
  gender: 'male' | 'female' | 'other'
  ageMin: number                  // 最小年龄
  ageMax: number                  // 最大年龄
  basePrompt: string              // 基础提示词
  styleVariants: string           // 风格变体（JSON数组）
  negativePrompt: string          // 负面提示词
  matchKeywords: string           // 匹配关键词（JSON数组）
  sortOrder: number               // 排序
  isDefault: number               // 是否默认
  createdAt: number
  updatedAt: number
}

/**
 * 临时地点模板（数据库存储）
 */
export interface TemporaryLocationTemplateRecord {
  id: string
  type: TemporaryLocationTemplateType
  name: string
  basePrompt: string
  styleVariants: string           // 风格变体（JSON数组）
  negativePrompt: string
  matchKeywords: string           // 匹配关键词（JSON数组）
  sortOrder: number
  isDefault: number
  createdAt: number
  updatedAt: number
}

/**
 * 临时实体模板匹配结果
 */
export interface TemporaryEntityTemplateMatch {
  templateType: TemporaryCharacterTemplateType | TemporaryLocationTemplateType
  confidence: number           // 匹配置信度 0-1
  matchedKeywords: string[]    // 匹配的关键词
}

// ==================== 新实体检测相关类型 ====================

/**
 * 检测到的新角色信息
 */
export interface NewCharacterInfo {
  name: string
  description: string
  suggestedImportance: EntityImportance
  reason?: string                    // 建议重要性的理由
  // AI 提取的完整角色信息
  gender?: 'male' | 'female' | 'other'
  age?: number
  appearance?: string                // 外貌描述
  background?: string                // 背景故事
  personality?: string               // 性格特点
  abilities?: string                 // 能力特长
  occupation?: string                // 职业
  rolePosition?: CharacterRolePosition  // 角色定位
}

/**
 * 检测到的新地点信息
 */
export interface NewLocationInfo {
  name: string
  description: string
  suggestedImportance: EntityImportance
  suggestedType?: LocationType
  reason?: string
}

/**
 * 检测到的新物品信息
 */
export interface NewItemInfo {
  name: string
  description: string
  suggestedImportance: EntityImportance
  suggestedType?: ItemType
  reason?: string
}

/**
 * 新实体检测结果
 */
export interface NewEntityDetectionResult {
  projectId: string
  sourceOutlineId?: string            // 来源大纲ID
  chapterNumber?: number              // 章节序号
  newCharacters: NewCharacterInfo[]
  newLocations: NewLocationInfo[]
  newItems: NewItemInfo[]
  detectedAt: number
}

/**
 * 自动添加实体请求
 */
export interface AutoAddEntitiesRequest {
  projectId: string
  characters?: NewCharacterInfo[]
  locations?: NewLocationInfo[]
  items?: NewItemInfo[]
  autoConfirm?: boolean              // 是否自动确认（不弹出确认框）
}

/**
 * 自动添加实体响应
 */
export interface AutoAddEntitiesResponse {
  success: boolean
  addedCharacters?: StoryCharacter[]
  addedLocations?: StoryLocation[]
  addedItems?: StoryItem[]
  errors?: string[]
}

// ==================== 角色相关类型 ====================

/**
 * 角色定位
 */
export type CharacterRolePosition = 'protagonist' | 'supporting' | 'antagonist' | 'minor'

/**
 * 角色人种类型（与人像兼容，增加 other 以兼容更多情况）
 */
export type StoryCharacterRace = 'asian' | 'european' | 'other'

/**
 * 角色人种显示名称
 */
export const STORY_CHARACTER_RACE_NAMES: Record<StoryCharacterRace, string> = {
  asian: '亚洲人',
  european: '欧洲人',
  other: '其他'
}

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
  height?: number            // 身高(cm)
  weight?: number            // 体重(kg)
  race?: StoryCharacterRace  // 人种
  occupation?: string        // 职业
  position?: string          // 职务
  appearance: string         // 外貌描述
  background: string         // 背景故事
  personality: string        // 性格特点
  abilities: string          // 能力特长
  rolePosition: CharacterRolePosition
  importance: EntityImportance  // 重要性分类
  templateType?: TemporaryCharacterTemplateType  // 临时实体模板类型
  // generatedImageId 已移至 asset_image 表（P2 Task 6）
  majorEvents: string        // 主要事件
  sourceType?: EntitySourceType  // 来源类型：longwriting 或 uploaded
  sourceEpisodeId?: string      // 来源剧集ID（uploaded模式时使用）
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
  importance: EntityImportance    // 实体重要性分类
  ownerId?: string           // 持有者角色 ID
  sourceType?: EntitySourceType  // 来源类型：longwriting 或 uploaded
  sourceEpisodeId?: string      // 来源剧集ID（uploaded模式时使用）
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
  involvedItems: string[]       // 涉及物品 ID 列表
  status: OutlineStatus
  estimatedWords: number
  orderIndex: number         // 排序索引
  prewriteConfirmed?: boolean // 是否已确认预写（附加字段，不在数据库中）
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
  height?: number
  weight?: number
  race?: StoryCharacterRace
  occupation?: string
  position?: string
  appearance?: string
  background?: string
  personality?: string
  abilities?: string
  rolePosition?: CharacterRolePosition
  importance?: EntityImportance      // 重要性分类
  templateType?: TemporaryCharacterTemplateType  // 临时实体模板类型
  // generatedImageId 已移至 asset_image 表（P2 Task 6）
  majorEvents?: string
  portraitId?: string
  sourceType?: EntitySourceType     // 来源类型（uploaded模式时使用）
  sourceEpisodeId?: string          // 来源剧集ID（uploaded模式时使用）
}

/**
 * 更新角色请求
 */
export interface UpdateCharacterRequest {
  name?: string
  gender?: 'male' | 'female' | 'other'
  age?: number
  height?: number
  weight?: number
  race?: StoryCharacterRace
  occupation?: string
  position?: string
  appearance?: string
  background?: string
  personality?: string
  abilities?: string
  rolePosition?: CharacterRolePosition
  importance?: EntityImportance      // 重要性分类
  templateType?: TemporaryCharacterTemplateType  // 临时实体模板类型
  // generatedImageId 已移至 asset_image 表（P2 Task 6）
  majorEvents?: string
  portraitId?: string
  sourceType?: EntitySourceType     // 来源类型
  sourceEpisodeId?: string          // 来源剧集ID
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
  involvedItems?: string[]
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
  involvedItems?: string[]
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

// ==================== 项目级别类型配置 ====================

/**
 * 项目技能类型配置
 */
export interface ProjectSkillTypeConfig {
  id: string
  projectId: string
  code: string           // 类型编码
  name: string           // 类型名称
  description?: string   // 类型描述
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 项目物品类型配置
 */
export interface ProjectItemTypeConfig {
  id: string
  projectId: string
  code: string           // 类型编码
  name: string           // 类型名称
  description?: string   // 类型描述
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 技能等级配置（独立存储）
 */
export interface SkillLevelConfig {
  id: string
  projectId: string
  skillTypeCode: string  // 所属技能类型编码
  code: string           // 等级编码
  name: string           // 等级名称
  description: string    // 等级描述（如达到此等级可以做什么）
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 物品等级配置（独立存储）
 */
export interface ItemLevelConfig {
  id: string
  projectId: string
  itemTypeCode: string   // 所属物品类型编码
  code: string           // 等级编码
  name: string           // 等级名称
  description: string    // 等级描述（如此等级的外观、能量特征）
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 创建项目技能类型配置请求
 */
export interface CreateSkillTypeConfigRequest {
  projectId: string
  code: string
  name: string
  description?: string
}

/**
 * 更新项目技能类型配置请求
 */
export interface UpdateSkillTypeConfigRequest {
  name?: string
  description?: string
}

/**
 * 创建项目物品类型配置请求
 */
export interface CreateItemTypeConfigRequest {
  projectId: string
  code: string
  name: string
  description?: string
}

/**
 * 更新项目物品类型配置请求
 */
export interface UpdateItemTypeConfigRequest {
  name?: string
  description?: string
}

/**
 * 创建技能等级配置请求
 */
export interface CreateSkillLevelRequest {
  projectId: string
  skillTypeCode: string
  code: string
  name: string
  description?: string
}

/**
 * 更新技能等级配置请求
 */
export interface UpdateSkillLevelRequest {
  name?: string
  description?: string
}

/**
 * 创建物品等级配置请求
 */
export interface CreateItemLevelRequest {
  projectId: string
  itemTypeCode: string
  code: string
  name: string
  description?: string
}

/**
 * 更新物品等级配置请求
 */
export interface UpdateItemLevelRequest {
  name?: string
  description?: string
}

// ==================== 章节预写相关类型 ====================

/**
 * 预写内容
 */
export interface ChapterPrewrite {
  id: string
  outlineId: string          // 关联大纲节点，一对一
  content: string            // 预写内容
  isConfirmed: boolean       // 是否已确认（确认后提取记忆）
  confirmedAt?: number       // 确认时间
  createdAt: number
  updatedAt: number
}

/**
 * 创建预写请求
 */
export interface CreatePrewriteRequest {
  outlineId: string
  content: string
}

/**
 * 更新预写请求
 */
export interface UpdatePrewriteRequest {
  content?: string
}

/**
 * 确认预写请求
 */
export interface ConfirmPrewriteRequest {
  outlineId: string
}

// ==================== 故事记忆相关类型 ====================

/**
 * 记忆类型
 */
export type MemoryType =
  | 'character_event'   // 角色事件
  | 'location_event'    // 地点事件
  | 'item_event'        // 物品事件
  | 'relationship_change' // 关系变化
  | 'faction_event'     // 势力事件
  | 'skill_event'       // 技能事件
  | 'general'           // 一般事件

/**
 * 记忆重要程度
 */
export type MemoryImportance = 'critical' | 'normal' | 'minor'

/**
 * 记忆实体
 */
export interface MemoryEntity {
  type: 'character' | 'location' | 'item' | 'skill' | 'faction'
  id: string
  name: string
}

/**
 * 故事记忆（事件层）
 */
export interface StoryMemory {
  id: string
  projectId: string
  sourceOutlineId?: string         // 来源章节（大纲ID）
  memoryType: MemoryType
  title: string                   // 记忆标题
  description: string             // 详细描述
  involvedEntities: MemoryEntity[] // 涉及实体
  chapterNumber: number           // 章节序号
  importance: MemoryImportance
  isActive: boolean               // 是否生效
  createdAt: number
  updatedAt: number
}

/**
 * 创建记忆请求
 */
export interface CreateMemoryRequest {
  projectId: string
  sourceOutlineId?: string
  memoryType: MemoryType
  title: string
  description: string
  involvedEntities: MemoryEntity[]
  chapterNumber: number
  importance?: MemoryImportance
}

/**
 * 更新记忆请求
 */
export interface UpdateMemoryRequest {
  title?: string
  description?: string
  involvedEntities?: MemoryEntity[]
  importance?: MemoryImportance
  isActive?: boolean
}

/**
 * AI 提取的记忆数据
 */
export interface ExtractedMemoryData {
  memoryType: MemoryType
  title: string
  description: string
  involvedEntities: MemoryEntity[]
  importance: MemoryImportance
}

/**
 * 记忆提取请求
 */
export interface ExtractMemoriesRequest {
  projectId: string
  outlineId: string
  prewriteContent: string
}

/**
 * 记忆提取响应
 */
export interface ExtractMemoriesResponse {
  success: boolean
  memories?: ExtractedMemoryData[]
  error?: string
}

// ==================== 实体状态快照相关类型 ====================

/**
 * 实体类型
 */
export type EntityType = 'character' | 'location' | 'item' | 'faction' | 'skill'

/**
 * 实体状态快照
 */
export interface EntityStateSnapshot {
  id: string
  projectId: string
  entityType: EntityType          // 实体类型
  entityId: string                // 实体ID
  entityName: string              // 实体名称
  chapterNumber: number           // 章节序号（该章节完成时的状态）
  stateSummary: string            // 状态摘要
  keyChanges: string[]            // 本章节的关键变化
  createdAt: number
  updatedAt: number
}

/**
 * 创建状态快照请求
 */
export interface CreateEntityStateSnapshotRequest {
  projectId: string
  entityType: EntityType
  entityId: string
  entityName: string
  chapterNumber: number
  stateSummary: string
  keyChanges?: string[]
}

/**
 * 更新状态快照请求
 */
export interface UpdateEntityStateSnapshotRequest {
  stateSummary?: string
  keyChanges?: string[]
}

/**
 * AI 提取的实体状态数据
 */
export interface ExtractedEntityStateData {
  entityType: EntityType
  entityId: string
  entityName: string
  stateSummary: string
  keyChanges: string[]
}

/**
 * 实体状态提取请求
 */
export interface ExtractEntityStatesRequest {
  projectId: string
  outlineId: string
  chapterContent: string
  chapterNumber: number
  involvedEntities: MemoryEntity[]
  previousStates?: EntityStateSnapshot[]
}

/**
 * 实体状态提取响应
 */
export interface ExtractEntityStatesResponse {
  success: boolean
  states?: ExtractedEntityStateData[]
  error?: string
}

/**
 * 状态快照统计
 */
export interface SnapshotStats {
  total: number
  byEntityType: Record<EntityType, number>
  byChapter: Record<number, number>
}

// ==================== 章节状态摘要相关类型 ====================

/**
 * 章节状态摘要
 * 用于记录章节结束时的故事状态，传递给下一章写作
 */
export interface ChapterStateSummary {
  id: string
  projectId: string
  outlineId: string           // 关联的大纲节点ID
  chapterNumber: number       // 章节序号
  storyTime: string           // 故事内时间（如：第一年春三月十五日傍晚）
  currentLocation: string     // 当前地点
  characterStates: string     // 角色状态概要
  pendingEvents: string       // 待处理事件/伏笔
  keyChanges: string          // 本章关键变化
  createdAt: number
  updatedAt: number
}

/**
 * 数据库中的章节状态摘要记录
 */
export interface ChapterStateSummaryRecord {
  id: string
  project_id: string
  outline_id: string
  chapter_number: number
  story_time: string
  current_location: string
  character_states: string
  pending_events: string
  key_changes: string
  created_at: number
  updated_at: number
}

/**
 * 创建章节状态摘要请求
 */
export interface CreateChapterStateSummaryRequest {
  projectId: string
  outlineId: string
  chapterNumber: number
  storyTime: string
  currentLocation: string
  characterStates: string
  pendingEvents: string
  keyChanges: string
}

/**
 * AI 提取的章节状态摘要数据
 */
export interface ExtractedChapterStateData {
  storyTime: string           // 故事内时间
  currentLocation: string     // 当前地点
  characterStates: string     // 角色状态概要
  pendingEvents: string       // 待处理事件/伏笔
  keyChanges: string          // 本章关键变化
}

/**
 * 提取章节状态摘要请求
 */
export interface ExtractChapterStateSummaryRequest {
  projectId: string
  outlineId: string
  chapterNumber: number
  chapterContent: string
  previousSummary?: ChapterStateSummary   // 上一章的摘要（可选）
}

/**
 * 提取章节状态摘要响应
 */
export interface ExtractChapterStateSummaryResponse {
  success: boolean
  summary?: ExtractedChapterStateData
  error?: string
}

// ==================== 向量索引相关类型（步骤0 基础设施） ====================

/**
 * 长文向量索引的实体类型
 * 开放式联合：后续步骤 3/4/5 新增图谱/时间线/伏笔时追加取值即可
 */
export type LwVectorEntityType =
  | 'character'
  | 'location'
  | 'item'
  | 'faction'
  | 'skill'
  | 'plot'
  | 'outline'
  | 'chapter'
  | 'memory'
  | 'event'
  // 以下为后续步骤预留（步骤3/4/5 实现时启用）
  | 'graph_edge'
  | 'timeline'
  | 'foreshadow'

/**
 * 长文向量语义检索选项
 */
export interface LwVectorSearchOptions {
  /** 限定实体类型（不传 = 全类型） */
  entityType?: LwVectorEntityType
  /** 章节号 <= 该值（检索历史章节片段，不检索未写章节） */
  chapterNumberLte?: number
  /** 返回条数，默认 10 */
  topK?: number
  /** 相关性阈值 0-1，低于此值过滤 */
  scoreThreshold?: number
}

/**
 * 长文向量检索结果
 */
export interface LwVectorSearchResult {
  entityType: LwVectorEntityType
  entityId: string
  chunkId: string
  /** 0-1，越接近 1 越相关 */
  score: number
  /** 命中片段预览（前 200 字） */
  preview: string
}

/**
 * 章节号（用于向量检索 chapterNumberLte 过滤）
 */
export interface LwVectorIndexStats {
  entityCount: number
  chapterCount: number
  totalChunks: number
}
