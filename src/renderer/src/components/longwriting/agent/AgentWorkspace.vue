<template>
  <div class="agent-workspace">
    <!-- 顶栏 -->
    <div class="ws-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="project-title">{{ projectName }}</span>
      </div>
      <div class="header-right">
        <el-button @click="emit('enterAdvanced')">
          <el-icon><Setting /></el-icon>
          高级
        </el-button>
      </div>
    </div>

    <!-- 进度带：只作状态展示（点击跳面板对应 Tab），流程由对话驱动 -->
    <div class="progress-strip">
      <div
        v-for="(item, i) in progressItems"
        :key="item.key"
        class="progress-item"
        :class="{ done: item.done, active: activePanelTab === item.key }"
        @click="jumpToTab(item.key)"
      >
        <div class="progress-node">
          <el-icon v-if="item.done"><Check /></el-icon>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <span class="progress-label">{{ item.label }}</span>
      </div>
      <div class="progress-line" />
    </div>

    <!-- 左右分栏 -->
    <div class="ws-body">
      <div class="ws-chat">
        <AgentChatView
          :project-id="projectId"
          @data-changed="onDataChanged"
        />
      </div>

      <!-- 数据面板（可折叠） -->
      <div class="ws-panel" :class="{ collapsed: panelCollapsed }">
        <button class="panel-toggle" :title="panelCollapsed ? '展开面板' : '收起面板'" @click="panelCollapsed = !panelCollapsed">
          <el-icon><DArrowLeft v-if="!panelCollapsed" /><DArrowRight v-else /></el-icon>
        </button>
        <AgentDataPanel
          v-if="!panelCollapsed"
          ref="panelRef"
          :data="panel.data"
          :production-state="panel.productionState.value"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 对话式工作流工作区：顶栏 + 进度带（状态展示）+ 左对话 + 右数据面板。
 * 面板数据事件驱动刷新：对话中动作落库 → 变更分区自动重拉。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Setting, Check, DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import AgentChatView from './AgentChatView.vue'
import AgentDataPanel from './AgentDataPanel.vue'
import { useAgentPanelData } from '@/composables/useAgentPanelData'

const props = defineProps<{
  projectId: string
  projectName: string
}>()

const emit = defineEmits<{
  (e: 'enterAdvanced'): void
}>()

const router = useRouter()
const panel = useAgentPanelData(props.projectId)
const panelRef = ref<InstanceType<typeof AgentDataPanel> | null>(null)
const panelCollapsed = ref(false)
const activePanelTab = ref('overview')

const progressItems = computed(() => {
  const ps = panel.productionState.value
  if (!ps) return []
  return [
    { key: 'overview', label: '想法', done: !!ps.overview?.exists },
    { key: 'characters', label: '人物', done: (ps.characters?.count || 0) > 0 },
    {
      key: 'world', label: '世界',
      done: !!ps.world?.background || (ps.world?.locations || 0) + (ps.world?.factions || 0) + (ps.world?.skills || 0) + (ps.world?.items || 0) > 0,
    },
    { key: 'plots', label: '故事线', done: (ps.plots?.count || 0) > 0 },
    { key: 'outline', label: '大纲', done: (ps.outline?.total || 0) > 0 },
    { key: 'chapters', label: '章节', done: (ps.chapters?.written || 0) > 0 },
  ]
})

/** 对话动作变更分区 → 面板增量刷新 */
function onDataChanged(sections: string[]): void {
  const valid = sections.filter((s): s is 'overview' | 'characters' | 'world' | 'plots' | 'outline' | 'chapters' =>
    ['overview', 'characters', 'world', 'plots', 'outline', 'chapters'].includes(s),
  )
  if (valid.length > 0) {
    void panel.refresh(valid)
  } else {
    void panel.refresh()
  }
}

/** 进度带点击 → 面板对应 Tab */
function jumpToTab(key: string): void {
  activePanelTab.value = key
  if (panelCollapsed.value) panelCollapsed.value = false
  void panelRef.value?.setActiveTab?.(key)
}

function goBack(): void {
  router.push('/longwriting')
}

onMounted(() => {
  void panel.load()
})
</script>

<style lang="scss" scoped>
.agent-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-color-page);
}

.ws-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .project-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color-primary);
  }
}

// ==================== 进度带 ====================

.progress-strip {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0;
  padding: 10px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  overflow-x: auto;
}

.progress-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background var(--transition-fast);
  flex-shrink: 0;

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
  }
}

.progress-node {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--fill-color);
  border: 1px solid var(--border-color-light);
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.progress-item.done .progress-node {
  background: var(--color-success);
  border-color: var(--color-success);
  color: #fff;
}

.progress-label {
  font-size: 13px;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.progress-item.done .progress-label {
  color: var(--text-color-regular);
}

.progress-line {
  position: absolute;
  left: 12%;
  right: 12%;
  top: 50%;
  height: 2px;
  background: var(--border-color-lighter);
  transform: translateY(-50%);
}

// ==================== 主体分栏 ====================

.ws-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.ws-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.ws-panel {
  position: relative;
  width: 360px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  transition: width var(--transition-normal);

  &.collapsed {
    width: 0;
  }

  > :deep(.agent-data-panel) {
    flex: 1;
    min-height: 0;
  }
}

.panel-toggle {
  position: absolute;
  left: -13px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  width: 26px;
  height: 40px;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  border: 1px solid var(--border-color-lighter);
  border-left: none;
  background: var(--bg-color);
  color: var(--text-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: color var(--transition-fast);

  &:hover {
    color: var(--color-primary);
  }
}
</style>
