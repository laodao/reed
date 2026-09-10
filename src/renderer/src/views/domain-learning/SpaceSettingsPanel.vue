<template>
  <!-- 领域共学空间：空间设置面板（领域画像/自动推进/关联知识库/间隔复习） -->
  <div class="settings-body">
    <div class="set-block">
      <div class="set-title">领域画像（侧重 → Atlas 增强视图）</div>
      <div class="set-row">
        <span class="set-label">画像预设</span>
        <el-select v-model="draft.presetId" size="small" style="width: 220px" @change="fillDraftFromPreset">
          <el-option v-for="p in DL_PROFILE_PRESETS" :key="p.id" :label="p.kindLabel" :value="p.id" />
        </el-select>
      </div>
      <div class="set-row">
        <span class="set-label">类型标签</span>
        <el-input v-model="draft.kindLabel" size="small" style="width: 220px" />
      </div>
      <div class="set-row">
        <span class="set-label">领域特质</span>
        <el-input v-model="draft.nature" type="textarea" :rows="2" size="small" style="width: 220px" />
      </div>
      <div class="set-row">
        <span class="set-label">侧重视图</span>
        <span
          v-for="em in EMPHASIS_OPTIONS"
          :key="em"
          class="em-chip"
          :class="{ on: draft.emphasis.includes(em) }"
          @click="toggleEmphasis(em)"
        >{{ em }}</span>
      </div>
      <div class="set-actions">
        <el-button size="small" type="primary" @click="applyProfile">应用画像</el-button>
      </div>
    </div>
    <div class="set-block">
      <div class="set-title">自动推进（周期研究 · M2-C）</div>
      <div class="set-row">
        <span class="set-label">启用</span>
        <el-switch v-model="paceDraft.enabled" size="small" />
      </div>
      <div class="set-row">
        <span class="set-label">周期（分钟）</span>
        <el-input-number v-model="paceDraft.intervalMin" :min="5" :max="1440" :step="5" size="small" style="width: 140px" />
      </div>
      <div class="set-row">
        <span class="set-label">自动研究无卡概念</span>
        <el-switch v-model="paceDraft.autoResearchConcepts" size="small" />
      </div>
      <div class="set-row">
        <span class="set-label">自动开子研究（未解问题）</span>
        <el-switch v-model="paceDraft.autoResolveOpenQuestions" size="small" />
      </div>
      <div class="set-actions">
        <el-button size="small" type="primary" @click="applyPace">保存自动推进</el-button>
        <span v-if="schedulerState" class="pace-state">
          {{ schedulerState.mode === 'web' ? '（Web 端不支持周期任务）' : schedulerState.running ? `调度运行中 · 在途 ${schedulerState.runningCount}` : '调度未运行' }}
        </span>
      </div>
    </div>
    <div class="set-block">
      <div class="set-title">关联知识库（研究资料源 · M4-B）</div>
      <div class="set-row">
        <span class="set-label">知识库</span>
        <el-select v-model="kbIdDraft" clearable filterable size="small" placeholder="选择（可空=不绑定）" style="width: 220px">
          <el-option v-for="k in kbs" :key="k.id" :label="k.name" :value="k.id" />
        </el-select>
      </div>
      <div class="set-actions">
        <el-button size="small" type="primary" @click="saveKb">保存绑定</el-button>
        <span v-if="kbNote" class="pace-state">{{ kbNote }}</span>
      </div>
    </div>
    <div class="set-block">
      <div class="set-title">间隔复习（M3-B）</div>
      <div class="set-row">
        <span class="set-label">启用复习队列</span>
        <el-switch v-model="reviewDraft.enabled" size="small" />
      </div>
      <div class="set-row">
        <span class="set-label">复习周期（分钟）</span>
        <el-input-number v-model="reviewDraft.intervalMin" :min="60" :max="43200" :step="60" size="small" style="width: 140px" />
      </div>
      <div class="set-row">
        <span class="set-label">每轮条数</span>
        <el-input-number v-model="reviewDraft.limit" :min="1" :max="50" size="small" style="width: 120px" />
      </div>
      <div class="set-actions">
        <el-button size="small" type="primary" @click="applyReviewSettings">保存复习设置</el-button>
      </div>
      <div v-if="reviewDueItems.length" class="review-list">
        <div class="review-head">到期复习（{{ reviewDueItems.length }}）</div>
        <div v-for="it in reviewDueItems" :key="it.conceptId" class="review-item">
          <span class="review-name">{{ it.name }}</span>
          <el-tag v-if="it.mastery === 'review'" size="small" type="warning" effect="plain">需复习</el-tag>
          <el-button link size="small" :loading="reviewBusyId === it.conceptId" @click="startReview(it.conceptId)">开始复习</el-button>
          <el-button link size="small" type="success" @click="doneReview(it.conceptId)">完成</el-button>
          <el-button link size="small" @click="needReview(it.conceptId)">标需复习</el-button>
        </div>
      </div>
      <div v-else class="review-empty">{{ reviewDraft.enabled ? '暂无到期复习' : '未启用（开启后到期自动入队）' }}</div>
      <div v-if="reviewNote" class="review-note">{{ reviewNote }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 领域共学空间 —— 空间设置面板（Space 主界面入口；原 Atlas 弹层设置区整体迁移，M6）
 * @module views/domain-learning/SpaceSettingsPanel
 * @description 领域画像（预设/类型/特质/侧重视图）、自动推进（周期研究）、关联知识库
 *              （研究资料源）、间隔复习（到期队列/开始复习/完成/标需复习）。
 *              打开时按 spaceId 拉当前值与系统知识库列表；保存动作走 dl:* 服务层。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useDomainLearningStore } from '@/stores/domain-learning'
import { listKnowledgeBases, type DlKbOption } from './domain-learning-ui'
import type {
  DlPaceSettings,
  DlProfileView,
} from '@shared/types/domain-learning.types'
import {
  DEFAULT_DL_PACE_SETTINGS,
  DEFAULT_DL_REVIEW_SETTINGS,
  DL_PROFILE_PRESETS,
  DL_VIEW_KIND_LABELS,
  DL_VIEW_KIND_ORDER,
} from '@shared/types/domain-learning.types'

const props = defineProps<{ spaceId: string }>()
const emit = defineEmits<{ (e: 'applied'): void }>()

const store = useDomainLearningStore()

/** 画像侧重视图选项（由 shared DL_VIEW_KIND_ORDER/LABELS 派生，单源 M4-A P2-6） */
const EMPHASIS_OPTIONS = DL_VIEW_KIND_ORDER.map((k) => DL_VIEW_KIND_LABELS[k])

const schedulerState = ref<{ mode: string; running: boolean; runningCount: number } | null>(null)
const draft = reactive({
  presetId: 'custom',
  kindLabel: '自定义领域',
  nature: '',
  emphasis: ['流程', '三层结构'] as string[],
})
const paceDraft = ref<DlPaceSettings>({ ...DEFAULT_DL_PACE_SETTINGS })
const reviewDraft = ref<{ enabled: boolean; intervalMin: number; limit: number }>({ ...DEFAULT_DL_REVIEW_SETTINGS })
const reviewBusyId = ref<string | null>(null)
const reviewNote = ref('')
const reviewDueItems = computed(() => store.reviewDue?.items ?? [])

const kbs = ref<DlKbOption[]>([])
const kbIdDraft = ref('')
const kbNote = ref('')

/** 当前空间画像（展示草稿基准） */
const spaceProfile = computed<DlProfileView | null>(() => store.currentSpaceView?.profile ?? null)

function fillDraftFromPreset(presetId: string): void {
  const preset = DL_PROFILE_PRESETS.find((p) => p.id === presetId) ?? DL_PROFILE_PRESETS[DL_PROFILE_PRESETS.length - 1]
  draft.presetId = preset.id
  draft.kindLabel = preset.kindLabel
  draft.nature = preset.nature
  draft.emphasis = [...preset.emphasis]
}

function toggleEmphasis(word: string): void {
  const i = draft.emphasis.indexOf(word)
  if (i >= 0) draft.emphasis.splice(i, 1)
  else draft.emphasis.push(word)
}

async function applyProfile(): Promise<void> {
  const profile = { kindLabel: draft.kindLabel, nature: draft.nature, emphasis: [...draft.emphasis] }
  const ok = await store.saveSpaceProfile({
    id: props.spaceId,
    profileId: draft.presetId === 'custom' ? null : draft.presetId,
    profile,
  })
  if (ok) emit('applied')
}

async function applyPace(): Promise<void> {
  const saved = await store.savePaceOf(props.spaceId, {
    enabled: paceDraft.value.enabled,
    intervalMin: Math.max(1, Math.round(paceDraft.value.intervalMin)),
    autoResearchConcepts: paceDraft.value.autoResearchConcepts,
    autoResolveOpenQuestions: paceDraft.value.autoResolveOpenQuestions,
  })
  if (saved) {
    schedulerState.value = await store.fetchSchedulerState()
  }
}

async function applyReviewSettings(): Promise<void> {
  const saved = await store.saveReviewSettingsOf(props.spaceId, {
    enabled: reviewDraft.value.enabled,
    intervalMin: Math.max(1, Math.round(reviewDraft.value.intervalMin)),
    limit: Math.max(1, Math.round(reviewDraft.value.limit)),
  })
  if (saved) reviewNote.value = '复习设置已保存'
}

/** 开始复习 = agent tutor 一轮（仍基于 agent-harness）；结束后可「完成」刷新基准 */
async function startReview(conceptId: string): Promise<void> {
  if (reviewBusyId.value) return
  reviewBusyId.value = conceptId
  reviewNote.value = ''
  const r = await store.sendAgent({
    mode: 'tutor',
    spaceId: props.spaceId,
    conceptId,
    message: '（间隔复习）请用提问/自测的方式带我复习这个概念，讲清后请总结我仍需注意的薄弱点。',
  })
  reviewBusyId.value = null
  reviewNote.value = r?.content ? r.content.slice(0, 160) + (r.content.length > 160 ? '…' : '') : '复习会话不可用（请先在空间页学习）'
}

async function doneReview(conceptId: string): Promise<void> {
  if (await store.reviewDoneOf(props.spaceId, conceptId)) reviewNote.value = '已记录复习完成'
}

async function needReview(conceptId: string): Promise<void> {
  if (await store.needReviewOf(props.spaceId, conceptId)) reviewNote.value = '已标记为需复习'
}

async function saveKb(): Promise<void> {
  const saved = await store.saveKbOf(props.spaceId, kbIdDraft.value || null)
  if (saved !== null) {
    kbNote.value = kbIdDraft.value ? '已绑定该知识库' : '已解除绑定'
    kbIdDraft.value = saved
  } else {
    kbNote.value = '保存失败（知识库可能无效）'
  }
}

async function loadKbsAndBinding(): Promise<void> {
  kbs.value = await listKnowledgeBases()
  kbIdDraft.value = (await store.spaceMetaKbOf(props.spaceId)) ?? ''
}

onMounted(async () => {
  await loadKbsAndBinding()
  const cur = spaceProfile.value
  fillDraftFromPreset(cur?.id ?? 'custom')
  if (cur && !cur.custom) {
    // 预设空间：保持展示词可再调
    draft.kindLabel = cur.kindLabel || draft.kindLabel
    draft.nature = cur.nature || draft.nature
    if (cur.emphasis.length) draft.emphasis = [...cur.emphasis]
  }
  paceDraft.value = { ...DEFAULT_DL_PACE_SETTINGS, ...((await store.paceOf(props.spaceId)) ?? {}) }
  const rev = await store.reviewSettingsOf(props.spaceId)
  if (rev) reviewDraft.value = { ...reviewDraft.value, ...rev }
  await store.fetchReviewDue(props.spaceId)
  schedulerState.value = await store.fetchSchedulerState()
})
</script>

<style scoped lang="scss">
.settings-body {
  .set-block {
    padding: 6px 0 10px;
    + .set-block {
      border-top: 1px dashed var(--el-border-color-lighter);
    }
  }
  .set-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 8px;
  }
  .set-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    .set-label {
      width: 120px;
      flex-shrink: 0;
      font-size: 12px;
      color: var(--el-text-color-regular);
    }
  }
  .set-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    .pace-state {
      font-size: 11px;
      color: var(--el-text-color-placeholder);
    }
  }
  .em-chip {
    display: inline-block;
    padding: 2px 10px;
    font-size: 12px;
    border-radius: 10px;
    border: 1px solid var(--el-border-color-lighter);
    cursor: pointer;
    margin-right: 6px;
    &.on {
      background: var(--el-color-success);
      border-color: var(--el-color-success);
      color: #fff;
    }
  }
  // 间隔复习（M3-B）
  .review-list {
    margin-top: 8px;
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 6px;
    .review-head {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-bottom: 4px;
    }
    .review-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      padding: 3px 0;
      .review-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
  .review-empty,
  .review-note {
    font-size: 11.5px;
    color: var(--el-text-color-placeholder);
    margin-top: 6px;
  }
  .review-note {
    color: var(--el-color-primary);
  }
}
</style>
