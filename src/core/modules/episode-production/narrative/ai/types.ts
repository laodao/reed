/**
 * narrative/ai · AI 任务与流事件类型
 * @module modules/episode-production/narrative/ai/types
 * @description 拆自原 src/core/services/story-to-video-ai.service.ts 顶部类型定义。
 */

import type {
  SceneCharacter,
  ShotType,
  CameraAngle,
  CameraMovement,
  TransitionConfig,
  StoryboardCharacter,
  Dialogue,
  ActionDescription
} from '@shared/types/episode-production'

/**
 * 剧集制作任务类型（原名 StoryToVideoTask，已重命名）
 */
export type EpisodeProductionTask =
  | 'script'       // 剧本生成
  | 'scenes'       // 场景拆分
  | 'storyboard'   // 分镜生成

/** @deprecated 使用 EpisodeProductionTask（仅为兼容旧 import） */
export type StoryToVideoTask = EpisodeProductionTask

/**
 * 剧本生成结果
 */
export interface ScriptGenerationResult {
  synopsis: string
  scenes: SceneGenerationResult[]
}

/**
 * 场景生成结果
 */
export interface SceneGenerationResult {
  sceneNumber: number
  location: string
  locationType: 'interior' | 'exterior' | 'mixed'
  timeOfDay: string
  weather?: string
  sceneDescription: string
  mood: string
  lighting?: string
  characters: SceneCharacter[]
  originalText: string
  narration: string
  dialogues: Dialogue[]
  actions: ActionDescription[]
}

/**
 * 分镜生成结果
 */
export interface StoryboardGenerationResult {
  storyboards: StoryboardResult[]
}

/**
 * 分镜结果
 */
export interface StoryboardResult {
  shotNumber: number
  shotType: ShotType
  cameraAngle: CameraAngle
  cameraMovement: CameraMovement
  movementDuration?: number
  frameDescription: string
  subject?: string
  composition?: string
  duration: number
  transition: TransitionConfig
  narrationId?: string
  dialogueIds: string[]
  actionIds: string[]
  characters: StoryboardCharacter[]
}

/**
 * 流式生成事件
 */
export interface GenerationStreamEvent {
  type: 'start' | 'content' | 'done' | 'error'
  content?: string
  data?: any
  error?: string
}
