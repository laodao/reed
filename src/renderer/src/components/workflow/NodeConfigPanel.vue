<template>
  <div class="config-panel">
    <div class="panel-header">
      <span class="node-icon" :class="category">
        <el-icon :size="18"><component :is="catalogEntry?.icon" /></el-icon>
      </span>
      <div>
        <div class="node-type">{{ catalogEntry?.label }}</div>
        <div class="node-id">{{ node?.id }}</div>
      </div>
    </div>

    <el-form label-position="top" size="small" @submit.prevent>
      <el-form-item label="节点名称">
        <el-input v-model="wfNode.name" @change="emitChange" />
      </el-form-item>

      <template v-for="(field, idx) in visibleFields" :key="field.key">
        <!-- 分组标题（仅组切换时显示一次） -->
        <div v-if="groupTitleOf(field, idx)" class="group-divider">{{ groupTitleOf(field, idx) }}</div>
        <!-- 折叠分组 -->
        <template v-if="field.collapsible">
          <el-collapse>
            <el-collapse-item :title="field.label" :name="field.key">
              <FieldRenderer :field="field" :model="wfNode.config" :dynamic-options="dynamicOptions" @change="emitChange" />
            </el-collapse-item>
          </el-collapse>
        </template>
        <el-form-item v-else>
          <template #label>{{ field.label }}</template>
          <div class="field-wrap"><FieldRenderer :field="field" :model="wfNode.config" :dynamic-options="dynamicOptions" @change="emitChange" /></div>
          <div v-if="field.help" class="field-help">{{ field.help }}</div>
        </el-form-item>
      </template>

      <div v-if="!fields.length || !visibleFields.length" class="no-config">该节点无需配置</div>
    </el-form>

    <div class="panel-footer">
      <el-button size="small" type="danger" plain @click="$emit('remove')">删除节点</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 节点配置面板：按 NODE_CONFIG_FORMS Schema 渲染表单（组件化——新组件带 Schema 即有表单）
 */
import { computed, inject, provide, ref, watch, type Ref } from 'vue'
import type { Node } from '@vue-flow/core'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { NODE_CONFIG_FORMS, type CatalogFormField } from '@shared/types/workflow-node-forms'
import FieldRenderer from './FormFieldRenderer.vue'

const props = defineProps<{ node: Node }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'remove'): void }>()

/** 变量选择器上下文：画布节点（编辑器 provide）+ 当前节点 id */
const canvasNodesRef = inject<Ref<any[]>>('wfCanvasNodes', ref([]))
const canvasNodes = canvasNodesRef
provide('wfPickerContext', {
  nodes: canvasNodes,
  excludeNodeId: computed(() => props.node.id),
})

const wfNode = computed(() => (props.node.data as any).wfNode)
const catalogEntry = computed(() => NODE_TYPE_CATALOG_MAP[wfNode.value.type])
const category = computed(() => catalogEntry.value?.category)
const fields = computed(() => NODE_CONFIG_FORMS[wfNode.value.type as keyof typeof NODE_CONFIG_FORMS] ?? [])

/** 动态选项数据（按 source 拉取） */
/** 动态选项：普通源为选项数组；providers 为 providerConfigs+models 结构 */
const dynamicOptions = ref<Record<string, any>>({})

/** 折叠字段过滤（折叠的仍渲染在 collapse 内，不隐藏）；提示占位字段过滤 */
const visibleFields = computed(() => fields.value.filter(f => f.key !== '_hint'))

/** 分组标记（渲染分组标题一次：组切换才显示，避免每行重复） */
function groupTitleOf(field: CatalogFormField, idx: number): string {
  const prev = idx > 0 ? visibleFields.value[idx - 1] : undefined
  return field.group && prev?.group !== field.group ? field.group : ''
}

async function loadDynamicOptions() {
  const api = (window as never as { electronAPI: any }).electronAPI
  const sources = new Set(fields.value.filter(f => f.type === 'select-dynamic').map(f => f.source))
  // model-pair 联动下拉的 Provider/模型数据
  if (fields.value.some(f => f.type === 'model-pair')) {
    try {
      const resp = await api.providerConfig.list()
      // 通道返回形状是 { success, configs }（apiKey 已脱敏）
      const list: any[] = (resp as any).configs ?? []
      if (resp.success && Array.isArray(list)) {
        dynamicOptions.value.providers = list
          .filter(c => c.isEnabled !== false && c.isEnabled !== 0)
          .map(c => ({
            id: c.id,
            name: c.name || c.shortId || c.id,
            models: (c.models ?? [])
              .filter((m: any) => !m.type || m.type === 'text' || m.type === 'chat')
              .map((m: any) => ({ label: m.name || m.id, value: m.id })),
          }))
          .filter(p => p.models.length > 0 || true) // 无模型的 Provider 仍可选（引擎有 fallback 链）
      }
    } catch (e) {
      console.warn('[WorkflowEditor] Provider 列表加载失败', e)
    }
  }
  if (sources.has('knowledgeBases')) {
    try {
      const resp = await api.knowledgeBase.list()
      if (resp.success && resp.data) {
        dynamicOptions.value.knowledgeBases = resp.data.map((kb: any) => ({
          label: kb.name,
          value: kb.id,
        }))
      }
    } catch { /* 列表失败时退化为手填 */ }
  }
}
watch(() => props.node.id, loadDynamicOptions, { immediate: true })

function emitChange() {
  // 同步画布节点标题
  ;(props.node.data as any).label = `${catalogEntry.value?.label}: ${wfNode.value.name}`
  emit('change')
}
</script>

<style scoped>
.config-panel { height: 100%; overflow: auto; padding: 16px; display: flex; flex-direction: column; }
.panel-header { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.node-icon { font-size: 16px; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; background: var(--el-fill-color-light); flex-shrink: 0; }
.node-type { font-weight: 600; font-size: 14px; line-height: 1.3; }
.node-id { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 2px; }
.group-divider { font-size: 12px; font-weight: 600; color: var(--el-text-color-primary); margin: 18px 0 10px; display: flex; align-items: center; gap: 8px; }
.group-divider::after { content: ''; flex: 1; height: 1px; background: var(--el-border-color-lighter); }
.config-panel :deep(.el-form-item) { margin-bottom: 14px; }
.config-panel :deep(.el-form-item__label) { font-size: 12px; font-weight: 600; color: var(--el-text-color-regular); padding-bottom: 4px; line-height: 1.2; }
/* el-form-item__content 是 flex：字段容器默认只按内容宽度（导致多行框只有一半）——
   强制占满整行 */
.field-wrap { flex: 1 1 100%; width: 100%; min-width: 0; }
.field-help { flex: 1 1 100%; width: 100%; font-size: 11px; color: var(--el-text-color-secondary); margin-top: 3px; line-height: 1.4; }
.no-config { color: var(--el-text-color-secondary); text-align: center; padding: 24px 0; }
.panel-footer { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--el-border-color-lighter); }
.panel-footer :deep(.el-button) { width: 100%; }
</style>
