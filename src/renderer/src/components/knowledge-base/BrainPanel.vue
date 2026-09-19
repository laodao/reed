<template>
  <div class="brain-panel">
    <!-- 统计条（§8.5 消化率最小版） -->
    <div class="brain-stats">
      <div class="stat">
        <span class="stat-num">{{ stats?.atoms?.total ?? '—' }}</span>
        <span class="stat-label">论断</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ stats?.atoms?.humanOrigin ?? '—' }}</span>
        <span class="stat-label">我的观感</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ stats?.notes?.published ?? '—' }}</span>
        <span class="stat-label">卡片</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ proposalTotal }}</span>
        <span class="stat-label">待审提议</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ stats?.openQuestions ?? '—' }}</span>
        <span class="stat-label">悬而未决</span>
      </div>
      <button type="button" class="brain-config-btn" @click="configOpen = !configOpen">
        {{ config?.enabled ? '大脑·开' : '大脑·关' }}
      </button>
    </div>

    <!-- 配置（精简版：开关 + 阈值 + 情节卡开关） -->
    <div v-if="configOpen" class="brain-config">
      <label class="cfg-row">
        <input v-model="configDraft.enabled" type="checkbox" />
        启用知识大脑
      </label>
      <label class="cfg-row">
        <input v-model="configDraft.digestion.enabled" type="checkbox" />
        自动消化新文档（原子化+裁决）
      </label>
      <label class="cfg-row">
        <input v-model="configDraft.patterns.plotEnabled" type="checkbox" />
        情节模式卡归纳（实验性，成本较高）
      </label>
      <label class="cfg-row">
        自动入库阈值（低于则进待审）
        <input v-model.number="configDraft.autoApproveThreshold" type="number" min="0" max="1" step="0.05" />
      </label>
      <div class="cfg-actions">
        <button type="button" @click="saveConfig">保存</button>
      </div>
    </div>

    <!-- 论断列表 -->
    <table class="brain-table">
      <thead>
        <tr>
          <th>论断</th>
          <th>类型</th>
          <th>状态</th>
          <th>视角</th>
          <th>来源</th>
          <th>被用</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in atoms" :key="a.id">
          <td class="stmt" :title="a.sourceQuote">{{ a.statement }}</td>
          <td>{{ a.type }}</td>
          <td><span class="badge" :class="`st-${a.status}`">{{ a.status }}</span></td>
          <td>{{ a.lensNoteId ? '视角' : a.origin === 'human' ? '我' : '—' }}</td>
          <td class="muted">{{ a.sourceChapterHash?.slice(0, 8) }}</td>
          <td>{{ a.useCount }}</td>
        </tr>
        <tr v-if="atoms.length === 0">
          <td colspan="6" class="empty">{{ enabled ? '尚未消化出论断（上传文档后自动进行）' : '大脑未启用' }}</td>
        </tr>
      </tbody>
    </table>

    <!-- 提议收件箱 -->
    <div v-if="proposals.length > 0" class="inbox">
      <div class="inbox-title">待审提议（{{ proposals.length }}）</div>
      <div v-for="p in proposals" :key="p.id" class="proposal">
        <div class="p-title">{{ p.title }}</div>
        <div class="p-desc">{{ p.description }}</div>
        <div class="p-actions">
          <button type="button" @click="decide(p.id, 'publish')">批准</button>
          <button type="button" @click="decide(p.id, 'reject')">拒绝</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ kbId: string }>()
const emit = defineEmits<{ (e: 'stats', count: number): void }>()
let requestGen = 0 // kbId 快速切换时丢弃过期响应

interface BrainAtom {
  id: string
  statement: string
  type: string
  status: string
  lensNoteId: string | null
  origin: string
  useCount: number
  sourceChapterHash: string | null
  sourceQuote: string
}
interface BrainNote {
  id: string
  title: string
  description: string
}
interface BrainConfig {
  enabled: boolean
  digestion: { enabled: boolean }
  patterns: { plotEnabled: boolean }
  autoApproveThreshold: number
}

const stats = ref<Record<string, any> | null>(null)
const atoms = ref<BrainAtom[]>([])
const proposals = ref<BrainNote[]>([])
const proposalTotal = ref(0)
const config = ref<BrainConfig | null>(null)
const configDraft = ref<BrainConfig>({
  enabled: false,
  digestion: { enabled: true },
  patterns: { plotEnabled: false },
  autoApproveThreshold: 0.8,
})
const configOpen = ref(false)
const enabled = ref(false)

async function refresh(): Promise<void> {
  if (!props.kbId) return
  const gen = ++requestGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
  const [cfgRes, statsRes, atomsRes, inboxRes] = await Promise.all([
    client.getConfig(props.kbId),
    client.stats(props.kbId),
    client.listAtoms({ kbId: props.kbId, pageSize: 50 }),
    client.proposalInbox({ kbId: props.kbId, pageSize: 20 }),
  ])
  if (gen !== requestGen) return // 过期响应丢弃
  if (cfgRes.success && cfgRes.data) {
    config.value = cfgRes.data.config
    enabled.value = !!cfgRes.data.config?.enabled
    if (cfgRes.data.config) configDraft.value = { ...cfgRes.data.config }
  }
  if (statsRes.success) stats.value = statsRes.data
  if (atomsRes.success && atomsRes.data) {
    atoms.value = atomsRes.data.rows as BrainAtom[]
    emit('stats', atomsRes.data.total)
  }
  if (inboxRes.success && inboxRes.data) {
    proposals.value = inboxRes.data.rows as BrainNote[]
    proposalTotal.value = inboxRes.data.total
  }
  } catch (e) {
    console.warn('[BrainPanel] 刷新失败', e)
  }
}

async function saveConfig(): Promise<void> {
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.updateConfig({
      kbId: props.kbId,
      patch: { ...configDraft.value },
    })
    if (res.success) {
      config.value = res.data
      enabled.value = !!res.data?.enabled
      configOpen.value = false
    } else {
      console.warn('[BrainPanel] 保存失败', res.error)
    }
  } catch (e) {
    // ajv 校验失败（如手输越界阈值）响亮可见
    alert(`保存失败: ${(e as Error).message}`)
  }
}

async function decide(noteId: string, action: 'publish' | 'reject'): Promise<void> {
  await (window as any).electronAPI.knowledgeBase.brain.decideProposal({ noteId, action })
  await refresh()
}

watch(() => props.kbId, refresh, { immediate: true })
defineExpose({ refresh })
</script>

<style scoped>
.brain-panel {
  padding: 8px 0;
}
.brain-stats {
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  margin-bottom: 10px;
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat-num {
  font-size: 16px;
  font-weight: 600;
}
.stat-label {
  font-size: 12px;
  opacity: 0.65;
}
.brain-config-btn {
  margin-left: auto;
  cursor: pointer;
}
.brain-config {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfg-row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.cfg-actions button {
  cursor: pointer;
}
.brain-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.brain-table th,
.brain-table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.stmt {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
}
.st-suspected {
  background: var(--el-color-warning-light-8);
}
.st-superseded,
.st-stale {
  opacity: 0.55;
}
.muted {
  opacity: 0.5;
}
.empty {
  text-align: center;
  opacity: 0.55;
  padding: 16px 0;
}
.inbox {
  margin-top: 12px;
}
.inbox-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.proposal {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.p-title {
  font-weight: 600;
  font-size: 13px;
}
.p-desc {
  font-size: 12px;
  opacity: 0.7;
  margin: 4px 0;
}
.p-actions button {
  margin-right: 8px;
  cursor: pointer;
}
</style>
