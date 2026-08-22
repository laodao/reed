<template>
  <el-form label-position="top" size="small" @submit.prevent :class="{ 'two-col': useColumns }">
    <template v-for="item in inputs" :key="item.key">
      <el-form-item :class="{ 'span-2': isWideField(item) }" :error="fieldError(item)">
        <template #label>
          {{ item.label || item.key }}
          <el-tag v-if="item.required" size="small" type="danger" effect="plain">必填</el-tag>
          <el-tag v-if="textLimitHint(item)" size="small" type="info" effect="plain">{{ textLimitHint(item) }}</el-tag>
        </template>

        <!-- 单行文本 -->
        <el-input v-if="!item.type || item.type === 'string'" v-model="values[item.key]"
          :placeholder="`请输入${item.label || item.key}`" @blur="touch(item.key)" />

        <!-- 多行文本 -->
        <el-input v-else-if="item.type === 'textarea'" v-model="values[item.key]" type="textarea"
          :rows="4" :placeholder="`请输入${item.label || item.key}`" @blur="touch(item.key)" />

        <!-- 数字 -->
        <el-input-number v-else-if="item.type === 'number'" v-model="numValues[item.key]"
          style="width: 100%" @blur="touch(item.key)" />

        <!-- 布尔 -->
        <el-switch v-else-if="item.type === 'boolean'" v-model="values[item.key]" @change="touch(item.key)" />

        <!-- 下拉（multi 多选） -->
        <el-select v-else-if="item.type === 'select'" v-model="values[item.key]"
          :multiple="!!item.multi" clearable filterable placeholder="请选择" style="width: 100%" @change="touch(item.key)">
          <el-option v-for="o in item.options ?? []" :key="String(o.value)" :label="o.label" :value="o.value" />
        </el-select>

        <!-- JSON -->
        <el-input v-else-if="item.type === 'json'" v-model="values[item.key]" type="textarea"
          :rows="3" placeholder='{"key": "value"}' @blur="touch(item.key)" />

        <!-- 文件上传（E1 form-collect：经 IPC 落盘并尽力解析文本，值为 { path, name, text }） -->
        <div v-else-if="item.type === 'file'" class="file-field">
          <input :ref="el => setFileInput(item.key, el)" type="file" style="display: none" @change="e => handleFilePick(item, e)" />
          <el-button size="small" @click="fileInputs[item.key]?.click()">
            {{ files[item.key] ? '重新选择' : '选择文件' }}
          </el-button>
          <span v-if="files[item.key]" class="file-name">{{ files[item.key]!.name }}</span>
          <span v-else class="file-hint">未选择文件</span>
        </div>

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
 *
 * 控件：单行/多行文本、数字、布尔、下拉、JSON、文件；
 * 校验：必填 + 扩展规则（minLength/maxLength/pattern/min/max，来自
 *       WorkflowStartInput.validation）。错误在字段被触碰（或提交取值）后显示，
 *       避免打开表单就满屏红。
 */
import { reactive, computed, watch } from 'vue'
import type { WorkflowStartInput } from '@shared/types/workflow.types'

const props = defineProps<{
  inputs: WorkflowStartInput[]
  /** 字段较多时自动两列（会话页 start-form/审核表单用；运行对话框等保持单列） */
  autoColumns?: boolean
}>()
const emit = defineEmits<{ (e: 'valid', ok: boolean): void }>()

/** 两列布局：开启 autoColumns 且字段 >=4 时生效（宽字段跨列） */
const useColumns = computed(() => !!props.autoColumns && props.inputs.length >= 4)
/** 宽字段（文件/JSON/多行文本）跨两列，避免窄格难用 */
function isWideField(item: WorkflowStartInput): boolean {
  return item.type === 'file' || item.type === 'json' || item.type === 'textarea'
}

/** 字符串/布尔/下拉/json 的值（json 以文本暂存） */
const values = reactive<Record<string, unknown>>({})

/** 文件字段：上传产物与 input 元素索引（E1） */
const files = reactive<Record<string, { path: string; name: string; text?: string } | undefined>>({})
const fileInputs: Record<string, HTMLInputElement | null> = {}
function setFileInput(key: string, el: unknown): void {
  fileInputs[key] = (el as HTMLInputElement) ?? null
}
async function handleFilePick(item: { key: string }, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const api = (window as never as { electronAPI: { workflow: { uploadFormFile: (p: Record<string, string>) => Promise<{ success: boolean; data?: { path: string; name: string; text?: string }; error?: string }> } } }).electronAPI.workflow
  const runId = fileUploadContext.runId ?? ''
  const nodeId = fileUploadContext.nodeId ?? ''
  if (!runId || !nodeId) { values[item.key] = file.name; return } // 无运行上下文（start 输入表单）：记文件名占位
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const resp = await api.uploadFormFile({ runId, nodeId, fileName: file.name, base64 })
  if (resp.success && resp.data) {
    files[item.key] = resp.data
    values[item.key] = resp.data
  }
}

/** 文件上传上下文（运行详情页挂起表单注入；start 运行表单无此上下文） */
const fileUploadContext = reactive<{ runId?: string; nodeId?: string }>({})
function setFileUploadContext(ctx: { runId: string; nodeId: string }): void {
  fileUploadContext.runId = ctx.runId
  fileUploadContext.nodeId = ctx.nodeId
}

/** 数字值（el-input-number 需要 number|null） */
const numValues = reactive<Record<string, number | undefined>>({})

/** defaultValue 预填 */
watch(() => props.inputs, list => {
  for (const item of list) {
    if (item.defaultValue !== undefined && values[item.key] === undefined && numValues[item.key] === undefined) {
      if (item.type === 'number') numValues[item.key] = Number(item.defaultValue)
      else if (item.type === 'json') values[item.key] = JSON.stringify(item.defaultValue)
      else values[item.key] = item.defaultValue
    }
  }
}, { immediate: true, deep: true })

// ── 校验（必填 + validation 扩展规则；单一实现，错误显示与整体有效性共用） ──

/** 字段是否触碰过（触碰/提交取值后才显示错误，避免打开即满屏红） */
const touched = reactive<Record<string, boolean>>({})
function touch(key: string): void { touched[key] = true }

const isEmptyValue = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0)

/** 单字段完整校验（不依赖 touched）：返回错误消息，空串=通过；错误提示按规则自动生成 */
function validateItem(item: WorkflowStartInput): string {
  const v = item.type === 'number' ? numValues[item.key] : values[item.key]
  const rule = item.validation
  if (item.required && isEmptyValue(v)) return '必填'
  if (isEmptyValue(v)) return ''
  if (item.type === 'json') {
    const raw = String(v ?? '').trim()
    if (raw) { try { JSON.parse(raw) } catch { return 'JSON 格式不正确' } }
    return ''
  }
  if (item.type === 'string' || item.type === 'textarea' || !item.type) {
    const s = String(v)
    if (rule?.minLength != null && s.length < rule.minLength) return `至少 ${rule.minLength} 个字符`
    if (rule?.maxLength != null && s.length > rule.maxLength) return `最多 ${rule.maxLength} 个字符`
    if (rule?.pattern) {
      try { if (!new RegExp(rule.pattern).test(s)) return '格式不匹配' } catch { return '正则表达式无效' }
    }
  } else if (item.type === 'number') {
    const n = numValues[item.key]
    if (n !== undefined && n !== null) {
      if (rule?.min != null && n < rule.min) return `不能小于 ${rule.min}`
      if (rule?.max != null && n > rule.max) return `不能大于 ${rule.max}`
    }
  }
  return ''
}

/** 字段错误（仅触碰后显示） */
function fieldError(item: WorkflowStartInput): string {
  return touched[item.key] ? validateItem(item) : ''
}

/** 文本长度限制提示（标签角标，如"最多 500 字"） */
function textLimitHint(item: WorkflowStartInput): string {
  const rule = item.validation
  if (!rule) return ''
  if (rule.minLength != null && rule.maxLength != null) return `${rule.minLength}-${rule.maxLength} 字`
  if (rule.minLength != null) return `至少 ${rule.minLength} 字`
  if (rule.maxLength != null) return `最多 ${rule.maxLength} 字`
  return ''
}

/** 整体有效性（驱动运行按钮；与显示无关的完整校验） */
const isValid = computed(() => props.inputs.every(it => validateItem(it) === ''))
watch(isValid, ok => emit('valid', ok), { immediate: true })

/** 导出提交值（json 解析、number 归位、multi 保数组）；同时触发全量错误显示 */
function getValues(): Record<string, unknown> {
  for (const item of props.inputs) touched[item.key] = true
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

defineExpose({ getValues, isValid, setFileUploadContext })
</script>

<style scoped>
:deep(.el-form-item) { margin-bottom: 16px; }
:deep(.el-form-item__label) { font-size: 12px; font-weight: 600; color: var(--el-text-color-regular); padding-bottom: 6px; line-height: 1.2; }
.multi-hint { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 2px; }
.no-inputs { color: var(--el-text-color-secondary); text-align: center; padding: 16px 0; }
.file-field { display: flex; align-items: center; gap: 8px; }
.file-name { color: var(--el-color-success); font-size: 13px; }
.file-hint { color: var(--el-text-color-secondary); font-size: 12px; }
/* 自动两列：字段多时网格排布，宽字段跨列 */
.two-col { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; }
.two-col :deep(.span-2) { grid-column: 1 / -1; }
</style>
