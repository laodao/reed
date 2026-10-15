<template>
  <el-dialog
    v-model="visible"
    title="画面预览"
    width="90%"
    top="5vh"
    class="image-preview-dialog"
    destroy-on-close
  >
    <div class="preview-container">
      <img :src="imageUrl" alt="预览图片" class="preview-image" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: boolean
  imageUrl: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})
</script>

<style scoped lang="scss">
.image-preview-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }
}

.preview-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  max-height: 80vh;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.preview-image {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
}
</style>
