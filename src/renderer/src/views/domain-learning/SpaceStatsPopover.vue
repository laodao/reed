<template>
  <el-popover trigger="click" width="320" @show="load">
    <template #reference>
      <el-button plain>统计</el-button>
    </template>
    <div class="stats-body" v-if="store.spaceStats">
      <div class="stat-row"><span>概念</span><b>{{ store.spaceStats.concepts.total }}</b><small>已掌握 {{ store.spaceStats.concepts.mastered }} · 学习中 {{ store.spaceStats.concepts.learning }} · 需复习 {{ store.spaceStats.concepts.review }} · 未开始 {{ store.spaceStats.concepts.untouched }}</small></div>
      <div class="stat-row"><span>讲义</span><b>{{ store.spaceStats.cards.published + store.spaceStats.cards.draft }}</b><small>已发布 {{ store.spaceStats.cards.published }} · 草稿 {{ store.spaceStats.cards.draft }}</small></div>
      <div class="stat-row"><span>关系</span><b>{{ store.spaceStats.relations.total }}</b><small>前置 {{ store.spaceStats.relations.prerequisite }} · 已确认 {{ store.spaceStats.relations.verified }}</small></div>
      <div class="stat-row"><span>问答</span><b>{{ store.spaceStats.questions.total }}</b><small>已回答 {{ store.spaceStats.questions.answered }} · 未解 {{ store.spaceStats.questions.open }}</small></div>
      <div class="stat-row"><span>复习到期</span><b>{{ store.spaceStats.reviewDueCount }}</b></div>
    </div>
    <div v-else class="stats-body empty">统计加载失败或为空</div>
  </el-popover>
</template>

<script setup lang="ts">
/**
 * 空间统计入口（M4-A P1-6 拆分：从 DomainAtlas 抽出统计 popover）
 */
import { useDomainLearningStore } from '@/stores/domain-learning'

const props = defineProps<{ spaceId: string }>()
const store = useDomainLearningStore()

function load(): void {
  void store.fetchSpaceStats(props.spaceId)
}
</script>

<style scoped lang="scss">
.stats-body {
  .stat-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 0;
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    b {
      min-width: 20px;
      color: var(--el-color-primary);
    }
    small {
      color: var(--el-text-color-secondary);
    }
  }
  &.empty {
    color: var(--el-text-color-placeholder);
    font-size: 12.5px;
  }
}
</style>
