<template>
  <div class="outline-stage">
    <div class="stage-header">
      <h2>大纲设计</h2>
      <p class="stage-desc">设计评论文章的结构大纲</p>
    </div>

    <div class="stage-content">
      <!-- 大纲列表 -->
      <div class="outline-list">
        <div v-for="(section, index) in outlineSections" :key="section.id" class="outline-item">
          <div class="item-header">
            <div class="item-number">{{ index + 1 }}</div>
            <el-input
              v-model="section.name"
              placeholder="输入段落标题"
              class="item-title-input"
              @change="updateSection(section)"
            />
            <div class="item-actions">
              <el-button text @click="moveSection(index, -1)" :disabled="index === 0">
                <el-icon><ArrowUp /></el-icon>
              </el-button>
              <el-button text @click="moveSection(index, 1)" :disabled="index === outlineSections.length - 1">
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <el-button text type="danger" @click="deleteSection(index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
          <div class="item-content">
            <el-input
              v-model="section.summary"
              type="textarea"
              :rows="2"
              placeholder="描述本段落的要点..."
              @change="updateSection(section)"
            />
          </div>
          <div class="item-meta">
            <el-input-number v-model="section.estimatedWords" :min="100" :max="10000" :step="100" size="small" @change="updateSection(section)" />
            <span class="words-label">预估字数</span>
          </div>
        </div>

        <el-button type="primary" plain class="add-btn" @click="addSection">
          <el-icon><Plus /></el-icon>
          添加段落
        </el-button>
      </div>

      <!-- 快速生成按钮 -->
      <div class="action-buttons">
        <el-button v-if="!generating" type="primary" size="large" @click="generateOutline">
          <el-icon><MagicStick /></el-icon>
          AI 生成大纲建议
        </el-button>
        <el-button v-else type="danger" size="large" @click="cancelGeneration">
          <el-icon><Close /></el-icon>
          取消生成
        </el-button>
      </div>

      <!-- 生成进度 -->
      <div v-if="generating" class="generating-progress">
        <el-progress :percentage="100" :indeterminate="true" />
        <p class="progress-text">AI 正在生成大纲建议...</p>
      </div>

      <!-- 大纲统计 -->
      <div class="outline-stats">
        <el-statistic title="总段落数" :value="outlineSections.length" />
        <el-statistic title="预估总字数" :value="totalEstimatedWords" />
        <el-statistic title="已写段落" :value="completedSections" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, ArrowUp, ArrowDown, MagicStick, Close } from '@element-plus/icons-vue'
import type { StoryOutline } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 大纲段落（评论类型使用扁平的大纲结构）
const outlineSections = ref<StoryOutline[]>([])

// 生成状态
const generating = ref(false)
const currentEventId = ref<string | null>(null)
const generatingContent = ref('')

// 加载状态
const loading = ref(false)

// 统计数据
const totalEstimatedWords = computed(() => {
  return outlineSections.value.reduce((sum, s) => sum + (s.estimatedWords || 0), 0)
})

const completedSections = computed(() => {
  return outlineSections.value.filter(s => s.status === 'completed').length
})

// 加载大纲
async function loadOutline() {
  if (!props.projectId) return
  loading.value = true
  const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (result.success) {
    // 评论类型只使用 section 级别的大纲
    outlineSections.value = (result.data || [])
      .filter(o => o.nodeType === 'section' || !o.parentId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }
  loading.value = false
}

// 添加段落
async function addSection() {
  const result = await window.electronAPI.longwriting.createOutline({
    projectId: props.projectId,
    name: '',
    nodeType: 'section',
    level: 1,
    summary: '',
    estimatedWords: 500,
    orderIndex: outlineSections.value.length
  })

  if (result.success) {
    outlineSections.value.push(result.data)
  } else {
    ElMessage.error(result.error || '添加失败')
  }
}

// 删除段落
async function deleteSection(index: number) {
  try {
    await ElMessageBox.confirm('确定要删除该段落吗？', '删除段落', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const section = outlineSections.value[index]
    let result = await window.electronAPI.longwriting.deleteOutline(section.id)
    if (result.success && result.data?.needsConfirm) {
      await ElMessageBox.confirm(
        `该段落包含已写正文（${(result.data.chapters || []).join('、')}），删除将连带清除正文，确定继续吗？`,
        '删除含正文的段落',
        { confirmButtonText: '删除并清理正文', cancelButtonText: '取消', type: 'warning' }
      )
      result = await window.electronAPI.longwriting.deleteOutline(section.id, true)
    }
    if (result.success) {
      outlineSections.value.splice(index, 1)
      ElMessage.success('段落已删除')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 移动段落
async function moveSection(index: number, direction: number) {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= outlineSections.value.length) return

  // 交换位置
  const temp = outlineSections.value[index]
  outlineSections.value[index] = outlineSections.value[newIndex]
  outlineSections.value[newIndex] = temp

  // 更新 orderIndex
  await Promise.all([
    window.electronAPI.longwriting.updateOutline(outlineSections.value[index].id, { orderIndex: index }),
    window.electronAPI.longwriting.updateOutline(outlineSections.value[newIndex].id, { orderIndex: newIndex })
  ])
}

// 更新段落
async function updateSection(section: StoryOutline) {
  const rawSection = toRaw(section)
  await window.electronAPI.longwriting.updateOutline(rawSection.id, {
    name: rawSection.name,
    summary: rawSection.summary,
    estimatedWords: rawSection.estimatedWords
  })
}

// AI 生成大纲
async function generateOutline() {
  generating.value = true
  generatingContent.value = ''

  // 生成唯一事件 ID
  currentEventId.value = `outline-comment-${props.projectId}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        // 解析 AI 响应
        parseOutlineResult(generatingContent.value)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 调用 AI API，传递 eventId
  const result = await window.electronAPI.longwriting.generateOutlineComment(currentEventId.value, props.projectId)

  if (!result.success) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 解析 AI 响应
async function parseOutlineResult(content: string) {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }

    const suggestedSections = JSON.parse(jsonMatch[0])

    if (!Array.isArray(suggestedSections) || suggestedSections.length === 0) {
      ElMessage.warning('AI 未生成大纲建议')
      return
    }

    try {
      await ElMessageBox.confirm(
        `AI 建议生成以下大纲：\n\n${suggestedSections.map((s: any, i: number) => `${i + 1}. ${s.name}（${s.estimatedWords || 500}字）`).join('\n')}`,
        'AI 生成建议',
        {
          confirmButtonText: '采纳建议',
          cancelButtonText: '取消',
          type: 'info'
        }
      )

      // 清除现有大纲
      for (const section of outlineSections.value) {
        const r1 = await window.electronAPI.longwriting.deleteOutline(section.id)
        if (r1.success && r1.data?.needsConfirm) {
          await window.electronAPI.longwriting.deleteOutline(section.id, true)
        }
      }

      // 创建新大纲
      for (let i = 0; i < suggestedSections.length; i++) {
        const suggested = suggestedSections[i]
        await window.electronAPI.longwriting.createOutline({
          projectId: props.projectId,
          name: suggested.name || '',
          nodeType: 'section',
          level: 1,
          summary: suggested.summary || '',
          estimatedWords: suggested.estimatedWords || 500,
          orderIndex: i
        })
      }

      await loadOutline()
      updateProgress()
      ElMessage.success('大纲已生成')
    } catch {
      // 用户取消
    }
  } catch (error) {
    console.error('解析 AI 响应失败:', error)
    ElMessage.error('解析 AI 响应失败')
  }
}

// 取消生成
function cancelGeneration() {
  if (!currentEventId.value) return
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
}

// 更新进度
function updateProgress() {
  emit('update:progress', 60)
}

// 监听 projectId 变化重新加载
watch(() => props.projectId, () => {
  loadOutline()
})

onMounted(() => {
  loadOutline()
})
</script>

<style lang="scss" scoped>
.outline-stage {
  max-width: 900px;
  margin: 0 auto;
}

.stage-header {
  margin-bottom: 24px;

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 8px 0;
  }

  .stage-desc {
    font-size: 14px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.stage-content {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.outline-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.outline-item {
  padding: 16px;
  background: var(--fill-color-blank);
  border-radius: 8px;
  border: 1px solid var(--border-color-lighter);

  .item-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;

    .item-number {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-primary-light-9);
      color: var(--color-primary);
      border-radius: 50%;
      font-weight: 500;
    }

    .item-title-input {
      flex: 1;
    }

    .item-actions {
      display: flex;
      gap: 4px;
    }
  }

  .item-content {
    margin-bottom: 12px;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 8px;

    .words-label {
      font-size: 13px;
      color: var(--text-color-secondary);
    }
  }
}

.add-btn {
  width: 100%;
  height: 48px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.generating-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;

  .progress-text {
    margin-top: 8px;
    font-size: 14px;
    color: var(--text-color-secondary);
    text-align: center;
  }
}

.outline-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color-lighter);
}
</style>