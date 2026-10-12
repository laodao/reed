<template>
  <el-dialog
    :model-value="visible"
    title="AI 引导创建角色"
    width="640px"
    top="4vh"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => { if (!v) emit('close') }"
  >
    <div class="wizard-body">
      <!-- 步骤条 -->
      <el-steps :active="currentStep - 1" align-center finish-status="success" class="wizard-steps">
        <el-step v-for="s in IP_WIZARD_STEPS" :key="s.step" :title="s.title" />
      </el-steps>

      <!-- 第 1 步前：灵感输入 -->
      <template v-if="currentStep === 1 && !stepStarted">
        <div class="seed-block">
          <div class="guide-question">先说一句灵感——TA 是个什么样的人？</div>
          <el-input
            v-model="seedIdea"
            type="textarea"
            :rows="3"
            placeholder="例：木讷的农村少年，靠剑走偏锋进入名门；也可以只写一句职业+性格"
          />
          <el-select v-model="worldId" clearable placeholder="（可选）挂在哪个世界观下——天赋会贴合该世界体系" style="width: 100%; margin-top: 10px">
            <el-option v-for="w in worlds" :key="w.id" :label="w.name" :value="w.id" />
          </el-select>
          <div class="seed-actions">
            <el-button type="primary" :loading="loading" @click="startWizard">就按这个开始</el-button>
            <el-button :loading="loading" @click="seedIdea = ''; startWizard()">没有想法，让 AI 自由发挥</el-button>
          </div>
        </div>
      </template>

      <!-- 各步骤：AI 提案 + 可编辑确认 -->
      <template v-else>
        <div class="guide-question">{{ stepDef.question }}</div>

        <div v-loading="loading" class="proposal-area">
          <div v-if="error" class="wizard-error">
            {{ error }}
            <el-button size="small" text type="primary" @click="generateLayer()">重试</el-button>
          </div>
          <template v-else>
            <div v-for="f in stepDef.fields" :key="f.key" class="field-row">
              <div class="field-label">
                {{ f.label }}
                <el-tag v-if="f.required" size="small" type="danger" effect="plain">必填</el-tag>
              </div>

              <el-select
                v-if="f.type === 'select'"
                v-model="proposal[f.key]"
                style="width: 100%"
              >
                <el-option v-for="o in f.options || []" :key="o" :label="genderLabel(o)" :value="o" />
              </el-select>
              <el-select
                v-else-if="f.type === 'tags'"
                v-model="proposal[f.key]"
                multiple filterable allow-create default-first-option
                placeholder="输入后回车添加；AI 已给出建议，可增删"
                style="width: 100%"
              />
              <el-input
                v-else-if="f.type === 'textarea'"
                v-model="proposal[f.key]"
                type="textarea"
                :rows="f.key === 'background' ? 5 : 3"
              />
              <el-input v-else v-model="proposal[f.key]" />

              <div class="field-hint">{{ f.hint }}</div>
            </div>
          </template>
        </div>

        <el-input
          v-model="requirements"
          class="req-input"
          placeholder="（可选）对本步的修改意见，如：名字再土一点 / 软肋和家庭有关"
          @keyup.enter="generateLayer({ variation: true })"
        />

        <div class="wizard-actions">
          <el-button v-if="currentStep > 1" :disabled="loading" @click="goPrev">上一步</el-button>
          <el-button :disabled="loading" :loading="loading && lastAction === 'variation'" @click="generateLayer({ variation: true })">
            换一批
          </el-button>
          <span class="spacer" />
          <el-button
            v-if="currentStep === 1 && !oneShotUsed"
            text type="primary"
            :disabled="loading"
            @click="oneShot"
          >懒得一步步来，AI 一次成卡</el-button>
          <el-button
            type="primary"
            :loading="loading && lastAction === 'next'"
            :disabled="loading || !stepFilled"
            @click="confirmStep"
          >
            {{ currentStep === 4 ? '确认无误，入库' : '确认，下一步' }}
          </el-button>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 交互式创建角色向导（2026-09-25：替代一次性复杂表单）
 * 四层引导：AI 每层出提案 → 用户看懂每句提示、随手改 → 确认进下一步 → 入库。
 * 字段定义与提示文案在 shared（IP_WIZARD_STEPS），与后端 prompt 同源不漂移。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { IP_WIZARD_STEPS } from '@shared/types/lw-library.types'
import type { IpCharacter, World } from '@shared/types/lw-library.types'

const props = defineProps<{
  visible: boolean
  worlds: World[]
}>()

const emit = defineEmits<{ (e: 'close'): void; (e: 'created', ip: IpCharacter): void }>()

const currentStep = ref(1)
const stepStarted = ref(false)
const seedIdea = ref('')
const worldId = ref('')
const confirmed = ref<Record<string, unknown>>({})
const proposal = ref<Record<string, unknown>>({})
const requirements = ref('')
const loading = ref(false)
const error = ref('')
const lastAction = ref<'next' | 'variation'>('next')
const oneShotUsed = ref(false)
/** M1 修复：一次成卡在后端已建库行——记下 id，最终步走 update 而非重复 create */
const oneShotCreatedId = ref<string | null>(null)

const lib = () => window.electronAPI.library

const stepDef = computed(() => IP_WIZARD_STEPS.find(s => s.step === currentStep.value)!)

const genderLabel = (g: string) => (g === 'male' ? '男' : g === 'female' ? '女' : '其他')

const stepFilled = computed(() => {
  const nameField = stepDef.value.fields.find(f => f.required)
  if (!nameField) return true
  const v = proposal.value[nameField.key]
  return typeof v === 'string' ? v.trim().length > 0 : !!v
})

// 打开时重置
watch(() => props.visible, v => {
  if (v) {
    currentStep.value = 1
    stepStarted.value = false
    seedIdea.value = ''
    worldId.value = ''
    confirmed.value = {}
    proposal.value = {}
    requirements.value = ''
    error.value = ''
    oneShotUsed.value = false
    oneShotCreatedId.value = null
  }
})

const pickLayer = (data: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const f of stepDef.value.fields) {
    if (f.type === 'tags') out[f.key] = Array.isArray(data[f.key]) ? [...(data[f.key] as string[])] : []
    else out[f.key] = data[f.key] ?? ''
  }
  return out
}

const startWizard = async () => {
  stepStarted.value = true
  await generateLayer()
}

const generateLayer = async (opts: { variation?: boolean } = {}) => {
  loading.value = true
  error.value = ''
  lastAction.value = opts.variation ? 'variation' : 'next'
  const eventId = `ip-layer-${Date.now()}`
  try {
    const result = await lib().ipGenerateLayer({
      eventId,
      step: currentStep.value,
      seedIdea: seedIdea.value,
      worldId: worldId.value || null,
      confirmed: confirmed.value,
      requirements: requirements.value || undefined,
      variation: opts.variation,
    })
    if (result.success) {
      proposal.value = pickLayer(result.data)
      requirements.value = ''
    } else {
      error.value = result.error || '生成失败'
    }
  } catch (e: any) {
    error.value = e?.message || '生成失败'
  } finally {
    loading.value = false
  }
}

const goPrev = () => {
  currentStep.value = (currentStep.value - 1) as 1 | 2 | 3 | 4
  // 已确认过的层直接回显可编辑，不重新生成
  proposal.value = pickLayer(confirmed.value)
  error.value = ''
}

const confirmStep = async () => {
  confirmed.value = { ...confirmed.value, ...proposal.value }
  if (currentStep.value < 4) {
    currentStep.value = (currentStep.value + 1) as 1 | 2 | 3 | 4
    await generateLayer()
  } else {
    await saveToLibrary()
  }
}

/** 一步成卡：整卡生成后各层回填，用户在第 4 步总览确认 */
const oneShot = async () => {
  loading.value = true
  error.value = ''
  const eventId = `ip-one-${Date.now()}`
  try {
    const result = await lib().ipGenerate({
      eventId,
      seedIdea: seedIdea.value || '请自由发挥一个有记忆点的角色',
      worldId: worldId.value || null,
    })
    if (result.success) {
      const c = result.character
      oneShotCreatedId.value = c.id
      confirmed.value = {
        name: c.name, aliases: [...c.aliases], gender: c.gender ?? '', age: c.age ?? '',
        race: c.race ?? '', occupation: c.occupation ?? '', appearance: c.appearance ?? '',
        personality: c.personality ?? '', motivation: c.motivation ?? '', flaw: c.flaw ?? '',
        background: c.background ?? '', valuesNotes: c.valuesNotes ?? '',
        talents: c.talents ?? '', abilities: c.abilities ?? '', signatureItems: c.signatureItems ?? '',
        characterArc: c.characterArc ?? '', catchphrases: [...c.catchphrases], tags: [...c.tags],
      }
      oneShotUsed.value = true
      currentStep.value = 4
      proposal.value = pickLayer(confirmed.value)
      ElMessage.success('整卡已生成，可在最后一步微调后入库')
    } else {
      error.value = result.error || '生成失败'
    }
  } catch (e: any) {
    error.value = e?.message || '生成失败'
  } finally {
    loading.value = false
  }
}

const saveToLibrary = async () => {
  const c = confirmed.value
  const payload = {
    name: String(c.name || ''),
    aliases: (c.aliases as string[]) || [],
    worldId: worldId.value || null,
    gender: (c.gender as string) || null,
    age: (c.age as string) || null,
    race: (c.race as string) || null,
    occupation: (c.occupation as string) || null,
    appearance: (c.appearance as string) || null,
    personality: (c.personality as string) || null,
    motivation: (c.motivation as string) || null,
    flaw: (c.flaw as string) || null,
    background: (c.background as string) || null,
    valuesNotes: (c.valuesNotes as string) || null,
    talents: (c.talents as string) || null,
    abilities: (c.abilities as string) || null,
    signatureItems: (c.signatureItems as string) || null,
    characterArc: (c.characterArc as string) || null,
    catchphrases: (c.catchphrases as string[]) || [],
    tags: (c.tags as string[]) || [],
  }
  // M1：oneShot 路径后端已建行，此处更新；分层路径才新建
  // reactive 代理（confirmed ref 深层转换的 aliases/catchphrases/tags 数组）过不了 IPC structured clone
  const plain = JSON.parse(JSON.stringify(payload))
  const ip = oneShotCreatedId.value
    ? await lib().ipUpdate(oneShotCreatedId.value, plain)
    : await lib().ipCreate(plain)
  if (!ip) {
    ElMessage.error('入库失败：角色已不存在')
    return
  }
  ElMessage.success(`角色「${ip.name}」已入库`)
  emit('created', ip)
  emit('close')
}
</script>

<style scoped lang="scss">
.wizard-body {
  min-height: 320px;
}

.wizard-steps {
  margin-bottom: 18px;
}

.guide-question {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-primary, #409eff);
  margin-bottom: 14px;
}

.seed-block {
  .seed-actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
  }
}

.proposal-area {
  min-height: 160px;
}

.field-row {
  margin-bottom: 14px;

  .field-label {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .field-hint {
    color: var(--text-secondary, #999);
    font-size: 12px;
    line-height: 1.5;
    margin-top: 3px;
  }
}

.wizard-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--el-color-danger-light-9, #fef0f0);
  border-radius: 6px;
  color: var(--el-color-danger, #f56c6c);
  font-size: 13px;
}

.req-input {
  margin: 6px 0 12px;
}

.wizard-actions {
  display: flex;
  align-items: center;
  gap: 8px;

  .spacer {
    flex: 1;
  }
}
</style>
