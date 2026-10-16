<template>
  <div class="live">
    <!-- 条目导航：新产出插最前，点击切换；右侧「目录」可翻任意章节 -->
    <div v-if="items.length > 0 || chapters.length > 0" class="live-tabs">
      <div
        v-for="it in items"
        :key="it.id"
        class="tab-chip"
        :class="{ on: it.id === activeId, chapter: it.type === 'chapter' }"
        :title="it.type === 'chapter' ? it.title : `${it.kindLabel} · ${it.title}`"
        @click="$emit('activate', it.id)"
      >
        <span class="tc-ico">{{ it.type === 'chapter' ? '📄' : it.icon }}</span>
        <span class="tc-name">{{ it.type === 'chapter' ? shortChapterTitle(it) : it.title }}</span>
      </div>
      <el-popover v-if="chapters.length > 0" placement="top-end" :width="300" trigger="click">
        <template #reference>
          <span class="tab-chip toc-chip" title="打开任意章节">📑 目录</span>
        </template>
        <div class="toc-list">
          <div
            v-for="c in chapters"
            :key="c.id"
            class="toc-item"
            :class="{ on: active && active.type === 'chapter' && active.outlineId === c.id }"
            @click="$emit('open-chapter', c.id)"
          >
            <span class="toc-no">{{ c.no ? `第${c.no}章` : '章' }}</span>
            <span class="toc-name">{{ plainName(c.name) }}</span>
          </div>
          <div v-if="chapters.length === 0" class="toc-empty">大纲里还没有章节</div>
        </div>
      </el-popover>
    </div>

    <!-- 条目正文：直接平铺（不弹抽屉），与左侧输入并行阅读 -->
    <div v-if="active" class="live-body" :key="active.id + (editing ? ':edit' : '')">
      <!-- 完整设定档案 -->
      <template v-if="active.type === 'profile'">
        <div class="head" :style="{ borderLeftColor: active.accentVar }">
          <span class="h-ico">{{ active.icon }}</span>
          <div class="h-main">
            <div class="h-title">{{ active.title }}</div>
            <div class="h-sub">
              <span class="h-kind">{{ active.kindLabel }}</span>
              <span class="h-status" :class="active.status">{{ active.status === 'saved' ? '已入库' : '草稿预览 · 确认后生效' }}</span>
              <span v-if="active.prov" class="h-prov">{{ active.prov }}</span>
            </div>
          </div>
        </div>
        <div class="scroll">
          <div v-if="active.fields.length === 0" class="no-fields">暂无结构化字段</div>
          <div v-for="(f, i) in active.fields" :key="i" class="f-row">
            <span class="f-k">{{ f.k }}</span>
            <span class="f-v">{{ f.v }}</span>
          </div>
          <template v-if="active.relations.length > 0">
            <div class="sec-title">关系网</div>
            <div v-for="(r, i) in active.relations" :key="'r' + i" class="rel-row">{{ r }}</div>
          </template>
        </div>
        <div class="ops">
          <el-button size="small" type="primary" plain @click="$emit('revise', active)">✎ 让主编改</el-button>
          <el-button v-if="active.status === 'draft' && active.cardId" size="small" @click="$emit('edit-card', active.cardId)">编辑后采纳</el-button>
          <el-button size="small" @click="$emit('ask', active.askText)">追问</el-button>
          <el-button size="small" @click="$emit('open-editor')">写作台</el-button>
        </div>
      </template>

      <!-- 整章正文（审阅视图 + 就地编辑） -->
      <template v-else>
        <div class="head chapter-head">
          <span class="h-ico">📄</span>
          <div class="h-main">
            <div class="h-title">{{ active.chapterNo ? `第${active.chapterNo}章` : '' }} {{ active.title }}</div>
            <div class="h-sub">
              <span class="h-kind">{{ active.wordCount }} 字</span>
              <span v-if="active.reviewed" class="h-status reviewed">✓ 已审阅</span>
              <span class="h-status" :class="active.patched ? 'patched' : 'saved'">{{ active.patched ? '已按反馈修正' : '新写完 · 待审阅' }}</span>
            </div>
          </div>
        </div>
        <div v-if="!editing" class="scroll">
          <div class="prose">{{ active.content }}</div>
        </div>
        <div v-else class="scroll edit-scroll">
          <textarea v-model="editContent" class="prose-edit" spellcheck="false"></textarea>
        </div>

        <div v-if="!editing" class="ops">
          <el-button size="small" type="primary" @click="$emit('feedback', active)">提修改意见</el-button>
          <el-button v-if="!busy" size="small" @click="startEdit">就地编辑</el-button>
          <el-button size="small" :type="active.reviewed ? 'warning' : 'success'" plain @click="$emit('toggle-review', active.id)">
            {{ active.reviewed ? '撤销审阅' : '✓ 认可这版' }}
          </el-button>
          <el-button size="small" @click="$emit('ask', activeAskText)">追问</el-button>
          <el-button size="small" @click="$emit('open-editor')">写作台</el-button>
        </div>
        <div v-else class="ops">
          <el-button size="small" type="primary" :loading="saving" @click="saveEdit">保存（建版本快照）</el-button>
          <el-button size="small" @click="editing = false">取消</el-button>
          <span class="edit-tip">与写作台同一保存通道，改完记得让主编重扫一致性</span>
        </div>
      </template>
    </div>

    <!-- 空态：说明面板行为 + 入口 -->
    <div v-else class="live-empty">
      <div class="empty-ico">🪄</div>
      <div class="empty-title">内容面板</div>
      <div class="empty-text">
        主编在讨论中产出的人物、大纲、世界设定，以及写完的章节正文，都会实时出现在这里，无需翻菜单——左边下指令，右边看成品。
      </div>
      <div class="empty-ops">
        <el-button v-if="chapters.length > 0" size="small" @click="$emit('open-chapter', chapters[chapters.length - 1].id)">
          打开最新章节
        </el-button>
        <el-button size="small" @click="$emit('switch-tab', 'bible')">浏览世界设定集</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { LiveItem } from './liveItems'

defineOptions({ name: 'RoomLiveStage' })

const props = defineProps<{
  items: LiveItem[]
  activeId: string | null
  /** 全部章节（目录浏览用，按书中顺序） */
  chapters: Array<{ id: string; no: number | null; name: string }>
  /** 主编是否正在发言（发言中关闭就地编辑入口，避免保存覆盖 agent 新稿） */
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'activate', id: string): void
  (e: 'ask', text: string): void
  (e: 'open-editor'): void
  (e: 'switch-tab', tab: 'live' | 'bible'): void
  (e: 'feedback', item: Extract<LiveItem, { type: 'chapter' }>): void
  (e: 'revise', item: Extract<LiveItem, { type: 'profile' }>): void
  (e: 'edit-card', cardId: string): void
  (e: 'open-chapter', outlineId: string): void
  (e: 'toggle-review', itemId: string): void
  (e: 'chapter-updated', payload: { outlineId: string; content: string; wordCount: number }): void
}>()

const active = computed<LiveItem | null>(() => props.items.find((i) => i.id === props.activeId) ?? props.items[0] ?? null)

const activeAskText = computed(() => {
  const it = active.value
  if (!it) return ''
  return it.type === 'chapter'
    ? `关于「${it.chapterNo ? `第${it.chapterNo}章 ` : ''}${it.title}」的正文：`
    : it.askText
})

function shortChapterTitle(it: LiveItem): string {
  if (it.type !== 'chapter') return ''
  const no = it.chapterNo ? `第${it.chapterNo}章` : ''
  const name = it.title.replace(/^第\s*\d+\s*[章集]\s*/, '')
  return `${no} ${name}`.trim() || it.title
}

/** 目录里的章名去掉重复的「第N章」前缀（序号列已有） */
function plainName(name: string): string {
  return name.replace(/^第\s*\d+\s*[章集]\s*/, '') || name
}

// ==================== 就地编辑（与写作台同一 saveChapter 通道） ====================
const editing = ref(false)
const editContent = ref('')
const saving = ref(false)

function startEdit(): void {
  const it = active.value
  if (!it || it.type !== 'chapter') return
  editContent.value = it.content
  editing.value = true
}

watch(() => active.value?.id, () => {
  editing.value = false
})

// 编辑期间条目被替换（agent 重写落库/别处保存）→ 退出编辑，防止旧稿覆盖新稿
watch(
  () => (active.value && active.value.type === 'chapter' ? active.value.updatedAt : 0),
  () => {
    editing.value = false
  },
)

async function saveEdit(): Promise<void> {
  const it = active.value
  if (!it || it.type !== 'chapter') return
  const content = editContent.value
  if (!content.trim()) {
    ElMessage.warning('正文不能为空（清空请走整章重写）')
    return
  }
  saving.value = true
  try {
    const res = await window.electronAPI.longwriting.saveChapter(it.outlineId, content)
    if (!res.success) throw new Error(res.error || '保存失败')
    const wordCount = Number(res.data?.wordCount) || content.replace(/\s/g, '').length
    ElMessage.success('已保存（生成版本快照；图谱与一致性提取会在下次保存/修正时重跑）')
    editing.value = false
    emit('chapter-updated', { outlineId: it.outlineId, content, wordCount })
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.live { display: flex; flex-direction: column; min-height: 0; flex: 1; }

/* 条目导航条 */
.live-tabs {
  display: flex; gap: 6px; padding: 8px 12px; overflow-x: auto; flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  scrollbar-width: thin;
}
.live-tabs:empty { display: none; }
.tab-chip {
  display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; max-width: 150px;
  font-size: 12px; padding: 3.5px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--el-border-color-light); color: var(--el-text-color-regular);
  background: var(--el-fill-color-light); transition: all 0.15s;
}
.tab-chip:hover { border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); }
.tab-chip.on {
  color: var(--el-color-primary); background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7); font-weight: 600;
}
.toc-chip { margin-left: auto; color: var(--el-text-color-secondary); }
.tc-ico { flex-shrink: 0; font-size: 12px; }
.tc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 目录弹层 */
.toc-list { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.toc-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px;
  cursor: pointer; font-size: 12.5px;
}
.toc-item:hover { background: var(--el-fill-color-light); }
.toc-item.on { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.toc-no { flex-shrink: 0; color: var(--el-text-color-secondary); font-size: 11.5px; min-width: 44px; }
.toc-item.on .toc-no { color: var(--el-color-primary); }
.toc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toc-empty { text-align: center; font-size: 12px; color: var(--el-text-color-placeholder); padding: 14px 0; }

/* 条目正文 */
.live-body { display: flex; flex-direction: column; flex: 1; min-height: 0; animation: liveIn 0.25s ease; }
@keyframes liveIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

.head {
  display: flex; gap: 10px; align-items: center; padding: 12px 16px; flex-shrink: 0;
  border-left: 4px solid var(--ka-overview); border-bottom: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-fill-color-lighter) 60%, transparent);
}
.h-ico {
  width: 34px; height: 34px; border-radius: 9px; background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter); display: flex; align-items: center;
  justify-content: center; font-size: 16px; flex-shrink: 0;
}
.h-main { min-width: 0; }
.h-title { font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); line-height: 1.4; }
.h-sub { display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap; }
.h-kind { font-size: 11.5px; color: var(--el-text-color-secondary); }
.h-status { font-size: 11px; padding: 1px 8px; border-radius: 999px; }
.h-status.saved { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.h-status.patched { color: var(--el-color-warning-dark-2); background: var(--el-color-warning-light-9); }
.h-status.draft { color: var(--el-color-warning-dark-2); background: var(--el-color-warning-light-9); }
.h-status.reviewed { color: var(--el-color-success); background: var(--el-color-success-light-9); font-weight: 600; }
.h-prov { font-size: 11px; color: var(--el-text-color-placeholder); }

.scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px; }

/* 全字段行：值多行 pre-wrap，看完整设定不截断 */
.f-row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--el-border-color-lighter); }
.f-k { width: 76px; flex-shrink: 0; color: var(--el-text-color-secondary); font-size: 12.5px; padding-top: 2px; }
.f-v { flex: 1; min-width: 0; font-size: 13.5px; line-height: 1.85; color: var(--el-text-color-primary); white-space: pre-wrap; word-break: break-word; }
.no-fields { color: var(--el-text-color-placeholder); font-size: 12.5px; padding: 18px 0; text-align: center; }

.sec-title { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); margin: 16px 0 4px; letter-spacing: 0.5px; }
.rel-row { font-size: 13px; line-height: 1.9; color: var(--el-text-color-regular); padding-left: 2px; }

/* 章节正文阅读排版 */
.prose {
  font-size: 15px; line-height: 2; color: var(--el-text-color-primary);
  white-space: pre-wrap; word-break: break-word;
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', SimSun, serif;
  max-width: 46em;
}

/* 就地编辑 */
.edit-scroll { display: flex; flex-direction: column; }
.prose-edit {
  flex: 1; min-height: 100%; resize: none; border: 1px solid var(--el-border-color-light);
  border-radius: 8px; padding: 12px 14px; font-size: 14px; line-height: 1.9;
  font-family: inherit; background: var(--el-bg-color); color: var(--el-text-color-primary);
  outline: none; white-space: pre-wrap;
}
.prose-edit:focus { border-color: var(--el-color-primary); }
.edit-tip { font-size: 11px; color: var(--el-text-color-placeholder); align-self: center; }

.ops {
  display: flex; gap: 8px; padding: 9px 16px; flex-shrink: 0; flex-wrap: wrap;
  border-top: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-fill-color-lighter) 60%, transparent);
}

/* 空态 */
.live-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 24px; text-align: center;
}
.empty-ico { font-size: 30px; }
.empty-title { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.empty-text { font-size: 12.5px; color: var(--el-text-color-secondary); line-height: 1.9; max-width: 280px; margin-bottom: 6px; }
.empty-ops { display: flex; gap: 8px; }
</style>
