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
            <el-tag v-if="cardConfirmed" type="success" size="small">设计已确认</el-tag>
            <el-button size="small" :loading="cardLoading" @click="generateCard">
              <el-icon><MagicStick /></el-icon>
              {{ cardLoading ? '设计中...' : (cardExists ? '重新设计本章' : '设计本章') }}
            </el-button>
            <el-button size="small" type="primary" plain :disabled="!cardExists || cardConfirmed" @click="confirmCard">
              确认设计
            </el-button>
            <el-button size="small" :loading="generating" :disabled="!canGenerate || !cardConfirmed" @click="generateCurrent">
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

        <!-- 54 号章法：先设计 → 自检 → 确认 → 再写正文 -->
        <div v-if="cardVisible" class="chapter-card">
          <pre class="card-content">{{ cardMarkdown }}</pre>
          <div v-if="cardReview && cardReview.issues.length" class="card-review card-review-warn">
            <div class="review-title">自检发现的问题（可重新设计，或确认带问题继续）：</div>
            <div v-for="(issue, i) in cardReview.issues" :key="i" class="review-issue">· {{ issue }}</div>
          </div>
          <div v-else-if="cardReview" class="card-review card-review-ok">自检通过：情节服务主线、与前情无冲突。</div>
          <div v-if="cardUnresolved.length" class="card-review card-review-warn">
            <div class="review-title">以下人名未在人物册中（已按原样保留，建议先补入设定）：</div>
            <div class="review-issue">{{ cardUnresolved.join('、') }}</div>
          </div>
        </div>

        <el-input
          v-model="content"
          type="textarea"
          :rows="20"
          :placeholder="cardConfirmed ? 'AI 生成内容将显示在这里，你可以直接编辑...' : '请先「设计本章」并确认设计卡，再生成本章正文...'"
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Check } from '@element-plus/icons-vue'
import { useAiGeneration } from '@/composables/useAiGeneration'
import { notifyWarning } from '@/utils/notify'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'stateChanged'): void
}>()

const ai = useAiGeneration()
const generating = ai.generating
const cardLoading = ref(false)

// 54 号章法：本章设计卡（先设计→自检→确认→后写正文）
const cardMarkdown = ref('')
const cardReview = ref<{ ok: boolean; issues: string[] } | null>(null)
const cardUnresolved = ref<string[]>([])
const cardConfirmed = ref(false)
const cardExists = ref(false)
const cardVisible = computed(() => !!cardMarkdown.value)

async function generateCard(): Promise<void> {
  if (!currentLeaf.value || cardLoading.value) return
  cardLoading.value = true
  try {
    const eventId = `card-${props.projectId}-${Date.now()}`
    const r = await window.electronAPI.longwriting.generateChapterCard(eventId, props.projectId, currentLeaf.value.id)
    if (!r.success) {
      ElMessage.error(r.error || '设计卡生成失败')
      return
    }
    cardMarkdown.value = r.data.markdown || ''
    cardReview.value = r.data.review || null
    cardUnresolved.value = r.data.unresolvedNames || []
    cardExists.value = true
    cardConfirmed.value = false
    ElMessage.success('本章设计卡已生成，请确认后开始写正文')
  } finally {
    cardLoading.value = false
  }
}

async function confirmCard(): Promise<void> {
  if (!currentLeaf.value) return
  const r = await window.electronAPI.longwriting.confirmPrewrite(currentLeaf.value.id)
  if (r.success) {
    cardConfirmed.value = true
    ElMessage.success('设计已确认，可以生成本章正文了')
  } else {
    ElMessage.error(r.error || '确认失败')
  }
}

async function loadCardState(outlineId: string): Promise<void> {
  cardMarkdown.value = ''
  cardReview.value = null
  cardUnresolved.value = []
  cardConfirmed.value = false
  cardExists.value = false
  const r = await window.electronAPI.longwriting.getPrewrite(outlineId)
  if (r.success && r.data?.content) {
    cardMarkdown.value = r.data.content
    cardExists.value = true
    cardConfirmed.value = !!r.data.isConfirmed
  }
}

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
  void loadCardState(leaf.id)
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

  // 阶段2：写前校验（目标章节时间点的实体状态冲突检测）
  // 返回语义：true=继续 / false=用户在冲突弹窗点取消（中止生成）/ null=校验服务异常（降级放行）。
  // 旧代码 `=== null` 判定把两者弄反：用户取消无效、服务异常反而误阻断。
  const conflicts = await runPreGenerationCheck(currentLeaf.value.id)
  if (conflicts === false) return // 用户取消

  const outlineId = currentLeaf.value.id
  content.value = ''

  // 2026-09-18 用户指令：正文写作只剩章法工作流入口（设计卡→自检→门禁→写→存→图谱→写后检查）。
  // 工作流在主进程已落库，完成后从返回的 content 刷新编辑区，不再走流式直写 + 前端保存。
  generating.value = true
  try {
    const r = await window.electronAPI.longwriting.writeChapterFull(
      `wf-${outlineId}-${Date.now()}`,
      props.projectId,
      outlineId
    )
    if (!r.success) {
      ElMessage.error(r.error || '生成失败')
      return
    }
    const data: any = r.data || {}
    content.value = data.content || ''
    if (data.chapterId) chapterIdMap.value[outlineId] = data.chapterId
    ElMessage.success(`章节已按章法生成并保存（${data.wordCount || content.value.length} 字）`)
    if (data.postCheck && data.postCheck.passed === false) {
      notifyWarning({ title: '写后一致性检查发现疑点', message: String(data.postCheck.report || '').slice(0, 800) })
    }
    savedAt.value = new Date().toLocaleTimeString()
  } catch (e: any) {
    ElMessage.error('章法工作流失败：' + (e?.message || e))
  } finally {
    generating.value = false
  }
}

/**
 * 阶段2 写前校验：调用 validateBeforeGeneration，有冲突时弹窗让用户确认。
 * @returns true=继续生成 / false=用户取消 / null=校验失败但放行
 */
async function runPreGenerationCheck(outlineId: string): Promise<boolean | null> {
  try {
    const chapterNo = calcChapterNo(outlineId)
    const r = await window.electronAPI.longwriting.graphValidateBeforeGeneration(props.projectId, outlineId, chapterNo)
    if (!r.success || !Array.isArray(r.data) || r.data.length === 0) return true

    const errors = r.data.filter((c: any) => c.severity === 'error')
    const warnings = r.data.filter((c: any) => c.severity === 'warning')
    const lines = [
      ...errors.map((c: any) => `❌ ${c.message}`),
      ...warnings.map((c: any) => `⚠️ ${c.message}`),
    ]
    try {
      await ElMessageBox.confirm(
        `检测到 ${r.data.length} 处可能的时间线冲突：\n\n${lines.join('\n')}\n\n仍要继续生成吗？`,
        '时间线一致性检查',
        { confirmButtonText: '继续生成', cancelButtonText: '取消', type: 'warning' },
      )
      return true
    } catch {
      return false
    }
  } catch {
    // 校验服务异常不阻断生成（降级放行）
    return null
  }
}

function calcChapterNo(outlineId: string): number {
  let count = 0
  for (const n of outlineNodes.value) {
    if (n.nodeType === 'chapter') count++
    if (n.id === outlineId) return count
  }
  return count || 1
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
    // 阶段2：章节确认后跑图谱流水线（事件/状态/建边/摘要），失败不影响保存
    void runChapterGraphPipeline(currentLeaf.value.id)
  } else {
    ElMessage.error(r.error || '保存失败')
  }
}

/**
 * 阶段2：章节确认流水线——提取本章事件/实体状态/自动建边/章节摘要，更新图谱。
 */
async function runChapterGraphPipeline(outlineId: string): Promise<void> {
  const outline = outlineNodes.value.find(n => n.id === outlineId)
  const chapterContent = contentMap.value[outlineId] || ''
  if (!outline || !chapterContent.trim() || chapterContent.length < 100) return
  try {
    const chapterNo = calcChapterNo(outlineId)
    const r = await window.electronAPI.longwriting.graphExtractChapter(
      props.projectId,
      outlineId,
      chapterContent,
      chapterNo,
    )
    if (r.success && r.data) {
      const { events, stateCount } = r.data
      const parts: string[] = []
      if (events?.length) parts.push(`${events.length} 个事件`)
      if (stateCount) parts.push(`${stateCount} 条状态更新`)
      if (parts.length) ElMessage.success(`图谱已更新（${parts.join('，')}）`)
    }
  } catch (e) {
    console.error('[ChapterWizardStep] 图谱流水线失败:', e)
  }
}

onMounted(() => {
  loadOutline()
})
</script>

<style lang="scss" scoped>
.chapter-card {
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);

  .card-content {
    margin: 0;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.7;
    font-family: inherit;
  }

  .card-review {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.6;
    border-radius: 4px;
    padding: 6px 8px;

    .review-title { font-weight: 600; margin-bottom: 2px; }
  }

  .card-review-warn {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning-dark-2);
  }

  .card-review-ok {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success-dark-2);
  }
}

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
