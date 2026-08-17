<template>
  <!-- 按 Schema 字段类型分发渲染 -->
  <div v-if="field.type === 'text'" class="field-with-picker">
    <el-input ref="inputRef" :model-value="modelValue as string" :placeholder="field.placeholder"
      @update:model-value="v => set(v)" />
    <VariablePicker v-if="field.templateHint" :nodes="pickerNodes.nodes" :exclude-node-id="pickerNodes.excludeNodeId" @insert="p => insertAtCursor(p)" />
  </div>
  <div v-else-if="field.type === 'textarea'" class="field-with-picker column">
    <div class="picker-row">
      <VariablePicker v-if="field.templateHint" :nodes="pickerNodes.nodes" :exclude-node-id="pickerNodes.excludeNodeId" @insert="p => insertAtCursor(p)" />
    </div>
    <el-input ref="inputRef" :model-value="modelValue as string" :placeholder="field.placeholder"
      type="textarea" :rows="4" @update:model-value="v => set(v)" />
  </div>
  <el-input-number v-else-if="field.type === 'number'" :model-value="num(modelValue)" :min="field.min" :max="field.max"
    :placeholder="field.placeholder" style="width: 100%" @update:model-value="v => set(v)" />
  <el-select v-else-if="field.type === 'select'" :model-value="modelValue" :placeholder="field.placeholder || '请选择'"
    clearable style="width: 100%" @update:model-value="v => set(v)">
    <el-option v-for="o in field.options" :key="String(o.value)" :label="o.label" :value="o.value" />
  </el-select>
  <el-select v-else-if="field.type === 'select-dynamic'" :model-value="modelValue"
    :placeholder="field.placeholder || '请选择'" clearable filterable style="width: 100%" @update:model-value="v => set(v)">
    <el-option v-for="o in dynamicOptions[field.source ?? ''] ?? []" :key="o.value" :label="o.label" :value="o.value" />
  </el-select>
  <el-switch v-else-if="field.type === 'switch'" :model-value="!!modelValue" @update:model-value="v => set(v)" />
  <div v-else-if="field.type === 'slider'" class="slider-row">
    <el-slider :model-value="num(modelValue) || field.min || 0" :min="field.min ?? 0" :max="field.max ?? 100"
      :step="field.step ?? 1" style="flex: 1; margin-right: 12px" @update:model-value="v => set(v)" />
    <span class="slider-value">{{ num(modelValue) }}</span>
  </div>

  <!-- Provider + 模型联动下拉 -->
  <div v-else-if="field.type === 'model-pair'" class="model-pair">
    <el-select :model-value="modelValue as string" placeholder="Provider" clearable filterable
      size="small" style="flex: 1" @update:model-value="v => { set(v); setKey('modelId', undefined) }">
      <el-option v-for="p in providers" :key="p.id" :label="p.name" :value="p.id" />
    </el-select>
    <el-select :model-value="props.model['modelId'] as string" placeholder="模型（留空自动）" clearable
      filterable size="small" style="flex: 1" @update:model-value="v => setKey('modelId', v)">
      <el-option v-for="m in currentProviderModels" :key="m.value" :label="m.label" :value="m.value" />
    </el-select>
  </div>

  <!-- 键值对列表 -->
  <div v-else-if="field.type === 'kv-list'" class="kv-list">
    <div v-for="(item, i) in kvList" :key="i" class="kv-row">
      <el-input v-model="item.key" :placeholder="field.keyPlaceholder || '键'" size="small" @change="syncKv" />
      <el-input v-model="item.value" :placeholder="field.valuePlaceholder || '值'" size="small" @change="syncKv" />
      <el-button text type="danger" size="small" @click="kvList.splice(i, 1); syncKv()">✕</el-button>
    </div>
    <el-button size="small" text type="primary" @click="kvList.push({ key: '', value: '' }); syncKv()">+ 添加</el-button>
  </div>

  <!-- 条件分支编辑器 -->
  <div v-else-if="field.type === 'branches'" class="branches-editor">
    <div v-for="(br, i) in branches" :key="i" class="branch-card">
      <div class="branch-head">
        <el-tag size="small" type="primary">{{ br.branchId }}</el-tag>
        <el-input v-model="br.label" placeholder="分支名" size="small" style="width: 120px" @change="syncBranches" />
        <el-button text type="danger" size="small" @click="branches.splice(i, 1); syncBranches()">删除</el-button>
      </div>
      <div v-for="(cond, j) in br.conditions" :key="j" class="cond-row">
        <el-input v-model="cond.left" placeholder="左值 {{节点.字段}}" size="small" @change="syncBranches" />
        <el-select v-model="cond.operator" size="small" style="width: 110px" @change="syncBranches">
          <el-option label="等于" value="eq" /><el-option label="不等于" value="ne" />
          <el-option label="大于" value="gt" /><el-option label="≥" value="gte" />
          <el-option label="小于" value="lt" /><el-option label="≤" value="lte" />
          <el-option label="包含" value="contains" /><el-option label="不包含" value="not_contains" />
          <el-option label="为空" value="is_empty" /><el-option label="非空" value="not_empty" />
          <el-option label="正则" value="regex" /><el-option label="开始为" value="starts_with" /><el-option label="结束为" value="ends_with" />
        </el-select>
        <el-input v-if="!['is_empty', 'not_empty'].includes(cond.operator)" v-model="cond.right"
          placeholder="右值" size="small" @change="syncBranches" />
        <el-button text type="danger" size="small"
          @click="br.conditions.splice(j, 1); syncBranches()">✕</el-button>
      </div>
      <el-button size="small" text type="primary" @click="br.conditions.push({ left: '', operator: 'eq', right: '' }); syncBranches()">+ 条件</el-button>
    </div>
    <el-button size="small" text type="primary"
      @click="branches.push({ branchId: `br${branches.length + 1}`, label: `分支${branches.length + 1}`, conditions: [] }); syncBranches()">+ 分支</el-button>
  </div>

  <!-- 开始节点输入参数编辑器 -->
  <div v-else-if="field.type === 'inputs-list'" class="kv-list">
    <template v-for="(item, i) in inputs" :key="i">
    <div class="kv-row inputs-row">
      <el-input v-model="item.key" placeholder="参数键" size="small" @change="syncInputs" />
      <el-input v-model="item.label" placeholder="显示名" size="small" @change="syncInputs" />
      <el-select v-model="item.type" size="small" style="width: 90px" @change="syncInputs">
        <el-option label="文本" value="string" /><el-option label="数字" value="number" />
        <el-option label="布尔" value="boolean" /><el-option label="JSON" value="json" />
        <el-option label="下拉" value="select" />
      </el-select>
      <el-checkbox v-model="item.required" size="small" @change="syncInputs">必填</el-checkbox>
      <el-button text type="danger" size="small" @click="inputs.splice(i, 1); syncInputs()">✕</el-button>
    </div>
    <div v-if="item.type === 'select'" class="options-sub">
      <div class="kv-row" style="padding-left: 12px">
        <el-checkbox v-model="item.multi" size="small" @change="syncInputs">多选</el-checkbox>
        <el-button size="small" text type="primary" @click="(item.options ??= []).push({ label: '', value: '' }); syncInputs()">+ 选项</el-button>
      </div>
      <div v-for="(opt, j) in item.options ?? []" :key="j" class="kv-row" style="padding-left: 24px">
        <el-input v-model="opt.label" placeholder="显示名" size="small" style="width: 110px" @change="syncInputs" />
        <el-input v-model="opt.value" placeholder="值" size="small" style="width: 110px" @change="syncInputs" />
        <el-button text type="danger" size="small" @click="item.options!.splice(j, 1); syncInputs()">✕</el-button>
      </div>
    </div>
    </template>
    <div v-for="(item, i) in inputs" :key="'d' + i" class="kv-row">
      <span class="default-label">默认值</span>
      <el-input :model-value="String(item.defaultValue ?? '')" placeholder="定时触发时使用" size="small"
        @update:model-value="v => { item.defaultValue = v; syncInputs() }" />
    </div>
    <el-button size="small" text type="primary" @click="inputs.push({ key: '', label: '', type: 'string' }); syncInputs()">+ 参数</el-button>
  </div>

  <!-- 审核可编辑字段编辑器 -->
  <div v-else-if="field.type === 'fields-list'" class="kv-list">
    <div v-for="(item, i) in editableFields" :key="i" class="kv-row">
      <el-input v-model="item.key" placeholder="字段键（payload 顶层）" size="small" @change="syncFields" />
      <el-input v-model="item.label" placeholder="显示名" size="small" @change="syncFields" />
      <el-button text type="danger" size="small" @click="editableFields.splice(i, 1); syncFields()">✕</el-button>
    </div>
    <el-button size="small" text type="primary" @click="editableFields.push({ key: '', label: '', type: 'string' }); syncFields()">+ 字段</el-button>
  </div>
</template>

<script setup lang="ts">
/**
 * 单字段渲染器：按 CatalogFormField.type 分发到 Element Plus 组件或专用编辑器
 */
import type { CatalogFormField } from '@shared/types/workflow-node-forms'
import type { WorkflowConditionBranch, WorkflowStartInput } from '@shared/types/workflow.types'
import VariablePicker from './VariablePicker.vue'
import { computed, inject, ref, unref, type ComponentPublicInstance, type Ref } from 'vue'

// 变量选择器数据（NodeConfigPanel provide；缺省退化为空）
const pickerCtx = inject<{ nodes: Ref<any[]>; excludeNodeId: unknown }>('wfPickerContext', { nodes: ref([]), excludeNodeId: '' })
const pickerNodes = computed(() => ({ nodes: unref(pickerCtx.nodes), excludeNodeId: pickerCtx.excludeNodeId }))
const inputRef = ref<ComponentPublicInstance | null>(null)

/** 光标处插入 {{path}}（P10：拿不到原生 ref 时追加末尾兜底） */
function insertAtCursor(path: string) {
  const comp: any = inputRef.value
  const el: HTMLInputElement | HTMLTextAreaElement | undefined =
    comp?.textarea ?? comp?.input ?? comp?.$el?.querySelector?.('textarea, input')
  const text = String(props.model[props.field.key] ?? '')
  const snippet = `{{${path}}}`
  if (el && typeof el.selectionStart === 'number') {
    const start = el.selectionStart
    props.model[props.field.key] = text.slice(0, start) + snippet + text.slice(el.selectionEnd ?? start)
    emit('change')
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + snippet.length
      if (el.setSelectionRange) el.setSelectionRange(pos, pos)
    })
  } else {
    props.model[props.field.key] = text + snippet
    emit('change')
  }
}

const props = defineProps<{
  field: CatalogFormField
  model: Record<string, unknown>
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>
}>()
const emit = defineEmits<{ (e: 'change'): void }>()

const modelValue = computed(() => props.model[props.field.key])

function set(v: unknown) {
  props.model[props.field.key] = v
  emit('change')
}
function num(v: unknown): number | undefined {
  const n = Number(v)
  return v === undefined || v === null || v === '' || Number.isNaN(n) ? undefined : n
}

// ── model-pair ──
const providers = computed<any[]>(() => props.dynamicOptions.providers ?? [])
const currentProviderModels = computed(() =>
  providers.value.find(p => p.id === modelValue.value)?.models ?? []
)
function setKey(key: string, v: unknown) {
  props.model[key] = v
  emit('change')
}

// ── kv-list ──
const kvList = computed<any[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as any[]
  }
  return raw as any[]
})
function syncKv() { emit('change') }

// ── branches ──
const branches = computed<WorkflowConditionBranch[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as WorkflowConditionBranch[]
  }
  return raw as WorkflowConditionBranch[]
})
function syncBranches() { emit('change') }

// ── inputs-list ──
const inputs = computed<WorkflowStartInput[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as WorkflowStartInput[]
  }
  return raw as WorkflowStartInput[]
})
function syncInputs() { emit('change') }

// ── fields-list ──
const editableFields = computed<any[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as any[]
  }
  return raw as any[]
})
function syncFields() { emit('change') }
</script>

<style scoped>
.slider-row { display: flex; align-items: center; }
.slider-value { font-size: 12px; min-width: 30px; text-align: right; }
.kv-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.inputs-row { flex-wrap: wrap; }
.options-sub { margin: -2px 0 6px; }
.default-label { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.model-pair { display: flex; gap: 6px; }
.field-with-picker { display: flex; align-items: center; gap: 4px; }
.field-with-picker.column { flex-direction: column; }
.picker-row { align-self: flex-end; }
.branch-card { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.branch-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.cond-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
</style>
