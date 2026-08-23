<template>
  <div class="idea-input-step">
    <div class="step-header">
      <h2>描述你的故事想法</h2>
      <p class="step-desc">想清楚这三件事，AI 就能帮你搭出故事骨架：<b>主角是谁、想达成什么、最大的阻碍是什么</b></p>
    </div>

    <!-- 创意输入 -->
    <div class="idea-card">
      <el-input
        v-model="coreIdea"
        type="textarea"
        :rows="6"
        placeholder="例如：一个普通少年意外获得一枚能预知三秒未来的玉佩，在修仙宗门大比前发现大师兄是叛徒，他必须在告发与自保之间做出选择……"
        maxlength="2000"
        show-word-limit
      />

      <!-- 可选参数（折叠） -->
      <div class="options-collapse">
        <el-collapse>
          <el-collapse-item title="更多设定选项（可选）" name="options">
            <div class="options-grid">
              <el-form-item label="故事类型">
                <el-select v-model="form.storyType" placeholder="选择类型">
                  <el-option v-for="t in storyTypes" :key="t.value" :label="t.label" :value="t.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="故事风格">
                <el-select v-model="form.style" placeholder="可选" clearable>
                  <el-option v-for="s in styleOptions" :key="s.value" :label="s.label" :value="s.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="目标读者">
                <el-select v-model="form.targetReader" placeholder="可选" clearable>
                  <el-option v-for="r in readerOptions" :key="r.value" :label="r.label" :value="r.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="预估篇幅">
                <el-select v-model="form.estimatedLength" placeholder="可选" clearable>
                  <el-option v-for="l in lengthOptions" :key="l.value" :label="l.label" :value="l.value" />
                </el-select>
              </el-form-item>
            </div>
            <el-form-item label="启用功能">
              <el-checkbox-group v-model="form.enabledFeatures">
                <el-checkbox value="country">国别</el-checkbox>
                <el-checkbox value="faction">阵营</el-checkbox>
                <el-checkbox value="sect">门派</el-checkbox>
                <el-checkbox value="map">地图</el-checkbox>
                <el-checkbox value="skill">技能</el-checkbox>
                <el-checkbox value="item">物品</el-checkbox>
              </el-checkbox-group>
              <div class="feature-hint">勾选的功能将在后续"世界设定"步骤出现</div>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div class="idea-actions">
        <el-button type="primary" size="large" :loading="generating" :disabled="!coreIdea.trim() || generating" @click="generateBlueprint">
          <el-icon v-if="!generating"><MagicStick /></el-icon>
          {{ generating ? 'AI 正在创作故事蓝图...' : '开始创作' }}
        </el-button>
      </div>

      <!-- 生成进度提示（蓝图生成通常需 20-40 秒） -->
      <div v-if="generating" class="generating-progress">
        <el-progress :percentage="100" :indeterminate="true" :stroke-width="4" />
        <p class="progress-text">AI 正在分析你的想法并生成故事蓝图（标题/冲突/角色/场景），通常需要 20-40 秒，请稍候...</p>
      </div>
    </div>

    <!-- 蓝图结果 -->
    <div v-if="blueprint" class="blueprint-card">
      <el-divider>故事蓝图（可编辑）</el-divider>
      <el-form label-width="100px">
        <el-form-item label="故事标题">
          <div class="title-suggestions">
            <el-tag
              v-for="t in blueprint.titleSuggestions"
              :key="t"
              :type="blueprint.selectedTitle === t ? 'primary' : 'info'"
              class="title-tag"
              @click="blueprint.selectedTitle = t"
            >
              {{ t }}
            </el-tag>
          </div>
          <el-input v-model="blueprint.selectedTitle" placeholder="或直接输入标题" style="margin-top: 8px" />
        </el-form-item>
        <el-form-item label="一句话概念">
          <el-input v-model="blueprint.oneLineConcept" type="textarea" :rows="2" placeholder="用一句话概括这个故事" />
        </el-form-item>
        <el-form-item label="核心冲突">
          <el-input v-model="blueprint.coreConflict" type="textarea" :rows="3" placeholder="主角想要什么？阻碍是什么？赌注是什么？" />
        </el-form-item>
        <el-form-item label="关键角色">
          <div v-for="(c, i) in blueprint.keyCharacters" :key="i" class="entity-row">
            <el-input v-model="c.name" placeholder="角色名" style="width: 130px" />
            <el-select v-model="c.role" style="width: 90px" placeholder="定位">
              <el-option label="主角" value="主角" />
              <el-option label="配角" value="配角" />
              <el-option label="反派" value="反派" />
            </el-select>
            <el-input v-model="c.brief" placeholder="简要描述" />
            <el-button type="danger" size="small" :icon="Delete" circle @click="blueprint.keyCharacters.splice(i, 1)" />
          </div>
          <el-button size="small" @click="addCharacter">添加角色</el-button>
        </el-form-item>
        <el-form-item label="预估章节">
          <el-input-number v-model="blueprint.estimatedChapters" :min="1" :max="1000" />
        </el-form-item>
      </el-form>
      <div class="blueprint-actions">
        <el-button @click="blueprint = null">重新生成</el-button>
        <el-button type="success" @click="confirmBlueprint">确认蓝图，进入下一步</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 向导 Step 0：创意起点
 * 大输入框（核心冲突引导）→ AI 生成故事蓝图（复用 generateStoryOverview，字段映射到 StoryOverview）→ 编辑确认
 */
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Delete } from '@element-plus/icons-vue'
import { useAiGeneration, parseJsonLoose } from '@/composables/useAiGeneration'
import type { StoryType } from '../../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'stateChanged'): void
}>()

const ai = useAiGeneration()
const generating = ai.generating

const coreIdea = ref('')
const form = ref({
  storyType: 'other' as string,
  style: '',
  targetReader: '',
  estimatedLength: '',
  enabledFeatures: [] as string[],
})

interface BlueprintCharacter { name: string; role: string; brief: string }
interface Blueprint {
  titleSuggestions: string[]
  selectedTitle: string
  oneLineConcept: string
  coreConflict: string
  keyCharacters: BlueprintCharacter[]
  estimatedChapters: number
}
const blueprint = ref<Blueprint | null>(null)

// 选项（先内置，后续可从字典加载）
const storyTypes = [
  { label: '武侠', value: 'wuxia' }, { label: '仙侠', value: 'xianxia' },
  { label: '玄幻', value: 'xuanhuan' }, { label: '科幻', value: 'kehuan' },
  { label: '悬疑', value: 'xuanyi' }, { label: '都市', value: 'dushi' },
  { label: '言情', value: 'yanqing' }, { label: '历史', value: 'lishi' }, { label: '其他', value: 'other' },
]
const styleOptions = [
  { label: '轻松幽默', value: 'light' }, { label: '沉重深刻', value: 'heavy' },
  { label: '热血激昂', value: 'passionate' }, { label: '冷峻沉稳', value: 'calm' },
  { label: '通俗易懂', value: 'popular' }, { label: '文学性强', value: 'literary' },
]
const readerOptions = [
  { label: '青少年', value: 'teenager' }, { label: '青年', value: 'youth' },
  { label: '中年', value: 'middle' }, { label: '全年龄', value: 'all' },
]
const lengthOptions = [
  { label: '短篇（5万字以下）', value: 'short' },
  { label: '中篇（5-20万字）', value: 'medium' },
  { label: '长篇（20万字以上）', value: 'long' },
]

async function generateBlueprint(): Promise<void> {
  if (!coreIdea.value.trim()) {
    ElMessage.warning('请先描述你的故事想法')
    return
  }
  if (generating.value) return

  // 先保存基础构思（写 story_overview，供后续生成读取）
  // 注意：必须深拷贝为纯对象，避免 Vue 响应式 proxy 导致 Electron IPC 序列化失败（An object could not be cloned）
  const saveResp = await window.electronAPI.longwriting.updateStoryOverview(props.projectId, JSON.parse(JSON.stringify({
    storyType: form.value.storyType as StoryType,
    coreIdea: coreIdea.value.trim(),
    style: form.value.style || undefined,
    targetReader: form.value.targetReader || undefined,
    estimatedLength: form.value.estimatedLength || undefined,
    enabledFeatures: form.value.enabledFeatures,
    isSaved: true,
  })))
  if (!saveResp.success) {
    ElMessage.error(saveResp.error || '保存构思失败')
    return
  }

  const eventId = `idea-${props.projectId}-${Date.now()}`
  const input = `故事类型：${storyTypes.find(t => t.value === form.value.storyType)?.label || '未指定'}
核心构思：${coreIdea.value.trim()}
${form.value.style ? `风格：${styleOptions.find(s => s.value === form.value.style)?.label || form.value.style}` : ''}
${form.value.targetReader ? `目标读者：${readerOptions.find(r => r.value === form.value.targetReader)?.label || form.value.targetReader}` : ''}
${form.value.estimatedLength ? `预估篇幅：${lengthOptions.find(l => l.value === form.value.estimatedLength)?.label || form.value.estimatedLength}` : ''}

请以"故事蓝图"的形式输出：标题建议、一句话概念、核心冲突（主角想要什么/阻碍/赌注）、关键角色草案、预估章节数。`

  const ok = await ai.start({
    eventId,
    subscribe: (handlers: { onContent: (c: string) => void; onDone: () => void; onError: (e: string) => void }) =>
      window.electronAPI.longwriting.onGenerateEvent(eventId, (event: { type: string; content?: string; error?: string }) => {
        if (event.type === 'content' && event.content) handlers.onContent(event.content)
        else if (event.type === 'done') handlers.onDone()
        else if (event.type === 'error') handlers.onError(event.error || '生成失败')
      }),
    invoke: async () => {
      // 模型由后端兜底（默认提供商第一文本模型）
      const r = await window.electronAPI.longwriting.generateStoryOverview(eventId, props.projectId, input)
      return { success: r.success, error: r.error }
    },
  })

  if (!ok) {
    ElMessage.error(ai.error.value || '生成失败')
    return
  }
  parseIntoBlueprint(ai.content.value)
}

function parseIntoBlueprint(content: string): void {
  const parsed = parseJsonLoose(content)
  if (!parsed.ok) {
    ElMessage.warning('AI 返回格式不标准，请重试')
    return
  }
  const data = parsed.data
  const title = data.title || data.selectedTitle || ''
  const titles = data.titleSuggestions?.length
    ? data.titleSuggestions
    : title
      ? [title, `${title}传`, `${title}录`]
      : ['未命名故事']
  blueprint.value = {
    titleSuggestions: titles,
    selectedTitle: title || titles[0],
    oneLineConcept: data.oneLineConcept || data.summary || '',
    coreConflict: data.coreConflict || '',
    keyCharacters: data.keyCharacters || [],
    estimatedChapters: data.estimatedChapters || 20,
  }
  emit('stateChanged')
}

function addCharacter(): void {
  if (blueprint.value) {
    blueprint.value.keyCharacters.push({ name: '', role: '配角', brief: '' })
  }
}

/** 确认蓝图：写入 story_overview（summary=一句话概念、isLocked=true） */
async function confirmBlueprint(): Promise<void> {
  if (!blueprint.value) return
  const b = blueprint.value
  const finalTitle = b.selectedTitle?.replace(/[《》]/g, '') || '未命名故事'

  // 深拷贝为纯对象（响应式 proxy → IPC 序列化失败）
  const result = await window.electronAPI.longwriting.updateStoryOverview(props.projectId, JSON.parse(JSON.stringify({
    title: finalTitle,
    storyType: form.value.storyType as StoryType,
    coreIdea: coreIdea.value.trim(),
    style: form.value.style || undefined,
    targetReader: form.value.targetReader || undefined,
    estimatedLength: form.value.estimatedLength || undefined,
    enabledFeatures: form.value.enabledFeatures,
    summary: b.oneLineConcept,
    coreConflict: b.coreConflict,
    keyCharacters: b.keyCharacters.map(c => ({
      name: c.name,
      role: c.role,
      brief: c.brief,
      importance: c.role === '主角' ? 'main' : c.role === '反派' ? 'main' : 'secondary',
    })),
    estimatedChapters: b.estimatedChapters,
    isSaved: true,
    isLocked: true,
  })))

  if (result.success) {
    ElMessage.success('故事蓝图已确认')
    emit('stateChanged')
  } else {
    ElMessage.error(result.error || '确认失败')
  }
}

onMounted(async () => {
  // 加载已保存的构思（重进项目时回填）
  const r = await window.electronAPI.longwriting.getStoryOverview(props.projectId)
  if (r.success && r.data) {
    coreIdea.value = r.data.coreIdea || ''
    if (r.data.storyType) form.value.storyType = r.data.storyType
    if (r.data.style) form.value.style = r.data.style
    if (r.data.targetReader) form.value.targetReader = r.data.targetReader
    if (r.data.estimatedLength) form.value.estimatedLength = r.data.estimatedLength
    if (r.data.enabledFeatures) form.value.enabledFeatures = r.data.enabledFeatures
    if (r.data.summary || r.data.coreConflict) {
      blueprint.value = {
        titleSuggestions: r.data.title ? [r.data.title] : [],
        selectedTitle: r.data.title || '',
        oneLineConcept: r.data.summary || '',
        coreConflict: r.data.coreConflict || '',
        keyCharacters: r.data.keyCharacters || [],
        estimatedChapters: r.data.estimatedChapters || 20,
      }
    }
  }
})
</script>

<style lang="scss" scoped>
.idea-input-step {
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
    line-height: 1.6;
  }
}

.idea-card {
  background: var(--bg-color);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.options-collapse {
  margin-top: 12px;

  .options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 16px;
  }
}

.feature-hint {
  font-size: 12px;
  color: var(--text-color-placeholder);
}

.idea-actions {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.generating-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;

  .progress-text {
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-color-secondary);
    text-align: center;
  }
}

.blueprint-card {
  margin-top: 24px;
  background: var(--bg-color);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--color-primary-light-5);
}

.title-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .title-tag {
    cursor: pointer;
  }
}

.entity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  width: 100%;
}

.blueprint-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}
</style>
