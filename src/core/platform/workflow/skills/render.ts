/**
 * 技能模板渲染（共用件）
 * @module core/platform/workflow/skills/render
 * @description {{param.xxx}} 占位替换 + references 参考资料拼接——skill-call 节点
 *              与系统 agent 的 invoke_skill 工具（28 号 M5 批1）共用同一实现，
 *              避免两处漂移（组件共用原则）。
 */

/**
 * 渲染技能模板：替换 {{param.key}} 占位；缺参按空串处理并回调告警（调用方定日志）。
 */
export function renderSkillTemplate(
  tpl: string,
  params: Record<string, string>,
  onMissingParam?: (key: string) => void,
): string {
  return tpl.replace(/\{\{param\.([a-zA-Z0-9_]+)\}\}/g, (_, k: string) => {
    if (!(k in params)) onMissingParam?.(k)
    return params[k] ?? ''
  })
}

/** 拼接技能包 references 参考文档到正文末尾（无 references 原样返回） */
export function withSkillReferences(body: string, references?: Array<{ name: string; content: string }> | null): string {
  const refsText = (references ?? []).map((r) => `[${r.name}]\n${r.content}`).join('\n\n')
  return refsText ? `${body}\n\n===== 参考资料 =====\n${refsText}` : body
}
