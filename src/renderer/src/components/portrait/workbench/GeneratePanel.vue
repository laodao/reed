<template>
  <div class="generate-panel">
    <div class="panel-card">
      <h3 class="panel-title">✨ 生成形象</h3>

      <!-- 取景范围（默认半身：先定脸，满意后再扩全身） -->
      <div class="form-row">
        <div class="form-label">取景范围</div>
        <div class="framing-cards">
          <label class="framing-card" :class="{ active: framing === 'half' }">
            <input v-model="framing" type="radio" value="half" />
            <div class="fc-title">半身像（推荐先做）</div>
            <div class="fc-desc">面部细节清晰，便于定脸。满意后再扩展为全身。</div>
          </label>
          <label class="framing-card" :class="{ active: framing === 'full' }">
            <input v-model="framing" type="radio" value="full" />
            <div class="fc-title">全身像</div>
            <div class="fc-desc">从头到脚完整形象。建议基于半身生成，保证面部一致。</div>
          </label>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-row">
          <div class="form-label">生成模型</div>
          <el-select
            v-model="models.selectedModelKey.value"
            placeholder="选择生成模型"
            filterable
            :filter-method="models.filterModels"
            @change="models.onModelChange"
          >
            <el-option-group
              v-for="provider in models.filteredProviderModels.value"
              :key="provider.id"
              :label="provider.name"
            >
              <el-option
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                :label="model.name"
                :value="`${provider.id}:${model.id}`"
              />
            </el-option-group>
          </el-select>
        </div>
        <div class="form-row">
          <div class="form-label">输出尺寸</div>
          <SizeSelect v-model="size" :model-sizes="models.modelSizes.value" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-label">提示词模板</div>
        <TemplatePicker
          scene="generate"
          :character="character"
          @replace="content => prompt = content"
          @append="content => prompt = prompt ? prompt + ', ' + content : content"
        />
      </div>

      <div class="form-row">
        <div class="form-label">提示词（正向）</div>
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          placeholder="可修改或补充人物描述..."
        />
      </div>

      <div class="form-row">
        <div class="form-label">反向提示词</div>
        <el-input
          v-model="negativePrompt"
          type="textarea"
          :rows="2"
          placeholder="不想出现的内容，如：模糊、低质量、变形..."
        />
      </div>

      <div class="form-row">
        <div class="form-label">参考图片</div>
        <ReferenceImagePicker v-model="referenceImages" :max="4" />
      </div>

      <!-- 高级参数（只放真实生效的：质量/风格会透传给支持的 provider，种子保证可复现） -->
      <div class="form-row">
        <span class="adv-toggle" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '▾' : '▸' }} 高级参数
        </span>
        <div v-show="showAdvanced" class="adv-body">
          <div class="adv-grid">
            <div>
              <div class="form-label">质量</div>
              <el-select v-model="quality">
                <el-option label="standard · 标准" value="standard" />
                <el-option label="hd · 高清" value="hd" />
              </el-select>
            </div>
            <div>
              <div class="form-label">随机种子（留空随机）</div>
              <el-input-number v-model="seed" :min="0" :max="2147483647" :controls="false" placeholder="随机" style="width: 100%" />
            </div>
          </div>
        </div>
      </div>

      <el-button
        type="primary"
        size="large"
        class="submit-btn"
        :loading="generating"
        :disabled="!models.selectedModelKey.value"
        @click="handleGenerate"
      >
        ✨ {{ framing === 'half' ? '生成半身像（正面）' : '生成全身像（正面）' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import SizeSelect from './SizeSelect.vue'
import TemplatePicker from './TemplatePicker.vue'
import ReferenceImagePicker from './ReferenceImagePicker.vue'
import { useImageModels } from './useImageModels'
import { DEFAULT_PORTRAIT_SIZES } from '../../../../../shared/types/portrait.types'
import type {
  PortraitCharacter,
  PortraitProject,
  PortraitFraming,
  ReferenceImageRole
} from '../../../../../shared/types/portrait.types'
import type { Ref } from 'vue'

const props = defineProps<{
  character: PortraitCharacter
  project?: PortraitProject
}>()

const emit = defineEmits<{
  generated: []
}>()

const models = useImageModels(props.project ? (ref(props.project) as Ref<PortraitProject | undefined>) : undefined)

// 表单状态
const framing = ref<PortraitFraming>('half')
const size = ref(DEFAULT_PORTRAIT_SIZES[0])
const prompt = ref('')
const negativePrompt = ref('')
const referenceImages = ref<{ data: string; role: ReferenceImageRole }[]>([])
const showAdvanced = ref(false)
const quality = ref<'standard' | 'hd'>('standard')
const seed = ref<number | undefined>(undefined)
const generating = ref(false)

// 根据人物信息生成默认英文提示词（避免云服务中文审核问题）
function buildDefaultPrompt(): string {
  const c = props.character
  const genderText = c.gender === 'male' ? 'male' : 'female'
  const raceText = c.race === 'asian' ? 'Asian' : 'European'
  return `portrait of a person, ${genderText}, ${raceText}, age ${c.age}, height ${c.height}cm, weight ${c.weight}kg${c.description ? ', ' + c.description : ''}`
}

watch(
  () => props.character,
  (c) => {
    if (!c) return
    prompt.value = c.prompt || buildDefaultPrompt()
    // 恢复角色已存参考图（角色只存 data 字符串，角色默认为人物语义）
    referenceImages.value = (c.referenceImages ?? []).map(data => ({ data, role: 'character' as ReferenceImageRole }))
  },
  { immediate: true }
)

async function handleGenerate() {
  if (!models.selectedModelKey.value || !models.selectedModel.value) return

  generating.value = true
  try {
    const model = models.selectedModel.value
    const refData = toRaw(referenceImages.value).map(r => r.data)
    const [width, height] = size.value.split('x').map(Number)

    // 保存角色的模型配置 / 提示词 / 参考图
    await window.electronAPI.portrait.updateCharacter({
      id: props.character.id,
      providerId: model.providerId,
      modelId: model.modelId,
      prompt: prompt.value,
      referenceImages: refData
    })

    const result = await window.electronAPI.portrait.generate({
      characterId: props.character.id,
      prompt: prompt.value,
      negativePrompt: negativePrompt.value || undefined,
      referenceImages: refData,
      providerId: model.providerId,
      modelId: model.modelId,
      framing: framing.value,
      config: {
        angles: ['front'],
        backgroundType: 'solid',
        width,
        height,
        quality: quality.value,
        seed: seed.value
      }
    })

    if (result.success) {
      if (result.warning) {
        ElMessage.warning(result.warning)
      } else {
        ElMessage.success('生成成功')
      }
      emit('generated')
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generating.value = false
  }
}

// 加载模型列表
models.load()
</script>

<style lang="scss" scoped>
@use './workbench-card.scss' as wb;

.generate-panel {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--spacing-lg, 24px);
}

.panel-card {
  @include wb.card;
  padding: var(--spacing-lg, 24px);
}

.panel-title {
  @include wb.card-title;
  font-size: var(--font-size-large, 16px);
}

.form-row {
  margin-bottom: var(--spacing-md, 16px);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md, 16px);
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 7px;
}

.framing-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.framing-card {
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-color-card);
  cursor: pointer;
  transition: all var(--transition-fast);

  input[type='radio'] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .fc-title {
    font-weight: 600;
    font-size: 13.5px;
    color: var(--text-primary);
  }

  .fc-desc {
    font-size: 11.5px;
    color: var(--text-secondary);
    margin-top: 3px;
    line-height: 1.5;
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light-9);

    .fc-title {
      color: var(--color-primary);
    }
  }
}

.adv-toggle {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--color-primary);
  }
}

.adv-body {
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);
}

.adv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md, 16px);
}

.submit-btn {
  width: 100%;
}
</style>
