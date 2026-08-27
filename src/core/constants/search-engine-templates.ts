/**
 * 搜索引擎模板常量（单一事实源：@core/search-engines）
 * @module core/constants/search-engine-templates
 * @description 模板定义与工厂实现在 src/core/search-engines/index.ts（含引擎类），
 *              本文件仅为向后兼容的再导出入口，避免两处模板漂移。
 */

export {
  SEARCH_ENGINE_TEMPLATES,
  getSearchEngineTemplate,
  getQuickSearchEngines,
  getApiSearchEngines,
} from '@core/search-engines'
