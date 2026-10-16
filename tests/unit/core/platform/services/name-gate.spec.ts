/**
 * NameGate G0 规则层单测
 * 误报样本取自天下女捕实测（张纸/白天/何时/朱笔/沈家/账房先生）；
 * 放行样本含姓氏+称谓可用人名把手（裴先生/老冯掌柜/周婆子）。
 */
import { describe, it, expect } from 'vitest'
import {
  checkNameCandidate,
  checkNameCandidateInContent,
  collectNameContexts,
  describeRejectReason,
} from '@core/platform/services/longwriting/graph/name-gate.service'

describe('NameGate G0 规则层', () => {
  it('拦截时间词/疑问词（何时/白天/当时）', () => {
    expect(checkNameCandidate({ name: '何时' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '何时' }).reason).toBe('time_interrogative')
    expect(checkNameCandidate({ name: '白天' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '当时' }).pass).toBe(false)
  })

  it('拦截家族指称（沈家/贺家二公子）', () => {
    expect(checkNameCandidate({ name: '沈家' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '沈家' }).reason).toBe('family_reference')
    expect(checkNameCandidate({ name: '贺家二公子' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '万家' }).pass).toBe(false)
  })

  it('拦截泛称与职务统称（账房先生/船家婆），放行姓氏+称谓把手（许先生）', () => {
    expect(checkNameCandidate({ name: '账房先生' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '账房先生' }).reason).toBe('generic_role')
    expect(checkNameCandidate({ name: '船家婆' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '许先生' }).pass).toBe(true)
  })

  it('量词语境拦截（"一张纸"截出的张纸）', () => {
    const content = '他拿出一张纸递过来。她又取一张纸写卜辞。案头一张纸压着茶盏。'
    expect(checkNameCandidateInContent('张纸', content).pass).toBe(false)
    expect(checkNameCandidateInContent('张纸', content).reason).toBe('quantifier_fragment')
  })

  it('量词占比不足阈值时放行（真名偶尔跟量词不误杀）', () => {
    // "张贴"榜文 1 次量词语境 vs 提到 2 次（无量词前字）→ 占比 1/3 < 0.6
    const content = '衙门张贴告示。张三来寻李四。王五见到张铁口。'
    expect(checkNameCandidateInContent('张三', content).pass).toBe(true)
  })

  it('拦截器物/文书词（朱笔/金纹），放行真名（陈绣娘）', () => {
    expect(checkNameCandidate({ name: '朱笔' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '朱笔' }).reason).toBe('artifact_concept')
    expect(checkNameCandidate({ name: '金纹' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '陈绣娘' }).pass).toBe(true)
  })

  it('放行实测中的真龙套名（老冯掌柜/周婆子/许三）', () => {
    expect(checkNameCandidate({ name: '老冯掌柜' }).pass).toBe(true)
    expect(checkNameCandidate({ name: '周婆子' }).pass).toBe(true)
    expect(checkNameCandidate({ name: '许三' }).pass).toBe(true)
  })

  it('单字候选拦截', () => {
    expect(checkNameCandidate({ name: '张' }).pass).toBe(false)
    expect(checkNameCandidate({ name: '张' }).reason).toBe('too_short')
  })

  it('collectNameContexts 提取出现点前缀', () => {
    const contexts = collectNameContexts('张纸', '拿一张纸来，一张纸写满字')
    expect(contexts).toEqual(['拿一', '，一'])
  })

  it('describeRejectReason 输出可读原因', () => {
    expect(describeRejectReason('time_interrogative')).toContain('时间词')
  })
})
