/**
 * narrative/ai · 内部共享辅助函数（已提升为公共层）
 * @module platform/episode-production/narrative/ai/_helpers
 * @description 实现已迁移至 @core/platform/services/ai-call（公共 AI 调用层），
 *              本文件保留 re-export 以兼容既有引用——新代码请直接 import @core/platform/services/ai-call。
 */

export {
  getProviderConfig,
  callAI,
  callVLM,
  callAIWithContinue,
  parseJsonString,
  isJsonTruncated,
  extractJsonFromResponse,
  type ProviderInfo,
} from '@core/platform/services/ai-call'
