<template>
  <div class="ic-home">
    <div class="home-header">
      <h2>信息搜集</h2>
      <p class="home-sub">
        输入任意主题——AI 现场起草采集蓝图并执行：条目级、带原文溯源、可增量刷新的研究资料库，整理结果落知识库供写作与研究复用。
      </p>
      <div class="home-actions">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建搜集主题</el-button>
        <el-button :icon="Refresh" @click="store.loadProjects()">刷新</el-button>
      </div>
    </div>

    <div v-loading="store.loadingProjects" class="topic-grid">
      <el-empty v-if="!store.loadingProjects && store.projects.length === 0" description="还没有搜集主题——输入一个主题开始" />
      <div v-for="p in store.projects" :key="p.id" class="topic-card" @click="enter(p.id)">
        <div class="card-top">
          <div class="topic-name">
            <el-icon class="topic-icon"><Collection /></el-icon>
            <span>{{ p.name }}</span>
          </div>
          <el-tag size="small" effect="plain">蓝图 v{{ p.blueprintVersion }}</el-tag>
          <el-tag v-if="!p.kbId" size="small" type="warning" effect="plain">未绑定知识库</el-tag>
        </div>
        <p class="topic-goal">{{ p.goal }}</p>
        <div class="card-meta">
          <span>需求 {{ p.blueprint?.requirements?.length ?? 0 }} 条</span>
          <span v-if="p.blueprint?.autoConfirm" class="meta-ok">已确认</span>
          <span v-else class="meta-warn">待确认蓝图</span>
          <span class="meta-time">{{ shortTime(p.updatedAt) }}</span>
        </div>
      </div>
    </div>

    <!-- 创建向导：主题 → 快速/精调 → 起草 → 预检结论 -->
    <el-dialog v-model="createVisible" title="新建搜集主题" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="主题描述（一句话）">
          <el-input v-model="form.goal" placeholder="例如：全球主要央行近 5 年利率决议" @keyup.enter="doCreate" />
        </el-form-item>
        <el-form-item label="项目名（可选，缺省取主题前 30 字）">
          <el-input v-model="form.name" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="模式">
          <el-radio-group v-model="form.mode">
            <el-radio value="quick">快速——AI 起草蓝图后直接开跑（口径按默认假设，报告中展示）</el-radio>
            <el-radio value="review">精调——先出蓝图给我确认，口径敏感时用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <div v-if="creating" class="create-loading" v-loading="creating" element-loading-text="AI 正在起草采集蓝图…" />
      <div v-if="checkError" class="check-block">
        <el-alert type="error" :title="checkError" :closable="false" />
      </div>
      <div v-if="lastCheck" class="check-block">
        <el-alert
          :type="lastCheck.ok ? 'success' : 'warning'"
          :title="lastCheck.ok ? '蓝图自检通过' : `蓝图自检有 ${lastCheck.errors.length} 项结构问题`"
          :closable="false"
        >
          <div v-for="e in lastCheck.errors" :key="e.path" class="check-line">✕ {{ e.path }}：{{ e.message }}</div>
          <div v-for="w in lastCheck.warnings" :key="w.path" class="check-line warn">! {{ w.path }}：{{ w.message }}</div>
        </el-alert>
      </div>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!form.goal.trim()" @click="doCreate">
          {{ form.mode === 'quick' ? '起草并开跑' : '起草蓝图' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Collection } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useInfoCollectionStore } from '@/stores/info-collection'
import type { IcBlueprintCheckResult } from '@shared/utils/info-collection-blueprint'

const router = useRouter()
const store = useInfoCollectionStore()

const createVisible = ref(false)
const creating = ref(false)
const checkError = ref('')
const lastCheck = ref<IcBlueprintCheckResult | null>(null)
const form = reactive({ goal: '', name: '', mode: 'quick' as 'quick' | 'review' })

onMounted(() => {
  void store.loadProjects()
})

function openCreate(): void {
  form.goal = ''
  form.name = ''
  form.mode = 'quick'
  checkError.value = ''
  lastCheck.value = null
  createVisible.value = true
}

async function doCreate(): Promise<void> {
  if (!form.goal.trim() || creating.value) return
  creating.value = true
  checkError.value = ''
  lastCheck.value = null
  try {
    const { project, check, error } = await store.createProject({ goal: form.goal, name: form.name, mode: form.mode })
    if (error || !project) {
      checkError.value = error ?? '创建失败'
      return
    }
    lastCheck.value = check
    if (form.mode === 'quick' && check?.ok) {
      ElMessage.success('蓝图已确认，任务已在后台开跑')
      createVisible.value = false
      void router.push(`/info-collection/${project.id}`)
    } else if (check?.ok) {
      ElMessage.success('蓝图已起草，进入项目页确认后开跑')
      createVisible.value = false
      void router.push(`/info-collection/${project.id}`)
    } else {
      ElMessage.warning('蓝图自检有问题，已为你保留草稿——可调整主题描述重试')
    }
  } finally {
    creating.value = false
  }
}

function enter(id: string): void {
  void router.push(`/info-collection/${id}`)
}

function shortTime(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16).replace('T', ' ')
}
</script>

<style scoped>
.ic-home { padding: 24px 32px; }
.home-header h2 { margin: 0 0 6px; }
.home-sub { margin: 0 0 16px; color: var(--el-text-color-secondary); font-size: 13px; }
.home-actions { margin-bottom: 20px; display: flex; gap: 8px; }
.topic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.topic-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: box-shadow 0.15s; background: var(--el-bg-color); }
.topic-card:hover { box-shadow: var(--el-box-shadow-light); }
.card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.topic-name { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 15px; }
.topic-icon { color: var(--el-color-primary); }
.topic-goal { margin: 10px 0; color: var(--el-text-color-secondary); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { display: flex; gap: 12px; font-size: 12px; color: var(--el-text-color-secondary); }
.meta-ok { color: var(--el-color-success); }
.meta-warn { color: var(--el-color-warning); }
.meta-time { margin-left: auto; }
.create-loading { height: 60px; margin-top: 8px; }
.check-block { margin-top: 10px; }
.check-line { font-size: 12px; }
.check-line.warn { color: var(--el-color-warning); }
</style>
