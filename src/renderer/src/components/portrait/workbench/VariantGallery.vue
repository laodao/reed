<template>
  <div class="variant-gallery">
    <!-- 全身组（空状态时显示生成入口） -->
    <div class="variant-group full-group">
      <div class="group-head">
        <div class="group-title">
          全身像 · 基础形象
          <span class="tag tag-primary">全身</span>
          <span class="tag">由半身扩展 · 面部一致</span>
        </div>
        <el-button
          v-if="fullVariants.length > 0"
          size="small"
          @click="$emit('open-fullbody')"
        >🔄 重新生成</el-button>
        <el-button
          v-else
          size="small"
          type="primary"
          :disabled="!hasHalfSource"
          @click="$emit('open-fullbody')"
        >＋ 生成全身像</el-button>
      </div>

      <!-- 空状态 -->
      <div v-if="fullVariants.length === 0" class="empty-full">
        <div class="empty-ico">⬇</div>
        <div class="empty-text">
          <div class="empty-title">尚未生成全身像</div>
          <div class="empty-desc">基于当前半身扩展，保持面部一致</div>
        </div>
        <el-button type="primary" size="small" :disabled="!hasHalfSource" @click="$emit('open-fullbody')">
          生成全身像
        </el-button>
      </div>

      <!-- 有全身像 -->
      <div v-else class="variant-row">
        <div v-for="v in fullVariants" :key="v.id" class="variant-card">
          <el-image :src="v.imagePath" fit="cover" class="v-img" @dblclick="$emit('preview', v)" />
          <div class="v-meta">
            <span class="v-angle">{{ ANGLE_LABELS[v.angle] }}</span>
            <div class="v-acts">
              <el-button size="small" circle title="下载" @click="download(v)">⬇</el-button>
              <el-button size="small" circle title="删除" @click="remove(v)">🗑</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 半身组 -->
    <div class="variant-group">
      <div class="group-head">
        <div class="group-title">
          半身像 · 基础形象
          <span class="tag tag-primary">半身</span>
          <span v-if="halfAnglesComplete" class="tag tag-success">完整四角度</span>
        </div>
      </div>
      <div class="variant-row">
        <div v-for="v in halfBaseVariants" :key="v.id" class="variant-card">
          <el-image :src="v.imagePath" fit="cover" class="v-img" @dblclick="$emit('preview', v)" />
          <div class="v-meta">
            <span class="v-angle">{{ ANGLE_LABELS[v.angle] }}</span>
            <div class="v-acts">
              <el-button size="small" circle title="下载" @click="download(v)">⬇</el-button>
              <el-button size="small" circle title="删除" @click="remove(v)">🗑</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 衍生组（换衣/换背景/面部变体，按 framing 归类展示） -->
    <div v-for="group in derivedGroups" :key="group.id" class="variant-group">
      <div class="group-head">
        <div class="group-title">
          {{ group.title }}
          <span class="tag">{{ FRAMING_LABELS[group.framing] }}</span>
          <span v-if="group.type === 'face'" class="tag tag-accent">面部变体</span>
        </div>
      </div>
      <div class="variant-row">
        <div v-for="v in group.variants" :key="v.id" class="variant-card">
          <el-image :src="v.imagePath" fit="cover" class="v-img" @dblclick="$emit('preview', v)" />
          <div class="v-meta">
            <span class="v-angle">{{ ANGLE_LABELS[v.angle] }}</span>
            <div class="v-acts">
              <el-button size="small" circle title="下载" @click="download(v)">⬇</el-button>
              <el-button size="small" circle title="删除" @click="remove(v)">🗑</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ANGLE_LABELS, FRAMING_LABELS } from '../../../../../shared/types/portrait.types'
import type { PortraitVariant, PortraitFraming } from '../../../../../shared/types/portrait.types'

/**
 * 套图画廊（spec 2026-07-24 D3/D8）：
 * 按 framing 分组（半身组/全身组）+ 衍生组（换衣/换背景/面部）。
 * 全身组空状态时显示「生成全身像」入口。
 */
const props = defineProps<{
  variants: PortraitVariant[]
}>()

const emit = defineEmits<{
  'open-fullbody': []
  'deleted': []
  'preview': [variant: PortraitVariant]
}>()

/** 全身 base variants */
const fullVariants = computed(() =>
  props.variants.filter(v => (v.framing ?? 'full') === 'full' && v.type === 'base')
)

/** 半身 base variants */
const halfBaseVariants = computed(() =>
  props.variants.filter(v => v.framing === 'half' && v.type === 'base')
)

/** 是否存在可作为全身生成来源的半身形象 */
const hasHalfSource = computed(() => halfBaseVariants.value.length > 0)

/** 半身是否已凑齐四角度 */
const halfAnglesComplete = computed(() => {
  const angles = new Set(halfBaseVariants.value.map(v => v.angle))
  return angles.has('front') && angles.has('left') && angles.has('right') && angles.has('back')
})

/** 衍生组（clothes/background/face，按 parentId 聚合） */
const derivedGroups = computed(() => {
  const groups = new Map<string, {
    id: string
    title: string
    type: string
    framing: PortraitFraming
    variants: PortraitVariant[]
  }>()

  for (const v of props.variants) {
    if (v.type === 'base') continue
    const groupId = v.angle === 'front' ? v.id : (v.parentId || v.id)
    if (!groups.has(groupId)) {
      let title = '衍生形象'
      if (v.type === 'clothes') title = `换衣：${v.variantInfo?.clothesDescription || ''}`
      else if (v.type === 'background') title = `换背景：${v.variantInfo?.backgroundDescription || ''}`
      else if (v.type === 'face') title = `面部变体：${v.variantInfo?.faceDescription || '模板生成'}`
      groups.set(groupId, {
        id: groupId,
        title,
        type: v.type,
        framing: v.framing ?? 'full',
        variants: []
      })
    }
    groups.get(groupId)!.variants.push(v)
  }

  const angleOrder: Record<string, number> = { front: 0, left: 1, right: 2, back: 3 }
  const result = Array.from(groups.values())
  for (const g of result) {
    g.variants.sort((a, b) => (angleOrder[a.angle] ?? 99) - (angleOrder[b.angle] ?? 99))
  }
  return result
})

async function download(variant: PortraitVariant) {
  try {
    let imagePath = variant.imagePath
    if (imagePath.startsWith('local-image:///')) {
      imagePath = imagePath.replace('local-image:///', '')
      if (imagePath.includes('/') && !imagePath.includes('\\')) {
        imagePath = imagePath.replace(/\//g, '\\')
      }
    }
    const parts = imagePath.replace(/\\/g, '/').split('/')
    const fileName = parts[parts.length - 1] || `portrait_${variant.angle}.png`

    const saveResult = await window.electronAPI.file.saveFile({
      defaultPath: fileName,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })
    if (!saveResult.success || !saveResult.filePath) return

    const copyResult = await window.electronAPI.file.copyFile(imagePath, saveResult.filePath)
    if (copyResult.success) {
      ElMessage.success(`保存成功：${saveResult.filePath}`)
    } else {
      ElMessage.error(copyResult.error || '保存失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '下载失败')
  }
}

async function remove(variant: PortraitVariant) {
  try {
    await ElMessageBox.confirm('确定要删除此图片吗？', '删除确认', { type: 'warning' })
    const result = await window.electronAPI.portrait.deleteVariant(variant.id)
    if (result.success) {
      ElMessage.success('删除成功')
      emit('deleted')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}
</script>

<style lang="scss" scoped>
.variant-gallery {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 14px);
}

.variant-group {
  background: var(--bg-color-card);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md, 16px);
  box-shadow: var(--shadow-xs, var(--shadow-sm));
}

.full-group {
  border-left: 3px solid var(--color-primary);
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--fill-color);
  color: var(--text-secondary);
}

.tag-primary {
  background: var(--color-primary-light-9);
  color: var(--color-primary);
}

.tag-success {
  background: var(--color-success-light-9);
  color: var(--color-success);
}

.tag-accent {
  background: var(--color-purple-light-9);
  color: var(--color-purple);
}

.empty-full {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--color-primary-light-9);
  border: 1px dashed var(--color-primary-light-5);
  border-radius: var(--radius-md);

  .empty-ico {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--fill-color-blank);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }

  .empty-text {
    flex: 1;
  }

  .empty-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
  }
}

.variant-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.variant-card {
  flex-shrink: 0;
  width: 152px;
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-color-card);
  transition: box-shadow var(--transition-fast);

  &:hover {
    box-shadow: var(--shadow-md);
  }
}

.v-img {
  width: 100%;
  height: 196px;
  cursor: pointer;
  background: var(--fill-color);
}

.v-meta {
  padding: 7px 9px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.v-angle {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.v-acts {
  display: flex;
  gap: 3px;
}
</style>
