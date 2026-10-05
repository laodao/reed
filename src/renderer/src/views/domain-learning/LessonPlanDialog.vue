<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="860px"
    top="5vh"
    append-to-body
    :close-on-click-modal="false"
    class="lesson-plan-dialog"
  >
    <div v-if="!spec" class="lp-empty">
      <el-empty description="还没有讲义方案——研究助手会先提交一份，稍等或重新发起研究" />
    </div>

    <template v-else>
      <div class="lp-tip">
        这是「先规划、再写正文」的讲义方案：确认后研究助手会按每区的版式逐区精写，落库时按它校验。
        你可以直接改每区的版式，或在下面写调整意见让它重做一版。
      </div>

      <!-- 规格：读者 / 目标 / 深度篇幅 -->
      <section class="lp-section">
        <div class="lp-head">
          <span class="lp-title">① 写给谁 · 学到什么程度</span>
          <el-tag v-if="confirmed" size="small" type="success" effect="plain">已确认</el-tag>
          <el-tag v-else size="small" type="warning" effect="plain">待确认</el-tag>
          <span class="lp-essence">{{ essenceType }}</span>
        </div>
        <div class="lp-audience">{{ spec.audience }}</div>
        <div v-if="spec.outcomes?.length" class="lp-line">
          <span class="lp-label">学完能做到</span>
          <span>{{ spec.outcomes.join('；') }}</span>
        </div>
        <div class="lp-line">
          <span class="lp-label">深度/篇幅</span>
          <span>{{ spec.depth }} · 目标 {{ spec.budget.sections }} 区 · 非重点区 ≤{{ spec.budget.charsPerSection }} 字 · 重点区详写</span>
        </div>
        <div v-if="spec.tone" class="lp-line"><span class="lp-label">语气</span><span>{{ spec.tone }}</span></div>
      </section>

      <!-- 术语 / 记号 / 示例参数 -->
      <section v-if="hasVocabulary" class="lp-section">
        <div class="lp-head"><span class="lp-title">② 术语 · 记号 · 算例参数</span></div>
        <div v-if="spec.glossary?.length" class="lp-line">
          <span class="lp-label">术语</span>
          <span class="lp-chips">
            <el-tooltip v-for="g in spec.glossary" :key="g.term" :content="g.plain" placement="top">
              <span class="lp-chip">{{ g.term }}</span>
            </el-tooltip>
          </span>
        </div>
        <div v-if="spec.notation?.length" class="lp-line">
          <span class="lp-label">记号</span>
          <span class="lp-chips">
            <el-tooltip
              v-for="n in spec.notation"
              :key="n.symbol"
              :content="`${n.read}${n.example ? `；例：${n.example}` : ''}`"
              placement="top"
            >
              <span class="lp-chip mono">{{ n.symbol }}</span>
            </el-tooltip>
          </span>
        </div>
        <div v-if="spec.exampleParams?.length" class="lp-line">
          <span class="lp-label">算例参数</span>
          <span class="lp-chips">
            <span v-for="p in spec.exampleParams" :key="p.name" class="lp-chip">{{ p.name }}={{ p.value }}</span>
          </span>
        </div>
        <div v-if="spec.visualPlan" class="lp-line"><span class="lp-label">视觉计划</span><span>{{ spec.visualPlan }}</span></div>
      </section>

      <!-- 区级计划（可改版式） -->
      <section class="lp-section">
        <div class="lp-head">
          <span class="lp-title">③ 区级计划（{{ draft.length }} 区，按此顺序与版式写正文）</span>
          <span v-if="!confirmed" class="lp-count">版式可改</span>
        </div>
        <div v-for="(r, i) in draft" :key="r.key" class="lp-row">
          <span class="lp-no">{{ i + 1 }}</span>
          <span class="lp-key">{{ r.key }}</span>
          <el-select
            v-model="r.layout"
            size="small"
            :disabled="confirmed"
            class="lp-layout"
          >
            <el-option v-for="d in devices" :key="d.key" :label="d.name" :value="d.key" />
          </el-select>
          <span v-if="r.carrier" class="lp-carrier">载体：{{ r.carrier }}</span>
          <span class="lp-job" :title="r.job">{{ r.job }}</span>
        </div>
      </section>

      <div v-if="!confirmed" class="lp-actions">
        <el-button type="primary" :loading="busy" @click="confirmPlan">确认方案，开始逐区精写</el-button>
        <span class="lp-hint">确认后助手会按上面的版式逐区写正文（每 3 区回读一次规格，防术语/算例漂移）</span>
      </div>

      <section class="lp-adjust">
        <el-input
          v-model="feedback"
          type="textarea"
          :rows="2"
          placeholder="方案要改？写一句（例：「术语表补上久期与凸性」「构成与分类那区改成一张对比表」）"
        />
        <el-button class="lp-adjust-btn" :loading="busy" :disabled="!feedback.trim()" @click="sendAdjustment">
          让模型按这个改一版
        </el-button>
      </section>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 讲义方案确认弹窗（LessonPlanDialog；2026-09-14 讲义流水线）
 * @module views/domain-learning/LessonPlanDialog
 *
 * 参考 ppt-master 的两阶段确认（Stage-1 沟通契约 / Stage-2 方案）：讲义在**动笔之前**先把
 * 「写给谁、学完能做到什么、多深多长、术语与记号怎么教、每个区用什么版式承载什么」摆给用户确认。
 * 用户可改每区版式或写调整意见；确认后驱动下一轮（【已确认讲义方案】），模型据此逐区精写。
 *
 * 驱动方式与知识体系弹窗同构：确认/调整都发一轮带标记的消息，宿主按标记注入阶段指令
 * （见 dl-agent-deps 的 lessonAuthoringInstruction）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDomainLearningStore } from '@/stores/domain-learning'
import { LESSON_LAYOUT_CATALOG } from '@shared/utils/lesson-layout'
import type { DlLessonPlanEntry, DlLessonSpec } from '@shared/types/domain-learning.types'

const props = defineProps<{
  spaceId: string
  modelValue: boolean
  /** 讲义是按概念写的：必须给出概念 id */
  conceptId: string
  conceptName?: string
  /** 驱动下一轮用的会话模式（研究轮产生讲义方案；任务轮也能规划） */
  mode?: 'research' | 'task'
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; done: [] }>()

const store = useDomainLearningStore()
const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const busy = ref(false)
const feedback = ref('')

/** 讲义方案（仅当方案属于当前概念时才展示——防串台） */
const payload = computed(() => {
  const lesson = store.plan?.lesson
  if (!lesson) return null
  if (store.plan?.lessonConceptId && store.plan.lessonConceptId !== props.conceptId) return null
  return lesson.payload ?? null
})
const essenceType = computed(() => payload.value?.essenceType ?? '')
const spec = computed<DlLessonSpec | null>(() => payload.value?.spec ?? null)
/** 是否已确认（读宿主给的权威标记，不自己按状态字段推断） */
const confirmed = computed(() => store.plan?.lessonConfirmed === true)

const devices = LESSON_LAYOUT_CATALOG.map((d) => ({ key: d.key, name: d.name }))

/** 可编辑草稿（版式可改；其它字段只读展示，改动走"调整意见"） */
const draft = ref<DlLessonPlanEntry[]>([])

function rebuildDraft(s: DlLessonSpec | null): void {
  draft.value = (s?.roster ?? []).map((r) => ({ ...r }))
}

watch(
  () => store.plan?.lesson?.revision,
  () => rebuildDraft(spec.value),
  { immediate: true },
)
watch(
  () => spec.value,
  (s) => rebuildDraft(s),
)

watch(
  open,
  (v) => {
    if (v) void store.fetchPlan(props.spaceId, props.conceptId)
  },
  { immediate: true },
)

const hasVocabulary = computed(
  () => !!(spec.value?.glossary?.length || spec.value?.notation?.length || spec.value?.exampleParams?.length || spec.value?.visualPlan),
)

const title = computed(() => {
  const name = props.conceptName ? `「${props.conceptName}」` : ''
  if (!spec.value) return `讲义方案${name}`
  return confirmed.value ? `讲义方案${name} · 已确认` : `讲义方案${name} · 请确认后开始写`
})

/** 确认方案（带上用户改过的版式）→ 驱动逐区精写 */
async function confirmPlan(): Promise<void> {
  const s = spec.value
  if (!s) return
  busy.value = true
  try {
    const r = await store.confirmPlan({
      id: props.spaceId,
      step: 'lesson',
      conceptId: props.conceptId,
      payload: { conceptId: props.conceptId, essenceType: essenceType.value, spec: { ...s, roster: draft.value } },
    })
    if (!r.ok) {
      ElMessage.error(r.message)
      return
    }
    ElMessage.success(r.message)
    await driveNext('【已确认讲义方案】请按已确认的规格与区级计划逐区精写讲义正文，写完后 dl_save_card 落库。')
    emit('done')
  } finally {
    busy.value = false
  }
}

/** 把调整意见交给模型，让它重做一版讲义方案 */
async function sendAdjustment(): Promise<void> {
  const text = feedback.value.trim()
  if (!text) return
  busy.value = true
  try {
    await driveNext(`【讲义方案调整】${text}`)
    feedback.value = ''
    emit('done')
  } finally {
    busy.value = false
  }
}

async function driveNext(message: string): Promise<void> {
  await store.sendAgent({
    mode: props.mode ?? 'research',
    spaceId: props.spaceId,
    conceptId: props.conceptId,
    message,
  })
  await store.fetchPlan(props.spaceId, props.conceptId)
}
</script>

<style scoped lang="scss">
.lp-empty {
  padding: 6px 2px;
}
.lp-tip {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
}
.lp-section {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.lp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.lp-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.lp-essence {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.lp-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.lp-audience {
  font-size: 13.5px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}
.lp-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  margin-top: 4px;
}
.lp-label {
  flex-shrink: 0;
  min-width: 72px;
  color: var(--el-text-color-placeholder);
}
.lp-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
}
.lp-chip {
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  cursor: default;

  &.mono {
    font-family: var(--el-font-family-mono, monospace);
  }
}
.lp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12.5px;
}
.lp-no {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 10.5px;
  font-weight: 700;
}
.lp-key {
  flex-shrink: 0;
  min-width: 84px;
  font-family: var(--el-font-family-mono, monospace);
  color: var(--el-text-color-primary);
}
.lp-layout {
  flex-shrink: 0;
  width: 130px;
}
.lp-carrier {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--el-color-primary);
}
.lp-job {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
}
.lp-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 10px;
}
.lp-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.lp-adjust {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.lp-adjust-btn {
  flex: 0 0 auto;
}
</style>
