/**
 * 通知中心 Pinia Store
 * @module stores/notification
 * @description 顶栏铃铛未读数 + 通知中心抽屉数据：
 *  - unreadCount：未读数（铃铛徽标）
 *  - items / total / hasMore：历史通知分页列表
 *  - 已读操作统一经后端 user_notification_reads 表持久化
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  NoticeItem,
  NoticeListQuery,
  NoticeListResult,
  NoticeReadResult,
} from '@shared/types/notification.types'

interface NotificationApi {
  list: (q: NoticeListQuery) => Promise<{ success: boolean; data?: NoticeListResult; error?: string }>
  markRead: (seqs: number[]) => Promise<{ success: boolean; data?: NoticeReadResult; error?: string }>
  markAllRead: () => Promise<{ success: boolean; data?: NoticeReadResult; error?: string }>
  unreadCount: () => Promise<{ success: boolean; data?: number; error?: string }>
}

function api(): NotificationApi | null {
  const w = window as never as { electronAPI?: { notification?: NotificationApi } }
  return w.electronAPI?.notification ?? null
}

export const useNotificationStore = defineStore('notification', () => {
  /** 未读数（铃铛徽标） */
  const unreadCount = ref(0)
  /** 历史通知（倒序，新→旧） */
  const items = ref<NoticeItem[]>([])
  const total = ref(0)
  const hasMore = ref(false)
  const loading = ref(false)
  const drawerOpen = ref(false)

  /** 是否后端可用（Web 注入缺失时优雅降级） */
  const available = computed(() => !!api())

  /** 拉取未读数 */
  async function refreshUnread(): Promise<void> {
    const a = api()
    if (!a) return
    try {
      const r = await a.unreadCount()
      if (r?.success && typeof r.data === 'number') unreadCount.value = r.data
    } catch { /* 静默 */ }
  }

  /** 拉取历史列表（第 1 页或翻页） */
  async function fetchList(query: NoticeListQuery = {}): Promise<void> {
    const a = api()
    if (!a) return
    loading.value = true
    try {
      const r = await a.list({ page: query.page ?? 1, pageSize: query.pageSize ?? 30, unreadFirst: true })
      if (r?.success && r.data) {
        const d = r.data
        if ((query.page ?? 1) <= 1) items.value = d.items
        else items.value = [...items.value, ...d.items]
        total.value = d.total
        hasMore.value = d.hasMore
        unreadCount.value = d.unread
      }
    } catch { /* 静默 */ } finally {
      loading.value = false
    }
  }

  /** 标记单条/多条已读 */
  async function markRead(seqs: number[]): Promise<void> {
    if (!seqs.length) return
    const a = api()
    if (!a) return
    try {
      const r = await a.markRead(seqs)
      if (r?.success && typeof r.data?.unread === 'number') unreadCount.value = r.data.unread
      const seqSet = new Set(seqs)
      items.value = items.value.map(i => (seqSet.has(i.seq) ? { ...i, read: true } : i))
    } catch { /* 静默 */ }
  }

  /** 全部已读 */
  async function markAllRead(): Promise<void> {
    const a = api()
    if (!a) return
    try {
      const r = await a.markAllRead()
      if (r?.success && typeof r.data?.unread === 'number') unreadCount.value = r.data.unread
      items.value = items.value.map(i => ({ ...i, read: true }))
    } catch { /* 静默 */ }
  }

  function openDrawer(): void {
    drawerOpen.value = true
    void fetchList()
  }

  function closeDrawer(): void {
    drawerOpen.value = false
  }

  return {
    unreadCount,
    items,
    total,
    hasMore,
    loading,
    drawerOpen,
    available,
    refreshUnread,
    fetchList,
    markRead,
    markAllRead,
    openDrawer,
    closeDrawer,
  }
})
