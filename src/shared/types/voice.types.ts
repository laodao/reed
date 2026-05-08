/**
 * 语音助手相关类型定义
 * @module types/voice.types
 */

/**
 * 语音记录类型
 */
export type VoiceRecordType = 'tts' | 'stt'

/**
 * 语音记录状态
 */
export type VoiceRecordStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * 复刻声音状态
 */
export type ClonedVoiceStatus = 'training' | 'ready' | 'failed'

/**
 * 支持的语言代码
 */
export type VoiceLanguageCode =
  | 'zh'      // 中文（普通话）
  | 'en'      // 英语
  | 'fr'      // 法语
  | 'de'      // 德语
  | 'ru'      // 俄语
  | 'it'      // 意大利语
  | 'es'      // 西班牙语
  | 'pt'      // 葡萄牙语
  | 'ja'      // 日语
  | 'ko'      // 韩语

/**
 * 语言配置
 */
export interface VoiceLanguage {
  code: VoiceLanguageCode
  name: string
}

/**
 * 发音人信息
 */
export interface VoiceSpeaker {
  id: string
  name: string
  language: VoiceLanguageCode
  gender?: 'male' | 'female' | 'neutral'
  previewUrl?: string
  isCloned?: boolean  // 是否为复刻声音
}

/**
 * TTS 请求参数
 */
export interface TTSRequest {
  text: string
  voiceId: string
  language?: VoiceLanguageCode
  speed?: number      // 0.5 - 2.0
  pitch?: number      // -12 到 12
  volume?: number     // 0 - 100
  emotion?: string
  style?: string
  providerId?: string
  modelId?: string
}

/**
 * TTS 响应结果
 */
export interface TTSResponse {
  success: boolean
  data?: {
    audioPath: string
    duration: number  // 音频时长（毫秒）
  }
  error?: string
}

/**
 * STT 请求参数
 */
export interface STTRequest {
  audioPath?: string     // 文件路径
  audioData?: string     // base64 编码的音频数据
  language?: VoiceLanguageCode
  providerId?: string
  modelId?: string
}

/**
 * STT 响应结果
 */
export interface STTResponse {
  success: boolean
  data?: {
    text: string
    duration: number  // 音频时长（毫秒）
    detectedLanguage?: VoiceLanguageCode
  }
  error?: string
}

/**
 * 语音复刻请求（旧 V1，仅向后兼容；voice:clone IPC 真实现走 VoiceCloneCreateRequest）
 *
 * @deprecated 使用 VoiceCloneCreateRequest，2026-05 切换
 */
export interface VoiceCloneRequest {
  name: string
  sampleAudioPath?: string
  sampleAudioData?: string
  providerId?: string
}

/**
 * 语音复刻响应（旧 V1，仅保留类型让 voice.handler 旧 import 不立即报错）
 *
 * @deprecated voice:clone 真实现返回完整 ClonedVoice
 */
export interface VoiceCloneResponse {
  success: boolean
  data?: {
    voiceId: string
  }
  error?: string
}

/**
 * 语音复刻 — 创建请求（IPC voice:clone 真实现入参，2026-05 接入 DashScope CosyVoice）
 *
 * 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.4
 */
export interface VoiceCloneCreateRequest {
  /** 用户起的展示名（落 cloned_voices.name），不直接当 voice_id */
  name: string
  /** 本地音频绝对路径（已校验存在 + 时长 + 格式 + 单声道）*/
  samplePath: string
  /** 音频时长（秒），客户端预解析 */
  sampleDurationSec: number
  /** voice_id 前缀：仅小写字母数字、≤10 字符（DashScope 硬约束）*/
  prefix: string
  /** 语种 hint，影响特征提取。默认 'zh' */
  language?: VoiceLanguageCode
  /** 指定 provider id，缺省走默认 */
  providerId?: string
}

/**
 * Provider 层 — 复刻输入（VoiceService 翻译完 path 后传给 provider 的内部结构）
 */
export interface VoiceCloneInput {
  name: string
  samplePath: string
  sampleDurationSec: number
  prefix: string
  language?: VoiceLanguageCode
}

/**
 * Provider 层 — 创建复刻后的返回值
 */
export interface VoiceCloneCreateResult {
  /** provider 端真实 voice_id（如 'cosyvoice-v3-plus-myvoice-xxxxxxxx'）*/
  voiceId: string
  /** 目标 TTS 模型（合成时必须用同一个）*/
  targetModel: string
  /** 当前状态（创建后第一次返回常常是 training）*/
  status: ClonedVoiceStatus
}

/**
 * Provider 层 — 查询音色训练状态返回值
 */
export interface VoiceCloneStatusResult {
  status: ClonedVoiceStatus
  /** 试听音频 URL（OK 状态时部分 provider 给）*/
  previewAudioUrl?: string
  /** 失败原因（仅 failed 状态有意义）*/
  errorMessage?: string
}

/**
 * 语音记录
 */
export interface VoiceRecord {
  id: string
  type: VoiceRecordType
  status: VoiceRecordStatus

  // TTS 相关
  inputText?: string
  outputAudioPath?: string
  voiceId?: string
  voiceName?: string
  language?: VoiceLanguageCode
  speed?: number
  pitch?: number
  volume?: number
  emotion?: string
  style?: string
  duration?: number  // 音频时长（毫秒）

  // STT 相关
  inputAudioPath?: string
  outputText?: string

  // 通用
  providerId?: string
  modelId?: string
  favorite: boolean
  errorMessage?: string
  createdAt: Date
}

/**
 * 复刻声音
 */
export interface ClonedVoice {
  id: string
  name: string
  status: ClonedVoiceStatus
  sampleAudioPath?: string
  sampleDuration?: number  // 样本时长（毫秒）
  voiceId?: string         // 服务商返回的声音ID
  previewAudioPath?: string
  providerId?: string
  errorMessage?: string
  createdAt: Date
  updatedAt?: Date
}

/**
 * 语音历史查询参数
 */
export interface VoiceHistoryQuery {
  page: number
  pageSize: number
  type?: VoiceRecordType
  favorite?: boolean
}

/**
 * 语音提供商
 */
export interface VoiceProvider {
  id: string
  name: string
  type: 'tts' | 'stt' | 'both'
  models: Array<{
    id: string
    name: string
  }>
  voices?: VoiceSpeaker[]
  configured: boolean
}

/**
 * 支持的语言列表
 */
export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: 'zh', name: 'Chinese' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ru', name: 'Russian' },
  { code: 'it', name: 'Italian' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' }
]

/**
 * 获取语言名称
 */
export function getVoiceLanguageName(code: VoiceLanguageCode): string {
  const lang = VOICE_LANGUAGES.find(l => l.code === code)
  return lang?.name || code
}