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
 * - 映射确定性且无碰撞（同轮内按序消解后缀；超长截断+摘要后缀），见 buildWireNameMap。
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
  const folded = canonical.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (folded.length <= WIRE_NAME_MAX) return folded
  // 64 上限：截断到 57 + '_' + 6 位 sha1 前缀（确定性；不同规范名几乎必异）
  const digest = createHash('sha1').update(canonical).digest('hex').slice(0, 6)
  return `${folded.slice(0, WIRE_NAME_MAX - 7)}_${digest}`
}

export interface WireNameMap {
  /** provider 函数名 → 规范名（模型回呼还原用） */
  wireToCanonical: Map<string, string>
  /** 规范名 → provider 函数名（装配工具集用） */
  canonicalToWire: Map<string, string>
}

/**
 * 为一轮工具装配构建双向映射。
 * 确定性：入参顺序即消解顺序（Object.entries 的插入序）；线上名冲突时后到者加
 * `_2`/`_3`… 后缀——同一轮内规范名集合稳定，映射因此在 run 内稳定。
 */
export function buildWireNameMap(canonicalNames: string[]): WireNameMap {
  const canonicalToWire = new Map<string, string>()
  const wireToCanonical = new Map<string, string>()
  const usedWire = new Set<string>()
  for (const canonical of canonicalNames) {
    let wire = toWireName(canonical)
    if (usedWire.has(wire)) {
      let n = 2
      const base = wire
      while (usedWire.has(`${base}_${n}`)) n++
      wire = `${base}_${n}`
    }
    usedWire.add(wire)
    canonicalToWire.set(canonical, wire)
    wireToCanonical.set(wire, canonical)
  }
  return { canonicalToWire, wireToCanonical }
}
