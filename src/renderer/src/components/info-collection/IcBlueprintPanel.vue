<template>
  <div class="bp-panel">
    <el-empty v-if="!blueprint" description="还没有采集蓝图——回到首页重新创建项目" :image-size="72" />
    <template v-else>
      <div class="bp-head">
        <div class="bp-title-row">
          <el-tag size="small" effect="plain">蓝图 v{{ project?.blueprintVersion }}</el-tag>
          <el-tag size="small" :type="blueprint.autoConfirm ? 'success' : 'warning'" effect="plain">
            {{ blueprint.autoConfirm ? '已确认' : '待确认' }}
          </el-tag>
          <span class="bp-hint">
            {{ blueprint.autoConfirm ? '快速模式：口径按默认假设执行，报告中如实展示' : '精调模式：确认后才开跑' }}
          </span>
          <el-button
            v-if="!blueprint.autoConfirm"
            type="success"
            size="small"
            class="bp-confirm"
            :loading="confirming"
            @click="doConfirm"
          >
            确认蓝图（解锁搜集）
          </el-button>
        </div>
        <p class="bp-goal">{{ project?.goal }}</p>
      </div>

      <div class="req-list">
        <div v-for="req in blueprint.requirements" :key="req.id" class="req-line">
          <el-tag size="small" :type="reqTagType(req.priority)" effect="dark" class="req-pri">{{ req.priority }}</el-tag>
          <span class="req-id">{{ req.id }}</span>
          <span class="req-q">{{ req.question }}</span>
          <el-tag v-if="store.coverage[req.id] === true" size="small" type="success" effect="light">已满足</el-tag>
          <el-tag v-else-if="store.coverage[req.id] === false && req.priority !== 'nice'" size="small" type="info" effect="light">
            未满足
          </el-tag>
        </div>
      </div>

      <el-alert v-if="blueprint.assumptions?.length" type="warning" :closable="false" class="bp-assumptions">
        <template #title>口径假设（{{ blueprint.assumptions.length }} 条）——快速模式下这些假设直接生效</template>
        <div v-for="(a, i) in blueprint.assumptions" :key="i" class="assume-line">· {{ a }}</div>
      </el-alert>

      <el-collapse v-model="activeNames" class="bp-detail">
        <el-collapse-item name="strategy">
          <template #title>
            采集策略（{{ strategy?.channels.length ?? 0 }} 渠道 · 最低 T{{ strategy?.minTier ?? '?' }} 级信源 ·
            {{ stopRules?.coverageTarget != null ? Math.round(stopRules.coverageTarget * 100) : '?' }}% 覆盖目标）
          </template>
          <div class="kv-grid">
            <div class="kv"><span class="k">渠道</span><span>{{ strategy?.channels.join('、') || '—' }}</span></div>
            <div class="kv"><span class="k">语言</span><span>{{ strategy?.languages.join('、') || '—' }}</span></div>
            <div class="kv"><span class="k">查询词种子</span><span>{{ strategy?.seedQueries.join('；') || '—' }}</span></div>
            <div class="kv"><span class="k">一手来源提示</span><span>{{ strategy?.primaryHint.join('；') || '—' }}</span></div>
            <div v-if="stopRules" class="kv">
              <span class="k">停止规则</span>
              <span>
                关键需求 ≥{{ stopRules.minIndependentSources }} 个独立源 · 连续 {{ stopRules.marginalRounds }} 轮无新满足即停 ·
                预算 {{ stopRules.budget.maxToolCalls }} 次工具调用
              </span>
            </div>
            <div class="kv"><span class="k">交付物</span><span>{{ schemaTitles.join('；') || '—' }}</span></div>
          </div>
        </el-collapse-item>
        <el-collapse-item name="json" title="原始蓝图 JSON">
          <pre class="bp-json">{{ blueprintJson }}</pre>
        </el-collapse-item>
      </el-collapse>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 信息搜集 · 采集蓝图面板
 * @module components/info-collection/IcBlueprintPanel
 * @description 需求清单（优先级 + 覆盖标记）+ 口径假设 + 采集策略摘要 + 原始 JSON 折叠。
 *              未确认蓝图时提供确认入口（先规格后采集，确认才解锁搜集）。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useInfoCollectionStore } from '@/stores/info-collection'
import { reqTagType } from '@/views/info-collection/ic-ui'

const store = useInfoCollectionStore()
const confirming = ref(false)
const activeNames = ref<string[]>([])

const project = computed(() => store.current)
const blueprint = computed(() => project.value?.blueprint ?? null)
const blueprintJson = computed(() => (blueprint.value ? JSON.stringify(blueprint.value, null, 2) : ''))

const strategy = computed(() => blueprint.value?.sourceStrategy ?? null)
const stopRules = computed(() => blueprint.value?.stopRules ?? null)
const schemaTitles = computed(() => (blueprint.value?.schemas ?? []).map(s => s.title || s.id))

async function doConfirm(): Promise<void> {
  if (!project.value) return
  confirming.value = true
  try {
    const ok = await store.confirmBlueprint(project.value.id)
    ElMessage[ok ? 'success' : 'error'](ok ? '蓝图已确认，可以开始搜集' : '确认失败')
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.bp-head { margin-bottom: 14px; }
.bp-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bp-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.bp-confirm { margin-left: auto; }
.bp-goal { margin: 8px 0 0; font-size: 13px; color: var(--el-text-color-secondary); }
.req-list { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; }
.req-line { display: flex; align-items: center; gap: 10px; padding: 9px 12px; font-size: 13px; }
.req-line + .req-line { border-top: 1px solid var(--el-border-color-extra-light); }
.req-line:nth-child(odd) { background: var(--el-fill-color-lighter); }
.req-pri { width: 52px; justify-content: center; }
.req-id { color: var(--el-text-color-secondary); font-family: monospace; font-size: 12px; flex-shrink: 0; }
.req-q { flex: 1; min-width: 0; }
.bp-assumptions { margin-top: 12px; }
.assume-line { font-size: 12px; line-height: 1.8; }
.bp-detail { margin-top: 12px; }
.kv-grid { display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 13px; }
.kv { display: flex; gap: 10px; }
.kv .k { color: var(--el-text-color-secondary); flex-shrink: 0; width: 88px; }
.bp-json {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 10px;
}
</style>
