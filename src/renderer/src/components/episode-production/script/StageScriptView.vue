<template>
  <div class="stage-script">
    <!-- 页面内工具条：本 tab 的操作 -->
    <div class="script-toolbar">
      <div class="tb-left">
        <span class="tb-title">剧本</span>
        <el-tag v-if="scenes.length" size="small" round effect="plain" type="info">已拆 {{ scenes.length }} 场</el-tag>
        <el-tag v-if="hasScript" size="small" round effect="plain" :type="approved ? 'success' : 'warning'">
          {{ approved ? '已定稿' : '草稿' }}
        </el-tag>
      </div>
      <div class="tb-right">
        <el-button text size="small" :loading="identifying" @click="onIdentifyEntities">
          <el-icon><Aim /></el-icon>
          识别要素
        </el-button>
        <el-button text size="small" @click="openAppend('ai-continue')" :disabled="!hasScript">
          <el-icon><MagicStick /></el-icon>
          AI 续写
        </el-button>
        <el-button text size="small" @click="openAppend('manual-text')" :disabled="!hasScript">
          <el-icon><DocumentAdd /></el-icon>
          追加正文
        </el-button>
        <el-button text size="small" @click="textVisible = true" :disabled="!hasScript">
          <el-icon><Document /></el-icon>
          剧本全文
        </el-button>
        <el-button text size="small" :disabled="!hasScript" :loading="regenerating" @click="onRegenerate">
          <el-icon><Refresh /></el-icon>
          重新拆分
        </el-button>
      </div>
    </div>

    <!-- 主体：左侧场次导航 + 中央场景卡 -->
    <div class="script-body">
      <aside class="script-left">
        <SceneNav
          :scenes="scenes"
          :selected-scene-id="selectedSceneId"
          regenerable
          :regenerating-id="regeneratingSceneId"
          @select="onSelectScene"
          @regenerate="onRegenerateScene"
        />
      </aside>
      <main class="script-center">
        <!-- 空态：无剧本 -->
        <ScriptEmptyState v-if="!hasScript" :generating="generating" @generate="onGenerateScript" />
        <!-- 有剧本但无场景 -->
        <div v-else-if="scenes.length === 0" class="no-scenes">
          <el-empty description="已识别剧本，但还没有场景">
            <el-button type="primary" :loading="regenerating" @click="onRegenerate">
              <el-icon><Refresh /></el-icon>
              拆分场景
            </el-button>
          </el-empty>
        </div>
        <!-- 选中场景卡 -->
        <div v-else class="scene-wrap">
          <SceneCard
            v-if="selectedScene"
            :key="selectedScene.id"
            :scene="selectedScene"
            @saved="onSceneSaved"
          />
        </div>
      </main>
    </div>

    <!-- 追加剧本（增量增加内容 · 只追加不覆盖） -->
    <AppendScriptDialog
      v-model="appendVisible"
      :script-id="script?.id ?? null"
      :project-id="props.projectId"
      :existing-scene-count="scenes.length"
      :script-approved="approved"
      :default-mode="appendMode"
      @appended="onAppended"
    />

    <!-- 剧本全文（只读，确认追加结果用） -->
    <ScriptTextDialog
      v-model="textVisible"
      :script="script"
      :scene-count="scenes.length"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * M2 剧本页（tab 宿主内的完整左+中央工作区）。
 * 左侧：场次导航；中央：场景卡 / 空态。工具条：AI续写、追加正文、剧本全文、重新拆分。
 * 数据链路：getEpisode → scriptId → getScript + listScenes。agent data-changed 时刷新。
 *
 * 「继续增加剧本」：剧本常常没写完就先开机制作，后续要陆续往里加内容。
 * AI 续写 / 追加正文都走 AppendScriptDialog → ep:prepare-script-append（生成草稿，不落库）
 * → 用户预览确认 → ep:append-script（只追加：已有场次一行不动，新场次接在最后）。
 * 与之相对的「重新拆分」是覆盖式（会删掉已有场次），所以加了二次确认。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Aim,
  Document,
  DocumentAdd,
  MagicStick,
  Refresh,
} from '@element-plus/icons-vue'
import SceneNav from '@/components/episode-production/script/SceneNav.vue'
import SceneCard from '@/components/episode-production/script/SceneCard.vue'
import ScriptEmptyState from '@/components/episode-production/script/ScriptEmptyState.vue'
import AppendScriptDialog from '@/components/episode-production/script/AppendScriptDialog.vue'
import ScriptTextDialog from '@/components/episode-production/script/ScriptTextDialog.vue'
import type { ScriptAppendMode } from '@shared/types/episode-production'

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()

const emit = defineEmits<{
  (e: 'dataChanged', sections: string[]): void
}>()

const script = ref<any>(null)
const scenes = ref<any[]>([])
const selectedScene = ref<any>(null)
const generating = ref(false)
const regenerating = ref(false)
/** H9：「识别要素」手动入口（batchIdentifyEntities，需要项目 scriptModel） */
const identifying = ref(false)
/** S-06：正在局部重拆的场景 id（ep:regenerate-scene） */
const regeneratingSceneId = ref<string | null>(null)

/** 追加剧本弹窗 */
const appendVisible = ref(false)
const appendMode = ref<ScriptAppendMode>('ai-continue')
/** 剧本全文查看弹窗 */
const textVisible = ref(false)

const hasScript = computed(() => !!script.value)
const approved = computed(() => script.value?.status === 'approved')
const selectedSceneId = computed(() => selectedScene.value?.id ?? null)

async function load(): Promise<void> {
  if (!props.episodeId) { script.value = null; scenes.value = []; selectedScene.value = null; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  if (!ep.success || !ep.data?.scriptId) { script.value = null; scenes.value = []; selectedScene.value = null; return }
  const scriptResp = await window.electronAPI.episodeProduction.getScript(ep.data.scriptId)
  if (scriptResp.success) script.value = scriptResp.data

  const sceneResp = await window.electronAPI.episodeProduction.listScenes(ep.data.scriptId)
  if (sceneResp.success) {
    scenes.value = sceneResp.data || []
    if (scenes.value.length > 0 && !selectedScene.value) {
      selectedScene.value = scenes.value[0]
    }
  } else {
    scenes.value = []
  }
}

function onSelectScene(sc: any): void {
  selectedScene.value = sc
}

function onSceneSaved(): void {
  void load()
}

async function onGenerateScript(): Promise<void> {
  if (generating.value) return
  generating.value = true
  try {
    const r = await window.electronAPI.episodeProduction.generateScript(props.episodeId)
    if (r.success) {
      ElMessage.success('剧本已生成')
      await load()
    } else {
      ElMessage.error(r.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

async function onRegenerate(): Promise<void> {
  if (!script.value?.id || regenerating.value) return
  // 覆盖式操作：会删掉已有场次（连带其分镜 / 关键帧 / 视频），必须先确认
  try {
    await ElMessageBox.confirm(
      `重新拆分将**删除当前全部 ${scenes.value.length} 个场次**并重新生成，` +
        '这些场次上已有的分镜 / 关键帧 / 视频也会一并丢失。\n\n' +
        '如果你只是想接着往下增加剧本，请改用「AI 续写」或「追加正文」。',
      '重新拆分场景（覆盖式）',
      {
        type: 'warning',
        confirmButtonText: '仍要重新拆分',
        cancelButtonText: '取消',
        dangerouslyUseHTMLString: false,
      },
    )
  } catch {
    return
  }
  regenerating.value = true
  try {
    const r = await window.electronAPI.episodeProduction.generateScenes(script.value.id)
    if (r.success) {
      ElMessage.success('场景已重新拆分')
      selectedScene.value = null
      await load()
    } else {
      ElMessage.error(r.error || '拆分失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '拆分失败')
  } finally {
    regenerating.value = false
  }
}

/**
 * H9：「识别要素」手动入口（旧 Workbench ① 内容 stage 的「AI 识别要素」在 Studio 侧的对应物）。
 * 调 ep:batch-identify-entities（跨集去重创建/复用项目级 binding）。
 * 依赖项目 config.scriptModel；未配置时报错并引导到 Studio 顶栏「设置」。
 */
async function onIdentifyEntities(): Promise<void> {
  if (identifying.value || !props.episodeId) return
  identifying.value = true
  try {
    const proj = await window.electronAPI.episodeProduction.getProject(props.projectId)
    const sm = proj?.data?.config?.scriptModel
    if (!sm?.providerConfigId || !sm?.modelId) {
      ElMessage.warning('未配置剧本生成模型，无法识别要素；请点击 Studio 顶栏「设置」配置剧本生成模型后重试')
      return
    }
    const r = await window.electronAPI.episodeProduction.batchIdentifyEntities({
      projectId: props.projectId,
      episodeIds: [props.episodeId],
      providerConfigId: sm.providerConfigId,
      modelId: sm.modelId,
    })
    if (r.success) {
      const d = r.data as { characters?: number; locations?: number; items?: number } | undefined
      ElMessage.success(
        `要素识别完成：角色 ${d?.characters ?? 0}、地点 ${d?.locations ?? 0}、物品 ${d?.items ?? 0}`,
      )
      emit('dataChanged', ['assets'])
    } else {
      ElMessage.error(r.error || '要素识别失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '要素识别失败')
  } finally {
    identifying.value = false
  }
}

/**
 * S-06 场景级局部重拆（ep:regenerate-scene）：只重新生成该场景的结构化数据，
 * 其它场景不动。会作废该场景的分镜与片段（片段由后端 superseded 逻辑收敛），
 * 故二次确认。
 */
async function onRegenerateScene(sc: any): Promise<void> {
  if (regeneratingSceneId.value) return
  try {
    await ElMessageBox.confirm(
      `将重新生成场次 ${sc.sceneNumber}（${sc.location || '未命名地点'}）的结构化数据：` +
        '该场景现有的分镜会被删除作废，其所属视频片段也将失效（视频文件保留但不再参与合成）。' +
        '其它场景及其分镜、视频不受影响。继续？',
      '重新生成此场景',
      { type: 'warning', confirmButtonText: '仍要重新生成', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  regeneratingSceneId.value = sc.id
  try {
    const r = await (window.electronAPI.episodeProduction as any).regenerateScene(sc.id)
    if (r?.success) {
      ElMessage.success(`场次 ${sc.sceneNumber} 已重新生成（其分镜已作废，请到「分镜」页重新生成）`)
      const keepId = sc.id
      await load()
      // 重新选中该场景（id 不变，就地写回）
      selectedScene.value = scenes.value.find(s => s.id === keepId) ?? scenes.value[0] ?? null
    } else {
      ElMessage.error(r?.error || '重新生成场景失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '重新生成场景失败')
  } finally {
    regeneratingSceneId.value = null
  }
}

/** 打开追加剧本弹窗（AI 续写 / 追加正文 共用，mode 决定默认页签） */
function openAppend(mode: ScriptAppendMode): void {
  if (!hasScript.value) {
    ElMessage.warning('该剧集还没有剧本，请先用「AI 生成剧本」')
    return
  }
  appendMode.value = mode
  appendVisible.value = true
}

/** 追加成功：刷新剧本与场次，并选中第一个新增场次 */
async function onAppended(payload: { addedSceneCount: number }): Promise<void> {
  const before = scenes.value.length
  selectedScene.value = null
  await load()
  if (payload.addedSceneCount > 0 && scenes.value.length > before) {
    selectedScene.value = scenes.value[before]
  }
}

watch(() => props.episodeId, () => { selectedScene.value = null; void load() })
onMounted(() => void load())

</script>

<style lang="scss" scoped>
.stage-script {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.script-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  .tb-left { display: flex; align-items: center; gap: 8px; }
  .tb-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
  .tb-right { display: flex; align-items: center; gap: 4px; }
}

.script-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.script-left {
  width: 250px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  min-height: 0;
}

.script-center {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.scene-wrap { max-width: 820px; margin: 0 auto; }
.no-scenes { display: flex; align-items: center; justify-content: center; height: 100%; }
</style>
