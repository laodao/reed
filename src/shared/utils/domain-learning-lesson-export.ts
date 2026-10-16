/**
 * 领域学习「讲义导出」出站/入站参数守卫（纯函数；双端共用）
 * @module shared/utils/domain-learning-lesson-export
 *
 * 存在的理由（2026-09-15 用户报错「An object could not be cloned.」）：
 * 导出下拉用 `el-dropdown`，Element Plus 的 command 事件签名是
 * `(command, instance, event)`——**第二个参数是 ElDropdownItem 的组件实例**
 * （element-plus 内部：`elDropdown.commandHandler(props.command, _instance, e)`）。
 * 视图若把它当 `cardId` 原样透传，组件实例（含函数、循环引用）过不了
 * `ipcRenderer.invoke` 的结构化克隆，导出 100% 失败。
 *
 * 因此导出参数一律经这里净化：
 *  - 格式必须命中白名单（未知格式拒绝，不猜）；
 *  - cardId 只认非空字符串（其余一律视为"未指定版本"= 导出当前版）。
 * UI 入口、store 出站口、主进程入站口共用同一份规则，杜绝三处漂移。
 */

import type { DlLessonExportFormat } from '@shared/types/domain-learning.types'
import { DL_LESSON_EXPORT_FORMATS } from '@shared/types/domain-learning.types'

/**
 * 解析导出格式：命中白名单返回该格式，否则 null（调用方负责报错，不得回落默认值）。
 */
export function parseLessonExportFormat(value: unknown): DlLessonExportFormat | null {
  if (typeof value !== 'string') return null
  return (DL_LESSON_EXPORT_FORMATS as readonly string[]).includes(value)
    ? (value as DlLessonExportFormat)
    : null
}

/**
 * 归一 cardId：只认非空字符串（讲义版本 id）。
 * UI 事件对象、Vue 代理、数字、空串一律归为 null——语义是"导出当前版"。
 */
export function normalizeLessonCardId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}
