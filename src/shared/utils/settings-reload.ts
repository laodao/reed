/**
 * settings 保存后的**重新注入**钩子（平台级；2026-09-13 参数设置第二轮）
 * @module shared/utils/settings-reload
 *
 * ── 解决什么问题 ──
 * 有一类参数是"进程级、启动时装配一次"的：进程级限额持有者（`runtime-limits`）、
 * 长生命周期的工具注册表护栏、工作流运行参数持有者（`workflow-runtime-params`）。
 * 第一轮把它们标成"改完需重启客户端"——能改，但体验差。
 *
 * 既然这些使用点都是**在用时现读持有者**，那么只要在一次 settings 写入之后
 * **重新注入**持有者，改动就能立刻生效。本文件提供这个"写入后重注入"的登记处：
 *
 * - 装配方（`workflow-boot`）注册钩子：`registerSettingsReloadHook('agent-budget', fn)`；
 * - 写入方（`settings:set` 处理器）在落库成功后调用 `runSettingsReloadHooks(key)`；
 * - 钩子自己判断"这个键跟我有没有关系"，无关就立刻返回（钩子数量是个位数，无需索引）。
 *
 * ── 纪律 ──
 * - **钩子失败绝不能让保存失败**：单个钩子抛错只记日志，继续跑后面的；
 *   反之，配置写不进去才是更严重的问题（用户以为改了、其实没改）。
 * - 钩子是"重新读一遍配置并注入"，不做增量合并——避免两次注入之间出现半新半旧。
 */

/** 重注入钩子：收到刚写入的 settings 键，自己判断是否关心 */
export type SettingsReloadHook = (key: string) => void | Promise<void>

interface RegisteredHook {
  name: string
  hook: SettingsReloadHook
}

const hooks: RegisteredHook[] = []

/** 日志输出口（默认走 console；装配方可注入项目 logger） */
let log: { warn: (msg: string, e?: unknown) => void } = {
  warn: (msg, e) => console.warn(msg, e),
}

/** 注入日志实现（可选；测试与主进程用） */
export function setSettingsReloadLogger(logger: { warn: (msg: string, e?: unknown) => void }): void {
  log = logger
}

/** 注册重注入钩子（同名覆盖，重复装配不会重复执行） */
export function registerSettingsReloadHook(name: string, hook: SettingsReloadHook): void {
  const idx = hooks.findIndex((h) => h.name === name)
  if (idx >= 0) hooks[idx] = { name, hook }
  else hooks.push({ name, hook })
}

/** 注销（测试隔离用） */
export function unregisterSettingsReloadHook(name: string): void {
  const idx = hooks.findIndex((h) => h.name === name)
  if (idx >= 0) hooks.splice(idx, 1)
}

/** 清空全部钩子（测试隔离用） */
export function resetSettingsReloadHooks(): void {
  hooks.length = 0
}

/** 已登记钩子名（诊断/测试用） */
export function listSettingsReloadHooks(): string[] {
  return hooks.map((h) => h.name)
}

/**
 * 跑一遍全部钩子（settings 写入成功后由处理器调用）。
 * 单个钩子抛错只记日志——**保存本身已经成功**，不能因为重注入失败就报错给用户。
 */
export async function runSettingsReloadHooks(key: string): Promise<void> {
  for (const { name, hook } of [...hooks]) {
    try {
      await hook(key)
    } catch (e) {
      log.warn(`[settings-reload] 钩子 ${name} 重注入失败（配置已保存，运行参数可能仍旧值）`, e)
    }
  }
}
