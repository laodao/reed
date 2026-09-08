<template>
  <div class="artifact" :class="[`k-${card.kind}`, card.status]" :style="{ borderLeftColor: accent }">
    <div class="head">
      <span class="ico">{{ meta.ico }}</span>
      <span class="name">{{ card.title }}</span>
      <span class="kname">{{ meta.label }}卡</span>
      <span v-if="card.volumeIndex" class="ver">第{{ card.volumeIndex }}{{ isScript ? '集' : '卷' }}</span>
      <span class="prov">来源：第 {{ card.sourceTurns.join('、') }} 轮</span>
    </div>
    <div class="body">
      <div v-if="rows.length === 0" class="row"><span class="k">内容</span><span class="v">{{ summaryText }}</span></div>
      <div v-for="r in rows" :key="r.k" class="row">
        <span class="k">{{ r.k }}</span>
        <span class="v">{{ r.v }}</span>
      </div>
    </div>
    <div class="foot">
      <template v-if="card.status === 'pending'">
        <slot name="actions"></slot>
      </template>
      <template v-else-if="card.status === 'adopted'">
        <span class="note">✓ 已采纳入库</span>
        <span v-if="card.resultNote" class="result">{{ card.resultNote }}</span>
      </template>
      <template v-else-if="card.status === 'ignored'">
        <span class="note muted">已忽略</span>
      </template>
      <template v-else-if="card.status === 'failed'">
        <span class="note failed">落库失败：{{ card.resultNote }}</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CARD_FIELD_LABELS, KIND_META } from './roomKinds'
import type { ArtifactCard } from '@shared/types/story-room.types'

defineOptions({ name: 'RoomArtifactCard' })

const props = defineProps<{ card: ArtifactCard }>()

const meta = computed(() => KIND_META[props.card.kind] || KIND_META.overview)
const accent = computed(() => meta.value.colorVar)
const isScript = computed(() => props.card.kind === 'outline' && Array.isArray((props.card.data as any).episodes))

const rows = computed<Array<{ k: string; v: string }>>(() => {
  const labels = CARD_FIELD_LABELS[props.card.kind] || {}
  const data = (props.card.data || {}) as Record<string, unknown>
  const out: Array<{ k: string; v: string }> = []
  for (const [field, label] of Object.entries(labels)) {
    const v = data[field]
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      out.push({ k: label, v: v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('；').slice(0, 120) })
    } else {
      out.push({ k: label, v: String(v).slice(0, 160) })
    }
  }
  // 有未映射字段时补充展示（截断；数组/对象/空值不进文本行）
  for (const [field, v] of Object.entries(data)) {
    if (labels[field] || out.length >= 8) continue
    if (typeof v === 'string' && v.trim()) out.push({ k: field, v: v.slice(0, 160) })
    else if (typeof v === 'number') out.push({ k: field, v: String(v) })
  }
  return out
})

const summaryText = computed(() => JSON.stringify(props.card.data).slice(0, 120))
</script>

<style scoped>
.artifact {
  margin: 8px 0 12px; background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-left: 4px solid var(--ka-overview); border-radius: 12px; overflow: hidden; max-width: 640px;
  box-shadow: var(--sr-shadow, 0 1px 2px rgba(0, 0, 0, 0.04)); animation: fadeUp 0.3s ease both;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.artifact:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); }
.artifact.adopted { border-left-color: var(--el-color-success); }
.artifact.ignored { opacity: 0.55; }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 15px; border-bottom: 1px solid var(--el-border-color-lighter); }
.head .ico {
  width: 28px; height: 28px; border-radius: 8px; background: var(--el-fill-color-light);
  display: flex; align-items: center; justify-content: center; font-size: 15px;
}
.head .name { font-weight: 600; font-size: 13.5px; }
.head .kname {
  font-size: 10.5px; color: var(--el-text-color-secondary); background: var(--el-fill-color-light);
  padding: 1.5px 7px; border-radius: 999px;
}
.head .ver { font-size: 11px; color: var(--el-text-color-secondary); }
.head .prov { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; }
.body { padding: 10px 15px; font-size: 13px; line-height: 1.8; }
.row { display: flex; gap: 10px; padding: 2.5px 0; }
.row .k { color: var(--el-text-color-secondary); flex-shrink: 0; width: 64px; font-size: 12px; padding-top: 1px; }
.row .v { color: var(--el-text-color-primary); flex: 1; min-width: 0; }
.foot {
  display: flex; gap: 8px; padding: 9px 15px; border-top: 1px solid var(--el-border-color-lighter);
  align-items: center; flex-wrap: wrap;
}
.note { margin-left: auto; font-size: 12px; color: var(--el-color-success); }
.note.muted { color: var(--el-text-color-secondary); }
.note.failed { color: var(--el-color-danger); }
.result { font-size: 12px; color: var(--el-text-color-secondary); }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
</style>
