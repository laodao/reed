/**
 * 模块能力卡目录单测（能力卡注册制，2026-09-20）
 * @module tests/unit/core/platform/workflow/module-capability-catalog.spec
 *
 * 契约钉住：卡结构完整、moduleId 唯一、摘要有界（提示词注入预算）、
 * keyword 过滤命中面（意图/能力条目也要命中）。
 */

import { describe, it, expect } from 'vitest'
import {
  MODULE_CAPABILITY_CARDS,
  renderModuleCapabilityDigest,
  filterModuleCapabilityCards,
} from '@core/platform/workflow/tools/module-capability-catalog'
import { buildSystemPrompt } from '@core/packs/chat/services/system-agent/system-agent.service'

describe('模块能力卡目录（能力卡注册制）', () => {
  it('卡契约完整：moduleId 唯一；每卡有意图与 ≥1 条调用路径；via 合法', () => {
    const ids = MODULE_CAPABILITY_CARDS.map((c) => c.moduleId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of MODULE_CAPABILITY_CARDS) {
      expect(c.name.trim().length).toBeGreaterThan(0)
      expect(c.tagline.trim().length).toBeGreaterThan(0)
      expect(c.intents.length).toBeGreaterThan(0)
      expect(c.capabilities.length).toBeGreaterThan(0)
      expect(c.invocation.length).toBeGreaterThan(0)
      for (const inv of c.invocation) {
        expect(['tool', 'workflow', 'skill', 'ui']).toContain(inv.via)
        expect(inv.how.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('关键模块在场且主调用路径与实况一致', () => {
    const byId = new Map(MODULE_CAPABILITY_CARDS.map((c) => [c.moduleId, c]))
    // 工作流引擎：运行 + 现写两条路径都必须点出
    const wf = byId.get('workflow')
    expect(wf).toBeDefined()
    expect(wf!.tagline).toContain('run_workflow')
    expect(wf!.tagline).toContain('create_workflow_draft')
    // 聊天宿主可直调工具必须出现在 data 卡的 tool 路径里
    const data = byId.get('data')!
    const toolHow = data.invocation.filter((i) => i.via === 'tool').map((i) => i.how).join(' ')
    expect(toolHow).toContain('web_search')
    expect(toolHow).toContain('wf_web_extract')
    // UI 主导模块不虚标直调路径
    const ep = byId.get('episode-production')!
    expect(ep.invocation.some((i) => i.via === 'ui')).toBe(true)
    expect(ep.invocation.some((i) => i.via === 'tool')).toBe(false)
  })

  it('提示词摘要有界：每卡 ≤220 字，总量 ≤2200 字（注入预算）', () => {
    const digest = renderModuleCapabilityDigest()
    for (const c of MODULE_CAPABILITY_CARDS) expect(c.tagline.length).toBeLessThanOrEqual(220)
    expect(digest.length).toBeLessThanOrEqual(2200)
    expect(digest.split('\n').length).toBe(MODULE_CAPABILITY_CARDS.length)
  })

  it('keyword 过滤命中面含 moduleId/意图/能力条目；空 keyword 返回全量', () => {
    expect(filterModuleCapabilityCards().length).toBe(MODULE_CAPABILITY_CARDS.length)
    const novel = filterModuleCapabilityCards('小说')
    expect(novel.map((c) => c.moduleId)).toContain('longwriting')
    // 口语短语不必逐字出现在卡上：CJK bigram 命中（audit 实测：纯子串匹配下 0 命中）
    const phrase = filterModuleCapabilityCards('写小说')
    expect(phrase.map((c) => c.moduleId)).toContain('longwriting')
    const clone = filterModuleCapabilityCards('音色复刻')
    expect(clone.map((c) => c.moduleId)).toContain('voice')
    const id = filterModuleCapabilityCards('EPISODE-PRODUCTION') // 大小写不敏感
    expect(id.map((c) => c.moduleId)).toContain('episode-production')
    expect(filterModuleCapabilityCards('不存在的能力xyz')).toHaveLength(0)
  })

  it('buildSystemPrompt 注入能力图（在路由纪律之后、人设之前）', () => {
    const p = buildSystemPrompt('你是毒舌编辑')
    expect(p).toContain('【系统功能模块能力图】')
    expect(p).toContain('discover_capabilities')
    expect(p).toContain('run_workflow')
    expect(p).toContain('create_workflow_draft')
    expect(p.indexOf('选择能力的纪律')).toBeLessThan(p.lastIndexOf('【系统功能模块能力图】'))
    expect(p.endsWith('你是毒舌编辑')).toBe(true)
    // 无角色人设时不留空段
    expect(buildSystemPrompt()).not.toContain('[对话设定')
  })
})
