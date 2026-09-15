/**
 * 领域学习「讲义导出」出站参数纯守卫
 * @module tests/unit/shared/domain-learning-lesson-export
 *
 * 背景（2026-09-15 用户报错「An object could not be cloned.」）：
 * 知识点正文导出下拉用 `el-dropdown`，Element Plus 的 command 事件签名是
 * `(command, instance, event)`——**第二个参数是 ElDropdownItem 的组件实例**
 * （见 element-plus 的 `commandHandler(props.command, _instance, e)`）。
 * 视图把事件参数直接当 `cardId` 透传，组件实例（含函数、循环引用）过不了
 * `ipcRenderer.invoke` 的结构化克隆，导出 100% 失败。
 *
 * 这里把「格式必须在白名单内、cardId 只认非空字符串」固化成纯函数并钉死：
 * 谁再把 UI 事件对象当数据透传，测试就红。
 */

import { describe, it, expect } from 'vitest'
import {
  parseLessonExportFormat,
  normalizeLessonCardId,
} from '@shared/utils/domain-learning-lesson-export'

/** 冒充 Element Plus 传进来的 ElDropdownItem 组件实例（含函数 + 循环引用——结构化克隆必炸） */
function fakeComponentInstance(): Record<string, unknown> {
  const inst: Record<string, unknown> = {
    uid: 42,
    type: { name: 'ElDropdownItem' },
    render: () => null,
  }
  inst.parent = inst // 组件实例里真实存在的循环引用
  return inst
}

describe('parseLessonExportFormat：格式白名单', () => {
  it('三个合法格式原样返回', () => {
    expect(parseLessonExportFormat('md')).toBe('md')
    expect(parseLessonExportFormat('pdf')).toBe('pdf')
    expect(parseLessonExportFormat('image')).toBe('image')
  })

  it('未知格式 / 大小写不符 / 空值一律拒绝（宁可报错也不猜）', () => {
    for (const bad of ['docx', 'html', 'MD', '', '  ', null, undefined, 42, {}, []]) {
      expect(parseLessonExportFormat(bad)).toBeNull()
    }
  })

  it('UI 事件对象（组件实例）不会被误判成格式', () => {
    expect(parseLessonExportFormat(fakeComponentInstance())).toBeNull()
  })
})

describe('normalizeLessonCardId：只认非空字符串', () => {
  it('字符串 cardId 原样保留（版本抽屉「导出该版」路径）', () => {
    expect(normalizeLessonCardId('card-1')).toBe('card-1')
  })

  it('组件实例 / 空值 / 非字符串 → null（= 导出当前版，不炸 IPC）', () => {
    const inst = fakeComponentInstance()
    expect(normalizeLessonCardId(inst)).toBeNull()
    expect(normalizeLessonCardId('')).toBeNull()
    expect(normalizeLessonCardId('   ')).toBeNull()
    expect(normalizeLessonCardId(null)).toBeNull()
    expect(normalizeLessonCardId(undefined)).toBeNull()
    expect(normalizeLessonCardId(123)).toBeNull()
    expect(normalizeLessonCardId({ cardId: 'card-1' })).toBeNull()
  })
})

describe('回归钉子：按守卫组装出的 IPC 载荷必须可结构化克隆', () => {
  it('「导出 → Markdown」真实事件形态（command, 组件实例, 事件）→ 载荷可克隆', () => {
    const inst = fakeComponentInstance()
    const payload = {
      id: 'sp1',
      conceptId: 'c1',
      format: parseLessonExportFormat('md'),
      cardId: normalizeLessonCardId(inst), // 第 2 个参数就是组件实例
    }
    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload).toEqual({ id: 'sp1', conceptId: 'c1', format: 'md', cardId: null })
  })

  it('反证：组件实例本身确实克隆不了（保证这条钉子是有效杀伤力）', () => {
    expect(() => structuredClone(fakeComponentInstance())).toThrow(/could not be cloned/)
  })
})
