<template>
  <div class="mp-panel">
    <p class="mp-desc">{{ definition.description }}</p>

    <el-skeleton v-if="loading" :rows="4" animated />

    <template v-else>
      <template v-for="group in renderGroups" :key="group.title">
        <el-divider content-position="left">{{ group.title }}</el-divider>
        <p v-if="group.description" class="mp-group-desc">{{ group.description }}</p>

        <!-- 普通参数行（数字 / 布尔） -->
        <div v-for="block in group.blocks" :key="block.key" class="mp-block">
          <template v-if="block.kind === 'param' && block.entry">
            <div class="mp-row">
              <div class="mp-label">
                <span>
                  {{ block.entry.label }}
                  <el-tag v-if="block.entry.touched" size="small" type="warning" effect="plain">已自定义</el-tag>
                </span>
                <span class="mp-hint">{{ block.entry.hint }}</span>
                <span class="mp-meta">{{ metaOf(block.entry) }}</span>
              </div>

              <div class="mp-control">
                <el-switch
                  v-if="block.entry.kind === 'boolean'"
                  :model-value="block.entry.value === true"
                  @update:model-value="(v: string | number | boolean) => setValue(block.entry!, v === true)"
                />
                <el-input-number
                  v-else
                  :model-value="block.entry.value as number"
                  :min="block.entry.zeroMeansDisabled ? 0 : block.entry.floor ?? 1"
                  :max="block.entry.ceiling"
                  :step="block.entry.step ?? 1"
                  size="small"
                  controls-position="right"
                  @update:model-value="(v: number | undefined) => setValue(block.entry!, v)"
                />
                <el-button
                  v-if="block.entry.touched"
                  text
                  size="small"
                  title="恢复为内置默认（跟随默认值，将来默认升级能吃到）"
                  @click="resetEntry(block.entry!)"
                >
                  跟随默认
                </el-button>
              </div>
            </div>
          </template>

          <!-- 记录型参数（键 → 次数）：逐行 + 可新增自定义键 -->
          <template v-else-if="block.kind === 'map' && block.entries">
            <div class="mp-map-title">
              <span class="mp-label-text">{{ block.label }}</span>
              <el-button
                v-if="block.allowCustomKeys"
                text
                size="small"
                type="primary"
                @click="openAddKey(block.mapPath!)"
              >
                + 添加自定义项
              </el-button>
            </div>
            <p class="mp-hint mp-map-hint">{{ block.hint }}</p>

            <div v-for="entry in block.entries" :key="entry.valueKey" class="mp-row mp-map-row">
              <div class="mp-label">
                <span>
                  <code class="mp-key">{{ entry.mapKey }}</code>
                  <span class="mp-key-label">{{ entry.label }}</span>
                  <el-tag v-if="entry.touched" size="small" type="warning" effect="plain">已自定义</el-tag>
                </span>
                <span class="mp-meta">内置 {{ entry.default }}，上限 {{ entry.ceiling }}</span>
              </div>
              <div class="mp-control">
                <el-input-number
                  :model-value="entry.value as number"
                  :min="1"
                  :max="entry.ceiling"
                  :step="entry.step ?? 1"
                  size="small"
                  controls-position="right"
                  @update:model-value="(v: number | undefined) => setValue(entry, v)"
                />
                <el-button v-if="entry.touched" text size="small" @click="resetEntry(entry)">跟随默认</el-button>
                <el-button
                  v-if="entry.isCustom"
                  text
                  size="small"
                  type="danger"
                  title="删除这个自定义项"
                  @click="resetEntry(entry)"
                >
                  删除
                </el-button>
              </div>
            </div>

            <!-- 新增自定义键 -->
            <div v-if="addingMapPath === block.mapPath" class="mp-row mp-add-row">
              <div class="mp-label">
                <el-input v-model="newKey" size="small" placeholder="键名（如工具注册名 my_tool，小写+下划线）" class="mp-add-key" />
              </div>
              <div class="mp-control">
                <el-input-number v-model="newValue" :min="1" :max="mapCeiling(block.mapPath!)" size="small" controls-position="right" />
                <el-button text size="small" type="primary" @click="confirmAddKey(block.mapPath!)">添加</el-button>
                <el-button text size="small" @click="addingMapPath = ''">取消</el-button>
              </div>
            </div>
          </template>
        </div>
      </template>

      <!-- 夹取/回落/一致性修正说明：用户改的值没被完整采纳时如实提示 -->
      <el-alert
        v-if="notes.length"
        class="mp-notes"
        type="warning"
        :closable="false"
        show-icon
        :title="`有 ${notes.length} 处未按你填的值生效`"
      >
        <ul class="mp-note-list">
          <li v-for="(n, i) in notes" :key="i">{{ n }}</li>
        </ul>
      </el-alert>

      <div class="mp-actions">
        <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">
          {{ dirty ? '保存' : '已是最新' }}
        </el-button>
        <el-button :disabled="saving" @click="restoreDefaults">恢复本模块默认</el-button>
        <span class="mp-hint">{{ effectSummary }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 单个模块的参数面板（设置页「参数设置」里一个 Tab 的内容）
 * @module components/settings/ModuleParamPanel
 *
 * 完全由登记表（`ModuleParamDefinition`）驱动，不写死任何具体参数：
 * 控件按 `kind` 选（number → 数字框、boolean → 开关、numberMap → 逐行 + 可加自定义键）。
 *
 * ── 保存语义（关键）──
 * 同一 settings 键可能被**多个模块**共用（如 `agent:budget` 被 5 个模块用到），
 * 所以保存**不能**把本模块手里的整份载荷写回去（会把别的 Tab 的改动覆盖掉）。
 * 做法：保存前**现读**该键的最新载荷，只把**本模块用户碰过的字段**合并进去再写回。
 * 用户没碰过的字段一律不写（保持"跟随内置默认"，将来默认值升级能吃到）。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  ModuleParamDefinition,
  ModuleParamEntry,
  ResolvedModuleParamGroup,
} from '@shared/types/module-params.types'
import {
  DEFAULT_PARAM_KEY_PATTERN,
  moduleParamSettingsKeys,
  pruneEmptyObjects,
  resolveModuleParams,
  writeParamPath,
} from '@shared/utils/module-params'

const props = defineProps<{ definition: ModuleParamDefinition }>()

/** 按键组织的**工作载荷**（读回来的原始载荷 + 本模块的编辑） */
const payload = reactive<Record<string, unknown>>({})
/** 本模块用户碰过的字段：绝对路径 → 值（undefined = 复位为默认/删除该键） */
const touchedPaths = reactive(new Map<string, { settingsKey: string; value: number | boolean | undefined }>())
const loading = ref(false)
const saving = ref(false)

const addingMapPath = ref('')
const newKey = ref('')
const newValue = ref(1)

function apiAny(): any {
  return (window as unknown as { electronAPI?: any }).electronAPI
}

/**
 * 该模块用到的 settings 键（**走框架的同一份口径**：参数级/分组级/模块级 settingsKey 都能识别）。
 * 一个 Tab 可以覆盖多个键（如「上下文与记忆」= agent:context + agent:memory）。
 */
const settingsKeys = computed(() => moduleParamSettingsKeys(props.definition))

const resolved = computed(() => resolveModuleParams(props.definition, payload))
const notes = computed(() => resolved.value.notes)
const dirty = computed(() => touchedPaths.size > 0)

/** 生效时机汇总（同一模块内可能混合，按需列出） */
const effectSummary = computed(() => {
  const kinds = new Set<string>()
  for (const g of resolved.value.groups) for (const e of g.entries) kinds.add(e.effect)
  const label: Record<string, string> = {
    immediate: '改动立即生效',
    'next-run': '改动下一次运行/下一轮生效',
    restart: '改动需重启客户端生效',
  }
  return [...kinds].map((k) => label[k] ?? k).join('；')
})

/** 渲染模型：把分组里的连续 numberMap 行合成一块 */
interface RenderBlock {
  key: string
  kind: 'param' | 'map'
  entry?: ModuleParamEntry
  entries?: ModuleParamEntry[]
  label?: string
  hint?: string
  mapPath?: string
  allowCustomKeys?: boolean
}

const renderGroups = computed(() =>
  resolved.value.groups.map((g: ResolvedModuleParamGroup) => {
    const blocks: RenderBlock[] = []
    let i = 0
    while (i < g.entries.length) {
      const e = g.entries[i]
      if (e.kind !== 'numberMap') {
        blocks.push({ key: e.valueKey, kind: 'param', entry: e })
        i += 1
        continue
      }
      // 收集同属一张表的连续行
      const mapPath = e.absolutePath.slice(0, e.absolutePath.lastIndexOf('.'))
      const entries: ModuleParamEntry[] = []
      while (i < g.entries.length && g.entries[i].kind === 'numberMap' && g.entries[i].absolutePath.startsWith(`${mapPath}.`)) {
        entries.push(g.entries[i])
        i += 1
      }
      blocks.push({
        key: mapPath,
        kind: 'map',
        entries,
        label: e.mapLabel ?? e.label,
        hint: e.hint,
        mapPath,
        allowCustomKeys: e.allowCustomKeys === true,
      })
    }
    return { title: g.title, description: g.description, blocks }
  }),
)

/** 一行参数的元信息（内置默认 / 上限 / 单位 / 生效时机） */
function metaOf(entry: ModuleParamEntry): string {
  const parts: string[] = []
  if (entry.kind === 'number') {
    parts.push(`内置 ${entry.default}`)
    if (entry.kind === 'number' && entry.zeroMeansDisabled) parts.push('0 = 不启用')
    parts.push(`上限 ${entry.ceiling}`)
  }
  if (entry.unit) parts.push(entry.unit)
  return parts.join('，')
}

function mapCeiling(mapPath: string): number {
  for (const g of resolved.value.groups) {
    for (const e of g.entries) {
      if (e.kind === 'numberMap' && e.absolutePath.startsWith(`${mapPath}.`)) return e.ceiling ?? 200
    }
  }
  return 200
}

/** 写一个字段（记进 touchedPaths，同时更新工作载荷） */
function setValue(entry: ModuleParamEntry, value: number | boolean | undefined): void {
  const next = value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? undefined : value
  touchedPaths.set(entry.absolutePath, { settingsKey: entry.settingsKey, value: next })
  payload[entry.settingsKey] = writeParamPath(payload[entry.settingsKey], entry.absolutePath, next)
}

/** 复位一个字段为内置默认（从载荷里删掉） */
function resetEntry(entry: ModuleParamEntry): void {
  setValue(entry, undefined)
}

function openAddKey(mapPath: string): void {
  addingMapPath.value = mapPath
  newKey.value = ''
  newValue.value = 1
}

function confirmAddKey(mapPath: string): void {
  const key = newKey.value.trim()
  if (!new RegExp(DEFAULT_PARAM_KEY_PATTERN).test(key)) {
    ElMessage.warning('键名只能用小写字母、数字与下划线，且以字母开头（如 my_tool）')
    return
  }
  const absolutePath = `${mapPath}.${key}`
  const settingsKey = settingsKeysOfPath(mapPath)
  if (!settingsKey) return
  touchedPaths.set(absolutePath, { settingsKey, value: newValue.value })
  payload[settingsKey] = writeParamPath(payload[settingsKey], absolutePath, newValue.value)
  addingMapPath.value = ''
}

/** 由 mapPath 反查它属于哪个 settings 键 */
function settingsKeysOfPath(mapPath: string): string | undefined {
  for (const g of resolved.value.groups) {
    for (const e of g.entries) {
      if (e.kind === 'numberMap' && e.absolutePath.startsWith(`${mapPath}.`)) return e.settingsKey
    }
  }
  return undefined
}

async function load(): Promise<void> {
  loading.value = true
  try {
    for (const key of settingsKeys.value) {
      const r = await apiAny()?.settings.get(key)
      payload[key] = r?.success && r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}
    }
    touchedPaths.clear()
  } catch (e) {
    console.error(`[ModuleParamPanel] 读取 ${props.definition.key} 参数失败:`, e)
  } finally {
    loading.value = false
  }
}

/**
 * 保存：现读最新载荷 → 只合并本模块碰过的字段 → 写回。
 * 这样多个模块共用同一个 settings 键时不会互相覆盖。
 */
async function save(): Promise<void> {
  saving.value = true
  try {
    const byKey = new Map<string, Array<{ path: string; value: number | boolean | undefined }>>()
    for (const [path, op] of touchedPaths) {
      const list = byKey.get(op.settingsKey) ?? []
      list.push({ path, value: op.value })
      byKey.set(op.settingsKey, list)
    }
    for (const [key, ops] of byKey) {
      const r = await apiAny()?.settings.get(key)
      let next: Record<string, unknown> =
        r?.success && r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}
      for (const op of ops) next = writeParamPath(next, op.path, op.value)
      const resp = await apiAny()?.settings.set(key, pruneEmptyObjects(next))
      if (resp && resp.success === false) throw new Error(resp.error ?? '保存失败')
    }
    ElMessage.success(notes.value.length ? '已保存（部分值被调整，见下方说明）' : `${props.definition.name}参数已保存`)
    await load()
  } catch (e) {
    console.error(`[ModuleParamPanel] 保存 ${props.definition.key} 参数失败:`, e)
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/** 恢复本模块默认：清掉本模块登记的全部字段（不动同键下其它模块的字段） */
async function restoreDefaults(): Promise<void> {
  saving.value = true
  try {
    for (const key of settingsKeys.value) {
      const r = await apiAny()?.settings.get(key)
      let next: Record<string, unknown> =
        r?.success && r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}
      for (const g of resolved.value.groups) {
        for (const e of g.entries) {
          if (e.settingsKey !== key) continue
          next = writeParamPath(next, e.absolutePath, undefined)
        }
      }
      await apiAny()?.settings.set(key, pruneEmptyObjects(next))
    }
    ElMessage.success('已恢复内置默认')
    await load()
  } catch (e) {
    console.error(`[ModuleParamPanel] 恢复 ${props.definition.key} 默认失败:`, e)
    ElMessage.error('恢复默认失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped lang="scss">
.mp-panel {
  .mp-desc {
    margin: 0 0 8px;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }

  .mp-group-desc {
    margin: 0 0 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .mp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--el-border-color-lighter);
  }

  .mp-label {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 13px;
    color: var(--el-text-color-primary);
  }

  .mp-hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
  }

  .mp-meta {
    font-size: 11.5px;
    color: var(--el-text-color-placeholder);
    margin-top: 2px;
  }

  .mp-control {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;

    :deep(.el-input-number) {
      width: 150px;
    }
  }

  .mp-map-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
  }

  .mp-label-text {
    font-size: 13px;
    font-weight: 600;
  }

  .mp-map-hint {
    margin: 2px 0 4px;
  }

  .mp-map-row {
    padding-left: 10px;
  }

  .mp-key {
    font-family: var(--el-font-family-mono, monospace);
    font-size: 12px;
    color: var(--el-color-primary);
    margin-right: 6px;
  }

  .mp-key-label {
    font-size: 12.5px;
  }

  .mp-add-row {
    background: var(--el-fill-color-lighter);
    padding: 8px 10px;
    border-radius: 4px;
    border-bottom: none;
  }

  .mp-add-key {
    width: 260px;
  }

  .mp-notes {
    margin: 14px 0 4px;
  }

  .mp-note-list {
    margin: 4px 0 0;
    padding-left: 18px;
    font-size: 12.5px;
  }

  .mp-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
  }
}
</style>
