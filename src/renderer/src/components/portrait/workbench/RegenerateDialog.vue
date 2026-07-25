<template>
  <el-dialog
    :model-value="modelValue"
    title="重新生成"
    width="560px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="dlg-body">
      <div class="form-row">
        <div class="form-label">提示词</div>
        <el-input v-model="prompt" type="textarea" :rows="3" />
      </div>
      <div class="form-row">
        <div class="form-label">反向提示词</div>
        <el-input v-model="negativePrompt" type="textarea" :rows="1" placeholder="可选" />
      </div>
      <div class="form-grid">
        <div class="form-row">
          <div class="form-label">输出尺寸</div>
          <SizeSelect v-model="size" :model-sizes="modelSizes" :capabilities="capabilities" />
        </div>
        <div class="form-row">
          <div class="form-label">提示词模板</div>
          <TemplatePicker
            ref="pickerRef"
            scene="regenerate"
            :character="character"
            @replace="content => prompt = content"
            @append="content => prompt = prompt ? prompt + ', ' + content : content"
          />
        </div>
      </div>
      <div class="form-row">
        <div class="form-label">参考图片（可选，追加参考辅助生成）</div>
        <ReferenceImagePicker v-model="referenceImages" :max="4" upload-text="追加" />
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="regenerating" @click="handleRegenerate">
        🔄 重新生成（替换当前）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import SizeSelect from './SizeSelect.vue'
import TemplatePicker from './TemplatePicker.vue'
import type { ComponentPublicInstance } from 'vue'
import ReferenceImagePicker from './ReferenceImagePicker.vue'
import type {
  PortraitCharacter,
  PortraitVariant,
  ReferenceImageRole
} from '../../../../../shared/types/portrait.types'
import type { ImageModelCapabilities } from '../../../../../shared/types/image-provider.types'

/**
 * 重新生成对话框（spec 2026-07-24 D8）：
 * 默认带当前形象为参考；强度 1.0=完全重画，<1.0=微调。确认后替换当前 variant。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  character: PortraitCharacter
  variant: PortraitVariant
  modelSizes?: string[]
  capabilities?: ImageModelCapabilities
}>(), {
  modelSizes: () => [],
  capabilities: undefined
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const prompt = ref('')
const negativePrompt = ref('')
const size = ref('768x1024')
const referenceImages = ref<{ data: string; role: ReferenceImageRole }[]>([])
const regenerating = ref(false)

// 打开时初始化：沿用当前形象参数
const pickerRef = ref<ComponentPublicInstance<{ reload: () => Promise<void> }> | null>(null)

watch(() => props.modelValue, (open) => {
  if (!open) return
  // plan B5：对话框每次打开重载模板列表（模板库可能刚编辑过）
  pickerRef.value?.reload()
  prompt.value = props.character.prompt || props.variant.prompt || ''
  negativePrompt.value = ''
  const cfg = props.variant.config
  size.value = cfg?.width && cfg?.height ? `${cfg.width}x${cfg.height}` : '768x1024'
  referenceImages.value = []
})

async function handleRegenerate() {
  try {
    await ElMessageBox.confirm('确定要重新生成吗？当前形象将被替换。', '确认', { type: 'warning' })
  } catch {
    return
  }

  regenerating.value = true
  try {
    // 删除当前形象
    await window.electronAPI.portrait.deleteVariant(props.variant.id)

    const [width, height] = size.value.split('x').map(Number)
    const result = await window.electronAPI.portrait.generate({
      characterId: props.character.id,
      prompt: prompt.value,
      negativePrompt: negativePrompt.value || undefined,
      referenceImages: toRaw(referenceImages.value).map(r => r.data),
      providerId: props.character.providerId!,
      modelId: props.character.modelId!,
      framing: props.variant.framing ?? 'full',
      config: {
        angles: ['front'],
        backgroundType: 'solid',
        width,
        height
      }
    })

    if (result.success) {
      ElMessage.success('重新生成成功')
      emit('update:modelValue', false)
      emit('success')
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    regenerating.value = false
  }
}
</script>

<style lang="scss" scoped>
.form-row {
  margin-bottom: var(--spacing-md, 14px);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md, 14px);
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 7px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;

  .lbl {
    font-size: 12.5px;
    color: var(--text-secondary);
    width: 76px;
    flex-shrink: 0;
  }

  .el-slider {
    flex: 1;
  }

  .val {
    font-size: 12.5px;
    color: var(--color-primary);
    font-weight: 600;
    width: 40px;
    text-align: right;
  }
}
</style>
