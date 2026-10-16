/** 撤销栈合并判定测试（评审 #82） */
import { describe, it, expect } from 'vitest'
import { shouldMergeConfigUndo } from '@/utils/undo-merge'

describe('shouldMergeConfigUndo', () => {
  it('同节点窗口内 → 合并（跳过入栈）', () => {
    const last = { nodeId: 'n1', at: 1000 }
    expect(shouldMergeConfigUndo(last, 'n1', 1500)).toBe(true)
  })

  it('窗口外 / 换节点 / 无历史 → 入栈', () => {
    const last = { nodeId: 'n1', at: 1000 }
    expect(shouldMergeConfigUndo(last, 'n1', 2000)).toBe(false)
    expect(shouldMergeConfigUndo(last, 'n2', 1100)).toBe(false)
    expect(shouldMergeConfigUndo(null, 'n1', 1100)).toBe(false)
  })
})
