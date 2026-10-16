/**
 * 知识大脑·查询意图选层（§分层知识消费）
 * @module platform/services/kb-brain/layer-intent
 *
 * 用户问"怎么写/手法"要的是技法层+设定层，问"某角色的故事线"要的是描写层+细节层——
 * 从查询文本识别目标分层，检索排序时对命中层加权（乘法权重，非硬过滤：
 * 分层标注是模型软约束，硬过滤会因错标漏召）。
 * v3：outline 概要层废除（结构知识由通读派生的卡片承接，论断层不再有该层），
 * 主线/大纲类查询不再做论断层加权；新增 craft 技法层承接写作方法类查询。
 */
import type { KbAtomLayer } from '@core/database/entities/kb-brain/kb-atom.entity'

/** 分层信号词表（命中即视为该层相关；多层可同时命中） */
const LAYER_SIGNALS: Array<{ layer: KbAtomLayer; re: RegExp }> = [
  { layer: 'craft', re: /手法|技法|技巧|怎么写|如何写|写作思路|写作方法|叙事|套路|原理|为什么有效/ },
  { layer: 'setting', re: /设定|世界观|体系|力量|境界|等级|规则|制度|背景|概念|定义|功法|魔法|修炼|地图|势力/ },
  { layer: 'describe', re: /人物|角色|性格|外貌|形象|描写|笔触|地点|场景|门派|组织|配角|主角|反派|经典/ },
  { layer: 'detail', re: /伏笔|暗线|细节|线索|悬念|坑/ },
]

/** 命中层 vs 非命凡层的排序权重（作用在 fused×时间衰减之后；非命中层降权但不归零） */
export const LAYER_BOOST_MATCHED = 1.4
export const LAYER_BOOST_UNMATCHED = 0.85

export interface LayerBoost {
  matched: KbAtomLayer[]
}

/** 识别查询的目标分层；无任何信号返回 null（各层等权，行为与旧版一致） */
export function detectLayerBoost(query: string): LayerBoost | null {
  const q = (query ?? '').trim()
  if (!q) return null
  const matched = LAYER_SIGNALS.filter((s) => s.re.test(q)).map((s) => s.layer)
  return matched.length > 0 ? { matched } : null
}

/** 单条论断的分层权重（无 boost 信号时恒 1） */
export function layerWeightOf(boost: LayerBoost | null, layer: KbAtomLayer): number {
  if (!boost) return 1
  return boost.matched.includes(layer) ? LAYER_BOOST_MATCHED : LAYER_BOOST_UNMATCHED
}
