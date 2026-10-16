/**
 * 长文设计契约——谓词受控词表（2026-09-16 结构化设定方案 M0）
 *
 * 单一事实源：迁移种子（create-lw-predicate-registry）与设计文档 schema 的
 * 谓词校验都从这里取数，保证词表、词表种子、schema enum 三者永不漂移。
 *
 * 设计要点（方案 §4.2）：
 * - key = 中文规范词（展示与存储同形，避免存量边值重写成英文后 UI 回退）
 * - synonyms = 抽取器/设计 pass 常见变体，归一时映射到 key
 * - 归一非破坏：存量 lw_graph_edges.relation_type 命中词表的改写为规范词，
 *   未命中的原样入册（source='discovered'），永不丢数据
 */

export type PredicateScope = 'relation' | 'attribute'

export interface PredicateSeed {
  scope: PredicateScope
  key: string
  label: string
  synonyms: string[]
}

export const PREDICATE_VOCABULARY: readonly PredicateSeed[] = [
  // ---- 人物↔人物 关系 ----
  { scope: 'relation', key: '师徒', label: '师徒', synonyms: ['师父', '师傅', '师生', '师徒关系', '拜师', '师徒之谊'] },
  { scope: 'relation', key: '同门', label: '同门', synonyms: ['同门关系', '师兄弟', '师姐妹', '同门师兄弟', '同门弟子'] },
  { scope: 'relation', key: '亲属', label: '亲属', synonyms: ['亲人', '家人', '血亲', '血脉', '亲缘', '亲戚'] },
  { scope: 'relation', key: '父子', label: '父子', synonyms: ['父与子', '父子关系'] },
  { scope: 'relation', key: '父女', label: '父女', synonyms: ['父与女', '父女关系'] },
  { scope: 'relation', key: '母子', label: '母子', synonyms: ['母与子', '母子关系'] },
  { scope: 'relation', key: '母女', label: '母女', synonyms: ['母与女', '母女关系'] },
  { scope: 'relation', key: '兄弟', label: '兄弟', synonyms: ['弟兄', '兄弟关系'] },
  { scope: 'relation', key: '姐妹', label: '姐妹', synonyms: ['姊妹', '姐妹关系'] },
  { scope: 'relation', key: '兄弟姐妹', label: '兄弟姐妹', synonyms: ['兄妹', '姐弟', '弟妹', '手足', '兄妹关系', '姐弟关系'] },
  { scope: 'relation', key: '祖孙', label: '祖孙', synonyms: ['祖孙关系', '爷孙', '婆孙'] },
  { scope: 'relation', key: '朋友', label: '朋友', synonyms: ['好友', '挚友', '友人', '知己', '朋友关系'] },
  { scope: 'relation', key: '恋人', label: '恋人', synonyms: ['爱人', '情侣', '情人', '心上人', '道侣', '恋爱关系'] },
  { scope: 'relation', key: '夫妻', label: '夫妻', synonyms: ['配偶', '夫妇', '结发', '夫妻关系', '丈夫', '妻子'] },
  { scope: 'relation', key: '仇敌', label: '仇敌', synonyms: ['敌人', '死敌', '宿敌', '仇人', '血仇', '仇敌关系'] },
  { scope: 'relation', key: '竞争', label: '竞争', synonyms: ['对手', '竞争对手', '宿命对手', '竞争关系'] },
  { scope: 'relation', key: '上下级', label: '上下级', synonyms: ['上司', '上级', '下属', '部下', '上下级关系'] },
  { scope: 'relation', key: '主仆', label: '主仆', synonyms: ['主从', '仆从', '主仆关系'] },
  { scope: 'relation', key: '盟友', label: '盟友', synonyms: ['同盟', '联盟', '盟约', '盟友关系'] },
  { scope: 'relation', key: '雇佣', label: '雇佣', synonyms: ['雇主', '客卿', '佣兵', '雇佣关系'] },
  { scope: 'relation', key: '隶属', label: '隶属', synonyms: ['隶属于', '所属', '成员', '隶属关系'] },
  { scope: 'relation', key: '效忠', label: '效忠', synonyms: ['忠于', '誓忠于', '效忠关系'] },
  // ---- 实体↔物/地/事件 属性边（复用 lw_graph_edges 泛化端点，零 schema 变更） ----
  { scope: 'attribute', key: '持有', label: '持有', synonyms: ['拥有', '保管', '携带', '佩戴', '收藏'] },
  { scope: 'attribute', key: '位于', label: '位于', synonyms: ['身处', '所在', '停留于', '居住于', '驻扎于'] },
  { scope: 'attribute', key: '知晓', label: '知晓', synonyms: ['知道', '得知', '获悉', '知悉'] },
] as const

/** 归一匹配：raw 精确命中 key / label / synonym → 规范 key；未命中 → null */
export function normalizePredicate(
  raw: string,
  entries: ReadonlyArray<Pick<PredicateSeed, 'scope' | 'key' | 'label' | 'synonyms'>>,
  scope?: PredicateScope
): string | null {
  const value = raw.trim()
  if (!value) return null
  for (const entry of entries) {
    if (scope && entry.scope !== scope) continue
    if (value === entry.key || value === entry.label || entry.synonyms.includes(value)) return entry.key
  }
  return null
}

/** 词表自检：synonym 跨条目冲突会让归一变得有歧义——迁移种子与测试共用 */
export function findVocabularyCollisions(): Array<{ synonym: string; keys: string[] }> {
  const owner = new Map<string, string[]>()
  for (const entry of PREDICATE_VOCABULARY) {
    const terms = [entry.key, entry.label, ...entry.synonyms]
    for (const term of terms) {
      const keys = owner.get(term) ?? []
      if (!keys.includes(entry.key)) keys.push(entry.key)
      owner.set(term, keys)
    }
  }
  return [...owner.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([synonym, keys]) => ({ synonym, keys }))
}
