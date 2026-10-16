<template>
  <!--
    PresetDigitalHumanDialog · 内置数字人选择对话框
    （spec 2026-05-09 ep-redesign §3.2 D3 · P-8）

    用户在 ② 资产 stage 角色 section 点「🎭 内置形象」时弹出。
    列出 12 个 preset，按性别筛选；点击某个 preset → useToProject IPC →
    在当前项目下创建用户自己的 binding（拷设定 + 拷形象组）。
  -->
  <el-dialog
    v-model="visible"
    title="🎭 选择内置形象"
    width="720px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <div class="preset-toolbar">
      <span class="toolbar-hint">
        从内置数字人池中挑一个形象引用到当前项目，自动拷贝设定与形象组。
      </span>
      <el-select v-model="genderFilter" size="small" style="width: 120px" placeholder="性别">
        <el-option label="全部" value="" />
        <el-option label="男" value="男" />
        <el-option label="女" value="女" />
      </el-select>
    </div>

    <div v-loading="loading" class="preset-grid">
      <article
        v-for="p in filteredPresets"
        :key="p.id"
        class="preset-card"
        :class="{ active: selectedId === p.id, busy: usingId === p.id }"
        @click="selectedId = p.id"
      >
        <div class="card-thumb">
          <img
            v-if="mainImageMap[p.id]"
            :src="mainImageMap[p.id]"
            :alt="getName(p)"
            class="thumb-image"
          />
          <div v-else class="thumb-emoji">{{ p.gender === '女' ? '👩' : '👨' }}</div>
        </div>
        <div class="card-body">
          <div class="card-title">{{ getName(p) }}</div>
          <div class="card-meta">
            <span v-if="p.gender">{{ p.gender }}</span>
            <span v-if="p.age" class="meta-sep">· {{ p.age }} 岁</span>
            <span v-if="p.role" class="meta-sep">· {{ p.role }}</span>
          </div>
          <div v-if="p.standaloneDescription" class="card-desc">
            {{ truncate(p.standaloneDescription, 60) }}
          </div>
        </div>
      </article>
      <el-empty
        v-if="!loading && filteredPresets.length === 0"
        description="数字人池为空 — 请先 seed preset 数据"
        :image-size="80"
      />
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="!!usingId"
        :disabled="!selectedId"
        @click="onConfirm"
      >
        引用到当前项目
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

interface PresetBinding {
  id: string
  standaloneName: string | null
  alias: string | null
  role: string | null
  gender: string | null
  age: number | null
  standaloneDescription: string | null
  baseDescription: string | null
}

const props = defineProps<{
  modelValue: boolean
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'imported', payload: { bindingId: string }): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const presets = ref<PresetBinding[]>([])
const mainImageMap = ref<Record<string, string>>({})
const genderFilter = ref('')
const selectedId = ref<string | null>(null)
const usingId = ref<string | null>(null)

const filteredPresets = computed(() => {
  if (!genderFilter.value) return presets.value
  return presets.value.filter((p) => p.gender === genderFilter.value)
})

function getName(p: PresetBinding): string {
  return p.standaloneName ?? p.alias ?? '未命名形象'
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '...'
}

async function onOpen(): Promise<void> {
  selectedId.value = null
  usingId.value = null
  await reload()
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset?.preset
    if (!api?.list) {
      ElMessage.error('内置形象 IPC 未暴露')
      return
    }
    const resp = await api.list({})
    if (!resp?.success) {
      ElMessage.error(resp?.error || '加载内置形象失败')
      return
    }
    presets.value = (resp.data ?? []) as PresetBinding[]
    await loadMainImages()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载内置形象失败')
  } finally {
    loading.value = false
  }
}

/** 给 preset 拉 main 图（asset_image 表 isMain=1）— 直接复用 ensureMainImage（按需懒生成） */
async function loadMainImages(): Promise<void> {
  const api = (window as any).electronAPI?.episodeProduction?.asset?.preset
  for (const p of presets.value) {
    try {
      const r = await api.ensureMainImage({ presetId: p.id })
      if (r?.success && r.data?.imagePath) {
        mainImageMap.value[p.id] = toImageUrl(r.data.imagePath) ?? ''
      }
    } catch {
      // 图加载失败用 emoji 占位
    }
  }
}

async function onConfirm(): Promise<void> {
  if (!selectedId.value) return
  const api = (window as any).electronAPI?.episodeProduction?.asset?.preset
  if (!api?.useToProject) {
    ElMessage.error('「引用到项目」IPC 未暴露')
    return
  }
  usingId.value = selectedId.value
  try {
    const resp = await api.useToProject({
      presetId: selectedId.value,
      targetProjectId: props.projectId,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '引用失败')
      return
    }
    ElMessage.success('已引用到项目')
    emit('imported', { bindingId: resp.data.bindingId })
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '引用失败')
  } finally {
    usingId.value = null
  }
}

watch(() => props.modelValue, (v) => {
  if (!v) selectedId.value = null
})
</script>

<style scoped lang="scss">
.preset-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.toolbar-hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  min-height: 240px;
  max-height: 520px;
  overflow-y: auto;
  padding: 4px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.15s;
}
.preset-card:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-1px);
}
.preset-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}
.preset-card.busy {
  opacity: 0.5;
  pointer-events: none;
}

.card-thumb {
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--el-color-primary-light-7), var(--el-color-primary-light-5));
}
.thumb-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.thumb-emoji {
  font-size: 56px;
}

.card-body {
  padding: 8px 10px;
}
.card-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.card-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.card-meta .meta-sep {
  margin-left: 4px;
}
.card-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}
</style>
