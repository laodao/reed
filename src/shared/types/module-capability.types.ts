/**
 * 模块能力卡（Module Capability Card）
 * @module shared/types/module-capability.types
 * @description 「系统功能模块能力注册制」的数据契约：每个功能模块把自己对 agent
 *              的自述（职责、典型意图、能力清单、调用路径）登记为一张卡。消费面：
 *              ① 聊天/系统 Agent 宿主把全部卡的有界摘要注入系统提示词（意图→模块
 *              匹配的依据）；② discover_capabilities 按 keyword 返回全量详情。
 *
 *              注册点收在平台层目录表（module-capability-catalog.ts，与
 *              builtin-packs.ts「登记处」同构）：新增模块/能力随该模块的 PR 同步
 *              改卡，review 可见；后续要精细化再下沉为 pack manifest 贡献点。
 */

/** 能力卡的调用路径（agent 怎么用上这项能力） */
export interface ModuleCapabilityInvocation {
  /**
   * 调用方式：
   * - tool：agent 本宿主直连工具（如 web_search）
   * - workflow：经工作流承载（既有工作流 run_workflow，或节点编排 create_workflow_draft）
   * - skill：invoke_skill 参数化技能
   * - ui：纯界面能力，agent 引导用户到页面完成
   */
  via: 'tool' | 'workflow' | 'skill' | 'ui'
  /** 具体路径说明（如 'web_search 直调' / 'tts 节点入工作流' / '/longwriting → 故事研讨室'） */
  how: string
  /** 附加约束（如需要 projectId、需用户在页面确认等） */
  note?: string
}

/** 一张模块能力卡 */
export interface ModuleCapability {
  /** 模块 id（对齐 pack id 或平台域 id，如 longwriting / episode-production / data） */
  moduleId: string
  /** 显示名（摘要行首） */
  name: string
  /**
   * 一句话职责（提示词摘要行就用它）——写法上要让模型能直接做意图匹配，
   * 并点出主调用路径；是卡的唯一进摘要字段，控制在 120 字内。
   */
  tagline: string
  /** 典型用户指令（意图示例；详情模式展示，keyword 也按它过滤） */
  intents: string[]
  /** 具体能力条目（详情模式展示） */
  capabilities: string[]
  /** 调用路径（1~3 条；详情模式展示） */
  invocation: ModuleCapabilityInvocation[]
}
