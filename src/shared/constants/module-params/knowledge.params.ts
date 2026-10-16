/**
 * 「知识库」模块参数登记表
 * @module shared/constants/module-params/knowledge
 *
 * 一个 Tab 覆盖三个 settings 键（分组级 `settingsKey`）：
 * `knowledge:retrieval`（检索） / `knowledge:ingest`（入库与导入） / `knowledge:summary`（章节摘要）。
 *
 * 三个键的载荷平铺。数值来源为 `knowledge-params.types.ts`。
 * 用户为什么会想调（调研结论）：检索条数给太少搜不到东西、相似度阈值不过滤导致答非所问、
 * 上传体积上限 50MB 把大 PDF 挡在门外、章节摘要一次只跑 60 章要跑很多轮。
 */

import {
  KNOWLEDGE_DEFAULTS as D,
  KNOWLEDGE_LIMITS as L,
} from '@shared/types/knowledge-params.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const RETRIEVAL = SETTINGS_KEYS.knowledgeRetrieval
const INGEST = SETTINGS_KEYS.knowledgeIngest
const SUMMARY = SETTINGS_KEYS.knowledgeSummary

export const KNOWLEDGE_PARAMS: ModuleParamDefinition = {
  key: 'knowledge',
  feature: 'knowledge-base',
  name: '知识库',
  description:
    '知识库检索返回多少条、相似度门槛多高、上传与导入的体积上限、章节摘要一次跑多少。保存后立即生效。',
  settingsKey: RETRIEVAL,
  effect: 'immediate',
  groups: [
    {
      title: '检索',
      description:
        '检索默认值只在"调用方没指定"时生效（工作流节点自己配了以节点为准）。搜不到东西就先调大条数、再考虑降低门槛。',
      params: [
        {
          kind: 'number',
          path: 'defaultTopK',
          label: '默认返回条数',
          hint: '调用方未指定时检索返回几条；给太少容易"搜不到相关知识"',
          default: D.retrieval.defaultTopK,
          ceiling: L.retrieval.defaultTopK,
        },
        {
          kind: 'number',
          path: 'qaTopK',
          label: 'QA 直出检索条数',
          hint: '问答对（QA）直出时检索几条候选',
          default: D.retrieval.qaTopK,
          ceiling: L.retrieval.qaTopK,
        },
        {
          kind: 'number',
          path: 'qaDirectMinScorePercent',
          label: 'QA 直出最低相似度',
          hint: '相似度达到这个百分比才直接用原文作答（跳过 LLM）；调低更容易直出（快但可能不贴切）',
          unit: 'Percent',
          default: D.retrieval.qaDirectMinScorePercent,
          ceiling: L.retrieval.qaDirectMinScorePercent,
          step: 5,
        },
        {
          kind: 'number',
          path: 'qaVectorFetchPadding',
          label: '文档召回补偿条数',
          hint: 'QA 向量会占掉检索名额，这里多取几条补偿文档召回（技术项，不懂就别动）',
          default: D.retrieval.qaVectorFetchPadding,
          ceiling: L.retrieval.qaVectorFetchPadding,
          step: 5,
        },
        {
          kind: 'number',
          path: 'maxTopKPerKb',
          label: '多库检索·每库条数',
          hint: '一次查多个知识库时，每个库最多取几条',
          default: D.retrieval.maxTopKPerKb,
          ceiling: L.retrieval.maxTopKPerKb,
          step: 5,
        },
        {
          kind: 'number',
          path: 'maxMergedResults',
          label: '多库检索·合并上限',
          hint: '多个库结果合并后的总条数上限；调大能多带资料，但更占上下文',
          default: D.retrieval.maxMergedResults,
          ceiling: L.retrieval.maxMergedResults,
          step: 10,
        },
      ],
    },
    {
      title: '入库与导入',
      description: '文件体积／数量上限。调大能收大书大表，但解析更久、更吃内存。',
      settingsKey: INGEST,
      params: [
        {
          kind: 'number',
          path: 'maxUploadBytes',
          label: '单文件上传上限',
          hint: '超过就被拒（提示里会写明当前上限）；大 PDF/整本书语料需要调大',
          unit: 'Bytes',
          default: D.ingest.maxUploadBytes,
          ceiling: L.ingest.maxUploadBytes,
          step: 10 * 1024 * 1024,
        },
        {
          kind: 'number',
          path: 'maxUploadFiles',
          label: '单次上传文件数',
          hint: '一次最多选几个文件',
          default: D.ingest.maxUploadFiles,
          ceiling: L.ingest.maxUploadFiles,
          step: 5,
        },
        {
          kind: 'number',
          path: 'embeddingBatchSize',
          label: '向量入库批量',
          hint: '一次送多少文本块给嵌入服务；调大更快，但单次请求更容易失败',
          default: D.ingest.embeddingBatchSize,
          ceiling: L.ingest.embeddingBatchSize,
          step: 5,
        },
        {
          kind: 'number',
          path: 'qaImportMaxBytes',
          label: 'QA 导入文件上限',
          hint: '问答对 xlsx 导入的单文件体积上限',
          unit: 'Bytes',
          default: D.ingest.qaImportMaxBytes,
          ceiling: L.ingest.qaImportMaxBytes,
          step: 5 * 1024 * 1024,
        },
        {
          kind: 'number',
          path: 'qaImportMaxRows',
          label: 'QA 导入行数上限',
          hint: '问答对 xlsx 一次最多导入多少行；超了请拆分后分批导入',
          default: D.ingest.qaImportMaxRows,
          ceiling: L.ingest.qaImportMaxRows,
          step: 1000,
        },
      ],
    },
    {
      title: '章节摘要',
      description:
        '给长文档逐章生成摘要。并发调大更快但更吃 API 配额；单次章数是成本护栏，整本书跑不完可以调大。',
      settingsKey: SUMMARY,
      params: [
        {
          kind: 'number',
          path: 'concurrency',
          label: '摘要并发数',
          hint: '同时摘要几章；调大更快，但更容易触发模型限流',
          default: D.summary.concurrency,
          ceiling: L.summary.concurrency,
        },
        {
          kind: 'number',
          path: 'maxChars',
          label: '单章输入上限',
          hint: '单章内容超过这个长度会截断后再摘要（超长章节摘要质量会下降）',
          unit: 'Chars',
          default: D.summary.maxChars,
          ceiling: L.summary.maxChars,
          step: 1000,
        },
        {
          kind: 'number',
          path: 'maxSummaries',
          label: '单次处理章数',
          hint: '一次最多摘要多少章（其余保持待生成，可再次触发）；整本书需要调大或多次触发',
          default: D.summary.maxSummaries,
          ceiling: L.summary.maxSummaries,
          step: 10,
        },
        {
          kind: 'boolean',
          path: 'retryFailed',
          label: '自动重试失败章节',
          hint: '再次触发摘要时，是否把上次失败的章节也重跑一遍；关掉则只补「待生成」的章节',
          default: true,
        },
      ],
    },
  ],
}
