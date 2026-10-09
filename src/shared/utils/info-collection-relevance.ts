/**
 * 信息搜集：候选相关性过滤（纯函数，双端可用）
 * @module shared/utils/info-collection-relevance
 *
 * 背景（2026-10-08 真实联网验收发现）：bing-web 刮削引擎对整查询只搜首个词，
 * 返回"中国"的百科/门户首页——这类跑题源若不挡在抓取预算外，会烧掉 fetch/LLM
 * 成本还污染待审区。第一道闸做在候选级：标题+摘要必须包含**查询词的至少一个
 * 完整片段**（≥3 字），确定性可测，不需要分词器。
 *
 * 这是软闸：只过滤明显跑题（零词命中），不判断"相关性高低"——精细排序交给
 * 信源分级与抽取阶段。
 */

/** 把查询拆成片段（空白/标点分隔）；≥3 字才有效——"最新/官方"这类 2 字泛词命中门槛过低（2026-10-09 真机：门户首页带"最新"即混入待审区） */
export function querySegments(query: string): string[] {
  return (query ?? '')
    .split(/[\s,，。；;、|/（）()【】\][[]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 3)
}

/** 候选（标题+摘要）是否与查询词片段有任一命中 */
export function isCandidateRelevant(title: string, snippet: string, query: string): boolean {
  const segments = querySegments(query)
  if (segments.length === 0) return true // 查询无可拆片段时不设闸
  const haystack = `${title ?? ''}\n${snippet ?? ''}`
  return segments.some(seg => haystack.includes(seg))
}
