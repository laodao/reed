<template>
  <el-dialog
    v-model="visible"
    title="新建剧集"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="!creating"
  >
    <el-form label-width="90px" label-position="left">
      <el-form-item label="内容来源">
        <el-radio-group v-model="source" :disabled="creating">
          <el-radio-button value="chapter" :disabled="!longWritingProjectId">长文章节</el-radio-button>
          <el-radio-button value="text">粘贴文本</el-radio-button>
          <el-radio-button value="ai">AI 生成</el-radio-button>
        </el-radio-group>
        <div v-if="!longWritingProjectId" class="form-hint">
          项目未关联长文，「长文章节」不可用（可在项目设置中关联长文项目）
        </div>
      </el-form-item>

      <!-- 来源 1：关联长文章节 -->
      <el-form-item v-if="source === 'chapter'" label="选择章节">
        <el-select
          v-model="chapterOutlineId"
          class="chapter-select"
          filterable
          :loading="chaptersLoading"
          placeholder="选择长文章节（取其正文作为本集种子文本）"
          :disabled="creating"
          @change="onChapterChange"
        >
          <el-option
            v-for="c in chapterOptions"
            :key="c.id"
            :value="c.id"
            :label="c.label"
            :disabled="!c.hasContent"
          />
        </el-select>
        <div class="form-hint">{{ chapterHint }}</div>
      </el-form-item>

      <!-- 来源 2：粘贴文本 -->
      <el-form-item v-if="source === 'text'" label="种子文本">
        <el-input
          v-model="seedText"
          type="textarea"
          :rows="8"
          placeholder="粘贴该集的原文 / 梗概 / 大纲，作为 AI 生成剧本的素材"
          :disabled="creating"
        />
      </el-form-item>

      <!-- 来源 3：AI 生成 -->
      <template v-if="source === 'ai'">
        <el-form-item label="剧情梗概">
          <el-input
            v-model="aiSummary"
            type="textarea"
            :rows="5"
            placeholder="本集剧情梗概（必填）"
            :disabled="creating"
          />
        </el-form-item>
        <el-form-item label="角色设定">
          <el-input
            v-model="aiCharacters"
            type="textarea"
            :rows="3"
            placeholder="主要角色设定（可选）"
            :disabled="creating"
          />
        </el-form-item>
      </template>

      <el-form-item label="集数">
        <el-input-number v-model="episodeNumber" :min="1" :disabled="creating" />
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="title" placeholder="如：第2集 死而复生者" :disabled="creating" />
      </el-form-item>
      <el-form-item label=" ">
        <el-checkbox v-model="autoRun" :disabled="creating">
          创建后自动执行：识别要素 → 生成剧本 → 拆分场景（需已配置「剧本生成」模型）
        </el-checkbox>
      </el-form-item>
    </el-form>

    <el-alert v-if="error" :title="error" type="error" :closable="false" class="err-alert" />

    <template #footer>
      <el-button :disabled="creating" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="creating" :disabled="!canCreate" @click="onCreate">
        {{ creating ? (genStep || '创建中…') : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * NewEpisodeDialog · 工作室顶栏「＋」新建剧集（2026-09-19 方案A）
 *
 * 三种内容来源：
 *  1. 长文章节：项目关联长文后，选章节取正文作种子文本（设置里那句提示文案的落地）
 *  2. 粘贴文本：手工粘贴原文/梗概
 *  3. AI 生成：梗概 + 角色设定 → 作为种子文本
 *
 * 复用既有后端链路（与 EpisodeCreator / StoryRoom 转短剧相同）：
 *   createEpisode(uploaded) →（可选）batchIdentifyEntities → generateScript → generateScenes
 * 创建成功 emit('created', episodeId)，由宿主切换到新集。
 */
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  projectId: string
  /** 当前已有集数（用于默认集数 = +1） */
  existingEpisodeCount: number
  /** 项目关联的长文项目 ID（未关联 → 长文章节来源不可用） */
  longWritingProjectId?: string | null
}>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  created: [episodeId: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

type Source = 'chapter' | 'text' | 'ai'
const source = ref<Source>('text')
const episodeNumber = ref(1)
const title = ref('')
const seedText = ref('')
const aiSummary = ref('')
const aiCharacters = ref('')
const autoRun = ref(true)
const creating = ref(false)
const genStep = ref('')
const error = ref('')

// ── 长文章节 ─────────────────────────────────────────────
interface ChapterOption { id: string; name: string; hasContent: boolean; content: string; label: string }
const chaptersLoading = ref(false)
const chapterOptions = ref<ChapterOption[]>([])
const chapterOutlineId = ref('')

const chapterHint = computed(() => {
  if (chaptersLoading.value) return '正在加载章节…'
  if (!chapterOptions.value.length) return '未找到章节'
  const c = chapterOptions.value.find(x => x.id === chapterOutlineId.value)
  return c?.hasContent ? `正文约 ${c.content.length} 字（超长将截断至 15000 字）` : '选择有正文的章节'
})

/** 大纲树拍平（兼容 children 嵌套 / parentId 平铺两种形态） */
function flattenOutlineTree(nodes: any[]): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = []
  const walk = (list: any[]) => {
    for (const n of list ?? []) {
      const name = n.name ?? n.title ?? ''
      if (n.id && name) out.push({ id: n.id, name })
      if (Array.isArray(n.children) && n.children.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

async function loadChapters(): Promise<void> {
  if (!props.longWritingProjectId) return
  chaptersLoading.value = true
  chapterOptions.value = []
  try {
    const treeResp = await window.electronAPI.longwriting.getOutlineTree(props.longWritingProjectId)
    if (!treeResp?.success) return
    const flat = flattenOutlineTree(treeResp.data || [])
    if (!flat.length) return
    const chResp = await window.electronAPI.longwriting.getChaptersByOutlineIds(flat.map(f => f.id))
    // 返回是 { [outlineId]: chapter } 对象（handler 把 Map 转普通对象），兼容数组形态
    const chData = chResp?.success ? chResp.data : {}
    const byOutline = new Map<string, any>()
    if (Array.isArray(chData)) {
      for (const c of chData) byOutline.set(c.outlineId ?? c.outline_id, c)
    } else {
      for (const [k, v] of Object.entries(chData ?? {})) byOutline.set(k, v)
    }
    chapterOptions.value = flat.map(f => {
      const content: string = byOutline.get(f.id)?.content ?? ''
      return {
        id: f.id,
        name: f.name,
        hasContent: !!content.trim(),
        content,
        label: `${f.name}${content.trim() ? '' : '（无正文）'}`,
      }
    })
  } finally {
    chaptersLoading.value = false
  }
}

function onChapterChange(): void {
  const c = chapterOptions.value.find(x => x.id === chapterOutlineId.value)
  if (!c) return
  // 章节名「2 死而复生者」→ 标题「第2集 死而复生者」（集数以剧集侧为准，不用章节号）
  const bare = c.name.replace(/^\d+\s*/, '')
  title.value = `第${episodeNumber.value}集 ${bare}`.trim()
}

// ── 创建 ─────────────────────────────────────────────────
const canCreate = computed(() => {
  if (creating.value) return false
  if (source.value === 'chapter') {
    const c = chapterOptions.value.find(x => x.id === chapterOutlineId.value)
    return !!c?.hasContent
  }
  if (source.value === 'text') return !!seedText.value.trim()
  return !!aiSummary.value.trim()
})

function buildSeedContent(): string {
  if (source.value === 'chapter') {
    const c = chapterOptions.value.find(x => x.id === chapterOutlineId.value)
    return (c?.content ?? '').slice(0, 15000)
  }
  if (source.value === 'text') return seedText.value.trim().slice(0, 15000)
  return [
    aiSummary.value.trim(),
    aiCharacters.value.trim() ? `主要角色设定：${aiCharacters.value.trim()}` : '',
  ].filter(Boolean).join('\n').slice(0, 15000)
}

async function onCreate(): Promise<void> {
  error.value = ''
  creating.value = true
  genStep.value = '创建剧集…'
  try {
    const epApi = window.electronAPI.episodeProduction
    const epResp = await epApi.createEpisode(props.projectId, {
      sourceType: 'uploaded',
      uploadedContent: buildSeedContent(),
      episodeNumber: episodeNumber.value,
      title: title.value.trim() || `第${episodeNumber.value}集`,
    })
    if (!epResp.success || !epResp.data) {
      error.value = epResp.error || '创建剧集失败'
      return
    }
    const newEpisodeId = epResp.data.id

    if (autoRun.value) {
      // 识别要素（需项目已配「剧本生成」模型；未配置明确提示并跳过，不静默）
      try {
        genStep.value = 'AI 识别角色 / 地点 / 物品…'
        const proj = await epApi.getProject(props.projectId)
        const sm = proj.data?.config?.scriptModel
        if (sm?.providerConfigId && sm?.modelId) {
          await epApi.batchIdentifyEntities({
            projectId: props.projectId,
            episodeIds: [newEpisodeId],
            providerConfigId: sm.providerConfigId,
            modelId: sm.modelId,
          })
        } else {
          ElMessage.warning('未配置剧本生成模型，已跳过要素识别；可稍后在「剧本」页重新识别')
        }
      } catch { /* 识别失败不阻断 */ }

      genStep.value = 'AI 生成剧本…'
      const scriptResp = await epApi.generateScript(newEpisodeId)
      if (!scriptResp.success) {
        error.value = scriptResp.error || '剧集已创建，但生成剧本失败（可在「剧本」页重试）'
        emit('created', newEpisodeId)
        return
      }
      const scriptId = scriptResp.data?.script?.id
      if (scriptId) {
        genStep.value = '拆分场景…'
        await epApi.generateScenes(scriptId).catch(() => null)
      }
    }

    ElMessage.success(`第 ${episodeNumber.value} 集已创建`)
    visible.value = false
    emit('created', newEpisodeId)
  } catch (e: any) {
    error.value = e?.message || '创建失败'
  } finally {
    creating.value = false
    genStep.value = ''
  }
}

watch(visible, async (v) => {
  if (!v) return
  // 每次打开重置：默认集数 +1、默认来源（有关联长文优先章节）
  error.value = ''
  episodeNumber.value = props.existingEpisodeCount + 1
  title.value = `第${episodeNumber.value}集`
  seedText.value = ''
  aiSummary.value = ''
  aiCharacters.value = ''
  chapterOutlineId.value = ''
  source.value = props.longWritingProjectId ? 'chapter' : 'text'
  if (props.longWritingProjectId) await loadChapters()
})
</script>

<style lang="scss" scoped>
.chapter-select { width: 100%; }
.form-hint { font-size: 12px; color: var(--text-color-secondary); line-height: 1.4; margin-top: 4px; }
.err-alert { margin-top: 10px; }
</style>
