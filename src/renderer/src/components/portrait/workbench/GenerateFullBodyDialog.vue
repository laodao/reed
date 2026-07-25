<template>
  <el-dialog
    :model-value="modelValue"
    title="生成全身像"
    width="560px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="dlg-body">
      <div class="source-hint">
        🔗 以当前<strong>半身像</strong>为参考，保持面部一致，扩展为全身。
      </div>

      <div class="form-row">
        <div class="form-label">全身构图提示词</div>
        <el-input v-model="prompt" type="textarea" :rows="3" />
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
            category="body"
            scene="generate"
            :character="character"
            @replace="content => prompt = content"
            @append="content => prompt = prompt ? prompt + ', ' + content : content"
          />
        </div>
      </div>

      <div class="form-row">
        <div class="form-label">追加参考图（可选；当前半身自动置首）</div>
        <ReferenceImagePicker v-model="extraRefs" :max="3" upload-text="追加" />
      </div>

      <div class="consistency-note">
        🎯 面容一致性由「半身参考图 + 一致性提示词」驱动保障
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="generating" @click="handleGenerate">
        ⬇ 生成全身像
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
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
 * 生成全身像对话框（spec 2026-07-24 D3）：
 * 以源半身 variant 为首参考（service 自动置首），保面部一致扩展全身。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  character: PortraitCharacter
  sourceVariant: PortraitVariant
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

const DEFAULT_PROMPT = 'same person as reference, natural relaxed posture, consistent face and hairstyle'

const prompt = ref(DEFAULT_PROMPT)
const size = ref('1024x1792')
const extraRefs = ref<{ data: string; role: ReferenceImageRole }[]>([])
const generating = ref(false)

const pickerRef = ref<ComponentPublicInstance<{ reload: () => Promise<void> }> | null>(null)

watch(() => props.modelValue, (open) => {
  if (!open) return
  // plan B5：对话框每次打开重载模板列表（模板库可能刚编辑过）
  pickerRef.value?.reload()
  prompt.value = DEFAULT_PROMPT
  extraRefs.value = []
  // 全身优先竖版大画布
  size.value = '1024x1792'
})

async function handleGenerate() {
  generating.value = true
  try {
    const [width, height] = size.value.split('x').map(Number)
    // design D1：strength 三家官方均不支持，UI 不提供（service 用默认 0.55）
    const result = await window.electronAPI.portrait.generateFullBody({
      characterId: props.character.id,
      sourceVariantId: props.sourceVariant.id,
      prompt: prompt.value.trim() || undefined,
      referenceImages: toRaw(extraRefs.value).length
        ? toRaw(extraRefs.value).map(r => r.data)
        : undefined,
      width,
      height
    })

    if (result.success) {
      ElMessage.success('全身像生成成功')
      emit('update:modelValue', false)
      emit('success')
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generating.value = false
  }
}
</script>

<style lang="scss" scoped>
.source-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  background: var(--color-primary-light-9);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  color: var(--text-regular);
  margin-bottom: var(--spacing-md, 16px);

  strong {
    color: var(--color-primary);
  }
}

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

.consistency-note {
  font-size: 12px;
  color: var(--color-purple);
  padding: 8px 12px;
  background: var(--color-purple-light-9);
  border-radius: var(--radius-sm);
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
