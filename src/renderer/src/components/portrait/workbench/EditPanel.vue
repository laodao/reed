<template>
  <!-- 主编辑面板（framing 联动，spec 2026-07-24 D5）：
       半身 → 修改面部（editFace）；全身 → 修改全身（复用 editImage） -->
  <div class="panel-card edit-panel">
    <!-- 半身：修改面部 -->
    <template v-if="framing === 'half'">
      <h3 class="panel-title accent">🎯 修改面部 <span class="tag-accent">新</span></h3>
      <div class="form-row">
        <div class="form-label">面部修改描述</div>
        <el-input
          v-model="facePrompt"
          type="textarea"
          :rows="2"
          placeholder="如：更硬朗的下颌线、单眼皮、浓眉、嘴角微扬..."
        />
      </div>
      <div class="form-row">
        <div class="form-label">面部模板</div>
        <TemplatePicker
          category="face"
          scene="face"
          :character="character"
          @replace="content => facePrompt = content"
          @append="content => facePrompt = facePrompt ? facePrompt + ', ' + content : content"
        />
      </div>
      <div class="form-row">
        <div class="form-label">面部参考图（可选）</div>
        <ReferenceImagePicker v-model="faceRefs" :max="2" />
      </div>
      <div class="form-row">
        <div class="slider-row">
          <span class="lbl">重绘强度</span>
          <el-slider v-model="strength" :min="0" :max="1" :step="0.05" :format-tooltip="v => v.toFixed(2)" />
          <span class="val">{{ strength.toFixed(2) }}</span>
        </div>
      </div>
      <div class="form-row">
        <div class="form-label">重绘范围</div>
        <el-select v-model="focusRegion">
          <el-option label="face · 仅面部" value="face" />
          <el-option label="face_and_hair · 面部 + 发型" value="face_and_hair" />
          <el-option label="upper · 上半身" value="upper" />
        </el-select>
      </div>
      <el-button
        class="submit-btn face-btn"
        :loading="editing"
        :disabled="!facePrompt.trim()"
        @click="handleEditFace"
      >
        🎯 只改面部
      </el-button>
    </template>

    <!-- 全身：修改全身（复用 editImage，参数以其真实支持为准：指令 + 尺寸） -->
    <template v-else>
      <h3 class="panel-title accent">✏️ 修改全身</h3>
      <div class="form-row">
        <div class="form-label">修改描述</div>
        <el-input
          v-model="editPrompt"
          type="textarea"
          :rows="2"
          placeholder="如：改成走路姿势、双手插兜、把外套脱掉..."
        />
      </div>
      <div class="form-row">
        <div class="form-label">全身模板</div>
        <TemplatePicker
          scene="regenerate"
          :character="character"
          @replace="content => editPrompt = content"
          @append="content => editPrompt = editPrompt ? editPrompt + ', ' + content : content"
        />
      </div>
      <div class="form-row">
        <div class="form-label">输出尺寸</div>
        <SizeSelect v-model="editSize" :model-sizes="modelSizes" />
      </div>
      <el-button
        class="submit-btn face-btn"
        :loading="editing"
        :disabled="!editPrompt.trim()"
        @click="handleEditImage"
      >
        ✏️ 修改全身
      </el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import TemplatePicker from './TemplatePicker.vue'
import ReferenceImagePicker from './ReferenceImagePicker.vue'
import SizeSelect from './SizeSelect.vue'
import { DEFAULT_PORTRAIT_SIZES } from '../../../../../shared/types/portrait.types'
import type {
  PortraitCharacter,
  PortraitVariant,
  PortraitFraming,
  ReferenceImageRole
} from '../../../../../shared/types/portrait.types'

const props = withDefaults(defineProps<{
  framing: PortraitFraming
  character: PortraitCharacter
  variant: PortraitVariant
  modelSizes?: string[]
}>(), {
  modelSizes: () => []
})

const emit = defineEmits<{
  success: []
}>()

const editing = ref(false)

// ---- 修改面部（half） ----
const facePrompt = ref('')
const faceRefs = ref<{ data: string; role: ReferenceImageRole }[]>([])
const strength = ref(0.5)
const focusRegion = ref<'face' | 'face_and_hair' | 'upper'>('face')

async function handleEditFace() {
  editing.value = true
  try {
    const result = await window.electronAPI.portrait.editFace({
      characterId: props.character.id,
      variantId: props.variant.id,
      facePrompt: facePrompt.value.trim() || undefined,
      referenceImages: faceRefs.value.length ? faceRefs.value.map(r => r.data) : undefined,
      strength: strength.value,
      focusRegion: focusRegion.value
    })
    if (result.success) {
      ElMessage.success('面部修改成功')
      facePrompt.value = ''
      emit('success')
    } else {
      ElMessage.error(result.error || '修改失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '修改失败')
  } finally {
    editing.value = false
  }
}

// ---- 修改全身（full，复用 editImage） ----
const editPrompt = ref('')
const editSize = ref(
  props.variant.config?.width && props.variant.config?.height
    ? `${props.variant.config.width}x${props.variant.config.height}`
    : DEFAULT_PORTRAIT_SIZES[0]
)

async function handleEditImage() {
  if (!editPrompt.value.trim()) return
  editing.value = true
  try {
    const [width, height] = editSize.value.split('x').map(Number)
    const result = await window.electronAPI.portrait.editImage({
      characterId: props.character.id,
      variantId: props.variant.id,
      editPrompt: editPrompt.value.trim(),
      width,
      height
    })
    if (result.success) {
      ElMessage.success('修改成功')
      editPrompt.value = ''
      emit('success')
    } else {
      ElMessage.error(result.error || '修改失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '修改失败')
  } finally {
    editing.value = false
  }
}
</script>

<style lang="scss" scoped>
.panel-card {
  background: var(--bg-color-card);
  border: 1px solid var(--border-color-lighter);
  border-left: 3px solid var(--color-purple);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md, 18px);
  box-shadow: var(--shadow-sm);
}

.panel-title {
  margin: 0 0 var(--spacing-md, 16px);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;

  &.accent {
    color: var(--color-purple);
  }
}

.tag-accent {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-purple-light-9);
  color: var(--color-purple);
}

.form-row {
  margin-bottom: var(--spacing-md, 14px);
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 7px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;

  .lbl {
    font-size: 12.5px;
    color: var(--text-secondary);
    width: 76px;
    flex-shrink: 0;
  }

  .el-slider {
    flex: 1;
  }

  .val {
    font-size: 12.5px;
    color: var(--color-purple);
    font-weight: 600;
    width: 40px;
    text-align: right;
  }
}

.submit-btn {
  width: 100%;
}

.face-btn {
  background: var(--color-purple);
  border-color: var(--color-purple);
  color: var(--fill-color-blank);

  &:hover {
    background: var(--color-purple-dark-2);
    border-color: var(--color-purple-dark-2);
  }
}
</style>
