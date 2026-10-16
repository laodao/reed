/**
 * 代码块占位符工具
 *
 * 背景：消息渲染（阅读模式 marked 解析 / 源码模式手工格式化 / 流式输出）都需要先把
 * markdown 中的 ``` 代码块替换成占位符，避免代码内容被二次解析或转义，最后再还原为
 * 渲染后的 HTML。
 *
 * 之前的实现里各组件自带一份正则，存在两类问题：
 * 1. 占位符形如 `__CLOSED_CODE_BLOCK_0__`，会被 marked 的 GFM 粗体语法（__text__）
 *    解析成 <strong>，还原时 replace 找不到原文，页面上直接显示出占位符文字。
 * 2. 正则 `/```(\w*)\n/` 无法覆盖 CRLF 行尾、`c++`/`c#` 这类语言名，导致匹配失败。
 *
 * 这里统一收口：占位符使用不会被 markdown 语法触及的形式，正则兼容 CRLF 与
 * 任意非空白语言标识，闭合/未闭合（流式输出中）代码块都能处理。
 */

/** 单个代码块信息 */
export interface CodeBlockInfo {
  /** 语言标识（可能为空串） */
  language: string
  /** 代码内容（已去除首尾换行，保留内部空行） */
  code: string
  /** 是否已闭合（false = 流式输出中的未闭合代码块） */
  closed: boolean
}

/** 占位符前缀。首尾字符选择 `<`/`>`：marked 对文本中的尖括号做原样保留时会被转义成实体，
 * 因此配合 `escapePlaceholders`/`unescapePlaceholders` 使用；避免使用 `_`（GFM 粗体）、
 * `*`（斜体）、`~`（删除线）等会被 markdown 解析的字符。 */
const PLACEHOLDER_PREFIX = 'CODEBLOCKPLACEHOLDER'
const PLACEHOLDER_SUFFIX = 'X'

/** 生成第 index 个代码块的占位符 */
export function makeCodeBlockPlaceholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`
}

/**
 * 提取内容中的所有代码块（闭合 + 未闭合），并返回替换为占位符后的正文。
 *
 * 规则：
 * - 闭合代码块：` ```lang\ncode``` `，非贪婪匹配到最近的闭合 fence
 * - 未闭合代码块：` ```lang\ncode ` 直到内容结尾（流式输出中途）
 * - fence 后的换行兼容 `\n` 与 `\r\n`；语言标识允许任意非空白字符（c++、c#、objective-c 等）
 *
 * @returns blocks 按出现顺序排列的代码块；contentWithPlaceholders 替换后的正文
 */
export function extractCodeBlocks(content: string): {
  blocks: CodeBlockInfo[]
  contentWithPlaceholders: string
} {
  const blocks: CodeBlockInfo[] = []

  // 1. 先匹配所有闭合代码块（```lang\ncode```）
  let text = content.replace(/```([^\n\r]*)\r?\n([\s\S]*?)```/g, (_match, language: string, code: string) => {
    blocks.push({ language: language.trim(), code: code.replace(/\r?\n$/, '').trim(), closed: true })
    return makeCodeBlockPlaceholder(blocks.length - 1)
  })

  // 2. 再匹配剩余的未闭合代码块（```lang\ncode 直到结尾，流式输出时）
  text = text.replace(/```([^\n\r]*)\r?\n([\s\S]*)$/g, (_match, language: string, code: string) => {
    blocks.push({ language: language.trim(), code: code.trim(), closed: false })
    return makeCodeBlockPlaceholder(blocks.length - 1)
  })

  return { blocks, contentWithPlaceholders: text }
}

/**
 * 把占位符形式的文本做 HTML 转义（用于源码模式：正文需要转义，占位符稍后还原成 HTML）。
 *
 * 占位符本身由字母数字组成，转义后保持不变，因此可以先整体转义再还原。
 */
export function escapeHtmlKeepPlaceholders(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 还原正文中的占位符为对应代码块的 HTML。
 *
 * 使用函数形式的 replace 回调，避免代码块 HTML 中含有 `$`、`$&` 等特殊序列时
 * 被字符串替换语义错误展开。
 */
export function restoreCodeBlocks(
  html: string,
  blocks: CodeBlockInfo[],
  renderBlock: (block: CodeBlockInfo, index: number) => string
): string {
  return html.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'),
    (match, indexStr: string) => {
      const index = parseInt(indexStr, 10)
      const block = blocks[index]
      // 理论上不会发生（占位符均由 extractCodeBlocks 生成）；兜底原样返回
      if (!block) return match
      return renderBlock(block, index)
    }
  )
}

/**
 * 判断正文是否包含未闭合的代码块（用于决定是否走特殊渲染路径）。
 * 通过 fence 数量奇偶性判断：偶数个 ``` 表示全部闭合。
 */
export function hasOpenCodeBlock(content: string): boolean {
  const markers = content.match(/```/g)
  return !!markers && markers.length % 2 === 1
}
