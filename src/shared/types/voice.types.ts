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
  | 'zh'      // 中文
  | 'en'      // 英语
  | 'ja'      // 日语
  | 'ko'      // 韩语
  | 'yue'     // 粤语
  | 'zh-CN'   // 普通话
  | 'zh-TW'   // 台湾话
  | 'en-US'   // 美式英语
  | 'en-GB'   // 英式英语

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
 * 语音复刻请求
 */
export interface VoiceCloneRequest {
  name: string
  sampleAudioPath?: string  // 文件路径
  sampleAudioData?: string  // base64 编码的音频数据
  providerId?: string
}

/**
 * 语音复刻响应
 */
export interface VoiceCloneResponse {
  success: boolean
  data?: {
    voiceId: string
  }
  error?: string
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
  { code: 'zh', name: '中文' },
  { code: 'zh-CN', name: '普通话' },
  { code: 'zh-TW', name: '台湾话' },
  { code: 'yue', name: '粤语' },
  { code: 'en', name: '英语' },
  { code: 'en-US', name: '美式英语' },
  { code: 'en-GB', name: '英式英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' }
]

/**
 * 获取语言名称
 */
export function getVoiceLanguageName(code: VoiceLanguageCode): string {
  const lang = VOICE_LANGUAGES.find(l => l.code === code)
  return lang?.name || code
}