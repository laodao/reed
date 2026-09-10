<template>
  <div class="atlas-views">
    <template v-if="kind === 'timeline' && views.timeline">
      <div class="views-tip">按资料时间排序的知识节点（来自概念 attrs 时间字段；无时间的节点不在时间线上）</div>
      <div v-if="views.timeline.items.length === 0" class="views-empty">暂无带时间属性的节点</div>
      <div v-else class="tl-wrap">
        <div v-for="(item, i) in views.timeline.items" :key="item.id" class="tl-item" @click="open(item.id)">
          <div class="tl-rail">
            <i class="tl-dot" :style="{ background: nodeTypeMeta(item.nodeType).color }" />
            <span v-if="i < views.timeline.items.length - 1" class="tl-line" />
          </div>
          <div class="tl-body">
            <div class="tl-head">
              <span class="tl-date">{{ item.dateText }}</span>
              <el-tag v-if="item.group" size="small" effect="plain">{{ item.group }}</el-tag>
            </div>
            <div class="tl-name">
              <i class="dot" :style="{ background: nodeTypeMeta(item.nodeType).color }" />{{ item.name }}
              <el-tag size="small" effect="plain" class="type-tag">{{ nodeTypeMeta(item.nodeType).label }}</el-tag>
            </div>
            <div v-if="item.desc" class="tl-desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'flow' && views.flow">
      <div class="views-tip">按前置依赖排出的学习流程：同一阶段的节点可并行掌握（箭头为 prerequisite）</div>
      <div class="flow-wrap">
        <div v-for="(stage, si) in views.flow.stages" :key="si" class="flow-stage">
          <div class="stage-index">
            <span>阶段 {{ si + 1 }}</span>
            <el-icon v-if="si < views.flow.stages.length - 1"><ArrowRight /></el-icon>
          </div>
          <div class="stage-nodes">
            <el-tag
              v-for="cid in stage.conceptIds"
              :key="cid"
              effect="plain"
              class="flow-node"
              @click="open(cid)"
            >{{ nameOf(cid) }}</el-tag>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'matrix' && views.matrix">
      <div class="views-tip">概念类型 × 关系类型 的边分布（行 = 关系起点类型）</div>
      <div v-if="views.matrix.nodeTypes.length === 0" class="views-empty">暂无关系数据</div>
      <el-table v-else :data="matrixRows" size="small" border class="matrix-table">
        <el-table-column label="概念类型" min-width="130">
          <template #default="{ row }">
            <span class="row-type"><i class="dot" :style="{ background: nodeTypeMeta(row.nodeType).color }" />{{ nodeTypeMeta(row.nodeType).label }}</span>
          </template>
        </el-table-column>
        <el-table-column
          v-for="rel in views.matrix.relationTypes"
          :key="rel"
          :prop="rel"
          :label="relLabel(rel)"
          min-width="110"
          align="center"
        >
          <template #default="{ row }">{{ row[rel] ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="合计" width="80" align="center">
          <template #default="{ row }">{{ rowTotal(row.nodeType) }}</template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else-if="kind === 'layers' && views.layers">
      <div class="views-tip">三层结构：目录 → 概念 → 卡片/著作（点概念看右栏档案）</div>
      <div v-if="views.layers.groups.length === 0" class="views-empty">暂无知识节点</div>
      <el-collapse v-else class="layers-collapse">
        <el-collapse-item
          v-for="g in views.layers.groups"
          :key="g.groupId ?? '__root__'"
          :title="g.groupName ?? '（根层概念）'"
          :name="g.groupId ?? '__root__'"
        >
          <div v-for="c in g.concepts" :key="c.id" class="layer-concept" @click="open(c.id)">
            <i class="dot" :style="{ background: nodeTypeMeta(c.nodeType).color }" />
            <span class="lc-name">{{ c.name }}</span>
            <span class="lc-meta">
              <el-tag v-if="c.hasCard" size="small" type="success" effect="plain">讲义{{ c.worksCount > 0 ? `+${c.worksCount} 著作` : '' }}</el-tag>
              <el-tag v-else size="small" effect="plain">待研究</el-tag>
            </span>
          </div>
        </el-collapse-item>
      </el-collapse>
    </template>

    <div v-else class="views-empty">该视图暂无可用数据</div>
  </div>
</template>

<script setup lang="ts">
/**
 * Atlas 增强视图渲染（M2-E：时间线/流程/矩阵/三层结构）
 * @module views/domain-learning/AtlasEnhancedViews
 * @description 纯展示 + 概念点击上抛（右栏档案由父级加载）。数据 = dl:get-atlas-views 载荷。
 */
import { computed } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { nodeTypeMeta, relLabel } from './domain-learning-ui'
import type { DlAtlasViews } from '@shared/types/domain-learning.types'

const props = defineProps<{
  views: DlAtlasViews
  kind: 'timeline' | 'flow' | 'matrix' | 'layers'
}>()

const emit = defineEmits<{ 'open-concept': [id: string] }>()

function open(id: string): void {
  emit('open-concept', id)
}

const matrixRows = computed(() =>
  (props.views.matrix?.nodeTypes ?? []).map((t) => ({ nodeType: t } as Record<string, unknown>)),
)

function rowTotal(nodeType: string): number {
  const cells = props.views.matrix?.cells[nodeType]
  if (!cells) return 0
  return Object.values(cells).reduce((a, b) => a + (b ?? 0), 0)
}

function nameOf(id: string): string {
  // 时间线/分层里 id→名字：各视图条目都有 name；流程只存 id，需由父级补 mapping
  // 兜底：从时间线/分层条目找
  const tl = props.views.timeline?.items.find((i) => i.id === id)
  if (tl) return tl.name
  for (const g of props.views.layers?.groups ?? []) {
    const c = g.concepts.find((x) => x.id === id)
    if (c) return c.name
  }
  return id
}
</script>

<style scoped lang="scss">
.atlas-views {
  height: 100%;
  overflow-y: auto;
  padding: 4px 10px 10px;
}

.views-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}
.views-empty {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 24px 0;
  text-align: center;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 5px;
}

// 时间线
.tl-wrap {
  .tl-item {
    display: flex;
    gap: 10px;
    cursor: pointer;
    padding: 4px 0;
    border-radius: 6px;
    &:hover {
      background: var(--el-fill-color-light);
    }
  }
  .tl-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 14px;
    position: relative;
    .tl-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      margin-top: 5px;
      z-index: 1;
    }
    .tl-line {
      position: absolute;
      top: 16px;
      bottom: -4px;
      width: 2px;
      background: var(--el-border-color-light);
    }
  }
  .tl-body {
    flex: 1;
    padding-bottom: 8px;
    .tl-head {
      display: flex;
      align-items: center;
      gap: 8px;
      .tl-date {
        font-size: 12px;
        font-weight: 600;
        color: var(--el-color-primary);
      }
    }
    .tl-name {
      font-size: 14px;
      display: flex;
      align-items: center;
      .type-tag {
        margin-left: 8px;
      }
    }
    .tl-desc {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-top: 2px;
    }
  }
}

// 流程
.flow-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  .flow-stage {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    .stage-index {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 86px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      padding-top: 4px;
      white-space: nowrap;
    }
    .stage-nodes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      .flow-node {
        cursor: pointer;
        max-width: 220px;
      }
    }
  }
}

// 矩阵
.matrix-table {
  margin-top: 4px;
}
.row-type {
  display: inline-flex;
  align-items: center;
}

// 三层结构
.layers-collapse {
  border: none;
  .layer-concept {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-radius: 6px;
    cursor: pointer;
    &:hover {
      background: var(--el-fill-color-light);
    }
    .lc-name {
      flex: 1;
      font-size: 13px;
    }
    .lc-meta {
      .el-tag {
        margin-left: 4px;
      }
    }
  }
}
</style>
