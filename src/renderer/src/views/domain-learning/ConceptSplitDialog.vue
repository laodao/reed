<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="640px"
    top="8vh"
    append-to-body
    :close-on-click-modal="false"
    class="concept-split-dialog"
  >
    <div v-if="!payload" class="cs-empty">
      <el-empty description="还没有拆分方案——研究助手判断这个知识点装不下一份讲义时会提交一份" />
    </div>

    <template v-else>
      <div class="cs-tip">
        研究助手判断「{{ conceptName || '当前知识点' }}」的内容装不进一份讲义，建议拆成一组更细的知识点。
        <b>确认后系统会就地把该知识点转成分支目录</b>，下面的子知识点挂在它下面、各自独立出讲义；
        原知识点的讲义/笔记/问答会退役，外部前置自动继承给每个子知识点。
      </div>

      <section class="cs-section">
        <div class="cs-head">
          <span class="cs-title">拆分方案（{{ payload.children.length }} 个子知识点）</span>
          <el-tag v-if="confirmed" size="small" type="success" effect="plain">已确认执行</el-tag>
          <el-tag v-else size="small" type="warning" effect="plain">待确认</el-tag>
        </div>
        <div v-if="payload.reason" class="cs-reason"><span class="cs-label">为什么拆</span>{{ payload.reason }}</div>
        <div class="cs-line"><span class="cs-label">分支目录</span>{{ payload.branchName || conceptName }}</div>

        <div v-for="(c, i) in payload.children" :key="c.name" class="cs-child">
          <span class="cs-no">{{ i + 1 }}</span>
          <div class="cs-child-main">
            <div class="cs-child-name">
              {{ c.name }}
              <span v-if="c.prerequisites?.length" class="cs-prereq">前置：{{ c.prerequisites.join('、') }}</span>
            </div>
            <div v-if="c.definitionShort" class="cs-child-def">{{ c.definitionShort }}</div>
          </div>
        </div>
      </section>

      <div v-if="!confirmed" class="cs-actions">
        <el-button type="primary" :loading="busy" @click="confirmSplit">确认拆分，转成分支目录</el-button>
        <el-button :loading="busy" @click="sendAdjustment" :disabled="!feedback.trim()">让助手按意见改一版</el-button>
      </div>

      <section v-if="!confirmed" class="cs-adjust">
        <el-input
          v-model="feedback"
          type="textarea"
          :rows="2"
          placeholder="拆得不合适？写一句（例：「生态那块并回架构」「先拆 3 个核心的，其余以后再说」）"
        />
      </section>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 知识点拆分方案确认弹窗（ConceptSplitDialog；2026-10-06 复杂知识点允许 agent 再拆分）
 * @module views/domain-learning/ConceptSplitDialog
 *
 * agent 只产拆分方案（dl_propose_concept_split → dl_plan 的 concept-split 步），
 * 用户在这里确认——**确认即执行**：系统就地把原知识点转成分支目录（splitConceptIntoBranch），
 * 外部前置自动继承、子知识点间前置按方案落边、原讲义/笔记/问答退役。
 * 与讲义方案弹窗（LessonPlanDialog）同构的驱动方式：确认/调整都发一轮带标记的消息。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDomainLearningStore } from '@/stores/domain-learning'
import type { DlConceptSplitPayload } from '@shared/types/domain-learning.types'

const props = defineProps<{
  spaceId: string
  modelValue: boolean
  conceptId: string
  conceptName?: string
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

/** 拆分方案（仅当属于当前概念时才展示——防串台） */
const payload = computed<DlConceptSplitPayload | null>(() => {
  const split = store.plan?.conceptSplit
  if (!split) return null
  if (store.plan?.conceptSplitConceptId && store.plan.conceptSplitConceptId !== props.conceptId) return null
  return split.payload ?? null
})
const confirmed = computed(() => store.plan?.conceptSplitConfirmed === true)

const title = computed(() => {
  const name = props.conceptName ? `「${props.conceptName}」` : ''
  if (!payload.value) return `知识点拆分${name}`
  return confirmed.value ? `知识点拆分${name} · 已执行` : `知识点拆分${name} · 请确认`
})

watch(
  open,
  (v) => {
    if (v) void store.fetchPlan(props.spaceId, props.conceptId)
  },
  { immediate: true },
)

/** 确认拆分（后端确认即执行：原知识点转分支 + 子知识点落库 + 前置边） */
async function confirmSplit(): Promise<void> {
  const p = payload.value
  if (!p) return
  busy.value = true
  try {
    const r = await store.confirmPlan({
      id: props.spaceId,
      step: 'concept-split',
      conceptId: props.conceptId,
      payload: p,
    })
    if (!r.ok) {
      ElMessage.error(r.message)
      return
    }
    ElMessage.success(r.message)
    emit('done')
  } finally {
    busy.value = false
  }
}

/** 把调整意见交给模型，让它重做一版拆分方案 */
async function sendAdjustment(): Promise<void> {
  const text = feedback.value.trim()
  if (!text) return
  busy.value = true
  try {
    await store.sendAgent({
      mode: props.mode ?? 'research',
      spaceId: props.spaceId,
      conceptId: props.conceptId,
      message: `【拆分方案调整】${text}`,
    })
    feedback.value = ''
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped lang="scss">
.cs-empty {
  padding: 6px 2px;
}
.cs-tip {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
  line-height: 1.7;
}
.cs-section {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.cs-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.cs-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cs-reason,
.cs-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  margin-top: 4px;
}
.cs-label {
  flex-shrink: 0;
  min-width: 60px;
  color: var(--el-text-color-placeholder);
}
.cs-child {
  display: flex;
  gap: 8px;
  padding: 6px 0 6px 2px;
  border-top: 1px dashed var(--el-border-color-lighter);
  margin-top: 6px;
}
.cs-child:first-of-type {
  border-top: none;
}
.cs-no {
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
  margin-top: 2px;
}
.cs-child-main {
  flex: 1;
  min-width: 0;
}
.cs-child-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cs-prereq {
  margin-left: 8px;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--el-color-primary);
}
.cs-child-def {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cs-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 10px;
}
.cs-adjust {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
</style>
