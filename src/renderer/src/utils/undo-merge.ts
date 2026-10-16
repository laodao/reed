/**
 * 撤销栈合并判定（评审 #82）
 * @module renderer/utils/undo-merge
 * @description 配置面板连续编辑（逐键 change 事件）不应逐条入栈：
 *              同节点在 merge 窗口内的连续变更合并为一条历史。
 */
export interface ConfigUndoMarker {
  nodeId: string
  at: number
}

/** 是否应跳过本次入栈（同节点且距上次入栈 ≤ mergeMs） */
export function shouldMergeConfigUndo(
  last: ConfigUndoMarker | null,
  nodeId: string,
  now: number,
  mergeMs = 800,
): boolean {
  return !!last && last.nodeId === nodeId && now - last.at <= mergeMs
}
