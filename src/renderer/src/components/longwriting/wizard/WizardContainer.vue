<template>
  <div class="wizard-container">
    <!-- 顶部：返回 + 项目名 + 高级模式入口 -->
    <div class="wizard-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="project-title">{{ projectName }}</span>
      </div>
      <div class="header-right">
        <span class="wizard-progress">
          <el-progress :percentage="progress" :stroke-width="6" :show-text="false" style="width: 120px" />
          <span class="progress-text">{{ progress }}%</span>
        </span>
        <el-button @click="$emit('enterAdvanced')">
          <el-icon><Setting /></el-icon>
          高级
        </el-button>
      </div>
    </div>

    <!-- 步骤条 -->
    <div class="wizard-steps">
      <div
        v-for="(step, index) in steps"
        :key="step.key"
        class="wizard-step"
        :class="{
          active: isStepActive(step.key),
          done: isStepDone(step.key) && !isStepActive(step.key),
          skipped: isStepSkipped(step.key) && !isStepActive(step.key),
          clickable: index <= farthestReachable
        }"
        @click="handleStepClick(index)"
      >
        <div class="step-node">
          <el-icon v-if="isStepSkipped(step.key) && !isStepActive(step.key)"><Close /></el-icon>
          <el-icon v-else-if="isStepDone(step.key) && !isStepActive(step.key)"><Check /></el-icon>
          <span v-else>{{ index + 1 }}</span>
        </div>
        <div class="step-label">
          {{ step.label }}
          <span v-if="step.optional" class="optional-tag">可选</span>
        </div>
      </div>
    </div>

    <!-- 内容区：当前步骤 -->
    <div class="wizard-content">
      <IdeaInputStep
        v-if="currentStep.key === 'idea'"
        :project-id="projectId"
        @state-changed="handleStepStateChanged"
      />
      <CharacterDesignStep
        v-else-if="currentStep.key === 'characters'"
        :project-id="projectId"
        @state-changed="handleStepStateChanged"
      />
      <WorldSettingStep
        v-else-if="currentStep.key === 'world'"
        :project-id="projectId"
        @state-changed="handleStepStateChanged"
      />
      <PlotDesignStep
        v-else-if="currentStep.key === 'plot'"
        :project-id="projectId"
        @state-changed="handleStepStateChanged"
      />
      <OutlineDesignStep
        v-else-if="currentStep.key === 'outline'"
        :project-id="projectId"
        @state-changed="handleStepStateChanged"
      />
      <ChapterWizardStep
        v-else-if="currentStep.key === 'chapters'"
        :project-id="projectId"
        @state-changed="handleStepStateChanged"
      />
    </div>

    <!-- 底部导航 -->
    <div class="wizard-footer">
      <el-button :disabled="!canPrev" @click="wizard.goPrev()">
        <el-icon><ArrowLeft /></el-icon>
        上一步
      </el-button>
      <span v-if="currentStep.optional && !isStepDone(currentStep.key)" class="skip-tip">
        本步可选，可跳过
      </span>
      <el-button
        v-if="currentStep.optional && !isStepDone(currentStep.key)"
        @click="handleSkip"
      >
        跳过此步
      </el-button>
      <el-button
        v-if="currentStep.key !== 'chapters'"
        type="primary"
        :disabled="!canNext"
        @click="wizard.goNext()"
      >
        下一步
        <el-icon><ArrowRight /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 向导容器：步骤条 + 动态内容区 + 上一步/下一步 + 高级模式入口
 * @module components/longwriting/wizard/WizardContainer
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Check, Close, Setting } from '@element-plus/icons-vue'
import { STORY_WIZARD_STEPS, useWizardProgress } from '@/composables/useWizardProgress'
import IdeaInputStep from './IdeaInputStep.vue'
import CharacterDesignStep from './CharacterDesignStep.vue'
import WorldSettingStep from './WorldSettingStep.vue'
import PlotDesignStep from './PlotDesignStep.vue'
import OutlineDesignStep from './OutlineDesignStep.vue'
import ChapterWizardStep from './ChapterWizardStep.vue'

const props = defineProps<{
  projectId: string
  projectName: string
  initialStage?: string
  initialSkipped?: string[]
}>()

const emit = defineEmits<{
  (e: 'enterAdvanced'): void
}>()

const router = useRouter()

/**
 * 步骤完成判定：数据存在性（各表非空）。
 * 用现有查询通道判断（数据量小，直接拉列表判空即可，避免新增 count 通道）。
 */
async function checkStep(key: string): Promise<boolean> {
  try {
    const api = window.electronAPI.longwriting
    switch (key) {
      case 'idea': {
        const r = await api.getStoryOverview(props.projectId)
        return !!(r.success && r.data?.summary)
      }
      case 'characters': {
        const r = await api.getCharacters(props.projectId)
        return !!(r.success && (r.data || []).length > 0)
      }
      case 'world': {
        const [b, l, f, s, i] = await Promise.all([
          api.getBackground(props.projectId),
          api.getLocations(props.projectId),
          api.getFactions(props.projectId),
          api.getSkills(props.projectId),
          api.getItems(props.projectId),
        ])
        return !!(
          (b.success && b.data) ||
          (l.success && (l.data || []).length > 0) ||
          (f.success && (f.data || []).length > 0) ||
          (s.success && (s.data || []).length > 0) ||
          (i.success && (i.data || []).length > 0)
        )
      }
      case 'plot': {
        const r = await api.getPlots(props.projectId)
        return !!(r.success && (r.data || []).length > 0)
      }
      case 'outline': {
        const r = await api.getOutlineTree(props.projectId)
        return !!(r.success && (r.data || []).length > 0)
      }
      case 'chapters': {
        const r = await api.getOutlineTree(props.projectId)
        const leaves = (r.data || []).filter((n: any) => n.nodeType === 'section' || n.nodeType === 'chapter')
        return leaves.length > 0
      }
      default:
        return false
    }
  } catch {
    return false
  }
}

/** 状态持久化：stage + progress + wizard_state（写入 lw_projects） */
async function persistState(state: { stage: string; skipped: string[]; progress: number }): Promise<void> {
  try {
    await window.electronAPI.longwriting.updateProject(props.projectId, {
      stage: state.stage as any,
      progress: state.progress,
      wizardState: { skipped: state.skipped },
    })
  } catch (e) {
    console.error('[WizardContainer] 持久化向导状态失败:', e)
  }
}

const wizard = useWizardProgress({
  steps: STORY_WIZARD_STEPS,
  checkStep,
  initialStage: props.initialStage,
  initialSkipped: props.initialSkipped,
  onStateChange: persistState,
})

const steps = wizard.steps
const currentStep = wizard.currentStep
const progress = wizard.progress
const canNext = wizard.canNext
const canPrev = wizard.canPrev
const isStepActive = wizard.isStepActive
const isStepDone = wizard.isStepDone
const isStepSkipped = wizard.isStepSkipped

/** 可回跳的最远位置：当前步（已完成/跳过路径上） */
const farthestReachable = computed(() => wizard.currentIndex.value)

function handleStepClick(index: number): void {
  if (index <= farthestReachable.value) {
    wizard.goTo(index)
  }
}

function handleSkip(): void {
  if (currentStep.value.optional) {
    wizard.markSkipped(currentStep.value.key)
    ElMessage.success(`已跳过「${currentStep.value.label}」`)
  }
}

/** 子步骤数据变化后刷新完成判定 */
async function handleStepStateChanged(): Promise<void> {
  await wizard.refresh()
}

function goBack(): void {
  router.push('/longwriting')
}

onMounted(async () => {
  await wizard.refresh()
})
</script>

<style lang="scss" scoped>
.wizard-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color-page);
}

.wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .project-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color-primary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .wizard-progress {
    display: flex;
    align-items: center;
    gap: 8px;

    .progress-text {
      font-size: 12px;
      color: var(--text-color-secondary);
      min-width: 32px;
    }
  }
}

.wizard-steps {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 12px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
  flex-wrap: wrap;
}

.wizard-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: default;
  transition: all 0.2s;

  &.clickable {
    cursor: pointer;

    &:hover {
      background: var(--fill-color-light);
    }
  }

  &.active {
    background: var(--color-primary-light-9);

    .step-node {
      background: var(--color-primary);
      color: #fff;
      border-color: var(--color-primary);
    }

    .step-label {
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  &.done {
    .step-node {
      background: var(--color-success);
      color: #fff;
      border-color: var(--color-success);
    }
  }

  &.skipped {
    opacity: 0.75;

    .step-node {
      background: var(--fill-color);
      border-color: var(--border-color);
    }
  }
}

.step-node {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--fill-color);
  border: 1px solid var(--border-color-light);
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.step-label {
  font-size: 14px;
  color: var(--text-color-regular);
  white-space: nowrap;

  .optional-tag {
    font-size: 11px;
    color: var(--text-color-placeholder);
    border: 1px solid var(--border-color-light);
    border-radius: 4px;
    padding: 0 4px;
    margin-left: 4px;
  }
}

.wizard-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.wizard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-color);
  border-top: 1px solid var(--border-color-light);

  .skip-tip {
    font-size: 12px;
    color: var(--text-color-placeholder);
  }
}
</style>
