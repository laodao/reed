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

        <!-- 逐项确认列表（list-check）：source 数组每行渲染 + 确认/重生成按钮 -->
        <div v-else-if="item.type === 'list-check'" class="list-check-field">
          <div v-if="listCheckItems(item).length === 0" class="list-check-empty">暂无可确认项</div>
          <div v-for="(row, i) in listCheckItems(item)" :key="String(listCheckKey(item, row, i))" class="list-check-row">
            <span class="list-check-idx">{{ i + 1 }}</span>
            <span class="list-check-label" :title="String(listCheckKey(item, row, i))">{{ listCheckLabel(item, row, i) }}</span>
            <el-button
              size="small"
              :type="isListChecked(item, row, i) ? 'success' : 'warning'"
              :plain="isListChecked(item, row, i)"
              @click="toggleListCheck(item, row, i)"
            >
              <el-icon v-if="isListChecked(item, row, i)"><CircleCheckFilled /></el-icon>
              <el-icon v-else><RefreshLeft /></el-icon>
              {{ isListChecked(item, row, i) ? '已确认' : '需重生成' }}
            </el-button>
          </div>
          <div class="list-check-hint">点击切换确认状态；「需重生成」的项将在生成后重新生成</div>
        </div>

        <!-- 模型（Provider+模型联动，值 = { providerConfigId, modelId }，节点用 {{start.键.providerConfigId}} 引用） -->
        <div v-else-if="item.type === 'model'">
          <div v-if="modelProviders.length === 0" class="no-model-hint">
            没有可用模型。请先在「设置 → AI 提供商」中配置并启用提供方。
          </div>
          <div v-else class="model-pair">
            <el-select :model-value="(modelValue(item) as { providerConfigId?: string })?.providerConfigId"
              placeholder="Provider" clearable filterable size="small" style="flex: 1" @change="v => setModel(item, 'providerConfigId', v)">
              <el-option v-for="p in modelProviders" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <el-select :model-value="(modelValue(item) as { modelId?: string })?.modelId"
              placeholder="模型" clearable filterable size="small" style="flex: 1" @change="v => setModel(item, 'modelId', v)">
              <el-option v-for="m in modelValue(item) ? currentModelOptions(item) : []" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </div>
        </div>

        <!-- 动态下拉（type='select-dynamic'，如模板资产/新闻来源） -->
        <el-select v-else-if="item.type === 'select-dynamic'" v-model="values[item.key]"
          clearable filterable :multiple="!!item.multi" placeholder="请选择" style="width: 100%" @change="touch(item.key)">
          <el-option v-for="o in dynamicOptions(item)" :key="o.value" :label="o.label" :value="o.value" />
          <template v-if="dynamicLoading(item)">
            <el-option disabled><span class="dyn-loading">加载中…</span></el-option>
          </template>
          <template v-else-if="dynamicOptions(item).length === 0">
            <el-option disabled><span class="no-model-hint">暂无可选{{ dynamicLabel(item) }}，请先在资产中心创建</span></el-option>
          </template>
        </el-select>

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
import { reactive, computed, ref, watch, nextTick } from 'vue'
import type { WorkflowStartInput } from '@shared/types/workflow.types'
import { toPlainData } from '../../utils/plain-data'

const props = defineProps<{
  inputs: WorkflowStartInput[]
  /** 字段较多时自动两列（会话页 start-form/审核表单用；运行对话框等保持单列） */
  autoColumns?: boolean
}>()
const emit = defineEmits<{ (e: 'valid', ok: boolean): void }>()

/** 两列布局：开启 autoColumns 且字段 >=4 时生效（宽字段跨列） */
const useColumns = computed(() => !!props.autoColumns && props.inputs.length >= 4)
/** 宽字段（文件/JSON/多行文本/模型）跨两列，避免窄格难用 */
function isWideField(item: WorkflowStartInput): boolean {
  return item.type === 'file' || item.type === 'json' || item.type === 'textarea' || item.type === 'model'
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

// ── 逐项确认列表（type='list-check'）：source 数组逐行确认，输出 { checked, unchecked } ──

/** 每项的勾选状态：行下标 → boolean（默认全确认） */
const listChecked = reactive<Record<string, boolean>>({})
const listKeyOf = (item: WorkflowStartInput, row: unknown, i: number): string => `${item.key}::${String(listCheckKey(item, row, i))}`

/** source 解析后的数组（引擎已把模板解析为数组，缺省空数组） */
function listCheckItems(item: WorkflowStartInput): unknown[] {
  const src = (item as unknown as { source?: unknown }).source
  return Array.isArray(src) ? src : []
}

/** 项唯一 key：itemKey 模板（{{item.xx}}/{{xx}}）或数组下标 */
function listCheckKey(item: WorkflowStartInput, row: unknown, i: number): string | number {
  const tpl = (item as unknown as { itemKey?: string }).itemKey
  const v = tpl ? renderItemTemplate(tpl, row, i) : i
  return v === '' ? i : v
}

/** 项显示名：itemLabel 模板（{{item.xx}}/{{xx}}）或「第 N 项」 */
function listCheckLabel(item: WorkflowStartInput, row: unknown, i: number): string {
  const tpl = (item as unknown as { itemLabel?: string }).itemLabel
  const rendered = tpl ? renderItemTemplate(tpl, row, i) : ''
  return rendered || `第 ${i + 1} 项`
}

/** 项模板插值：支持 {{item.name}} / {{name}} / {{index}}（row 为对象时取字段） */
function renderItemTemplate(tpl: string, row: unknown, i: number): string {
  const obj = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
  return tpl
    .replace(/\{\{\s*item\.([^{}\s]+)\s*\}\}/g, (_m, k: string) => stringifyField(obj[k]))
    .replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (m, k: string) =>
      k === 'index' ? String(i) : (k in obj ? stringifyField(obj[k]) : m)
    )
}

function stringifyField(v: unknown): string {
  if (v === undefined || v === null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** 当前行是否已确认（未触碰过 = 默认全确认） */
function isListChecked(item: WorkflowStartInput, row: unknown, i: number): boolean {
  const key = listKeyOf(item, row, i)
  const def = (item as unknown as { defaultChecked?: boolean }).defaultChecked !== false
  return listChecked[key] ?? def
}

function toggleListCheck(item: WorkflowStartInput, row: unknown, i: number): void {
  const key = listKeyOf(item, row, i)
  listChecked[key] = !isListChecked(item, row, i)
  touch(item.key)
}

/** 导出 list-check 提交值：{ checked: [key...], unchecked: [key...], items: [完整 row...] } */
function listCheckValues(item: WorkflowStartInput): Record<string, unknown> | undefined {
  const rows = listCheckItems(item)
  if (rows.length === 0) return undefined
  const checked: Array<string | number> = []
  const unchecked: Array<string | number> = []
  const uncheckedItems: unknown[] = []
  rows.forEach((row, i) => {
    const k = listCheckKey(item, row, i)
    if (isListChecked(item, row, i)) checked.push(k)
    else { unchecked.push(k); uncheckedItems.push(row) }
  })
  return { checked, unchecked, items: rows, uncheckedItems }
}

/** 数字值（el-input-number 需要 number|null） */
const numValues = reactive<Record<string, number | undefined>>({})

// ── 动态下拉（type='select-dynamic'）：模板资产等 ──

/** 动态选项缓存：source → 选项列表（label/value） */
const dynamicCache = reactive<Record<string, Array<{ label: string; value: string }>>>({})
/** 加载中标记：source → boolean */
const dynamicBusy = reactive<Record<string, boolean>>({})

/** 字段的动态数据源标识（当前仅 assets:template） */
function dynamicSourceOf(item: WorkflowStartInput): string {
  return item.source ?? ''
}

/** 字段动态选项（按 source 缓存取；assets:template → 模板资产列表） */
function dynamicOptions(item: WorkflowStartInput): Array<{ label: string; value: string }> {
  const src = dynamicSourceOf(item)
  return dynamicCache[src] ?? []
}

function dynamicLoading(item: WorkflowStartInput): boolean {
  return !!dynamicBusy[dynamicSourceOf(item)]
}

/** 动态下拉的空态文案（assets:template → 模板） */
function dynamicLabel(item: WorkflowStartInput): string {
  return dynamicSourceOf(item) === 'assets:template' ? '模板' : '选项'
}

/** 是否有动态下拉字段 */
function hasDynamic(keys: WorkflowStartInput[]): boolean {
  return keys.some(i => i.type === 'select-dynamic')
}

/** 拉取动态选项：assets:template → 资产中心模板大类列表（值=资产 ID）；newsTopics → 预置新闻主题（值=主题 id） */
async function loadDynamicOptions(keys: WorkflowStartInput[]): Promise<void> {
  for (const item of keys) {
    if (item.type !== 'select-dynamic') continue
    const src = dynamicSourceOf(item)
    if (dynamicCache[src] || dynamicBusy[src]) continue
    if (src === 'assets:template') {
      dynamicBusy[src] = true
      try {
        const api = (window as never as { electronAPI: { assets: { list: (p: Record<string, unknown>) => Promise<{ success: boolean; data?: { items?: Array<{ id: string; name: string; subCategory?: string | null }> } }> } } }).electronAPI.assets
        const resp = await api.list({ category: 'template', page: 1, pageSize: 200 })
        if (resp.success && resp.data?.items) {
          dynamicCache[src] = resp.data.items.map(a => ({
            label: a.subCategory ? `${a.name}（${a.subCategory}）` : a.name,
            value: a.id,
          }))
        } else {
          dynamicCache[src] = []
        }
      } catch {
        dynamicCache[src] = []
      } finally {
        dynamicBusy[src] = false
      }
    } else if (src === 'newsTopics') {
      dynamicBusy[src] = true
      try {
        const { NEWS_TOPIC_LABELS } = await import('@shared/types/news-topics')
        dynamicCache[src] = NEWS_TOPIC_LABELS.map(t => ({ label: t.label, value: t.value }))
      } catch {
        dynamicCache[src] = []
      } finally {
        dynamicBusy[src] = false
      }
    } else if (src === 'knowledgeBases') {
      dynamicBusy[src] = true
      try {
        const api = (window as never as { electronAPI: { knowledgeBase: { list: () => Promise<{ success: boolean; data?: Array<{ id: string; name: string }> }> } } }).electronAPI.knowledgeBase
        const resp = await api.list()
        if (resp.success && resp.data) {
          dynamicCache[src] = resp.data.map(kb => ({ label: kb.name, value: kb.id }))
        } else {
          dynamicCache[src] = []
        }
      } catch {
        dynamicCache[src] = []
      } finally {
        dynamicBusy[src] = false
      }
    } else if (src === 'newsSources') {
      dynamicBusy[src] = true
      try {
        const api = (window as never as { electronAPI: { newsSource: { list: (p: Record<string, unknown>) => Promise<{ success: boolean; data?: Array<{ id: string; topicId: string; name: string; isBuiltin: boolean }> }> } } }).electronAPI.newsSource
        const resp = await api.list({})
        const TOPIC_LABELS: Record<string, string> = { ai: '人工智能', finance: '全球财经', energy: '新能源', tech: '科技产业', world: '国际时政' }
        if (resp.success && resp.data) {
          dynamicCache[src] = resp.data.map(s => ({
            label: `${TOPIC_LABELS[s.topicId] ?? s.topicId} · ${s.name}${s.isBuiltin ? '' : '（自定义）'}`,
            value: s.id,
          }))
        } else {
          dynamicCache[src] = []
        }
      } catch {
        dynamicCache[src] = []
      } finally {
        dynamicBusy[src] = false
      }
    } else if (src === 'assetCategories') {
      dynamicBusy[src] = true
      try {
        const api = (window as never as { electronAPI: { assets: { listCategories: (p?: Record<string, unknown>) => Promise<{ success: boolean; data?: Array<{ name: string; previewMode: string }> }> } } }).electronAPI.assets
        const resp = await api.listCategories()
        if (resp.success && resp.data) {
          dynamicCache[src] = resp.data.map(c => ({
            label: c.previewMode === 'report' ? `${c.name}（报告渲染）` : c.name,
            value: c.name,
          }))
        } else {
          dynamicCache[src] = []
        }
      } catch {
        dynamicCache[src] = []
      } finally {
        dynamicBusy[src] = false
      }
    } else {
      dynamicCache[src] = []
    }
  }
}

watch(() => props.inputs, list => {
  if (hasDynamic(list)) void loadDynamicOptions(list)
}, { immediate: true, deep: true })

// ── 模型字段（type='model'）：Provider+模型联动，值 = { providerConfigId, modelId } ──

/** 启用 Provider 列表（含按 modelTypes 过滤后的模型选项） */
const modelProviders = ref<Array<{ id: string; name: string; isDefault: boolean; models: Array<{ label: string; value: string; type?: string }> }>>([])
/** 字段 key → 所选 { providerConfigId, modelId } */
const modelSelections = reactive<Record<string, { providerConfigId?: string; modelId?: string }>>({})

/** 是否含 model 字段（决定拉取 Provider） */
function hasModel(keys: WorkflowStartInput[]): boolean {
  return keys.some(i => i.type === 'model')
}

/** 拉取启用 Provider 列表，按各字段 modelTypes 过滤模型；同时按默认 Provider 预填默认值 */
async function loadModelProviders(): Promise<void> {
  const api = (window as never as { electronAPI: { providerConfig: { list: () => Promise<{ success: boolean; data?: Array<Record<string, any>> }> } } }).electronAPI.providerConfig
  try {
    const resp = await api.list()
    const list: Array<Record<string, any>> = resp.success ? (resp.data ?? []) : []
    const enabled = list.filter(c => c.isEnabled !== false && c.isEnabled !== 0)
    // 全局候选（不按字段过滤，字段粒度在 currentModelOptions 过滤）；保留模型 type 供匹配
    modelProviders.value = enabled.map(c => ({
      id: c.id,
      name: c.name || c.shortId || c.id,
      isDefault: c.isDefault === 1 || c.isDefault === true,
      models: (c.models ?? []).map((m: any) => ({ label: m.name || m.id, value: m.id, type: m.type })),
    }))
    // 预填默认值：优先字段内置 defaultValue；否则选一个「有匹配模型」的 Provider 的默认模型
    await nextTick()
    for (const item of props.inputs) {
      if (item.type !== 'model') continue
      const cur = modelSelections[item.key]
      if (cur && (cur.providerConfigId || cur.modelId)) continue // 已有选择不覆盖
      const dv = item.defaultValue as { providerConfigId?: string; modelId?: string } | undefined
      const dvProvider = dv?.providerConfigId ? modelProviders.value.find(p => p.id === dv.providerConfigId) : undefined
      if (dvProvider) {
        modelSelections[item.key] = {
          providerConfigId: dv.providerConfigId,
          modelId: dv.modelId ?? dvProvider.models[0]?.value,
        }
        continue
      }
      const mix = item.modelTypes?.length ? item.modelTypes : undefined
      const hasMatch = (p: { models: Array<{ value: string; type?: string }> }): boolean =>
        p.models.some(m => modelMatches(item, m))
      // 默认 Provider 需真正有匹配模型；否则取第一个有匹配模型的启用 Provider
      //（避免 TTS/STT 这类需 audio 模型的应用被"全局默认但无音频模型"的 Provider 选中）
      const defaultProvider =
        modelProviders.value.find(p => p.isDefault && hasMatch(p)) ||
        modelProviders.value.find(p => hasMatch(p)) ||
        modelProviders.value.find(p => p.isDefault) ||
        modelProviders.value[0]
      if (defaultProvider) {
        const allowed = defaultProvider.models.filter(m => modelMatches(item, m))
        modelSelections[item.key] = {
          providerConfigId: defaultProvider.id,
          modelId: (dv as { modelId?: string })?.modelId ?? allowed[0]?.value ?? defaultProvider.models[0]?.value,
        }
      }
    }
  } catch {
    modelProviders.value = []
  }
}

/** 该模型是否匹配字段的 modelTypes（按模型 type；无 type 时按 id 兜底） */
function modelMatches(item: WorkflowStartInput, m: { value: string; type?: string }): boolean {
  const mix = item.modelTypes
  if (!mix?.length) return true
  return mix.includes((m.type || m.value) as never)
}

/** 供模板读取的字段模型值（无则默认空对象） */
function modelValue(item: WorkflowStartInput): Record<string, unknown> {
  return modelSelections[item.key] ?? {}
}

/** 当前字段可见模型选项（按字段 modelTypes 过滤） */
function currentModelOptions(item: WorkflowStartInput): Array<{ label: string; value: string }> {
  const p = modelProviders.value.find(x => x.id === modelSelections[item.key]?.providerConfigId)
  if (!p) return []
  return p.models.filter(m => modelMatches(item, m))
}

/** 设置模型子键并同步触发校验 */
function setModel(item: WorkflowStartInput, key: 'providerConfigId' | 'modelId', v: unknown): void {
  const cur = modelSelections[item.key] ?? {}
  const next = { ...cur, [key]: v ?? undefined }
  // 切换 Provider 时清空模型（防跨 Provider 误用）
  if (key === 'providerConfigId' && cur.providerConfigId !== v) next.modelId = undefined
  modelSelections[item.key] = next
  touch(item.key)
}

watch(() => props.inputs, list => {
  if (hasModel(list) && modelProviders.value.length === 0) void loadModelProviders()
}, { immediate: true, deep: true })

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
  if (item.type === 'model') {
    if (!item.required) return ''
    const v = modelSelections[item.key]
    if (!v?.providerConfigId) return '请选择 Provider'
    if (!v?.modelId) return '请选择模型'
    return ''
  }
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
const isValid = computed(() => props.inputs.every(it => {
  if (it.type === 'model') {
    if (!it.required) return true
    const v = modelSelections[it.key]
    return !!v?.providerConfigId && !!v?.modelId
  }
  return validateItem(it) === ''
}))
watch(isValid, ok => emit('valid', ok), { immediate: true })

/** 导出提交值（json 解析、number 归位、multi 保数组、model 保对象）；同时触发全量错误显示 */
function getValues(): Record<string, unknown> {
  for (const item of props.inputs) touched[item.key] = true
  const out: Record<string, unknown> = {}
  for (const item of props.inputs) {
    if (item.type === 'model') {
      const v = modelSelections[item.key]
      if (v?.providerConfigId || v?.modelId) out[item.key] = { ...v }
    } else if (item.type === 'number') {
      if (numValues[item.key] !== undefined) out[item.key] = numValues[item.key]
    } else if (item.type === 'json') {
      const raw = values[item.key]
      if (raw !== undefined && raw !== '') {
        try { out[item.key] = JSON.parse(String(raw)) } catch { out[item.key] = raw }
      }
    } else if (item.type === 'list-check') {
      const lc = listCheckValues(item)
      if (lc) out[item.key] = lc
    } else if (values[item.key] !== undefined) {
      out[item.key] = values[item.key]
    }
  }
  // 关键：values / modelSelections / listChecked 均为 Vue reactive，从中取出的
  // 数组与对象（多选 sourceIds、文件对象、list-check 的 items 等）仍是 Proxy，
  // Electron IPC（V8 structured clone）无法克隆 Proxy，直接传给 startRun /
  // reviewDecide 会抛 "An object could not be cloned"。统一经 toPlainData
  // 转回普通 JSON 数据后再跨进程传输。
  return toPlainData(out)
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
/* 模型选择（Provider+模型联动下拉） */
.model-pair { display: flex; gap: 8px; width: 100%; }
.no-model-hint { font-size: 12px; color: var(--el-color-warning); line-height: 1.5; padding: 2px 0; }
/* 逐项确认列表（list-check） */
.list-check-field { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
.list-check-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); }
.list-check-idx { width: 22px; height: 22px; border-radius: 50%; background: var(--el-fill-color); color: var(--el-text-color-secondary); font-size: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.list-check-label { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list-check-hint { font-size: 11px; color: var(--el-text-color-secondary); }
.list-check-empty { font-size: 12px; color: var(--el-text-color-secondary); padding: 8px 0; }
/* 自动两列：字段多时网格排布，宽字段跨列 */
.two-col { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; }
.two-col :deep(.span-2) { grid-column: 1 / -1; }
</style>
