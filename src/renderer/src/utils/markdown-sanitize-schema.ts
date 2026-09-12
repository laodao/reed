/**
 * bytemd `sanitize` 契约实现：hast-util-sanitize schema 变更器
 * @module renderer/utils/markdown-sanitize-schema
 *
 * 背景（2026-09-12 修复）：bytemd 的 `sanitize` 属性是 **schema 变更器**：
 *
 * ```ts
 * // node_modules/bytemd/dist/index.mjs :: getProcessor
 * let schema = JSON.parse(schemaStr)          // hast-util-sanitize 的 GitHub 默认白名单
 * schema.attributes['*'].push('className')    // bytemd 自己追加：插件的类名锚点要靠它
 * if (typeof sanitize === 'function') schema = sanitize(schema)
 * processor = processor.use(rehypeSanitize, schema)
 * ```
 *
 * 误把它当成「HTML 字符串消毒器」（传 `(html: string) => string`）会让 `schema` 变成
 * 字符串，hast-util-sanitize 内部 `Object.assign({}, defaultSchema, schema)` 只拷贝到
 * 字符串的数字下标属性，**bytemd 追加的 `className` 白名单丢失** → 所有 class 被剥离：
 * - `remark-math` 产出的 `<span class="math math-inline">` 失去类名 → plugin-math 的
 *   `viewerEffect` 查不到 `.math.math-inline` → 公式不渲染（用户可见症状）；
 * - `code.language-mermaid` / `language-*` 同理失效 → mermaid 图不渲染、代码高亮退化。
 *
 * 正确做法：**在默认白名单上追加** `className`（幂等），其余白名单（尤其是 href 协议、
 * 禁用 script/事件属性）保持 GitHub 默认口径不变。
 */

/** hast-util-sanitize 的 schema（只声明本工具用到的部分，避开传递依赖的类型耦合） */
export interface HastSanitizeSchema {
  tagNames?: string[]
  attributes?: Record<string, Array<string | [string, ...unknown[]]>>
  [key: string]: unknown
}

/** 必须保住的全局属性（插件锚点/样式定位依赖类名） */
const REQUIRED_GLOBAL_ATTRS = ['className']

/**
 * 在默认 schema 上追加讲义渲染必需的属性白名单。
 * 纯函数：不修改入参，返回新 schema。
 */
export function extendSanitizeSchema(schema: HastSanitizeSchema): HastSanitizeSchema {
  const attributes: Record<string, Array<string | [string, ...unknown[]]>> = { ...(schema.attributes ?? {}) }
  const global = [...(attributes['*'] ?? [])]
  for (const attr of REQUIRED_GLOBAL_ATTRS) {
    if (!global.includes(attr)) global.push(attr)
  }
  attributes['*'] = global
  return { ...schema, attributes }
}
