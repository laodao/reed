<template>
  <el-dialog
    v-model="visible"
    title="编辑剧集"
    width="500px"
  >
    <el-form :model="form" label-width="80px">
      <el-form-item label="剧集序号">
        <el-input-number v-model="form.episodeNumber" :min="1" :max="999" />
      </el-form-item>
      <el-form-item label="剧集标题">
        <el-input v-model="form.title" placeholder="请输入剧集标题" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useEpWorkbenchStore, useEpEpisodeStore } from '@/stores/episode-production'

const props = defineProps<{
  modelValue: boolean
  episodeId: string
  initialNumber?: number
  initialTitle?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'updated': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const workbenchStore = useEpWorkbenchStore()
const episodeStore = useEpEpisodeStore()
const loading = computed(() => workbenchStore.loading)

const form = reactive({
  episodeNumber: 1,
  title: ''
})

// 打开时初始化表单
watch(() => props.modelValue, (val) => {
  if (val) {
    form.episodeNumber = props.initialNumber ?? 1
    form.title = props.initialTitle ?? ''
  }
})

async function handleSubmit() {
  if (!form.title.trim()) {
    ElMessage.warning('请输入剧集标题')
    return
  }

  const episode = await episodeStore.updateEpisode(
    props.episodeId,
    {
      episodeNumber: form.episodeNumber,
      title: form.title
    }
  )

  if (episode) {
    ElMessage.success('保存成功')
    visible.value = false
    emit('updated')
  } else {
    ElMessage.error(workbenchStore.error || '保存失败')
  }
}
</script>
