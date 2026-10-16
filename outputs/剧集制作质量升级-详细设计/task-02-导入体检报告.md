# 任务 T02 · 导入体检报告

> Wave：W1（合并序第 2）｜估时：2–3 人日｜依赖：无
> 必读：`00-共享约定与工程规范.md`（新 prompt 遵循 00 §8）

## 执行须知（subagent）

- **范围白名单**：仅下文 §4 所列文件。
- **DoD / 报告 / 禁止事项**：见 README §6。

## 1. 背景与目标

章节断裂/乱码/识别错误会在分集与脚本阶段放大成叙事断裂（DramaClaw 5.2："导入前整理原文比导入后反复修正省时间"）。本任务在批量建集前插入一张"体检表"：总字数、检测章节、预计集数、异常警告。

## 2. 功能设计

### 2.1 后端：扩展 `ep:analyze-script-file` 响应

现有链路：`episode.handler.ts:41` 注册 → `handleAnalyzeScriptFile`（`episode.handler.ts:248-260`）→ 章节解析在 `narrative/services/script-splitter.service.ts`。在解析结果上补充汇总与警告：

```
AnalyzeResult 追加字段：
  totalChars: number
  chapterCount: number
  chapters: [{ index, title, chars }]        // 已有结构则复用
  estimatedEpisodes: number                  // ceil(totalChars / 单集目标字数(项目设置，默认值与建集参数一致))
  warnings: [{ code, message }]
```

警告规则（表驱动，便于单测）：
| code | 触发条件 | message 示例 |
|---|---|---|
| CHAPTER_TITLE_UNRECOGNIZED | 疑似标题行中无法匹配「第X章 / Chapter N / # 标题」的占比 > 30% | "30% 的章节标题无法识别，建议整理后重新导入" |
| NO_CHAPTER_DETECTED | 全文 > 5000 字且未检出任何章节 | "未识别到章节结构，将按单章导入" |
| ABNORMAL_LENGTH | 单章字数 > 全文均值 5 倍或 < 50 字 | "第 N 章字数异常（X 字），请检查" |

### 2.2 前端：`BatchCreateEpisodesDialog.vue` 两步流

- 第一步：选文件 → 解析 → 展示体检卡（字数 / 章节数 / 预计集数 / 警告列表；章节列表可展开折叠显示每章标题与字数）。
- 第二步：确认后进入既有建集参数与提交。
- warnings 非空时"继续导入"需二次点击确认（按钮文案变为"仍有警告，继续导入"）。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 修改 | `platform/episode-production/narrative/services/script-splitter.service.ts` | 汇总字段 + 警告规则（表驱动函数 `buildImportDiagnostics`） |
| 修改 | `packs/episode-production/handlers/episode.handler.ts` | `handleAnalyzeScriptFile` 响应透传 |
| 修改 | `renderer/src/components/episode-production/dialogs/BatchCreateEpisodesDialog.vue` | 两步流 + 体检卡 |
| 修改 | `src/shared/types/`（EP episode 类型文件） | `AnalyzeResult` 扩展 |

## 4. 测试与验收

**单测**（`script-splitter` 诊断函数表驱动）：
- 规范文本 → 0 警告、章节数/字数正确
- 章节标题混乱 → CHAPTER_TITLE_UNRECOGNIZED
- 5000+ 字无章节 → NO_CHAPTER_DETECTED
- 单章 50 字以下 / 超均值 5 倍 → ABNORMAL_LENGTH
- 预计集数 = ceil(总字数/单集目标)

**人工验收 AC**：
- AC1 规范 txt：体检卡四项正确、无警告，一键进入建集
- AC2 混乱文本出现对应警告，二次确认可继续
- AC3 预计集数随"单集目标字数"设置变化
- AC4 epub/pdf 等其余支持格式同样出体检卡
- AC5 回归基线全绿
