<template>
  <el-dialog
    v-model="visible"
    title="项目设置"
    width="700px"
    class="settings-dialog"
  >
    <el-form v-if="projectStore.currentProject" label-width="100px" class="settings-form">
      <el-divider content-position="left">基本设置</el-divider>
      <el-form-item label="项目名称">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="关联长文">
        <el-select
          v-model="form.longWritingProjectId"
          placeholder="选择关联的长文项目"
          style="width: 100%"
          clearable
          filterable
        >
          <el-option
            v-for="project in allLwProjects"
            :key="project.id"
            :label="project.name"
            :value="project.id"
          />
        </el-select>
        <div class="form-hint">关联长文后，添加剧集时可选择关联长文章节</div>
      </el-form-item>
      <el-form-item label="画幅比例">
        <el-select v-model="form.config.aspectRatio" style="width: 100%">
          <el-option label="16:9 (横屏)" value="16:9" />
          <el-option label="9:16 (竖屏)" value="9:16" />
          <el-option label="4:3 (标准)" value="4:3" />
          <el-option label="1:1 (方形)" value="1:1" />
        </el-select>
      </el-form-item>
      <el-form-item label="分辨率">
        <el-select v-model="form.config.resolution" style="width: 100%">
          <el-option label="4K" :value="2160" />
          <el-option label="2K" :value="1440" />
          <el-option label="1080p" :value="1080" />
          <el-option label="720p" :value="720" />
          <el-option label="480p" :value="480" />
        </el-select>
      </el-form-item>
      <el-form-item label="帧率">
        <el-select v-model="form.config.fps" style="width: 100%">
          <el-option label="24 fps" :value="24" />
          <el-option label="25 fps" :value="25" />
          <el-option label="30 fps" :value="30" />
          <el-option label="60 fps" :value="60" />
        </el-select>
      </el-form-item>

      <el-divider content-position="left">模型设置</el-divider>
      <el-form-item label="剧本生成">
        <el-select
          v-model="form.config.scriptModel"
          placeholder="选择剧本生成模型"
          style="width: 100%"
          clearable
          filterable
        >
          <el-option-group
            v-for="provider in textProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="`${provider.shortId}/${model.name}`"
              :value="`${provider.id}:${model.id}`"
            />
          </el-option-group>
        </el-select>
        <div class="model-hint">用于AI生成剧本和场景拆分</div>
      </el-form-item>
      <el-form-item label="分镜生成">
        <el-select
          v-model="form.config.storyboardModel"
          placeholder="选择分镜生成模型"
          style="width: 100%"
          clearable
          filterable
        >
          <el-option-group
            v-for="provider in textProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="`${provider.shortId}/${model.name}`"
              :value="`${provider.id}:${model.id}`"
            />
          </el-option-group>
        </el-select>
        <div class="model-hint">用于AI生成分镜设计</div>
      </el-form-item>
      <el-form-item label="画面生成">
        <el-select
          v-model="form.config.imageModel"
          placeholder="选择画面生成模型"
          style="width: 100%"
          clearable
          filterable
        >
          <el-option-group
            v-for="provider in imageProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="`${provider.shortId}/${model.name}`"
              :value="`${provider.id}:${model.id}`"
            />
          </el-option-group>
        </el-select>
        <div class="model-hint">用于生成分镜画面图像</div>
      </el-form-item>
      <el-form-item label="视频合成">
        <el-select
          v-model="form.config.videoModel"
          placeholder="选择视频合成模型"
          style="width: 100%"
          clearable
          filterable
        >
          <el-option-group
            v-for="provider in videoProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="`${provider.shortId}/${model.name}`"
              :value="`${provider.id}:${model.id}`"
            />
          </el-option-group>
        </el-select>
        <div class="model-hint">请选择图生视频模型，当前支持阿里百炼、火山方舟平台</div>
      </el-form-item>
      <el-form-item label="视频质量">
        <el-select v-model="form.config.videoQuality" style="width: 100%">
          <el-option label="高（high，质量好、耗时长）" value="high" />
          <el-option label="低（low，快速出片）" value="low" />
        </el-select>
        <div class="model-hint">low 用于快速验收，定稿建议回 high</div>
      </el-form-item>
      <el-form-item label="视频步数">
        <el-input-number v-model="form.config.videoSteps" :min="1" :max="50" style="width: 100%" />
        <div class="model-hint">默认 20；turbo 工作流用 4</div>
      </el-form-item>
      <el-form-item label="音频生成">
        <el-select
          v-model="form.config.audioModel"
          placeholder="选择音频生成模型"
          style="width: 100%"
          clearable
          filterable
        >
          <el-option-group
            v-for="provider in audioProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="`${provider.shortId}/${model.name}`"
              :value="`${provider.id}:${model.id}`"
            />
          </el-option-group>
        </el-select>
        <div class="model-hint">用于生成角色配音（可选）</div>
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
import { useEpWorkbenchStore, useEpProjectStore } from '@/stores/episode-production'
import { modelToString, stringToModel } from '../shared/model-config'
import type { UserProviderConfig, ProviderTemplate } from '../../../../shared/types'

type ProviderModelGroup = {
  id: string
  name: string
  shortId: string
  models: Array<{ id: string; name: string; contextWindow?: number; type?: string }>
}

const props = defineProps<{
  modelValue: boolean
  allLwProjects: Array<{ id: string; name: string }>
  providerConfigs: UserProviderConfig[]
  providerTemplates: ProviderTemplate[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'saved': [newLwProjectId: string, oldLwProjectId: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const workbenchStore = useEpWorkbenchStore()
const projectStore = useEpProjectStore()
const loading = computed(() => workbenchStore.loading)

const form = reactive({
  name: '',
  longWritingProjectId: '',
  config: {
    aspectRatio: '16:9' as string,
    resolution: 1080,
    fps: 30,
    defaultTransition: 'fade' as string,
    stylePrompt: '',
    scriptModel: '' as string,
    storyboardModel: '' as string,
    imageModel: '' as string,
    videoModel: '' as string,
    audioModel: '' as string,
    videoQuality: 'high' as string,
    videoSteps: 20
  }
})

// 打开时同步当前项目设置
watch(() => props.modelValue, (val) => {
  if (val && projectStore.currentProject) {
    const project = projectStore.currentProject
    form.name = project.name
    form.longWritingProjectId = project.longWritingProjectId || ''
    const config = project.config
    form.config = {
      ...config,
      scriptModel: modelToString(config.scriptModel),
      storyboardModel: modelToString(config.storyboardModel),
      imageModel: modelToString(config.imageModel),
      videoModel: modelToString(config.videoModel),
      audioModel: modelToString(config.audioModel),
      videoQuality: config.videoQuality || 'high',
      videoSteps: config.videoSteps ?? 20
    }
  }
})

function isTextModel(type: string | undefined): boolean {
  return type === undefined || type === 'text' || type === 'multimodal'
}

const textProviderModels = computed<ProviderModelGroup[]>(() => {
  const result: ProviderModelGroup[] = []
  for (const config of props.providerConfigs) {
    if (!config.isEnabled) continue
    const models: Array<{ id: string; name: string; contextWindow: number; type?: string }> = []
    const template = props.providerTemplates.find(t => t.id === config.templateId)
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (!isTextModel(model.type)) continue
        models.push({ id: model.id, name: model.name, contextWindow: model.contextWindow, type: model.type })
      }
    } else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (!isTextModel(model.type)) continue
        models.push({ id: model.id, name: model.name || model.id, contextWindow: model.contextWindow || 8192, type: model.type })
      }
    }
    if (models.length > 0) {
      result.push({ id: config.id, name: config.name, shortId: config.shortId || config.name, models })
    }
  }
  return result
})

const imageProviderModels = computed<ProviderModelGroup[]>(() => {
  const result: ProviderModelGroup[] = []
  for (const config of props.providerConfigs) {
    if (!config.isEnabled) continue
    const template = props.providerTemplates.find(t => t.id === config.templateId)
    const supportsImage = template?.capabilities?.includes('image')
    if (!supportsImage) continue
    const models: Array<{ id: string; name: string; type?: string }> = []
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (model.type === 'text' || model.type === 'embedding') continue
        models.push({ id: model.id, name: model.name, type: model.type })
      }
    } else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (model.type === 'text' || model.type === 'embedding') continue
        models.push({ id: model.id, name: model.name || model.id, type: model.type })
      }
    } else {
      models.push({ id: 'default', name: '默认模型', type: 'image' })
    }
    if (models.length > 0) {
      result.push({ id: config.id, name: config.name, shortId: config.shortId || config.name, models })
    }
  }
  return result
})

const videoProviderModels = computed<ProviderModelGroup[]>(() => {
  const result: ProviderModelGroup[] = []
  for (const config of props.providerConfigs) {
    if (!config.isEnabled) continue
    const template = props.providerTemplates.find(t => t.id === config.templateId)
    const models: Array<{ id: string; name: string; type?: string }> = []
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (model.type === 'video' || model.type === 'multimodal') {
          models.push({ id: model.id, name: model.name, type: model.type })
        }
      }
    } else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (model.type === 'video' || model.type === 'multimodal') {
          models.push({ id: model.id, name: model.name || model.id, type: model.type })
        }
      }
    }
    if (models.length > 0) {
      result.push({ id: config.id, name: config.name, shortId: config.shortId || config.name, models })
    }
  }
  if (result.length === 0) return textProviderModels.value
  return result
})

const audioProviderModels = computed<ProviderModelGroup[]>(() => {
  const result: ProviderModelGroup[] = []
  for (const config of props.providerConfigs) {
    if (!config.isEnabled) continue
    const template = props.providerTemplates.find(t => t.id === config.templateId)
    const models: Array<{ id: string; name: string; type?: string }> = []
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (model.type === 'audio') models.push({ id: model.id, name: model.name, type: model.type })
      }
    } else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (model.type === 'audio') models.push({ id: model.id, name: model.name || model.id, type: model.type })
      }
    }
    if (models.length > 0) {
      result.push({ id: config.id, name: config.name, shortId: config.shortId || config.name, models })
    }
  }
  return result
})

async function handleSubmit() {
  if (!projectStore.currentProject) return

  const oldLwProjectId = projectStore.currentProject.longWritingProjectId || ''
  // 外键约束要求：空字符串转为 null，否则会触发 FOREIGN KEY constraint failed
  const newLwProjectId = form.longWritingProjectId || null

  const configToSave = {
    ...form.config,
    scriptModel: stringToModel(form.config.scriptModel),
    storyboardModel: stringToModel(form.config.storyboardModel),
    imageModel: stringToModel(form.config.imageModel),
    videoModel: stringToModel(form.config.videoModel),
    audioModel: stringToModel(form.config.audioModel),
    videoQuality: (form.config.videoQuality === 'low' ? 'low' : 'high') as 'high' | 'low',
    videoSteps: form.config.videoSteps
  }

  const success = await projectStore.updateProject(projectStore.currentProject.id, {
    name: form.name,
    config: configToSave,
    // 确保 null 而不是空字符串
    longWritingProjectId: newLwProjectId
  })

  if (success) {
    ElMessage.success('保存成功')
    visible.value = false
    emit('saved', newLwProjectId, oldLwProjectId)
  } else {
    ElMessage.error(workbenchStore.error || '保存失败')
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

.model-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

:deep(.settings-dialog) {
  .el-dialog__body {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    padding: 20px;
  }
}
</style>
