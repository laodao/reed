/**
 * 消息渲染缓存与 mermaid 探测（聊天页首开性能）
 * @module renderer/utils/chat-render-cache
 *
 * 两个独立职责，都为"少做无谓计算"服务：
 *
 * 1. `createRenderCache`：把 markdown → HTML 这类**纯计算**按 (消息 id, 内容) 缓存。
 *    MessageItem 的模板里同步调用 formatContent/formatSourceContent/formatStreamContent，
 *    而组件重渲染（流式 delta 每秒几十次、父组件任何响应式更新）都会重跑整条渲染管线
 *    （marked 解析 + DOMParser 消毒 + 逐行转义）。缓存后同一份内容只解析一次。
 *
 * 2. `containsMermaidBlock`：判断内容里是否真有 mermaid 代码块。MessageItem 原本无条件
 *    为每条消息安排 mermaid 渲染尝试（挂载 + 50ms + 200ms + 500ms 四个定时器），
 *    于绝大多数不含图表的对话是纯浪费；配合 hashing 只对"内容里出现过 mermaid 围栏"的
 *    消息做一次廉价复核。
 */
export { hashText } from './hash-text'

/** 单键缓存：同一 key 只保留最后一次结果，天然有界 */
export interface RenderCache<T> {
  /** 取缓存；未命中则用 render 计算并写入 */
  get(key: string, text: string): T
  /** 清空（会话切换时调用） */
  reset(): void
  /** 当前缓存条目数（测试/诊断用） */
  size(): number
}

/**
 * 创建按 (key, text) 缓存的计算器。
 * text 相同则复用结果；text 变化（流式增量）覆盖旧结果，避免无界增长。
 */
export function createRenderCache<T>(render: (text: string) => T): RenderCache<T> {
  const store = new Map<string, { text: string; value: T }>()
  return {
    get(key: string, text: string): T {
      const hit = store.get(key)
      if (hit && hit.text === text) return hit.value
      const value = render(text)
      store.set(key, { text, value })
      return value
    },
    reset(): void {
      store.clear()
    },
    size(): number {
      return store.size
    },
  }
}

/** mermaid 代码块围栏（可缩进；语言别名 mermaid / mmd；允许未闭合——流式中间态） */
const MERMAID_FENCE = /^[ \t]*```[ \t]*(mermaid|mmd)[ \t]*$/im

/** 内容里是否含 mermaid 代码块（用于决定是否值得尝试渲染图表） */
export function containsMermaidBlock(content: string): boolean {
  return content.length > 0 && MERMAID_FENCE.test(content)
}