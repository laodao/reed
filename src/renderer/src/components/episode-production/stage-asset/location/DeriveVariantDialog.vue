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
      <el-form-item :label="`基主图（多选 · 已选 ${form.baseImageIds.length} / 上限 ${maxBaseImages}）`">
        <!-- spec 2026-05-09 ep-redesign §3.2 B6 多基图：el-radio-group → el-checkbox-group -->
        <el-checkbox-group
          v-model="form.baseImageIds"
          :max="maxBaseImages"
          class="base-radio-group"
        >
          <el-checkbox
            v-for="img in mainImages"
            :key="img.id"
            :value="img.id"
            class="base-radio"
            border
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
          </el-checkbox>
        </el-checkbox-group>
        <div class="multi-ref-hint">
          多张参考能提升一致性。当前 provider 上限：{{ maxBaseImages }} 张（万相 1-4 / Seedream 多张 / 可灵 element_list）。
        </div>
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
import { useEpEpisodeStore } from '@/stores/episode-production'

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
  /**
   * spec 2026-05-09 ep-redesign §3.2 B6 多基图：
   * 用 baseImageIds[] 替代 baseImageId 单值。打开时默认勾选默认主图（isMain=1）。
   */
  baseImageIds: [] as string[],
  label: '',
  userPrompt: '',
  metaAngle: '',
  metaTime: '',
  metaWeather: '',
})

const submitting = ref(false)

/**
 * provider 多 ref 上限：当前写死 4（万相极限）。
 * Phase 3 加 capability 探测后可改为读 image provider capabilities.maxRefImages 动态。
 */
const maxBaseImages = 4

watch(visible, (v) => {
  if (v) reset()
})

function reset(): void {
  // 默认勾选默认主图（isMain=1）；没有则取第一张
  const defaultMain = mainImages.value.find((i) => i.isMain === 1) ?? mainImages.value[0]
  form.baseImageIds = defaultMain ? [defaultMain.id] : []
  form.label = ''
  form.userPrompt = ''
  form.metaAngle = ''
  form.metaTime = ''
  form.metaWeather = ''
  submitting.value = false
}

const canSubmit = computed(
  () => form.baseImageIds.length > 0 && form.label.trim().length > 0,
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
    // 透传当前 episode 故事背景，让派生 prompt 也带年代/地域信息（spec 2026-05-09 review）
    let storyBackground: { era: string; region: string; extra: string } | null = null
    try {
      const ep: any = useEpEpisodeStore()?.currentEpisode
      if (ep) {
        storyBackground = {
          era: (ep.storyEra ?? '').toString().trim(),
          region: (ep.storyRegion ?? '').toString().trim(),
          extra: (ep.storyBackgroundExtra ?? '').toString().trim(),
        }
      }
    } catch {
      /* store 未就绪不致命 */
    }

    const resp = await api.derive.single({
      assetType: props.assetType,
      assetId: props.bindingId,
      category: 'variant',
      label: form.label.trim(),
      additionalPrompt: form.userPrompt.trim() || undefined,
      baseImageIds: form.baseImageIds,
      metadata: buildMetadata(),
      storyBackground,
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

.base-radio :deep(.el-radio__label),
.base-radio :deep(.el-checkbox__label) {
  padding-left: 6px;
}

.multi-ref-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
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
