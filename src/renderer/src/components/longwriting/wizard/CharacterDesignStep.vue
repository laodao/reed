<template>
  <div class="character-design-step">
    <div class="step-header">
      <h2>人物设计</h2>
      <p class="step-desc">AI 将基于故事蓝图生成人物草案，你可以逐个编辑确认后再批量加入项目</p>
    </div>

    <!-- 生成操作 -->
    <div class="generate-bar">
      <el-input
        v-model="requirements"
        placeholder="额外要求（可选），例如：需要一位亦正亦邪的军师"
        style="max-width: 420px"
        clearable
      />
      <el-button type="primary" :loading="generating" :disabled="!canGenerate" @click="generateCharacters">
        <el-icon><MagicStick /></el-icon>
        生成人物
      </el-button>
      <el-button v-if="generating" @click="ai.cancel()">取消</el-button>
    </div>

    <!-- 生成中 -->
    <div v-if="generating" class="generating-tip">AI 正在生成人物，请稍候...</div>

    <!-- 草稿（生成结果，未入库） -->
    <div v-if="draft.length > 0" class="draft-section">
      <el-divider>生成结果（{{ draft.length }} 人，确认后加入项目）</el-divider>
      <div class="draft-list">
        <div v-for="(c, i) in draft" :key="i" class="draft-card">
          <div class="draft-header">
            <el-input v-model="c.name" placeholder="姓名" style="width: 140px" />
            <el-select v-model="c.rolePosition" style="width: 110px">
              <el-option label="主角" value="protagonist" />
              <el-option label="配角" value="supporting" />
              <el-option label="反派" value="antagonist" />
              <el-option label="边缘" value="minor" />
            </el-select>
            <el-select v-model="c.gender" style="width: 90px">
              <el-option label="男" value="male" />
              <el-option label="女" value="female" />
              <el-option label="其他" value="other" />
            </el-select>
            <el-button type="danger" size="small" :icon="Delete" circle @click="draft.splice(i, 1)" />
          </div>
          <el-input v-model="c.appearance" placeholder="外貌" class="draft-field" />
          <el-input v-model="c.personality" placeholder="性格" class="draft-field" />
          <el-input v-model="c.background" placeholder="背景故事" type="textarea" :rows="2" class="draft-field" />
          <el-input v-model="c.abilities" placeholder="能力特长" class="draft-field" />
        </div>
      </div>
      <div class="draft-actions">
        <el-button @click="draft = []">放弃</el-button>
        <el-button type="primary" @click="confirmDraft">全部加入项目</el-button>
      </div>
    </div>

    <!-- 已入库人物 -->
    <div v-if="characters.length > 0" class="saved-section">
      <el-divider>项目人物（{{ characters.length }} 人）</el-divider>
      <div class="saved-list">
        <div v-for="c in characters" :key="c.id" class="saved-card">
          <div class="saved-header">
            <span class="char-name">{{ c.name }}</span>
            <el-tag size="small">{{ roleLabel(c.rolePosition) }}</el-tag>
            <span class="char-brief">{{ c.personality }}</span>
          </div>
          <div class="char-detail">{{ c.background }}</div>
        </div>
      </div>
    </div>

    <div v-if="!generating && draft.length === 0 && characters.length === 0" class="empty-tip">
      点击「生成人物」让 AI 根据故事蓝图创建人物，或先完成上一步
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 向导 Step 1：人物设计
 * 蓝图关键角色草案 → generateCharacters 细化（requirements 透传）→ 草稿编辑 → 批量写入 lw_story_characters
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Delete } from '@element-plus/icons-vue'
import { useAiGeneration, parseJsonLoose } from '@/composables/useAiGeneration'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'stateChanged'): void
}>()

const ai = useAiGeneration()
const generating = ai.generating
const requirements = ref('')

interface DraftCharacter {
  name: string
  gender: string
  age?: number
  rolePosition: string
  appearance: string
  personality: string
  background: string
  abilities: string
}
const draft = ref<DraftCharacter[]>([])
const characters = ref<any[]>([])

const canGenerate = computed(() => !generating.value)

function roleLabel(pos: string): string {
  const map: Record<string, string> = {
    protagonist: '主角', supporting: '配角', antagonist: '反派', minor: '边缘',
  }
  return map[pos] || pos
}

async function generateCharacters(): Promise<void> {
  draft.value = []
  const eventId = `characters-${props.projectId}-${Date.now()}`

  const ok = await ai.start({
    eventId,
    subscribe: (handlers: { onContent: (c: string) => void; onDone: () => void; onError: (e: string) => void }) =>
      window.electronAPI.longwriting.onGenerateEvent(eventId, (event: { type: string; content?: string; error?: string }) => {
        if (event.type === 'content' && event.content) handlers.onContent(event.content)
        else if (event.type === 'done') handlers.onDone()
        else if (event.type === 'error') handlers.onError(event.error || '生成失败')
      }),
    invoke: async () => {
      const r = await window.electronAPI.longwriting.generateCharacters(
        eventId,
        props.projectId,
        undefined,
        undefined,
        requirements.value.trim() || undefined,
      )
      return { success: r.success, error: r.error }
    },
  })

  if (!ok) {
    ElMessage.error(ai.error.value || '生成失败')
    return
  }

  const parsed = parseJsonLoose(ai.content.value)
  if (!parsed.ok || !Array.isArray(parsed.data)) {
    ElMessage.warning('AI 返回格式不标准，请重试')
    return
  }
  draft.value = parsed.data.map((c: any) => ({
    name: c.name || '',
    gender: c.gender || 'other',
    age: c.age,
    rolePosition: c.rolePosition || 'supporting',
    appearance: c.appearance || '',
    personality: c.personality || '',
    background: c.background || '',
    abilities: c.abilities || '',
  }))
}

/** 批量写入项目（草稿确认） */
async function confirmDraft(): Promise<void> {
  const valid = draft.value.filter(c => c.name.trim())
  if (valid.length === 0) {
    ElMessage.warning('没有可加入的人物（姓名不能为空）')
    return
  }
  let success = 0
  let failed = 0
  for (const c of valid) {
    const r = await window.electronAPI.longwriting.createCharacter({
      projectId: props.projectId,
      name: c.name.trim(),
      gender: c.gender as any,
      age: c.age || 20,
      rolePosition: c.rolePosition as any,
      appearance: c.appearance,
      personality: c.personality,
      background: c.background,
      abilities: c.abilities,
    })
    if (r.success) success++
    else failed++
  }
  draft.value = []
  await loadCharacters()
  emit('stateChanged')
  if (failed > 0) {
    ElMessage.warning(`已加入 ${success} 人，${failed} 人失败`)
  } else {
    ElMessage.success(`已加入 ${success} 位人物`)
  }
}

async function loadCharacters(): Promise<void> {
  const r = await window.electronAPI.longwriting.getCharacters(props.projectId)
  if (r.success) characters.value = r.data || []
}

onMounted(() => {
  loadCharacters()
})
</script>

<style lang="scss" scoped>
.character-design-step {
  max-width: 820px;
  margin: 0 auto;
}

.step-header {
  margin-bottom: 16px;

  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 6px 0;
  }

  .step-desc {
    font-size: 13px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.generate-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  background: var(--bg-color);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.generating-tip {
  margin-top: 12px;
  padding: 12px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
  text-align: center;
}

.draft-section {
  margin-top: 8px;
}

.draft-list,
.saved-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}

.draft-card,
.saved-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 12px;
}

.draft-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.draft-field {
  margin-bottom: 8px;
}

.draft-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.saved-header {
  display: flex;
  align-items: center;
  gap: 8px;

  .char-name {
    font-size: 15px;
    font-weight: 600;
  }

  .char-brief {
    font-size: 12px;
    color: var(--text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.char-detail {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-color-regular);
  line-height: 1.6;
}

.empty-tip {
  text-align: center;
  color: var(--text-color-placeholder);
  padding: 40px 0;
}
</style>
