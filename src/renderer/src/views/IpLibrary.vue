<template>
  <div class="ip-library-page">
    <div class="page-header">
      <h1>角色 IP 库</h1>
      <div class="header-desc">独立于故事的人物资产：一次设计，多个故事复用</div>
      <div class="header-actions">
        <el-button type="primary" @click="showWizard = true">
          <el-icon><MagicStick /></el-icon>
          AI 引导创建
        </el-button>
        <el-button @click="openEditor()">
          <el-icon><Plus /></el-icon>
          手动新建
        </el-button>
      </div>
    </div>

    <div v-loading="store.ipsLoading" class="page-content">
      <div v-if="store.ipCharacters.length > 0" class="ip-list">
        <div
          v-for="ip in store.ipCharacters"
          :key="ip.id"
          class="ip-card"
          @click="openDetail(ip.id)"
        >
          <div class="ip-avatar">
            <el-icon size="26"><UserFilled /></el-icon>
          </div>
          <div class="ip-info">
            <h3 class="ip-name">
              {{ ip.name }}
              <el-tag v-if="worldNameOf(ip.worldId)" size="small" type="info">{{ worldNameOf(ip.worldId) }}</el-tag>
            </h3>
            <div class="ip-meta">
              <span v-if="ip.gender">{{ genderLabel(ip.gender) }}</span>
              <span v-if="ip.occupation">{{ ip.occupation }}</span>
            </div>
            <div class="ip-motivation">{{ ip.motivation || '未填写核心欲望' }}</div>
          </div>
          <div class="ip-actions">
            <el-button text type="danger" @click.stop="confirmDelete(ip)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <el-empty description="还没有 IP 角色">
          <el-button type="primary" @click="showWizard = true">AI 引导创建第一个角色</el-button>
        </el-empty>
      </div>
    </div>

    <!-- 编辑对话框（四层人设卡） -->
    <el-dialog v-model="showEditor" :title="editForm.id ? `编辑角色：${editForm.name}` : '新建角色'" width="680px" top="4vh">
      <el-form :model="editForm" label-width="90px" class="ip-editor">
        <div class="layer-title">第一层 · 辨识资讯</div>
        <div class="layer-grid">
          <el-form-item label="姓名" required>
            <el-input v-model="editForm.name" />
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="editForm.gender" clearable style="width: 100%">
              <el-option label="男" value="male" />
              <el-option label="女" value="female" />
              <el-option label="其他" value="other" />
            </el-select>
          </el-form-item>
          <el-form-item label="年龄">
            <el-input v-model="editForm.age" placeholder="如：17 / 不详" />
          </el-form-item>
          <el-form-item label="身份职业">
            <el-input v-model="editForm.occupation" />
          </el-form-item>
        </div>
        <el-form-item label="别名称呼">
          <el-select v-model="editForm.aliases" multiple filterable allow-create default-first-option placeholder="林晓 / 晓哥 / 林师妹" style="width: 100%" />
        </el-form-item>
        <el-form-item label="外貌">
          <el-input v-model="editForm.appearance" type="textarea" :rows="2" />
        </el-form-item>

        <div class="layer-title">第二层 · 内在驱动</div>
        <el-form-item label="性格">
          <el-input v-model="editForm.personality" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="核心欲望">
          <el-input v-model="editForm.motivation" type="textarea" :rows="2" placeholder="他最想要什么（一切行动的引擎）" />
        </el-form-item>
        <el-form-item label="软肋缺陷">
          <el-input v-model="editForm.flaw" type="textarea" :rows="2" placeholder="欲望的反差面——他最怕失去什么" />
        </el-form-item>
        <el-form-item label="背景故事">
          <el-input v-model="editForm.background" type="textarea" :rows="3" />
        </el-form-item>

        <div class="layer-title">第三层 · 能力与世界观定位</div>
        <div class="layer-grid">
          <el-form-item label="所属世界">
            <el-select v-model="editForm.worldId" clearable placeholder="可挂世界观（灵根/序列等题材字段随之生效）" style="width: 100%">
              <el-option v-for="w in store.worlds" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="种族">
            <el-input v-model="editForm.race" />
          </el-form-item>
        </div>
        <el-form-item label="天赋资质">
          <el-input v-model="editForm.talents" type="textarea" :rows="2" placeholder="灵根/体质/血脉（须在所属世界的资质体系内）" />
        </el-form-item>
        <el-form-item label="技能功法">
          <el-input v-model="editForm.abilities" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="标志物品">
          <el-input v-model="editForm.signatureItems" />
        </el-form-item>

        <div class="layer-title">第四层 · 成长弧光</div>
        <el-form-item label="人物弧光">
          <el-input v-model="editForm.characterArc" type="textarea" :rows="2" placeholder="他的信念将发生什么不可逆转变" />
        </el-form-item>
        <el-form-item label="口头禅">
          <el-select v-model="editForm.catchphrases" multiple filterable allow-create default-first-option placeholder="输入后回车添加" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditor = false">取消</el-button>
        <el-button type="primary" :disabled="!editForm.name" @click="saveIp">保存</el-button>
      </template>
    </el-dialog>

    <!-- 交互式创建向导（2026-09-25：AI 每层提案、用户逐步确认，替代一次性复杂表单） -->
    <IpCreateWizard
      :visible="showWizard"
      :worlds="store.worlds"
      @close="showWizard = false"
      @created="onWizardCreated"
    />

    <!-- 详情抽屉 -->
    <el-drawer v-model="showDetail" :title="detail?.name || '角色详情'" size="46%">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <div class="detail-meta">
            <span class="meta-count">被 {{ detail.referencingProjects }} 个项目引用</span>
          </div>
          <div class="section">
            <div class="section-title">档案</div>
            <div class="kv"><span class="k">性别</span><span>{{ genderLabel(detail.gender || '') || '—' }}</span></div>
            <div class="kv"><span class="k">年龄</span><span>{{ detail.age || '—' }}</span></div>
            <div class="kv"><span class="k">身份</span><span>{{ detail.occupation || '—' }}</span></div>
            <div class="kv"><span class="k">性格</span><span>{{ detail.personality || '—' }}</span></div>
            <div class="kv"><span class="k">核心欲望</span><span>{{ detail.motivation || '—' }}</span></div>
            <div class="kv"><span class="k">软肋</span><span>{{ detail.flaw || '—' }}</span></div>
            <div class="kv"><span class="k">背景</span><span>{{ detail.background || '—' }}</span></div>
            <div class="kv"><span class="k">天赋</span><span>{{ detail.talents || '—' }}</span></div>
            <div class="kv"><span class="k">技能</span><span>{{ detail.abilities || '—' }}</span></div>
            <div class="kv"><span class="k">弧光</span><span>{{ detail.characterArc || '—' }}</span></div>
          </div>
          <div class="section" v-if="detail.edges.length > 0">
            <div class="section-title">原型关系</div>
            <div v-for="edge in detail.edges" :key="edge.id" class="kv">
              <span class="k">{{ edge.relationType }}</span>
              <span>{{ edge.description || edge.label || edge.targetId }}</span>
            </div>
          </div>
          <div class="section">
            <div class="section-title">出场故事</div>
            <div v-if="projectUsages.length === 0" class="kind-empty">尚未被任何项目导入</div>
            <div v-for="usage in projectUsages" :key="usage.id" class="kv">
              <span class="k">项目</span><span>{{ usage.projectName || usage.projectId }}</span>
            </div>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, UserFilled, MagicStick } from '@element-plus/icons-vue'
import { useLwLibraryStore } from '@/stores/lw-library'
import IpCreateWizard from '@/components/longwriting/library/IpCreateWizard.vue'
import type { IpBinding, IpCharacter } from '@shared/types/lw-library.types'

const GENDER_LABELS: Record<string, string> = { male: '男', female: '女', other: '其他' }
const genderLabel = (g: string) => GENDER_LABELS[g] ?? ''

const store = useLwLibraryStore()
const lib = () => window.electronAPI.longwriting.library

const showEditor = ref(false)
const emptyForm = () => ({
  id: '', name: '', gender: '', age: '', race: '', occupation: '',
  aliases: [] as string[], catchphrases: [] as string[],
  appearance: '', personality: '', motivation: '', flaw: '', background: '',
  talents: '', abilities: '', signatureItems: '', characterArc: '',
  worldId: '' as string,
})
const editForm = ref(emptyForm())

const showDetail = ref(false)
const detailLoading = ref(false)
const detail = ref<(IpCharacter & { edges: Array<{ id: string; relationType: string; label: string | null; description: string | null; targetId: string }>; referencingProjects: number }) | null>(null)
const projectUsages = ref<Array<IpBinding & { projectName?: string }>>([])

onMounted(async () => {
  await Promise.all([store.fetchIps(true), store.fetchWorlds(true)])
})

const worldNameOf = (worldId: string | null) =>
  store.worlds.find(w => w.id === worldId)?.name ?? ''

const openEditor = (ip?: IpCharacter) => {
  editForm.value = ip
    ? {
        id: ip.id, name: ip.name, gender: ip.gender ?? '', age: ip.age ?? '', race: ip.race ?? '',
        occupation: ip.occupation ?? '', aliases: [...ip.aliases], catchphrases: [...ip.catchphrases],
        appearance: ip.appearance ?? '', personality: ip.personality ?? '', motivation: ip.motivation ?? '',
        flaw: ip.flaw ?? '', background: ip.background ?? '', talents: ip.talents ?? '',
        abilities: ip.abilities ?? '', signatureItems: ip.signatureItems ?? '',
        characterArc: ip.characterArc ?? '', worldId: ip.worldId ?? '',
      }
    : emptyForm()
  showEditor.value = true
}

const saveIp = async () => {
  const form = editForm.value
  const payload = {
    name: form.name,
    gender: form.gender || null,
    age: form.age || null,
    race: form.race || null,
    occupation: form.occupation || null,
    aliases: form.aliases,
    catchphrases: form.catchphrases,
    appearance: form.appearance || null,
    personality: form.personality || null,
    motivation: form.motivation || null,
    flaw: form.flaw || null,
    background: form.background || null,
    talents: form.talents || null,
    abilities: form.abilities || null,
    signatureItems: form.signatureItems || null,
    characterArc: form.characterArc || null,
    worldId: form.worldId || null,
  }
  if (form.id) {
    await lib().ipUpdate(form.id, payload)
  } else {
    await lib().ipCreate(payload)
  }
  ElMessage.success('已保存')
  showEditor.value = false
  await store.fetchIps(true)
}

const confirmDelete = (ip: IpCharacter) => {
  ElMessageBox.confirm(
    `删除 IP 角色「${ip.name}」？已导入项目的故事角色不受影响。`,
    '删除角色',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).then(async () => {
    await lib().ipDelete(ip.id)
    ElMessage.success('已删除')
    await store.fetchIps(true)
  }).catch(() => {})
}

// ==================== 交互式创建向导 ====================
const showWizard = ref(false)

const onWizardCreated = async () => {
  await store.fetchIps(true)
}

const openDetail = async (id: string) => {
  showDetail.value = true
  detailLoading.value = true
  try {
    detail.value = await lib().ipGet(id)
    const bindings = await lib().listIpProjects(id)
    const projects = await window.electronAPI.longwriting.getProjects()
    const nameById = new Map<string, string>(projects.map((p: { id: string; name: string }) => [p.id, p.name]))
    projectUsages.value = bindings.map((b: { id: string; projectId: string }) => ({ ...b, projectName: nameById.get(b.projectId) }))
  } finally {
    detailLoading.value = false
  }
}

</script>

<style scoped lang="scss">
.ip-library-page {
  padding: 24px 32px;
  height: 100%;
  overflow-y: auto;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;

  h1 {
    margin: 0;
    font-size: 22px;
  }

  .header-desc {
    flex: 1;
    color: var(--text-secondary, #888);
    font-size: 13px;
  }
}

.ip-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.ip-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 10px;
  cursor: pointer;
  transition: box-shadow 0.15s;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .ip-avatar {
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-primary-light-bg, rgba(64, 158, 255, 0.1));
    color: var(--color-primary, #409eff);
  }

  .ip-info {
    flex: 1;
    min-width: 0;

    .ip-name {
      margin: 0 0 4px;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ip-meta {
      display: flex;
      gap: 10px;
      color: var(--text-secondary, #888);
      font-size: 12px;
      margin-bottom: 2px;
    }

    .ip-motivation {
      color: var(--text-secondary, #999);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.empty-state {
  padding: 80px 0;
}

.ip-editor {
  .layer-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--color-primary, #409eff);
    padding: 10px 0 8px;
    border-bottom: 1px dashed var(--border-color, #eee);
    margin-bottom: 12px;
  }

  .layer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
  }
}

.detail-body {
  .detail-meta {
    margin-bottom: 12px;

    .meta-count {
      color: var(--text-secondary, #999);
      font-size: 12px;
    }
  }

  .section {
    margin-bottom: 18px;

    .section-title {
      font-weight: 600;
      font-size: 13px;
      padding-bottom: 6px;
      border-bottom: 1px dashed var(--border-color, #eee);
      margin-bottom: 8px;
    }
  }

  .kv {
    display: flex;
    gap: 12px;
    padding: 4px 0;
    font-size: 13px;

    .k {
      flex-shrink: 0;
      width: 64px;
      color: var(--text-secondary, #999);
    }
  }

  .kind-empty {
    color: var(--text-secondary, #aaa);
    font-size: 12px;
    padding: 6px 0;
  }
}

.stream-preview {
  width: 100%;
  max-height: 140px;
  overflow-y: auto;
  padding: 8px;
  background: var(--fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary, #666);
  word-break: break-all;
}
</style>
