/**
 * 步骤0 阶段6：lw-vector-serializer 测试
 * @description 验证各 entityType 的序列化文本正确性（真实字段名、空字段省略、id[] 解析为名字）
 */

import { describe, it, expect } from 'vitest'
import { serializeEntity } from '@core/platform/services/longwriting/lw-vector-serializer'

describe('serializeEntity', () => {
  describe('character', () => {
    it('完整角色序列化', () => {
      const r = serializeEntity('character', {
        name: '林锋',
        rolePosition: 'main',
        gender: '男',
        age: 35,
        appearance: '高瘦，左臂有旧伤疤',
        personality: '冷静、执着',
        background: '前重案组刑警',
        abilities: '推理、枪法',
        majorEvents: '六年前旧案被调离',
      } as any)
      expect(r.text).toContain('林锋')
      expect(r.text).toContain('主角') // rolePosition 'main' → 中文标签
      expect(r.text).toContain('冷静、执着')
      expect(r.text).toContain('前重案组刑警')
    })

    it('空字段省略（不出现 "外貌：undefined"）', () => {
      const r = serializeEntity('character', {
        name: '陈雪', rolePosition: 'secondary',
      } as any)
      expect(r.text).toContain('陈雪')
      expect(r.text).not.toContain('undefined')
      expect(r.text).not.toContain('外貌：')
    })

    it('preview 是 text 前 200 字', () => {
      const long = 'A'.repeat(300)
      const r = serializeEntity('character', { name: long, rolePosition: 'main' } as any)
      expect(r.preview.length).toBeLessThanOrEqual(200)
    })
  })

  describe('location', () => {
    it('地点序列化', () => {
      const r = serializeEntity('location', {
        name: '码头仓库', type: 'warehouse', description: '废弃的港口仓库',
        entityImportance: 'main',
      } as any)
      expect(r.text).toContain('码头仓库')
      expect(r.text).toContain('废弃的港口仓库')
      expect(r.text).not.toContain('undefined')
    })
  })

  describe('item', () => {
    it('物品序列化', () => {
      const r = serializeEntity('item', {
        name: '凶器匕首', type: 'weapon', level: 'rare', description: '带血迹的匕首',
      } as any)
      expect(r.text).toContain('凶器匕首')
      expect(r.text).toContain('带血迹的匕首')
    })
  })

  describe('plot', () => {
    it('情节序列化（涉及角色 id 解析为名字）', () => {
      const r = serializeEntity('plot', {
        title: '码头追凶', summary: '林锋在码头与线人碰头',
        involvedCharacters: ['c1', 'c2'],
        involvedLocations: ['l1'],
      } as any, {
        characterNames: { c1: '林锋', c2: '陈雪' },
        locationNames: { l1: '码头' },
      })
      expect(r.text).toContain('码头追凶')
      expect(r.text).toContain('林锋')
      expect(r.text).toContain('陈雪')
      expect(r.text).toContain('码头')
    })

    it('plot 无 ctx 时 id 原样保留（不崩）', () => {
      const r = serializeEntity('plot', {
        title: 'T', summary: 'S', involvedCharacters: ['c1'],
      } as any)
      expect(r.text).toContain('T')
      expect(r.text).not.toContain('undefined')
    })
  })

  describe('outline', () => {
    it('大纲节点序列化', () => {
      const r = serializeEntity('outline', {
        name: '第3章 暗夜追踪', nodeType: 'chapter', summary: '林锋追踪线索到码头',
      } as any)
      expect(r.text).toContain('第3章 暗夜追踪')
      expect(r.text).toContain('林锋追踪线索到码头')
    })
  })

  describe('memory', () => {
    it('记忆序列化', () => {
      const r = serializeEntity('memory', {
        memoryType: 'character_event',
        title: '林锋被迫离职',
        description: '六年前因坚持复查被调离',
        involvedEntities: [{ type: 'character', id: 'c1', name: '林锋' }],
        chapterNumber: 0,
      } as any)
      expect(r.text).toContain('林锋被迫离职')
      expect(r.text).toContain('六年前因坚持复查被调离')
      expect(r.text).toContain('林锋')
    })
  })

  it('未知 entityType 抛错', () => {
    expect(() => serializeEntity('unknown_type' as any, {} as any)).toThrow()
  })
})
