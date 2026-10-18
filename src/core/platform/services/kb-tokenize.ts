/**
 * KB 索引分词（D3，自 knowledge-base.service 抽出共用）
 * @module platform/services/kb-tokenize
 *
 * 建索引与查询必须同源（同一套分词与停用词表），知识大脑的论断入池
 * （倒排行仅供 chunk 检索使用。）
 */
import nodejieba from 'nodejieba'

/** 索引分词停用词（buildIndex 与 BM25 检索共用——同一套词表才能对得上） */
export const INDEX_STOP_WORDS = new Set([
  '的', '了', '和', '是', '就', '都', '而', '及', '与', '着',
  '或', '一个', '没有', '我们', '你们', '他们', '它们', '这个', '那个',
  '这些', '那些', '不是', '什么', '怎么', '如何', '为什么', '因为',
  '所以', '但是', '如果', '虽然', '可以', '可能', '应该', '需要',
  '会', '能', '要', '有', '在', '上', '下', '里', '外', '中',
  '很', '太', '更', '最', '非常', '十分', '极其', '相当',
])

/** 索引分词（jieba cutForSearch 中文 + 英文词元，去停用词/单字）——建索引与查询同源 */
export function tokenizeForIndex(text: string): string[] {
  const chineseText = text.replace(/[a-zA-Z0-9\s]+/g, ' ')
  const chineseTerms = nodejieba.cutForSearch(chineseText)
  const englishWords = text.toLowerCase().match(/[a-z]+/g) || []
  return [...chineseTerms, ...englishWords]
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !INDEX_STOP_WORDS.has(t))
}
