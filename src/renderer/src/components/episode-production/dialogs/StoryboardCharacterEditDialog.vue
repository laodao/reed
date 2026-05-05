<template>
  <!--
    StoryboardCharacterEditDialog · 分镜内角色编辑（spec §4.5.3 · P5-T33）

    spec §4.5.3 第 966-984 行字段：
      - character_binding_id（是谁）
      - position {x, y, scale}（站位 + 缩放）
      - expression（happy/angry/...）
      - facing（front/3q_left/back...）
      - action（"举起茶杯"）

    实操示例（spec §4.5.9）：
      分镜 1.2: {cb_zhangsan, position=center, expression=angry, action="举手指向李四"}
      分镜 1.3: {cb_lisi, position=center, expression=surprised, facing=3q_left}

    用户操作：
      - 显示当前分镜已配置的角色列表（从 P5-T32 IPC 加载）
      - "+ 添加角色"：选 project 角色 + 加入列表
      - 每条可编辑 position / expression / facing / action / 删除
      - "保存"：调 ep:save-storyboard-characters 全量替换
      - "清空（回退场景级）"：调 ep:clear-storyboard-characters
  -->
  <el-dialog
    v-model="visible"
    title="编辑分镜内角色配置（spec §4.5.3）"
    width="720px"
    :close-on-click-modal="false"
    @close="onCancel"
  >
    <div class="dialog-body">
      <div v-if="loading" class="loading-row">
        <el-icon class="is-loading"><Loading /></el-icon>
        加载中...
      </div>

      <div v-else>
        <p class="hint">
          <el-icon><InfoFilled /></el-icon>
          为该分镜独立配置角色（覆盖场景级）。清空后该分镜回退到场景级配置。
        </p>

        <div class="char-list">
          <div
            v-for="(c, idx) in editList"
            :key="`row-${idx}`"
            class="char-row"
          >
            <div class="row-header">
              <el-select
                v-model="c.characterId"
                placeholder="选择角色"
                style="flex: 1"
                size="small"
              >
                <el-option
                  v-for="cand in availableCandidates(c.characterId)"
                  :key="cand.id"
                  :value="cand.id"
                  :label="cand.name"
                />
              </el-select>
              <el-button
                type="danger"
                size="small"
                circle
                :icon="Delete"
                @click="onRemoveRow(idx)"
                title="删除该角色"
              />
            </div>

            <div class="row-fields">
              <el-form-item label="位置 X" size="small">
                <el-slider
                  v-model="c.positionX"
                  :min="0"
                  :max="100"
                  :step="5"
                  show-input
                  :show-input-controls="false"
                />
              </el-form-item>
              <el-form-item label="位置 Y" size="small">
                <el-slider
                  v-model="c.positionY"
                  :min="0"
                  :max="100"
                  :step="5"
                  show-input
                  :show-input-controls="false"
                />
              </el-form-item>
              <el-form-item label="缩放" size="small">
                <el-slider
                  v-model="c.positionScale"
                  :min="0.5"
                  :max="2"
                  :step="0.1"
                  show-input
                  :show-input-controls="false"
                />
              </el-form-item>
            </div>

            <div class="row-fields">
              <el-form-item label="表情" size="small">
                <el-input
                  v-model="c.expression"
                  placeholder="happy/angry/sad/neutral"
                  clearable
                />
              </el-form-item>
              <el-form-item label="朝向" size="small">
                <el-select v-model="c.facing" placeholder="选择朝向">
                  <el-option label="正面 front" value="front" />
                  <el-option label="左侧 left" value="left" />
                  <el-option label="右侧 right" value="right" />
                  <el-option label="背面 back" value="back" />
                  <el-option label="左 3/4 three_quarter_left" value="three_quarter_left" />
                  <el-option label="右 3/4 three_quarter_right" value="three_quarter_right" />
                </el-select>
              </el-form-item>
            </div>

            <div class="row-fields">
              <el-form-item label="动作" size="small" class="full-width">
                <el-input
                  v-model="c.action"
                  placeholder="举起茶杯 / 怒指对方 / 推门 ..."
                  clearable
                />
              </el-form-item>
            </div>
          </div>

          <div v-if="editList.length === 0" class="empty-state">
            <el-empty description="暂无分镜内角色配置（点'+ 添加'开始）" :image-size="80" />
          </div>
        </div>

        <div class="add-row">
          <el-button @click="onAddRow" :disabled="characterCandidates.length === editList.length">
            <el-icon><Plus /></el-icon>
            添加角色
          </el-button>
        </div>

        <div v-if="errorMessage" class="error-banner">
          <el-icon><Warning /></el-icon>
          {{ errorMessage }}
        </div>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="saving" @click="onClearAll" size="default">
        清空（回退场景级）
      </el-button>
      <el-button @click="onCancel" :disabled="saving">取消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        @click="onSave"
        :disabled="!canSave"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * StoryboardCharacterEditDialog（P5-T33）
 *
 * Props：
 *   - modelValue：v-model 显隐
 *   - storyboardId：当前编辑的分镜 ID
 *   - characterCandidates：候选角色列表（来自 project characterBindings）
 *
 * Emits：
 *   - update:modelValue
 *   - saved：保存成功 → 父组件刷新
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  InfoFilled,
  Loading,
  Plus,
  Warning,
} from '@element-plus/icons-vue'

interface CharacterCandidate {
  id: string
  name: string
}

interface EditRow {
  characterId: string
  positionX: number
  positionY: number
  positionScale: number
  expression: string
  facing: string
  action: string
}

const props = defineProps<{
  modelValue: boolean
  storyboardId: string | null
  characterCandidates: CharacterCandidate[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref<string | null>(null)
const editList = ref<EditRow[]>([])

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) loadCurrent()
  },
)
watch(visible, (v) => emit('update:modelValue', v))

const canSave = computed(() => {
  // 至少所有行都选了角色
  return editList.value.every((r) => r.characterId)
})

function availableCandidates(currentId: string): CharacterCandidate[] {
  // 排除已被其他行占用的（同一分镜不允许同一个角色多次配置）
  const usedIds = new Set(
    editList.value
      .map((r) => r.characterId)
      .filter((id) => id && id !== currentId),
  )
  return props.characterCandidates.filter((c) => !usedIds.has(c.id))
}

async function loadCurrent(): Promise<void> {
  if (!props.storyboardId) return
  loading.value = true
  errorMessage.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listStoryboardCharacters) {
      throw new Error('IPC listStoryboardCharacters 未暴露')
    }
    const resp = await api.listStoryboardCharacters(props.storyboardId)
    if (!resp?.success) {
      throw new Error(resp?.error || '加载分镜内角色失败')
    }
    const data = (resp.data || []) as Array<{
      characterId: string
      position: { x: number; y: number; scale: number }
      expression?: string
      action?: string
      facing?: string
    }>
    editList.value = data.map((d) => ({
      characterId: d.characterId,
      positionX: d.position.x,
      positionY: d.position.y,
      positionScale: d.position.scale,
      expression: d.expression ?? '',
      facing: d.facing ?? 'front',
      action: d.action ?? '',
    }))
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
}

function onAddRow(): void {
  editList.value.push({
    characterId: '',
    positionX: 50,
    positionY: 50,
    positionScale: 1.0,
    expression: '',
    facing: 'front',
    action: '',
  })
}

function onRemoveRow(idx: number): void {
  editList.value.splice(idx, 1)
}

async function onSave(): Promise<void> {
  if (!props.storyboardId) return
  if (!canSave.value) {
    ElMessage.warning('请为每行选择一个角色')
    return
  }
  saving.value = true
  errorMessage.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.saveStoryboardCharacters) {
      throw new Error('IPC saveStoryboardCharacters 未暴露')
    }
    const inputs = editList.value.map((r) => ({
      characterId: r.characterId,
      positionX: r.positionX,
      positionY: r.positionY,
      positionScale: r.positionScale,
      expression: r.expression || null,
      action: r.action || null,
      facing: r.facing as any,
    }))
    const resp = await api.saveStoryboardCharacters(props.storyboardId, inputs)
    if (!resp?.success) {
      throw new Error(resp?.error || '保存失败')
    }
    ElMessage.success(`已保存 ${editList.value.length} 个角色配置`)
    emit('saved')
    visible.value = false
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    saving.value = false
  }
}

async function onClearAll(): Promise<void> {
  if (!props.storyboardId) return
  try {
    await ElMessageBox.confirm(
      '清空后该分镜的角色配置回退到场景级（spec §4.5.3 兜底）。确认？',
      '清空分镜内角色',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  saving.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.clearStoryboardCharacters) {
      throw new Error('IPC clearStoryboardCharacters 未暴露')
    }
    const resp = await api.clearStoryboardCharacters(props.storyboardId)
    if (!resp?.success) {
      throw new Error(resp?.error || '清空失败')
    }
    ElMessage.success('已清空，该分镜回退到场景级配置')
    emit('saved')
    visible.value = false
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    saving.value = false
  }
}

function onCancel(): void {
  visible.value = false
}
</script>

<style scoped lang="scss">
.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.loading-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 8px 12px;
  background: var(--el-color-info-light-9);
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-color-info);
}

.char-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.char-row {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--el-fill-color-blank);
}

.row-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;

  :deep(.el-form-item) {
    margin-bottom: 0;
  }

  .full-width {
    grid-column: 1 / -1;
  }
}

.empty-state {
  padding: 16px 0;
}

.add-row {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  border-radius: 4px;
  font-size: 12px;
}
</style>
