<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="820px"
    top="6vh"
    append-to-body
    :close-on-click-modal="false"
    class="plan-confirm-dialog"
  >
    <div v-if="!view" class="pc-empty">
      <el-skeleton :rows="4" animated />
    </div>

    <template v-else>
      <!-- 步骤条：1 对齐诉求 → 2 确认知识体系 → 3 生成 -->
      <el-steps :active="activeStep" simple class="pc-steps">
        <el-step title="对齐诉求" :description="view.understandingConfirmed ? '已确认' : view.understanding ? '待确认' : '未提交'" />
        <el-step title="确认知识体系" :description="view.syllabusConfirmed ? '已确认' : view.syllabus ? '待确认' : '未提交'" />
        <el-step title="生成知识点" :description="view.syllabusConfirmed ? '已放行' : '需先确认'" />
      </el-steps>

      <!-- 第 1 步：模型对诉求的理解 -->
      <section class="pc-section">
        <div class="pc-head">
          <span class="pc-title">① 我理解的你的诉求</span>
          <el-tag v-if="view.understandingConfirmed" size="small" type="success" effect="plain">已确认</el-tag>
          <el-tag v-else-if="view.understanding" size="small" type="warning" effect="plain">待确认</el-tag>
          <el-tag v-else size="small" type="info" effect="plain">模型尚未提交</el-tag>
        </div>
        <template v-if="understanding">
          <div class="pc-goal">{{ understanding.goalSummary }}</div>
          <div class="pc-block">
            <span class="pc-label">要覆盖的对象与场景</span>
            <div class="pc-chips">
              <span v-for="c in understanding.coverage" :key="c" class="pc-chip">{{ c }}</span>
            </div>
          </div>
          <div v-if="understanding.audience" class="pc-line"><span class="pc-label">读者画像</span>{{ understanding.audience }}</div>
          <div v-if="understanding.notDoing?.length" class="pc-line">
            <span class="pc-label">明确不做</span>{{ understanding.notDoing.join('、') }}
          </div>
          <div v-if="understanding.keyExpectations?.length" class="pc-line">
            <span class="pc-label">学完能做到</span>{{ understanding.keyExpectations.join('；') }}
          </div>
        </template>
        <div v-else class="pc-hint">还没有诉求理解草案——先点「生成首批知识」，模型会先提交它的理解。</div>

        <div v-if="understanding && !view.understandingConfirmed" class="pc-actions">
          <el-button type="primary" :loading="busy" @click="confirmUnderstanding">确认理解，继续规划知识体系</el-button>
          <span class="pc-tip">不对？在下面输入你的纠正，模型会重新理解一遍</span>
        </div>
      </section>

      <!-- 第 2 步：知识体系（可勾选增删 + 调序） -->
      <section class="pc-section">
        <div class="pc-head">
          <span class="pc-title">② 知识体系方案</span>
          <el-tag v-if="view.syllabusConfirmed" size="small" type="success" effect="plain">已确认</el-tag>
          <el-tag v-else-if="view.syllabus" size="small" type="warning" effect="plain">待确认</el-tag>
          <el-tag v-else size="small" type="info" effect="plain">模型尚未提交</el-tag>
          <span v-if="selectedCount" class="pc-count">已选 {{ selectedCount }} 个知识点</span>
        </div>

        <template v-if="syllabus">
          <div v-for="(b, bi) in draftBranches" :key="b.key" class="pc-branch">
            <div class="pc-branch-head">
              <el-checkbox v-model="b.checked" :disabled="view.syllabusConfirmed">{{ b.name }}</el-checkbox>
              <span v-if="b.definitionShort" class="pc-branch-desc">{{ b.definitionShort }}</span>
              <span class="pc-branch-ops">
                <el-button link size="small" :disabled="bi === 0 || view.syllabusConfirmed" @click="moveBranch(bi, -1)">上移</el-button>
                <el-button
                  link
                  size="small"
                  :disabled="bi === draftBranches.length - 1 || view.syllabusConfirmed"
                  @click="moveBranch(bi, 1)"
                >下移</el-button>
              </span>
            </div>
            <div class="pc-concepts">
              <div v-for="(c, ci) in b.concepts" :key="c.name" class="pc-concept" :class="{ off: !c.checked }">
                <el-checkbox v-model="c.checked" :disabled="view.syllabusConfirmed">{{ c.name }}</el-checkbox>
                <span v-if="c.definitionShort" class="pc-concept-desc">{{ c.definitionShort }}</span>
                <span v-if="c.prerequisites?.length" class="pc-concept-pre">前置：{{ c.prerequisites.join('、') }}</span>
                <span class="pc-concept-ops">
                  <el-button link size="small" :disabled="ci === 0 || view.syllabusConfirmed" @click="moveConcept(b, ci, -1)">↑</el-button>
                  <el-button
                    link
                    size="small"
                    :disabled="ci === b.concepts.length - 1 || view.syllabusConfirmed"
                    @click="moveConcept(b, ci, 1)"
                  >↓</el-button>
                </span>
              </div>
            </div>
          </div>
          <div v-if="syllabus.notes" class="pc-line pc-notes"><span class="pc-label">方案说明</span>{{ syllabus.notes }}</div>
        </template>
        <div v-else class="pc-hint">
          {{ view.understandingConfirmed ? '模型正在规划知识体系…' : '先确认第 ① 步的诉求理解，模型才会规划知识体系（固定流程，顺序不可跳）' }}
        </div>

        <div v-if="syllabus && !view.syllabusConfirmed" class="pc-actions">
          <el-button type="primary" :loading="busy" :disabled="selectedCount === 0" @click="confirmSyllabus">
            确认并生成这 {{ selectedCount }} 个知识点
          </el-button>
          <span class="pc-tip">取消勾选=不生成；↑↓=调整顺序（顺序会影响学习路径）</span>
        </div>
      </section>

      <!-- 调整指令：让模型重做当前步骤 -->
      <section class="pc-adjust">
        <el-input
          v-model="feedback"
          type="textarea"
          :rows="2"
          :placeholder="adjustPlaceholder"
          :disabled="view.syllabusConfirmed && view.understandingConfirmed"
        />
        <el-button class="pc-adjust-btn" :loading="busy" :disabled="!feedback.trim()" @click="sendAdjustment">
          让模型按这个改一版
        </el-button>
      </section>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 知识体系方案确认弹窗（2026-09-13 用户需求）
 * @module views/domain-learning/PlanConfirmDialog
 *
 * 固定三步：① 模型复述诉求 → 用户确认/纠正；② 模型给知识体系（可勾选增删、调序）→ 用户确认；
 * ③ 确认后才驱动落库轮生成知识点。宿主在动作层还有硬门禁复核，这里不是"提示一下"。
 *
 * 驱动下一轮的方式：确认后由本组件发出带标记的消息（【已确认诉求理解】/【已确认知识体系】），
 * 宿主据此注入对应阶段指令（见 dl-agent-deps 的 plan*PhaseInstruction）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDomainLearningStore } from '@/stores/domain-learning'
import {
  countCheckedConcepts,
  moveItem,
  toSyllabusDraft,
  toSyllabusPayload,
  type SyllabusDraftBranch,
} from '@shared/utils/domain-learning-plan-draft'
import type { DlPlanSyllabus } from '@shared/types/domain-learning.types'

const props = defineProps<{
  spaceId: string
  modelValue: boolean
  /** 驱动下一轮用的会话模式：起步研究=research；补全知识地图=task */
  mode: 'research' | 'task'
  conceptId?: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; done: [] }>()

const store = useDomainLearningStore()
const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})
const busy = ref(false)
const feedback = ref('')
const view = computed(() => store.plan)

const title = computed(() => {
  if (!view.value) return '知识体系方案'
  if (!view.value.understanding) return '知识体系方案 · 等模型提交诉求理解'
  if (!view.value.understandingConfirmed) return '知识体系方案 · 请先确认你的诉求'
  if (!view.value.syllabus) return '知识体系方案 · 模型正在规划'
  if (!view.value.syllabusConfirmed) return '知识体系方案 · 请确认后生成知识点'
  return '知识体系方案 · 已确认'
})

const activeStep = computed(() => {
  if (!view.value) return 0
  if (!view.value.understandingConfirmed) return 0
  if (!view.value.syllabusConfirmed) return 1
  return 3
})

const understanding = computed(() => (view.value?.understanding?.payload ?? null) as
  | { goalSummary: string; coverage: string[]; audience?: string | null; notDoing?: string[]; keyExpectations?: string[] }
  | null)

/** 知识体系方案（最新草案或已确认版） */
const syllabus = computed(() => (view.value?.syllabus?.payload ?? null) as DlPlanSyllabus | null)

/** 可编辑草稿（勾选态 + 顺序）；每次方案变化时重建。纯逻辑在 shared/utils/domain-learning-plan-draft（已单测） */
const draftBranches = ref<SyllabusDraftBranch[]>([])

function rebuildDraft(syllabus: DlPlanSyllabus | null): void {
  draftBranches.value = toSyllabusDraft(syllabus)
}

watch(
  () => view.value?.syllabus?.revision,
  () => rebuildDraft((view.value?.syllabus?.payload ?? null) as DlPlanSyllabus | null),
  { immediate: true },
)
watch(
  open,
  (v) => {
    if (v) void store.fetchPlan(props.spaceId)
  },
  { immediate: true },
)

const selectedCount = computed(() => countCheckedConcepts(draftBranches.value))

const adjustPlaceholder = computed(() => {
  if (!view.value?.understandingConfirmed) return '对诉求理解有偏差？写一句（例：「我不要个人记账，要能看懂股票行情和财报」）'
  return '方案要改？写一句（例：「加一个分支讲基金，把债券放到它后面」）'
})

function moveBranch(i: number, delta: number): void {
  draftBranches.value = moveItem(draftBranches.value, i, delta)
}

function moveConcept(branch: SyllabusDraftBranch, i: number, delta: number): void {
  branch.concepts = moveItem(branch.concepts, i, delta)
}

/** 确认诉求理解 → 驱动第 2 步（规划知识体系） */
async function confirmUnderstanding(): Promise<void> {
  busy.value = true
  try {
    const r = await store.confirmPlan({ id: props.spaceId, step: 'understanding' })
    if (!r.ok) {
      ElMessage.error(r.message)
      return
    }
    ElMessage.success(r.message)
    await driveNext('【已确认诉求理解】请按已确认的诉求规划知识体系，并提交方案（每个分支都必须有知识点）。')
    emit('done')
  } finally {
    busy.value = false
  }
}

/** 确认知识体系（带用户勾选/排序结果）→ 驱动第 3 步（按方案落库） */
async function confirmSyllabus(): Promise<void> {
  const payload = toSyllabusPayload(draftBranches.value)
  if (payload.branches.length === 0) {
    ElMessage.warning('至少要保留一个分支及其知识点')
    return
  }
  busy.value = true
  try {
    const r = await store.confirmPlan({ id: props.spaceId, step: 'syllabus', payload })
    if (!r.ok) {
      ElMessage.error(r.message)
      return
    }
    ElMessage.success(`${r.message}（${selectedCount.value} 个知识点）`)
    await driveNext('【已确认知识体系】请按已确认的方案落库知识点与前置关系，并为其中最基础的一个先出讲义。')
    emit('done')
  } finally {
    busy.value = false
  }
}

/** 把调整意见交给模型，让它重做当前这一步 */
async function sendAdjustment(): Promise<void> {
  const text = feedback.value.trim()
  if (!text) return
  busy.value = true
  try {
    await driveNext(`【方案调整】${text}`)
    feedback.value = ''
    emit('done')
  } finally {
    busy.value = false
  }
}

/** 发一轮消息驱动 agent（宿主按标记注入阶段指令） */
async function driveNext(message: string): Promise<void> {
  await store.sendAgent({
    mode: props.mode,
    spaceId: props.spaceId,
    conceptId: props.conceptId ?? null,
    message,
  })
  await store.fetchPlan(props.spaceId)
}
</script>

<style scoped lang="scss">
.pc-empty {
  padding: 8px 4px;
}
.pc-steps {
  margin-bottom: 14px;
}
.pc-section {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.pc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.pc-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.pc-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pc-goal {
  font-size: 14px;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}
.pc-block {
  margin-bottom: 6px;
}
.pc-label {
  display: inline-block;
  min-width: 88px;
  color: var(--el-text-color-secondary);
  font-size: 12.5px;
}
.pc-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  vertical-align: top;
}
.pc-chip {
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12.5px;
}
.pc-line {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-top: 4px;
}
.pc-notes {
  color: var(--el-text-color-secondary);
}
.pc-hint {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.pc-branch {
  border-left: 3px solid var(--el-color-primary-light-5);
  padding-left: 10px;
  margin-bottom: 10px;
}
.pc-branch-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pc-branch-desc,
.pc-concept-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pc-branch-ops {
  margin-left: auto;
}
.pc-concepts {
  padding-left: 18px;
}
.pc-concept {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;

  &.off {
    opacity: 0.45;
  }
}
.pc-concept-pre {
  font-size: 12px;
  color: var(--el-color-warning);
}
.pc-concept-ops {
  margin-left: auto;
}
.pc-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.pc-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pc-adjust {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.pc-adjust-btn {
  flex: 0 0 auto;
}
</style>
