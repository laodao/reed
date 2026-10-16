<template>
  <div class="review-page">
    <!-- 头部 -->
    <div class="rp-head">
      <div class="rp-title">
        <el-icon :size="20"><Finished /></el-icon>
        <span>审核确认</span>
      </div>
      <div class="rp-sub" v-if="run">
        <span class="rp-run">{{ shortId(run.id) }}</span>
        <el-tag size="small" :type="statusTag(run.status)">{{ run.status }}</el-tag>
        <span v-if="defName" class="rp-def">{{ defName }}</span>
      </div>
      <div class="rp-actions">
        <el-button size="small" @click="goRunDetail">查看运行详情</el-button>
        <el-button size="small" @click="router.back()">返回</el-button>
      </div>
    </div>

    <el-alert
      v-if="run && run.status === 'waiting_review' && pendingList.length === 0"
      type="info"
      :closable="false"
      show-icon
      title="当前没有待审核的确认环节（可能正在等待下一步或需要填写表单）"
    />

    <div v-if="pendingList.length" class="rp-body">
      <!-- 左侧：待审环节列表（审批流步骤感） -->
      <div class="rp-rail">
        <div
          v-for="(p, i) in pendingList"
          :key="p.nodeId"
          class="rp-step"
          :class="{ active: i === activeIndex, done: doneFlags.has(p.nodeId) }"
          @click="selectStep(i)"
        >
          <div class="rp-step-title">{{ stageTitle(p) }}</div>
          <div class="rp-step-node">{{ p.nodeName || p.nodeId }}</div>
        </div>
      </div>

      <!-- 右侧：当前环节审核表单 -->
      <div v-if="current" class="rp-form">
        <div class="rp-form-stage">{{ stageTitle(current) }}</div>
        <div class="rp-form-meta">
          <span>节点：{{ current.nodeName || current.nodeId }}</span>
          <span v-if="current.iterationIndex != null">迭代 #{{ current.iterationIndex }}</span>
          <span>挂起于 {{ fmtTime(current.startedAt) }}</span>
        </div>

        <!-- 大纲/文案类（payload.md） -->
        <div v-if="kind === 'md'" class="rp-block">
          <div class="rp-hint">核对口播与事实口径；可直接在右侧修改后「提交修改并批准」，或「批准」原样通过。</div>
          <el-input v-model="mdText" type="textarea" :rows="20" class="rp-md-editor" />
          <div class="rp-preview"><pre>{{ mdText }}</pre></div>
        </div>

        <!-- 素材板类（payload.cards） -->
        <div v-else-if="kind === 'board'" class="rp-block">
          <div class="rp-hint">
            素材板共 {{ cards.length }} 镜 —— 逐镜核对画面意象与脚本立场是否匹配（无文字、可实拍、不直译、不误用褒贬符号），
            可在卡片上直接修改画面/字幕/时长后「提交修改并批准」。
          </div>
          <div class="rp-cards">
            <div v-for="(c, ci) in cards" :key="ci" class="rp-card">
              <div class="rp-card-img">
                <el-image v-if="cardImg(c)" :src="cardImg(c)" fit="cover" class="rp-img" />
                <div v-else class="rp-img-empty">无图</div>
                <div class="rp-card-tags">
                  <el-tag size="small" type="info">{{ c.mode || '?' }}</el-tag>
                  <el-tag size="small" type="warning">{{ c.source || '?' }}</el-tag>
                  <el-tag size="small">{{ c.duration ?? '?' }}s</el-tag>
                </div>
              </div>
              <div class="rp-card-fields">
                <label>字幕 caption</label>
                <el-input v-model="c.caption" size="small" placeholder="字幕短句" />
                <label>时长（秒）</label>
                <el-input-number v-model="c.duration" :min="2" :max="20" size="small" controls-position="right" />
                <label>意象/画面描述 visual</label>
                <el-input v-model="c.visual" type="textarea" :rows="3" />
                <details class="rp-more">
                  <summary>更多字段（imagery / prompt）</summary>
                  <label>意象对象 imagery</label>
                  <el-input v-model="c.imagery" type="textarea" :rows="2" />
                  <label>出图 prompt</label>
                  <el-input v-model="c.prompt" type="textarea" :rows="3" />
                </details>
              </div>
            </div>
          </div>
        </div>

        <!-- 逐镜类（payload.visual 单卡） -->
        <div v-else-if="kind === 'shot'" class="rp-block">
          <div class="rp-hint">逐镜图生视频前的最后确认：核对首帧画面与运镜描述。</div>
          <div class="rp-shot">
            <div class="rp-shot-img">
              <el-image v-if="shotImg" :src="shotImg" fit="cover" class="rp-img" style="height: 220px" />
              <div v-else class="rp-img-empty">无图</div>
            </div>
            <div class="rp-shot-fields">
              <label>镜头 #{{ shotIndex }}</label>
              <label>画面描述 visual</label>
              <el-input v-model="shotVisual" type="textarea" :rows="6" />
              <label>字幕 caption</label>
              <el-input v-model="shotCaption" size="small" />
              <label>时长（秒）</label>
              <el-input-number v-model="shotDuration" :min="2" :max="20" size="small" controls-position="right" />
            </div>
          </div>
        </div>

        <!-- 兜底：通用 payload JSON -->
        <div v-else class="rp-block">
          <div class="rp-hint">该环节无专用表单，可直接修改送审 JSON（浅覆盖顶层字段）后提交。</div>
          <el-input v-model="jsonText" type="textarea" :rows="16" class="rp-json" />
        </div>

        <!-- 操作区 -->
        <div class="rp-actions">
          <el-button type="danger" plain :loading="acting" @click="decide('reject')">驳回</el-button>
          <el-button type="primary" :loading="acting" @click="decide('approve')">批准</el-button>
          <el-button
            type="success"
            :loading="acting"
            :disabled="kind === 'json' && !jsonOk"
            @click="decide('approve_with_changes')"
          >
            提交修改并批准
          </el-button>
        </div>
      </div>
    </div>

    <!-- 无待审（终态等） -->
    <div v-else-if="run" class="rp-empty">
      <el-result icon="success" v-if="run.status === 'succeeded'" title="运行已完成" sub-title="本运行已没有待审核环节，可查看成片与运行详情">
        <template #extra>
          <el-button type="primary" @click="goRunDetail">查看运行详情 / 产物</el-button>
        </template>
      </el-result>
      <el-result v-else icon="info" :title="`运行状态：${run.status}`" sub-title="当前没有待审核的确认环节">
        <template #extra>
          <el-button type="primary" @click="goRunDetail">查看运行详情</el-button>
          <el-button @click="load">刷新</el-button>
        </template>
      </el-result>
    </div>
    <div v-else v-loading="loading" class="rp-loading" />
  </div>
</template>

<script setup lang="ts">
/**
 * 审核确认页（审批表单）：独立审批台
 * 路由：/workflow/review/:runId（通知“待审核”直达；可在运行详情页点击进入）
 * 行为：
 *  - 列出该运行所有 waiting_review 的 human-review 环节，自动聚焦第一个；
 *  - 按 payload 形态渲染表单：payload.md（大纲/文案，可编辑后批准）｜payload.cards（素材板逐镜卡片）
 *    ｜payload.visual 单卡（逐镜）｜通用 JSON 兜底；
 *  - 批准 / 驳回 / 修改后批准 全部走 workflow.reviewDecide；
 *  - 处理成功 → 自动刷新，聚焦下一个待审环节（支持连续审批）；
 *  - 通知“自动消失”：后端在决策后按 runId 批量已读（NotificationService.resolveRunNotices），本页刷新铃铛。
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Finished } from '@element-plus/icons-vue'
import { toImageUrl } from '../../utils/asset-url'
import { useNotificationStore } from '@/stores/notification'

const route = useRoute()
const router = useRouter()
const notif = useNotificationStore()
const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

const run = ref<any>(null)
const nodeRuns = ref<any[]>([])
const defName = ref('')
const loading = ref(false)
const acting = ref(false)
const activeIndex = ref(0)
const doneFlags = ref<Set<string>>(new Set())
let pollTimer: ReturnType<typeof setInterval> | null = null

const runId = computed(() => String(route.params.runId || ''))
const pendingList = computed(() =>
  nodeRuns.value.filter(
    n => n.status === 'waiting_review' && (n.nodeType === 'human-review' || !n.nodeType)
  )
)
const current = computed(() => pendingList.value[activeIndex.value] ?? pendingList.value[0] ?? null)

const payload = computed(() => (current.value?.input?.payload ?? current.value?.output ?? {}) as Record<string, unknown>)
const kind = computed(() => {
  const p = payload.value
  if (Array.isArray(p.cards)) return 'board'
  if (typeof p.md === 'string') return 'md'
  if (typeof p.visual === 'string') return 'shot'
  return 'json'
})

// ── 编辑态（按 kind 单向同步） ─────────────────────────────
const mdText = ref('')
const cards = ref<Array<Record<string, any>>>([])
const shotVisual = ref('')
const shotCaption = ref('')
const shotDuration = ref<number>(6)
const shotImg = ref('')
const shotIndex = ref<number | null>(null)
const jsonText = ref('')
const jsonOk = ref(true)

function syncForm(): void {
  const p = payload.value
  if (!p) return
  if (kind.value === 'md') mdText.value = String(p.md ?? '')
  else if (kind.value === 'board') cards.value = (p.cards as any[]).map(c => ({ ...(c ?? {}) }))
  else if (kind.value === 'shot') {
    shotVisual.value = String(p.visual ?? '')
    shotCaption.value = String(p.caption ?? '')
    shotDuration.value = Number(p.duration) > 0 ? Number(p.duration) : 6
    shotIndex.value = p.shotIndex != null ? Number(p.shotIndex) : null
    shotImg.value = toImageUrl(String(p.imageLocalUrl ?? p.imageUrl ?? p.image ?? '') || '')
  } else {
    try {
      jsonText.value = JSON.stringify(p, null, 2)
      jsonOk.value = true
    } catch { jsonText.value = String(p); jsonOk.value = true }
  }
}

watch([current, kind], () => { if (current.value) syncForm() })

function stageTitle(p: any): string {
  return String(((p.input?.payload) || {})?.stage || p.nodeName || p.nodeId || '审核')
}
function statusTag(s: string): any {
  return s === 'succeeded' ? 'success' : s === 'failed' ? 'danger' : s === 'waiting_review' ? 'warning' : s === 'running' ? 'primary' : 'info'
}
function fmtTime(ts: unknown): string {
  if (!ts) return ''
  const d = new Date(String(ts))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { hour12: false })
}
function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 12)}…${id.slice(-4)}` : id
}
function cardImg(c: Record<string, any>): string {
  return toImageUrl(String(c.imageUrl ?? c.imageLocalUrl ?? c.image ?? '') || '')
}

async function load(): Promise<void> {
  if (!runId.value) return
  loading.value = true
  try {
    const r = await api().getRun(runId.value)
    if (r?.success && r.data) {
      run.value = r.data.run ?? null
      nodeRuns.value = Array.isArray(r.data.nodeRuns) ? r.data.nodeRuns : []
      // 自动聚焦第一个待审（如当前索引已越界则回 0）
      if (activeIndex.value >= pendingList.value.length) activeIndex.value = 0
      if (!current.value && pendingList.value.length) activeIndex.value = 0
      // 定义名（可选）
      if (run.value?.definitionId) {
        const d = await api().getDefinition(run.value.definitionId)
        if (d?.success && d.data) defName.value = String(d.data.name || '')
      }
    } else {
      ElMessage.error(r.error ?? '加载运行失败')
    }
  } finally {
    loading.value = false
  }
}

function selectStep(i: number): void { activeIndex.value = i }

async function decide(decision: 'approve' | 'reject' | 'approve_with_changes'): Promise<void> {
  const c = current.value
  if (!c) return
  acting.value = true
  try {
    const editedValues: Record<string, unknown> = {}
    if (decision === 'approve_with_changes') {
      if (kind.value === 'md') editedValues.md = mdText.value
      else if (kind.value === 'board') editedValues.cards = cards.value
      else if (kind.value === 'shot') {
        editedValues.visual = shotVisual.value
        editedValues.caption = shotCaption.value
        editedValues.duration = Number(shotDuration.value) || 6
      } else {
        try {
          const parsed = JSON.parse(jsonText.value)
          Object.assign(editedValues, parsed && typeof parsed === 'object' ? parsed : {})
        } catch { ElMessage.error('送审 JSON 无效'); return }
      }
    }
    const r = await api().reviewDecide({ runId: runId.value, nodeId: c.nodeId, decision, editedValues: Object.keys(editedValues).length ? editedValues : undefined })
    if (r?.success) {
      ElMessage.success(decision === 'reject' ? '已驳回' : '已通过，流程继续')
      doneFlags.value.add(c.nodeId)
      void notif.refreshUnread() // 后端已按 runId 自动已读 → 铃铛即时回落
      await load()
    } else {
      ElMessage.error(r?.error ?? '操作失败')
    }
  } finally {
    acting.value = false
  }
}

function goRunDetail(): void {
  void router.push(`/workflow/run/${runId.value}`)
}

/** 运行仍在进行：低频轮询，新待审到达自动刷新（支持连续审批） */
function startPolling(): void {
  stopPolling()
  pollTimer = setInterval(() => {
    if (!document.hidden) void load()
  }, 6000)
}
function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

onMounted(() => { void load(); startPolling() })
onUnmounted(stopPolling)
</script>

<style scoped>
.review-page { padding: 16px 20px 40px; max-width: 1280px; margin: 0 auto; }
.rp-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.rp-title { display: flex; align-items: center; gap: 6px; font-size: 17px; font-weight: 600; }
.rp-sub { display: flex; align-items: center; gap: 8px; color: var(--el-text-color-secondary); font-size: 13px; }
.rp-run { font-family: ui-monospace, monospace; }
.rp-def { color: var(--el-text-color-regular); }
.rp-actions { margin-left: auto; display: flex; gap: 8px; }
.rp-body { display: flex; gap: 16px; align-items: flex-start; }
.rp-rail { width: 240px; flex: 0 0 240px; display: flex; flex-direction: column; gap: 8px; }
.rp-step { border: 1px solid var(--el-border-color); border-radius: 8px; padding: 10px 12px; cursor: pointer; background: #fff; transition: all .15s; }
.rp-step.active { border-color: #409eff; background: #ecf5ff; }
.rp-step.done { opacity: .55; }
.rp-step-title { font-size: 13px; font-weight: 600; }
.rp-step-node { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; word-break: break-all; }
.rp-form { flex: 1; min-width: 0; border: 1px solid var(--el-border-color); border-radius: 10px; padding: 16px; background: #fff; }
.rp-form-stage { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
.rp-form-meta { display: flex; gap: 14px; color: var(--el-text-color-secondary); font-size: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.rp-block .rp-hint { font-size: 12px; color: #7a8699; background: #f7f9fc; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
.rp-md-editor { font-family: ui-monospace, monospace; font-size: 12px; }
.rp-preview { margin-top: 10px; max-height: 260px; overflow: auto; border: 1px dashed var(--el-border-color); border-radius: 6px; padding: 8px; background: #fbfcfe; }
.rp-preview pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
.rp-cards { display: flex; flex-direction: column; gap: 12px; max-height: 520px; overflow: auto; padding-right: 6px; }
.rp-card { display: flex; gap: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; padding: 10px; }
.rp-card-img { flex: 0 0 150px; width: 150px; }
.rp-img { width: 100%; height: 180px; border-radius: 6px; display: block; }
.rp-img-empty { width: 100%; height: 180px; display: flex; align-items: center; justify-content: center; color: #aaa; background: #f5f7fa; border-radius: 6px; font-size: 12px; }
.rp-card-tags { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.rp-card-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rp-card-fields label, .rp-shot-fields label { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.rp-more { margin-top: 6px; font-size: 12px; color: #909399; }
.rp-more label { display: block; }
.rp-shot { display: flex; gap: 14px; }
.rp-shot-img { flex: 0 0 220px; }
.rp-shot-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.rp-json { font-family: ui-monospace, monospace; font-size: 12px; }
.rp-actions { margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px; }
.rp-empty { margin-top: 40px; }
.rp-loading { min-height: 300px; display: flex; align-items: center; justify-content: center; }
@media (max-width: 860px) { .rp-body { flex-direction: column; } .rp-rail { width: 100%; flex: auto; flex-direction: row; overflow-x: auto; } .rp-card { flex-direction: column; } .rp-shot { flex-direction: column; } }
</style>
