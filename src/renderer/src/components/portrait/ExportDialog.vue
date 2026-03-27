<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="导出人物形象"
    width="500px"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="导出类型">
        <el-radio-group v-model="form.type">
          <el-radio value="single">单张图片</el-radio>
          <el-radio value="grid">拼接图</el-radio>
          <el-radio value="zip">压缩包</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 选择要导出的变体 -->
      <el-form-item label="选择图片">
        <div class="variant-select">
          <el-checkbox-group v-model="form.selectedVariantIds">
            <div v-for="variant in variants" :key="variant.id" class="variant-option">
              <el-checkbox :value="variant.id">
                {{ ANGLE_LABELS[variant.angle] }} - {{ VARIANT_TYPE_LABELS[variant.type] }}
              </el-checkbox>
            </div>
          </el-checkbox-group>
          <div class="select-actions">
            <el-button size="small" @click="selectAll">全选</el-button>
            <el-button size="small" @click="selectNone">取消全选</el-button>
          </div>
        </div>
      </el-form-item>

      <!-- 拼接布局选项 -->
      <el-form-item v-if="form.type === 'grid'" label="拼接布局">
        <el-radio-group v-model="form.gridLayout">
          <el-radio value="horizontal">横向排列</el-radio>
          <el-radio value="vertical">纵向排列</el-radio>
          <el-radio value="2x2">2x2 网格</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" :disabled="!canSubmit" @click="handleSubmit">
        导出
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ANGLE_LABELS, VARIANT_TYPE_LABELS } from '../../../../shared/types/portrait.types'
import type { PortraitVariant } from '../../../../shared/types/portrait.types'

const props = defineProps<{
  modelValue: boolean
  characterId: string
  variants: PortraitVariant[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: [filePath: string]
}>()

const form = ref({
  type: 'zip' as 'single' | 'grid' | 'zip',
  selectedVariantIds: [] as string[],
  gridLayout: 'horizontal' as 'horizontal' | 'vertical' | '2x2'
})

const loading = ref(false)

const canSubmit = computed(() => {
  return form.value.selectedVariantIds.length > 0
})

function selectAll() {
  form.value.selectedVariantIds = props.variants.map(v => v.id)
}

function selectNone() {
  form.value.selectedVariantIds = []
}

async function handleSubmit() {
  if (!canSubmit.value || !props.characterId) return

  loading.value = true

  try {
    const result = await window.electronAPI.portrait.export({
      characterId: props.characterId,
      variantIds: [...form.value.selectedVariantIds],
      type: form.value.type,
      gridLayout: form.value.gridLayout
    })

    if (result.success && result.data) {
      ElMessage.success(`导出成功：${result.data}`)
      emit('update:modelValue', false)
      emit('success', result.data)
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '导出失败')
  } finally {
    loading.value = false
  }
}

// 重置表单
watch(() => props.modelValue, (val) => {
  if (val && props.variants.length > 0) {
    form.value.type = 'zip'
    form.value.gridLayout = 'horizontal'
    // 默认选中所有图片
    form.value.selectedVariantIds = props.variants.map(v => v.id)
  }
})
</script>

<style lang="scss" scoped>
.variant-select {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px;
}

.variant-option {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.select-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  gap: 8px;
}
</style>