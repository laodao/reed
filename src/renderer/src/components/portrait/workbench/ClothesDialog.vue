<template>
  <el-dialog
    :model-value="modelValue"
    title="换衣"
    width="560px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="dlg-body">
      <div class="form-row">
        <div class="form-label">服装描述</div>
        <el-input
          v-model="clothesDescription"
          type="textarea"
          :rows="2"
          placeholder="如：red suit, white shirt, black tie"
        />
      </div>
      <div class="form-row">
        <div class="form-label">补充提示词（可选）</div>
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="2"
          placeholder="如 overall style, fabric texture, slim fit..."
        />
      </div>
      <div class="form-row">
        <div class="form-label">服装参考图（可选）</div>
        <ReferenceImagePicker v-model="referenceImages" :max="3" />
      </div>
      <div class="form-row">
        <div class="form-label">输出尺寸</div>
        <SizeSelect v-model="size" :model-sizes="modelSizes" />
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="!clothesDescription.trim()"
        @click="handleSubmit"
      >
        👔 应用换衣
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import SizeSelect from './SizeSelect.vue'
import ReferenceImagePicker from './ReferenceImagePicker.vue'
import type {
  PortraitCharacter,
  PortraitVariant,
  ReferenceImageRole
} from '../../../../../shared/types/portrait.types'

/**
 * 换衣对话框（spec 2026-07-24 D5b/D8）：
 * 服装描述 + 补充提示词 + 服装参考图（多张）+ 尺寸。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  character: PortraitCharacter
  variant?: PortraitVariant
  modelSizes?: string[]
}>(), {
  variant: undefined,
  modelSizes: () => []
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const clothesDescription = ref('')
const prompt = ref('')
const referenceImages = ref<{ data: string; role: ReferenceImageRole }[]>([])
const size = ref('768x1024')
const loading = ref(false)

watch(() => props.modelValue, (open) => {
  if (!open) return
  clothesDescription.value = ''
  prompt.value = ''
  referenceImages.value = []
  const cfg = props.variant?.config
  size.value = cfg?.width && cfg?.height ? `${cfg.width}x${cfg.height}` : '768x1024'
})

async function handleSubmit() {
  if (!clothesDescription.value.trim()) return
  loading.value = true
  try {
    const [width, height] = size.value.split('x').map(Number)
    const result = await window.electronAPI.portrait.changeClothes({
      characterId: props.character.id,
      variantId: props.variant?.id,
      clothesDescription: clothesDescription.value.trim(),
      prompt: prompt.value.trim() || undefined,
      referenceImages: toRaw(referenceImages.value).length
        ? toRaw(referenceImages.value).map(r => r.data)
        : undefined,
      angles: ['front'],
      width,
      height
    })

    if (result.success) {
      ElMessage.success('换衣成功')
      emit('update:modelValue', false)
      emit('success')
    } else {
      ElMessage.error(result.error || '换衣失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '换衣失败')
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
