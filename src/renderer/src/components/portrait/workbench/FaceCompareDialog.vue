<template>
  <el-dialog
    :model-value="modelValue"
    title="面部修改结果对比"
    width="760px"
    :close-on-click-modal="false"
    :show-close="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="compare-body">
      <div class="compare-cell">
        <div class="cell-label">原图</div>
        <el-image :src="originalSrc" fit="contain" class="cell-img" />
      </div>
      <div class="compare-arrow">→</div>
      <div class="compare-cell">
        <div class="cell-label">新图（修改后）</div>
        <el-image :src="newImageSrc" fit="contain" class="cell-img" />
      </div>
    </div>
    <div class="compare-tip">
      原图始终保留。选择「保留新图」则新图入库为面部变体；选择「放弃新图」则新图删除，不影响原图。
    </div>
    <template #footer>
      <el-button type="danger" plain :loading="discarding" @click="handleDiscard">
        放弃新图
      </el-button>
      <el-button type="primary" @click="handleKeep">
        保留新图
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { toImageUrl } from '@/utils/asset-url'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { PortraitVariant } from '../../../../../shared/types/portrait.types'

/**
 * 面部修改前后对比确认对话框：
 * 同时展示原图与新图，用户确认后才保留新图；放弃则删除新 variant（原图始终不动）。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  originalSrc: string
  newVariant: PortraitVariant | null
}>(), {
  newVariant: null
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  keep: []
  discarded: []
}>()

const discarding = ref(false)

// 新图地址：service 返回相对路径（images/...），转渲染端 asset URL
const newImageSrc = computed(() => {
  // 评审 #92：走 toImageUrl 归一化（Web 端手写 local-image:// 会裂图）
  return toImageUrl(props.newVariant?.imagePath)
})

async function handleDiscard() {
  if (!props.newVariant) {
    emit('update:modelValue', false)
    return
  }
  discarding.value = true
  try {
    const result = await window.electronAPI.portrait.deleteVariant(props.newVariant.id)
    if (result.success) {
      ElMessage.info('已放弃新图，原图未受影响')
      emit('update:modelValue', false)
      emit('discarded')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '删除失败')
  } finally {
    discarding.value = false
  }
}

function handleKeep() {
  emit('update:modelValue', false)
  emit('keep')
}
</script>

<style lang="scss" scoped>
.compare-body {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 14px;
  align-items: center;
}

.compare-arrow {
  font-size: 22px;
  color: var(--text-placeholder);
}

.cell-label {
  font-size: 12.5px;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 8px;
  font-weight: 500;
}

.cell-img {
  width: 100%;
  height: 380px;
  background: var(--fill-color-light);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color-lighter);
}

.compare-tip {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--fill-color-light);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}
</style>
