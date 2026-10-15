<template>
  <!--
    资产生成详情透明度面板（spec 2026-05-09 ep-redesign · §3.2 A1）

    让用户能看到 asset_image 表已落库但 UI 未暴露的数据：
      - 完整 prompt + negativePrompt（一键复制）
      - 派生关系（derivedFromImageId 反查同 asset 列表）
      - Metadata（angle/time/weather/...）
      - 创建时间 / 尺寸 / is_main 标记

    数据来源：父组件已通过 api.image.listByAsset 拿到完整实体；本组件不发起新 IPC，纯消费传入数据。

    双母语：
      大众用户：缩略图 hover 看到 ⓘ + tooltip "详情"，点开后了解"为什么 AI 这么画"
      专业用户：复制 prompt 字符串到外部工具调试 / 看派生关系排查"主图改了变体没跟"
  -->
  <el-dialog
    v-model="visible"
    title="生成详情"
    width="720px"
    destroy-on-close
    append-to-body
  >
    <div v-if="image" class="detail-body">
      <!-- 大缩略图 -->
      <div class="big-thumb">
        <img :src="resolveImageUrl(image.thumbnailPath || image.imagePath)" :alt="image.label || image.category" />
      </div>

      <!-- 基本信息 -->
      <section class="info-block">
        <h4>基本信息</h4>
        <div class="info-row">
          <span class="info-key">类别</span>
          <code>{{ image.category }}</code>
        </div>
        <div class="info-row">
          <span class="info-key">label</span>
          <span>{{ image.label || '—' }}</span>
        </div>
        <div v-if="image.createdAt" class="info-row">
          <span class="info-key">生成时间</span>
          <span>{{ formatTime(image.createdAt) }}</span>
        </div>
        <div v-if="image.width && image.height" class="info-row">
          <span class="info-key">尺寸</span>
          <span>{{ image.width }}×{{ image.height }}</span>
        </div>
        <div class="info-row">
          <span class="info-key">is_main</span>
          <el-tag v-if="image.isMain === 1" type="warning" size="small">默认主图</el-tag>
          <span v-else class="muted">否</span>
        </div>
      </section>

      <!-- Prompt -->
      <section class="prompt-block">
        <header>
          <h4>Prompt（{{ image.prompt?.length || 0 }} 字符）</h4>
          <el-button size="small" text :disabled="!image.prompt" @click="copy(image.prompt, 'Prompt')">
            📋 复制
          </el-button>
        </header>
        <pre class="prompt-text">{{ image.prompt || '（无 / 旧数据未落库）' }}</pre>
      </section>

      <!-- Negative Prompt -->
      <section class="prompt-block">
        <header>
          <h4>Negative Prompt（{{ image.negativePrompt?.length || 0 }} 字符）</h4>
          <el-button size="small" text :disabled="!image.negativePrompt" @click="copy(image.negativePrompt, 'Negative')">
            📋 复制
          </el-button>
        </header>
        <pre class="prompt-text negative">{{ image.negativePrompt || '（无）' }}</pre>
      </section>

      <!-- 派生关系 -->
      <section v-if="derivedFromImage" class="derived-block">
        <h4>派生自</h4>
        <div class="derived-row">
          <img
            :src="resolveImageUrl(derivedFromImage.thumbnailPath || derivedFromImage.imagePath)"
            class="thumb-64"
            :alt="derivedFromImage.label || derivedFromImage.category"
          />
          <div class="derived-meta">
            <div class="derived-label">{{ derivedFromImage.label || (derivedFromImage.isMain === 1 ? '默认主图' : derivedFromImage.category) }}</div>
            <code class="derived-id">{{ derivedFromImage.id }}</code>
          </div>
        </div>
      </section>

      <!-- Metadata -->
      <section v-if="metadataTags.length > 0" class="metadata-block">
        <h4>Metadata</h4>
        <div class="metadata-tags">
          <el-tag
            v-for="(tag, idx) in metadataTags"
            :key="idx"
            type="info"
            effect="light"
            size="small"
          >
            {{ tag.key }}: {{ tag.value }}
          </el-tag>
        </div>
      </section>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

/**
 * 完整字段集合（asset_image 表实体，含 prompt/negativePrompt/metadata/...）。
 * 父组件传入；可选字段缺省时本组件优雅降级（不展示对应 section）。
 */
export interface DetailImage {
  id: string
  category: string
  label: string | null
  imagePath: string
  thumbnailPath?: string | null
  isMain: number
  prompt?: string | null
  negativePrompt?: string | null
  metadata?: string | Record<string, unknown> | null
  derivedFromImageId?: string | null
  width?: number | null
  height?: number | null
  createdAt?: string | number | Date | null
}

const props = defineProps<{
  modelValue: boolean
  image: DetailImage | null
  /** 同 asset 全部图，用于查 derivedFromImage（节省 IPC） */
  allImages?: DetailImage[]
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const derivedFromImage = computed<DetailImage | null>(() => {
  if (!props.image?.derivedFromImageId) return null
  return props.allImages?.find((i) => i.id === props.image!.derivedFromImageId) ?? null
})

const metadataTags = computed<Array<{ key: string; value: string }>>(() => {
  const raw = props.image?.metadata
  if (!raw) return []
  let obj: Record<string, unknown> | null = null
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed
      }
    } catch {
      return []
    }
  }
  if (!obj) return []
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => ({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }))
})

function formatTime(t: string | number | Date): string {
  try {
    return new Date(t).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return String(t)
  }
}

function resolveImageUrl(path: string | null | undefined): string {
  return path ? toImageUrl(path) : ''
}

async function copy(text: string | null | undefined, label: string): Promise<void> {
  if (!text) {
    ElMessage.warning(`${label} 为空，无可复制`)
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${label} 已复制`)
  } catch {
    ElMessage.error('复制失败（浏览器权限）')
  }
}
</script>

<style scoped>
.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.big-thumb img {
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.info-block,
.prompt-block,
.derived-block,
.metadata-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-block h4,
.prompt-block h4,
.derived-block h4,
.metadata-block h4 {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-secondary);
}

.info-row {
  display: flex;
  gap: 12px;
  font-size: 13px;
  align-items: center;
}

.info-key {
  width: 80px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.muted {
  color: var(--el-text-color-placeholder);
}

.prompt-block header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.prompt-text {
  background: var(--el-fill-color-lighter);
  padding: 8px 10px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
  margin: 0;
  line-height: 1.6;
}

.prompt-text.negative {
  background: var(--el-color-danger-light-9);
}

.derived-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.thumb-64 {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
}

.derived-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.derived-label {
  font-size: 13px;
}

.derived-id {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.metadata-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
