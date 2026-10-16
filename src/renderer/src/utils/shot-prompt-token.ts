/**
 * 分镜提示词实体 token 解析/序列化（评审 #48/#89 抽纯函数便于单测）
 * @module renderer/utils/shot-prompt-token
 * @description token 格式 `@[名字@图索引@实体id]`（索引/id 均可选，旧两段/单段格式兼容）。
 */

/** 单个 @实体 token 的解析结果 */
export interface ParsedEntityToken {
  name: string
  /** 1-based 图索引；null=只引资产本体 */
  index: number | null
  /** 实体 id（评审 #48 三段协议）；null=旧格式 */
  id: string | null
}

/** 拆 `名字[@索引][@实体id]`：索引必须是纯数字段；其余非空段视为 id */
export function splitEntityRef(inner: string): ParsedEntityToken {
  const parts = inner.split('@')
  const name = parts.shift() ?? ''
  let index: number | null = null
  let id: string | null = null
  for (const part of parts) {
    if (/^\d+$/.test(part) && index === null) index = Number(part)
    else if (part) id = part
  }
  return { name, index, id }
}

/** 序列化为字符串 token（段按需省略） */
export function serializeEntityToken(name: string, index: number | null, entityId: string | null): string {
  return `@[${name}${index != null ? '@' + index : ''}${entityId ? '@' + entityId : ''}]`
}
