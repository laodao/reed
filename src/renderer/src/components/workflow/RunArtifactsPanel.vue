<template>
  <div class="run-artifacts">
    <!-- 加载态 -->
    <div v-if="loading" class="ra-loading" v-loading="true" />

    <template v-else>
      <!-- 空态 -->
      <div v-if="!groups.length" class="ra-empty">
        <el-empty :image-size="60" description="该运行暂无产物节点输出" />
      </div>

      <template v-else>
        <!-- 头：运行状态 + 时长 -->
        <div class="ra-head">
          <span class="ra-title">该运行产出物</span>
          <el-tag v-if="run" size="small" :type="runStatusTag(run.status)">{{ RUN_STATUS_LABEL[run.status] ?? run.status }}</el-tag>
          <span v-if="run" class="ra-meta">{{ abbrevRunId(run.id) }} · 时长 {{ formatRunDuration(run.durationMs) }}</span>
        </div>

        <!-- 分组卡片 -->
        <div class="og-list">
          <div v-for="g in groups" :key="g.nodeId" class="og-group">
            <div class="og-head">
              <el-tag size="small" :type="typeTag(g.nodeType)">{{ typeLabel(g.nodeType) }}</el-tag>
              <span class="og-name">{{ g.nodeName }}</span>
              <span class="og-count">{{ g.items.length }} 项</span>
            </div>

            <div class="og-body">
              <!-- 资产（重点）：save-asset 输出 -->
              <template v-if="g.nodeType === 'save-asset'">
                <div v-for="(o, i) in g.items" :key="i" class="og-asset">
                  <div class="og-asset-main">
                    <div class="og-asset-name">{{ o.name || '未命名资产' }}</div>
                    <div class="og-asset-meta">
                      <el-tag size="small" type="info">{{ o.category || '—' }}</el-tag>
                      <span v-if="o.subCategory" class="og-sub">{{ o.subCategory }}</span>
                      <span class="og-asset-id" :title="o.assetId">{{ o.assetId }}</span>
                    </div>
                  </div>
                  <div class="og-asset-actions">
                    <el-button size="small" text type="primary" :disabled="!isHttpUrl(o.url)" @click="openUrl(o.url)">打开</el-button>
                    <el-button size="small" text :disabled="!o.url" @click="copyText(o.url)">复制链接</el-button>
                    <el-button size="small" text @click="copyText(JSON.stringify({ assetId: o.assetId, name: o.name, category: o.category, subCategory: o.subCategory }))">复制信息</el-button>
                  </div>
                </div>
              </template>

              <!-- 视频产物：video-gen / video-compose -->
              <template v-else-if="g.nodeType === 'video-gen' || g.nodeType === 'video-compose'">
                <div v-for="(o, i) in g.items" :key="i" class="og-media">
                  <video v-if="mediaSrc(toVideoUrl(o.videoPath))" :src="mediaSrc(toVideoUrl(o.videoPath))" controls preload="metadata" class="og-video-el" playsinline />
                  <div class="og-media-path" :title="o.videoPath">{{ o.videoPath }}</div>
                  <el-button size="small" text @click="copyText(o.videoPath)">复制路径</el-button>
                </div>
              </template>

              <!-- 图像产物：image-gen -->
              <template v-else-if="g.nodeType === 'image-gen'">
                <div class="og-img-grid">
                  <template v-for="(o, i) in g.items" :key="i">
                    <div v-for="(img, j) in (o.images || [])" :key="j" class="og-img-item">
                      <img :src="mediaSrc(img.localUrl || toImageUrl(img.path))" class="og-img" alt="" />
                      <el-button size="small" text @click="copyText(img.localUrl || img.path || '')">复制链接</el-button>
                    </div>
                  </template>
                </div>
              </template>

              <!-- 音频产物：tts -->
              <template v-else-if="g.nodeType === 'tts'">
                <div v-for="(o, i) in g.items" :key="i" class="og-media">
                  <audio v-if="mediaSrc(o.audioPath)" :src="mediaSrc(o.audioPath)" controls preload="metadata" class="og-audio-el" />
                  <div class="og-media-path" :title="o.audioPath">{{ o.audioPath }}</div>
                  <el-button size="small" text @click="copyText(o.audioPath)">复制路径</el-button>
                </div>
              </template>

              <!-- 代码结果（大文本）：code -->
              <template v-else-if="g.nodeType === 'code'">
                <div v-for="(o, i) in g.items" :key="i" class="og-code">
                  <JsonFold :value="o.result" :max-summary-chars="80" class="og-code-fold" />
                  <el-button size="small" text @click="copyText(codeAsText(o.result))">复制结果</el-button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 运行产物面板（历史列表专用）：输入 runId，拉取该 run（getRun → nodeRuns）并聚合产出物。
 * 重点展示 save-asset 的 output（assetId/name/category/subCategory/url），并把产物类节点
 * （video-gen videoPath、image-gen images、tts audioPath、code 大文本 result）作为可复制内容卡片。
 */
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import JsonFold from './JsonFold.vue'
import { toImageUrl, toVideoUrl } from '../../utils/asset-url'
import {
  abbrevRunId,
  formatRunDuration,
  runStatusTag,
  RUN_STATUS_LABEL,
} from '../../utils/workflow-run-detail-utils'

const props = defineProps<{ runId: string | null }>()

const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

const run = ref<any>(null)
const groups = ref<any[]>([])
const loading = ref(false)

/** 产物类节点类型（聚合重点） */
const PRODUCT_TYPES = ['save-asset', 'video-gen', 'video-compose', 'image-gen', 'tts', 'code']

function typeLabel(t: string): string {
  return (
    {
      'save-asset': '资产',
      'video-gen': '镜头视频',
      'video-compose': '成片视频',
      'image-gen': '图像',
      tts: '语音',
      code: '文本产物',
    }[t] ?? t
  )
}
function typeTag(t: string): 'success' | 'warning' | 'primary' | 'info' {
  if (t === 'save-asset') return 'success'
  if (t === 'video-gen' || t === 'video-compose') return 'primary'
  if (t === 'image-gen' || t === 'tts') return 'warning'
  return 'info'
}

function codeAsText(result: unknown): string {
  if (result === undefined || result === null) return ''
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

/** code 节点只保留内容较有意义的大文本产物，过滤空/过短结果 */
function shouldIncludeCode(nr: any): boolean {
  return codeAsText(nr.output?.result).trim().length >= 60
}

/** 按节点聚合产出物（nodeRuns → 分组输出） */
function buildGroups(nodeRuns: any[]): any[] {
  const map = new Map<string, { nodeId: string; nodeName: string; nodeType: string; items: any[] }>()
  for (const nr of nodeRuns) {
    if (!nr.output) continue
    if (!PRODUCT_TYPES.includes(nr.nodeType)) continue
    if (nr.nodeType === 'code' && !shouldIncludeCode(nr)) continue
    let g = map.get(nr.nodeId)
    if (!g) {
      g = { nodeId: nr.nodeId, nodeName: nr.nodeName, nodeType: nr.nodeType, items: [] }
      map.set(nr.nodeId, g)
    }
    g.items.push(nr.output)
  }
  return [...map.values()]
}

async function load(): Promise<void> {
  if (!props.runId) { run.value = null; groups.value = []; return }
  loading.value = true
  try {
    const resp = await api().getRun(props.runId)
    if (resp.success && resp.data) {
      run.value = resp.data.run
      groups.value = buildGroups(resp.data.nodeRuns ?? [])
    } else {
      run.value = null
      groups.value = []
      ElMessage.error(resp.error ?? '拉取运行详情失败')
    }
  } finally {
    loading.value = false
  }
}

function isHttpUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith('http://') || url.startsWith('https://'))
}
function openUrl(url: string | undefined): void {
  if (!url) return
  window.open(url, '_blank')
}

/**
 * 媒体源过滤：仅返回可被本地协议正常加载的 URL。
 * 原始 Windows 绝对路径（如 C:\...）被 toVideoUrl 伪装成 local-*://C:\... 后无法解码，
 * 此时返回 ''（隐藏预览，保留路径文本 + 复制）。
 */
function mediaSrc(url: string | undefined): string {
  if (!url) return ''
  if (/^local-[a-z]+:\/\/[a-zA-Z]:\\/.test(url)) return ''
  return url
}

async function copyText(text: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

onMounted(() => {
  if (props.runId) void load()
})
watch(() => props.runId, (v) => {
  if (v) void load()
})
</script>

<style scoped>
.run-artifacts { display: flex; flex-direction: column; min-height: 120px; }
.ra-loading { min-height: 120px; }
.ra-empty { padding: 8px 0; }
.ra-head { display: flex; align-items: center; gap: 8px; margin: 2px 0 12px; flex-wrap: wrap; }
.ra-title { font-size: 13px; font-weight: 600; }
.ra-meta { font-size: 12px; color: var(--el-text-color-secondary); }

.og-list { display: flex; flex-direction: column; gap: 10px; }
.og-group { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px 10px; }
.og-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.og-name { font-weight: 600; font-size: 13px; }
.og-count { font-size: 11px; color: var(--el-text-color-secondary); }
.og-body { display: flex; flex-direction: column; gap: 8px; }

/* 资产卡片 */
.og-asset { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 8px; background: var(--el-fill-color-light); border-radius: 6px; flex-wrap: wrap; }
.og-asset-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.og-asset-name { font-weight: 600; font-size: 12px; }
.og-asset-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--el-text-color-secondary); flex-wrap: wrap; }
.og-sub { color: var(--el-text-color-regular); }
.og-asset-id { font-family: monospace; }
.og-asset-actions { display: flex; gap: 4px; flex: none; }

/* 媒体卡片 */
.og-media { display: flex; flex-direction: column; gap: 5px; }
.og-video-el { width: 100%; max-width: 320px; border-radius: 6px; background: #000; }
.og-audio-el { width: 100%; max-width: 320px; }
.og-media-path { font-size: 11px; color: var(--el-text-color-secondary); word-break: break-all; }

/* 图像网格 */
.og-img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.og-img-item { display: flex; flex-direction: column; gap: 4px; }
.og-img { width: 100%; height: 96px; object-fit: cover; border-radius: 6px; background: var(--el-fill-color-light); display: block; }

/* 代码文本产物 */
.og-code { display: flex; align-items: center; gap: 8px; }
.og-code-fold { flex: 1; min-width: 0; }
</style>
