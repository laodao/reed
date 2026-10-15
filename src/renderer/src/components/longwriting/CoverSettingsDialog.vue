<template>
  <el-dialog
    :model-value="visible"
    title="项目封面"
    width="480px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <CoverSettingPanel
      :project-id="projectId"
      :cover-path="coverPath"
      @updated="(p) => { coverPath = p.coverPath ?? null; emit('updated', p) }"
    />
    <template #footer>
      <el-button type="primary" @click="$emit('update:visible', false)">完成</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LongWritingProject } from '../../../../shared/types/longwriting.types'
import CoverSettingPanel from './CoverSettingPanel.vue'

const props = defineProps<{
  visible: boolean
  projectId: string
  /** 初始封面路径（打开时刷新为调用方最新值） */
  coverPath?: string | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 封面已变更（调用方刷新列表/卡片） */
  updated: [project: LongWritingProject]
}>()

// 弹窗内实时预览值（初始值随 visible 打开时同步）
const coverPath = ref<string | null>(props.coverPath ?? null)
watch(
  () => [props.visible, props.coverPath] as const,
  ([visible]) => {
    if (visible) coverPath.value = props.coverPath ?? null
  }
)
</script>
