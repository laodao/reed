<template>
  <div class="rp-panel">
    <div class="rp-head">
      <div class="rp-desc">
        <div class="rp-title">整理报告</div>
        <p class="rp-sub">
          把已确认条目整理成可交付的研究简报：要点卡（LLM 起草 → 结构化反查，无据陈述直接剔除）→ 数据表 → 时间线 →
          引用清单 → 质量报告，再经第二模型独立审稿。报告落项目绑定的知识库，供写作与研究复用。
        </p>
      </div>
      <el-tooltip
        :disabled="canGenerate"
        content="还没有已确认的条目——先在「审阅工作台」确认来源，再生成报告"
        placement="top"
      >
        <el-button type="primary" :disabled="!canGenerate" :loading="store.generatingReport" @click="doGenerate">
          {{ store.lastReport ? '重新生成报告' : '生成报告' }}
        </el-button>
      </el-tooltip>
    </div>

    <el-alert v-if="generateError" type="error" :title="generateError" :closable="true" class="rp-error" @close="generateError = ''" />

    <el-empty
      v-if="!store.lastReport && !store.generatingReport"
      description="还没有生成过报告"
      :image-size="72"
    />
    <div v-else-if="store.generatingReport" v-loading="true" class="rp-loading" element-loading-text="正在整理：要点卡 → 数据表 → 时间线 → 引用清单 → 第二模型审稿…" />

    <template v-else-if="store.lastReport">
      <div class="rp-meta">
        <el-tag v-if="store.lastReport.imported" size="small" type="success" effect="plain">已入知识库</el-tag>
        <el-tag v-else size="small" type="warning" effect="plain">未入知识库（未绑定或导入失败）</el-tag>
        <span class="rp-meta-item">反查剔除无据陈述 <b>{{ store.lastReport.strippedStatements }}</b> 条</span>
        <span class="rp-meta-item">第二模型审出 <b>{{ store.lastReport.reviewIssues.length }}</b> 个问题</span>
      </div>

      <el-alert
        v-if="store.lastReport.reviewIssues.length"
        type="warning"
        :closable="false"
        title="第二模型审核备注（独立意见，只报问题不重写）"
        class="rp-issues"
      >
        <div v-for="(issue, i) in store.lastReport.reviewIssues" :key="i" class="rp-issue-line">· {{ issue }}</div>
      </el-alert>

      <div class="rp-doc md-body" v-html="reportHtml" />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 信息搜集 · 整理报告面板
 * @module components/info-collection/IcReportPanel
 * @description 报告生成入口 + 结果展示（markdown 渲染、第二模型审核备注、反查剔除数、入库状态）。
 *              报告本体已落知识库；本面板是生成过程的可视化终端。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useInfoCollectionStore } from '@/stores/info-collection'
import { renderMarkdown } from '@/utils/markdown'

const store = useInfoCollectionStore()
const generateError = ref('')

/** 可生成条件：存在已确认或已过期(仍可用)的条目（与后端 usable 口径一致） */
const canGenerate = computed(() => store.rows.some(r => r.status === 'confirmed' || r.status === 'stale'))

const reportHtml = computed(() => (store.lastReport ? renderMarkdown(store.lastReport.markdown) : ''))

async function doGenerate(): Promise<void> {
  if (!store.current) return
  generateError.value = ''
  const { result, error } = await store.generateReport(store.current.id)
  if (!result) {
    generateError.value = error ?? '生成失败'
    return
  }
  ElMessage.success(`报告已生成${result.imported ? '并入知识库' : ''}`)
}
</script>

<style scoped>
.rp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.rp-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.rp-sub { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; max-width: 720px; }
.rp-error { margin-bottom: 12px; }
.rp-loading { height: 180px; border-radius: 8px; }
.rp-meta { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; font-size: 12px; color: var(--el-text-color-secondary); }
.rp-meta b { color: var(--el-text-color-primary); }
.rp-issues { margin-bottom: 12px; }
.rp-issue-line { font-size: 12px; line-height: 1.8; }
.rp-doc {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 20px 24px;
  background: var(--el-bg-color);
}
.rp-doc :deep(h1), .rp-doc :deep(h2), .rp-doc :deep(h3) { margin: 18px 0 10px; }
.rp-doc :deep(h1:first-child), .rp-doc :deep(h2:first-child) { margin-top: 0; }
.rp-doc :deep(table) { border-collapse: collapse; margin: 10px 0; font-size: 12px; }
.rp-doc :deep(th), .rp-doc :deep(td) { border: 1px solid var(--el-border-color-lighter); padding: 6px 10px; }
.rp-doc :deep(th) { background: var(--el-fill-color-light); }
.rp-doc :deep(li) { line-height: 1.9; }
.rp-doc :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
}
.rp-doc :deep(code.inline-code) {
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}
</style>
