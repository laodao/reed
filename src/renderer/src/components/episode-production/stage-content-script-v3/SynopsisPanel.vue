<template>
  <section class="synopsis-panel">
    <header class="panel-header">
      <span class="panel-title">章节梗概</span>
      <el-button
        v-if="!readonly"
        size="small"
        class="btn-regen"
        :loading="regenerating"
        @click="$emit('regenerate')"
      >
        <el-icon><Refresh /></el-icon>
        ✨ AI 重新生成
      </el-button>
    </header>
    <div v-if="synopsis" class="synopsis-body">
      <EntityRefRenderer :text="synopsis" :entities="entities" @click-entity="$emit('click-entity', $event)" />
    </div>
    <div v-else class="synopsis-empty">
      梗概为空 — 点上方"重新生成"或在内容 sub-state 完成识别后自动生成
    </div>
  </section>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'

defineOptions({ name: 'SynopsisPanel' })

defineProps<{
  synopsis: string
  entities: any[]
  readonly?: boolean
  regenerating?: boolean
}>()

defineEmits<{
  (e: 'regenerate'): void
  (e: 'click-entity', meta: any): void
}>()
</script>

<style scoped lang="scss">
.synopsis-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.synopsis-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.synopsis-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 8px 0;
}
</style>
