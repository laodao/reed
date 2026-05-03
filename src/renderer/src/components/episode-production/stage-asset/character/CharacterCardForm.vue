<template>
  <el-card class="character-card-form" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">📋 设定卡</span>
        <el-tag v-if="binding" :type="isLinkedLw ? 'primary' : 'warning'" size="small" effect="plain">
          {{ isLinkedLw ? 'linked_lw' : 'standalone' }}
        </el-tag>
      </div>
    </template>

    <el-form
      v-loading="loading"
      label-position="top"
      size="small"
      class="form-body"
      @submit.prevent
    >
      <!-- 名称 -->
      <el-form-item label="名称">
        <div v-if="isLinkedLw" class="lw-hint-row">
          <span class="lw-hint">基础值 (lw): {{ lwHintPlaceholder }}</span>
          <el-button text type="primary" @click="onToggleOverride('name')">
            {{ overrideEnabled.name ? '取消 override' : '+ override' }}
          </el-button>
        </div>
        <el-input
          v-model="form.name"
          placeholder="请输入角色名称"
          :disabled="isLinkedLw && !overrideEnabled.name"
        />
      </el-form-item>

      <!-- 描述 -->
      <el-form-item label="描述">
        <div v-if="isLinkedLw" class="lw-hint-row">
          <span class="lw-hint">基础值 (lw): {{ lwHintPlaceholder }}</span>
          <el-button text type="primary" @click="onToggleOverride('description')">
            {{ overrideEnabled.description ? '取消 override' : '+ override' }}
          </el-button>
        </div>
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="请输入角色描述"
          :disabled="isLinkedLw && !overrideEnabled.description"
        />
      </el-form-item>

      <!-- 外貌 -->
      <el-form-item label="外貌">
        <div v-if="isLinkedLw" class="lw-hint-row">
          <span class="lw-hint">基础值 (lw): {{ lwHintPlaceholder }}</span>
          <el-button text type="primary" @click="onToggleOverride('appearance')">
            {{ overrideEnabled.appearance ? '取消 override' : '+ override' }}
          </el-button>
        </div>
        <el-input
          v-model="form.appearance"
          type="textarea"
          :rows="2"
          placeholder="请输入外貌描述"
          :disabled="!isLinkedLw || !overrideEnabled.appearance"
        />
      </el-form-item>

      <!-- 服装 -->
      <el-form-item label="服装">
        <div v-if="isLinkedLw" class="lw-hint-row">
          <span class="lw-hint">基础值 (lw): {{ lwHintPlaceholder }}</span>
          <el-button text type="primary" @click="onToggleOverride('outfit')">
            {{ overrideEnabled.outfit ? '取消 override' : '+ override' }}
          </el-button>
        </div>
        <el-input
          v-model="form.outfit"
          placeholder="请输入服装描述"
          :disabled="!isLinkedLw || !overrideEnabled.outfit"
        />
      </el-form-item>

      <!-- 声音 -->
      <el-form-item label="声音">
        <div class="voice-row">
          <el-select
            v-model="form.voiceId"
            placeholder="请选择声音"
            clearable
            class="voice-select"
          >
            <el-option
              v-for="v in voices"
              :key="v.id"
              :label="v.name"
              :value="v.id"
            />
          </el-select>
        </div>
      </el-form-item>

      <!-- 形象库 (portrait) -->
      <el-form-item label="形象库 (portrait)">
        <div class="portrait-row">
          <el-tag v-if="form.portraitId" type="info" size="small">
            已绑定 portrait: {{ form.portraitId }}
          </el-tag>
          <el-tag v-else type="info" size="small" effect="plain">
            未绑定
          </el-tag>
          <el-button size="small" plain @click="onPickPortrait">
            选择 portrait
          </el-button>
          <el-button
            v-if="form.portraitId"
            size="small"
            text
            type="danger"
            @click="form.portraitId = null"
          >
            清除
          </el-button>
        </div>
      </el-form-item>

      <!-- 保存按钮 -->
      <div class="form-footer">
        <el-button type="success" :loading="saving" @click="onSave">
          保存
        </el-button>
      </div>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 角色设定卡表单（P3a Task 12）
 * @module renderer/components/episode-production/stage-asset/character/CharacterCardForm
 * @description 角色 binding 的设定卡 UI：
 *   - linked_lw 模式：每个字段有 lw 基础值（占位）+ override 切换按钮；
 *   - standalone 模式：name/description 直接可编辑；appearance/outfit 走 override 字段；
 *   - voice 用 el-select 显示 listReady 列出的声音；
 *   - portrait 选择对话框留 P3b 接入，本 task 仅按钮占位。
 *
 * IPC 注意：
 *   - api.character.get(id) 返回 IpcResponse，需 .data；
 *   - lw 上游字段 IPC 暂未暴露，本 task 先写占位 "(lw 基础值待 IPC 接入)"。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{ bindingId: string }>()
const emit = defineEmits<{ saved: [] }>()

const loading = ref(false)
const saving = ref(false)
const binding = ref<any>(null)
const voices = ref<Array<{ id: string; name: string }>>([])

const form = reactive({
  name: '',
  description: '',
  appearance: '',
  outfit: '',
  voiceId: null as string | null,
  portraitId: null as string | null,
})

const overrideEnabled = reactive({
  name: false,
  description: false,
  appearance: false,
  outfit: false,
})

const isLinkedLw = computed(() => binding.value?.sourceType === 'linked_lw')

// lw 基础值占位：实际 lw 字段 IPC 暂未暴露（character_asset.service 内部用了 lw repo
// 但 IPC 只透传 binding 与 effective），effective 已合并 override 不能用作"基础值显示"。
// 留 P3a-final / P3b 接入真实 lw 字段查询 IPC。
const lwHintPlaceholder = '(lw 基础值待 IPC 接入)'

function getApi() {
  return (window as any).electronAPI?.episodeProduction?.asset
}

async function load() {
  const api = getApi()
  if (!api) return
  if (!props.bindingId) return
  loading.value = true
  try {
    const resp = await api.character.get(props.bindingId)
    if (!resp || !resp.success) {
      ElMessage.error(resp?.error || '加载角色失败')
      binding.value = null
    } else {
      binding.value = resp.data
      hydrateFromBinding(resp.data)
    }

    const voiceResp = await api.voice.listReady()
    if (voiceResp && voiceResp.success && Array.isArray(voiceResp.data)) {
      voices.value = voiceResp.data.map((v: any) => ({
        id: v.id,
        name: v.name || '(未命名声音)',
      }))
    } else {
      voices.value = []
    }
  } catch (e: any) {
    console.error('[CharacterCardForm] load 失败', e)
    ElMessage.error(e?.message || '加载角色失败')
  } finally {
    loading.value = false
  }
}

function hydrateFromBinding(b: any) {
  if (!b) {
    form.name = ''
    form.description = ''
    form.appearance = ''
    form.outfit = ''
    form.voiceId = null
    form.portraitId = null
    overrideEnabled.name = false
    overrideEnabled.description = false
    overrideEnabled.appearance = false
    overrideEnabled.outfit = false
    return
  }

  if (b.sourceType === 'linked_lw') {
    overrideEnabled.name = b.overrideName !== null && b.overrideName !== undefined
    overrideEnabled.description = b.overrideDescription !== null && b.overrideDescription !== undefined
    overrideEnabled.appearance = b.overrideAppearance !== null && b.overrideAppearance !== undefined
    overrideEnabled.outfit = b.overrideOutfit !== null && b.overrideOutfit !== undefined
    form.name = b.overrideName ?? ''
    form.description = b.overrideDescription ?? ''
    form.appearance = b.overrideAppearance ?? ''
    form.outfit = b.overrideOutfit ?? ''
  } else {
    // standalone 模式：name/description 用 standalone* 字段；
    // appearance/outfit 仍走 override*（standalone 也可以填）
    form.name = b.standaloneName ?? ''
    form.description = b.standaloneDescription ?? ''
    form.appearance = b.overrideAppearance ?? ''
    form.outfit = b.overrideOutfit ?? ''
    overrideEnabled.name = true
    overrideEnabled.description = true
    overrideEnabled.appearance = !!b.overrideAppearance
    overrideEnabled.outfit = !!b.overrideOutfit
  }

  form.voiceId = b.voiceId ?? b.voiceConfig?.voiceId ?? null
  form.portraitId = b.portraitId ?? null
}

function onToggleOverride(field: 'name' | 'description' | 'appearance' | 'outfit') {
  overrideEnabled[field] = !overrideEnabled[field]
  if (!overrideEnabled[field]) {
    // 取消 override 时清空对应字段（保存时会下发 null）
    form[field] = ''
  }
}

function onPickPortrait() {
  ElMessage.info('portrait 选择对话框 待 P3b 接入')
}

async function onSave() {
  const api = getApi()
  if (!api) {
    ElMessage.error('IPC 桥未就绪')
    return
  }
  if (!binding.value) return

  saving.value = true
  try {
    if (isLinkedLw.value) {
      const overridePayload = {
        name: overrideEnabled.name ? form.name : null,
        description: overrideEnabled.description ? form.description : null,
        appearance: overrideEnabled.appearance ? form.appearance : null,
        outfit: overrideEnabled.outfit ? form.outfit : null,
      }
      const resp = await api.character.updateOverride(props.bindingId, overridePayload)
      if (!resp || !resp.success) {
        ElMessage.error(resp?.error || '保存 override 失败')
        return
      }
    } else {
      const resp = await api.character.updateStandalone(props.bindingId, {
        name: form.name,
        description: form.description,
        appearance: overrideEnabled.appearance ? form.appearance : null,
        outfit: overrideEnabled.outfit ? form.outfit : null,
      })
      if (!resp || !resp.success) {
        ElMessage.error(resp?.error || '保存 standalone 失败')
        return
      }
    }

    // 保存声音 + portrait
    const voiceResp = await api.character.setVoice(props.bindingId, form.voiceId)
    if (voiceResp && !voiceResp.success) {
      ElMessage.warning(voiceResp.error || '声音绑定失败')
    }

    const portraitResp = await api.character.setPortrait(props.bindingId, form.portraitId)
    if (portraitResp && !portraitResp.success) {
      ElMessage.warning(portraitResp.error || 'portrait 绑定失败')
    }

    ElMessage.success('已保存')
    emit('saved')
  } catch (e: any) {
    console.error('[CharacterCardForm] save 失败', e)
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => props.bindingId, load)

defineExpose({ reload: load })
</script>

<style scoped>
.character-card-form {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.character-card-form :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--el-text-color-primary);
}

.header-title {
  font-weight: 600;
  font-size: 14px;
}

.form-body {
  padding-top: 4px;
}

.lw-hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
}

.lw-hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-row,
.portrait-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  flex-wrap: wrap;
}

.voice-select {
  flex: 1;
  min-width: 160px;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
</style>
