<template>
  <div class="character-bindings">
    <div class="bindings-header">
      <h4>角色绑定配置</h4>
      <el-button size="small" @click="emit('open-dialog', 'bindCharacter')">
        <el-icon><Plus /></el-icon>
        绑定角色
      </el-button>
    </div>

    <div class="bindings-list">
      <div
        v-for="binding in store.characterBindings"
        :key="binding.id"
        class="binding-card character-card"
        @click="emit('open-dialog', 'characterDetail', { id: binding.longWritingCharacterId })"
      >
        <div class="card-row">
          <!-- 人像预览图 -->
          <div class="card-portrait-preview" v-if="binding.portraitId">
            <el-image
              :src="getBindingPortraitPreview(binding.portraitId)"
              fit="cover"
            >
              <template #error>
                <div class="portrait-placeholder">
                  <el-icon><User /></el-icon>
                </div>
              </template>
            </el-image>
          </div>
          <!-- 无人像时显示图标 -->
          <div class="card-icon character-icon" v-else>
            <el-icon size="20"><User /></el-icon>
          </div>
          <!-- 名称 -->
          <div class="card-name">{{ getCharacterName(binding.longWritingCharacterId) }}</div>
          <!-- 状态 -->
          <el-tag v-if="binding.portraitId" size="small" type="success">
            已绑定人像
          </el-tag>
          <el-tag v-else size="small" type="warning">
            未绑定人像
          </el-tag>
          <!-- 操作按钮 -->
          <div class="card-actions">
            <el-button text size="small" @click.stop="handleEditBinding(binding)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text size="small" type="danger" @click.stop="handleRemoveBinding(binding)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>

      <el-empty v-if="store.characterBindings.length === 0" description="暂无角色绑定" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, User, Edit, Delete } from '@element-plus/icons-vue'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import type { CharacterBinding } from '../../../../../shared/types/story-to-video.types'
import type { StoryCharacter } from '../../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
  longWritingCharacters: Array<{ id: string; name: string; portraitId?: string }>
  portraitPreviews: Map<string, string>
}>()

const emit = defineEmits<{
  'open-dialog': [name: string, payload?: any]
}>()

const store = useStoryToVideoStore()

function getCharacterName(characterId: string): string {
  const char = props.longWritingCharacters.find(c => c.id === characterId)
  return char?.name || characterId
}

function getBindingPortraitPreview(portraitId: string): string {
  return props.portraitPreviews.get(portraitId) || ''
}

async function isBindingFromLongWriting(binding: CharacterBinding): Promise<boolean> {
  try {
    const result = await window.electronAPI.episodeProduction.isBindingFromLongWriting({
      longWritingCharacterId: binding.longWritingCharacterId
    })
    return result.success && result.data.isFromLongWriting
  } catch (error) {
    console.error('[CharacterBindingTabContent] 判断绑定来源失败:', error)
    return true
  }
}

async function handleEditBinding(binding: CharacterBinding) {
  const fromLongWriting = await isBindingFromLongWriting(binding)
  if (fromLongWriting) {
    ElMessage.info('该角色来源于长文项目，请前往长文项目编辑角色信息')
    return
  }

  try {
    const result = await window.electronAPI.episodeProduction.getUploadedEntity(
      binding.longWritingCharacterId,
      'character'
    )
    if (result.success && result.data) {
      emit('open-dialog', 'entityEdit', {
        type: 'character',
        id: binding.longWritingCharacterId,
        data: result.data as StoryCharacter
      })
    } else {
      ElMessage.error('获取角色信息失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '获取角色信息失败')
  }
}

async function handleRemoveBinding(binding: CharacterBinding) {
  try {
    await ElMessageBox.confirm('确定要移除该角色绑定吗？', '确认', { type: 'warning' })

    const fromLongWriting = await isBindingFromLongWriting(binding)
    if (!fromLongWriting) {
      await window.electronAPI.episodeProduction.deleteUploadedEntity(
        binding.longWritingCharacterId,
        'character',
        props.projectId
      )
    }

    await store.deleteCharacterBinding(binding.id)
    ElMessage.success('移除成功')
  } catch {
    // 用户取消
  }
}
</script>

<style scoped lang="scss">
.character-bindings {
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

.card-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-portrait-preview {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;

  :deep(.el-image) {
    width: 100%;
    height: 100%;
  }
}

.portrait-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  flex-shrink: 0;
}

.card-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.binding-card:hover .card-actions {
  opacity: 1;
}
</style>
