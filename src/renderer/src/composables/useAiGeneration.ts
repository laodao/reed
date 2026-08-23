/**
 * 统一 AI 流式生成基建
 * @module renderer/composables/useAiGeneration
 *
 * 收敛各长文阶段组件重复实现的样板：
 * - 流式事件订阅/累积/退订
 * - eventId 管理、取消（含 cancel 通道回调）
 * - 统一错误处理
 * 配套 parseJsonLoose：容错 JSON 解析（剥 ```json / 截取配对括号 / 清理控制字符）。
 */

import { ref, readonly } from 'vue'

// ==================== 容错 JSON 解析 ====================

export type ParseJsonResult = { ok: true; data: any } | { ok: false; error: string }

/**
 * 容错解析 AI 返回的 JSON（数组或对象）。
 * 处理：```json 包裹、前后叙述文字、控制字符、未配对括号。
 */
export function parseJsonLoose(text: string): ParseJsonResult {
  if (!text || !text.trim()) return { ok: false, error: '空内容' }

  // 1. 剥 markdown 代码块标记
  let jsonStr = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')

  // 2. 找第一个 { 或 [，到最后一个配对括号
  const firstObj = jsonStr.indexOf('{')
  const firstArr = jsonStr.indexOf('[')
  let start = -1
  let openChar = ''
  let closeChar = ''
  if (firstObj === -1 && firstArr === -1) return { ok: false, error: '未找到 JSON' }
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr
    openChar = '['
    closeChar = ']'
  } else {
    start = firstObj
    openChar = '{'
    closeChar = '}'
  }

  // 配对扫描（正确处理字符串内的括号）
  let depth = 0
  let inString = false
  let escapeNext = false
  let end = -1
  for (let i = start; i < jsonStr.length; i++) {
    const ch = jsonStr[i]
    if (escapeNext) { escapeNext = false; continue }
    if (ch === '\\' && inString) { escapeNext = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return { ok: false, error: '括号未配对' }

  let candidate = jsonStr.substring(start, end + 1)

  // 3. 清理控制字符（保留 \t \n \r）
  candidate = candidate.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  try {
    return { ok: true, data: JSON.parse(candidate) }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'JSON 解析失败' }
  }
}

// ==================== 生成状态机 ====================

export interface StreamGenerationParams {
  /** 生成事件 ID（订阅流式通道用） */
  eventId: string
  /** 订阅流式事件，返回退订函数 */
  subscribe: (handlers: {
    onContent: (content: string) => void
    onDone: () => void
    onError: (error: string) => void
  }) => () => void
  /** 发起生成调用；resolve 是否成功（失败时用返回的 error） */
  invoke: () => Promise<{ success: boolean; error?: string }>
  /** 可选：取消（调用 cancel 通道，主进程中断流式） */
  cancel?: () => void
}

export interface UseAiGenerationReturn {
  generating: ReturnType<typeof ref<boolean>>
  content: ReturnType<typeof ref<string>>
  error: ReturnType<typeof ref<string | null>>
  start: (params: StreamGenerationParams) => Promise<boolean>
  cancel: () => void
  reset: () => void
}

/**
 * 统一 AI 流式生成状态机（idle → generating → done/error；cancel 可中断）。
 */
export function useAiGeneration(): UseAiGenerationReturn {
  const generating = ref(false)
  const content = ref('')
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null
  let currentParams: StreamGenerationParams | null = null

  function cleanup(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    currentParams = null
    generating.value = false
  }

  async function start(params: StreamGenerationParams): Promise<boolean> {
    // 清理上一次未结束的生成
    cleanup()
    generating.value = true
    content.value = ''
    error.value = null
    currentParams = params

    unsubscribe = params.subscribe({
      onContent: (c: string) => {
        content.value += c
      },
      onDone: () => {
        cleanup()
      },
      onError: (e: string) => {
        error.value = e
        cleanup()
      },
    })

    const result = await params.invoke()
    if (!result.success) {
      error.value = result.error || '生成失败'
      cleanup()
      return false
    }
    return true
  }

  function cancel(): void {
    if (currentParams?.cancel) {
      try {
        currentParams.cancel()
      } catch {
        // cancel 通道异常不影响本地状态清理
      }
    }
    cleanup()
  }

  function reset(): void {
    cleanup()
    content.value = ''
    error.value = null
  }

  return {
    generating: readonly(generating) as ReturnType<typeof ref<boolean>>,
    content: readonly(content) as ReturnType<typeof ref<string>>,
    error: readonly(error) as ReturnType<typeof ref<string | null>>,
    start,
    cancel,
    reset,
  }
}
