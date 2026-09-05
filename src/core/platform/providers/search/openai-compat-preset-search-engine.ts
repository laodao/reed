/**
 * OpenAI 兼容预置搜索引擎（Perplexity / DeepSeek 生成）
 * @module platform/providers/search/openai-compat-preset-search-engine
 * @description 复用 CustomApiSearchEngine 的 /chat/completions 实现，
 *              仅覆盖类型名与默认端点/模型，作为「模型式预置」搜索引擎模板。
 *
 *              注意：Perplexity 的 sonar-pro 具备联网能力；而 DeepSeek 的
 *              deepseek-chat 无浏览能力，此预置只是「让模型生成疑似搜索结果」，
 *              返回的链接很可能是编造的（非实时联网）。已在模板描述中明确标注，
 *              避免与「禁假数据」项目铁律相悖。
 */

import { CustomApiSearchEngine } from './custom-api-search-engine'
import type { SearchEngineType } from '@shared/types/search-engine.types'

/** Perplexity（sonar-pro 支持联网搜索） */
export class PerplexitySearchEngine extends CustomApiSearchEngine {
  readonly type: SearchEngineType = 'perplexity'
  readonly name: string = 'Perplexity'
  protected defaultApiUrl = 'https://api.perplexity.ai'
  protected defaultModel = 'sonar-pro'
}

/** DeepSeek 生成（OpenAI 兼容端点，模型生成结果，非实时联网） */
export class DeepSeekWebSearchEngine extends CustomApiSearchEngine {
  readonly type: SearchEngineType = 'deepseek-web'
  readonly name: string = 'DeepSeek（模型生成）'
  protected defaultApiUrl = 'https://api.deepseek.com'
  protected defaultModel = 'deepseek-chat'
}
