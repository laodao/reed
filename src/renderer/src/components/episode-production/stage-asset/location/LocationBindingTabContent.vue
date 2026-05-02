<template>
  <div class="location-bindings">
    <div class="bindings-header">
      <h4>地点绑定配置</h4>
      <el-button size="small" @click="emit('open-dialog', 'bindLocation')">
        <el-icon><Plus /></el-icon>
        绑定地点
      </el-button>
    </div>

    <div class="bindings-list">
      <div
        v-for="binding in assetStore.locationBindings"
        :key="binding.id"
        class="binding-card location-card"
        @click="emit('open-dialog', 'locationDetail', { id: binding.longWritingLocationId })"
      >
        <div class="card-header">
          <div class="card-icon location-icon">
            <el-icon size="24"><Location /></el-icon>
          </div>
          <div class="card-title">
            <div class="binding-name">{{ binding.locationName }}</div>
            <el-tag size="small" type="info" v-if="getLocationImportance(binding.longWritingLocationId)">
              {{ getEntityImportanceLabel(getLocationImportance(binding.longWritingLocationId)) }}
            </el-tag>
          </div>
        </div>
        <div class="card-body">
          <div class="binding-status">
            <el-tag v-if="binding.imagePaths && binding.imagePaths.length > 0" size="small" type="success">
              <el-icon><Picture /></el-icon>
              {{ binding.imagePaths.length }} 张图片
            </el-tag>
            <el-tag v-else size="small" type="warning">
              <el-icon><Warning /></el-icon>
              未绑定图片
            </el-tag>
          </div>
        </div>
        <div class="card-footer">
          <el-button text size="small" @click.stop="handleEditLocationBinding(binding)">
            <el-icon><Edit /></el-icon>
            编辑
          </el-button>
          <el-button text size="small" type="danger" @click.stop="handleRemoveLocationBinding(binding)">
            <el-icon><Delete /></el-icon>
            移除
          </el-button>
        </div>
      </div>

      <el-empty v-if="assetStore.locationBindings.length === 0" description="暂无地点绑定" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Location, Picture, Warning, Edit, Delete } from '@element-plus/icons-vue'
import { useEpAssetStore } from '@/stores/episode-production'
import type { LocationBinding } from '../../../../../shared/types/story-to-video.types'
import type { StoryLocation } from '../../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'open-dialog': [name: string, payload?: any]
}>()

const assetStore = useEpAssetStore()

function getLocationImportance(_locationId: string): string | undefined {
  return undefined
}

function getEntityImportanceLabel(importance: string | undefined): string {
  if (!importance) return ''
  const labels: Record<string, string> = {
    main: '主要',
    secondary: '次要',
    temporary: '临时'
  }
  return labels[importance] || importance
}

async function isBindingFromLongWriting(binding: LocationBinding): Promise<boolean> {
  try {
    const result = await window.electronAPI.episodeProduction.isBindingFromLongWriting({
      longWritingLocationId: binding.longWritingLocationId
    })
    return result.success && result.data.isFromLongWriting
  } catch {
    return true
  }
}

async function handleEditLocationBinding(binding: LocationBinding) {
  const fromLongWriting = await isBindingFromLongWriting(binding)
  if (fromLongWriting) {
    ElMessage.info('该地点来源于长文项目，请前往长文项目编辑地点信息')
    return
  }

  try {
    const result = await window.electronAPI.episodeProduction.getUploadedEntity(
      binding.longWritingLocationId,
      'location'
    )
    if (result.success && result.data) {
      emit('open-dialog', 'entityEdit', {
        type: 'location',
        id: binding.longWritingLocationId,
        data: result.data as StoryLocation
      })
    } else {
      ElMessage.error('获取地点信息失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '获取地点信息失败')
  }
}

async function handleRemoveLocationBinding(binding: LocationBinding) {
  try {
    await ElMessageBox.confirm('确定要移除该地点绑定吗？', '确认', { type: 'warning' })

    const fromLongWriting = await isBindingFromLongWriting(binding)
    if (!fromLongWriting) {
      await window.electronAPI.episodeProduction.deleteUploadedEntity(
        binding.longWritingLocationId,
        'location',
        props.projectId
      )
    }

    await assetStore.deleteLocationBinding(binding.id)
    ElMessage.success('移除成功')
  } catch {
    // 用户取消
  }
}
</script>

<style scoped lang="scss">
.location-bindings {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bindings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;

  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
  }
}

.bindings-list {
  flex: 1;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.binding-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  flex-shrink: 0;
}

.card-title {
  flex: 1;

  .binding-name {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 4px;
  }
}

.card-body {
  margin-bottom: 8px;
}

.card-footer {
  display: flex;
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 8px;
}
</style>
