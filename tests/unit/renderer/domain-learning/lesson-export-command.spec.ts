/**
 * 「导出」下拉的 UI 契约（源码级断言）
 * @module tests/unit/renderer/domain-learning/lesson-export-command
 *
 * 背景（2026-09-15 用户报错「An object could not be cloned.」）：
 * `el-dropdown` 的 command 事件签名是 `(command, _instance, event)`，第二个参数是
 * ElDropdownItem 的**组件实例**。旧写法 `@command="handleExportLesson"` 会把组件实例
 * 当成第二个形参（cardId）一路透传进 IPC，结构化克隆直接抛错，导出 100% 失败。
 *
 * 该视图（DomainLearningSpace.vue）体量大、依赖重，单测里 mount 代价过高；这里按本仓既有
 * 做法（见 lesson-typography.spec.ts）做**源码契约断言**：钉死"下拉只绑单参处理函数"，
 * 防止后续重构改回多参绑定。（行为层的守卫另见 store-ipc-payload.spec.ts 与
 * shared/domain-learning-lesson-export.spec.ts。）
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SFC_PATH = resolve(__dirname, '../../../../src/renderer/src/views/domain-learning/DomainLearningSpace.vue')
const sfc = readFileSync(SFC_PATH, 'utf8')

describe('讲义导出下拉：UI 契约', () => {
  it('导出下拉绑定单参处理函数 onExportCommand（不得直接绑 handleExportLesson）', () => {
    expect(sfc).toMatch(/@command="onExportCommand"/)
    expect(sfc).not.toMatch(/@command="handleExportLesson"/)
  })

  it('onExportCommand 只声明一个形参（Element Plus 第 2 参是组件实例，不能接）', () => {
    const m = /function onExportCommand\(([^)]*)\)/.exec(sfc)
    expect(m, '未找到 onExportCommand 定义').not.toBeNull()
    const params = (m?.[1] ?? '').trim()
    expect(params).toBe('command: unknown')
  })

  it('版本抽屉导出仍把 cardId 交给 handleExportLesson（第二参只在该路径是有意义的）', () => {
    expect(sfc).toMatch(/handleExportLesson\(format, v\.cardId\)/)
  })

  it('handleExportLesson 对 cardId 走归一守卫（非字符串一律当"当前版"）', () => {
    expect(sfc).toContain('normalizeLessonCardId(cardId)')
    expect(sfc).toContain('parseLessonExportFormat(format)')
  })
})
