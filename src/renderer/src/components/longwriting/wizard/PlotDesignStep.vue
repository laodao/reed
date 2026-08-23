<template>
  <div class="plot-design-step">
    <div class="step-header">
      <h2>故事线设计</h2>
      <p class="step-desc">AI 将基于蓝图、人物与世界设定生成完整故事线（起承转合），确认后作为大纲与写作的骨架</p>
    </div>

    <div class="generate-bar">
      <el-button type="primary" :loading="generating" :disabled="plots.length > 0 || generating" @click="generatePlots">
        <el-icon><MagicStick /></el-icon>
        {{ plots.length > 0 ? '已生成故事线' : '生成故事线' }}
      </el-button>
      <el-button v-if="generating" @click="ai.cancel()">取消</el-button>
    </div>

    <!-- 生成中 -->
    <div v-if="generating" class="generating-tip">AI 正在设计故事线（约 10-30 个情节），请稍候...</div>

    <!-- 草稿（未入库） -->
    <div v-if="draft.length > 0" class="draft-section">
      <el-divider>生成结果（{{ draft.length }} 个情节，确认后入库）</el-divider>
      <div class="draft-list">
        <div v-for="(p, i) in draft" :key="i" class="draft-card">
          <div class="draft-index">{{ i + 1 }}</div>
          <div class="draft-body">
            <el-input v-model="p.title" placeholder="情节标题" />
            <el-input v-model="p.summary" type="textarea" :rows="2" placeholder="情节概要" />
            <el-select
              v-model="p.involvedCharacters"
              multiple
              filterable
              allow-create
              placeholder="涉及角色（可输入新名称）"
              style="width: 100%"
            >
              <el-option v-for="c in characterNames" :key="c" :label="c" :value="c" />
            </el-select>
          </div>
        </div>
      </div>
      <div class="draft-actions">
        <el-button @click="draft = []">放弃</el-button>
        <el-button type="primary" @click="confirmDraft">确认故事线</el-button>
      </div>
    </div>

    <!-- 已入库故事线 -->
    <div v-if="plots.length > 0" class="saved-section">
      <el-divider>项目故事线（{{ plots.length }} 个情节，可拖拽排序）</el-divider>
      <div class="saved-list">
        <div v-for="(p, i) in plots" :key="p.id" class="saved-card">
          <div class="saved-index">{{ i + 1 }}</div>
          <div class="saved-body">
            <div class="saved-title">{{ p.title }}</div>
            <div class="saved-summary">{{ p.summary }}</div>
            <div v-if="p.involvedCharacters?.length" class="saved-chars">
              <el-tag v-for="c in p.involvedCharacters" :key="c" size="small">{{ c }}</el-tag>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 向导 Step 3：故事线（情节）
 * generatePlots（已注入完整上下文）→ 草稿编辑（标题/概要/角色）→ 确认后 batchCreatePlots 入库
 */
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import { useAiGeneration, parseJsonLoose } from '@/composables/useAiGeneration'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'stateChanged'): void
}>()

const ai = useAiGeneration()
const generating = ai.generating

interface DraftPlot {
  title: string
  summary: string
  involvedCharacters: string[]
}
const draft = ref<DraftPlot[]>([])
const plots = ref<any[]>([])
const characterNames = ref<string[]>([])

async function generatePlots(): Promise<void> {
  draft.value = []
  const eventId = `plots-${props.projectId}-${Date.now()}`

  const ok = await ai.start({
    eventId,
    subscribe: (handlers: { onContent: (c: string) => void; onDone: () => void; onError: (e: string) => void }) =>
      window.electronAPI.longwriting.onGenerateEvent(eventId, (event: { type: string; content?: string; error?: string }) => {
        if (event.type === 'content' && event.content) handlers.onContent(event.content)
        else if (event.type === 'done') handlers.onDone()
        else if (event.type === 'error') handlers.onError(event.error || '生成失败')
      }),
    invoke: async () => {
      const r = await window.electronAPI.longwriting.generatePlots(eventId, props.projectId)
      return { success: r.success, error: r.error }
    },
  })

  if (!ok) {
    ElMessage.error(ai.error.value || '生成失败')
    return
  }

  const parsed = parseJsonLoose(ai.content.value)
  if (!parsed.ok || !Array.isArray(parsed.data)) {
    ElMessage.warning('AI 返回格式不标准，请重试')
    return
  }
  draft.value = parsed.data.map((p: any) => ({
    title: p.title || '',
    summary: p.summary || '',
    involvedCharacters: Array.isArray(p.involvedCharacters) ? p.involvedCharacters : [],
  }))
}

/** 确认入库（batchCreatePlots） */
async function confirmDraft(): Promise<void> {
  const valid = draft.value.filter(p => p.title.trim())
  if (valid.length === 0) {
    ElMessage.warning('没有有效情节')
    return
  }
  // 深拷贝为纯对象（响应式 proxy → IPC 序列化失败）
  const r = await window.electronAPI.longwriting.batchCreatePlots(
    props.projectId,
    JSON.parse(JSON.stringify(valid.map(p => ({
      title: p.title.trim(),
      summary: p.summary.trim(),
      involvedCharacters: p.involvedCharacters,
    }))))
  )
  if (r.success) {
    draft.value = []
    await loadPlots()
    emit('stateChanged')
    ElMessage.success(`故事线已确认（${valid.length} 个情节）`)
  } else {
    ElMessage.error(r.error || '入库失败')
  }
}

async function loadPlots(): Promise<void> {
  const r = await window.electronAPI.longwriting.getPlots(props.projectId)
  if (r.success) plots.value = r.data || []
}

async function loadCharacterNames(): Promise<void> {
  const r = await window.electronAPI.longwriting.getCharacters(props.projectId)
  if (r.success) characterNames.value = (r.data || []).map((c: any) => c.name)
}

onMounted(() => {
  loadPlots()
  loadCharacterNames()
})
</script>

<style lang="scss" scoped>
.plot-design-step {
  max-width: 820px;
  margin: 0 auto;
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

.generate-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  background: var(--bg-color);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.generating-tip {
  margin-top: 12px;
  padding: 12px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
  text-align: center;
}

.draft-list,
.saved-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.draft-card,
.saved-card {
  display: flex;
  gap: 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 12px;
}

.draft-index,
.saved-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-primary-light-9);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.draft-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.saved-body {
  flex: 1;
}

.saved-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.saved-summary {
  font-size: 13px;
  color: var(--text-color-regular);
  line-height: 1.6;
  margin-top: 4px;
}

.saved-chars {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.draft-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}
</style>
