<template>
  <el-dialog
    v-model="visible"
    title="生成分镜画面"
    width="500px"
  >
    <el-form :model="form" label-width="80px">
      <el-form-item label="选中分镜">
        <div v-if="storyboard" class="selected-storyboard-info">
          <span class="shot-label">镜头 {{ storyboard.shotNumber }}</span>
          <span class="shot-type">{{ storyboard.shotType }}</span>
          <el-tag v-if="storyboard.frameImage" type="success" size="small">已有画面</el-tag>
          <el-tag v-else type="info" size="small">待生成</el-tag>
        </div>
        <div v-else class="no-selection-hint">请先选择一个分镜</div>
      </el-form-item>
      <el-form-item label="图像风格">
        <el-select v-model="form.styleName" style="width: 100%">
          <el-option label="电影风格" value="cinematic" />
          <el-option label="动漫风格" value="anime" />
          <el-option label="写实风格" value="realistic" />
          <el-option label="奇幻风格" value="fantasy" />
          <el-option label="古风仙侠" value="ancient_chinese" />
        </el-select>
      </el-form-item>
      <el-form-item label="画面描述">
        <div class="frame-description-preview">
          {{ storyboard?.frameDescription || '暂无描述' }}
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="generating"
        @click="handleSubmit"
      >
        开始生成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Storyboard } from '../../../../shared/types/story-to-video.types'

const props = defineProps<{
  modelValue: boolean
  storyboard: Storyboard | null
  generating?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'submit': [styleName: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const form = reactive({
  styleName: 'cinematic'
})

function handleSubmit() {
  emit('submit', form.styleName)
}
</script>

<style scoped lang="scss">
.selected-storyboard-info {
  display: flex;
  align-items: center;
  gap: 8px;

  .shot-label {
    font-weight: 500;
  }

  .shot-type {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
}

.no-selection-hint {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.frame-description-preview {
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  width: 100%;
  box-sizing: border-box;
}
</style>
