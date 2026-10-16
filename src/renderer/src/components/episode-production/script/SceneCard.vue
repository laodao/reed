<template>
  <div class="scene-card">
    <!-- 场景标题 -->
    <div class="scene-head">
      <span class="scene-no">S{{ scene.sceneNumber }}</span>
      <h2 class="scene-title">{{ scene.location || `场景 ${scene.sceneNumber}` }}</h2>
      <div class="scene-tags">
        <el-tag v-if="scene.mood" size="small" effect="plain" round>{{ scene.mood }}</el-tag>
        <el-tag v-if="scene.timeOfDay" size="small" effect="plain" round>{{ timeLabel(scene.timeOfDay) }}</el-tag>
        <el-tag v-if="scene.locationType" size="small" effect="plain" round>{{ scene.locationType === 'interior' ? '内景' : '外景' }}</el-tag>
      </div>
    </div>

    <!-- 场景描述 / 情境 -->
    <div class="scene-block desc-block">
      <div class="block-label">镜头提示 / 情境描述</div>
      <el-input
        v-model="localDesc"
        type="textarea"
        :rows="3"
        resize="none"
        class="desc-input"
        placeholder="场景视觉描述…"
        @blur="onSaveDesc"
      />
      <div v-if="scene.lighting" class="lighting-note"><el-icon><Sunny /></el-icon> {{ scene.lighting }}</div>
    </div>

    <!-- 旁白 -->
    <div v-if="scene.narration" class="scene-block narration">
      <div class="block-label">旁白</div>
      <p class="narration-text">{{ scene.narration }}</p>
    </div>

    <!-- 角色块：逐个角色 + 对白 + 动作 -->
    <div v-if="characters.length > 0" class="scene-block char-block">
      <div class="block-label">出场角色</div>
      <div v-for="ch in characters" :key="ch.characterId || ch.characterName" class="char-item">
        <div class="char-line">
          <span class="char-name">{{ ch.characterName || '未知角色' }}</span>
          <span v-if="ch.outfit" class="char-desc">({{ ch.outfit }})</span>
          <span v-if="ch.expression" class="char-desc">({{ ch.expression }})</span>
          <span v-if="ch.action" class="char-action">【{{ ch.action }}】</span>
        </div>
        <!-- 该角色的对白 -->
        <div v-for="d in dialoguesFor(ch)" :key="d.id" class="dialogue-line">
          <span class="dlg-text">「{{ d.text }}」</span>
          <span v-if="d.emotion" class="dlg-emotion">({{ d.emotion }})</span>
        </div>
      </div>
    </div>

    <!-- 动作（镜头级） -->
    <div v-if="actions.length > 0" class="scene-block action-block">
      <div class="block-label">动作 / 镜头</div>
      <div v-for="a in actions" :key="a.id" class="action-line">
        <span v-if="a.characterName" class="action-char">{{ a.characterName }}：</span>
        <span class="action-desc">{{ a.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M2 剧本页 · 中央场景卡。
 * 展示 镜头提示/情境描述 + 旁白 + 出场角色（含对白）+ 动作。场景描述支持行内编辑保存（update-scene）。
 */
import { ref, computed, watch } from 'vue'
import { Sunny } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  scene: any
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const localDesc = ref(props.scene.sceneDescription || '')
watch(() => props.scene.sceneDescription, (v) => { localDesc.value = v || '' })

const characters = computed(() => props.scene.characters || [])
const actions = computed(() => props.scene.actions || [])

function dialoguesFor(ch: any): any[] {
  const dialogs = props.scene.dialogues || []
  // 按角色名或 characterId 过滤
  return dialogs.filter((d: any) =>
    (ch.characterId && d.characterId && d.characterId === ch.characterId) ||
    (d.characterName && d.characterName === ch.characterName),
  )
}

function timeLabel(t: string): string {
  const map: Record<string, string> = { morning: '清晨', noon: '正午', afternoon: '午后', evening: '傍晚', night: '夜晚' }
  return map[t] || t
}

async function onSaveDesc(): Promise<void> {
  if (localDesc.value === (props.scene.sceneDescription || '')) return
  const resp = await window.electronAPI.episodeProduction.updateScene(props.scene.id, { sceneDescription: localDesc.value })
  if (resp.success) {
    ElMessage.success('已保存')
    emit('saved')
  } else {
    ElMessage.error(resp.error || '保存失败')
  }
}
</script>

<style lang="scss" scoped>
.scene-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
  width: 100%;
}

.scene-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color-lighter);
  .scene-no {
    font-size: 12px; font-weight: 700; color: var(--color-primary);
    background: var(--color-primary-light-9); padding: 3px 8px; border-radius: 6px;
  }
  .scene-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-color-primary); }
  .scene-tags { display: flex; gap: 6px; margin-left: auto; }
}

.scene-block { margin-top: 16px; }
.block-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
  letter-spacing: .3px;
}

.desc-input {
  :deep(.el-textarea__inner) { font-size: 13px; line-height: 1.8; }
}

.lighting-note {
  display: flex; align-items: center; gap: 6px;
  margin-top: 8px; font-size: 12px; color: var(--text-color-secondary);
}

.narration .narration-text {
  margin: 0; font-size: 14px; line-height: 1.8; color: var(--text-color-regular);
  background: var(--fill-color-lighter);
  padding: 10px 14px; border-radius: 8px;
}

.char-block .char-item {
  padding: 10px 0;
  border-bottom: 1px dashed var(--border-color-lighter);
  &:last-child { border-bottom: none; }
}
.char-line { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.char-name { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
.char-desc { font-size: 12px; color: var(--text-color-secondary); }
.char-action { font-size: 12px; color: var(--color-primary); }
.dialogue-line {
  margin: 6px 0 0 14px;
  font-size: 14px; line-height: 1.7; color: var(--text-color-regular);
  .dlg-text { color: var(--text-color-regular); }
  .dlg-emotion { font-size: 12px; color: var(--text-color-placeholder); margin-left: 4px; }
}

.action-block .action-line {
  margin: 4px 0; font-size: 13px; line-height: 1.6; color: var(--text-color-regular);
  .action-char { color: var(--color-primary); font-weight: 500; }
}
</style>
