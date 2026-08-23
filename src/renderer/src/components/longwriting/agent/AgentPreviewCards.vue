<template>
  <div class="agent-preview-cards">
    <template v-for="(action, idx) in actions" :key="idx">
      <!-- 故事概要预览 -->
      <div v-if="action.type === 'generate_overview' && action.data" class="preview-card overview-card">
        <div class="preview-icon"><el-icon><Notebook /></el-icon></div>
        <div class="preview-body">
          <div class="preview-title">📖 故事蓝图</div>
          <div class="overview-title">{{ action.data.title }}</div>
          <div class="preview-meta">
            <el-tag size="small" effect="plain" round>{{ action.data.estimatedChapters ? `预估 ${action.data.estimatedChapters} 章` : '结构待定' }}</el-tag>
          </div>
        </div>
      </div>

      <!-- 人物预览 -->
      <div v-else-if="action.type === 'generate_characters' && action.data?.length" class="preview-card">
        <div class="preview-icon"><el-icon><User /></el-icon></div>
        <div class="preview-body">
          <div class="preview-title">新增人物</div>
          <div class="character-row" v-for="c in action.data" :key="c.id">
            <span class="char-avatar">{{ (c.name || '?').slice(0, 1) }}</span>
            <span class="char-name">{{ c.name }}</span>
            <el-tag size="small" :type="roleTagType(c.rolePosition)" effect="light">{{ roleLabel(c.rolePosition) }}</el-tag>
          </div>
        </div>
      </div>

      <!-- 故事线预览 -->
      <div v-else-if="action.type === 'generate_plots' && action.data?.length" class="preview-card">
        <div class="preview-icon"><el-icon><List /></el-icon></div>
        <div class="preview-body">
          <div class="preview-title">新增故事线</div>
          <div class="plot-item" v-for="(p, i) in action.data.slice(0, 6)" :key="i">
            <span class="plot-index">{{ i + 1 }}</span>
            <span class="plot-title">{{ p.title }}</span>
          </div>
          <div v-if="action.data.length > 6" class="preview-more">还有 {{ action.data.length - 6 }} 条，见右侧「故事线」面板</div>
        </div>
      </div>

      <!-- 大纲预览 -->
      <div v-else-if="action.type === 'generate_outline' && action.data" class="preview-card">
        <div class="preview-icon"><el-icon><Files /></el-icon></div>
        <div class="preview-body">
          <div class="preview-title">故事大纲</div>
          <div class="preview-meta">
            <el-tag size="small" effect="plain" round>{{ outlineLevelLabel(action.data.structureLevel) }}</el-tag>
            <el-tag size="small" effect="plain" round>{{ action.data.nodes }} 个节点</el-tag>
          </div>
        </div>
      </div>

      <!-- 章节预览 -->
      <div v-else-if="action.type === 'write_chapter' && action.data" class="preview-card">
        <div class="preview-icon"><el-icon><Document /></el-icon></div>
        <div class="preview-body">
          <div class="preview-title">章节已完成</div>
          <div class="chapter-name">《{{ action.data.name }}》</div>
          <div class="preview-meta">
            <el-tag size="small" type="success" effect="light" round>约 {{ Math.round((action.data.words || 0) / 100) / 10 }} 千字</el-tag>
          </div>
        </div>
      </div>

      <!-- 世界设定 / 其他：文本摘要 -->
      <div v-else-if="action.status === 'ok' && action.message" class="preview-card plain">
        <div class="preview-icon"><el-icon><MagicStick /></el-icon></div>
        <div class="preview-body">
          <div class="preview-text">{{ action.message }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 对话内嵌产物预览卡：AI 消息中展示本轮动作生成的结构化数据（点击跳右侧面板）。
 */
import { Notebook, User, List, Files, Document, MagicStick } from '@element-plus/icons-vue'
import type { AgentActionSummaryLite } from '@/composables/useAgentChat'

defineProps<{
  actions: AgentActionSummaryLite[]
}>()

function roleLabel(role?: string): string {
  const map: Record<string, string> = {
    protagonist: '主角', supporting: '配角', antagonist: '反派', minor: '龙套',
  }
  return map[role || ''] || '角色'
}

function roleTagType(role?: string): 'primary' | 'danger' | 'info' | 'warning' {
  if (role === 'protagonist') return 'primary'
  if (role === 'antagonist') return 'danger'
  if (role === 'supporting') return 'warning'
  return 'info'
}

function outlineLevelLabel(level?: number): string {
  const map: Record<number, string> = { 1: '单级（章）', 2: '二级（章→节）', 3: '三级（卷→章→节）' }
  return map[level || 3] || '三级结构'
}
</script>

<style lang="scss" scoped>
.agent-preview-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.preview-card {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  transition: border-color var(--transition-fast);

  &:hover {
    border-color: var(--color-primary-light-5);
  }

  &.overview-card {
    background: linear-gradient(135deg, var(--color-primary-light-9), var(--fill-color-lighter));
    border-color: var(--color-primary-light-5);
  }
}

.preview-icon {
  display: flex;
  align-items: flex-start;
  color: var(--color-primary);
  font-size: 18px;
  padding-top: 2px;
}

.preview-body {
  flex: 1;
  min-width: 0;
}

.preview-title {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.overview-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color-primary);
  margin-bottom: 6px;
}

.preview-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.character-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.char-avatar {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary));
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.char-name {
  font-size: 13px;
  color: var(--text-color-primary);
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plot-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.plot-index {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--fill-color);
  color: var(--text-color-secondary);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.plot-title {
  font-size: 13px;
  color: var(--text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-more {
  font-size: 12px;
  color: var(--color-primary);
  margin-top: 4px;
}

.chapter-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-primary);
  margin-bottom: 6px;
}

.preview-text {
  font-size: 13px;
  color: var(--text-color-regular);
  line-height: 1.6;
}
</style>
