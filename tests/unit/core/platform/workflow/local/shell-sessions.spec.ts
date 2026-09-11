/**
 * shell 会话管理器 单测（44 号；真实短进程，锚点 = codex unified_exec 语义）
 * @module tests/unit/core/platform/workflow/local/shell-sessions
 *
 * 覆盖：yield 首返 / 会话续读（session_id） / stdin 写入与 EOF / 纯轮询下限 /
 * 退出码上报与出表 / 未知会话逐字文案 / 中断（SIGINT）/ 超大输出省略标记 /
 * 容量 prune / 空闲 TTL 清扫。
 */

import { describe, it, expect } from 'vitest'
import {
  ShellSessionManager,
  HeadTailBuffer,
  SHELL_OUTPUT_MAX_BYTES,
  SHELL_EXIT_CODE_TIMEOUT,
} from '@core/platform/workflow/local/shell-sessions'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('HeadTailBuffer', () => {
  it('小输入原样；超限保头尾 + "... N bytes omitted ..."（逐字标记）', () => {
    const b = new HeadTailBuffer(100)
    b.push(Buffer.from('x'.repeat(60)))
    b.push(Buffer.from('y'.repeat(60)))
    const { text, omittedBytes } = b.drain()
    expect(text).toContain('...')
    expect(text).toMatch(/\.\.\. 20 bytes omitted \.\.\./)
    expect(omittedBytes).toBe(20)
    expect(text.startsWith('x'.repeat(50))).toBe(true)
    expect(text.endsWith('y'.repeat(50))).toBe(true)
  })

  it('drain 后清空（累计口径）', () => {
    const b = new HeadTailBuffer(1024)
    b.push(Buffer.from('a'))
    const first = b.drain()
    expect(first.text).toBe('a')
    expect(first.omittedBytes).toBe(0)
    expect(b.byteCount).toBe(0)
    expect(b.drain().text).toBe('')
  })

  it('缺省缓冲 1MiB（codex 同款）', () => {
    expect(SHELL_OUTPUT_MAX_BYTES).toBe(1024 * 1024)
  })
})

describe('ShellSessionManager', () => {
  it('快命令：一次 yield 内退出，直接给 exit_code=0 与输出', async () => {
    const m = new ShellSessionManager()
    const r = await m.exec({ command: "echo hello-44" })
    expect(r.exit_code).toBe(0)
    expect(r.session_id).toBeUndefined()
    expect(r.output).toContain('hello-44')
    expect(r.wall_time_seconds).toMatch(/^\d+\.\d{4}$/)
  })

  it('长命令：yield 到点带 session_id；续读与退出码上报（读后出表）', async () => {
    const m = new ShellSessionManager()
    const r1 = await m.exec({ command: 'echo part1; sleep 1.2; echo part2', yieldMs: 300 })
    expect(r1.session_id).toBeDefined()
    expect(r1.output).toContain('part1')
    expect(r1.exit_code).toBeUndefined()
    // 轮询直到退出（纯轮询下限 5s 内进程已结束）
    let final
    for (let i = 0; i < 10; i++) {
      final = await m.write({ sessionId: r1.session_id!, yieldMs: 400 })
      if (final.exit_code !== undefined) break
      await sleep(100)
    }
    expect(final?.exit_code).toBe(0)
    expect(final?.session_id).toBeUndefined()
    expect(final?.output).toContain('part2')
    // 已终结会话再写 → "Unknown process id N"（逐字）
    await expect(m.write({ sessionId: r1.session_id! })).rejects.toThrow(
      `Unknown process id ${r1.session_id}`,
    )
  })

  it('写 stdin：cat 回显；EOF 收尾', async () => {
    const m = new ShellSessionManager()
    const r1 = await m.exec({ command: 'while IFS= read -r l; do echo "got:$l"; done', yieldMs: 300 })
    expect(r1.session_id).toBeDefined()
    const r2 = await m.write({ sessionId: r1.session_id!, data: 'hi-44\n', yieldMs: 300 })
    expect(r2.output).toContain('got:hi-44')
    const r3 = await m.write({ sessionId: r1.session_id!, closeStdin: true, yieldMs: 500 })
    expect(r3.exit_code).toBe(0)
  })

  it('中断：\\u0003 映射 SIGINT 终止 sleep', async () => {
    const m = new ShellSessionManager()
    const r1 = await m.exec({ command: 'sleep 30', yieldMs: 250 })
    expect(r1.session_id).toBeDefined()
    const r2 = await m.write({ sessionId: r1.session_id!, data: '\u0003', yieldMs: 800 })
    // bash 收到信号退出（退出码非 0；codex 语义：下一次 poll 上报）
    expect(r2.exit_code).not.toBe(0)
    expect(r2.exit_code).not.toBeNull()
  }, 10_000)

  it('非零退出码透传', async () => {
    const m = new ShellSessionManager()
    const r = await m.exec({ command: 'echo before-err; exit 3' })
    expect(r.exit_code).toBe(3)
    expect(r.output).toContain('before-err')
  })

  it('容量 prune：达上限后新会话仍可开（最旧活会话被终止）', async () => {
    const m = new ShellSessionManager({ maxSessions: 2 })
    const a = await m.exec({ command: 'sleep 5', yieldMs: 200 })
    const b = await m.exec({ command: 'sleep 5', yieldMs: 200 })
    const c = await m.exec({ command: 'echo third-ok', yieldMs: 500 })
    expect(c.exit_code).toBe(0)
    expect(c.output).toContain('third-ok')
    // a/b 之一被 prune（或已出表）
    const alive = m.list().length
    expect(alive).toBeLessThanOrEqual(2)
    void a
    void b
    await m.killAll()
  })

  it('空闲 TTL 清扫（deps 注入小 TTL）', async () => {
    const m = new ShellSessionManager({ idleTtlMs: 50 })
    const r = await m.exec({ command: 'sleep 5', yieldMs: 100 })
    await sleep(120)
    // 下一次调用触发清扫：会话被杀，poll 不到 → Unknown
    await expect(m.write({ sessionId: r.session_id!, yieldMs: 100 })).rejects.toThrow('Unknown process id')
    expect(SHELL_EXIT_CODE_TIMEOUT).toBe(124)
  })

  it('killAll：全部终止', async () => {
    const m = new ShellSessionManager()
    const a = await m.exec({ command: 'sleep 5', yieldMs: 150 })
    m.killAll()
    expect(m.list().length).toBe(0)
    await expect(m.write({ sessionId: a.session_id! })).rejects.toThrow('Unknown process id')
  })
})
