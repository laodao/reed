<template>
  <div class="outline-design-step">
    <div class="step-header">
      <h2>故事大纲设计</h2>
      <p class="step-desc">AI 基于蓝图、人物与故事线生成分级大纲（卷/章/节），确认后写入项目</p>
    </div>

    <div class="generate-bar">
      <span class="structure-label">结构层级：</span>
      <el-radio-group v-model="structureLevel">
        <el-radio-button :value="3">卷 → 章 → 节</el-radio-button>
        <el-radio-button :value="2">章 → 节</el-radio-button>
        <el-radio-button :value="1">仅章</el-radio-button>
      </el-radio-group>
      <el-button type="primary" :loading="generating" :disabled="hasOutline || generating" @click="generateOutline">
        <el-icon><MagicStick /></el-icon>
        {{ hasOutline ? '已生成大纲' : '生成大纲' }}
      </el-button>
      <el-button v-if="generating" @click="ai.cancel()">取消</el-button>
    </div>

    <div v-if="generating" class="generating-tip">AI 正在生成大纲（多轮生成），请稍候...</div>

    <!-- 建议预览（未入库，可编辑） -->
    <div v-if="previewRoots.length > 0" class="preview-section">
      <el-divider>大纲建议（{{ previewCount }} 节点，可编辑后确认）</el-divider>
      <div class="preview-tree">
        <div v-for="(vol, vi) in previewRoots" :key="vi" class="preview-volume">
          <div class="volume-row">
            <el-input v-model="vol.name" placeholder="卷名" style="width: 240px" />
            <el-input v-model="vol.summary" placeholder="卷概要" />
            <el-button type="danger" size="small" :icon="Delete" circle @click="removeVolume(vi)" />
          </div>
          <div v-for="(ch, ci) in vol.chapters" :key="ci" class="preview-chapter">
            <div class="chapter-row">
              <el-input v-model="ch.name" placeholder="章名" style="width: 220px" />
              <el-input v-model="ch.summary" placeholder="章概要" />
              <el-button type="danger" size="small" :icon="Delete" circle @click="removeChapter(vi, ci)" />
            </div>
            <div v-for="(sec, si) in ch.sections" :key="si" class="preview-section-row">
              <el-input v-model="sec.name" placeholder="节名" style="width: 200px" />
              <el-input v-model="sec.summary" placeholder="节概要" />
              <el-button type="danger" size="small" :icon="Delete" circle @click="removeSection(vi, ci, si)" />
            </div>
          </div>
        </div>
      </div>
      <div class="preview-actions">
        <el-button @click="previewRoots = []">放弃</el-button>
        <el-button type="primary" @click="confirmOutline">确认大纲并写入</el-button>
      </div>
    </div>

    <!-- 已入库大纲 -->
    <div v-if="savedNodes.length > 0" class="saved-section">
      <el-divider>项目大纲（{{ savedNodes.length }} 节点）</el-divider>
      <div class="saved-tree">
        <div v-for="node in savedNodes" :key="node.id" class="saved-node" :style="{ paddingLeft: `${(node.level - 1) * 20}px` }">
          <el-tag size="small" :type="nodeTagType(node.nodeType)">{{ nodeTypeLabel(node.nodeType) }}</el-tag>
          <span class="node-name">{{ node.name }}</span>
          <span class="node-summary">{{ node.summary }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 向导 Step 4：故事大纲
 * 结构选择(1/2/3) → generateOutlineStory → 可编辑预览确认（替代 ElMessageBox）→ 建树
 * 设计要点：预览确认与"清空现有大纲"解耦（确认时若已有大纲先弹确认，避免误删）
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Delete } from '@element-plus/icons-vue'
import { useAiGeneration, parseJsonLoose } from '@/composables/useAiGeneration'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'stateChanged'): void
}>()

const ai = useAiGeneration()
const generating = ai.generating
const structureLevel = ref(3)

interface PreviewSection { name: string; summary: string }
interface PreviewChapter { name: string; summary: string; sections: PreviewSection[] }
interface PreviewVolume { name: string; summary: string; chapters: PreviewChapter[] }
const previewRoots = ref<PreviewVolume[]>([])
const savedNodes = ref<any[]>([])

const previewCount = computed(() => {
  let count = previewRoots.value.length
  for (const v of previewRoots.value) {
    count += v.chapters.length
    count += v.chapters.reduce((a, c) => a + c.sections.length, 0)
  }
  return count
})

const hasOutline = computed(() => savedNodes.value.length > 0)

function nodeTypeLabel(t: string): string {
  return { volume: '卷', chapter: '章', section: '节' }[t] || t
}
function nodeTagType(t: string): 'primary' | 'success' | 'info' {
  if (t === 'volume') return 'primary'
  if (t === 'chapter') return 'success'
  return 'info'
}

async function generateOutline(): Promise<void> {
  if (hasOutline.value) {
    ElMessage.info('项目已有大纲，如需重新生成请先清空')
    return
  }
  previewRoots.value = []
  const eventId = `outline-${props.projectId}-${Date.now()}`

  const ok = await ai.start({
    eventId,
    subscribe: (handlers: { onContent: (c: string) => void; onDone: () => void; onError: (e: string) => void }) =>
      window.electronAPI.longwriting.onGenerateEvent(eventId, (event: { type: string; content?: string; error?: string }) => {
        if (event.type === 'content' && event.content) handlers.onContent(event.content)
        else if (event.type === 'done') handlers.onDone()
        else if (event.type === 'error') handlers.onError(event.error || '生成失败')
      }),
    invoke: async () => {
      const r = await window.electronAPI.longwriting.generateOutlineStory(
        eventId,
        props.projectId,
        undefined,
        undefined,
        structureLevel.value,
      )
      return { success: r.success, error: r.error }
    },
  })

  if (!ok) {
    ElMessage.error(ai.error.value || '生成失败')
    return
  }

  const parsed = parseJsonLoose(ai.content.value)
  if (!parsed.ok || !Array.isArray(parsed.data) || parsed.data.length === 0) {
    ElMessage.warning('AI 返回格式不标准，请重试')
    return
  }
  buildPreview(parsed.data)
}

/** 把 AI 返回的建议大纲（卷/章/节 或 章/节 或 章）转成预览树 */
function buildPreview(data: any[]): void {
  if (structureLevel.value === 3) {
    previewRoots.value = data.map((v: any) => ({
      name: v.name || '',
      summary: v.summary || '',
      chapters: (v.chapters || []).map((c: any) => ({
        name: c.name || '',
        summary: c.summary || '',
        sections: (c.sections || []).map((s: any) => ({ name: s.name || '', summary: s.summary || '' })),
      })),
    }))
  } else if (structureLevel.value === 2) {
    previewRoots.value = [{
      name: '全书',
      summary: '',
      chapters: data.map((c: any) => ({
        name: c.name || '',
        summary: c.summary || '',
        sections: (c.sections || []).map((s: any) => ({ name: s.name || '', summary: s.summary || '' })),
      })),
    }]
  } else {
    previewRoots.value = [{
      name: '全书',
      summary: '',
      chapters: data.map((c: any) => ({
        name: c.name || '',
        summary: c.summary || '',
        sections: [],
      })),
    }]
  }
}

function removeVolume(vi: number): void { previewRoots.value.splice(vi, 1) }
function removeChapter(vi: number, ci: number): void { previewRoots.value[vi].chapters.splice(ci, 1) }
function removeSection(vi: number, ci: number, si: number): void { previewRoots.value[vi].chapters[ci].sections.splice(si, 1) }

/** 确认并建树：先检查是否已有大纲（避免误删用户手编内容） */
async function confirmOutline(): Promise<void> {
  if (previewRoots.value.length === 0) return

  // 与"清空现有"解耦：仅当已有大纲时提示确认（默认不自动清空）
  const existing = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (existing.success && (existing.data || []).length > 0) {
    try {
      await ElMessageBox.confirm(
        '项目已有大纲，写入新大纲将清空现有大纲（含已写章节关联）。确定继续？',
        '确认覆盖',
        { confirmButtonText: '覆盖', cancelButtonText: '取消', type: 'warning' },
      )
      // 先删除旧大纲（含子树，从叶子开始由后端级联或前端递归）
      await clearExistingOutlines(existing.data || [])
    } catch {
      return // 用户取消
    }
  }

  let created = 0
  try {
    if (structureLevel.value === 3) {
      for (const [vi, vol] of previewRoots.value.entries()) {
        const volId = await createNode('volume', vol.name, vol.summary, null, vi)
        if (!volId) continue
        created++
        for (const [ci, ch] of vol.chapters.entries()) {
          const chId = await createNode('chapter', ch.name, ch.summary, volId, ci)
          if (!chId) continue
          created++
          for (const [si, sec] of ch.sections.entries()) {
            const ok2 = await createNode('section', sec.name, sec.summary, chId, si)
            if (ok2) created++
          }
        }
      }
    } else if (structureLevel.value === 2) {
      for (const vol of previewRoots.value) {
        for (const [ci, ch] of vol.chapters.entries()) {
          const chId = await createNode('chapter', ch.name, ch.summary, null, ci)
          if (!chId) continue
          created++
          for (const [si, sec] of ch.sections.entries()) {
            const ok2 = await createNode('section', sec.name, sec.summary, chId, si)
            if (ok2) created++
          }
        }
      }
    } else {
      for (const vol of previewRoots.value) {
        for (const [ci, ch] of vol.chapters.entries()) {
          const ok2 = await createNode('chapter', ch.name, ch.summary, null, ci)
          if (ok2) created++
        }
      }
    }
    previewRoots.value = []
    await loadSavedOutline()
    emit('stateChanged')
    ElMessage.success(`大纲已写入（${created} 个节点）`)
  } catch (e: any) {
    ElMessage.error(`写入大纲失败：${e?.message || e}`)
  }
}

async function createNode(nodeType: string, name: string, summary: string, parentId: string | null, orderIndex: number): Promise<string | null> {
  const r = await window.electronAPI.longwriting.createOutline({
    projectId: props.projectId,
    parentId: parentId ?? undefined,
    name: name || `${nodeTypeLabel(nodeType)}${orderIndex + 1}`,
    nodeType: nodeType as any,
    summary: summary || undefined,
  })
  return r.success && r.data?.id ? r.data.id : null
}

/** 删除现有大纲（递归收集子树，从叶子开始） */
async function clearExistingOutlines(nodes: any[]): Promise<void> {
  const byParent = new Map<string | null, any[]>()
  for (const n of nodes) {
    const key = n.parentId || null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(n)
  }
  const roots = byParent.get(null) || []
  const deleteNode = async (id: string): Promise<void> => {
    for (const child of byParent.get(id) || []) {
      await deleteNode(child.id)
    }
    await window.electronAPI.longwriting.deleteOutline(id)
  }
  for (const root of roots) {
    await deleteNode(root.id)
  }
}

async function loadSavedOutline(): Promise<void> {
  const r = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (r.success) savedNodes.value = (r.data || []).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
}

onMounted(() => {
  loadSavedOutline()
})
</script>

<style lang="scss" scoped>
.outline-design-step {
  max-width: 900px;
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
  flex-wrap: wrap;

  .structure-label {
    font-size: 13px;
    color: var(--text-color-secondary);
  }
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

.preview-tree {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-volume {
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-color);
}

.volume-row,
.chapter-row,
.preview-section-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.preview-chapter {
  margin-left: 24px;
  padding: 10px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
}

.preview-section-row {
  margin-left: 24px;
}

.preview-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.saved-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.saved-node {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  padding: 8px 12px;

  .node-name {
    font-weight: 600;
    font-size: 14px;
  }

  .node-summary {
    font-size: 12px;
    color: var(--text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
}
</style>
