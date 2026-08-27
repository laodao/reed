/**
 * OpenAI 兼容预置搜索引擎（Perplexity / DeepSeek 联网）
 * @module search-engines/openai-compat-preset-search-engine
 * @description 复用 CustomApiSearchEngine 的 /chat/completions 实现，
 *              仅覆盖类型名与默认端点/模型，作为「模型式预置」搜索引擎模板。
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

/** DeepSeek 联网（OpenAI 兼容端点，联网模型） */
export class DeepSeekWebSearchEngine extends CustomApiSearchEngine {
  readonly type: SearchEngineType = 'deepseek-web'
  readonly name: string = 'DeepSeek 联网'
  protected defaultApiUrl = 'https://api.deepseek.com'
  protected defaultModel = 'deepseek-chat'
}
