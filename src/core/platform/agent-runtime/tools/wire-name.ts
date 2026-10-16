/**
 * 工具线上名兼容（41 号——平台缺口：pack:<id>:<name> 冒号被 OpenAI 兼容 API 拒绝）
 * @module core/platform/agent-runtime/tools/wire-name
 *
 * 背景：注册表规范名 `pack:<packId>:<name>` 中的冒号违反 OpenAI/Anthropic 工具名
 * 规范 `^[a-zA-Z0-9_-]{1,64}$`——provider 直接 400（dl 包曾以裸名注册绕行；EP/LW
 * 的包工具同样会踩）。
 *
 * 修法：**线上名映射**（provider 边界别名化，内部名不动）——
 * - 规范名继续承载绑定/审计/轨迹/目录（`:` 是命名空间分隔符，存量绑定与数据不动）；
 * - LoopRunner 装配工具集时把每个规范名换算为线上名（wire name）作为 provider 函数名，
 *   模型回呼后在线上名 → 规范名映射表还原，下游（轨迹/审计/无进展签名/轮询豁免）
 *   全程只见规范名；
 * - 映射确定性且无碰撞：碰撞消解用内容派生摘要后缀（与集合顺序/成员解耦——同规范名
 *   在任何工具集里得到同一线上名），每步复核 64 上限，见 buildWireNameMap。
 *
 * 历史安全性：修复前冒号名请求整单被拒，不可能存在含冒号的历史 tool-call；修复后
 * 历史里写的就是线上名，重放一致——无迁移需求。
 */

import { createHash } from 'crypto'

/** OpenAI / Anthropic 工具名共同规范 */
export const WIRE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/
/** 规范名长度上限（超出截断+摘要后缀） */
export const WIRE_NAME_MAX = 64

/** 规范名 → 线上名：非法字符折叠为 '_'（同名规范名映射结果相同，碰撞由 buildWireNameMap 消解） */
export function toWireName(canonical: string): string {
  // 空串/全非法名折叠为空会违反 {1,64} 下限（42号 review P3）——落 '_' 兜底
  const folded = canonical.replace(/[^a-zA-Z0-9_-]/g, '_') || '_'
  if (folded.length <= WIRE_NAME_MAX) return folded
  // 64 上限：截断到 57 + '_' + 6 位 sha1 前缀（确定性；不同规范名几乎必异）
  return withDigestSuffix(folded, canonical, 6)
}

/** 超长折叠名的确定性摘要后缀：截断 + '_' + len 位 sha1(canonical)（总长恰 ≤64） */
function withDigestSuffix(folded: string, canonical: string, digestLen: number): string {
  const digest = createHash('sha1').update(canonical).digest('hex').slice(0, digestLen)
  return `${folded.slice(0, WIRE_NAME_MAX - digest.length - 1)}_${digest}`
}

export interface WireNameMap {
  /** provider 函数名 → 规范名（模型回呼还原用） */
  wireToCanonical: Map<string, string>
  /** 规范名 → provider 函数名（装配工具集用） */
  canonicalToWire: Map<string, string>
}

/**
 * 为一轮工具装配构建双向映射。
 * 确定性（42号 review P1/P2）：折叠同形的规范名为一个碰撞组，组内「谁保留裸折叠名」
 * 由 sha1(规范名) 内容排序决定（最小者保留），其余加内容派生摘要后缀——归属与声明
 * 顺序、集合到达序完全解耦（序号后缀方案会随工具集顺序翻转归属）。每步复核 64 上限。
 */
export function buildWireNameMap(canonicalNames: string[]): WireNameMap {
  const canonicalToWire = new Map<string, string>()
  const wireToCanonical = new Map<string, string>()
  const usedWire = new Set<string>()

  // 第一遍：按折叠名分组（同形即碰撞组）
  const groups = new Map<string, string[]>()
  for (const canonical of canonicalNames) {
    const folded = toWireName(canonical)
    const group = groups.get(folded)
    if (group) group.push(canonical)
    else groups.set(folded, [canonical])
  }

  const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')
  // 碰撞组成员的确定性摘要后缀：摘要逐级加长（4→8→16→32 hex）直至不撞，恒 ≤64
  const escalate = (folded: string, canonical: string): string => {
    for (const digestLen of [4, 8, 16, 32]) {
      const candidate = withDigestSuffix(folded, canonical, digestLen)
      if (!usedWire.has(candidate)) return candidate
    }
    return withDigestSuffix(folded, `#${canonical}`, 32) // 兜底（实际不可达）
  }

  // 第二遍：组内按 sha1(规范名) 排序——最小者保留裸折叠名，其余加摘要后缀
  for (const [folded, group] of groups) {
    const ordered = group.length === 1
      ? group
      : [...group].sort((x, y) => (sha1(x) < sha1(y) ? -1 : 1))
    ordered.forEach((canonical, index) => {
      let wire = index === 0 ? folded : escalate(folded, canonical)
      while (usedWire.has(wire)) wire = escalate(wire, `#${canonical}`) // 跨组后缀撞名防御
      usedWire.add(wire)
      canonicalToWire.set(canonical, wire)
      wireToCanonical.set(wire, canonical)
    })
  }
  return { canonicalToWire, wireToCanonical }
}
