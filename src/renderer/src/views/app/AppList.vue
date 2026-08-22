<template>
  <div class="app-list">
    <div class="toolbar">
      <div>
        <div class="page-title">应用</div>
        <div class="page-desc">已发布的工作流应用——在工作流编辑器「发布为应用」创建；点卡片可直接启动会话</div>
      </div>
    </div>

    <!-- 卡片网格：内部滚动，分页固定底部 -->
    <div class="grid-wrap" v-loading="loading">
      <div v-if="apps.length" class="app-grid">
        <div v-for="app in apps" :key="app.id" class="app-card" :class="{ disabled: app.enabled !== 1 }">
          <div class="card-head">
            <span class="app-emoji">{{ app.icon || '📦' }}</span>
            <div class="card-info">
              <div class="app-name" :title="app.name">{{ app.name }}</div>
              <div class="app-ver">工作流 · v{{ app.sourceVersion ?? 0 }} · {{ app.sessionCount ?? 0 }} 会话</div>
            </div>
            <el-tag :type="app.enabled === 1 ? 'success' : 'info'" size="small">{{ app.enabled === 1 ? '启用' : '停用' }}</el-tag>
          </div>

          <div class="channels">
            <span class="cdot" :class="{ on: app.channelSession === 1 }">💬 会话</span>
            <span class="cdot" :class="{ on: app.channelShare === 1 }">🔗 分享</span>
            <span class="cdot" :class="{ on: app.channelApi === 1 }">🔌 API</span>
          </div>

          <div class="card-actions">
            <el-button type="primary" size="small" :disabled="app.enabled !== 1 || app.channelSession !== 1" @click="launch(app)">
              ▶ 启动
            </el-button>
            <el-button size="small" @click="router.push(`/apps/${app.id}`)">详情</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(app)">删除</el-button>
          </div>
          <div v-if="app.enabled === 1 && app.channelSession !== 1" class="launch-tip">未开启会话渠道，无法直接启动</div>
        </div>
      </div>
      <div v-else-if="!loading" class="empty">
        <p>暂无应用</p>
        <p class="hint">在工作流编辑器点击「发布为应用」创建</p>
      </div>
    </div>

    <!-- 分页固定底部 -->
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[12, 24, 48]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="handlePageChange"
        @size-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 应用列表页（重构：卡片网格 + 卡片直接启动；发布入口已迁移到工作流编辑器）
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { AppRecord } from '@shared/types/app.types'
import { electronApi } from '@/types/electron-api'

const router = useRouter()
const api = electronApi()

const apps = ref<Array<AppRecord & { sessionCount: number }>>([])
const loading = ref(false)

// ---- 分页（卡片网格滚动 + 底部固定分页） ----
const page = ref(1)
const pageSize = ref(12)
const total = ref(0)

async function load(): Promise<void> {
  loading.value = true
  try {
    const resp = await api.app.list({ page: page.value, pageSize: pageSize.value })
    if (resp.success) {
      apps.value = resp.data?.items ?? []
      total.value = resp.data?.total ?? 0
    } else ElMessage.error(resp.error ?? '加载失败')
  } finally {
    loading.value = false
  }
}

function handlePageChange(): void {
  void load()
}

/** 卡片直接启动：创建会话并进入会话页（无需先进详情） */
async function launch(app: AppRecord): Promise<void> {
  if (app.enabled !== 1 || app.channelSession !== 1) {
    ElMessage.warning('该应用未开启会话渠道，请到详情页开启')
    return
  }
  const resp = await api.appSession.create({ appId: app.id })
  if (resp.success) {
    ElMessage.success('会话已创建')
    // from=list：会话页返回时回到应用列表（而非详情）
    router.push(`/apps/${app.id}/session/${resp.data?.id}?from=list`)
  } else ElMessage.error(resp.error ?? '启动失败')
}

async function handleDelete(row: AppRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除应用「${row.name}」？其会话与记录将一并删除，不可恢复。`, '删除应用', { type: 'warning' })
  } catch {
    return // 用户取消
  }
  const resp = await api.app.delete(row.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

onMounted(load)
</script>

<style scoped>
/* 三区固定布局：toolbar 固定 / 卡片网格内部滚动 / 分页固定底部 */
.app-list { padding: 20px 26px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-shrink: 0; }
.page-title { font-size: 20px; font-weight: 600; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; }
.grid-wrap { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
.app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.app-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 14px 16px; background: var(--el-bg-color); display: flex; flex-direction: column; gap: 12px; transition: border-color .15s, box-shadow .15s; }
.app-card:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.app-card.disabled { opacity: .6; }
.card-head { display: flex; align-items: center; gap: 10px; }
.app-emoji { font-size: 30px; width: 52px; height: 52px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--el-fill-color-light); flex-shrink: 0; }
.card-info { flex: 1; min-width: 0; }
.app-name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app-ver { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.channels { display: flex; gap: 6px; }
.cdot { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.cdot.on { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.card-actions { display: flex; align-items: center; gap: 6px; }
.launch-tip { font-size: 11px; color: var(--el-text-color-secondary); margin-top: -6px; }
.pager { flex-shrink: 0; display: flex; justify-content: flex-end; padding-top: 14px; }
.empty { color: var(--el-text-color-secondary); text-align: center; padding: 60px 0; }
.empty .hint { font-size: 12px; margin-top: 6px; }
</style>
