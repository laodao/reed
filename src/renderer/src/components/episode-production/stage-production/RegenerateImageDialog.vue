<template>
  <el-dialog :model-value="modelValue" title="重新生成画面" width="500px" @update:model-value="emit('update:modelValue', $event)">
    <el-form label-width="80px">
      <el-form-item label="镜头">
        镜头 {{ shotNumber }}
      </el-form-item>
      <el-form-item label="风格">
        <el-select v-model="form.styleName" style="width: 100%">
          <el-option label="电影风格" value="cinematic" />
          <el-option label="动漫风格" value="anime" />
          <el-option label="写实风格" value="realistic" />
          <el-option label="奇幻风格" value="fantasy" />
          <el-option label="古风仙侠" value="ancient_chinese" />
        </el-select>
      </el-form-item>
      <el-form-item label="附加提示">
        <el-input
          v-model="form.additionalPrompt"
          type="textarea"
          :rows="3"
          placeholder="输入额外的画面描述，如：更暗的光线、增加细节等"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="onConfirm" :loading="loading">开始生成</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

// ==================== Props ====================
const props = defineProps<{
  /** 对话框显示/隐藏 */
  modelValue: boolean
  /** 当前操作的镜头号 */
  shotNumber: number | undefined
  /** 生成中标志 */
  loading: boolean
}>()

// ==================== Emits ====================
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 确认生成，携带风格和附加提示 */
  (e: 'confirm', styleName: string, additionalPrompt: string): void
}>()

// ==================== 表单状态 ====================
const form = reactive({
  styleName: 'cinematic',
  additionalPrompt: ''
})

// 对话框打开时重置表单
watch(() => props.modelValue, (val) => {
  if (val) {
    form.styleName = 'cinematic'
    form.additionalPrompt = ''
  }
})

function onConfirm() {
  emit('confirm', form.styleName, form.additionalPrompt)
}
</script>
