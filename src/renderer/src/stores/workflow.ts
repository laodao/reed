/**
 * 工作流 Pinia Store（双端共用；片8 编辑器扩展本 store）
 * @module stores/workflow
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElNotification } from 'element-plus'

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
      ElNotification({
        title: e.title ?? '工作流通知',
        message: e.message ?? '',
        type: (e.level as 'success' | 'warning' | 'error' | 'info') ?? 'info',
      })
    } else if (e.type === 'review-requested') {
      pendingReviewCount.value++
      ElNotification({ title: '待审核', message: `工作流运行等待您的审核`, type: 'warning' })
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

  return { nodeStatusMap, runStatusMap, pendingReviewCount, subscribe, unsubscribeAll, clearRun }
})
