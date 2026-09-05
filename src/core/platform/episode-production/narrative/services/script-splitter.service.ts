/**
 * narrative/services/script-splitter
 * @module platform/episode-production/narrative/services/script-splitter
 * @description 剧本拆分：把一段长文本按章节结构拆成多个剧集候选（用于"批量创建剧集"）。
 *
 * 复用 chunk-splitter 的 StructureDetector（规则切分，零 AI、零依赖）：
 * 识别「第X章/节/回」「Chapter N」「# 标题」等标记，**每章 → 一集**。
 * 无章节结构时返回 hasStructure:false + 空数组，由调用方（handler）转成
 * "未识别到章节结构，请在剧本中用「第X章」分隔"提示。
 */

import { StructureDetector } from '@core/platform/services/chunk-splitter/structure-detector'

/** 拆分出的单个剧集候选（标题来自章节标题，内容作为 uploadedContent） */
export interface ScriptEpisodeDraft {
  title: string
  content: string
}

/** analyzeScriptToEpisodes 的返回 */
export interface AnalyzeScriptResult {
  /** 是否识别到章节结构 */
  hasStructure: boolean
  /** 结构类型：markdown / novel / none */
  structureType: string
  /** 拆分出的剧集候选 */
  episodes: ScriptEpisodeDraft[]
}

/**
 * 分析剧本文本，按章节拆成剧集候选。
 * 每个章节映射为一集：title = 章节标题，content = 章节正文（含标题行）。
 */
export function analyzeScriptToEpisodes(text: string): AnalyzeScriptResult {
  const detector = new StructureDetector()
  const structure = detector.detect(text)

  if (!structure.hasStructure) {
    return {
      hasStructure: false,
      structureType: structure.structureType,
      episodes: [],
    }
  }

  const episodes: ScriptEpisodeDraft[] = structure.sections.map((section) => ({
    title: section.title,
    content: section.content,
  }))

  return {
    hasStructure: true,
    structureType: structure.structureType,
    episodes,
  }
}
