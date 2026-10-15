<template>
  <el-dialog
    :model-value="modelValue"
    title="换背景"
    width="560px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="dlg-body">
      <div class="form-row">
        <div class="form-label">背景类型</div>
        <el-select v-model="backgroundType">
          <el-option label="纯色背景" value="solid" />
          <el-option label="预设场景" value="preset" />
          <el-option label="自定义描述" value="custom" />
          <el-option label="上传背景图" value="image" />
        </el-select>
      </div>

      <div v-if="backgroundType === 'solid'" class="form-row">
        <div class="form-label">背景颜色</div>
        <el-color-picker v-model="backgroundColor" show-alpha />
      </div>

      <div v-if="backgroundType === 'preset'" class="form-row">
        <div class="form-label">预设场景</div>
        <el-select v-model="presetScene">
          <el-option
            v-for="scene in PRESET_BACKGROUNDS"
            :key="scene.id"
            :label="`${scene.icon} ${scene.name}`"
            :value="scene.id"
          />
        </el-select>
      </div>

      <div class="form-row">
        <div class="form-label">背景描述提示词</div>
        <el-input
          v-model="descriptionPrompt"
          type="textarea"
          :rows="2"
          placeholder="如 beach sunset, soft bokeh, warm light..."
        />
      </div>

      <div class="form-row">
        <div class="form-label">背景参考图（可选）</div>
        <ReferenceImagePicker v-model="referenceImages" :max="2" />
      </div>

      <div class="form-row">
        <div class="form-label">输出尺寸</div>
        <SizeSelect v-model="size" :model-sizes="modelSizes" :capabilities="capabilities" />
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" :disabled="!canSubmit" @click="handleSubmit">
        🏞️ 应用换背景
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import SizeSelect from './SizeSelect.vue'
import ReferenceImagePicker from './ReferenceImagePicker.vue'
import { PRESET_BACKGROUNDS } from '../../../../../shared/types/portrait.types'
import type {
  PortraitCharacter,
  PortraitVariant,
  ReferenceImageRole
} from '../../../../../shared/types/portrait.types'
import type { ImageModelCapabilities } from '../../../../../shared/types/image-provider.types'

/**
 * 换背景对话框（spec 2026-07-24 D5b/D8）：
 * 类型（纯色/预设/自定义/上传图）+ 背景描述提示词 + 背景参考图 + 尺寸。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  character: PortraitCharacter
  variant?: PortraitVariant
  modelSizes?: string[]
  capabilities?: ImageModelCapabilities
}>(), {
  variant: undefined,
  modelSizes: () => [],
  capabilities: undefined
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const backgroundType = ref<'solid' | 'preset' | 'custom' | 'image'>('solid')
const backgroundColor = ref('#FFFFFF')
const presetScene = ref('studio')
const descriptionPrompt = ref('')
const referenceImages = ref<{ data: string; role: ReferenceImageRole }[]>([])
const size = ref('768x1024')
const loading = ref(false)

const canSubmit = computed(() => {
  if (backgroundType.value === 'solid') return !!backgroundColor.value
  if (backgroundType.value === 'preset') return !!presetScene.value
  if (backgroundType.value === 'custom') return !!descriptionPrompt.value.trim()
  if (backgroundType.value === 'image') return referenceImages.value.length > 0
  return false
})

watch(() => props.modelValue, (open) => {
  if (!open) return
  descriptionPrompt.value = ''
  referenceImages.value = []
  const cfg = props.variant?.config
  size.value = cfg?.width && cfg?.height ? `${cfg.width}x${cfg.height}` : '768x1024'
})

async function handleSubmit() {
  loading.value = true
  try {
    const [width, height] = size.value.split('x').map(Number)
    // 自定义/上传图时，描述提示词走 customDescription（现有字段）；
    // 补充提示词走 prompt（Task 4b 新参数）
    const result = await window.electronAPI.portrait.changeBackground({
      characterId: props.character.id,
      variantId: props.variant?.id,
      backgroundType: backgroundType.value,
      backgroundColor: backgroundType.value === 'solid' ? backgroundColor.value : undefined,
      presetScene: backgroundType.value === 'preset' ? presetScene.value : undefined,
      customDescription: backgroundType.value === 'custom' ? descriptionPrompt.value.trim() : undefined,
      backgroundImage: backgroundType.value === 'image' ? referenceImages.value[0]?.data : undefined,
      prompt: backgroundType.value !== 'custom' ? (descriptionPrompt.value.trim() || undefined) : undefined,
      referenceImages: toRaw(referenceImages.value).length
        ? toRaw(referenceImages.value).map(r => r.data)
        : undefined,
      angles: ['front'],
      width,
      height
    })

    if (result.success) {
      ElMessage.success('换背景成功')
      emit('update:modelValue', false)
      emit('success')
    } else {
      ElMessage.error(result.error || '换背景失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '换背景失败')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.form-row {
  margin-bottom: var(--spacing-md, 14px);
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 7px;
}
</style>
