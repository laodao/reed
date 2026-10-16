<template>
  <div class="script-empty">
    <el-empty description="还没有剧本">
      <template #description>
        <span class="se-desc">还没有剧本。点击「生成剧本」或让右侧助手帮你生成。</span>
      </template>
      <el-button type="primary" :loading="generating" @click="$emit('generate')">
        <el-icon><MagicStick /></el-icon>
        生成剧本
      </el-button>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
/**
 * M2 剧本页 · 无剧本空态 + CTA。
 */
import { MagicStick } from '@element-plus/icons-vue'

defineProps<{
  generating: boolean
}>()

defineEmits<{
  (e: 'generate'): void
}>()
</script>

<style lang="scss" scoped>
.script-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.se-desc { font-size: 13px; color: var(--text-color-secondary); }
</style>
