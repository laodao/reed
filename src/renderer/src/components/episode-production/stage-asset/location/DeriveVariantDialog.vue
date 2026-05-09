<template>
  <!--
    地点派生变体 Dialog（spec 2026-05-09）

    - 基主图：单选 radio，列出全部 main，缩略图 + label
    - label：自由文本（"雨夜外观" / "黄昏入口"）
    - 描述：附加 user direction 到 prompt
    - metadata（可选）：angle / time / weather 让评分系统命中场景维度
    - 点"生成" → 单次出 1 张
  -->
  <el-dialog
    v-model="visible"
    title="派生变体"
    width="640px"
    destroy-on-close
    append-to-body
    @close="reset"
  >
    <div v-if="mainImages.length === 0" class="empty-hint">
      该地点还没有主图，请先添加至少一张主图后再派生变体
    </div>
    <el-form v-else label-position="top" @submit.prevent>
      <el-form-item label="基主图（必选）">
        <el-radio-group v-model="form.baseImageId" class="base-radio-group">
          <el-radio
            v-for="img in mainImages"
            :key="img.id"
            :value="img.id"
            class="base-radio"
          >
            <span class="base-radio-inner">
              <img
                v-if="img.imagePath"
                :src="toImageUrl(img.thumbnailPath || img.imagePath)"
                :alt="img.label || 'main'"
                class="base-thumb"
              />
              <span class="base-meta">
                <span class="base-name">{{ img.label || '默认主图' }}</span>
                <span v-if="img.isMain === 1" class="base-default-tag">默认</span>
              </span>
            </span>
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="变体名称（必填）">
        <el-input
          v-model="form.label"
          placeholder="如：雨夜外观 / 黄昏入口 / 白天平视 / 自定义"
          :maxlength="80"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="附加描述（可选）">
        <el-input
          v-model="form.userPrompt"
          type="textarea"
          :rows="3"
          placeholder="例如：雨水打在屋檐 / 黄昏暖色调 / 远景打光柔和"
          :maxlength="500"
          show-word-limit
          resize="none"
        />
      </el-form-item>

      <el-form-item label="评分维度 metadata（可选）">
        <div class="meta-row">
          <span class="meta-label">视角 (angle)</span>
          <el-input v-model="form.metaAngle" placeholder="entrance / wide_shot / interior_a ..." />
        </div>
        <div class="meta-row">
          <span class="meta-label">时间 (time)</span>
          <el-input v-model="form.metaTime" placeholder="morning / night / dusk ..." />
        </div>
        <div class="meta-row">
          <span class="meta-label">天气 (weather)</span>
          <el-input v-model="form.metaWeather" placeholder="rainy / sunny / snowy ..." />
        </div>
        <div class="dialog-hint">
          填好维度让该变体被对应分镜命中（评分：angle +4 / time +2 / weather +1）
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="onSubmit"
      >
        ✨ 生成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

interface AssetImageRow {
  id: string
  category: string
  label: string | null
  imagePath: string
  thumbnailPath?: string | null
  isMain: number
}

const props = defineProps<{
  modelValue: boolean
  assetType: 'character' | 'location' | 'item'
  bindingId: string
  /** 当前所有图（含主图 + 变体），父组件传入；本组件从中筛 main */
  allImages: AssetImageRow[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'submitted': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

/** 候选基图：所有 category='main' 的行（含 isMain=0/1） */
const mainImages = computed<AssetImageRow[]>(() =>
  props.allImages.filter((i) => i.category === 'main'),
)

const form = reactive({
  baseImageId: '',
  label: '',
  userPrompt: '',
  metaAngle: '',
  metaTime: '',
  metaWeather: '',
})

const submitting = ref(false)

watch(visible, (v) => {
  if (v) reset()
})

function reset(): void {
  form.baseImageId = mainImages.value[0]?.id ?? ''
  form.label = ''
  form.userPrompt = ''
  form.metaAngle = ''
  form.metaTime = ''
  form.metaWeather = ''
  submitting.value = false
}

const canSubmit = computed(
  () => !!form.baseImageId && form.label.trim().length > 0,
)

function buildMetadata(): Record<string, string> | undefined {
  const meta: Record<string, string> = {}
  if (form.metaAngle.trim()) meta.angle = form.metaAngle.trim()
  if (form.metaTime.trim()) meta.time = form.metaTime.trim()
  if (form.metaWeather.trim()) meta.weather = form.metaWeather.trim()
  return Object.keys(meta).length > 0 ? meta : undefined
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.derive?.single) {
      ElMessage.error('derive.single IPC 未暴露')
      return
    }
    const resp = await api.derive.single({
      assetType: props.assetType,
      assetId: props.bindingId,
      category: 'variant',
      label: form.label.trim(),
      additionalPrompt: form.userPrompt.trim() || undefined,
      baseImageId: form.baseImageId,
      metadata: buildMetadata(),
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '派生失败')
      return
    }
    ElMessage.success(`变体已生成：${form.label}`)
    emit('submitted')
    visible.value = false
  } catch (e: any) {
    ElMessage.error('派生失败：' + (e?.message ?? '未知错误'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.empty-hint {
  text-align: center;
  padding: 30px 0;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.base-radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.base-radio {
  display: inline-flex !important;
  align-items: center;
  margin: 0 !important;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
}

.base-radio :deep(.el-radio__label) {
  padding-left: 6px;
}

.base-radio-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.base-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--el-fill-color);
}

.base-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.base-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.base-default-tag {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  width: fit-content;
}

.dialog-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.meta-label {
  flex: 0 0 100px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
