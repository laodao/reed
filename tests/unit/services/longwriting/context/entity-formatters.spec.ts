/**
 * 步骤1 P2：entity-formatters 测试
 * @description 验证从 service 抽出的纯函数结构与原逻辑等价（content 字节级一致）
 */

import { describe, it, expect } from 'vitest'
import {
  buildCharacterInfo,
  renderCharacterText,
  buildLocationInfo,
  buildItemInfo,
  buildBackgroundInfo,
  renderBackgroundText,
  extractEndingByParagraph,
  countChineseChars,
  getMemoryTypeLabel,
  formatMemoryItem,
  getStoryTypeName,
  calculateStoryProgressStage,
} from '@core/platform/services/longwriting/context/entity-formatters'

describe('buildCharacterInfo', () => {
  it('完整角色：content 含名字/基本信息/外貌/状态', () => {
    const r = buildCharacterInfo({
      name: '林锋', gender: 'male', age: 35, occupation: '刑警',
      appearance: '高瘦', personality: '冷静', background: '前重案组',
      abilities: '推理', rolePosition: 'protagonist',
    }, '受伤')
    expect(r.title).toBe('林锋')
    expect(r.summary).toBe('林锋（主角）')
    expect(r.content).toContain('【林锋】')
    expect(r.content).toContain('基本信息：男，35岁，职业：刑警')
    expect(r.content).toContain('外貌特征：高瘦')
    expect(r.content).toContain('当前状态：受伤')
    expect(r.content).toContain('角色定位：主角')
  })

  it('空字段省略（不出现 "外貌特征：" 空行）', () => {
    const r = buildCharacterInfo({ name: '陈雪', gender: 'female', age: 28, rolePosition: 'supporting' })
    expect(r.content).not.toContain('外貌特征')
    expect(r.content).not.toContain('undefined')
    expect(r.summary).toBe('陈雪（配角）')
  })

  it('renderCharacterText 与旧 service builder 字节级一致', () => {
    const text = renderCharacterText({ name: 'A', gender: 'male', age: 20, rolePosition: 'minor' })
    expect(text).toBe('【A】\n- 基本信息：男，20岁\n- 角色定位：小角色\n')
  })
})

describe('buildLocationInfo', () => {
  it('地点：含类型/重要程度/描述', () => {
    const r = buildLocationInfo({ name: '码头', type: 'building', importance: 'main', description: '港口仓库' })
    expect(r.content).toContain('【码头】')
    expect(r.content).toContain('地点类型：建筑')
    expect(r.content).toContain('重要程度：主要场景')
    expect(r.content).toContain('详细描述：港口仓库')
  })
})

describe('buildItemInfo', () => {
  it('物品：含类型/等级/描述', () => {
    const r = buildItemInfo({ name: '匕首', type: 'weapon', level: 'rare', description: '带血迹' })
    expect(r.content).toContain('【匕首】')
    expect(r.content).toContain('物品类型：weapon')
    expect(r.content).toContain('等级：rare')
  })
})

describe('buildBackgroundInfo', () => {
  it('null background 返回 null', () => {
    expect(buildBackgroundInfo(null)).toBeNull()
  })

  it('背景：含时代/描述/社会结构', () => {
    const r = buildBackgroundInfo({ eraType: 'modern', eraDescription: '21世纪', socialStructure: '资本主义', specialRules: '无' })
    expect(r!.content).toContain('【世界观设定】')
    expect(r!.content).toContain('时代背景：现代')
    expect(r!.content).toContain('时代描述：21世纪')
    expect(renderBackgroundText(null)).toBe('')
  })
})

describe('extractEndingByParagraph', () => {
  it('短内容原样返回', () => {
    expect(extractEndingByParagraph('短内容', 550)).toBe('短内容')
  })

  it('长内容按段落从尾部截取', () => {
    const paras = Array.from({ length: 20 }, (_, i) => `段落${i}内容`.repeat(50))
    const content = paras.join('\n')
    const ending = extractEndingByParagraph(content, 550)
    // 截取后应比原文短，且包含末尾段落
    expect(ending.length).toBeLessThan(content.length)
    expect(ending).toContain('段落19')
  })
})

describe('记忆 + 工具函数', () => {
  it('getMemoryTypeLabel 中文映射', () => {
    expect(getMemoryTypeLabel('character_event')).toBe('角色')
    expect(getMemoryTypeLabel('unknown')).toBe('事件')
  })

  it('formatMemoryItem 渲染单条记忆', () => {
    const r = formatMemoryItem({ memoryType: 'character_event', title: '林锋离职', description: '六年前' })
    expect(r.summary).toBe('[角色] 林锋离职')
    expect(r.content).toBe('- [角色] 林锋离职：六年前')
  })

  it('countChineseChars 中文按字英文按词', () => {
    expect(countChineseChars('你好世界')).toBe(4)
    expect(countChineseChars('hello world')).toBe(2)
    expect(countChineseChars('')).toBe(0)
  })

  it('getStoryTypeName 映射', () => {
    expect(getStoryTypeName('xuanhuan')).toBe('玄幻')
    expect(getStoryTypeName('')).toBe('未指定')
  })

  it('calculateStoryProgressStage 按进度分阶段', () => {
    expect(calculateStoryProgressStage(1, 100)).toBe('故事开端阶段')
    expect(calculateStoryProgressStage(95, 100)).toBe('故事收尾阶段')
    expect(calculateStoryProgressStage(1, 0)).toBe('故事展开阶段')
  })
})
