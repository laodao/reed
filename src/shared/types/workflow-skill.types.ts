/**
 * 技能（Skill）模块类型（工作流技能包）
 * @module shared/types/workflow-skill.types
 * @description 技能 = 目录包：SKILL.md（YAML frontmatter 清单 + markdown 任务正文）+ 可选
 *              prompts/ references/ assets/。设计参考 DSH 的 SKILL.md 体系（目录 bundle、
 *              多来源合并、调用控制），并按工作流场景扩展 inputs 参数 schema——skill-call
 *              节点需要确定性参数表单（DSH 技能由 agent 自主执行，无需参数）。
 *              常量与类型双端同源（core 执行与前端面板共用）。
 */

/** 技能输入参数 schema 字段（技能库编辑表单 + skill-call 节点参数区共用） */
export interface WorkflowSkillInput {
  /** 参数键（提示词模板中以 {{param.xxx}} 引用） */
  key: string
  label?: string
  type?: 'string' | 'textarea' | 'number' | 'boolean' | 'select'
  required?: boolean
  defaultValue?: unknown
  options?: Array<{ label: string; value: string | number }>
  help?: string
}

/** 技能来源：builtin=内置（只读，可复制为自定义）/ user=用户技能（技能包目录，可编辑删除） */
export const SKILL_SOURCES = { builtin: 'builtin', user: 'user' } as const
export type SkillSource = (typeof SKILL_SOURCES)[keyof typeof SKILL_SOURCES]

/** 技能元信息（列表/详情展示） */
export interface WorkflowSkillMeta {
  /** 技能 id（kebab-case，如 short-video-script；也是技能包目录名） */
  id: string
  /** 展示名 */
  name: string
  description: string
  /** 何时使用（给用户选择技能的提示） */
  whenToUse?: string
  /** 分类（内容创作 / 文案写作 / 分析 / 办公…） */
  category: string
  source: SkillSource
  /** 技能包目录绝对路径（内置技能为 null——代码内联只读） */
  dirPath?: string | null
  inputs: WorkflowSkillInput[]
  /** 输出说明（引导模型输出格式） */
  outputDesc?: string
  /** 创建时间（ISO；用户技能取技能包目录创建时间，内置技能无此字段） */
  createdAt?: string
  updatedAt?: string
}

/** 技能完整定义（含正文，执行/编辑用） */
export interface WorkflowSkill extends WorkflowSkillMeta {
  /** 系统提示词（可含 {{param.xxx}}；来自 frontmatter system_prompt 或 prompts/system.md） */
  systemPrompt: string
  /** SKILL.md 正文（任务指令，可含 {{param.xxx}}） */
  body: string
  /** 参考文档/示例（references/ 目录，执行时自动拼入上下文） */
  references?: Array<{ name: string; content: string }>
  /** 是否允许模型调用（frontmatter disable_model_invocation 反向；默认 true） */
  modelInvocable: boolean
}

/** 技能 name 语法（kebab-case，与 DSH 一致） */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** SKILL.md 默认文件名 */
export const SKILL_MD_FILENAME = 'SKILL.md'

/** skill-call 节点输出字段 */
export const SKILL_CALL_OUTPUT_KEYS = ['content', 'usage'] as const
