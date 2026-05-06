<template>
  <!--
    StageScriptViewV2 · ③ 剧本（FU5-D1 / 原型 §6）

    严格按对照表 §6 cell 表 10 条差异 + spec §4.1 实施：
    - StageMainHeader 副标题（场景数 / 对白数 / 动作数 / 引用解析率）+ 重写 / 完成 actions
    - 章节梗概 panel（EntityRefRenderer 渲染 @ 引用）
    - 场景列表：场景卡可折叠
      - header（primary-light）：场景 N · 📍 @地点 · 时间 · 天气 · 出场 @人物 · 编辑/展开
      - body（展开时）：原文 / 旁白 / 对话 × N / 动作 × N（4 类色彩区分）
    - 添加场景按钮（dashed border）
    - 完整性 success-banner + → 进入 ④ 分镜

    复用：FU5-A2 EntityRefRenderer / A3 StageMainHeader / A5 AssetSourceTag
  -->
  <div class="stage-script-v2">
    <StageMainHeader title="③ 剧本编辑" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          v-if="!script"
          type="primary"
          :loading="generating"
          :disabled="!episodeStore.currentEpisode"
          @click="onGenerateScript"
        >
          <el-icon><MagicStick /></el-icon>
          AI 生成剧本
        </el-button>
        <template v-else>
          <el-button :loading="generating" @click="onGenerateScript">
            <el-icon><Refresh /></el-icon>
            <span>✨ AI 重写场景</span>
          </el-button>
          <el-button
            v-if="!isApproved"
            :loading="fixingBindings"
            @click="onFixBindings"
          >
            <el-icon><Connection /></el-icon>
            修复缺失绑定
          </el-button>
          <el-button
            v-if="!isApproved"
            type="success"
            :loading="approving"
            :disabled="!canComplete"
            @click="onApprove"
          >
            <el-icon><Check /></el-icon>
            完成本阶段 → ④ 分镜
          </el-button>
          <el-tag v-else type="success" effect="light" round>已定稿</el-tag>
        </template>
      </template>
    </StageMainHeader>

    <div v-if="!episodeStore.currentEpisode" class="empty-state">
      <el-empty description="请先选择剧集" />
    </div>

    <div v-else-if="!script" class="empty-state">
      <el-empty description="该剧集还没生成剧本，点右上角 AI 生成剧本" />
    </div>

    <div v-else class="content-body">
      <!-- 章节梗概 panel（§6.B P0） -->
      <section class="panel synopsis-panel">
        <header class="panel-header">
          <span class="panel-title">章节梗概</span>
          <el-button size="small" :loading="regenSynopsis" @click="onRegenSynopsis">
            <el-icon><Refresh /></el-icon>
            ✨ AI 重新生成
          </el-button>
        </header>
        <div v-if="synopsisDraft" class="synopsis-body">
          <EntityRefRenderer
            :text="synopsisDraft"
            :entities="entityList"
            @click-entity="onEntityClick"
          />
        </div>
        <div v-else class="synopsis-empty">
          梗概为空 — 点上方"重新生成"或在 ① 内容 stage 完成识别后自动生成
        </div>
      </section>

      <!-- 场景列表 -->
      <section class="panel scene-list-panel">
        <header class="panel-header">
          <span class="panel-title">场景列表（{{ scenes.length }}）</span>
          <el-button size="small" @click="onAddScene">
            <el-icon><Plus /></el-icon>
            添加场景
          </el-button>
        </header>

        <div v-if="scenes.length === 0" class="empty-hint">
          还没场景 — 点 + 添加场景 或上方 AI 生成剧本
        </div>

        <div v-else class="scenes">
          <article
            v-for="(scene, idx) in scenes"
            :key="scene.id"
            class="scene-card"
            :class="{ expanded: expandedSceneIds.has(scene.id) }"
          >
            <header class="scene-header" @click="toggleExpand(scene.id)">
              <span class="scene-num">场景 {{ idx + 1 }}</span>
              <span class="scene-meta">
                📍 <EntityRefRenderer
                  v-if="scene.location"
                  :text="`@${scene.location}`"
                  :entities="entityList"
                />
                <template v-else>未指定地点</template>
                <template v-if="scene.timeOfDay || scene.weather">
                  <span class="meta-sep">·</span>
                  <span>{{ scene.timeOfDay ?? '?时' }} · {{ scene.weather ?? '?气' }}</span>
                </template>
              </span>
              <span class="scene-cast">
                出场:
                <template v-if="sceneCastNames(scene).length === 0">
                  <span class="hint-tertiary">未识别</span>
                </template>
                <EntityRefRenderer
                  v-else
                  :text="sceneCastNames(scene).map(n => `@${n}`).join(' ')"
                  :entities="entityList"
                />
              </span>
              <span class="header-spacer" />
              <el-button size="small" text @click.stop="onEditScene(scene.id)">编辑</el-button>
              <el-icon class="expand-icon">
                <ArrowDown v-if="expandedSceneIds.has(scene.id)" />
                <ArrowRight v-else />
              </el-icon>
            </header>

            <div v-if="expandedSceneIds.has(scene.id)" class="scene-body">
              <!-- 原文（来自长文）-->
              <div v-if="scene.originalText" class="content-row content-row-original">
                <span class="content-label">原文</span>
                <span class="content-text muted">{{ scene.originalText }}</span>
              </div>

              <!-- 旁白 -->
              <div v-if="scene.narration" class="content-row content-row-narration">
                <span class="content-label">旁白</span>
                <span class="content-text">
                  <EntityRefRenderer :text="scene.narration" :entities="entityList" />
                </span>
              </div>

              <!-- 对话 × N -->
              <div
                v-for="(d, di) in sceneDialogues(scene)"
                :key="`d-${scene.id}-${di}`"
                class="content-row content-row-dialogue"
              >
                <span class="content-label">对话</span>
                <span class="content-text">
                  <strong>
                    <EntityRefRenderer
                      :text="`@${d.characterName ?? '?'}`"
                      :entities="entityList"
                    />
                  </strong>
                  <span v-if="d.emotion" class="char-attr">· {{ d.emotion }}</span>
                  <span class="dlg-text">· "{{ d.text }}"</span>
                </span>
              </div>

              <!-- 动作 × N -->
              <div
                v-for="(a, ai) in sceneActions(scene)"
                :key="`a-${scene.id}-${ai}`"
                class="content-row content-row-action"
              >
                <span class="content-label">动作</span>
                <span class="content-text">
                  <EntityRefRenderer :text="a.description ?? a.text ?? ''" :entities="entityList" />
                </span>
              </div>

              <!-- 角色出场不带行动 / 表情 attr 时也展示一下 -->
              <div
                v-for="(c, ci) in sceneOnlyCharacters(scene)"
                :key="`c-${scene.id}-${ci}`"
                class="content-row content-row-character"
              >
                <span class="content-label">角色</span>
                <span class="content-text">
                  <EntityRefRenderer
                    :text="`@${c.characterName ?? '?'}`"
                    :entities="entityList"
                  />
                  <el-tag
                    v-if="c.characterBindingId"
                    size="small"
                    type="success"
                    round
                    style="margin-left: 4px"
                  >已绑定</el-tag>
                  <el-tag v-else size="small" type="warning" round style="margin-left: 4px">缺 binding</el-tag>
                  <span v-if="c.expression" class="char-attr">· {{ c.expression }}</span>
                  <span v-if="c.action" class="char-attr">· {{ c.action }}</span>
                </span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- 完整性 success-banner（§6.E P1） -->
      <ScriptCompletenessPanel
        v-if="script"
        :episode-script-id="script.id"
        @jump-to-scene="onJumpToScene"
        @fix-violation="onFixViolation"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ArrowRight,
  Check,
  Connection,
  MagicStick,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'
import type { EntityRefMeta } from '../shared/entity-ref-parser'
import ScriptCompletenessPanel from '../stage-script/ScriptCompletenessPanel.vue'
import {
  useEpEpisodeStore,
  useEpProjectStore,
  useEpScriptStore,
  useEpAssetStore,
} from '@/stores/episode-production'

const props = defineProps<{
  projectId: string
}>()

/**
 * FU6-T4 剧本完整性"去修复"事件向工作台抛：
 *   - go-asset-stage：主图类违例 → 工作台切到 ② 资产 + 选中对应 binding
 *   - jump-to-scene：binding 类 / 声音类 → 滚动到对应场景（本地处理）
 */
const emit = defineEmits<{
  (
    e: 'go-asset-stage',
    payload: { kind: 'character' | 'location' | 'item' | 'voice'; bindingId?: string },
  ): void
}>()

const episodeStore = useEpEpisodeStore()
const projectStore = useEpProjectStore()
const scriptStore = useEpScriptStore()
const assetStore = useEpAssetStore()

const generating = ref(false)
const approving = ref(false)
const fixingBindings = ref(false)
const regenSynopsis = ref(false)

const expandedSceneIds = ref<Set<string>>(new Set())

const script = computed(() => scriptStore.currentScript)
const scenes = computed(() => scriptStore.scenes ?? [])

const isApproved = computed(() => (script.value as any)?.status === 'approved')

const synopsisDraft = computed(() => (script.value as any)?.synopsis ?? '')

// 实体字典：用项目下所有 binding（character/location/item）
const entityList = computed<EntityRefMeta[]>(() => {
  const list: EntityRefMeta[] = []
  for (const b of assetStore.epAssetCharacters ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  for (const b of assetStore.epAssetLocations ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? (b as any).locationName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  for (const b of assetStore.epAssetItems ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? (b as any).itemName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  return list
})

const headerSubtitle = computed(() => {
  if (!script.value) return '从 ① 内容 stage 已确认要素生成剧本，含场景 / 对白 / 动作 / 实体引用'
  const sceneCount = scenes.value.length
  let dialogueCount = 0
  let actionCount = 0
  let resolvedRefs = 0
  let totalRefs = 0
  for (const s of scenes.value) {
    const d = (s as any).dialogues
    const a = (s as any).actions
    if (Array.isArray(d)) dialogueCount += d.length
    if (Array.isArray(a)) actionCount += a.length
    const cs = (s as any).characters
    if (Array.isArray(cs)) {
      for (const c of cs) {
        totalRefs++
        if (c.characterBindingId) resolvedRefs++
      }
    }
  }
  const pct = totalRefs === 0 ? 100 : Math.floor((resolvedRefs / totalRefs) * 100)
  return `${sceneCount} 场景 · ${dialogueCount} 段对白 · ${actionCount} 个动作 · 实体引用 ${pct}% 解析`
})

const canComplete = computed(() => scenes.value.length > 0)

function sceneDialogues(scene: any): any[] {
  return Array.isArray(scene.dialogues) ? scene.dialogues : []
}

function sceneActions(scene: any): any[] {
  return Array.isArray(scene.actions) ? scene.actions : []
}

function sceneCastNames(scene: any): string[] {
  const cs = scene.characters
  if (!Array.isArray(cs)) return []
  return Array.from(
    new Set(cs.map((c: any) => c.characterName).filter((n: any): n is string => !!n)),
  )
}

/** 角色 entry 不属于 dialogue / action 时单独渲染（避免重复显示） */
function sceneOnlyCharacters(scene: any): any[] {
  const cs = scene.characters
  if (!Array.isArray(cs)) return []
  return cs.filter((c: any) => !c.action && !c.expression) // 默认放角色出场
}

function toggleExpand(id: string): void {
  const next = new Set(expandedSceneIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedSceneIds.value = next
}

function onEntityClick(meta: EntityRefMeta): void {
  ElMessage.info(`点 @${meta.name}（${meta.sourceType}） — phase F 接 sidebar drawer`)
}

async function onGenerateScript(): Promise<void> {
  const ep = episodeStore.currentEpisode
  if (!ep) return
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型')
    return
  }
  if (script.value) {
    try {
      await ElMessageBox.confirm('已有剧本将被覆盖，是否继续？', '重新生成剧本', {
        type: 'warning',
        confirmButtonText: '重新生成',
        cancelButtonText: '取消',
      })
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
      ElMessage.success('剧本已生成')
      await scriptStore.loadScript(result.id)
    } else {
      ElMessage.error('生成失败')
    }
  } finally {
    generating.value = false
  }
}

/*
 * FU8-C4 章节梗概重生成：
 *   后端 generateScript(episodeId) 是覆盖式（重写 synopsis + 重建 scenes）。
 *   "只重生成梗概"无独立 IPC（后端 AI service 没拆出 regenerateSynopsis），
 *   所以这里诚实告知 user：会同时重建场景，让 user 自己决定。
 *   接受后走 onGenerateScript 同一路径，复用全部生成 + 状态同步。
 */
async function onRegenSynopsis(): Promise<void> {
  if (!script.value) {
    await onGenerateScript()
    return
  }
  try {
    await ElMessageBox.confirm(
      '章节梗概重生成会重新拆解整集剧本，已有的场景修改将被覆盖。\n如果只想微调梗概文字，建议直接编辑现有梗概块。\n\n仍要让 AI 重新生成？',
      '重生成梗概',
      {
        type: 'warning',
        confirmButtonText: '重新生成（覆盖）',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  regenSynopsis.value = true
  try {
    await onGenerateScript()
  } finally {
    regenSynopsis.value = false
  }
}

async function onFixBindings(): Promise<void> {
  if (!script.value) return
  fixingBindings.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.fixScriptBindingsByName?.(script.value.id)
    if (resp?.success) {
      ElMessage.success(`已修复 ${resp.data?.fixed ?? 0} 处 binding`)
      await scriptStore.loadScript(script.value.id)
    } else {
      ElMessage.error(resp?.error || '修复失败')
    }
  } finally {
    fixingBindings.value = false
  }
}

async function onApprove(): Promise<void> {
  if (!script.value) return
  approving.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.updateScript?.(script.value.id, { status: 'approved' })
    if (resp?.success) {
      ElMessage.success('已定稿 → 可进入 ④ 分镜')
      await scriptStore.loadScript(script.value.id)
    } else {
      ElMessage.error(resp?.error || '定稿失败')
    }
  } finally {
    approving.value = false
  }
}

/*
 * FU8-C3 手动添加场景：
 *   弹两步 prompt 输地点 + 时间，调 ep:create-scene 落库（自动追加 sceneNumber），
 *   reload 后让 user 在新场景上点"编辑"细化。
 */
async function onAddScene(): Promise<void> {
  if (!script.value?.id) {
    ElMessage.warning('请先生成剧本')
    return
  }
  let location = ''
  let timeOfDay: 'day' | 'night' | 'dawn' | 'dusk' = 'day'
  try {
    const r1 = await ElMessageBox.prompt('请输入新场景的地点名称（可后续细化）', '添加场景 (1/2)', {
      confirmButtonText: '下一步',
      cancelButtonText: '取消',
      inputPattern: /^.{1,80}$/,
      inputErrorMessage: '地点必填，最多 80 字符',
    })
    location = String(r1.value ?? '').trim()
    const r2 = await ElMessageBox.prompt('时间段（day / night / dawn / dusk，默认 day）', '添加场景 (2/2)', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: 'day',
      inputPattern: /^(day|night|dawn|dusk)$/,
      inputErrorMessage: '只能是 day / night / dawn / dusk 之一',
    })
    timeOfDay = r2.value as typeof timeOfDay
  } catch {
    return
  }
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.createScene) {
    ElMessage.error('createScene IPC 不可用')
    return
  }
  const resp = await api.createScene(script.value.id, { location, timeOfDay })
  if (!resp?.success) {
    ElMessage.error(resp?.error || '创建场景失败')
    return
  }
  ElMessage.success(`已添加场景：${location}`)
  await scriptStore.loadScript(script.value.id)
}

/*
 * FU8-C3-minor 单场景"编辑"：弹 prompt 让 user 改地点（最常被改）；
 * 完整 dialog（含 mood/lighting/characters）留下 follow-up。
 */
async function onEditScene(id: string): Promise<void> {
  const scene = scenes.value.find((s: any) => s.id === id)
  if (!scene) {
    ElMessage.error('场景未找到')
    return
  }
  let location: string
  try {
    const r = await ElMessageBox.prompt('修改地点名称', `编辑场景 #${(scene as any).sceneNumber}`, {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: (scene as any).location ?? '',
      inputPattern: /^.{1,80}$/,
      inputErrorMessage: '地点必填，最多 80 字符',
    })
    location = String(r.value ?? '').trim()
  } catch {
    return
  }
  const api = (window as any).electronAPI?.episodeProduction
  const resp = await api?.updateScene?.(id, { location })
  if (!resp?.success) {
    ElMessage.error(resp?.error || '更新场景失败')
    return
  }
  ElMessage.success('场景已更新')
  if (script.value?.id) await scriptStore.loadScript(script.value.id)
}

/* FU6-T4 jump-to-scene：滚动到该场景 + 自动展开 */
function onJumpToScene(sceneScriptId: string): void {
  expandedSceneIds.value.add(sceneScriptId)
  // DOM 滚动：场景 article 的 id 由 sceneScriptId 标记，这里宽松查找
  // 按 data-scene-id 优先；找不到再回退普通 id 选择器
  // 等下一帧再 query 让 article 已经处于展开状态
  requestAnimationFrame(() => {
    const target =
      document.querySelector(`[data-scene-id="${sceneScriptId}"]`) ??
      document.getElementById(sceneScriptId)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

/*
 * FU6-T4 完整性违例修复路由：
 *   - 主图类（*_MAIN_IMAGE_MISSING）→ 通知工作台切 ② 资产，选中对应 binding 让 user 生成主图
 *   - 声音类（DIALOGUE_VOICE_MISSING）→ 跳到对应场景 + 提示在场景对话行绑声音
 *   - 绑定类（*_BINDING_MISSING / *_UNRESOLVED）→ 跳到对应场景 + 提示打开对应 picker
 *
 * 完整 picker 自动展开依赖 SceneEditor 改造（follow-up），本 task 把"去哪里修"
 * 这一步打通：明确动作 + 视觉定位 + 提示动作目标，user 不再迷茫。
 */
interface CompletenessViolation {
  level: 'error' | 'warning'
  code: string
  message: string
  sceneScriptId: string
  sceneNumber: number
  context: { targetType: string; targetId?: string; bindingId?: string }
}

function onFixViolation(v: CompletenessViolation): void {
  const code = v.code
  // 主图类 → 切 ② 资产 stage
  if (code.endsWith('_MAIN_IMAGE_MISSING')) {
    const kindMap: Record<string, 'character' | 'location' | 'item'> = {
      LOCATION_MAIN_IMAGE_MISSING: 'location',
      CHARACTER_MAIN_IMAGE_MISSING: 'character',
      PROP_MAIN_IMAGE_MISSING: 'item',
    }
    const kind = kindMap[code]
    const bindingId = v.context.bindingId
    if (kind) {
      emit('go-asset-stage', { kind, bindingId })
      ElMessage.info(`已切到 ② 资产，请在${kind === 'character' ? '角色' : kind === 'location' ? '地点' : '物品'}卡片点"生成主图"`)
      return
    }
  }
  // 声音类 → 跳到场景 + 提示
  if (code === 'DIALOGUE_VOICE_MISSING') {
    onJumpToScene(v.sceneScriptId)
    ElMessage.info('请在该场景对话行点击"绑声音"，从已复刻音色中选取')
    return
  }
  // 绑定类（含 unresolved）→ 跳到场景 + 按目标类型给提示
  onJumpToScene(v.sceneScriptId)
  if (code.startsWith('CHARACTER_') || code.startsWith('DIALOGUE_CHARACTER') || code.startsWith('ACTION_CHARACTER')) {
    ElMessage.info('请在该场景的角色行点击"绑定角色"选择已存在角色，或先去 ② 资产新建')
  } else if (code.startsWith('LOCATION_')) {
    ElMessage.info('请在该场景头部点击"绑定地点"选择，或先去 ② 资产新建地点')
  } else if (code.startsWith('PROP_')) {
    ElMessage.info('请在该场景的道具行绑定，或先去 ② 资产新建物品')
  } else {
    ElMessage.info('请在场景内点击对应行的绑定按钮完成修复')
  }
}

watch(
  () => props.projectId,
  () => {
    if (props.projectId) {
      void assetStore.loadAssetsByProject(props.projectId)
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.stage-script-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-body {
  flex: 1;
  overflow: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.synopsis-panel .synopsis-body {
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--el-text-color-regular);
}

.synopsis-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.scenes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.scene-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.scene-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  cursor: pointer;
  font-size: 13px;
  flex-wrap: wrap;
}

.scene-card.expanded .scene-header {
  background: var(--el-color-primary-light-8);
}

.scene-num {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.scene-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-regular);
}

.scene-cast {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.meta-sep {
  color: var(--el-text-color-placeholder);
  margin: 0 4px;
}

.header-spacer {
  flex: 1;
}

.expand-icon {
  font-size: 14px;
  color: var(--el-text-color-placeholder);
}

.scene-body {
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--el-bg-color);
}

.content-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  line-height: 1.7;
}

.content-label {
  flex-shrink: 0;
  display: inline-block;
  width: 50px;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding-top: 2px;
}

.content-row-original .content-label {
  color: var(--el-text-color-placeholder);
}
.content-row-narration .content-label {
  color: var(--el-color-primary);
}
.content-row-dialogue .content-label {
  color: var(--el-color-success);
}
.content-row-action .content-label {
  color: var(--el-color-warning);
}
.content-row-character .content-label {
  color: var(--el-text-color-secondary);
}

.content-text {
  flex: 1;
  min-width: 0;
}

.content-text.muted {
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.char-attr {
  margin-left: 4px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.dlg-text {
  margin-left: 4px;
}

.empty-hint {
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 16px;
  font-style: italic;
}

.hint-tertiary {
  color: var(--el-text-color-placeholder);
}
</style>
