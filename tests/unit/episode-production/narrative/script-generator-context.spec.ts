/**
 * 剧本生成家族 · 上下文注入单测（提示词优化方案 §3.4，Phase 2）
 * @module tests/unit/episode-production/narrative/script-generator-context
 *
 * 覆盖 §3.4 的注入补齐与结构修正：
 *   - 故事背景（era/region/extra）注入（优化前完全没有）
 *   - 体裁纪律按 genre 注入（短剧纪律不再无条件出现）
 *   - 台词单一来源声明 + 旁白质量规范（新增片段）
 *   - 篇幅目标（按 targetEpisodeDurationSec）
 *   - 纪律标题不再双写
 *   - 占位符填充改 fillPromptTemplate（$& 安全）
 *   - 续写/拆分也注入背景；续写补回保真纪律
 *   - 正文救援与主路径格式措辞一致 + 有保真纪律 + 三类花名册齐全
 */

import { describe, it, expect } from 'vitest'
import {
  buildScriptGenerationPrompt,
  buildContinuationPrompt,
  buildSceneSplitFromTextPrompt,
  buildScriptBodyOnlyPrompt,
  __test,
} from '@core/platform/episode-production/narrative/ai/script-generator'
import {
  buildPromptContext,
  createDefaultPromptContext,
} from '@core/platform/episode-production/prompts/prompt-context'
import type { AssetRosterForScript } from '@shared/types/episode-production'

const ROSTER: AssetRosterForScript = {
  characters: [{ bindingId: 'cb_a', name: '角色甲', description: '主角' }],
  locations: [{ bindingId: 'lb_a', name: '某山庄', description: '山庄' }],
  items: [{ bindingId: 'ib_a', name: '玉佩' }],
}

const CTX = buildPromptContext({
  storyEra: '唐代',
  storyRegion: '长安',
  storyExtra: '架空王朝',
  genre: 'short_drama',
  targetEpisodeDurationSec: 120,
})

describe('buildScriptGenerationPrompt · 故事背景注入（§3.4 新增）', () => {
  it('注入年代/地域/其他三段', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('## 故事背景')
    expect(p).toContain('年代：唐代')
    expect(p).toContain('地域：长安')
    expect(p).toContain('其他：架空王朝')
  })

  it('无背景配置时整段省略（不留空标题）', () => {
    const p = buildScriptGenerationPrompt(createDefaultPromptContext())
    expect(p).not.toContain('## 故事背景')
    expect(p).not.toMatch(/\n{4,}/)
  })

  it('背景段插在角色定位之后、协议骨架之前', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p.indexOf('## 故事背景')).toBeLessThan(p.indexOf('## ⚠️⚠️⚠️ 最重要'))
  })
})

describe('buildScriptGenerationPrompt · 体裁纪律（P2 类型定制）', () => {
  it('短剧项目注入短剧纪律（保留原有 6 条）', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('黄金三秒')
    expect(p).toContain('短剧')
  })

  it('电影项目不出现任何短剧话术', () => {
    const p = buildScriptGenerationPrompt(buildPromptContext({ genre: 'film' }))
    expect(p).not.toContain('黄金三秒')
    expect(p).not.toContain('爽点')
    expect(p).not.toContain('短剧')
  })

  it('纪律标题只出现一次（修历史 H2 双写）', () => {
    const p = buildScriptGenerationPrompt(CTX)
    const matches = p.match(/## 剧作改编纪律/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('custom 体裁无纪律段', () => {
    const p = buildScriptGenerationPrompt(buildPromptContext({ genre: 'custom' }))
    expect(p).not.toContain('## 剧作改编纪律')
  })
})

describe('buildScriptGenerationPrompt · 新增片段（§3.4/§4.1）', () => {
  it('含台词单一来源声明', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('台词单一来源声明')
    expect(p).toContain('唯一事实源')
  })

  it('含旁白质量规范（40-150 字 / 不与对白重复）', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('## 旁白（narration）规范')
    expect(p).toContain('40-150 字')
  })

  it('含保真纪律与 JSON 示例', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('原文保真纪律')
    expect(p).toContain('## JSON 场景数据格式示例')
  })
})

describe('buildScriptGenerationPrompt · 篇幅目标', () => {
  it('配置目标集长时注入场景数指导', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('## 篇幅目标')
    expect(p).toContain('120 秒')
  })

  it('未配置时不注入', () => {
    const p = buildScriptGenerationPrompt(createDefaultPromptContext())
    expect(p).not.toContain('## 篇幅目标')
  })
})

describe('占位符安全（§3.4 $& 注入面消除）', () => {
  it('__test.buildPrompt 用 fillPromptTemplate，章节内容含 $& 不被改写', () => {
    // String.replace 会把 "$&" 展开为匹配到的子串——历史 bug
    const p = __test.buildPrompt(ROSTER, '价格是 $& 元，折扣 $1 折')
    expect(p).toContain('$&')
    expect(p).toContain('$1')
  })

  it('花名册三类占位符都被替换', () => {
    const p = __test.buildPrompt(ROSTER, '正文')
    expect(p).toContain('cb_a')
    expect(p).toContain('lb_a')
    expect(p).toContain('ib_a')
    expect(p).not.toContain('{characters}')
    expect(p).not.toContain('{chapterContent}')
  })
})

describe('续写 / 拆分 / 正文救援 变体注入（§3.4）', () => {
  const continuationInput = {
    existingScriptContent: '已有正文',
    existingScenesSummary: '第1场 茶馆',
    instruction: '继续写',
    startSceneNumber: 2,
    roster: ROSTER,
  }

  it('续写注入故事背景（优化前无）', () => {
    const p = buildContinuationPrompt(continuationInput, CTX)
    expect(p).toContain('## 故事背景')
    expect(p).toContain('年代：唐代')
  })

  it('续写补回保真纪律（C2：按大纲续写新章节时需要）', () => {
    const p = buildContinuationPrompt(continuationInput, CTX)
    expect(p).toContain('原文保真纪律')
  })

  it('续写保留场次号接续约束', () => {
    const p = buildContinuationPrompt(continuationInput, CTX)
    expect(p).toContain('第 2 场')
    expect(p).toContain('严禁从 1 重新编号')
  })

  it('拆分注入故事背景', () => {
    const p = buildSceneSplitFromTextPrompt(
      {
        scriptText: '正文内容',
        existingScenesSummary: '第1场',
        startSceneNumber: 2,
        roster: ROSTER,
      },
      CTX,
    )
    expect(p).toContain('## 故事背景')
    expect(p).toContain('年代：唐代')
  })

  it('正文救援：含"居中缩进"（与主路径措辞一致）', () => {
    const rescue = buildScriptBodyOnlyPrompt(CTX)
    const main = buildScriptGenerationPrompt(CTX)
    expect(rescue).toContain('角色对白居中缩进')
    expect(main).toContain('角色对白居中缩进')
  })

  it('正文救援：含保真纪律（其产出要参与覆盖度比对）', () => {
    expect(buildScriptBodyOnlyPrompt(CTX)).toContain('原文保真纪律')
  })

  it('正文救援：含体裁纪律（不再写死短剧）', () => {
    expect(buildScriptBodyOnlyPrompt(buildPromptContext({ genre: 'film' }))).not.toContain('短剧')
  })
})

describe('旁白与台词结构（§4.2 预备）', () => {
  it('JSON 示例含旁白字段', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('"narration"')
  })

  it('JSON 示例的对白 id 前缀可用于 cogen 承接', () => {
    const p = buildScriptGenerationPrompt(CTX)
    expect(p).toContain('"dlg_1"')
    expect(p).toContain('"act_1"')
  })
})