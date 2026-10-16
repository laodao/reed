<template>
  <div class="tpl-library">
    <!-- 分类侧栏 -->
    <div class="tpl-sidebar">
      <div class="side-section">
        <div class="side-label">分类</div>
        <div
          v-for="cat in categoryItems"
          :key="cat.key"
          class="side-item"
          :class="{ active: activeCategory === cat.key }"
          @click="activeCategory = cat.key"
        >
          <span>{{ cat.label }}</span>
          <span class="count">{{ cat.count }}</span>
        </div>
      </div>
      <div class="side-section">
        <div class="side-label">来源</div>
        <div
          v-for="src in sourceItems"
          :key="src.key"
          class="side-item"
          :class="{ active: activeSource === src.key }"
          @click="activeSource = src.key"
        >
          <span>{{ src.label }}</span>
          <span class="count">{{ src.count }}</span>
        </div>
      </div>
    </div>

    <!-- 卡片网格 -->
    <div class="tpl-main">
      <div v-if="loading" class="tpl-empty">加载中...</div>
      <div v-else-if="filtered.length === 0" class="tpl-empty">
        <div class="empty-ico">📚</div>
        <p>{{ keyword ? '没有匹配的模板' : '暂无模板，点击右上角新建' }}</p>
      </div>
      <div v-else class="tpl-grid">
        <TemplateCard
          v-for="tpl in filtered"
          :key="tpl.id"
          :template="tpl"
          @preview="previewTemplate"
          @copy="copyTemplate"
          @edit="startEdit"
          @delete="confirmDelete"
        />
      </div>
    </div>

    <!-- 预览对话框（只读） -->
    <el-dialog v-model="showPreview" :title="previewing?.name" width="560px">
      <div class="preview-meta">
        <span class="meta-tag">{{ previewing ? PROMPT_TEMPLATE_CATEGORY_LABELS[previewing.category] : '' }}</span>
        <span class="meta-tag" :class="previewing?.builtin ? 'src-builtin' : ''">
          {{ previewing?.builtin ? '内置' : '自定义' }}
        </span>
      </div>
      <div class="preview-content">{{ previewing?.content }}</div>
      <template #footer>
        <el-button @click="showPreview = false">关闭</el-button>
        <el-button type="primary" @click="copyTemplate(previewing!)">复制</el-button>
      </template>
    </el-dialog>

    <!-- 新建/编辑对话框 -->
    <TemplateEditDialog
      v-model="showEditDialog"
      :template="editing"
      @saved="loadAll"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TemplateCard from './TemplateCard.vue'
import TemplateEditDialog from './TemplateEditDialog.vue'
import { PROMPT_TEMPLATE_CATEGORY_LABELS } from '../../../../../shared/types/portrait.types'
import type {
  PortraitPromptTemplate,
  PromptTemplateCategory
} from '../../../../../shared/types/portrait.types'

/**
 * 模板库（plan B2）：
 * 分类侧栏（全量拉取客户端分组计数）+ 卡片网格 + 预览/复制/编辑/删除。
 */
const props = withDefaults(defineProps<{
  keyword?: string
}>(), {
  keyword: ''
})

const templates = ref<PortraitPromptTemplate[]>([])
const loading = ref(false)
const activeCategory = ref<'all' | PromptTemplateCategory>('all')
const activeSource = ref<'all' | 'builtin' | 'custom'>('all')

const showPreview = ref(false)
const previewing = ref<PortraitPromptTemplate | null>(null)
const showEditDialog = ref(false)
const editing = ref<PortraitPromptTemplate | null>(null)

const keyword = computed(() => props.keyword.trim().toLowerCase())

// 过滤
const filtered = computed(() => {
  return templates.value.filter(t => {
    if (activeCategory.value !== 'all' && t.category !== activeCategory.value) return false
    if (activeSource.value === 'builtin' && !t.builtin) return false
    if (activeSource.value === 'custom' && t.builtin) return false
    if (keyword.value && !t.name.toLowerCase().includes(keyword.value) && !t.content.toLowerCase().includes(keyword.value)) return false
    return true
  })
})

// 计数
function countBy(fn: (t: PortraitPromptTemplate) => boolean): number {
  return templates.value.filter(fn).length
}

const categoryItems = computed(() => [
  { key: 'all' as const, label: '全部', count: templates.value.length },
  { key: 'face' as const, label: '😀 面部', count: countBy(t => t.category === 'face') },
  { key: 'body' as const, label: '🧍 全身比例', count: countBy(t => t.category === 'body') },
  { key: 'clothing' as const, label: '👔 发型+服装', count: countBy(t => t.category === 'clothing') },
  { key: 'background' as const, label: '🏞️ 背景', count: countBy(t => t.category === 'background') }
])

const sourceItems = computed(() => [
  { key: 'all' as const, label: '全部', count: templates.value.length },
  { key: 'builtin' as const, label: '⭐ 内置', count: countBy(t => t.builtin) },
  { key: 'custom' as const, label: '👤 我的', count: countBy(t => !t.builtin) }
])

async function loadAll() {
  loading.value = true
  try {
    const result = await window.electronAPI.portrait.promptTemplate.list()
    if (result.success && result.data) {
      templates.value = result.data
    }
  } finally {
    loading.value = false
  }
}

function previewTemplate(tpl: PortraitPromptTemplate) {
  previewing.value = tpl
  showPreview.value = true
}

// 剪贴板 fallback 链（plan B4：Electron file:// 下 navigator.clipboard 可能为 undefined）
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fallthrough */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  return ok
}

async function copyTemplate(tpl: PortraitPromptTemplate) {
  const ok = await copyText(tpl.content)
  if (ok) {
    ElMessage.success('已复制到剪贴板')
  } else {
    ElMessage.error('复制失败')
  }
}

function startEdit(tpl: PortraitPromptTemplate | null) {
  editing.value = tpl
  showEditDialog.value = true
}

async function confirmDelete(tpl: PortraitPromptTemplate) {
  try {
    await ElMessageBox.confirm(`确定删除模板「${tpl.name}」吗？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  const result = await window.electronAPI.portrait.promptTemplate.delete(tpl.id)
  if (result.success) {
    ElMessage.success('删除成功')
    loadAll()
  } else {
    ElMessage.error(result.error || '删除失败')
  }
}

// 供父级（新建按钮）调用
defineExpose({ startEdit, loadAll })

onMounted(loadAll)
</script>

<style lang="scss" scoped>
.tpl-library {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.tpl-sidebar {
  width: 180px;
  flex-shrink: 0;
  background: var(--bg-color-card);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: 12px;
  position: sticky;
  top: 0;
}

.side-section + .side-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color-lighter);
}

.side-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-placeholder);
  padding: 4px 10px 8px;
  letter-spacing: 0.06em;
}

.side-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-regular);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
    color: var(--color-primary);
    font-weight: 600;
  }

  .count {
    font-size: 11px;
    color: var(--text-placeholder);
  }

  &.active .count {
    color: var(--color-primary);
  }
}

.tpl-main {
  flex: 1;
  min-width: 0;
}

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.tpl-empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-secondary);

  .empty-ico {
    font-size: 48px;
    opacity: 0.5;
    margin-bottom: 12px;
  }
}

.preview-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.meta-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--fill-color);
  color: var(--text-secondary);

  &.src-builtin {
    background: var(--color-purple-light-9);
    color: var(--color-purple);
  }
}

.preview-content {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-regular);
  background: var(--fill-color-light);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  max-height: 320px;
  overflow-y: auto;
  white-space: pre-wrap;
}
</style>
