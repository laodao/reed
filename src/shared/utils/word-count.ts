/**
 * 章节字数统计统一口径（6.1）
 * @module shared/utils/word-count
 *
 * 此前四套口径并存：UI `content.length`（含空白/Markdown 符号）、落库
 * `countWords`（中文字符+英文词，仅存 word_count 列）、工具 `replace(/\s/g,'').length`、
 * 质量门 `trim().length`。本模块是**显示/门禁/进度**的唯一口径：去全部空白后的
 * 字符数（网文平台通用计字口径）。落库 word_count 列保留历史口径（信息字段）。
 */
export function countChapterWords(content: string): number {
  return (content || '').replace(/\s/g, '').length
}
