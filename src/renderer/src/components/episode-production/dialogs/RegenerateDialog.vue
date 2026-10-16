<template>
  <el-dialog
    v-model="visible"
    title="重新生成画面"
    width="500px"
  >
    <el-form label-width="80px">
      <el-form-item label="镜头">
        镜头 {{ storyboard?.shotNumber }}
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
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSubmit">开始生成</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { Storyboard } from '../../../../shared/types/story-to-video.types'

const props = defineProps<{
  modelValue: boolean
  storyboard: Storyboard | null
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'submit': [styleName: string, additionalPrompt: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const form = reactive({
  styleName: 'cinematic',
  additionalPrompt: ''
})

// 每次打开时重置表单
watch(() => props.modelValue, (val) => {
  if (val) {
    form.styleName = 'cinematic'
    form.additionalPrompt = ''
  }
})

function handleSubmit() {
  emit('submit', form.styleName, form.additionalPrompt)
}
</script>
