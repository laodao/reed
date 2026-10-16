/**
 * 分镜提示词编辑器的 @ 提及检测（纯函数，便于单测）。
 *
 * 背景 bug：旧实现用「编辑器整体 textContent + 光标全局偏移」匹配 /@([^[\]@\s]*)$/，
 * 但已渲染的资产 token（contenteditable=false）的可见文字是 `@名字`，DOM 文本里
 * 没有序列化格式的 `[ ]` 边界，导致光标落在 token 之后的任意描述文字里时，
 * 前置文本都以「@名字…」结尾，点击即误弹资产搜索框。
 *
 * 修复原则：只认「光标落在真实文本节点」的输入，向前回溯时跳过一切元素节点
 * （token / label / br），token 的可见文字不参与匹配。
 */

/** @query 向前回溯的最大字符数（资产名远小于此；限制回溯范围防退化） */
export const MENTION_QUERY_MAX = 32

/**
 * 判断光标处是否「正在输入 @提及」，是则返回已输入的 query（不含 @），否则 null。
 *
 * @param endContainer 当前 selection range 的 endContainer
 * @param endOffset    当前 selection range 的 endOffset
 */
export function mentionQueryAtCaret(endContainer: Node, endOffset: number): string | null {
  // 光标在元素节点间隙（如 token 边界、行首）→ 不是在文本里输入，不弹
  if (endContainer.nodeType !== Node.TEXT_NODE) return null
  let before = (endContainer.textContent ?? '').slice(0, endOffset)
  // 向前拼接同一父元素内前面的「纯文本兄弟节点」；遇到任何元素节点（token 等）即停——
  // token 的可见文字（@名字）绝不能进入匹配文本。
  let node: Node = endContainer
  while (before.length < MENTION_QUERY_MAX) {
    const prev: Node | null = node.previousSibling
    if (!prev || prev.nodeType !== Node.TEXT_NODE) break
    before = (prev.textContent ?? '') + before
    node = prev
  }
  before = before.replace(/\u00a0/g, ' ')
  const m = before.match(/@([^[\]@\s]*)$/)
  return m ? m[1] : null
}
