/**
 * StructureDetector 小说/法规章节层级 单测
 * @description 回归：novel 检测曾把所有「第X章/第X节」都判为 level 1，
 *              导致章节树扁平成同级（章与节无法形成父子）。
 */
import { describe, it, expect } from 'vitest'
import { StructureDetector } from '@core/platform/services/chunk-splitter/structure-detector'

const detector = new StructureDetector()

describe('StructureDetector: 法条/章节层级', () => {
  it('「第X章」= level 1，「第X节」= level 2，且节的父指向最近的章', () => {
    const content = [
      '第一章　总　　则',
      '第一条　为了规范公司的组织和行为……',
      '第二章　公司登记',
      '第二十九条　设立公司，应当依法向公司登记机关申请设立登记。',
      '第一节　设立',
      '第四十二条　有限责任公司由一个以上五十个以下股东出资设立。',
      '第二节　登记程序',
      '第三十条　申请设立公司，应当提交设立登记申请书。',
      '第三章　组织机构',
      '第五十八条　有限责任公司股东会由全体股东组成。',
    ].join('\n')

    const structure = detector.detect(content)
    expect(structure.hasStructure).toBe(true)
    expect(structure.structureType).toBe('novel')

    const byTitle = new Map(structure.sections.map(s => [s.title, s]))
    expect(byTitle.get('第一章　总　　则')?.level).toBe(1)
    expect(byTitle.get('第一节　设立')?.level).toBe(2)
    expect(byTitle.get('第二节　登记程序')?.level).toBe(2)
    // 节的父章节 = 其所属的章
    expect(byTitle.get('第一节　设立')?.parentTitle).toBe('第二章　公司登记')
    expect(byTitle.get('第二节　登记程序')?.parentTitle).toBe('第二章　公司登记')
    // 章的父为空（顶层）
    expect(byTitle.get('第二章　公司登记')?.parentTitle).toBeUndefined()
  })

  it('英文 Chapter 标题为 level 1', () => {
    const content = [
      'Chapter 1 Introduction',
      'Some introduction text about the topic.',
      'Chapter 2 Methods',
      'Methods description goes here in detail.',
    ].join('\n')

    const structure = detector.detect(content)
    expect(structure.hasStructure).toBe(true)
    expect(structure.sections.every(s => s.level === 1)).toBe(true)
  })
})