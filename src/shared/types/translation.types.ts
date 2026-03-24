/**
 * 文档翻译相关类型定义
 * @module types/translation.types
 */

/**
 * 支持的语言代码
 */
export type LanguageCode =
  | 'auto'   // 自动检测
  | 'zh'     // 中文
  | 'en'     // 英语
  | 'ja'     // 日语
  | 'ko'     // 韩语
  | 'fr'     // 法语
  | 'de'     // 德语
  | 'es'     // 西班牙语
  | 'ru'     // 俄语
  | 'pt'     // 葡萄牙语
  | 'it'     // 意大利语
  | 'ar'     // 阿拉伯语
  | 'th'     // 泰语
  | 'vi'     // 越南语

/**
 * 语言配置
 */
export interface Language {
  code: LanguageCode
  name: string
}

/**
 * 翻译类型
 */
export type TranslationType = 'text' | 'file'

/**
 * 翻译状态
 */
export type TranslationStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * 翻译记录
 */
export interface TranslationRecord {
  id: string
  type: TranslationType
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  sourceText?: string
  targetText?: string
  sourceFile?: string
  sourceFileName?: string
  targetFile?: string
  status: TranslationStatus
  favorite: boolean
  wordCount: number
  providerId?: string
  modelId?: string
  errorMessage?: string
  createdAt: Date
}

/**
 * 文本翻译请求
 */
export interface TextTranslationRequest {
  text: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  providerId?: string
  modelId?: string
}

/**
 * 文本翻译响应
 */
export interface TextTranslationResponse {
  success: boolean
  data?: {
    translatedText: string
    detectedLanguage?: LanguageCode
  }
  error?: string
}

/**
 * 文件翻译请求
 */
export interface FileTranslationRequest {
  filePath: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  providerId?: string
  modelId?: string
}

/**
 * 文件翻译响应
 */
export interface FileTranslationResponse {
  success: boolean
  data?: {
    translationId: string
  }
  error?: string
}

/**
 * 翻译历史查询参数
 */
export interface TranslationHistoryQuery {
  page: number
  pageSize: number
  type?: TranslationType
  favorite?: boolean
}

/**
 * 翻译进度事件
 */
export interface TranslationProgressEvent {
  translationId: string
  progress: number
}

/**
 * 翻译完成事件
 */
export interface TranslationCompletedEvent {
  translationId: string
  targetFile: string
}

/**
 * 翻译失败事件
 */
export interface TranslationFailedEvent {
  translationId: string
  error: string
}

/**
 * 支持的语言列表
 */
export const LANGUAGES: Language[] = [
  { code: 'auto', name: '自动检测' },
  { code: 'zh', name: '中文' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'ru', name: '俄语' },
  { code: 'pt', name: '葡萄牙语' },
  { code: 'it', name: '意大利语' },
  { code: 'ar', name: '阿拉伯语' },
  { code: 'th', name: '泰语' },
  { code: 'vi', name: '越南语' }
]

/**
 * 获取语言名称
 * @param code - 语言代码
 * @returns 语言名称
 */
export function getLanguageName(code: LanguageCode): string {
  const lang = LANGUAGES.find(l => l.code === code)
  return lang?.name || code
}