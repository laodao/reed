<template>
  <div class="tpl-card">
    <div class="tpl-head">
      <div class="tpl-title">
        <div class="tpl-name">{{ template.name }}</div>
        <div class="tpl-sub">
          {{ PROMPT_TEMPLATE_CATEGORY_LABELS[template.category] }} ·
          <span :class="template.builtin ? 'src-builtin' : 'src-custom'">
            {{ template.builtin ? '内置' : '我的' }}
          </span>
        </div>
      </div>
      <span v-if="template.builtin" class="tpl-tag">内置</span>
    </div>
    <div class="tpl-body">{{ template.content }}</div>
    <div class="tpl-foot">
      <el-button size="small" @click="$emit('preview', template)">预览</el-button>
      <el-button size="small" @click="$emit('copy', template)">复制</el-button>
      <template v-if="!template.builtin">
        <el-button size="small" type="primary" @click="$emit('edit', template)">编辑</el-button>
        <el-button size="small" type="danger" plain @click="$emit('delete', template)">删除</el-button>
      </template>
      <el-tooltip v-else content="内置模板不可修改" placement="top">
        <span class="tpl-builtin-lock">🔒 只读</span>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PROMPT_TEMPLATE_CATEGORY_LABELS } from '../../../../../shared/types/portrait.types'
import type { PortraitPromptTemplate } from '../../../../../shared/types/portrait.types'

/**
 * 模板卡片（plan B2）：
 * 内置模板只读（锁标记 + tooltip），自定义模板可编辑/删除。
 */
defineProps<{
  template: PortraitPromptTemplate
}>()

defineEmits<{
  preview: [template: PortraitPromptTemplate]
  copy: [template: PortraitPromptTemplate]
  edit: [template: PortraitPromptTemplate]
  delete: [template: PortraitPromptTemplate]
}>()
</script>

<style lang="scss" scoped>
.tpl-card {
  background: var(--bg-color-card);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-normal), box-shadow var(--transition-normal), transform var(--transition-normal);
  display: flex;
  flex-direction: column;

  &:hover {
    border-color: var(--border-color);
    box-shadow: var(--shadow-card);
    transform: translateY(-2px);
  }
}

.tpl-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.tpl-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.tpl-sub {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 3px;

  .src-builtin {
    color: var(--color-purple);
  }

  .src-custom {
    color: var(--text-secondary);
  }
}

.tpl-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-purple-light-9);
  color: var(--color-purple);
  flex-shrink: 0;
}

.tpl-body {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-regular);
  background: var(--fill-color-light);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  height: 96px;
  overflow: hidden;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}

.tpl-foot {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  align-items: center;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.tpl-builtin-lock {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-placeholder);
}
</style>
