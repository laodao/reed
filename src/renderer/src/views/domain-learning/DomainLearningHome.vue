<template>
  <div class="domain-learning-home">
    <!-- 原型角标 -->
    <div class="proto-banner">
      <el-tag size="small" type="warning" effect="plain">界面原型 · 后端未接入 · 演示数据</el-tag>
    </div>

    <div class="home-header">
      <h2>领域共学空间</h2>
      <p class="home-sub">
        选择一个想学的领域——系统持续研究并整理成讲义，一步步教到你懂；随时回来继续。
      </p>
    </div>

    <div class="topic-grid">
      <div
        v-for="s in spaces"
        :key="s.id"
        class="topic-card"
        @click="enter(s.id)"
      >
        <div class="card-top">
          <div class="topic-name">
            <el-icon class="topic-icon"><Reading /></el-icon>
            <span>{{ s.name }}</span>
          </div>
          <el-tag size="small" type="info" effect="plain">{{ s.goalLevel }}</el-tag>
        </div>

        <p class="topic-tagline">{{ s.tagline }}</p>
        <p class="topic-goal">目标：{{ s.goal }}</p>

        <div class="card-progress">
          <el-progress :percentage="statsOf(s.id).percent" :stroke-width="8" />
          <div class="progress-labels">
            <span><i class="dot dot-mastered" />已理解 {{ statsOf(s.id).mastered }}</span>
            <span><i class="dot dot-learning" />学习中 {{ statsOf(s.id).learning }}</span>
            <span><i class="dot dot-todo" />待学 {{ statsOf(s.id).todo }}</span>
          </div>
        </div>

        <div class="card-actions">
          <el-button type="primary" size="small" :icon="ArrowRight">继续学习 →</el-button>
        </div>
      </div>

      <!-- 新建主题占位卡（后端接入后可用） -->
      <div class="topic-card topic-card-new">
        <div class="topic-name">
          <el-icon class="topic-icon"><Plus /></el-icon>
          <span>新建学习主题</span>
        </div>
        <p class="topic-tagline">例如：量子计算 / 某开源框架 / 一门学科……</p>
        <div class="card-actions">
          <el-button size="small" disabled>（正式版：后端接入后可用）</el-button>
        </div>
      </div>
    </div>

    <!-- 底层演示说明 -->
    <div class="home-note">
      <el-alert
        type="info"
        :closable="false"
        title="界面原型说明"
        description="当前为多主题列表原型：点卡片进入该主题的三栏学习空间（概念图 / 讲义 / 追问）。「新建主题」与主题数据来自后端的部分尚未实现。"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 领域共学空间 —— 主题列表页（前端原型）
 * @module views/domain-learning/DomainLearningHome
 * @description 多个学习主题的入口列表：卡片展示主题目标与掌握度进度，点击进入三栏空间页。
 *              进度读响应式 mock 单例——学习空间标记「懂了」后回列表即见更新。
 */
import { computed } from 'vue'
import { Reading, Plus, ArrowRight } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { demoSpaces, spaceStats, type SpaceProject } from './mock-data'

// keep-alive 缓存按组件名匹配（与路由名一致）
defineOptions({ name: 'DomainLearningHome' })

const router = useRouter()

const spaces: SpaceProject[] = demoSpaces

/** 进度统计一次算全（demoSpaces 是响应式单例，学习侧写回后此处自动刷新） */
const statsById = computed(() => {
  const map = new Map<string, ReturnType<typeof spaceStats>>()
  for (const s of spaces) map.set(s.id, spaceStats(s))
  return map
})
function statsOf(id: string) {
  return statsById.value.get(id) ?? { mastered: 0, learning: 0, todo: 0, percent: 0 }
}

function enter(id: string): void {
  router.push(`/domain-learning/${id}`)
}
</script>

<style scoped lang="scss">
.domain-learning-home {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  box-sizing: border-box;
  background: var(--el-bg-color);
}

.proto-banner {
  position: absolute;
  top: 8px;
  right: 16px;
}

.home-header {
  margin-bottom: 20px;

  h2 {
    margin: 0 0 6px;
    font-size: 22px;
    color: var(--el-text-color-primary);
  }
  .home-sub {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.topic-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 18px;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.1s;

  &:hover {
    box-shadow: var(--el-box-shadow-light);
    transform: translateY(-2px);
  }

  &.topic-card-new {
    cursor: default;
    border-style: dashed;
    background: transparent;
    &:hover {
      transform: none;
      box-shadow: none;
    }
  }
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.topic-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-width: 0;
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.topic-icon {
  color: var(--el-color-primary);
  font-size: 18px;
  flex-shrink: 0;
}

.topic-tagline {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.topic-goal {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card-progress {
  margin-bottom: 14px;
}

.progress-labels {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;

  &.dot-mastered {
    background: var(--el-color-success);
  }
  &.dot-learning {
    background: var(--el-color-warning);
  }
  &.dot-todo {
    background: var(--el-border-color-darker);
  }
}

.card-actions {
  display: flex;
  justify-content: flex-end;
}

.home-note {
  margin-top: 24px;
}
</style>
