<template>
  <div class="ep-creator">
    <!-- 顶部：面包屑 + 标题 + 副标题 -->
    <div class="creator-header">
      <div class="breadcrumb">
        <span class="crumbs">{{ projectName }}</span>
        <span class="sep">·</span>
        <span class="crumbs">SCRIPT PLAY</span>
      </div>
      <h1 class="page-title">剧本</h1>
      <p class="page-sub">剧情剧本 → 定稿 → 一键分镜</p>
    </div>

    <!-- 左右两栏 -->
    <div class="creator-body">
      <!-- 左：上传剧本 -->
      <div class="col">
        <div class="col-card">
          <div class="col-head">
            <div class="col-icon upload-icon"><el-icon :size="22"><Upload /></el-icon></div>
            <h3 class="col-title">上传剧本</h3>
          </div>
          <p class="col-desc">拖拽或选择 .txt / .docx 文件，自动解析为场次与对白。</p>
          <button class="choose-file" @click="onChooseFile">
            <span>选择文件</span>
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
      </div>

      <!-- 右：AI 生成剧本 -->
      <div class="col">
        <div class="col-card">
          <div class="col-head">
            <div class="col-icon ai-icon"><el-icon :size="22"><MagicStick /></el-icon></div>
            <h3 class="col-title">AI 生成剧本</h3>
          </div>
          <p class="col-desc">输入创意与节奏，AI 直接生成剧本，进入后可编辑。</p>

          <div class="field">
            <label class="field-label">创意 / 梗概</label>
            <el-input
              v-model="form.summary"
              type="textarea"
              :rows="4"
              resize="none"
              placeholder="如：被陷害开除的女设计师，忽然三年后获得逆袭复仇公司……"
            />
          </div>

          <div class="field">
            <label class="field-label">节奏回调</label>
            <el-select v-model="form.tempo" style="width: 100%" placeholder="选择节奏">
              <el-option label="快节奏反转" value="fast" />
              <el-option label="中段慢热" value="medium" />
              <el-option label="慢热铺垫" value="slow" />
            </el-select>
          </div>

          <div class="field">
            <label class="field-label">主要角色设定</label>
            <el-input
              v-model="form.characters"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="如：林夏（女主·冷静克制）/ 顾承泽（男主·冷酷总裁）"
            />
          </div>

          <!-- 剧集标题 -->
          <div class="field">
            <label class="field-label">剧集标题 <span class="opt">可选</span></label>
            <el-input v-model="form.title" placeholder="如：第一集·逆袭开始" />
          </div>

          <el-button type="primary" :loading="generating" :disabled="!form.summary.trim()" @click="onAiGenerate">
            <el-icon><MagicStick /></el-icon>
            生成剧本
          </el-button>

          <div v-if="error" class="error-msg">{{ error }}</div>
        </div>
      </div>
    </div>

    <!-- loading 覆盖（生成中） -->
    <el-overlay v-if="generating" class="gen-overlay">
      <div class="gen-box">
        <el-icon class="is-loading" :size="30"><Loading /></el-icon>
        <p>{{ genStep }}</p>
      </div>
    </el-overlay>
  </div>
</template>

<script setup lang="ts">
/**
 * 剧集制作 · 无剧本空项目首页 · 剧本创建页（参照无剧本空项目首页.png）。
 * 左右两栏：上传剧本 / AI 生成剧本。两者都会创建第一集并进工作台。
 * 复用后端：createEpisode(uploaded) → identifyEntities（若配模型）→ generateScript → generateScenes。
 */
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Upload, MagicStick, ArrowRight, Loading } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const projectId = (route.params.projectId as string) || ''

const projectName = ref('')
const generating = ref(false)
const genStep = ref('')
const error = ref('')

const form = ref({
  summary: '',
  tempo: 'fast',
  characters: '',
  title: '',
})

async function loadProject(): Promise<void> {
  const r = await window.electronAPI.episodeProduction.getProject(projectId)
  if (r.success) projectName.value = r.data?.name || ''
}

/** 上传剧本（.txt/.docx） */
async function onChooseFile(): Promise<void> {
  try {
    // 复用 analyzeScriptFile：选文件 → 提取文本 → 按章节拆集
    const r = await window.electronAPI.episodeProduction.analyzeScriptFile()
    if (!r.success) { error.value = r.error || '分析失败'; return }
    const data = r.data as { episodes: Array<{ title: string; content: string }> }
    await createFirstEpisode(data.episodes[0]?.content || '', data.episodes[0]?.title || '第一集')
  } catch (e: any) {
    error.value = e?.message || '选择文件失败'
  }
}

/** AI 生成剧本 */
async function onAiGenerate(): Promise<void> {
  if (!form.value.summary.trim()) return
  // 把创意/梗概 + 角色设定拼成第一集的原始内容（真实走 generateScript 转正式剧本）
  const content = [
    form.value.summary.trim(),
    form.value.characters.trim() ? `主要角色设定：${form.value.characters.trim()}` : '',
  ].filter(Boolean).join('\n')
  await createFirstEpisode(content, form.value.title.trim() || '第一集')
}

/** 创建第一集 → 识别 → 生成剧本 → 拆场景 → 进工作台 */
async function createFirstEpisode(content: string, title: string): Promise<void> {
  error.value = ''
  generating.value = true
  genStep.value = '创建剧集…'
  try {
    const epResp = await window.electronAPI.episodeProduction.createEpisode(projectId, {
      sourceType: 'uploaded',
      uploadedContent: content,
      episodeNumber: 1,
      title,
    })
    if (!epResp.success || !epResp.data) { error.value = epResp.error || '创建剧集失败'; generating.value = false; return }
    const episodeId = epResp.data.id

    // 识别资产（可选，需配模型；失败不阻断）
    try {
      genStep.value = 'AI 识别角色 / 地点 / 物品…'
      const proj = await window.electronAPI.episodeProduction.getProject(projectId)
      const sm = proj.data?.config?.scriptModel
      if (sm?.providerConfigId && sm?.modelId) {
        await window.electronAPI.episodeProduction.batchIdentifyEntities({
          projectId,
          episodeIds: [episodeId],
          providerConfigId: sm.providerConfigId,
          modelId: sm.modelId,
        })
      }
    } catch { /* 忽略识别失败 */ }

    // 生成剧本 → 拆场景
    genStep.value = 'AI 生成剧本…'
    const scriptResp = await window.electronAPI.episodeProduction.generateScript(episodeId)
    if (!scriptResp.success) { error.value = scriptResp.error || '生成剧本失败'; generating.value = false; return }
    const scriptId = scriptResp.data?.script?.id
    if (scriptId) {
      genStep.value = '拆分场景…'
      await window.electronAPI.episodeProduction.generateScenes(scriptId).catch(() => null)
    }

    // 进工作台（剧本 tab）
    router.replace(`/episode-production/${projectId}/studio/${episodeId}`)
    ElMessage.success('剧本已生成，进入工作台')
  } catch (e: any) {
    error.value = e?.message || '生成失败'
  } finally {
    generating.value = false
  }
}

onMounted(() => void loadProject())
</script>

<style lang="scss" scoped>
.ep-creator {
  height: 100%;
  overflow-y: auto;
  padding: 28px 40px 40px;
  background: var(--bg-color-page);
}

.creator-header {
  .breadcrumb { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 12px; color: var(--text-color-secondary); .sep { opacity: .5; } }
  .page-title { margin: 0 0 6px; font-size: 26px; font-weight: 700; color: var(--text-color-primary); }
  .page-sub { margin: 0 0 24px; font-size: 13px; color: var(--text-color-secondary); }
}

.creator-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  max-width: 1080px;
}

.col-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: 22px 24px;
  box-shadow: var(--shadow-sm);
}

.col-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.col-icon {
  width: 46px; height: 46px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  &.upload-icon { background: var(--fill-color-light); color: var(--text-color-secondary); }
  &.ai-icon { background: var(--color-danger-light-9); color: var(--color-danger); }
}
.col-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-color-primary); }

.col-desc { margin: 0 0 16px; font-size: 13px; color: var(--text-color-secondary); line-height: 1.7; }

.choose-file {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
  padding: 6px 0;
  &:hover { opacity: .8; }
}

.field { margin-bottom: 14px; }
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-bottom: 6px;
  .opt { font-weight: 400; color: var(--text-color-placeholder); margin-left: 4px; }
}

.error-msg { margin-top: 12px; font-size: 13px; color: var(--color-danger); background: var(--color-danger-light-9); padding: 8px 12px; border-radius: var(--radius-md); }

.gen-overlay { display: flex; align-items: center; justify-content: center; }
.gen-box {
  background: var(--bg-color);
  border-radius: var(--radius-lg);
  padding: 28px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  .is-loading { color: var(--color-primary); }
  p { margin: 0; font-size: 14px; color: var(--text-color-primary); }
}
</style>
