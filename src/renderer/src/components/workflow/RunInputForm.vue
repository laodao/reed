<template>
  <el-form label-position="top" size="small" @submit.prevent>
    <template v-for="item in inputs" :key="item.key">
      <el-form-item>
        <template #label>
          {{ item.label || item.key }}
          <el-tag v-if="item.required" size="small" type="danger" effect="plain">必填</el-tag>
        </template>

        <!-- 文本 -->
        <el-input v-if="!item.type || item.type === 'string'" v-model="values[item.key]"
          :placeholder="`请输入${item.label || item.key}`" />

        <!-- 数字 -->
        <el-input-number v-else-if="item.type === 'number'" v-model="numValues[item.key]"
          style="width: 100%" />

        <!-- 布尔 -->
        <el-switch v-else-if="item.type === 'boolean'" v-model="values[item.key]" />

        <!-- 下拉（multi 多选） -->
        <el-select v-else-if="item.type === 'select'" v-model="values[item.key]"
          :multiple="!!item.multi" clearable filterable placeholder="请选择" style="width: 100%">
          <el-option v-for="o in item.options ?? []" :key="String(o.value)" :label="o.label" :value="o.value" />
        </el-select>

        <!-- JSON -->
        <el-input v-else-if="item.type === 'json'" v-model="values[item.key]" type="textarea"
          :rows="3" placeholder='{"key": "value"}' />

        <div v-if="item.multi" class="multi-hint">可多选</div>
      </el-form-item>
    </template>
    <div v-if="!inputs.length" class="no-inputs">该工作流没有输入参数，可直接运行</div>
  </el-form>
</template>

<script setup lang="ts">
/**
 * 运行输入表单：按 start 节点 config.inputs 动态渲染（A4，替代 JSON 对话框）
 * 列表页运行与编辑器调试面板共用。
 */
import { reactive, computed, watch } from 'vue'
import type { WorkflowStartInput } from '@shared/types/workflow.types'

const props = defineProps<{ inputs: WorkflowStartInput[] }>()
const emit = defineEmits<{ (e: 'valid', ok: boolean): void }>()

/** 字符串/布尔/下拉/json 的值（json 以文本暂存） */
const values = reactive<Record<string, unknown>>({})
/** 数字值（el-input-number 需要 number|null） */
const numValues = reactive<Record<string, number | undefined>>({})

/** defaultValue 预填 */
watch(() => props.inputs, list => {
  for (const item of list) {
    if (item.defaultValue !== undefined && values[item.key] === undefined) {
      if (item.type === 'number') numValues[item.key] = Number(item.defaultValue)
      else if (item.type === 'json') values[item.key] = JSON.stringify(item.defaultValue)
      else values[item.key] = item.defaultValue
    }
  }
}, { immediate: true, deep: true })

/** 必填校验（P8 同款类型感知） */
const isValid = computed(() => {
  for (const item of props.inputs) {
    if (!item.required) continue
    let v: unknown
    if (item.type === 'number') v = numValues[item.key]
    else v = values[item.key]
    if (v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0)) return false
  }
  return true
})
watch(isValid, ok => emit('valid', ok), { immediate: true })

/** 导出提交值（json 解析、number 归位、multi 保数组） */
function getValues(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const item of props.inputs) {
    if (item.type === 'number') {
      if (numValues[item.key] !== undefined) out[item.key] = numValues[item.key]
    } else if (item.type === 'json') {
      const raw = values[item.key]
      if (raw !== undefined && raw !== '') {
        try { out[item.key] = JSON.parse(String(raw)) } catch { out[item.key] = raw }
      }
    } else if (values[item.key] !== undefined) {
      out[item.key] = values[item.key]
    }
  }
  return out
}
defineExpose({ getValues, isValid })
</script>

<style scoped>
.multi-hint { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 2px; }
.no-inputs { color: var(--el-text-color-secondary); text-align: center; padding: 16px 0; }
</style>
