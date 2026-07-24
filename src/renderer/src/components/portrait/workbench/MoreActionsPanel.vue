<template>
  <div class="panel-card">
    <h3 class="panel-title">⚙️ 更多操作</h3>
    <div class="action-grid">
      <button class="action-btn" type="button" @click="$emit('open', 'regenerate')">
        <span class="ico">🔄</span><span>重新生成</span>
      </button>
      <button class="action-btn" type="button" @click="$emit('open', 'clothes')">
        <span class="ico">👔</span><span>换衣</span>
      </button>
      <button class="action-btn" type="button" @click="$emit('open', 'background')">
        <span class="ico">🏞️</span><span>换背景</span>
      </button>
      <button class="action-btn" type="button" @click="$emit('open', 'angles')">
        <span class="ico">📐</span><span>多角度</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 更多操作按钮行（spec 2026-07-24 D8）：
 * 重新生成 / 换衣 / 换背景 / 多角度，emit 给父级打开对应对话框。
 */
defineEmits<{
  open: [dialog: 'regenerate' | 'clothes' | 'background' | 'angles']
}>()
</script>

<style lang="scss" scoped>
.panel-card {
  background: var(--bg-color-card);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md, 18px);
  box-shadow: var(--shadow-sm);
}

.panel-title {
  margin: 0 0 var(--spacing-md, 14px);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-color-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);

  .ico {
    font-size: 20px;
  }

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-light-9);
  }
}
</style>
