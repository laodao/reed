<template>
  <div class="ctx-panel" :class="{ collapsed }">
    <div class="panel-header">
      <span class="panel-title">上下文预览</span>
      <div class="panel-actions">
        <el-button text size="small" :loading="loading" @click="refresh">⚡ 预览</el-button>
        <el-button text size="small" @click="collapsed = true"><el-icon><DArrowRight /></el-icon></el-button>
      </div>
    </div>

    <div v-if="!collapsed" class="panel-body">
      <div class="panel-note">正文生成走章法工作流：出场实体与注入项由工作流自动选择。此处只读预览实际组装结果与 token 占用。</div>

      <!-- token 预算条 -->
      <div class="budget">
        <div class="budget-bar">
          <div class="budget-fill" :class="budgetLevel" :style="{ width: budgetPct + '%' }" />
        </div>
        <div class="budget-text">
          <span :class="budgetLevel">{{ estimateTokens.toLocaleString() }} / {{ windowTokens.toLocaleString() }} tokens</span>
          <span v-if="budgetLevel === 'over'" class="budget-warn">已超预算窗口</span>
        </div>
      </div>

      <!-- W2.1：裁剪徽标——超预算时章法按价值阶梯自动裁剪的分区 -->
      <div v-if="trimmedSections.length" class="trim-badge">
        已自动裁剪：{{ trimmedSections.join(' → ') }}
      </div>

      <!-- 分区条目（只读查看 + 占用） -->
      <div v-for="group in groups" :key="group.key" class="ctx-section">
        <div class="section-head">
          <span class="section-label">{{ group.label }}</span>
          <span class="section-tokens">{{ group.tokens.toLocaleString() }}</span>
        </div>
        <div v-for="item in group.items" :key="item.id" class="ctx-item" :title="item.text">
          <span class="item-title">{{ item.title }}</span>
          <span class="item-tokens">{{ item.tokens.toLocaleString() }}</span>
        </div>
      </div>

      <div class="panel-footer">
        <el-button size="small" text @click="previewVisible = true">⚡ 预览提示词</el-button>
      </div>
    </div>

    <div v-else class="collapsed-tab" @click="collapsed = false">
      <el-icon><DArrowLeft /></el-icon>
      <span>上下文</span>
    </div>

    <!-- 提示词预览 -->
    <el-dialog v-model="previewVisible" title="最终提示词预览（章法实际组装）" width="720">
      <pre class="prompt-preview">{{ previewText || '加载中…' }}</pre>
      <template #footer>
        <el-button size="small" @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ChapterContextPanel' })
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { DArrowRight, DArrowLeft } from '@element-plus/icons-vue'

interface ContextItem {
  id: string
  sectionKey: string
  title: string
  text: string
  tokens: number
  defaultChecked: boolean
}

const props = defineProps<{
  projectId: string
  outlineId: string
  targetWords?: number
  style?: string
  extraPrompt?: string
}>()

const collapsed = ref(false)
const loading = ref(false)
const items = ref<ContextItem[]>([])
const estimateTokens = ref(0)
const windowTokens = ref(32_768)
const previewVisible = ref(false)
const previewText = ref('')
const trimmedSections = ref<string[]>([])

const SECTION_LABELS: Record<string, string> = {
  overview: '故事宏观背景',
  background: '世界观设定',
  character: '涉及角色',
  location: '涉及地点',
  outline: '大纲节点',
  prewrite: '预写提纲',
  graph: '图谱与记忆',
  prevChapters: '前文衔接',
}

const groups = computed(() => {
  const byKey = new Map<string, ContextItem[]>()
  for (const item of items.value) {
    const list = byKey.get(item.sectionKey) ?? []
    list.push(item)
    byKey.set(item.sectionKey, list)
  }
  return [...byKey.entries()].map(([key, list]) => ({
    key,
    label: SECTION_LABELS[key] ?? key,
    items: list,
    tokens: list.reduce((sum, i) => sum + i.tokens, 0),
  }))
})

const budgetPct = computed(() => (windowTokens.value > 0 ? Math.min(100, Math.round((estimateTokens.value / windowTokens.value) * 100)) : 0))
const budgetLevel = computed(() => {
  const pct = (estimateTokens.value / Math.max(windowTokens.value, 1)) * 100
  if (pct > 100) return 'over'
  if (pct > 90) return 'warn'
  return 'ok'
})

interface ContextPreviewResp {
  success: boolean
  error?: string
  data?: { items: ContextItem[]; promptText: string; estimateTokens: number; windowTokens: number; trimmedSections?: string[] }
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const apiObj = window as never as { electronAPI: { longwriting: { chapterContextPreview?: (p: string, o: string, opts?: Record<string, unknown>) => Promise<ContextPreviewResp> } } }
    const preview = apiObj.electronAPI.longwriting.chapterContextPreview
    if (!preview) {
      ElMessage.warning('当前版本不支持上下文预览（需重启应用）')
      return
    }
    const resp = await preview(props.projectId, props.outlineId, {
      targetWords: props.targetWords,
      style: props.style,
      extraPrompt: props.extraPrompt,
    })
    if (resp.success && resp.data) {
      items.value = resp.data.items
      estimateTokens.value = resp.data.estimateTokens
      windowTokens.value = resp.data.windowTokens
      previewText.value = resp.data.promptText
      trimmedSections.value = resp.data.trimmedSections ?? []
    } else {
      ElMessage.error(resp.error ?? '上下文预览失败')
    }
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
watch(() => props.outlineId, () => {
  void refresh()
})
</script>

<style scoped>
.ctx-panel { width: 320px; flex-shrink: 0; border-left: 1px solid var(--border-color-lighter); display: flex; flex-direction: column; min-height: 0; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--border-color-lighter); }
.panel-title { font-size: 13px; font-weight: 600; }
.panel-actions { display: flex; gap: 2px; }
.panel-body { flex: 1; overflow: auto; padding: 10px; }
.panel-note { font-size: 11px; color: var(--text-secondary); background: var(--fill-color-light); border-radius: 4px; padding: 6px 8px; margin-bottom: 10px; line-height: 1.5; }
.trim-badge { font-size: 11px; color: var(--color-warning); background: var(--fill-color-light); border-radius: 4px; padding: 6px 8px; margin-bottom: 10px; line-height: 1.5; }
.budget { margin-bottom: 10px; }
.budget-bar { height: 8px; border-radius: 4px; background: var(--fill-color); overflow: hidden; }
.budget-fill { height: 100%; background: var(--color-primary); transition: width 0.3s; }
.budget-fill.warn { background: var(--color-warning); }
.budget-fill.over { background: var(--color-danger); }
.budget-text { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.budget-warn { color: var(--color-danger); }
.ctx-section { margin-bottom: 10px; }
.section-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 0; }
.section-label { font-size: 12px; font-weight: 600; }
.section-tokens { font-size: 11px; color: var(--text-placeholder); }
.ctx-item { display: flex; align-items: center; gap: 4px; padding: 2px 0 2px 16px; }
.item-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-tokens { font-size: 11px; color: var(--text-placeholder); margin-left: auto; }
.panel-footer { border-top: 1px solid var(--border-color-lighter); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.collapsed-tab { writing-mode: vertical-lr; padding: 12px 6px; cursor: pointer; color: var(--text-secondary); font-size: 12px; display: flex; align-items: center; gap: 6px; }
.prompt-preview { max-height: 60vh; overflow: auto; font-size: 12px; white-space: pre-wrap; word-break: break-word; background: var(--fill-color-light); padding: 10px; border-radius: 6px; }
</style>
