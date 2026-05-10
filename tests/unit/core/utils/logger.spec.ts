/**
 * 全局 logger 单元测试（spec 2026-05-10 e2e 阶段补充）
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createLogger, initLogger, tailLogs } from '@core/utils/logger'

describe('全局 logger', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logger-test-'))
    initLogger({ logDir: tmpDir, level: 'debug' })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  })

  it('创建 logger 写 JSONL 文件', async () => {
    const log = createLogger('test-module')
    log.info('hello world')
    // 异步写，等一下
    await new Promise((r) => setTimeout(r, 100))

    const day = new Date().toISOString().slice(0, 10)
    const file = path.join(tmpDir, `app-${day}.jsonl`)
    const content = await fs.readFile(file, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const entry = JSON.parse(lines[lines.length - 1])
    expect(entry.module).toBe('test-module')
    expect(entry.level).toBe('info')
    expect(entry.msg).toBe('hello world')
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('多参数 console.log 风格兼容（args 包到 ctx.args）', async () => {
    const log = createLogger('multi-arg')
    log.info('mixed', 1, 'two', { three: 3 })
    await new Promise((r) => setTimeout(r, 100))

    const entries = await tailLogs({ module: 'multi-arg' })
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const last = entries[entries.length - 1]
    expect(last.ctx?.args).toEqual([1, 'two', { three: 3 }])
  })

  it('单 plain object → 直接作为 ctx', async () => {
    const log = createLogger('single-obj')
    log.info('生成完成', { providerConfigId: 'pc_x', modelId: 'qwen', durationMs: 1234 })
    await new Promise((r) => setTimeout(r, 100))

    const entries = await tailLogs({ module: 'single-obj' })
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const last = entries[entries.length - 1]
    expect(last.ctx?.providerConfigId).toBe('pc_x')
    expect(last.ctx?.modelId).toBe('qwen')
    expect(last.ctx?.durationMs).toBe(1234)
  })

  it('child logger 继承 + 附加 ctx', async () => {
    const log = createLogger('parent').child({ requestId: 'req_1' })
    log.info('step a', { stage: 'fetch' })
    log.info('step b')
    await new Promise((r) => setTimeout(r, 100))

    const entries = await tailLogs({ module: 'parent' })
    const filtered = entries.filter((e) => e.ctx?.requestId === 'req_1')
    expect(filtered.length).toBe(2)
    expect(filtered[0].ctx?.stage).toBe('fetch')
    expect(filtered[1].ctx?.stage).toBeUndefined()
    expect(filtered[1].ctx?.requestId).toBe('req_1')
  })

  it('level 过滤（warn/error 级别 → debug 不输出）', async () => {
    initLogger({ logDir: tmpDir, level: 'warn' })
    const log = createLogger('lvl')
    log.debug('this should not appear')
    log.info('this neither')
    log.warn('this yes')
    log.error('this also')
    await new Promise((r) => setTimeout(r, 100))

    const entries = await tailLogs({ module: 'lvl' })
    expect(entries.length).toBe(2)
    expect(entries[0].level).toBe('warn')
    expect(entries[1].level).toBe('error')
  })

  it('tailLogs 按 contextMatch 过滤', async () => {
    const log = createLogger('ai-call')
    log.info('a', { sceneId: 'sc1', cost: 100 })
    log.info('b', { sceneId: 'sc2', cost: 200 })
    log.info('c', { sceneId: 'sc1', cost: 300 })
    await new Promise((r) => setTimeout(r, 100))

    const sc1 = await tailLogs({
      module: 'ai-call',
      contextMatch: (ctx) => ctx?.sceneId === 'sc1',
    })
    expect(sc1.length).toBe(2)
  })
})
