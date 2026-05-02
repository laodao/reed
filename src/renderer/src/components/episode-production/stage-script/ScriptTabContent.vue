<template>
  <div class="script-editor-new">
    <!-- 左侧场景导航 -->
    <div class="scene-nav-sidebar">
      <div class="sidebar-header">
        <h4>场景导航</h4>
        <el-button
          size="small"
          :loading="store.generating"
          :disabled="store.generating"
          @click="handleGenerateScript"
        >
          <el-icon><MagicStick /></el-icon>
          AI 生成剧本
        </el-button>
      </div>
      <div class="scene-nav-list">
        <div
          v-for="(scene, index) in store.scenes"
          :key="scene.id"
          class="scene-nav-item"
          :class="{ active: currentSceneIndex === index }"
          @click="scrollToScene(index)"
        >
          <div class="scene-nav-number">场景 {{ scene.sceneNumber }}</div>
          <div class="scene-nav-location">{{ scene.location }}</div>
          <div class="scene-nav-time">
            <el-tag size="small" type="info">{{ getLocationTypeLabel(scene.locationType) }}</el-tag>
            <el-tag size="small">{{ getTimeOfDayLabel(scene.timeOfDay) }}</el-tag>
          </div>
        </div>
        <el-empty v-if="store.scenes.length === 0" description="暂无场景" :image-size="60" />
      </div>
    </div>

    <!-- 右侧剧本正文显示区 -->
    <div class="script-content-area" ref="scriptContentRef">
      <div class="content-header">
        <h4>剧本正文</h4>
        <div class="header-actions">
          <el-button
            size="small"
            :loading="store.generating"
            :disabled="store.generating"
            @click="handleGenerateScenes"
            v-if="store.currentScript && !store.currentScript.scriptContent"
          >
            <el-icon><MagicStick /></el-icon>
            拆分场景
          </el-button>
        </div>
      </div>

      <div class="script-content-body">
        <template v-if="store.currentScript?.scriptContent">
          <div
            v-for="(scene, index) in store.scenes"
            :key="scene.id"
            :id="`scene-${index}`"
            class="scene-block"
            :class="{ active: currentSceneIndex === index }"
          >
            <div class="scene-header-line">
              {{ formatSceneHeader(scene) }}
            </div>
            <div
              class="scene-script-content"
              v-html="formatSceneScriptContent(scene, index)"
            ></div>
          </div>
        </template>
        <template v-else-if="store.currentScript">
          <div class="no-script-content">
            <el-empty description="剧本正文尚未生成" :image-size="120">
              <el-button type="primary" @click="handleGenerateScript" :loading="store.generating">
                生成完整剧本
              </el-button>
            </el-empty>
          </div>
        </template>
        <template v-else>
          <div class="no-script-content">
            <el-empty description="请先生成剧本" :image-size="120">
              <el-button type="primary" @click="handleGenerateScript" :loading="store.generating">
                AI 生成剧本
              </el-button>
            </el-empty>
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- 底部折叠：章节梗概 -->
  <el-collapse class="script-synopsis-collapse">
    <el-collapse-item title="章节梗概" name="synopsis">
      <el-input
        v-model="scriptSynopsisLocal"
        type="textarea"
        :rows="3"
        placeholder="输入或生成剧本概要..."
        @blur="saveScriptSynopsis"
      />
    </el-collapse-item>
  </el-collapse>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import type { SceneScript } from '../../../../../shared/types/story-to-video.types'

const props = defineProps<{
  projectId: string
}>()

const store = useStoryToVideoStore()

const scriptContentRef = ref<HTMLElement | null>(null)
const currentSceneIndex = ref(0)
const scriptSynopsisLocal = ref('')

// 同步外部 synopsis
watch(() => store.currentScript?.synopsis, (synopsis) => {
  if (synopsis !== undefined) {
    scriptSynopsisLocal.value = synopsis
  }
}, { immediate: true })

/**
 * 获取地点类型标签
 */
function getLocationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    interior: '内景',
    exterior: '外景',
    mixed: '混合'
  }
  return labels[type] || type
}

/**
 * 获取时间标签
 */
function getTimeOfDayLabel(time: string): string {
  const labels: Record<string, string> = {
    morning: '早晨',
    noon: '中午',
    afternoon: '下午',
    evening: '傍晚',
    night: '夜晚',
    dawn: '黎明',
    dusk: '黄昏'
  }
  return labels[time] || time
}

/**
 * 格式化场景标题
 */
function formatSceneHeader(scene: SceneScript): string {
  const typeLabel = scene.locationType === 'interior'
    ? 'INT.'
    : scene.locationType === 'exterior'
      ? 'EXT.'
      : 'INT./EXT.'
  const timeLabel = getTimeOfDayLabel(scene.timeOfDay)
  return `${typeLabel} ${scene.location} - ${timeLabel}`
}

/**
 * 构建分镜与剧本元素的映射关系
 */
function buildStoryboardMapping(sceneId: string): Map<string, number> {
  const mapping = new Map<string, number>()
  const sceneStoryboards = store.storyboards.filter(s => s.sceneScriptId === sceneId)
  for (const storyboard of sceneStoryboards) {
    for (const dialogueId of storyboard.dialogueIds) {
      mapping.set(dialogueId, storyboard.shotNumber)
    }
    for (const actionId of storyboard.actionIds) {
      mapping.set(actionId, storyboard.shotNumber)
    }
    if (storyboard.narrationId) {
      mapping.set(storyboard.narrationId, storyboard.shotNumber)
    }
  }
  return mapping
}

/**
 * 渲染分镜标签
 */
function renderStoryboardTag(shotNumber: number | undefined | null): string {
  if (!shotNumber) return ''
  return `<span class="storyboard-tag" data-shot="${shotNumber}">镜头 ${shotNumber}</span>`
}

/**
 * 格式化场景剧本内容
 */
function formatSceneScriptContent(scene: SceneScript, index: number): string {
  if (!store.currentScript?.scriptContent) {
    return `<p class="no-content">场景内容尚未生成</p>`
  }

  const fullContent = store.currentScript.scriptContent
  const sceneHeader = formatSceneHeader(scene)
  const nextSceneIndex = index + 1
  let nextSceneHeader = ''
  if (nextSceneIndex < store.scenes.length) {
    nextSceneHeader = formatSceneHeader(store.scenes[nextSceneIndex])
  }

  const headerIndex = fullContent.indexOf(sceneHeader)
  if (headerIndex === -1) {
    const altHeader = scene.locationType === 'interior'
      ? `INT. ${scene.location}`
      : scene.locationType === 'exterior'
        ? `EXT. ${scene.location}`
        : `INT./EXT. ${scene.location}`

    const altHeaderIndex = fullContent.indexOf(altHeader)
    if (altHeaderIndex !== -1) {
      let endIndex = fullContent.length
      if (nextSceneIndex < store.scenes.length) {
        const nextAltHeader = store.scenes[nextSceneIndex].locationType === 'interior'
          ? `INT. ${store.scenes[nextSceneIndex].location}`
          : store.scenes[nextSceneIndex].locationType === 'exterior'
            ? `EXT. ${store.scenes[nextSceneIndex].location}`
            : `INT./EXT. ${store.scenes[nextSceneIndex].location}`
        const nextIndex = fullContent.indexOf(nextAltHeader, altHeaderIndex + altHeader.length)
        if (nextIndex !== -1) endIndex = nextIndex
      }
      return formatScriptToHtml(fullContent.substring(altHeaderIndex, endIndex))
    }

    const storyboardMapping = buildStoryboardMapping(scene.id)
    return `<div class="fallback-content">
      ${scene.narration ? `<p class="narration">${scene.narration}${renderStoryboardTag(storyboardMapping.get('narration-' + scene.id))}</p>` : ''}
      ${scene.dialogues.map(d => `
        <div class="dialogue" data-dialogue-id="${d.id}">
          <span class="character-name">${d.characterName}</span>
          <span class="parenthetical">${d.emotion || ''}</span>
          <p class="text">${d.text}</p>
          ${renderStoryboardTag(storyboardMapping.get(d.id))}
        </div>
      `).join('')}
      ${scene.actions.map(a => `
        <div class="action" data-action-id="${a.id}">
          <p class="description">${a.description}</p>
          ${renderStoryboardTag(storyboardMapping.get(a.id))}
        </div>
      `).join('')}
    </div>`
  }

  let endIndex = fullContent.length
  if (nextSceneHeader && nextSceneIndex < store.scenes.length) {
    const nextIndex = fullContent.indexOf(nextSceneHeader, headerIndex + sceneHeader.length)
    if (nextIndex !== -1) endIndex = nextIndex
  }

  return formatScriptToHtml(fullContent.substring(headerIndex, endIndex))
}

/**
 * 将剧本文本格式化为 HTML
 */
function formatScriptToHtml(text: string): string {
  if (!text) return ''

  const shotTerms = [
    '特写', '远景', '全景', '中景', '近景', '大远景', '大特写',
    '细节特写', '中近景', '主观镜头', '跟拍', '摇镜头', '移镜头',
    '俯拍', '仰拍', '侧拍', '正面镜头', '背面镜头', '过肩镜头',
    '双人镜头', '三人镜头', '群像镜头', '定格', '慢动作', '快切'
  ]

  const lines = text.split('\n')
  const htmlLines: string[] = []
  let lastLineWasEmpty = false
  let lastLineWasCharacterName = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) {
      if (!lastLineWasEmpty) {
        htmlLines.push('<div class="empty-line"></div>')
        lastLineWasEmpty = true
      }
      lastLineWasCharacterName = false
      continue
    }

    lastLineWasEmpty = false

    if (line.match(/^(INT\.|EXT\.|INT\.\/EXT\.)/i)) {
      htmlLines.push(`<div class="scene-header-line">${escapeHtml(line)}</div>`)
      lastLineWasCharacterName = false
      continue
    }

    if (line.match(/^(CUT TO:|FADE OUT\.|FADE IN:|SMASH CUT TO:|DISSOLVE TO:)/i)) {
      htmlLines.push(`<div class="transition-line">${escapeHtml(line)}</div>`)
      lastLineWasCharacterName = false
      continue
    }

    if (line.match(/^\s{10,}[A-Z一-龥]+/)) {
      const charMatch = line.match(/^\s+(.+)$/)
      if (charMatch && charMatch[1].length < 20) {
        const characterName = charMatch[1]
        htmlLines.push(`<div class="character-name-line"><strong>${escapeHtml(characterName)}</strong>：</div>`)
        lastLineWasCharacterName = true
        continue
      }
    }

    if (line.match(/^\s{5,}\([^)]+\)\s*$/)) {
      htmlLines.push(`<div class="parenthetical-line">${escapeHtml(line.trim())}</div>`)
      lastLineWasCharacterName = false
      continue
    }

    if (line.match(/^\s{5,}/)) {
      if (lastLineWasCharacterName) {
        htmlLines.push(`<div class="dialogue-line">${escapeHtml(line.trim())}</div>`)
        continue
      }
    }

    if (line.length > 0) {
      let processedLine = escapeHtml(line)
      shotTerms.forEach(term => {
        const regex = new RegExp(`(${term})`, 'g')
        processedLine = processedLine.replace(regex, '<strong>$1</strong>')
      })
      htmlLines.push(`<p class="action-line">${processedLine}</p>`)
    }

    lastLineWasCharacterName = false
  }

  return htmlLines.join('\n')
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 滚动到指定场景
 */
function scrollToScene(index: number) {
  currentSceneIndex.value = index
  const element = document.getElementById(`scene-${index}`)
  const container = document.querySelector('.script-content-body')
  if (element && container) {
    container.scrollTo({
      top: (element as HTMLElement).offsetTop - 16,
      behavior: 'smooth'
    })
  }
  if (store.scenes[index]) {
    store.selectScene(store.scenes[index])
  }
}

/**
 * 保存剧本概要
 */
async function saveScriptSynopsis() {
  if (!store.currentScript) return
  await store.updateScript(store.currentScript.id, { synopsis: scriptSynopsisLocal.value })
}

/**
 * 生成剧本（AI）
 */
async function handleGenerateScript() {
  if (!store.currentProject) {
    ElMessage.warning('项目数据加载中，请稍候')
    return
  }
  if (!store.currentEpisode) {
    if (store.episodes.length === 0) {
      ElMessage.warning('请先在左侧面板添加剧集')
    } else {
      ElMessage.warning('请在左侧面板选择要生成剧本的剧集')
    }
    return
  }

  const scriptModel = store.currentProject.config?.scriptModel
  if (!scriptModel?.providerConfigId || !scriptModel?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型')
    return
  }

  if (store.currentEpisode.sourceType === 'outline' && !store.currentEpisode.outlineId) {
    ElMessage.warning('该剧集未关联章节，无法生成剧本')
    return
  }
  if (store.currentEpisode.sourceType === 'uploaded' && !store.currentEpisode.uploadedContent) {
    ElMessage.warning('该剧集没有上传长文内容，无法生成剧本')
    return
  }

  try {
    ElMessage.info('正在生成剧本，请稍候...')
    const result = await store.generateScript(
      store.currentEpisode.id,
      scriptModel.providerConfigId,
      scriptModel.modelId
    )

    if (result) {
      ElMessage.success(`剧本生成成功，共 ${result.scenes.length} 个场景`)
      scriptSynopsisLocal.value = result.script.synopsis

      await store.loadEpisodes(store.currentProject.id)
      const updatedEpisode = store.episodes.find(e => e.id === store.currentEpisode?.id)
      if (updatedEpisode) {
        await store.selectEpisode(updatedEpisode)
      }
    } else {
      ElMessage.error(store.error || '生成剧本失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成剧本失败')
  }
}

/**
 * 拆分场景（AI）
 */
async function handleGenerateScenes() {
  if (!store.currentScript) {
    ElMessage.warning('请先生成剧本')
    return
  }
  if (!store.selectedProviderConfigId || !store.selectedModelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  try {
    ElMessage.info('正在拆分场景，请稍候...')
    const result = await store.generateScenes(
      store.currentScript.id,
      store.selectedProviderConfigId,
      store.selectedModelId
    )

    if (result) {
      ElMessage.success(`场景拆分成功，共 ${result.length} 个场景`)
    } else {
      ElMessage.error(store.error || '拆分场景失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '拆分场景失败')
  }
}
</script>

<style scoped lang="scss">
.script-editor-new {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.scene-nav-sidebar {
  width: 200px;
  min-width: 180px;
  height: 100%;
  max-height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;

  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
  }
}

.scene-nav-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.scene-nav-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background-color 0.2s;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: var(--el-color-primary-light-9);
  }

  .scene-nav-number {
    font-size: 12px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .scene-nav-location {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .scene-nav-time {
    margin-top: 4px;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
}

.script-content-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;

  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
  }
}

.script-content-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.scene-block {
  margin-bottom: 24px;
  padding: 12px;
  border-radius: 6px;
  border-left: 3px solid var(--el-border-color-light);
  transition: border-color 0.2s;

  &.active {
    border-left-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.scene-header-line {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.scene-script-content {
  font-size: 13px;
  line-height: 1.8;

  :deep(.action-line) {
    margin: 4px 0;
    color: var(--el-text-color-regular);
  }

  :deep(.character-name-line) {
    text-align: center;
    font-size: 13px;
    margin: 8px 0 2px;
  }

  :deep(.dialogue-line) {
    padding: 0 20%;
    margin: 2px 0;
  }

  :deep(.parenthetical-line) {
    text-align: center;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-style: italic;
  }

  :deep(.transition-line) {
    text-align: right;
    font-style: italic;
    color: var(--el-text-color-secondary);
  }

  :deep(.storyboard-tag) {
    display: inline-block;
    padding: 1px 6px;
    background: var(--el-color-primary-light-8);
    color: var(--el-color-primary);
    border-radius: 3px;
    font-size: 11px;
    margin-left: 6px;
    vertical-align: middle;
  }

  :deep(.empty-line) {
    height: 8px;
  }
}

.no-script-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.script-synopsis-collapse {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-light);

  :deep(.el-collapse-item__header) {
    padding: 0 16px;
    height: 36px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  :deep(.el-collapse-item__content) {
    padding: 12px 16px;
  }
}
</style>
