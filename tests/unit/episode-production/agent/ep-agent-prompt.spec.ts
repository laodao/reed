/**
 * Agent 系统提示词与状态快照单测（提示词优化方案 §3.1，Phase 2）
 * @module tests/unit/episode-production/agent/ep-agent-prompt
 *
 * 覆盖 §3.1：
 *   - 快照补注入风格/画幅/体裁/目标集长（纪律 6 依赖风格文本，否则空转）
 *   - 三类资产全名名单（此前地点/物品只有计数没名字，纪律 5 对它们不可满足）
 *   - 纪律数字从 EP_TOOL_MAX_CALLS 渲染（消除双写漂移）
 *   - 新增破坏性操作确认与中断语义纪律
 */

import { describe, it, expect } from 'vitest'
import {
  epAgentSystemPrompt,
  epStateToSnapshot,
} from '@core/platform/episode-production/agent/ep-agent-harness.service'
import { EP_TOOL_MAX_CALLS } from '@core/platform/episode-production/agent/ep-agent-tools'
import { buildPromptContext } from '@core/platform/episode-production/prompts/prompt-context'

/** 构造最小生产状态（快照测试用） */
function fakeState(over: Record<string, unknown> = {}): any {
  return {
    project: { id: 'p1', name: '测试项目' },
    episode: {
      id: 'e1',
      title: '第一集',
      episodeNumber: 1,
      status: 'scripting',
      hasScript: true,
      synopsis: '梗概内容',
      composedVideoPath: null,
    },
    scenes: { total: 3, countWithBindings: 2 },
    storyboards: { total: 10, scenesCovered: 2, scenesTotal: 3 },
    production: {
      storyboardsWithKeyframes: 4,
      storyboardsWithVideo: 0,
      scenesWithAudio: 0,
    },
    assets: {
      characters: { count: 2, names: ['角色甲', '角色乙'] },
      locations: { count: 2, names: ['某山庄', '某书房'] },
      items: { count: 1, names: ['玉佩'] },
    },
    dataSources: ['金融库'],
    ...over,
  }
}

describe('epAgentSystemPrompt · 纪律', () => {
  const p = epAgentSystemPrompt()

  it('角色段声明完整流水线', () => {
    expect(p).toContain('制作助理')
    expect(p).toContain('剧本 → 场景 → 分镜 → 关键帧 → 视频 → 配音 → 合成导出 MP4')
  })

  it('资产生成频控数字从 EP_TOOL_MAX_CALLS 渲染（不再双写）', () => {
    expect(p).toContain(`每轮限 ${EP_TOOL_MAX_CALLS.generate_char_asset} 次`)
    // 反向断言：不得出现与常量不一致的硬编码"每轮限 3 次"以外的值
    expect(p).not.toContain('每轮限 5 次')
  })

  it('新增破坏性操作确认纪律（§3.1）', () => {
    expect(p).toContain('破坏性操作必须先确认')
    expect(p).toContain('删除资产/场景/分镜')
    expect(p).toContain('force 全量重写')
    expect(p).toContain('ep_confirm_choice')
  })

  it('新增中断语义纪律（§3.1）', () => {
    expect(p).toContain('用户可随时中断本轮')
    expect(p).toContain('立即停止发新工具调用')
    expect(p).toContain('先重算状态')
  })

  it('保留既有纪律要点（不回归）', () => {
    expect(p).toContain('不要拆解规划')
    expect(p).toContain('name 必须用状态快照或工具结果里的真实资产名')
    expect(p).toContain('分钟级后台任务')
    expect(p).toContain('轮初')
  })

  it('纪律 6 指向快照里的风格字段（可执行）', () => {
    expect(p).toContain('风格锚点（快照里的「风格」字段）')
  })

  it('纪律条目连续编号无跳号', () => {
    const nums = [...p.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]))
    expect(nums).toEqual([...Array(nums.length)].map((_, i) => i + 1))
  })
})

describe('epStateToSnapshot · 资产名单（§3.1 三类对齐）', () => {
  it('地点/物品也列出名字（此前只有计数）', () => {
    const s = epStateToSnapshot(fakeState())
    expect(s).toContain('角色 2')
    expect(s).toContain('角色甲、角色乙')
    expect(s).toContain('地点 2（某山庄、某书房）')
    expect(s).toContain('物品 1（玉佩）')
  })

  it('超过 8 个时截断并注明剩余数量', () => {
    const names = Array.from({ length: 11 }, (_, i) => `角色${i + 1}`)
    const s = epStateToSnapshot(
      fakeState({ assets: { ...fakeState().assets, characters: { count: 11, names } } }),
    )
    expect(s).toContain('角色1')
    expect(s).toContain('角色8')
    expect(s).not.toContain('角色9')
    expect(s).toContain('另有 3 个未列出')
  })

  it('空名单不产生空括号', () => {
    const s = epStateToSnapshot(
      fakeState({
        assets: {
          characters: { count: 0, names: [] },
          locations: { count: 0, names: [] },
          items: { count: 0, names: [] },
        },
      }),
    )
    expect(s).toContain('角色 0；')
    expect(s).not.toContain('（）')
  })
})

describe('epStateToSnapshot · 制作参数（§3.1 新增）', () => {
  it('注入风格/画幅/体裁/目标集长/背景（纪律 6 依赖）', () => {
    const ctx = buildPromptContext({
      storyEra: '唐代',
      storyRegion: '长安',
      genre: 'short_drama',
      stylePrompt: '国风工笔',
      aspectRatio: '9:16',
      targetEpisodeDurationSec: 120,
    })
    const s = epStateToSnapshot(fakeState(), undefined, ctx)

    expect(s).toContain('制作参数：')
    expect(s).toContain('风格：国风工笔')
    expect(s).toContain('画幅：9:16')
    expect(s).toContain('体裁：竖屏短剧')
    expect(s).toContain('目标集长：约 120 秒')
    expect(s).toContain('年代：唐代')
    expect(s).toContain('地域：长安')
  })

  it('无上下文时不注入制作参数行（行为等价优化前）', () => {
    const s = epStateToSnapshot(fakeState())
    expect(s).not.toContain('制作参数：')
  })

  it('部分字段缺失时只注入已有项', () => {
    const s = epStateToSnapshot(fakeState(), undefined, buildPromptContext({ stylePrompt: '写实' }))
    expect(s).toContain('制作参数：风格：写实')
    expect(s).not.toContain('画幅')
  })

  it('保留既有快照行（不回归）', () => {
    const s = epStateToSnapshot(fakeState(), '分镜页')
    expect(s).toContain('项目：测试项目')
    expect(s).toContain('剧集：第一集 第1集（状态：scripting，剧本：已有）')
    expect(s).toContain('梗概：梗概内容')
    expect(s).toContain('场景：3 个（2 个已绑定地点）')
    expect(s).toContain('分镜：10 个，覆盖 2/3 场')
    expect(s).toContain('阶段就绪：')
    expect(s).toContain('候选数据源名单：金融库')
    expect(s).toContain('用户当前界面：分镜页')
  })
})