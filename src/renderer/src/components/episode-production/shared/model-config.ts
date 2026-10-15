/**
 * 模型配置转换工具
 * 拆自 VideoProjectEditor.vue，供各组件复用
 */

/**
 * 模型配置对象转字符串（格式："providerConfigId:modelId"）
 */
export function modelToString(
  model: { providerConfigId: string; modelId: string } | null | undefined
): string {
  if (!model) return ''
  return `${model.providerConfigId}:${model.modelId}`
}

/**
 * 字符串转模型配置对象
 */
export function stringToModel(
  str: string
): { providerConfigId: string; modelId: string } | null {
  if (!str) return null
  const parts = str.split(':')
  if (parts.length !== 2) return null
  return { providerConfigId: parts[0], modelId: parts[1] }
}

/**
 * 截断标题（最多 maxLength 个字 + 省略号）
 */
export function truncateTitle(title: string, maxLength = 5): string {
  if (!title) return ''
  if (title.length <= maxLength) return title
  return title.substring(0, maxLength) + '...'
}
