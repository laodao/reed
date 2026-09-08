<template>
  <div class="panel">
    <div class="head">
      <h4>✦ 讨论成果</h4>
      <span class="cnt">{{ counts.confirmed }} 已定 · {{ counts.tentative }} 讨论中<template v-if="counts.rejected"> · {{ counts.rejected }} 已否决</template></span>
    </div>
    <div class="body">
      <div v-if="ledger.length === 0" class="empty">讨论中的共识会沉淀在这里</div>
      <div v-for="e in ledger" :key="e.id" class="entry-row">
        <el-popover placement="left" :width="300" trigger="click">
          <template #reference>
            <span class="chip" :class="e.status" :title="e.points.join('；')">
              {{ e.status === 'rejected' ? '✕ ' : '✦ ' }}{{ e.title }}
            </span>
          </template>
          <div class="pop">
            <div class="pop-title">{{ e.title }}</div>
            <ul v-if="e.points.length" class="pop-points">
              <li v-for="(p, i) in e.points" :key="i">{{ p }}</li>
            </ul>
            <div class="pop-meta">第 {{ e.sourceTurn }} 轮 · {{ statusLabel(e.status) }}</div>
            <div class="pop-ops">
              <el-button v-if="e.status !== 'confirmed'" size="small" type="primary" @click="$emit('op', { action: 'confirm', entryId: e.id })">确认</el-button>
              <el-button v-if="e.status !== 'rejected'" size="small" @click="$emit('op', { action: 'reject', entryId: e.id })">否决</el-button>
              <el-button size="small" @click="$emit('revise', e)">修改</el-button>
              <el-button size="small" type="danger" text @click="$emit('op', { action: 'discard', entryId: e.id })">丢弃</el-button>
              <el-button size="small" text @click="$emit('ask', e.title)">在对话中追问</el-button>
            </div>
          </div>
        </el-popover>
      </div>
    </div>
    <div class="footer">
      <button class="btn-distill" :disabled="ledger.length === 0" @click="$emit('distill')">⚡ 提炼入库</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ConsensusEntry, ConsensusStatus, LedgerOpInput } from '@shared/types/story-room.types'

defineOptions({ name: 'RoomLedgerPanel' })

const props = defineProps<{ ledger: ConsensusEntry[] }>()
defineEmits<{
  (e: 'op', op: LedgerOpInput): void
  (e: 'revise', entry: ConsensusEntry): void
  (e: 'ask', text: string): void
  (e: 'distill'): void
}>()

const counts = computed(() => ({
  confirmed: props.ledger.filter((e) => e.status === 'confirmed').length,
  tentative: props.ledger.filter((e) => e.status === 'tentative').length,
  rejected: props.ledger.filter((e) => e.status === 'rejected').length,
}))

function statusLabel(s: ConsensusStatus): string {
  return s === 'confirmed' ? '已定' : s === 'tentative' ? '讨论中' : '已否决'
}
void props
</script>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 0; }
.head {
  display: flex; align-items: baseline; gap: 8px; padding: 12px 16px 8px;
}
.head h4 { font-size: 13px; font-weight: 600; }
.cnt { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; }
.body { overflow-y: auto; padding: 0 12px 10px; flex: 1; min-height: 60px; }
.empty { text-align: center; font-size: 12px; color: var(--el-text-color-placeholder); padding: 14px 0; }
.entry-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 3px 2px; }
.chip {
  font-size: 12px; padding: 3px 10px; border-radius: 999px; cursor: pointer; line-height: 1.6;
  border: 1px solid var(--el-border-color-light); color: var(--el-text-color-regular);
  background: var(--el-fill-color-light); transition: all 0.15s;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chip:hover { border-color: var(--el-color-primary-light-5); transform: translateY(-1px); }
.chip.confirmed {
  color: var(--el-color-primary); background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-8); font-weight: 500;
}
.chip.rejected { text-decoration: line-through; opacity: 0.62; }
.pop-title { font-weight: 600; font-size: 13.5px; }
.pop-points { margin: 6px 0 6px 18px; font-size: 12.5px; color: var(--el-text-color-regular); line-height: 1.7; }
.pop-meta { font-size: 11px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.pop-ops { display: flex; flex-wrap: wrap; gap: 4px; }
.footer { padding: 8px 12px 10px; border-top: 1px solid var(--el-border-color-lighter); display: flex; }
.btn-distill {
  flex: 1; border: 1px solid var(--el-color-primary-light-5); background: var(--el-color-primary-light-9);
  color: var(--el-color-primary); border-radius: 8px; padding: 6px 0; font-size: 12.5px; cursor: pointer;
  transition: all 0.15s; font-family: inherit;
}
.btn-distill:hover { background: var(--el-color-primary-light-8); }
.btn-distill:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
