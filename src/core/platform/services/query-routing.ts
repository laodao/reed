/**
 * 查询意图路由（关键词型查询 → 混合检索 RRF）
 * @module platform/services/query-routing
 *
 * 背景（M4 双数据集评估结论）：
 * - 语义型问句：纯向量最优（recall@1 96.9%），混合加权 93.8%
 * - 关键词型查询（法条编号/版本号/API 符号/专有名词）：混合 RRF 明显更强
 *   （recall@1 70% → 80%，recall@3 70% → 90%）
 * - RRF 在语义型上 recall@1 与纯向量持平 → **误判代价极低**，适合自动路由
 *
 * 本模块只做「是否关键词型」的启发式判定与参数建议，不触碰检索实现。
 */

export interface QueryRoutingDecision {
  /** 是否判定为关键词型（建议混合检索） */
  keywordish: boolean
  /** 判定命中的特征（可观测/可调试） */
  reasons: string[]
  /** 建议检索参数 */
  suggested: { fusion: 'weighted' | 'rrf'; vectorWeight: number }
}

/** 法条/条款编号：第X条 / 第X章 / 第X节 / 第X项 */
const CLAUSE_RE = /第\s*[0-9一二三四五六七八九十百千零]+\s*[条款章节项节]/
/** 版本号 / 公式编号：2.5.0、6.24、1.26 */
const VERSION_RE = /\b\d+\.\d+(?:\.\d+)*\b/
/** 代码/API 点号：np.newaxis、numpy.linalg.inv */
const API_DOT_RE = /\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/
/** 代码符号：下划线、@、::、()、赋值 */
const SYMBOL_RE = /[_@]|::|\(\)|=[^=]/
/** 全大写缩写（≥3 位）匹配（g 标志，用于计数）：CUDA、GPU、FFT、RAG */
const UPPER_ACRONYM_ALL_RE = /\b[A-Z][A-Z0-9]{2,}\b/g
/** 小驼峰 API 名：getElementById、shapeIndex */
const CAMEL_RE = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/
/** 精确引用：引号/书名号 */
const QUOTE_RE = /[「」《》""'']/
/**
 * 中文疑问句式：出现疑问词/问号时，弱特征（缩写/驼峰/代码符号）不触发路由。
 * 评估实证：`自编码器（autoencoder）…和 PCA 有什么关系？`（acronym）与
 * `numpy 中矩阵乘法用 dot 或 @ 怎么计算？`（symbol）被判关键词型后走 RRF，
 * 语义型 recall@1 反而下降（96.9% → 93.8%）。
 */
const QUESTION_RE = /[？?]|什么|如何|怎么|怎样|为什么|哪些|是否|吗|呢/

/**
 * 判定查询是否关键词型，并给出建议检索参数。
 * 未命中任何特征 → 保持纯向量（weighted/1），即不改动现有行为。
 *
 * 特征分强弱（评估校准）：
 * - 强特征（无条件触发）：法条/条款编号、版本号公式编号、API 点号、精确引用
 * - 弱特征（仅非疑问句触发）：全大写缩写、小驼峰、代码符号
 */
export function detectKeywordIntent(query: string): QueryRoutingDecision {
  const q = (query ?? '').trim()
  const reasons: string[] = []
  if (q) {
    const isQuestion = QUESTION_RE.test(q)
    // ---- 强特征 ----
    if (CLAUSE_RE.test(q)) reasons.push('clause')
    if (VERSION_RE.test(q)) reasons.push('version')
    if (API_DOT_RE.test(q)) reasons.push('api-dot')
    if (QUOTE_RE.test(q)) reasons.push('quote')
    // ---- 弱特征（中文问句里多为补充说明/被问对象，不触发路由）----
    // 例外：同时出现 ≥2 个全大写缩写（如「CUDA 与 GPU」「RAG 与 FFT」）仍视为关键词型
    // ——评估校准：`书里如何描述 CUDA 与 GPU 计算` 是关键词型但含疑问词，需此例外救回。
    // 括号内缩写（「（PCA）」）属补充说明，先剔除再计数
    const acronymsOutsideParen =
      q.replace(/[（(]\s*[A-Z][A-Z0-9]{1,}\s*[)）]/g, ' ').match(UPPER_ACRONYM_ALL_RE) ?? []
    if (acronymsOutsideParen.length >= 2) {
      reasons.push('acronym')
    } else if (!isQuestion && acronymsOutsideParen.length === 1) {
      reasons.push('acronym')
    }
    if (!isQuestion) {
      if (CAMEL_RE.test(q)) reasons.push('camel')
      if (SYMBOL_RE.test(q)) reasons.push('symbol')
    }
  }
  const keywordish = reasons.length > 0
  return {
    keywordish,
    reasons,
    suggested: keywordish
      ? { fusion: 'rrf', vectorWeight: 0.5 }
      : { fusion: 'weighted', vectorWeight: 1 },
  }
}