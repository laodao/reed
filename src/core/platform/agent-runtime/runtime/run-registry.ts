/**
 * Agent 运行注册表（29 号 M5.5 批1）
 * @module core/platform/agent-runtime/runtime/run-registry
 *
 * 在途 agent run 的主进程登记：工作台/前端据此展示"运行中"徽标并 attach 实时流。
 * harness 级通用设施——各宿主（聊天/任务执行器）登记，harness 不认识具体业务；
 * 变更经 onChange 回调外泄（依赖倒置：广播通道由装配方注入，本模块零业务依赖）。
 *
 * 生命周期与进程同寿（内存态，无需持久化/对账——崩溃后自然清空；任务行的
 * running 对账由 AgentTaskService.recoverInterrupted 负责）。
 */

import { createLogger } from '@core/utils/logger'

const logger = createLogger('AgentRunRegistry')

export interface AgentRunRegistration {
  /** 运行 id（调用方生成，全局唯一即可） */
  id: string
  definitionId: string
  /** 轨迹 scopeKey（dialog:<id> / task:<id>）——工作台按此订阅轨迹流 */
  scopeKey: string
  /** 展示名（会话标题/任务标题） */
  label: string
  /** 注册时 ALS 用户（工作台列表按租户过滤） */
  userId: string | null
  /** 中止闭包（工作台停止按钮；宿主注入，harness 不认识具体取消机制） */
  abort?: () => void
  /** 宿主附加元数据（如任务树的 rootId——停止按钮路由用） */
  metadata?: Record<string, unknown>
  registeredAt: number
}

export interface AgentRunFinishInfo {
  id: string
  scopeKey: string
  status: 'done' | 'error' | 'aborted'
  error?: string
  finishedAt: number
}

export type AgentRunChangeListener = (event:
  | { kind: 'started'; run: AgentRunRegistration }
  | { kind: 'finished'; run: AgentRunFinishInfo }) => void

export class AgentRunRegistry {
  private readonly runs = new Map<string, AgentRunRegistration>()
  private listeners: AgentRunChangeListener[] = []

  /** 装配方注入变更监听（广播通道）；返回注销函数 */
  onChange(listener: AgentRunChangeListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  register(run: Omit<AgentRunRegistration, 'registeredAt'>): void {
    this.runs.set(run.id, { ...run, registeredAt: Date.now() })
    logger.info(`[run-registry] register ${run.definitionId} scope=${run.scopeKey} id=${run.id}`)
    this.emit({ kind: 'started', run: this.runs.get(run.id)! })
  }

  finish(id: string, info: Omit<AgentRunFinishInfo, 'finishedAt'>): void {
    const run = this.runs.get(id)
    if (!run) {
      logger.warn(`[run-registry] finish 未登记的运行（忽略）：${id}`)
      return
    }
    this.runs.delete(id)
    logger.info(`[run-registry] finish scope=${run.scopeKey} status=${info.status}`)
    this.emit({ kind: 'finished', run: { id, scopeKey: run.scopeKey, status: info.status, error: info.error, finishedAt: Date.now() } })
  }

  /** 在途运行（userId 给定时按租户过滤） */
  listRunning(userId?: string | null): AgentRunRegistration[] {
    return [...this.runs.values()].filter((r) => (userId === undefined ? true : r.userId === userId))
  }

  /** 按 scopeKey 查在途运行 */
  getByScope(scopeKey: string): AgentRunRegistration | null {
    for (const r of this.runs.values()) if (r.scopeKey === scopeKey) return r
    return null
  }

  /**
   * 中止在途运行（工作台停止按钮；返回是否命中）。
   * userId 校验（29 号 review P2-3：写通道曾零租户校验——scopeKey 泄露即越权停止）。
   * Electron 单用户注册/停止同值；Web 按请求用户比对。
   */
  abortByScope(scopeKey: string, userId: string | null): boolean {
    const run = this.getByScope(scopeKey)
    if (!run?.abort) return false
    if (run.userId !== userId) {
      logger.warn(`[run-registry] abort 拒绝（租户不匹配）scope=${scopeKey}`)
      return false
    }
    try {
      run.abort()
      return true
    } catch (e) {
      logger.warn(`[run-registry] abort 异常 scope=${scopeKey}`, e)
      return false
    }
  }

  private emit(event: Parameters<AgentRunChangeListener>[0]): void {
    for (const l of [...this.listeners]) {
      try {
        l(event)
      } catch (e) {
        logger.warn('[run-registry] onChange 监听器异常（不影响登记）', e)
      }
    }
  }
}

let registry: AgentRunRegistry | null = null

/** 单例（workflow-boot 装配后使用；测试可注入 reset） */
export function getAgentRunRegistry(): AgentRunRegistry {
  if (!registry) registry = new AgentRunRegistry()
  return registry
}

/** 测试/关停用 */
export function resetAgentRunRegistry(): void {
  registry = null
}
