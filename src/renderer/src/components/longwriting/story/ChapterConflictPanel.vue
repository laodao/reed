<template>
  <el-drawer v-model="visible" title="⚔ 一致性检查疑点" size="46%" :append-to-body="true">
    <div class="ccp-toolbar">
      <el-button size="small" :loading="loading" @click="load">重新扫描</el-button>
      <span class="ccp-hint">偏移为扫描时快照，定位时按摘录现场重锚定；「交主编修正」发往研讨室</span>
    </div>
    <div class="ccp-list">
      <div
        v-for="(c, i) in pending"
        :key="'p' + i"
        class="ccp-item"
        :class="{ severe: c.severity === 'error', here: c.outlineId && c.outlineId === currentOutlineId }"
      >
        <div class="ccp-head">
          <span class="ccp-rule" :class="c.severity === 'error' ? 'error' : 'warning'">{{ c.rule || '?' }}</span>
          <span class="ccp-msg">{{ c.message }}</span>
        </div>
        <div v-if="conflictLocLine(c)" class="ccp-loc">{{ conflictLocLine(c) }}</div>
        <div class="ccp-actions">
          <el-button size="small" :disabled="!c.outlineId && !c.chapterNumber" @click="emit('locate', c)">定位</el-button>
          <el-button size="small" type="primary" plain @click="emit('fix', c)">交主编修正</el-button>
          <el-button size="small" @click="keep(c)">知情保留</el-button>
        </div>
      </div>
      <div v-if="!pending.length && !kept.length" class="ccp-empty">{{ loading ? '扫描中…' : '当前没有疑点。' }}</div>

      <!-- 已保留分区：与研讨室疑点抽屉同语义，误保留可撤销 -->
      <details v-if="kept.length" class="ccp-kept">
        <summary class="ccp-kept-summary">已保留（{{ kept.length }}）· 不拦截生成</summary>
        <div v-for="(c, i) in kept" :key="'k' + i" class="ccp-item kept">
          <div class="ccp-head">
            <span class="ccp-rule warning">{{ c.rule || '?' }}</span>
            <span class="ccp-msg">{{ c.message }}</span>
            <el-button size="small" @click="unkeep(c)">撤销保留</el-button>
          </div>
          <div v-if="c.note" class="ccp-note">保留备注：{{ c.note }}</div>
        </div>
      </details>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * 写作台疑点抽屉（一致性检查结果：定位 / 交主编修正 / 知情保留）
 * @module components/longwriting/story/ChapterConflictPanel
 *
 * 数据与研讨室疑点抽屉同源（graphScanContradictions 全量 + annotate 状态）；
 * 「定位」与「交主编修正」只 emit——编辑器跳章高亮由宿主 ChapterStage 执行，
 * 修正消息发送走 roomSend IPC（研讨室会话在主进程常驻，跨视图可达）。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { conflictLocLine } from '@/utils/conflict-fix'

const props = defineProps<{
  projectId: string
  currentOutlineId?: string
}>()

const emit = defineEmits<{
  locate: [item: any]
  fix: [item: any]
  scanned: [pendingCount: number]
}>()

const visible = ref(false)
const loading = ref(false)
const all = ref<any[]>([])

const pending = computed(() => all.value.filter((c: any) => c.status !== 'kept'))
const kept = computed(() => all.value.filter((c: any) => c.status === 'kept'))

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await window.electronAPI.longwriting.graphScanContradictions(props.projectId, { status: 'all' })
    all.value = res?.success ? res.data || [] : []
    emit('scanned', pending.value.length)
    if (!res?.success) ElMessage.warning(res?.error || '扫描失败')
  } catch (e: any) {
    ElMessage.warning(e?.message || '扫描失败')
  } finally {
    loading.value = false
  }
}

function open(): void {
  visible.value = true
  load()
}

defineExpose({ open, load })

onMounted(() => {
  // 挂载即扫一次：工具栏徽标要有数（扫描是确定性规则+图库读，无 LLM 调用）
  load()
})

async function keep(c: any): Promise<void> {
  const res = await window.electronAPI.longwriting.conflictExecute(props.projectId, 'acknowledge_conflict', {
    conflict: { rule: c.rule, message: c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber, beatText: c.beatText },
    note: '作者知情保留（写作台）',
  })
  if (res.success) {
    ElMessage.success('已知情保留')
    await load()
  } else {
    ElMessage.warning(res.error || '保留失败')
  }
}

async function unkeep(c: any): Promise<void> {
  const res = await window.electronAPI.longwriting.conflictExecute(props.projectId, 'unacknowledge_conflict', {
    conflict: { rule: c.rule, message: c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber, beatText: c.beatText },
  })
  if (res.success) {
    ElMessage.success('已撤销保留')
    await load()
  } else {
    ElMessage.warning(res.error || '撤销失败')
  }
}
</script>

<style lang="scss" scoped>
.ccp-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;

  .ccp-hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.ccp-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  font-size: 13px;

  &.severe {
    border-color: var(--el-color-danger-light-5);
  }

  &.here {
    background: var(--el-color-primary-light-9);
  }

  &.kept {
    opacity: 0.72;
  }
}

.ccp-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.ccp-rule {
  flex: none;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-top: 1px;

  &.warning {
    background: var(--el-color-warning-light-8);
    color: var(--el-color-warning-dark-2);
  }

  &.error {
    background: var(--el-color-danger-light-8);
    color: var(--el-color-danger-dark-2);
  }
}

.ccp-msg {
  flex: 1;
  line-height: 1.5;
}

.ccp-loc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ccp-actions {
  margin-top: 6px;
  display: flex;
  gap: 8px;
}

.ccp-empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 12px 0;
}

.ccp-kept {
  margin-top: 10px;
}

.ccp-kept-summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 2px;
}

.ccp-note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

<style lang="scss">
/* CodeMirror 高亮标记须全局（标记 span 由 CM 动态插入，且编辑器在子组件内） */
.lw-conflict-mark {
  background: rgba(230, 162, 60, 0.32);
  border-bottom: 2px solid var(--el-color-warning, #e6a23c);
  border-radius: 2px;
}
</style>
