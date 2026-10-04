/**
 * 重型渲染可见性门控（聊天页首开性能）
 * @module renderer/composables/useVisibleOnce
 *
 * 用途：把"很贵且不着急"的渲染（如 mermaid 图表：模块求值 + 文本量算 + 布局读取）
 * 推迟到元素真正进入视口之后。聊天页首开时会一次性挂载整屏历史消息，若在挂载阶段
 * 就同步求值重型库，主线程会被长任务占满（实测首开单次长任务 ~600ms，其中
 * mermaid 的 HTML 标签量算 getBoundingClientRect 占 ~350ms）。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export interface VisibleOnceOptions {
  /** 视口外扩边距（提前渲染，避免滚动时看到空白）；默认 200px */
  rootMargin?: string
}

/**
 * 监听元素是否至少进入过一次视口。
 * 无 IntersectionObserver（旧运行时/测试环境）时直接视为可见，保证功能不丢。
 */
export function useVisibleOnce(
  target: Ref<HTMLElement | null>,
  options: VisibleOnceOptions = {},
): Ref<boolean> {
  const visible = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    if (visible.value) return
    if (typeof IntersectionObserver !== 'function') {
      visible.value = true
      return
    }
    const el = target.value
    if (!el) {
      // 元素尚未就位（如 v-if 分支），保守起见按可见处理，避免永久不渲染
      visible.value = true
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.value = true
            observer?.disconnect()
            observer = null
            break
          }
        }
      },
      { rootMargin: options.rootMargin ?? '200px' },
    )
    observer.observe(el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return visible
}