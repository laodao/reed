<template>
  <div class="placeholder-tab">
    <el-empty :description="message" :image-size="100">
      <template #description>
        <span class="ph-desc">{{ message }}</span>
      </template>
    </el-empty>
    <p class="ph-sub">当前功能建设中，右侧「制作助手」已可用。</p>
  </div>
</template>

<script setup lang="ts">
/**
 * 占位 tab：未完成业务模块的「建设中」提示（阶段 A/B）。右侧 agent 面板不受影响，始终可用。
 */
defineProps<{
  episodeId?: string
  projectId?: string
}>()

const message = '该模块建设中，敬请期待'
</script>

<style lang="scss" scoped>
.placeholder-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  .ph-desc { font-size: 14px; color: var(--text-color-secondary); }
  .ph-sub { margin: 0; font-size: 12px; color: var(--text-color-placeholder); }
}
</style>
