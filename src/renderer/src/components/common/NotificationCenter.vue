<template>
  <!-- 顶栏铃铛：未读徽标 + 点击打开通知中心 -->
  <div class="notification-bell">
    <el-badge :value="store.unreadCount" :max="99" :hidden="store.unreadCount === 0">
      <button class="bell-btn" type="button" aria-label="通知中心" @click="store.openDrawer()">
        <el-icon :size="18"><Bell /></el-icon>
      </button>
    </el-badge>

    <!-- 通知中心抽屉 -->
    <el-drawer
      v-model="store.drawerOpen"
      title="通知中心"
      size="380px"
      :with-header="true"
      class="notification-drawer"
    >
      <template #header>
        <div class="drawer-header">
          <span class="drawer-title">通知中心</span>
          <div class="drawer-actions">
            <el-button
              v-if="store.unreadCount > 0"
              link
              type="primary"
              size="small"
              @click="handleMarkAll"
            >
              全部已读
            </el-button>
            <el-button link size="small" :disabled="store.loading" @click="handleRefresh">
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <div v-loading="store.loading" class="notice-list">
        <template v-if="store.items.length > 0">
          <div
            v-for="n in store.items"
            :key="n.seq"
            class="notice-item"
            :class="{ unread: !n.read }"
            @click="handleItemClick(n)"
          >
            <div class="notice-icon" :class="`icon-${n.category}`">
              <el-icon><component :is="categoryIcon(n.category)" /></el-icon>
            </div>
            <div class="notice-body">
              <div class="notice-title-row">
                <span class="notice-title">{{ n.title }}</span>
                <span v-if="!n.read" class="unread-dot"></span>
              </div>
              <div class="notice-msg">{{ n.message }}</div>
              <div class="notice-meta">{{ formatTime(n.occurredAt) }}<span v-if="n.runId" class="notice-run">· {{ shortRunId(n.runId) }}</span></div>
            </div>
          </div>
          <div v-if="store.hasMore" class="load-more">
            <el-button text type="primary" :loading="store.loading" @click="handleLoadMore">
              加载更多
            </el-button>
          </div>
        </template>
        <el-empty v-else-if="!store.loading" description="暂无通知" :image-size="70" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bell,
  ChatDotRound,
  CircleCheck,
  VideoPlay,
  Promotion,
} from '@element-plus/icons-vue'
import { useNotificationStore } from '@/stores/notification'
import { useWorkflowStore } from '@/stores/workflow'
import type { NoticeItem, NoticeCategory } from '@shared/types/notification.types'

const router = useRouter()
const store = useNotificationStore()
// MainLayout 已全局订阅 wf:run-event → workflow store；这里 watch 其待审核计数，
// 收到新待审核事件时即时刷新未读数（不必等 15s 轮询）
const wfStore = useWorkflowStore()
// 低频轮询未读数：铃铛徽标随后台运行/审核实时更新（通知量低频，15s 足够）
let pollTimer: ReturnType<typeof setInterval> | null = null

watch(
  () => wfStore.pendingReviewCount,
  () => void store.refreshUnread()
)

/** 类型 → 图标 */
function categoryIcon(category: NoticeCategory): unknown {
  switch (category) {
    case 'workflow_review': return ChatDotRound
    case 'workflow_run': return CircleCheck
    case 'workflow_notify': return Promotion
    default: return VideoPlay
  }
}

/** 点击通知：标记已读 + 跳转对应功能页 */
async function handleItemClick(n: NoticeItem): Promise<void> {
  if (!n.read) void store.markRead([n.seq])
  // 关闭抽屉后再跳转，避免导航被覆盖
  store.closeDrawer()
  if (n.route) void router.push(n.route)
}

function handleMarkAll(): void {
  void store.markAllRead()
}

function handleRefresh(): void {
  void store.fetchList()
}

function handleLoadMore(): void {
  void store.fetchList({ page: Math.floor(store.items.length / 30) + 1, pageSize: 30 })
}

/** 时间格式化：今天显示 HH:mm，昨天显示"昨天"，更早显示 M月d日 */
function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return hm
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 运行 id 缩写 */
function shortRunId(runId: string): string {
  return runId.length > 18 ? `${runId.slice(0, 12)}…${runId.slice(-4)}` : runId
}

onMounted(() => {
  void store.refreshUnread()
  // 低频轮询未读数（铃铛徽标实时性；通知量低频不构成性能问题）
  pollTimer = setInterval(() => void store.refreshUnread(), 15000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped lang="scss">
.notification-bell {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
}

.bell-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-color-primary);
  }
}

.notice-list {
  min-height: 240px;
}

.notice-item {
  display: flex;
  gap: 10px;
  padding: 12px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.unread {
    background: var(--el-color-primary-light-9);

    &:hover {
      background: var(--el-color-primary-light-8);
    }
  }
}

.notice-icon {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;

  &.icon-workflow_review { background: #e6a23c; }
  &.icon-workflow_run { background: #409eff; }
  &.icon-workflow_notify { background: #67c23a; }
  &.icon-domain { background: #909399; }
}

.notice-body {
  flex: 1;
  min-width: 0;
}

.notice-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.notice-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f56c6c;
  flex: 0 0 7px;
}

.notice-msg {
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

.notice-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.notice-run {
  margin-left: 4px;
}

.load-more {
  text-align: center;
  padding: 8px 0;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
}
</style>
