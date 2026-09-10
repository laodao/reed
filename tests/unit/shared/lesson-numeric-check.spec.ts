/**
 * 讲义数值自检测试（checkNumericStatements）
 * @module tests/unit/shared/lesson-numeric-check.spec
 *
 * 钉死（2026-09-09 复盘：同一算例数字自相矛盾会让新手一验算就失去信任）：
 * - 「a×b=c」错误结果 → 报 issue；
 * - 「≈」允许 1% 相对误差，不误报；
 * - 正确的算式与普通文本不报。
 */

import { describe, it, expect } from 'vitest'
import { checkNumericStatements } from '@shared/utils/lesson-numeric-check'

describe('checkNumericStatements 数值自检', () => {
  it('乘法写错结果 → 报出不一致（含人话说明）', () => {
    const issues = checkNumericStatements('于是 0.99×0.01=0.00099，得到阳性率。')
    expect(issues).toHaveLength(1)
    expect(issues[0].statement).toBe('0.99×0.01=0.00099')
    expect(issues[0].message).toContain('不一致')
    expect(issues[0].message).toContain('中间量')
  })

  it('正确算式不报（含末尾四舍五入容忍）', () => {
    expect(checkNumericStatements('0.99×0.01=0.0099；分母 0.0099+0.0495=0.0594。')).toHaveLength(0)
    expect(checkNumericStatements('约 0.0099/0.0594≈0.167，即 16.7%。')).toHaveLength(0)
  })

  it('除法/减法写错也报', () => {
    expect(checkNumericStatements('0.0099/0.0594=0.0017')).toHaveLength(1)
    expect(checkNumericStatements('1-0.99=0.1')).toHaveLength(1)
  })

  it('普通文本与公式（无算式）不受影响', () => {
    expect(checkNumericStatements('P(A|B)=P(B|A)P(A)/P(B)，先验与似然相乘再除以证据概率。')).toHaveLength(0)
  })

  it('除零等异常安全跳过', () => {
    expect(checkNumericStatements('1/0=5')).toHaveLength(0)
  })
})
