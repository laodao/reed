/**
 * 聊天消息窗口化
 * @module renderer/composables/useMessageWindow
 *
 * 长会话不再一次性挂载全部消息：默认只渲染最近 `initialSize` 条，用户向上滚动时
 * 按 `chunkSize` 增量补齐历史。补齐会改变容器高度，因此在 DOM 更新前后测量
 * 锚点元素位置并补偿 scrollTop，避免视口跳动。
 *
 * 说明：只做"尾部窗口 + 增量补齐"，不做等高虚拟滚动——聊天消息高度差异极大
 * （含代码块/图表/图片），估算高度反而会带来跳动与错位。
 */
import { computed, nextTick, ref, watch, type Ref } from 'vue'

export interface MessageWindowOptions {
  /** 初始渲染的最近消息条数 */
  initialSize?: number
  /** 每次向上补齐的条数 */
  chunkSize?: number
}

export interface MessageWindow {
  /** 窗口起始下标（含） */
  startIndex: Ref<number>
  /** 被折叠（未挂载）的历史条数 */
  hiddenCount: Ref<number>
  /** 是否还有被折叠的历史 */
  canExpand: Ref<boolean>
  /** 补齐一段历史；返回本次新增条数（0 表示没有可补） */
  expandHistory(): number
  /** 重置回初始窗口 */
  reset(): void
}

export function useMessageWindow(
  total: Ref<number> | (() => number),
  options: MessageWindowOptions = {},
): MessageWindow {
  const initialSize = options.initialSize ?? 30
  const chunkSize = options.chunkSize ?? 30
  const totalRef = typeof total === 'function' ? computed(total) : total

  const getTotal = (): number => totalRef.value ?? 0
  const tailStart = (n: number): number => Math.max(0, n - initialSize)

  const startIndex = ref(tailStart(getTotal()))

  // 总数变化：变短时收敛窗口（startIndex 不为负、不超尾）；变长时保持已展开区间
  // （新消息落在窗口尾部，天然可见）
  watch(totalRef, (n) => {
    if (n < startIndex.value + 1) startIndex.value = tailStart(n)
  })

  const hiddenCount = computed(() => startIndex.value)
  const canExpand = computed(() => startIndex.value > 0)

  function expandHistory(): number {
    if (startIndex.value <= 0) return 0
    const added = Math.min(chunkSize, startIndex.value)
    startIndex.value -= added
    return added
  }

  function reset(): void {
    startIndex.value = tailStart(getTotal())
  }

  return { startIndex, hiddenCount, canExpand, expandHistory, reset }
}

/**
 * 向上补齐历史并保住滚动位置：DOM 更新前后各测一次锚点位置，用差值补偿 scrollTop。
 * @param container 消息滚动容器
 * @param anchorSelector 锚点元素选择器（应为补齐后依然存在的元素，如窗口首条消息）
 * @param apply 实际执行窗口前移的函数（返回新增条数）
 */
export async function expandHistoryKeepingScroll(
  container: HTMLElement | null,
  anchorSelector: string,
  apply: () => number,
): Promise<boolean> {
  const anchor = container?.querySelector(anchorSelector) as HTMLElement | null
  const before = anchor?.offsetTop ?? null
  const added = apply()
  if (added <= 0) return false
  if (!container || before === null) return true

  await nextTick()
  const after = (container.querySelector(anchorSelector) as HTMLElement | null)?.offsetTop ?? null
  if (after !== null) container.scrollTop += after - before
  return true
}