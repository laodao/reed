/**
 * Agent 活动描述测试（describeDlActivity / pushActivityLine）
 * @module tests/unit/shared/domain-learning-activity.spec
 *
 * 背景（2026-09-13 用户需求）：长任务要滚动显示"系统正在做什么"，
 * 失败与被拒的条目必须可见（此前 3 个知识点因额度被拒是无声消失的）。
 */

import { describe, it, expect } from 'vitest'
import { describeDlActivity, pushActivityLine } from '@shared/utils/domain-learning-activity'

describe('describeDlActivity（工具调用 → 一行人话）', () => {
  it('采集类：检索/取页显示检索词与域名', () => {
    expect(describeDlActivity({ toolName: 'web_search', args: { query: '股票 期货 美元' } }).line).toBe(
      '正在联网检索：股票 期货 美元',
    )
    expect(describeDlActivity({ toolName: 'wf_kb_retrieve', args: { query: '投资与配置' } }).line).toBe(
      '正在检索知识库：投资与配置',
    )
    expect(
      describeDlActivity({ toolName: 'wf_web_extract', args: { url: 'https://www.investor.gov/a/b?x=1' } }).line,
    ).toBe('正在读取网页：www.investor.gov')
    expect(describeDlActivity({ toolName: 'http_get', args: { url: 'https://export.arxiv.org/api/query?a=1' } }).line).toBe(
      '正在抓取页面/接口：export.arxiv.org',
    )
  })

  it('落库类：显示知识点名 / 关系两端 / 讲义概念', () => {
    expect(
      describeDlActivity({ toolName: 'dl_save_concept', args: { concept: { name: '资产配置与分散化' } } }).line,
    ).toBe('正在落库知识点：资产配置与分散化')
    expect(
      describeDlActivity({
        toolName: 'dl_save_relation',
        args: { relation: { sourceId: '单利与复利', targetId: '货币的时间价值' } },
      }).line,
    ).toBe('正在建立前置关系：单利与复利 → 货币的时间价值')
    expect(describeDlActivity({ toolName: 'dl_save_card', args: { card: { conceptName: '张量' } } }).line).toBe(
      '正在编写讲义：张量',
    )
    expect(describeDlActivity({ toolName: 'dl_save_space_prereqs', args: { items: [] } }).line).toBe(
      '正在落库主题前置要求',
    )
  })

  it('步号：给了 step 就显示「第 N 步 ·」，没给或不合法不显示', () => {
    expect(describeDlActivity({ toolName: 'web_search', args: { query: '债券' }, step: 3 }).line).toBe(
      '第 3 步 · 正在联网检索：债券',
    )
    expect(describeDlActivity({ toolName: 'web_search', args: { query: '债券' }, step: 0 }).line).toBe(
      '正在联网检索：债券',
    )
  })

  it('失败：warn 行（额度用尽/门禁拒绝都要可见）', () => {
    const r = describeDlActivity({
      toolName: 'dl_save_concept',
      args: { concept: { name: '指数基金与定期定额投资（定投）' } },
      ok: false,
    })
    expect(r.kind).toBe('warn')
    expect(r.line).toContain('⚠️')
    expect(r.line).toContain('落库知识点')
    expect(r.line).toContain('指数基金与定期定额投资（定投）')
    expect(r.line).toContain('本轮总结')

    // 带 detail（如 registry 的 hint 摘要）
    const withDetail = describeDlActivity({ toolName: 'dl_save_concept', ok: false, detail: '额度已用尽' })
    expect(withDetail.line).toContain('额度已用尽')
  })

  it('兜底：未知工具、缺入参、字符串入参都退化但不报错', () => {
    expect(describeDlActivity({ toolName: 'some_new_tool' }).line).toBe('正在执行 some_new_tool')
    expect(describeDlActivity({ toolName: 'discover_capabilities' }).line).toBe('正在查看可用技能')
    expect(describeDlActivity({ toolName: 'web_search', args: '股票' }).line).toBe('正在联网检索：股票')
    expect(describeDlActivity({ toolName: 'web_search', args: null }).line).toBe('正在联网检索')
  })

  it('截断：超长主语不挤爆一行', () => {
    const long = '这是一个很长的知识点名称'.repeat(8) // 88 字，远超 48 字上限
    const line = describeDlActivity({ toolName: 'dl_save_concept', args: { concept: { name: long } } }).line
    // 动作短语(8) + 冒号(1) + 截断到 48（末位换省略号）
    expect(line.length).toBeLessThanOrEqual(8 + 1 + 48)
    expect(line.endsWith('…')).toBe(true)
    expect(line).not.toContain(long)
  })
})

describe('pushActivityLine（滚动缓冲）', () => {
  it('保留最近 3 行，顺序为旧→新', () => {
    let lines: string[] = []
    for (const t of ['一', '二', '三', '四']) lines = pushActivityLine(lines, t)
    expect(lines).toEqual(['二', '三', '四'])
  })

  it('与上一行相同不重复堆叠（模型重试同一动作很常见）', () => {
    const lines = pushActivityLine(pushActivityLine([], '正在联网检索：股票'), '正在联网检索：股票')
    expect(lines).toEqual(['正在联网检索：股票'])
  })

  it('空串忽略；自定义容量生效', () => {
    expect(pushActivityLine(['a'], '   ')).toEqual(['a'])
    expect(pushActivityLine(['a', 'b'], 'c', 2)).toEqual(['b', 'c'])
  })
})
