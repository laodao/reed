<template>
  <div class="domain-learning-home">
    <div class="home-header">
      <h2>领域共学空间</h2>
      <p class="home-sub">
        选择一个想学的领域——系统持续研究并整理成讲义，一步步教到你懂；随时回来继续。
      </p>
      <div class="home-actions">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建学习主题</el-button>
      </div>
    </div>

    <!-- 空间列表（后端 dl:list-spaces 真实数据） -->
    <div v-loading="store.loadingSpaces" class="topic-grid">
      <div
        v-for="s in store.spaces"
        :key="s.id"
        class="topic-card"
        @click="enter(s.id)"
      >
        <div class="card-top">
          <div class="topic-name">
            <el-icon class="topic-icon"><Reading /></el-icon>
            <span>{{ s.name }}</span>
          </div>
          <el-tag size="small" type="info" effect="plain">{{ s.goal }}</el-tag>
          <el-tag v-if="s.status !== 'active'" size="small" type="warning" effect="plain">
            {{ statusLabel(s.status) }}
          </el-tag>
        </div>

        <p class="topic-tagline">{{ s.tagline || '（暂无说明）' }}</p>

        <div v-if="s.stats" class="card-progress">
          <el-progress
            :percentage="s.stats.total ? Math.round((s.stats.mastered / s.stats.total) * 100) : 0"
            :stroke-width="8"
          />
          <div class="progress-labels">
            <span><i class="dot dot-mastered" />已理解 {{ s.stats.mastered }}</span>
            <span>共 {{ s.stats.total }} 个知识点</span>
          </div>
        </div>

        <div class="card-actions">
          <el-button type="primary" size="small" :icon="ArrowRight" @click.stop="enter(s.id)">
            继续学习 →
          </el-button>
        </div>
      </div>

      <!-- 空态：还没有任何学习主题 -->
      <div v-if="!store.loadingSpaces && store.spaces.length === 0" class="topic-empty">
        <el-empty description="还没有学习主题，先建一个吧">
          <el-button type="primary" :icon="Plus" @click="openCreate">新建学习主题</el-button>
        </el-empty>
      </div>
    </div>

    <!-- 新建学习主题对话框 -->
    <el-dialog v-model="createVisible" title="新建学习主题" width="520px" append-to-body>
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="主题名称" required>
          <el-input v-model="createForm.name" placeholder="例如：量子计算 / 某开源框架 / 一门学科……" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="学习目标">
          <el-select v-model="createForm.goal" class="goal-select">
            <el-option v-for="g in GOAL_OPTIONS" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="一句话说明">
          <el-input
            v-model="createForm.tagline"
            type="textarea"
            :rows="2"
            placeholder="你希望这个主题覆盖什么 / 为什么学它（展示在列表卡片上）"
          />
        </el-form-item>
        <el-form-item label="领域画像">
          <el-select v-model="createProfile.presetId" style="width: 100%" @change="applyPreset">
            <el-option v-for="p in DL_PROFILE_PRESETS" :key="p.id" :label="`${p.kindLabel} — ${p.nature}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型标签">
          <el-input v-model="createProfile.kindLabel" placeholder="如：理论体系 / 法规标准 / 前沿研究……" maxlength="24" />
        </el-form-item>
        <el-form-item label="领域特质">
          <el-input v-model="createProfile.nature" placeholder="一句话描述领域侧重（用于图谱侧重条）" />
        </el-form-item>
        <el-form-item label="侧重视图">
          <div class="emphasis-picker">
            <span
              v-for="em in EMPHASIS_OPTIONS"
              :key="em"
              class="em-chip"
              :class="{ on: createProfile.emphasis.includes(em) }"
              @click="toggleEmphasis(em)"
            >{{ em }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!createForm.name.trim()" @click="submitCreate">
          创建并进入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 领域共学空间 —— 空间列表页（Home）
 * @module views/domain-learning/DomainLearningHome
 * @description 主题列表卡片（数据源 dl:list-spaces → DlSpaceSummary）：展示目标/说明/掌握度，
 *              点击进入三栏空间页；「新建学习主题」调 dl:create-space 后直达新空间。
 */
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Reading, Plus, ArrowRight } from '@element-plus/icons-vue'
import { useDomainLearningStore } from '@/stores/domain-learning'
import type { DlProjectStatus } from '@shared/types/domain-learning.types'
import { DL_PROFILE_PRESETS } from '@shared/types/domain-learning.types'

const router = useRouter()
const store = useDomainLearningStore()

/** 学习目标档位（dl_goal 枚举：入门 / 工作应用 / 前沿） */
const GOAL_OPTIONS = ['入门', '工作应用', '前沿'] as const

/** 画像侧重视图选项（建空间 M2-E；与 preset.emphasis 词汇一致） */
const EMPHASIS_OPTIONS = ['时间线', '流程', '矩阵', '三层结构'] as const

/** 空间状态展示文案 */
const STATUS_LABELS: Record<DlProjectStatus, string> = {
  active: '进行中',
  paused: '已暂停',
  archived: '已归档',
}
function statusLabel(s: DlProjectStatus): string {
  return STATUS_LABELS[s] ?? s
}

// ---------- 新建空间 ----------
const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive<{ name: string; goal: string; tagline: string }>({
  name: '',
  goal: '入门',
  tagline: '',
})

/** 建空间画像草稿（M2-E：预设 + 自定义字段 + 侧重视图 chips） */
const createProfile = reactive<{ presetId: string; kindLabel: string; nature: string; emphasis: string[] }>({
  presetId: 'custom',
  kindLabel: '自定义领域',
  nature: '',
  emphasis: [],
})

function applyPreset(presetId: string): void {
  const preset = DL_PROFILE_PRESETS.find((p) => p.id === presetId) ?? DL_PROFILE_PRESETS[DL_PROFILE_PRESETS.length - 1]
  createProfile.presetId = preset.id
  createProfile.kindLabel = preset.kindLabel
  createProfile.nature = preset.nature
  createProfile.emphasis = [...preset.emphasis]
}

function toggleEmphasis(word: string): void {
  const i = createProfile.emphasis.indexOf(word)
  if (i >= 0) createProfile.emphasis.splice(i, 1)
  else createProfile.emphasis.push(word)
}

function openCreate(): void {
  createForm.name = ''
  createForm.goal = '入门'
  createForm.tagline = ''
  applyPreset('custom')
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  const name = createForm.name.trim()
  if (!name || creating.value) return
  creating.value = true
  try {
    // tagline 同时写入 description（列表卡片读 description 展示）
    const id = await store.createSpace({
      name,
      goal: createForm.goal,
      tagline: createForm.tagline.trim(),
      description: createForm.tagline.trim(),
      profileId: createProfile.presetId === 'custom' ? undefined : createProfile.presetId,
      profile: {
        kindLabel: createProfile.kindLabel,
        nature: createProfile.nature,
        emphasis: [...createProfile.emphasis],
      },
    })
    if (id) {
      createVisible.value = false
      enter(id)
    } else if (store.error) {
      console.error('[domain-learning] 新建失败:', store.error)
    }
  } finally {
    creating.value = false
  }
}

// ---------- 进入空间 ----------
function enter(id: string): void {
  router.push(`/domain-learning/${id}`)
}

onMounted(() => {
  void store.fetchSpaces()
})
</script>

<style scoped lang="scss">
.domain-learning-home {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  box-sizing: border-box;
  background: var(--el-bg-color);
}

.home-header {
  margin-bottom: 20px;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;

  h2 {
    margin: 0 0 6px;
    font-size: 22px;
    color: var(--el-text-color-primary);
    width: 100%;
  }
  .home-sub {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    flex: 1;
  }
  .home-actions {
    flex-shrink: 0;
  }
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  min-height: 120px;
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
}

.topic-empty {
  grid-column: 1 / -1;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.topic-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-width: 0;
  flex: 1;
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
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  min-height: 18px;
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

.goal-select {
  width: 100%;
}

.emphasis-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .em-chip {
    padding: 2px 10px;
    font-size: 12px;
    border-radius: 10px;
    border: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-regular);
    cursor: pointer;
    &:hover {
      border-color: var(--el-color-primary-light-5);
    }
    &.on {
      background: var(--el-color-success);
      border-color: var(--el-color-success);
      color: #fff;
    }
  }
}
</style>
