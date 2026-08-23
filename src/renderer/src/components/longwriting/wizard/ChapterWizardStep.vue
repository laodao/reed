<template>
  <div class="chapter-wizard-step">
    <div class="step-header">
      <h2>逐章写作</h2>
      <p class="step-desc">按大纲顺序逐个章节写作：AI 自动携带前情（上一章状态/记忆/设定）生成，生成后可编辑确认</p>
    </div>

    <div class="chapter-layout">
      <!-- 左侧：大纲叶子列表 -->
      <div class="chapter-nav">
        <div
          v-for="(leaf, i) in leafChapters"
          :key="leaf.id"
          class="chapter-nav-item"
          :class="{ active: activeOutlineId === leaf.id, done: isChapterDone(leaf.id) }"
          @click="selectChapter(leaf)"
        >
          <span class="nav-index">{{ i + 1 }}</span>
          <span class="nav-name">{{ leaf.name }}</span>
          <el-icon v-if="isChapterDone(leaf.id)" class="done-icon"><Check /></el-icon>
        </div>
        <div v-if="leafChapters.length === 0" class="nav-empty">
          暂无章节大纲，请先完成上一步「故事大纲」
        </div>
      </div>

      <!-- 右侧：当前章编辑 -->
      <div v-if="currentLeaf" class="chapter-editor">
        <div class="editor-header">
          <span class="chapter-name">{{ currentLeaf.name }}</span>
          <span class="chapter-summary">{{ currentLeaf.summary }}</span>
          <div class="editor-actions">
            <el-button size="small" :loading="generating" :disabled="!canGenerate" @click="generateCurrent">
              <el-icon><MagicStick /></el-icon>
              {{ generating ? '生成中...' : '生成本章' }}
            </el-button>
            <el-button v-if="generating" size="small" @click="ai.cancel()">取消</el-button>
            <el-button size="small" type="success" :disabled="!content.trim()" @click="saveCurrent">
              <el-icon><Check /></el-icon>
              保存
            </el-button>
          </div>
        </div>

        <el-input
          v-model="content"
          type="textarea"
          :rows="20"
          placeholder="AI 生成内容将显示在这里，你可以直接编辑..."
        />
        <div class="editor-status">
          <span v-if="wordCount > 0">{{ wordCount }} 字</span>
          <span v-if="savedAt" class="saved-at">已保存 {{ savedAt }}</span>
        </div>
      </div>

      <div v-else class="chapter-empty">
        从左侧选择要写作的章节
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 向导 Step 5：逐章写作（流水线骨架）
 * 写前校验/提取更新图谱留待阶段 2；本步实现：章节列表 → 生成（generateChapter 流式）→ 编辑 → 保存
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Check } from '@element-plus/icons-vue'
import { useAiGeneration } from '@/composables/useAiGeneration'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'stateChanged'): void
}>()

const ai = useAiGeneration()
const generating = ai.generating

const outlineNodes = ref<any[]>([])
const leafChapters = ref<any[]>([])
const activeOutlineId = ref('')
const content = ref('')
const savedAt = ref('')
const chapterIdMap = ref<Record<string, string>>({})

const currentLeaf = computed(() => leafChapters.value.find(l => l.id === activeOutlineId.value) || null)
const wordCount = computed(() => content.value.replace(/\s/g, '').length)
const canGenerate = computed(() => !!currentLeaf.value && !generating.value)

function isChapterDone(outlineId: string): boolean {
  return !!chapterIdMap.value[outlineId] && !!contentMap.value[outlineId]
}
// 供 isChapterDone 使用：记录各章是否有内容（简化：保存过即视为完成）
const contentMap = ref<Record<string, string>>({})

async function loadOutline(): Promise<void> {
  const r = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (r.success) {
    outlineNodes.value = r.data || []
    // 叶子 = section（无 section 时 chapter）
    const leaves = outlineNodes.value.filter(n =>
      n.nodeType === 'section' || (n.nodeType === 'chapter' && !outlineNodes.value.some(c => c.parentId === n.id)),
    )
    leafChapters.value = leaves.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    if (leafChapters.value.length > 0 && !activeOutlineId.value) {
      selectChapter(leafChapters.value[0])
    }
  }
}

async function selectChapter(leaf: any): Promise<void> {
  activeOutlineId.value = leaf.id
  content.value = ''
  savedAt.value = ''
  const r = await window.electronAPI.longwriting.getChapter(leaf.id)
  if (r.success && r.data) {
    content.value = r.data.content || ''
    savedAt.value = r.data.updatedAt ? new Date(r.data.updatedAt).toLocaleTimeString() : ''
    chapterIdMap.value[leaf.id] = r.data.id
    contentMap.value[leaf.id] = r.data.content || ''
  }
}

async function generateCurrent(): Promise<void> {
  if (!currentLeaf.value) return
  const outlineId = currentLeaf.value.id
  const eventId = `chapter-${outlineId}-${Date.now()}`
  content.value = ''

  const ok = await ai.start({
    eventId,
    subscribe: (handlers: { onContent: (c: string) => void; onDone: () => void; onError: (e: string) => void }) =>
      window.electronAPI.longwriting.onGenerateEvent(eventId, (event: { type: string; content?: string; error?: string }) => {
        if (event.type === 'content' && event.content) {
          handlers.onContent(event.content)
          content.value = ai.content.value // 同步到编辑区
        } else if (event.type === 'done') {
          handlers.onDone()
          content.value = ai.content.value
        } else if (event.type === 'error') {
          handlers.onError(event.error || '生成失败')
        }
      }),
    invoke: async () => {
      const r = await window.electronAPI.longwriting.generateChapter(eventId, props.projectId, outlineId, currentLeaf.value.estimatedWords || 3000)
      return { success: r.success, error: r.error }
    },
  })

  if (!ok) {
    ElMessage.error(ai.error.value || '生成失败')
    return
  }
  content.value = ai.content.value
  await saveCurrent(true)
}

async function saveCurrent(auto = false): Promise<void> {
  if (!currentLeaf.value || !content.value.trim()) return
  const r = await window.electronAPI.longwriting.saveChapter(currentLeaf.value.id, content.value)
  if (r.success) {
    chapterIdMap.value[currentLeaf.value.id] = r.data?.id || chapterIdMap.value[currentLeaf.value.id]
    contentMap.value[currentLeaf.value.id] = content.value
    savedAt.value = new Date().toLocaleTimeString()
    emit('stateChanged')
    if (!auto) ElMessage.success('章节已保存')
  } else {
    ElMessage.error(r.error || '保存失败')
  }
}

onMounted(() => {
  loadOutline()
})
</script>

<style lang="scss" scoped>
.chapter-wizard-step {
  max-width: 1100px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.step-header {
  margin-bottom: 16px;

  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 6px 0;
  }

  .step-desc {
    font-size: 13px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.chapter-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.chapter-nav {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chapter-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
    color: var(--color-primary);
  }

  &.done .nav-index {
    background: var(--color-success);
    color: #fff;
  }
}

.nav-index {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--fill-color);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done-icon {
  color: var(--color-success);
}

.nav-empty {
  font-size: 12px;
  color: var(--text-color-placeholder);
  padding: 12px;
  text-align: center;
}

.chapter-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 14px;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;

  .chapter-name {
    font-size: 16px;
    font-weight: 600;
  }

  .chapter-summary {
    flex: 1;
    font-size: 12px;
    color: var(--text-color-secondary);
  }

  .editor-actions {
    display: flex;
    gap: 8px;
  }
}

.editor-status {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-placeholder);

  .saved-at {
    color: var(--color-success);
  }
}

.chapter-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-placeholder);
}
</style>
