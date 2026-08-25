<template>
  <div class="scene-nav">
    <div class="nav-toolbar">
      <span class="nav-title">场次</span>
      <el-tag v-if="scenes.length" size="small" round effect="plain" type="info">{{ scenes.length }} 场</el-tag>
    </div>
    <div class="nav-list">
      <div
        v-for="sc in scenes"
        :key="sc.id"
        class="nav-item"
        :class="{ active: sc.id === selectedSceneId }"
        @click="$emit('select', sc)"
      >
        <span class="idx">{{ sc.sceneNumber }}</span>
        <span class="name">{{ sc.location || '场景 ' + sc.sceneNumber }}</span>
      </div>
      <div v-if="scenes.length === 0" class="nav-empty">
        暂无场景<br />可在右侧让助手拆分，或点「重新拆分」
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M2 剧本页 · 左侧场次导航。点击选中 → emit select。
 */
defineProps<{
  scenes: any[]
  selectedSceneId: string | null
}>()

defineEmits<{
  (e: 'select', scene: any): void
}>()
</script>

<style lang="scss" scoped>
.scene-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.nav-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color-lighter);
  .nav-title { font-size: 13px; font-weight: 600; color: var(--text-color-primary); }
}

.nav-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color-regular);
  transition: all var(--transition-fast);
  &:hover { background: var(--fill-color-light); }
  &.active { background: var(--color-primary-light-9); color: var(--color-primary); }
  .idx {
    width: 20px; height: 20px; border-radius: 6px;
    background: var(--fill-color);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: var(--text-color-secondary); flex-shrink: 0;
  }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.nav-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-placeholder);
  line-height: 1.7;
}
</style>
