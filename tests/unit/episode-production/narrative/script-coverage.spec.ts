/**
 * script-coverage 单测（2026-09-21）
 * @module tests/unit/episode-production/narrative/script-coverage
 *
 * 原文对白覆盖度校验（仿 shot-pacing）：
 * - 原文带引号对白全部出现在生成对白里 → 无缺失
 * - 丢整段对白（雪麓山庄"约法三章"实测事故）→ missing 列出原句
 * - 标点/空白差异不影响匹配；长句允许首尾命中（AI 插动作描写的容错）
 */

import { describe, it, expect } from 'vitest'
import {
  extractOriginalDialogues,
  validateScriptCoverage,
  coverageWarnings,
  checkDialogueConsistency,
  dialogueConsistencyWarnings,
  extractScriptBodyDialogues,
  buildCoverageReport,
  coverageSummaryLine,
  editDistanceWithin,
  isSubsequenceWithinBudget,
} from '@core/platform/episode-production/narrative/ai/script-coverage'

const ORIGINAL = `掌门放下茶盏："你爹，也是捕快。"
"所以我更得当！"她理直气壮，"我爹当年多威风——铁面追风，四个字传出去，江湖上谁不知道？"
"我知道！"沈云萝抢答，"遇事别逞强，打不过就跑！"`

describe('script-coverage', () => {
  it('extractOriginalDialogues: 提取带引号对白，过滤超短碎片（<4 字）', () => {
    const lines = extractOriginalDialogues(ORIGINAL)
    expect(lines).toContain('你爹，也是捕快。')
    expect(lines).toContain('遇事别逞强，打不过就跑！')
    // "我知道！" 归一化后仅 3 字，低于下限被过滤（防噪声的取舍）
    expect(lines).not.toContain('我知道！')
    expect(lines).toHaveLength(4)
  })

  it('全覆盖 → missing 为空、无 warnings', () => {
    const r = validateScriptCoverage(ORIGINAL, [
      '你爹，也是捕快。',
      '所以我更得当！',
      '我爹当年多威风——铁面追风，四个字传出去，江湖上谁不知道？',
      '遇事别逞强，打不过就跑！',
    ])
    expect(r.total).toBe(4)
    expect(r.covered).toBe(4)
    expect(r.missing).toEqual([])
    expect(coverageWarnings(r)).toEqual([])
  })

  it('丢整段对白（约法三章事故回归）→ missing 列出原句', () => {
    const r = validateScriptCoverage(ORIGINAL, ['你爹，也是捕快。', '所以我更得当！'])
    expect(r.missing).toContain('遇事别逞强，打不过就跑！')
    const w = coverageWarnings(r)
    expect(w.length).toBeGreaterThan(0)
    expect(w[0]).toContain('覆盖度 2/4')
  })

  it('标点与空白差异不影响匹配', () => {
    const r = validateScriptCoverage('他说："打不过就跑！"', ['打不过，就跑'])
    expect(r.missing).toEqual([])
  })

  it('长句允许首尾命中（AI 在中间插动作描写的容错）', () => {
    const r = validateScriptCoverage(
      '她喊道："我爹当年多威风——铁面追风，四个字传出去，江湖上谁不知道？"',
      ['我爹当年多威风铁面追风（她挺起胸膛）四个字传出去，江湖上谁不知道'],
    )
    expect(r.missing).toEqual([])
  })

  it('原文无对白 → total=0、无 warnings', () => {
    const r = validateScriptCoverage('纯叙述，没有对白。', ['anything'])
    expect(r.total).toBe(0)
    expect(coverageWarnings(r)).toEqual([])
  })
})

// ==================== §4.1 台词单一来源立法（2026-10-06） ====================

describe('§4.1 覆盖度收紧', () => {
  it('ratio 字段反映覆盖率', () => {
    const r = validateScriptCoverage(ORIGINAL, ['你爹，也是捕快。'])
    expect(r.ratio).toBeCloseTo(0.25, 5)
    expect(validateScriptCoverage(ORIGINAL, ORIGINAL.match(/"[^"]+"/g) ?? []).ratio).toBe(1)
  })

  it('无原文对白时 ratio = 1（不误报）', () => {
    expect(validateScriptCoverage('纯叙述。', []).ratio).toBe(1)
  })

  it('纯改写（首尾像、中间全不同）不再被放行——旧"首尾各 8 字"口径已废', () => {
    // 首尾各取 8 字恰好相同，但中间完全是另一句话
    const r = validateScriptCoverage('他说："一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯"', [
      '一二三四五六七八完全不同的一句话内容也不一样子丑寅卯',
    ])
    expect(r.missing).toHaveLength(1)
  })

  it('插入型改写仍然放行（保真纪律允许"可微调语气"）', () => {
    const r = validateScriptCoverage('她说："今天天气真好啊我们出去走走吧"', [
      '今天天气真好啊（她伸了个懒腰）我们出去走走吧',
    ])
    expect(r.missing).toEqual([])
  })

  it('插入过多（超过原文一半）判为不一致', () => {
    const r = validateScriptCoverage('他说："走吧"', ['走吧' + '额外插入的内容'.repeat(4)])
    // "走吧" 仅 2 字 → 走包含式命中（短句允许被更长台词包含），这里应命中
    expect(r.missing).toEqual([])
    // 换成长句 + 超量插入则应报缺失
    const r2 = validateScriptCoverage('他说："我们今天下午三点在城南老茶馆见面吧"', [
      '我们今天下午三点' + '插入'.repeat(10) + '在城南老茶馆见面吧',
    ])
    expect(r2.missing).toHaveLength(1)
  })

  it('删节型改写判为缺失', () => {
    const r = validateScriptCoverage('他说："我们今天下午三点在城南老茶馆见面吧"', [
      '我们今天下午在城南老茶馆见面吧',
    ])
    expect(r.missing).toHaveLength(1)
  })
})

describe('§4.1 正文 ↔ dialogues 双向一致性', () => {
  const BODY = `第一场 茶馆
张三推门而入。

张三："请来一壶碧螺春。"

李四："好嘞，客官稍等。"

（张三坐下，环视四周）`

  it('一致时无 issues', () => {
    const r = checkDialogueConsistency(BODY, ['请来一壶碧螺春。', '好嘞，客官稍等。'])
    expect(r.consistent).toBe(true)
    expect(r.issues).toEqual([])
    expect(dialogueConsistencyWarnings(r)).toEqual([])
  })

  it('正文有对白但 dialogues 缺失 → in_script_not_in_dialogues', () => {
    const r = checkDialogueConsistency(BODY, ['请来一壶碧螺春。'])
    expect(r.consistent).toBe(false)
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0].kind).toBe('in_script_not_in_dialogues')
    expect(r.issues[0].scriptLine).toContain('好嘞')
  })

  it('两处文本分叉（容差内近似）→ text_mismatch 并给出双方文本', () => {
    // 长句 + 容差内的改写：正文「…在城南老茶馆见面吧」vs dialogues「…在城南的老茶馆见面吧」
    const body = '张三："我们今天下午三点在城南老茶馆见面吧，别迟到了。"'
    const r = checkDialogueConsistency(body, ['我们今天下午三点在城南的老茶馆见面吧，别迟到了。'])
    expect(r.consistent).toBe(false)
    expect(r.issues[0].kind).toBe('text_mismatch')
    expect(r.issues[0].dialogueText).toContain('在城南的老茶馆')
  })

  it('分叉超出容差 → 归为缺失（更严重的信号）', () => {
    const r = checkDialogueConsistency(BODY, [
      '请来一壶碧螺春。',
      '好嘞，客官您稍等片刻，马上就来。',
    ])
    expect(r.consistent).toBe(false)
    expect(r.issues[0].kind).toBe('in_script_not_in_dialogues')
  })

  it('正文为空 → 视为一致（无从比对）', () => {
    expect(checkDialogueConsistency('', ['x']).consistent).toBe(true)
    expect(checkDialogueConsistency('   ', ['x']).consistent).toBe(true)
  })

  it('dialogues 为空但正文有对白 → 全部报缺失', () => {
    const r = checkDialogueConsistency(BODY, [])
    expect(r.consistent).toBe(false)
    expect(r.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('提取正文对白：引号式与"角色：台词"式都识别，且去重', () => {
    const lines = extractScriptBodyDialogues(BODY)
    expect(lines.some((l) => l.includes('碧螺春'))).toBe(true)
    expect(lines.some((l) => l.includes('好嘞'))).toBe(true)
    // 括号舞台提示不含引号/冒号 → 不应作为对白
    expect(lines.some((l) => l.includes('环视四周'))).toBe(false)
  })

  it('warning 文案说明 dialogues 是唯一事实源', () => {
    const w = dialogueConsistencyWarnings(checkDialogueConsistency(BODY, []))
    expect(w[0]).toContain('唯一事实源')
  })
})

describe('§4.5 覆盖度报告（落库 + UI 可见）', () => {
  it('buildCoverageReport 汇总覆盖与不一致', () => {
    const coverage = validateScriptCoverage(ORIGINAL, ['你爹，也是捕快。'])
    const consistency = checkDialogueConsistency('甲："x"', [])
    const report = buildCoverageReport(coverage, consistency)

    expect(report.total).toBe(4)
    expect(report.covered).toBe(1)
    expect(report.ratio).toBeCloseTo(0.25, 4)
    expect(report.missing.length).toBeGreaterThan(0)
    expect(report.inconsistencyCount).toBe(consistency.issues.length)
    expect(report.checkedAt).toBeGreaterThan(0)
  })

  it('missing 截断保存避免 metadata 膨胀', () => {
    const long = '啊'.repeat(300)
    const coverage = validateScriptCoverage(`他说："${long}"`, [])
    const report = buildCoverageReport(coverage)
    for (const m of report.missing) expect(m.length).toBeLessThanOrEqual(121)
  })

  it('coverageSummaryLine 供 agent 总结附覆盖率数字', () => {
    const report = buildCoverageReport(validateScriptCoverage(ORIGINAL, ['你爹，也是捕快。']))
    const line = coverageSummaryLine(report)
    expect(line).toContain('1/4')
    expect(line).toContain('25%')
    expect(line).toContain('缺失')
  })

  it('无原文对白时摘要说明无从比对', () => {
    const report = buildCoverageReport(validateScriptCoverage('纯叙述。', []))
    expect(coverageSummaryLine(report)).toContain('无带引号对白')
  })
})

describe('§4.1 编辑距离与子序列工具', () => {
  it('editDistanceWithin 边界', () => {
    expect(editDistanceWithin('abc', 'abc', 0)).toBe(true)
    expect(editDistanceWithin('abc', 'abd', 1)).toBe(true)
    expect(editDistanceWithin('abc', 'abd', 0)).toBe(false)
    expect(editDistanceWithin('abc', 'abcdef', 1)).toBe(false)
  })

  it('isSubsequenceWithinBudget：字序保留才通过', () => {
    expect(isSubsequenceWithinBudget('今天天气真好啊（她伸懒腰）我们出去走走吧', '今天天气真好啊我们出去走走吧')).toBe(true)
    // 字序颠倒 → 非子序列
    expect(isSubsequenceWithinBudget('走吧我们出去今天天气真好啊', '今天天气真好啊我们出去走走吧')).toBe(false)
  })
})
