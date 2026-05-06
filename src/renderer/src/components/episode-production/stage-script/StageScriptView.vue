<template>
  <!--
    StageScriptView · ③ 剧本 stage view（FU2 · spec §2.2 + §4.1）

    替换 V2 ScriptTabContent。新增功能：
    - "修复缺失角色绑定"按钮（FU1 ScriptBindingFixerService 接通）
    - "剧本定稿"按钮（spec §2.2 第 435 行 完成条件）
    - 场景卡片列表（spec §2.2 主区域形态）
    - ScriptCompletenessPanel（spec §4.1 完整性校验）
  -->
  <div class="stage-script-view">
    <div class="view-header">
      <h3 class="view-title">
        ③ 剧本
        <el-tag
          v-if="scriptStore.currentScript"
          :type="isApproved ? 'success' : 'warning'"
          size="small"
          class="header-status"
        >
          {{ isApproved ? '已定稿' : '草稿' }}
        </el-tag>
      </h3>
      <div class="view-actions">
        <el-button
          v-if="!scriptStore.currentScript"
          type="primary"
          :loading="generating"
          :disabled="!episodeStore.currentEpisode"
          @click="onGenerateScript"
        >
          <el-icon><MagicStick /></el-icon>
          AI 生成剧本
        </el-button>
        <el-button
          v-else
          :loading="generating"
          @click="onGenerateScript"
        >
          <el-icon><Refresh /></el-icon>
          重新生成
        </el-button>
        <el-button
          v-if="scriptStore.currentScript"
          :loading="fixingBindings"
          @click="onFixBindings"
          title="按 spec §4.1 强约束修复 scene.characters 缺失的 binding_id"
        >
          <el-icon><Connection /></el-icon>
          修复缺失绑定
        </el-button>
        <el-button
          v-if="scriptStore.currentScript && !isApproved"
          type="success"
          :loading="approving"
          @click="onApproveScript"
        >
          <el-icon><Check /></el-icon>
          剧本定稿
        </el-button>
      </div>
    </div>

    <div v-if="!episodeStore.currentEpisode" class="empty-state">
      <el-empty description="请先选择剧集" />
    </div>

    <div v-else-if="!scriptStore.currentScript" class="empty-state">
      <el-empty description="该剧集还没生成剧本，点击右上角'AI 生成剧本'" />
    </div>

    <div v-else class="content-row">
      <!-- 左侧场景列表 -->
      <div class="scene-list-panel">
        <h4 class="panel-title">
          场景 ({{ scriptStore.scenes.length }})
        </h4>
        <div class="scene-cards">
          <div
            v-for="(scene, idx) in scriptStore.scenes"
            :key="scene.id"
            class="scene-card"
            :class="{ active: selectedSceneId === scene.id }"
            @click="onSelectScene(scene.id)"
          >
            <div class="scene-header">
              <span class="scene-num">{{ idx + 1 }}</span>
              <span class="scene-loc">{{ scene.location ?? '未指定' }}</span>
            </div>
            <div class="scene-meta">
              <el-tag size="small" round>{{ scene.timeOfDay ?? '?' }}</el-tag>
              <el-tag size="small" round>{{ scene.weather ?? '?' }}</el-tag>
              <el-tag
                v-if="scene.locationType"
                size="small"
                round
                type="info"
              >{{ scene.locationType }}</el-tag>
            </div>
            <p class="scene-desc">{{ scene.sceneDescription }}</p>
          </div>
        </div>
      </div>

      <!-- 右侧详情 + 完整性面板 -->
      <div class="scene-detail-panel" v-if="selectedScene">
        <h4 class="panel-title">
          场景 {{ selectedSceneIndex + 1 }} 详情
        </h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="地点">
            {{ selectedScene.location ?? '未指定' }}
          </el-descriptions-item>
          <el-descriptions-item label="时间 / 天气">
            {{ selectedScene.timeOfDay ?? '?' }} / {{ selectedScene.weather ?? '?' }}
          </el-descriptions-item>
          <el-descriptions-item label="场景描述">
            {{ selectedScene.sceneDescription }}
          </el-descriptions-item>
          <el-descriptions-item v-if="selectedScene.mood" label="氛围">
            {{ selectedScene.mood }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 角色 -->
        <div class="detail-section">
          <h5>角色 ({{ sceneCharacters.length }})</h5>
          <div v-if="sceneCharacters.length === 0" class="empty-hint">
            该场景未识别到角色
          </div>
          <ul v-else class="char-list">
            <li v-for="(c, i) in sceneCharacters" :key="`c-${i}`">
              <strong>{{ c.characterName ?? '?' }}</strong>
              <el-tag
                v-if="c.characterBindingId"
                size="small"
                type="success"
                round
              >已绑定</el-tag>
              <el-tag v-else size="small" type="warning" round>缺 binding</el-tag>
              <span v-if="c.expression" class="char-attr">{{ c.expression }}</span>
              <span v-if="c.action" class="char-attr">{{ c.action }}</span>
            </li>
          </ul>
        </div>

        <!-- 旁白 -->
        <div v-if="selectedScene.narration" class="detail-section">
          <h5>旁白</h5>
          <p class="narration">{{ selectedScene.narration }}</p>
        </div>

        <!-- 对话 -->
        <div v-if="sceneDialogues.length > 0" class="detail-section">
          <h5>对话 ({{ sceneDialogues.length }})</h5>
          <ul class="dialogue-list">
            <li v-for="(d, i) in sceneDialogues" :key="`d-${i}`">
              <strong>{{ d.characterName ?? '?' }}</strong>
              <span v-if="d.emotion" class="char-attr">{{ d.emotion }}</span>
              <span class="dlg-text">{{ d.text }}</span>
            </li>
          </ul>
        </div>

        <!-- 完整性校验面板 -->
        <ScriptCompletenessPanel
          :episode-script-id="scriptStore.currentScript.id"
        />
      </div>

      <div v-else class="scene-detail-panel empty-detail">
        <el-empty description="点击左侧场景查看详情" :image-size="80" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * StageScriptView（FU2 · 替换 V2 ScriptTabContent）
 *
 * Props:
 *   - projectId: 项目 ID（用于 storyboardModel / imageModel 配置）
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Check,
  Connection,
  MagicStick,
  Refresh,
} from '@element-plus/icons-vue'
import {
  useEpEpisodeStore,
  useEpProjectStore,
  useEpScriptStore,
  useEpWorkbenchStore,
} from '@/stores/episode-production'
import ScriptCompletenessPanel from './ScriptCompletenessPanel.vue'

defineProps<{ projectId: string }>()

const episodeStore = useEpEpisodeStore()
const projectStore = useEpProjectStore()
const scriptStore = useEpScriptStore()
const workbenchStore = useEpWorkbenchStore()

const selectedSceneId = ref<string | null>(null)
const generating = ref(false)
const fixingBindings = ref(false)
const approving = ref(false)

const isApproved = computed(() => {
  return (scriptStore.currentScript as any)?.status === 'approved'
})

const selectedSceneIndex = computed(() =>
  scriptStore.scenes.findIndex((s: any) => s.id === selectedSceneId.value),
)

const selectedScene = computed(() => {
  return (
    (scriptStore.scenes.find(
      (s: any) => s.id === selectedSceneId.value,
    ) as any) ?? null
  )
})

const sceneCharacters = computed<any[]>(() => {
  const chars = (selectedScene.value as any)?.characters
  return Array.isArray(chars) ? chars : []
})

const sceneDialogues = computed<any[]>(() => {
  const dlgs = (selectedScene.value as any)?.dialogues
  return Array.isArray(dlgs) ? dlgs : []
})

function onSelectScene(id: string): void {
  selectedSceneId.value = id
}

async function onGenerateScript(): Promise<void> {
  const ep = episodeStore.currentEpisode
  if (!ep) return
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型')
    return
  }
  if (scriptStore.currentScript) {
    try {
      await ElMessageBox.confirm(
        '已有剧本将被覆盖，是否继续？',
        '重新生成剧本',
        { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  generating.value = true
  try {
    const result = await scriptStore.generateScript(
      ep.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (result) {
      ElMessage.success(`剧本生成成功，共 ${result.scenes.length} 个场景`)
    } else {
      ElMessage.error(workbenchStore.error || '剧本生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '剧本生成失败')
  } finally {
    generating.value = false
  }
}

async function onFixBindings(): Promise<void> {
  if (!scriptStore.currentScript) return
  const scriptId = scriptStore.currentScript.id
  fixingBindings.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.scanScriptBindings) {
      ElMessage.error('修复 IPC 未暴露')
      return
    }
    const scanResp = await api.scanScriptBindings(scriptId)
    if (!scanResp?.success) {
      throw new Error(scanResp?.error || '扫描失败')
    }
    const unbound = (scanResp.data?.unbound as any[]) ?? []
    if (unbound.length === 0) {
      ElMessage.success('剧本中所有角色引用都已绑定，无需修复')
      return
    }
    const uniqueNames = Array.from(
      new Set(unbound.map((u: any) => u.characterName)),
    )
    try {
      await ElMessageBox.confirm(
        `发现 ${unbound.length} 处未绑定引用，涉及角色：${uniqueNames.join(' / ')}\n\n` +
          '将自动按角色名匹配现有 binding，未匹配的自动创建 standalone binding。\n确认？',
        '修复缺失角色绑定',
        {
          type: 'warning',
          confirmButtonText: '修复',
          cancelButtonText: '取消',
        },
      )
    } catch {
      return
    }
    // 先按 name 匹配
    const fixResp = await api.fixScriptBindingsByName(scriptId)
    const matched = fixResp?.data?.matched ?? 0
    const stillUnbound = (fixResp?.data?.stillUnboundNames as string[]) ?? []
    let createdCount = 0
    let extraFilled = 0
    if (stillUnbound.length > 0) {
      const createResp = await api.createMissingScriptBindings(scriptId)
      createdCount = (createResp?.data?.created as any[])?.length ?? 0
      extraFilled = createResp?.data?.filled ?? 0
    }
    ElMessage.success(
      `修复完成：按名匹配 ${matched} 处${
        createdCount > 0 ? ` + 新建 ${createdCount} 个 binding 填回 ${extraFilled} 处` : ''
      }`,
    )
    // 重新加载剧本（让 scenes 反映最新 binding_id）
    if (episodeStore.currentEpisode) {
      await scriptStore.loadScript(scriptStore.currentScript.id)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '修复失败')
  } finally {
    fixingBindings.value = false
  }
}

async function onApproveScript(): Promise<void> {
  if (!scriptStore.currentScript) return
  approving.value = true
  try {
    // P4-T5: scene-script.service.validateCompleteness（IPC ep:validate-episode-script）
    const api = (window as any).electronAPI?.episodeProduction
    if (api?.validateEpisodeScript) {
      const valResp = await api.validateEpisodeScript(scriptStore.currentScript.id)
      if (!valResp?.success) {
        throw new Error(valResp?.error || '完整性校验失败')
      }
      const violations = (valResp.data?.violations as any[]) ?? []
      if (violations.length > 0) {
        try {
          await ElMessageBox.confirm(
            `剧本仍有 ${violations.length} 处违例（spec §4.1 强约束）。仍要定稿？\n\n` +
              violations.slice(0, 3).map((v: any) => `• ${v.message}`).join('\n'),
            '完整性未通过',
            { type: 'warning', confirmButtonText: '仍要定稿', cancelButtonText: '取消' },
          )
        } catch {
          return
        }
      }
    }
    // 调 episode-script update 改 status='approved'
    const updateApi = (window as any).electronAPI?.episodeProduction
    if (!updateApi?.updateScript) {
      ElMessage.error('updateScript IPC 未暴露')
      return
    }
    const resp = await updateApi.updateScript(
      scriptStore.currentScript.id,
      { status: 'approved' },
    )
    if (resp?.success) {
      ElMessage.success('剧本已定稿，可进入 ④ 分镜 stage')
      if (episodeStore.currentEpisode) {
        await scriptStore.loadScript(scriptStore.currentScript.id)
      }
    } else {
      ElMessage.error(resp?.error || '定稿失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '定稿失败')
  } finally {
    approving.value = false
  }
}

// 默认选第一个场景
watch(
  () => scriptStore.scenes,
  (sv) => {
    if (sv.length > 0 && !selectedSceneId.value) {
      selectedSceneId.value = (sv[0] as any).id
    } else if (sv.length === 0) {
      selectedSceneId.value = null
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.stage-script-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 12px;
  gap: 12px;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;

  .view-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;

    .header-status {
      margin-left: 8px;
    }
  }

  .view-actions {
    display: flex;
    gap: 6px;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-row {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.panel-title {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.scene-list-panel {
  width: 240px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.scene-cards {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--el-color-primary);
  }

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .scene-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;

    .scene-num {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--el-color-primary);
      color: #fff;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .scene-loc {
      font-size: 13px;
      font-weight: 500;
    }
  }

  .scene-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }

  .scene-desc {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--el-text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
}

.scene-detail-panel {
  flex: 1;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-detail {
  align-items: center;
  justify-content: center;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;

  h5 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .empty-hint {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    font-style: italic;
  }

  .narration {
    margin: 0;
    padding: 8px 10px;
    background: var(--el-fill-color-lighter);
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-regular);
  }
}

.char-list,
.dialogue-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    font-size: 12px;
    padding: 4px 8px;
    background: var(--el-fill-color-lighter);
    border-radius: 4px;

    .char-attr {
      font-size: 10px;
      color: var(--el-color-info);
      background: var(--el-color-info-light-9);
      padding: 1px 4px;
      border-radius: 2px;
    }

    .dlg-text {
      flex: 1;
      color: var(--el-text-color-regular);
    }
  }
}
</style>
