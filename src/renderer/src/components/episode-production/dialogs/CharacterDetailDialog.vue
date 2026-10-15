<template>
  <el-dialog
    v-model="visible"
    title="角色详情"
    width="700px"
    class="entity-detail-dialog"
    destroy-on-close
  >
    <div v-loading="loading" class="detail-content">
      <template v-if="character">
        <!-- 基本信息 -->
        <div class="detail-section">
          <div class="section-title">基本信息</div>
          <div class="section-content">
            <el-descriptions :column="3" border>
              <el-descriptions-item label="名称">{{ character.name }}</el-descriptions-item>
              <el-descriptions-item label="性别">{{ getGenderLabel(character.gender) }}</el-descriptions-item>
              <el-descriptions-item label="年龄">{{ character.age }} 岁</el-descriptions-item>
              <el-descriptions-item label="身高">{{ character.height ? `${character.height} cm` : '-' }}</el-descriptions-item>
              <el-descriptions-item label="体重">{{ character.weight ? `${character.weight} kg` : '-' }}</el-descriptions-item>
              <el-descriptions-item label="人种">{{ character.race ? getRaceLabel(character.race) : '-' }}</el-descriptions-item>
              <el-descriptions-item label="职业">{{ character.occupation || '-' }}</el-descriptions-item>
              <el-descriptions-item label="职务">{{ character.position || '-' }}</el-descriptions-item>
              <el-descriptions-item label="角色定位">
                <el-tag size="small" type="primary">{{ getRolePositionLabel(character.rolePosition) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="重要性">
                <el-tag size="small" :type="getImportanceType(character.importance)">
                  {{ getEntityImportanceLabel(character.importance) }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <!-- 详细设定 -->
        <div class="detail-section">
          <div class="section-title">详细设定</div>
          <div class="section-content">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="外貌描述">
                <div class="description-text">{{ character.appearance || '-' }}</div>
              </el-descriptions-item>
              <el-descriptions-item label="性格特点">
                <div class="description-text">{{ character.personality || '-' }}</div>
              </el-descriptions-item>
              <el-descriptions-item label="背景故事">
                <div class="description-text">{{ character.background || '-' }}</div>
              </el-descriptions-item>
              <el-descriptions-item label="能力特长">
                <div class="description-text">{{ character.abilities || '-' }}</div>
              </el-descriptions-item>
              <el-descriptions-item label="主要事件">
                <div class="description-text">{{ character.majorEvents || '-' }}</div>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <!-- AI 可见信息 -->
        <div class="detail-section ai-section">
          <div class="section-title">
            <el-icon><InfoFilled /></el-icon>
            AI 可见信息
          </div>
          <div class="section-content">
            <div class="ai-info-box">
              <div class="ai-info-hint">以下信息将提交给 AI 用于剧本和分镜生成：</div>
              <pre class="ai-info-code">{{ formatCharacterAIInfo(character) }}</pre>
            </div>
          </div>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import type { StoryCharacter } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  modelValue: boolean
  characterId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const loading = ref(false)
const character = ref<StoryCharacter | null>(null)

// 打开时加载数据
watch(() => props.modelValue, async (val) => {
  if (val && props.characterId) {
    loading.value = true
    character.value = null
    try {
      const result = await window.electronAPI.longwriting.getCharacter(props.characterId)
      if (result.success && result.data) {
        character.value = result.data
      } else {
        ElMessage.error('获取角色详情失败')
        visible.value = false
      }
    } catch (error) {
      console.error('获取角色详情失败:', error)
      ElMessage.error('获取角色详情失败')
      visible.value = false
    } finally {
      loading.value = false
    }
  }
})

function getRolePositionLabel(rolePosition: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    supporting: '配角',
    antagonist: '反派',
    minor: '龙套'
  }
  return labels[rolePosition] || rolePosition
}

function getGenderLabel(gender: string): string {
  const labels: Record<string, string> = {
    male: '男',
    female: '女',
    other: '其他'
  }
  return labels[gender] || gender
}

function getRaceLabel(race: string): string {
  const labels: Record<string, string> = {
    asian: '亚洲人',
    european: '欧洲人',
    other: '其他'
  }
  return labels[race] || race
}

function getEntityImportanceLabel(importance: string): string {
  const labels: Record<string, string> = {
    main: '主要',
    secondary: '次要',
    temporary: '临时'
  }
  return labels[importance] || importance
}

function getImportanceType(importance: string): string {
  const types: Record<string, string> = {
    main: 'danger',
    secondary: 'warning',
    temporary: 'info'
  }
  return types[importance] || 'info'
}

function formatCharacterAIInfo(char: StoryCharacter): string {
  const parts = [
    `【角色】${char.name}`,
    `角色定位：${getRolePositionLabel(char.rolePosition)}`,
    char.personality ? `性格特点：${char.personality}` : null,
    char.appearance ? `外貌描述：${char.appearance}` : null,
    char.abilities ? `能力特长：${char.abilities}` : null
  ].filter(Boolean)
  return parts.join('\n')
}
</script>

<style scoped lang="scss">
.detail-content {
  min-height: 100px;
}

.detail-section {
  margin-bottom: 20px;

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .description-text {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
  }
}

.ai-section {
  .section-title {
    color: var(--el-color-primary);
  }
}

.ai-info-box {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 12px;

  .ai-info-hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }

  .ai-info-code {
    font-family: monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    color: var(--el-text-color-primary);
  }
}
</style>
