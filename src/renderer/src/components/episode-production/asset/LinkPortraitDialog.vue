<template>
  <!--
    关联人像对话框：从人像设计（portrait）中选择人物图，
    分别映射到当前资产的正面全身 / 正面半身 / 各角度图 slot。
    左侧点选 slot → 右侧点选人像图 → 确定后批量导入（引用路径，不复制文件）。
  -->
  <el-dialog
    v-model="visible"
    title="关联人像"
    width="720px"
    append-to-body
    destroy-on-close
  >
    <div class="link-body">
      <!-- 左：人像来源选择 + slot 列表 -->
      <div class="link-left">
        <el-select v-model="projectId" placeholder="选择人像项目" size="small" class="w-full" @change="onProjectChange">
          <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="characterId" placeholder="选择人物" size="small" class="w-full" :disabled="!projectId" @change="onCharacterChange">
          <el-option v-for="c in characters" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>

        <div class="slot-title-label">映射到当前资产：</div>
        <div
          v-for="slot in SLOTS"
          :key="slot.label"
          class="slot-row"
          :class="{ active: activeSlot === slot.label, assigned: !!assigned[slot.label] }"
          @click="activeSlot = slot.label"
        >
          <span class="slot-name">{{ slot.title }}</span>
          <img v-if="assigned[slot.label]" :src="toImageUrl(assigned[slot.label].imagePath)" class="slot-thumb" alt="" />
          <span v-else class="slot-empty">未选择</span>
        </div>
      </div>

      <!-- 右：人像图网格 -->
      <div class="link-right">
        <div v-if="!characterId" class="grid-hint">先选择人像项目与人物</div>
        <div v-else-if="variants.length === 0" class="grid-hint">该人物暂无图片</div>
        <div v-else class="variant-grid">
          <div
            v-for="v in variants"
            :key="v.id"
            class="variant-cell"
            :class="{ picked: isPicked(v) }"
            :title="v.angle || v.type"
            @click="onPickVariant(v)"
          >
            <img :src="toImageUrl(v.imagePath)" :alt="v.angle" class="variant-img" />
            <span class="variant-angle">{{ v.angle || v.type }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="assignedCount === 0"
        @click="onSubmit"
      >
        关联（{{ assignedCount }}）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

const props = defineProps<{
  modelValue: boolean
  assetType: 'character' | 'location' | 'item'
  assetId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'submitted'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

/** 当前资产图集 slot → 人像图映射 */
const SLOTS = [
  { label: 'main', title: '正面全身', category: 'main', asMain: true },
  { label: 'front_half', title: '正面半身', category: 'view' },
  { label: 'left_3q', title: '左侧半身', category: 'view' },
  { label: 'right_3q', title: '右侧半身', category: 'view' },
  { label: 'full_left', title: '全景左侧', category: 'view' },
  { label: 'full_right', title: '全景右侧', category: 'view' },
]

const projects = ref<any[]>([])
const characters = ref<any[]>([])
const variants = ref<any[]>([])
const projectId = ref('')
const characterId = ref('')
const activeSlot = ref('main')
const assigned = ref<Record<string, any>>({})
const submitting = ref(false)

const assignedCount = computed(() => Object.keys(assigned.value).length)

watch(visible, (v) => {
  if (v) {
    activeSlot.value = 'main'
    assigned.value = {}
    void loadProjects()
  }
})

async function loadProjects(): Promise<void> {
  try {
    const api = (window as any).electronAPI?.portrait
    const r = await api?.listProjects(1, 100)
    projects.value = r?.success ? (r.data?.projects ?? r.data ?? []) : []
  } catch { projects.value = [] }
}

async function onProjectChange(id: string): Promise<void> {
  characterId.value = ''
  variants.value = []
  assigned.value = {}
  if (!id) return
  try {
    const api = (window as any).electronAPI?.portrait
    const r = await api?.listCharacters(id)
    characters.value = r?.success ? (r.data ?? []) : []
  } catch { characters.value = [] }
}

async function onCharacterChange(id: string): Promise<void> {
  variants.value = []
  assigned.value = {}
  if (!id) return
  try {
    const api = (window as any).electronAPI?.portrait
    const r = await api?.listVariants(id)
    variants.value = r?.success ? (r.data ?? []) : []
  } catch { variants.value = [] }
}

/** 点选人像图 → 分配给当前 slot（重复点取消） */
function onPickVariant(v: any): void {
  const cur = assigned.value[activeSlot.value]
  if (cur && cur.id === v.id) {
    delete assigned.value[activeSlot.value]
    return
  }
  assigned.value[activeSlot.value] = v
}

function isPicked(v: any): boolean {
  return Object.values(assigned.value).some((x: any) => x?.id === v.id)
}

async function onSubmit(): Promise<void> {
  if (submitting.value || assignedCount.value === 0) return
  submitting.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.import?.fromPortrait) { ElMessage.error('import.fromPortrait IPC 未暴露'); return }
    let ok = 0
    for (const slot of SLOTS) {
      const v = assigned.value[slot.label]
      if (!v) continue
      const r = await api.import.fromPortrait({
        variantId: v.id,
        targetAssetType: props.assetType,
        targetAssetId: props.assetId,
        asCategory: slot.category,
        asLabel: slot.label === 'main' ? null : slot.label,
        asMain: slot.asMain,
      })
      if (r?.success) ok++
    }
    ElMessage.success(`已关联 ${ok} 张人像图`)
    emit('submitted')
    visible.value = false
  } catch (e: any) {
    ElMessage.error('关联失败：' + (e?.message ?? '未知错误'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.link-body {
  display: flex;
  gap: 12px;
  min-height: 360px;
}
.link-left {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.w-full { width: 100%; }
.slot-title-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}
.slot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 13px;
}
.slot-row:hover { border-color: var(--el-color-primary); }
.slot-row.active { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.slot-row.assigned { background: var(--el-color-success-light-9); }
.slot-thumb {
  width: 34px; height: 34px; object-fit: cover; border-radius: 4px;
}
.slot-empty {
  font-size: 11px; color: var(--el-text-color-placeholder);
}
.link-right {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
.grid-hint {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  text-align: center;
  padding-top: 60px;
}
.variant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}
.variant-cell {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.variant-cell:hover { border-color: var(--el-color-primary); }
.variant-cell.picked { border-color: var(--el-color-success); box-shadow: 0 0 0 2px var(--el-color-success-light-7); }
.variant-img {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  display: block;
}
.variant-angle {
  position: absolute;
  left: 0; bottom: 0;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-top-right-radius: 4px;
}
</style>
