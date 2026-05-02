<template>
  <el-dialog
    v-model="visible"
    title="创建剧集"
    width="700px"
  >
    <el-form :model="form" label-width="90px">
      <el-form-item label="剧集序号">
        <el-input-number v-model="form.episodeNumber" :min="1" :max="999" />
      </el-form-item>
      <el-form-item label="剧集标题">
        <el-input v-model="form.title" placeholder="选择章节后自动生成，或手动输入" />
      </el-form-item>
      <el-form-item label="内容来源">
        <el-radio-group v-model="form.sourceType" @change="handleSourceTypeChange">
          <el-radio v-if="hasLinkedLongWriting" value="outline">关联长文章节</el-radio>
          <el-radio value="uploaded">上传长文</el-radio>
        </el-radio-group>
        <div v-if="hasLinkedLongWriting" class="form-hint">
          <el-icon><InfoFilled /></el-icon>
          <span>推荐关联长文章节，也可直接上传长文内容</span>
        </div>
      </el-form-item>

      <!-- 关联章节模式 -->
      <el-form-item v-if="form.sourceType === 'outline'" label="关联章节">
        <el-cascader
          v-model="form.outlineId"
          :options="outlineCascaderData"
          :props="outlineCascaderProps"
          placeholder="请选择章节（卷/章/节）"
          filterable
          clearable
          style="width: 100%"
          @change="handleOutlineCascaderChange"
        />
        <div class="outline-hint">
          <el-icon><InfoFilled /></el-icon>
          <span>选择"节"级别的章节创建剧集</span>
        </div>
      </el-form-item>

      <!-- 上传长文模式 -->
      <template v-if="form.sourceType === 'uploaded'">
        <el-form-item label="长文内容">
          <el-input
            v-model="form.uploadedContent"
            type="textarea"
            :rows="10"
            placeholder="请粘贴长文内容（500-15000字）"
            style="width: 100%"
          />
          <div class="word-count-hint">
            <span :class="{ 'word-count-warning': uploadedWordCount < 500 || uploadedWordCount > 15000 }">
              当前字数：{{ uploadedWordCount }} 字
            </span>
            <span class="word-count-limit">（限制：500-15000字）</span>
          </div>
        </el-form-item>
        <el-form-item v-if="uploadedWordCount < 500 && uploadedWordCount > 0">
          <div class="form-error">字数不足，至少需要 500 字，当前 {{ uploadedWordCount }} 字</div>
        </el-form-item>
        <el-form-item v-if="uploadedWordCount > 15000">
          <div class="form-error">字数超出限制，最多允许 15000 字，当前 {{ uploadedWordCount }} 字</div>
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" :disabled="!isFormValid" @click="handleSubmit">
        创建
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { useEpWorkbenchStore, useEpProjectStore, useEpEpisodeStore } from '@/stores/episode-production'
import {
  outlineCascaderProps,
  buildOutlineCascaderData,
  findOutlineNode,
  type OutlineTreeNode
} from '../shared/outline-utils'

const props = defineProps<{
  modelValue: boolean
  projectId: string
  initialEpisodeNumber?: number
  outlineTreeData?: OutlineTreeNode[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'created': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const workbenchStore = useEpWorkbenchStore()
const projectStore = useEpProjectStore()
const episodeStore = useEpEpisodeStore()
const loading = computed(() => workbenchStore.loading)

const hasLinkedLongWriting = computed(() => !!projectStore.currentProject?.longWritingProjectId)

const form = reactive({
  episodeNumber: 1,
  title: '',
  sourceType: 'outline' as 'outline' | 'uploaded',
  outlineId: '',
  uploadedContent: ''
})

const selectedOutlineInfo = ref<{
  id: string
  volumeOrder: number
  volumeName: string
  chapterOrder: number
  chapterName: string
  sectionOrder: number
  sectionName: string
} | null>(null)

const outlineCascaderData = computed(() => {
  return buildOutlineCascaderData(props.outlineTreeData || [])
})

const uploadedWordCount = computed(() => form.uploadedContent.length)

const isFormValid = computed(() => {
  if (!form.title.trim()) return false
  if (form.sourceType === 'outline') {
    return !!form.outlineId
  } else {
    const wc = uploadedWordCount.value
    return wc >= 500 && wc <= 15000
  }
})

// 打开时重置表单
watch(() => props.modelValue, (val) => {
  if (val) {
    form.episodeNumber = props.initialEpisodeNumber ?? 1
    form.title = ''
    form.sourceType = hasLinkedLongWriting.value ? 'outline' : 'uploaded'
    form.outlineId = ''
    form.uploadedContent = ''
    selectedOutlineInfo.value = null
  }
})

function handleSourceTypeChange() {
  if (form.sourceType === 'outline') {
    form.uploadedContent = ''
  } else {
    form.outlineId = ''
    selectedOutlineInfo.value = null
  }
}

function handleOutlineCascaderChange(value: string) {
  if (!value) {
    form.outlineId = ''
    selectedOutlineInfo.value = null
    form.title = ''
    return
  }

  const selectedNode = findOutlineNode(props.outlineTreeData || [], value)
  if (!selectedNode || selectedNode.nodeType !== 'section') {
    ElMessage.warning('请选择"节"级别的章节')
    form.outlineId = ''
    return
  }

  form.outlineId = selectedNode.id

  const volumeNum = selectedNode.volumeOrder || 0
  const chapterNum = selectedNode.chapterOrder || 0
  const sectionNum = selectedNode.sectionPosition || 1

  selectedOutlineInfo.value = {
    id: selectedNode.id,
    volumeOrder: volumeNum,
    volumeName: selectedNode.volumeName || '',
    chapterOrder: chapterNum,
    chapterName: selectedNode.chapterName || '',
    sectionOrder: sectionNum,
    sectionName: selectedNode.name
  }

  form.title = selectedNode.name
}

async function handleSubmit() {
  if (!form.title.trim()) {
    ElMessage.warning('请输入剧集标题')
    return
  }

  const episode = await episodeStore.createEpisode(
    props.projectId,
    {
      sourceType: form.sourceType,
      outlineId: form.sourceType === 'outline' ? form.outlineId : undefined,
      uploadedContent: form.sourceType === 'uploaded' ? form.uploadedContent : undefined,
      episodeNumber: form.episodeNumber,
      title: form.title
    }
  )

  if (episode) {
    ElMessage.success('创建成功')
    visible.value = false
    emit('created')
  } else {
    ElMessage.error(workbenchStore.error || '创建失败')
  }
}
</script>

<style scoped lang="scss">
.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.outline-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.word-count-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;

  .word-count-warning {
    color: var(--el-color-warning);
  }

  .word-count-limit {
    color: var(--el-text-color-secondary);
  }
}

.form-error {
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
