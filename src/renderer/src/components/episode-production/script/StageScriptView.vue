<template>
  <div class="stage-script">
    <!-- 页面内工具条：本 tab 的操作 -->
    <div class="script-toolbar">
      <div class="tb-left">
        <span class="tb-title">剧本</span>
        <el-tag v-if="scenes.length" size="small" round effect="plain" type="info">已拆 {{ scenes.length }} 场</el-tag>
      </div>
      <div class="tb-right">
        <el-button text size="small" @click="onAIWrite" :disabled="!hasScript">
          <el-icon><MagicStick /></el-icon>
          AI 续写
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
        <SceneNav :scenes="scenes" :selected-scene-id="selectedSceneId" @select="onSelectScene" />
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
  </div>
</template>

<script setup lang="ts">
/**
 * M2 剧本页（tab 宿主内的完整左+中央工作区）。
 * 左侧：场次导航；中央：场景卡 / 空态。工具条：AI续写、重新拆分。
 * 数据链路：getEpisode → scriptId → getScript + listScenes。agent data-changed 时刷新。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Refresh } from '@element-plus/icons-vue'
import SceneNav from '@/components/episode-production/script/SceneNav.vue'
import SceneCard from '@/components/episode-production/script/SceneCard.vue'
import ScriptEmptyState from '@/components/episode-production/script/ScriptEmptyState.vue'

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()

defineEmits<{
  (e: 'dataChanged', sections: string[]): void
}>()

const script = ref<any>(null)
const scenes = ref<any[]>([])
const selectedScene = ref<any>(null)
const generating = ref(false)
const regenerating = ref(false)

const hasScript = computed(() => !!script.value)
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

/** AI 续写：作为 agent 引导词，无法直达 agent 面板时提示（真实走 agent 会更好） */
function onAIWrite(): void {
  ElMessage.info('请在右侧「制作助手」输入你的续写需求')
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
