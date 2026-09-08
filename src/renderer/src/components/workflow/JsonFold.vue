<template>
  <div class="json-fold">
    <div class="jf-summary" @click="expanded = !expanded">
      <span class="jf-text" :class="{ empty: !summaryText }">{{ summaryText }}</span>
      <el-tag size="small" :type="expanded ? 'info' : 'primary'" effect="plain" class="jf-toggle">
        {{ expanded ? '收起' : '展开' }}
      </el-tag>
    </div>
    <pre v-if="expanded" class="jf-full">{{ fullText }}</pre>
  </div>
</template>

<script setup lang="ts">
/**
 * JSON 折叠展示：首行摘要（截断）+ 点击展开完整 JSON。
 * 用于环节详情/历史输出物中的 input/output 等大结构展示。
 */
import { computed, ref } from 'vue'
import { formatJsonText } from '../../utils/workflow-run-detail-utils'

const props = withDefaults(
  defineProps<{
    value: unknown
    /** 摘要最大字符数 */
    maxSummaryChars?: number
    /** 展开时 JSON 最大字符数（超过截断） */
    maxChars?: number
  }>(),
  { maxSummaryChars: 160, maxChars: 20_000 }
)

const expanded = ref(false)

/** 单行摘要：JSON.stringify 无缩进的最紧凑形态 */
const summaryText = computed(() => {
  if (props.value === undefined || props.value === null) return ''
  let s = ''
  try {
    s = JSON.stringify(props.value)
  } catch {
    return String(props.value)
  }
  if (!s) return '（空）'
  if (s.length <= (props.maxSummaryChars ?? 160)) return s
  return `${s.slice(0, props.maxSummaryChars ?? 160)}…`
})

/** 完整展开：带缩进、截断上限 */
const fullText = computed(() => formatJsonText(props.value, props.maxChars ?? 20_000))
</script>

<style scoped>
.json-fold { display: flex; flex-direction: column; gap: 4px; }
.jf-summary {
  display: flex; align-items: center; gap: 8px; justify-content: space-between;
  padding: 6px 8px; background: var(--el-fill-color-light); border-radius: 6px;
  cursor: pointer; font-size: 12px;
}
.jf-summary:hover { background: var(--el-fill-color); }
.jf-text { flex: 1; min-width: 0; color: var(--el-text-color-primary); word-break: break-all; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jf-text.empty { color: var(--el-text-color-placeholder); }
.jf-toggle { flex: none; }
.jf-full {
  margin: 0; padding: 10px 12px; background: var(--el-fill-color-light); border-radius: 6px;
  font-size: 12px; line-height: 1.6; max-height: 320px; overflow: auto;
  white-space: pre-wrap; word-break: break-all; color: var(--el-text-color-regular);
}
</style>
