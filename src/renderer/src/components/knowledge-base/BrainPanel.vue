<template>
  <div class="brain-panel">
    <!-- 统计条（§8.5 消化率最小版） -->
    <div class="section-header">
      <h3>知识大脑</h3>
      <el-tag :type="enabled ? 'success' : 'info'" size="small">{{ enabled ? '已启用' : '未启用' }}</el-tag>
      <span class="brain-stats">
        <span class="stat">论断 <b>{{ stats?.atoms?.total ?? '—' }}</b></span>
        <el-divider direction="vertical" />
        <span class="stat">我的观感 <b>{{ stats?.atoms?.humanOrigin ?? '—' }}</b></span>
        <el-divider direction="vertical" />
        <span class="stat">卡片 <b>{{ stats?.notes?.published ?? '—' }}</b></span>
        <el-divider direction="vertical" />
        <span class="stat">待审提议 <b>{{ proposalTotal }}</b></span>
        <el-divider direction="vertical" />
        <span class="stat">悬而未决 <b>{{ stats?.openQuestions ?? '—' }}</b></span>
      </span>
      <div class="section-actions">
        <el-button size="small" @click="configOpen = !configOpen">设置</el-button>
      </div>
    </div>

    <!-- 配置 -->
    <div v-if="configOpen" class="brain-config">
      <div class="cfg-row">
        <span class="cfg-label">启用知识大脑</span>
        <el-switch v-model="configDraft.enabled" />
      </div>
      <div class="cfg-row">
        <span class="cfg-label">自动消化新文档（原子化+裁决）</span>
        <el-switch v-model="configDraft.digestion.enabled" />
      </div>
      <div class="cfg-row">
        <span class="cfg-label">情节模式卡归纳（实验性，成本较高）</span>
        <el-switch v-model="configDraft.patterns.plotEnabled" />
      </div>
      <div class="cfg-row">
        <span class="cfg-label">自动入库阈值（低于则进待审）</span>
        <el-input-number
          v-model="configDraft.autoApproveThreshold"
          :min="0"
          :max="1"
          :step="0.05"
          size="small"
        />
      </div>
      <div class="cfg-row">
        <span class="cfg-label">原子化模型</span>
        <el-select
          v-model="configDraft.models.atomize"
          placeholder="跟随宿主模型"
          clearable
          value-on-clear=""
          size="small"
          style="width: 260px"
        >
          <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
      </div>
      <div class="cfg-row">
        <span class="cfg-label">裁决/提炼模型</span>
        <el-select
          v-model="configDraft.models.adjudicate"
          placeholder="跟随宿主模型"
          clearable
          value-on-clear=""
          size="small"
          style="width: 260px"
        >
          <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
      </div>
      <div class="cfg-actions">
        <el-button size="small" @click="discardConfig">取消</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="saveConfig">保存</el-button>
      </div>
    </div>

    <!-- 文档消化：开脑前上传的文档在此补提取 -->
    <div v-if="pendingDigestDocs.length > 0" class="digest-section">
      <div class="digest-title">
        待提取文档（{{ pendingDigestDocs.length }}）
        <el-button
          size="small"
          type="primary"
          plain
          :loading="digestAllBusy"
          @click="digestAll"
        >
          全部提取
        </el-button>
      </div>
      <div v-for="d in pendingDigestDocs" :key="d.id" class="digest-row">
        <span class="d-name" :title="d.name">{{ d.name }}</span>
        <el-button
          size="small"
          :loading="!!d.busy"
          @click="digestOne(d)"
        >
          {{ d.busy ? '提取中…' : '提取知识' }}
        </el-button>
      </div>
    </div>

    <!-- 论断列表 -->
    <el-table :data="atoms" :empty-text="enabled ? '尚未消化出论断（上传文档后自动进行）' : '大脑未启用，在设置中开启后上传文档自动消化'" style="width: 100%">
      <el-table-column prop="statement" label="论断" min-width="280">
        <template #default="{ row }">
          <el-tooltip v-if="row.sourceQuote" :content="row.sourceQuote" placement="top" :show-after="200">
            <span class="stmt">{{ row.statement }}</span>
          </el-tooltip>
          <span v-else class="stmt">{{ row.statement }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="视角" width="70">
        <template #default="{ row }">
          {{ row.lensNoteId ? '视角' : row.origin === 'human' ? '我' : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="来源" width="110">
        <template #default="{ row }">
          <span class="muted">{{ (row.sourceChapterHash || '').slice(0, 8) || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="useCount" label="被用" width="60" align="center" />
    </el-table>

    <!-- 提议收件箱 -->
    <div v-if="proposals.length > 0" class="inbox">
      <div class="digest-title">待审提议（{{ proposals.length }}）</div>
      <div v-for="p in proposals" :key="p.id" class="proposal">
        <div class="p-title">{{ p.title }}</div>
        <div class="p-desc">{{ p.description }}</div>
        <div class="p-actions">
          <el-button type="primary" size="small" @click="decide(p.id, 'publish')">批准</el-button>
          <el-button size="small" @click="decide(p.id, 'reject')">拒绝</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

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
  models: { atomize: string; adjudicate: string }
}
const modelOptions = ref<Array<{ label: string; value: string }>>([])

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
  models: { atomize: '', adjudicate: '' },
})
const configOpen = ref(false)
const saving = ref(false)
const enabled = ref(false)
interface DigestDoc {
  id: string
  name: string
  busy?: boolean
}
const pendingDigestDocs = ref<DigestDoc[]>([])
const digestAllBusy = ref(false)

function statusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  switch (status) {
    case 'supported':
      return 'success'
    case 'proposed':
    case 'suspected':
      return 'warning'
    case 'stale':
    case 'superseded':
    case 'archived':
      return 'info'
    default:
      return 'info'
  }
}

async function refresh(): Promise<void> {
  if (!props.kbId) return
  const gen = ++requestGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const [cfgRes, statsRes, atomsRes, inboxRes, docRes] = await Promise.all([
      client.getConfig(props.kbId),
      client.stats(props.kbId),
      client.listAtoms({ kbId: props.kbId, pageSize: 50 }),
      client.proposalInbox({ kbId: props.kbId, pageSize: 20 }),
      client.docStatus(props.kbId),
    ])
    if (gen !== requestGen) return // 过期响应丢弃
    if (cfgRes.success && cfgRes.data) {
      config.value = cfgRes.data.config
      enabled.value = !!cfgRes.data.config?.enabled
      if (cfgRes.data.config) configDraft.value = JSON.parse(JSON.stringify(cfgRes.data.config))
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
    // 待提取文档：已处理完成但大脑未消化的（开脑前上传的存量）
    if (docRes.success && docRes.data) {
      pendingDigestDocs.value = (docRes.data as Array<{ id: string; name: string; brainStatus: string | null }>)
        .filter((d) => d.brainStatus !== 'digested' && d.brainStatus !== 'digesting')
        .map((d) => ({ id: d.id, name: d.name }))
    }
  } catch (e) {
    console.warn('[BrainPanel] 刷新失败', e)
  }
  // 模型列表单独拉（通道缺失/失败不拖垮面板主数据）
  try {
    const modelsRes = await client.listModels()
    if (modelsRes.success && modelsRes.data) modelOptions.value = modelsRes.data
  } catch {
    /* 旧宿主无此通道：下拉为空但不影响其他功能 */
  }
}

function discardConfig(): void {
  if (config.value) configDraft.value = JSON.parse(JSON.stringify(config.value))
  configOpen.value = false
}

async function saveConfig(): Promise<void> {
  saving.value = true
  try {
    const draft = JSON.parse(JSON.stringify(configDraft.value)) as BrainConfig
    // 数字输入被清空时 el-input-number 会置 null——回退到已有值，避免校验失败打断保存
    if (draft.autoApproveThreshold == null) {
      draft.autoApproveThreshold = config.value?.autoApproveThreshold ?? 0.8
    }
    const res = await (window as any).electronAPI.knowledgeBase.brain.updateConfig({
      kbId: props.kbId,
      patch: draft,
    })
    if (res.success) {
      config.value = res.data
      enabled.value = !!res.data?.enabled
      configDraft.value = JSON.parse(JSON.stringify(res.data))
      ElMessage.success('大脑设置已保存')
      configOpen.value = false
    } else {
      ElMessage.error(`保存失败: ${res.error || '未知错误'}`)
    }
  } catch (e) {
    // ajv 校验失败（如手输越界阈值）响亮可见
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    saving.value = false
  }
}

async function decide(noteId: string, action: 'publish' | 'reject'): Promise<void> {
  await (window as any).electronAPI.knowledgeBase.brain.decideProposal({ noteId, action })
  await refresh()
}

async function digestOne(d: DigestDoc): Promise<void> {
  d.busy = true
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.digestDocument(d.id)
    if (res?.success) ElMessage.success(`「${d.name}」已加入提取队列`)
    else ElMessage.error(`提取失败: ${res?.error || '未知错误'}`)
  } catch (e) {
    ElMessage.error(`提取失败: ${(e as Error).message}`)
  } finally {
    d.busy = false
  }
  await refresh()
}

async function digestAll(): Promise<void> {
  digestAllBusy.value = true
  const failed: string[] = []
  try {
    for (const d of pendingDigestDocs.value) {
      d.busy = true
      try {
        const res = await (window as any).electronAPI.knowledgeBase.brain.digestDocument(d.id)
        if (!res?.success) failed.push(d.name)
      } catch {
        failed.push(d.name)
      } finally {
        d.busy = false
      }
    }
    // 单个失败不放弃剩余文档；结束时如实汇报
    if (failed.length === 0) ElMessage.success('全部文档已加入提取队列')
    else ElMessage.warning(`已入队 ${pendingDigestDocs.value.length - failed.length} 个，失败 ${failed.length} 个：${failed.join('、')}`)
  } finally {
    digestAllBusy.value = false
  }
  await refresh()
}

watch(() => props.kbId, refresh, { immediate: true })
defineExpose({ refresh })
</script>

<style scoped>
.brain-panel {
  padding: 0;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-header h3 {
  margin: 0;
  font-size: 15px;
  flex: none;
}
.section-actions {
  flex: none;
}
.brain-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  opacity: 0.85;
}
.stat b {
  font-weight: 600;
}
.brain-config {
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cfg-row {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}
.cfg-label {
  min-width: 220px;
}
.cfg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.digest-section {
  margin: 12px 0;
}
.digest-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.digest-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}
.d-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 12px;
}
.stmt {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.muted {
  opacity: 0.5;
}
.inbox {
  margin-top: 12px;
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
.p-actions {
  display: flex;
  gap: 8px;
}
</style>
