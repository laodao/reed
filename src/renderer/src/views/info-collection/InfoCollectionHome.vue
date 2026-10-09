<template>
  <div class="ic-home">
    <div class="home-header">
      <div class="header-text">
        <h2>信息搜集</h2>
        <p class="home-sub">输入任意主题，AI 起草采集蓝图并执行——条目级、带原文溯源的研究资料库，整理结果落知识库复用。</p>
      </div>
      <div class="home-actions">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建搜集主题</el-button>
        <el-button :icon="Refresh" :loading="store.loadingProjects" @click="store.loadProjects()">刷新</el-button>
        <el-button :icon="Mic" @click="openTranscribe">转写设置</el-button>
      </div>
    </div>

    <!-- 三态：失败（可重试）/ 空（页内 CTA）/ 列表 -->
    <div v-if="store.errorProjects && !store.loadingProjects" class="state-wrap">
      <el-empty :description="`项目列表加载失败：${store.errorProjects}`">
        <el-button type="primary" :icon="Refresh" @click="store.loadProjects()">重试</el-button>
      </el-empty>
    </div>
    <div v-else-if="!store.loadingProjects && store.projects.length === 0" class="state-wrap">
      <el-empty description="还没有搜集主题——输入一个主题，AI 直接开搜">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建搜集主题</el-button>
      </el-empty>
    </div>
    <div v-else v-loading="store.loadingProjects" class="topic-grid">
      <div v-for="p in store.projects" :key="p.id" class="topic-card" @click="enter(p.id)">
        <div class="card-top">
          <el-icon class="topic-icon"><Collection /></el-icon>
          <span class="topic-name">{{ p.name }}</span>
          <el-tag size="small" effect="plain">v{{ p.blueprintVersion }}</el-tag>
        </div>
        <el-tooltip :content="p.goal" placement="top" :show-after="300">
          <p class="topic-goal">{{ p.goal }}</p>
        </el-tooltip>
        <div class="card-meta">
          <el-tag size="small" :type="p.blueprint?.autoConfirm ? 'success' : 'warning'" effect="light">
            {{ p.blueprint?.autoConfirm ? '已确认' : '待确认蓝图' }}
          </el-tag>
          <el-tag v-if="!p.kbId" size="small" type="info" effect="plain">未绑定知识库</el-tag>
          <span class="meta-count" v-if="p.blueprint">需求 {{ p.blueprint.requirements?.length ?? 0 }} 条</span>
          <span class="meta-time">{{ relativeTime(p.updatedAt) }}</span>
        </div>
      </div>
    </div>

    <!-- 转写设置（M4：本地 whisper / 云 API） -->
    <el-dialog v-model="tsVisible" title="音频转写设置" width="520px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="转写方式">
          <el-radio-group v-model="ts.provider">
            <el-radio-button value="off">不转写</el-radio-button>
            <el-radio-button value="local">本地 Whisper</el-radio-button>
            <el-radio-button value="cloud">云 API</el-radio-button>
          </el-radio-group>
          <div class="ts-hint">
            {{ ts.provider === 'off' ? '音频/视频只存原件，条目里如实标注"待转写"' : '' }}
            {{ ts.provider === 'local' ? '首次使用自动下载模型（几十 MB，走镜像），之后离线可用；CPU 推理较慢' : '' }}
            {{ ts.provider === 'cloud' ? '任何 OpenAI 兼容转写端点（OpenAI / SiliconFlow / Groq 等）' : '' }}
          </div>
        </el-form-item>
        <template v-if="ts.provider === 'local'">
          <el-form-item label="模型档">
            <el-select v-model="ts.local.modelSize" style="width: 200px">
              <el-option label="tiny（最快，准确率低）" value="tiny" />
              <el-option label="base（推荐）" value="base" />
              <el-option label="small（较准，较慢）" value="small" />
            </el-select>
          </el-form-item>
          <el-form-item label="模型镜像">
            <el-input v-model="ts.local.mirror" placeholder="https://hf-mirror.com（国内缺省）" />
          </el-form-item>
        </template>
        <template v-if="ts.provider === 'cloud'">
          <el-form-item label="API 地址">
            <el-input v-model="ts.cloud.baseUrl" placeholder="https://api.siliconflow.cn/v1" />
          </el-form-item>
          <el-form-item label="API Key">
            <el-input v-model="ts.cloud.apiKey" type="password" show-password placeholder="sk-…" />
          </el-form-item>
          <el-form-item label="模型名">
            <el-input v-model="ts.cloud.model" placeholder="SenseVoiceSmall / whisper-1 …" />
          </el-form-item>
        </template>
        <el-form-item label="转写语言">
          <el-select v-model="ts.language" style="width: 200px">
            <el-option label="中文" value="chinese" />
            <el-option label="英文" value="english" />
            <el-option label="自动" value="" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tsVisible = false">取消</el-button>
        <el-button type="primary" :loading="tsSaving" @click="saveTranscribe">保存</el-button>
      </template>
    </el-dialog>

    <!-- 创建：主题 → 快速/精调（radio 卡片）→ 起草 → 预检结论 -->
    <el-dialog v-model="createVisible" title="新建搜集主题" width="560px" :close-on-click-modal="false">
      <el-form label-position="top" @submit.prevent="doCreate">
        <el-form-item label="主题描述（一句话）">
          <el-input v-model="form.goal" placeholder="例如：全球主要央行近 5 年利率决议" @keyup.enter="doCreate" />
        </el-form-item>
        <el-form-item label="项目名（可选）">
          <el-input v-model="form.name" placeholder="留空自动取主题前 30 字" />
        </el-form-item>
        <el-form-item label="模式">
          <div class="mode-cards">
            <div class="mode-card" :class="{ active: form.mode === 'quick' }" @click="form.mode = 'quick'">
              <div class="mode-title">
                <el-icon><Lightning /></el-icon>
                快速
              </div>
              <div class="mode-desc">AI 起草蓝图，自检通过直接开跑；口径按默认假设，报告中如实展示</div>
            </div>
            <div class="mode-card" :class="{ active: form.mode === 'review' }" @click="form.mode = 'review'">
              <div class="mode-title">
                <el-icon><View /></el-icon>
                精调
              </div>
              <div class="mode-desc">先出蓝图给你确认口径，再开跑；口径敏感的主题用这个</div>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <div v-if="creating" v-loading="true" class="create-loading" element-loading-text="AI 正在起草采集蓝图…" />
      <div v-if="checkError" class="check-block">
        <el-alert type="error" :title="checkError" :closable="false" />
      </div>
      <div v-if="lastCheck && !lastCheck.ok" class="check-block">
        <el-alert type="warning" :title="`蓝图自检有 ${lastCheck.errors.length} 项结构问题（项目已创建，不会重复占名额）`" :closable="false">
          <div v-for="e in lastCheck.errors" :key="e.path" class="check-line">✕ {{ e.path }}：{{ e.message }}</div>
          <div v-for="w in lastCheck.warnings" :key="w.path" class="check-line warn">! {{ w.path }}：{{ w.message }}</div>
        </el-alert>
        <div class="deadend-actions">
          <el-button size="small" type="primary" @click="enterPending">仍要进入项目页</el-button>
          <el-button size="small" @click="resetForm">调整主题重试</el-button>
        </div>
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
/**
 * 信息搜集 · 首页
 * @module views/info-collection/InfoCollectionHome
 * @description 项目卡片网格（三态：失败可重试/空态带 CTA/列表）+ 创建弹窗。
 *              旧版两处硬伤修复：加载失败不再伪装成空态；蓝图自检失败给出「进入项目页」
 *              出口（项目已在后端创建，旧版无入口、重填会建重复项目）。
 */
import { reactive, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Collection, Lightning, Mic, Plus, Refresh, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useInfoCollectionStore } from '@/stores/info-collection'
import { relativeTime } from '@/views/info-collection/ic-ui'
import type { IcBlueprintCheckResult } from '@shared/utils/info-collection-blueprint'

const router = useRouter()
const store = useInfoCollectionStore()

const createVisible = ref(false)
const creating = ref(false)
const checkError = ref('')
const lastCheck = ref<IcBlueprintCheckResult | null>(null)
/** 自检未过但已创建的项目 id（死路出口用） */
const pendingProjectId = ref('')
const form = reactive({ goal: '', name: '', mode: 'quick' as 'quick' | 'review' })

onMounted(() => {
  void store.loadProjects()
})

function openCreate(): void {
  resetForm()
  createVisible.value = true
}

function resetForm(): void {
  form.goal = ''
  form.name = ''
  form.mode = 'quick'
  checkError.value = ''
  lastCheck.value = null
  pendingProjectId.value = ''
}

async function doCreate(): Promise<void> {
  if (!form.goal.trim() || creating.value) return
  creating.value = true
  checkError.value = ''
  lastCheck.value = null
  pendingProjectId.value = ''
  try {
    const { project, check, error } = await store.createProject({ goal: form.goal, name: form.name, mode: form.mode })
    if (error || !project) {
      checkError.value = error ?? '创建失败'
      return
    }
    if (check?.ok) {
      ElMessage.success(form.mode === 'quick' ? '蓝图已确认，任务已在后台开跑' : '蓝图已起草，进入项目页确认后开跑')
      createVisible.value = false
      void router.push(`/info-collection/${project.id}`)
    } else {
      // 自检不过：项目已存在，留在弹窗给出口而不是死路
      lastCheck.value = check
      pendingProjectId.value = project.id
      ElMessage.warning('蓝图自检有问题——可调整主题重试，或直接进入项目页')
    }
  } finally {
    creating.value = false
  }
}

function enterPending(): void {
  createVisible.value = false
  void router.push(`/info-collection/${pendingProjectId.value}`)
}

function enter(id: string): void {
  void router.push(`/info-collection/${id}`)
}

// ---- 音频转写设置（M4；settings 表键 ic.transcription） ----
const TRANSCRIBE_KEY = 'ic.transcription'
/** 表单形状（cloud/local 必填，与 IcTranscribeSettings 结构兼容） */
interface TranscribeForm {
  provider: 'off' | 'local' | 'cloud'
  language: string
  cloud: { baseUrl: string; apiKey: string; model: string }
  local: { modelSize: 'tiny' | 'base' | 'small'; mirror: string }
}
const tsVisible = ref(false)
const tsSaving = ref(false)
const ts = reactive<TranscribeForm>({
  provider: 'off',
  language: 'chinese',
  cloud: { baseUrl: '', apiKey: '', model: '' },
  local: { modelSize: 'base', mirror: 'https://hf-mirror.com' },
})

async function openTranscribe(): Promise<void> {
  try {
    const raw = (await window.electronAPI?.settings?.get?.(TRANSCRIBE_KEY)) as Partial<TranscribeForm> | null
    if (raw && typeof raw === 'object') {
      ts.provider = raw.provider ?? 'off'
      ts.language = raw.language ?? 'chinese'
      Object.assign(ts.cloud, raw.cloud ?? {})
      Object.assign(ts.local, raw.local ?? {})
    }
  } catch {
    /* 读不到就用缺省（off） */
  }
  tsVisible.value = true
}

async function saveTranscribe(): Promise<void> {
  tsSaving.value = true
  try {
    await window.electronAPI?.settings?.set?.(TRANSCRIBE_KEY, JSON.parse(JSON.stringify(ts)))
    ElMessage.success('转写设置已保存')
    tsVisible.value = false
  } finally {
    tsSaving.value = false
  }
}
</script>

<style scoped>
.ic-home { padding: 24px 32px; height: 100%; overflow: auto; }
.home-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.home-header h2 { margin: 0 0 6px; }
.home-sub { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; max-width: 640px; }
.home-actions { display: flex; gap: 8px; flex-shrink: 0; }
.ts-hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; margin-top: 6px; }
.state-wrap { margin-top: 60px; }

.topic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; margin-top: 20px; min-height: 120px; }
.topic-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
  background: var(--el-bg-color);
}
.topic-card:hover { box-shadow: var(--el-box-shadow-light); transform: translateY(-2px); }
.card-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.topic-icon { color: var(--el-color-primary); flex-shrink: 0; }
.topic-name { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.topic-goal {
  margin: 10px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 36px;
}
.card-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--el-text-color-secondary); flex-wrap: wrap; }
.meta-count { margin-left: 4px; }
.meta-time { margin-left: auto; }

.mode-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
.mode-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.mode-card.active { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.mode-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.mode-desc { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }

.create-loading { height: 60px; margin-top: 8px; }
.check-block { margin-top: 10px; }
.check-line { font-size: 12px; }
.check-line.warn { color: var(--el-color-warning); }
.deadend-actions { margin-top: 10px; display: flex; gap: 8px; }
</style>
