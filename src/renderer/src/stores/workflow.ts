/**
 * 工作流 Pinia Store（双端共用；片8 编辑器扩展本 store）
 * @module stores/workflow
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import router from '@/router'
import { notify, notifyTodo } from '@/utils/notify'

/** wf:run-event 载荷（判别联合的宽松形态） */
export interface WfRunEvent {
  type: 'run-status' | 'node-status' | 'node-progress' | 'review-requested' | 'notify'
  runId?: string
  nodeId?: string
  iterationIndex?: number
  status?: string
  error?: string
  level?: string
  title?: string
  message?: string
  [key: string]: unknown
}

export const useWorkflowStore = defineStore('workflow', () => {
  /** 实时节点状态：runId → `${nodeId}:${iteration}` → { status, error } */
  const nodeStatusMap = ref<Map<string, Map<string, { status: string; error?: string }>>>(new Map())
  /** 实时运行状态：runId → status */
  const runStatusMap = ref<Map<string, string>>(new Map())
  /** 待审核数量（顶栏徽标用） */
  const pendingReviewCount = ref(0)
  /** 最近一次待审核运行的 runId（通知点击直达运行详情） */
  const pendingReviewRunId = ref('')

  let unsubscribers: Array<() => void> = []
  /** 订阅幂等标志：反复进出运行详情页/编辑器不再累积 ipcRenderer 监听器 */
  let subscribed = false

  function applyEvent(e: WfRunEvent) {
    if (e.type === 'node-status' && e.runId && e.nodeId) {
      const key = `${e.nodeId}:${e.iterationIndex ?? 0}`
      let m = nodeStatusMap.value.get(e.runId)
      if (!m) {
        m = new Map()
        nodeStatusMap.value.set(e.runId, m)
      }
      m.set(key, { status: e.status ?? '', error: e.error })
    } else if (e.type === 'run-status' && e.runId) {
      runStatusMap.value.set(e.runId, e.status ?? '')
    } else if (e.type === 'notify') {
      notify({
        title: e.title ?? '工作流通知',
        message: e.message ?? '',
        type: (e.level as 'success' | 'warning' | 'error' | 'info') ?? 'info',
        // 点击即关闭（用户需求：通知点击后自动消失）；有 runId 时顺带直达运行详情
        onClick: () => {
          if (e.runId) void router.push(`/workflow/run/${e.runId}`)
        },
      })
    } else if (e.type === 'review-requested') {
      pendingReviewCount.value++
      pendingReviewRunId.value = e.runId ?? ''
      const runId = e.runId ?? ''
      const nodeName = (e as { nodeName?: string }).nodeName
      // 待办类：弹窗超时自动关闭（不再永久占屏）；运行详情仍可经通知中心回看
      notifyTodo(
        {
          title: '待审核',
          message: nodeName
            ? `运行 ${runId} 在「${nodeName}」等待您的审核，点击查看`
            : `运行 ${runId} 等待您的审核，点击查看`,
          route: runId ? `/workflow/run/${runId}` : undefined,
        },
        route => void router.push(route)
      )
    }
  }

  /** 订阅实时事件（页面 setup 调用一次；幂等——重复调用不累积监听器） */
  function subscribe() {
    if (subscribed) return
    subscribed = true
    // 新订阅周期重置待审核计数（review-requested 只增不减，长期使用徽标失真）
    pendingReviewCount.value = 0
    const api = (window as never as { electronAPI: { workflow: { onRunEvent: (cb: (e: WfRunEvent) => void) => () => void } } }).electronAPI
    unsubscribers.push(api.workflow.onRunEvent(applyEvent))
  }

  function unsubscribeAll() {
    unsubscribers.forEach(fn => fn())
    unsubscribers = []
    subscribed = false
  }

  /** 清理某运行的状态（离开详情页用） */
  function clearRun(runId: string) {
    nodeStatusMap.value.delete(runId)
    runStatusMap.value.delete(runId)
  }

  return {
    nodeStatusMap,
    runStatusMap,
    pendingReviewCount,
    pendingReviewRunId,
    subscribe,
    unsubscribeAll,
    clearRun,
  }
})
