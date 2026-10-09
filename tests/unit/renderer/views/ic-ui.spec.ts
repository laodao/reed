/**
 * 信息搜集界面纯函数助手测试（ic-ui）
 * 覆盖：相对时间分级 / 耗时格式化 / 各状态→徽标映射 / 维度与百分比文案
 */
import { describe, it, expect } from 'vitest'
import {
  shortTime,
  relativeTime,
  durationText,
  taskTagType,
  taskStatusText,
  tierTagType,
  fetchTagType,
  rowTagType,
  rowStatusText,
  reqTagType,
  dimsText,
  percentText,
} from '@/views/info-collection/ic-ui'

describe('shortTime', () => {
  it('ISO 字符串截到分钟并去掉 T', () => {
    expect(shortTime('2026-10-08T09:30:00.000Z')).toBe('2026-10-08 09:30')
  })
  it('Date 实例（IPC 结构化克隆回传）同样处理', () => {
    expect(shortTime(new Date('2026-10-08T09:30:00.000Z'))).toBe('2026-10-08 09:30')
  })
  it('空值回退占位符', () => {
    expect(shortTime(null)).toBe('—')
    expect(shortTime(undefined, '')).toBe('')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-10-08T12:00:00')
  const iso = (offsetMs: number): string => new Date(now.getTime() - offsetMs).toISOString()
  it('一分钟内 → 刚刚', () => {
    expect(relativeTime(iso(30_000), now)).toBe('刚刚')
  })
  it('一小时内 → N 分钟前', () => {
    expect(relativeTime(iso(5 * 60_000), now)).toBe('5 分钟前')
  })
  it('24 小时内 → 今天 HH:mm', () => {
    expect(relativeTime(iso(3 * 60 * 60_000), now)).toMatch(/^今天 \d{2}:\d{2}$/)
  })
  it('48 小时内 → 昨天 HH:mm', () => {
    expect(relativeTime(iso(30 * 60 * 60_000), now)).toMatch(/^昨天 \d{2}:\d{2}$/)
  })
  it('更早 → MM-DD HH:mm', () => {
    expect(relativeTime(iso(10 * 24 * 60 * 60_000), now)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })
  it('空值 → 占位符', () => {
    expect(relativeTime(null, now)).toBe('—')
  })
})

describe('durationText', () => {
  it('秒级', () => {
    expect(durationText('2026-10-08T10:00:00Z', '2026-10-08T10:00:45Z')).toBe('45 秒')
  })
  it('分级', () => {
    expect(durationText('2026-10-08T10:00:00Z', '2026-10-08T10:03:12Z')).toBe('3 分 12 秒')
  })
  it('时级', () => {
    expect(durationText('2026-10-08T10:00:00Z', '2026-10-08T11:04:00Z')).toBe('1 时 04 分')
  })
  it('缺一端为 null', () => {
    expect(durationText('2026-10-08T10:00:00Z', null)).toBeNull()
  })
})

describe('状态→徽标映射', () => {
  it('任务：done/reviewing 成功、running/pending 警告、failed/cancelled 危险', () => {
    expect(taskTagType('done')).toBe('success')
    expect(taskTagType('running')).toBe('warning')
    expect(taskTagType('failed')).toBe('danger')
    expect(taskTagType('cancelled')).toBe('danger')
  })
  it('任务中文文案齐全', () => {
    expect(taskStatusText('running')).toBe('搜集中')
    expect(taskStatusText('done')).toBe('已完成')
  })
  it('分级：T1 成功 → T4 危险，未定级 info', () => {
    expect(tierTagType(1)).toBe('success')
    expect(tierTagType(2)).toBe('primary')
    expect(tierTagType(3)).toBe('warning')
    expect(tierTagType(4)).toBe('danger')
    expect(tierTagType(null)).toBe('info')
  })
  it('抓取：blocked/failed 危险可区分', () => {
    expect(fetchTagType('ok')).toBe('success')
    expect(fetchTagType('partial')).toBe('warning')
    expect(fetchTagType('blocked')).toBe('danger')
    expect(fetchTagType('failed')).toBe('danger')
  })
  it('条目：superseded 与 stale 不再同色（superseded=info、stale/draft=warning）', () => {
    expect(rowTagType('confirmed')).toBe('success')
    expect(rowTagType('draft')).toBe('warning')
    expect(rowTagType('stale')).toBe('warning')
    expect(rowTagType('superseded')).toBe('info')
    expect(rowStatusText('superseded')).toBe('已取代')
    expect(rowStatusText('stale')).toBe('可能过期')
  })
  it('需求优先级', () => {
    expect(reqTagType('must')).toBe('danger')
    expect(reqTagType('should')).toBe('primary')
    expect(reqTagType('nice')).toBe('info')
  })
})

describe('dimsText / percentText', () => {
  it('维度拼接', () => {
    expect(dimsText({ 地区: '全国', 口径: ' regular ' })).toBe('地区=全国，口径= regular ')
    expect(dimsText({})).toBe('—')
    expect(dimsText(null)).toBe('—')
  })
  it('覆盖率四舍五入到整数百分比', () => {
    expect(percentText(0.866)).toBe('87%')
    expect(percentText(null)).toBe('—')
  })
})
