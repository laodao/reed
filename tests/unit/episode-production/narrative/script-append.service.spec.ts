/**
 * ScriptAppendService（追加剧本）单测
 * @module tests/unit/episode-production/narrative/script-append.service
 *
 * 不打 AI 接口、不连数据库：AI 生成器 / 花名册构建 / 场景写入器三处外部依赖全部注入 stub。
 * 覆盖：
 * - 场次续号（nextSceneNumber / offsetSceneNumbers）—— 已有场次必须原样不动，新增场次接着排
 * - 已有场次一览（buildExistingScenesSummary）—— 供 AI 当上下文，空列表不留脏文本
 * - 正文拼接（mergeScriptContent）—— 增量追加，绝不覆盖已有正文
 * - 引用 id 重发（reassignRefIds）—— 避免与既有 scene_dialogues / scene_actions 主键撞车
 * - prepare：AI 续写 / 粘贴正文两种模式 + 空入参拦截
 * - append：只追加不删除、场次号接续、定稿状态处理
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ScriptAppendService,
  SCRIPT_SUMMARY_DESC_MAX,
  type AppendScriptDeps,
} from '@core/platform/episode-production/narrative/services/script-append.service'
import type {
  AssetRosterForScript,
  GeneratedScene,
  ScriptAppendDraft,
} from '@shared/types/episode-production'

const ROSTER: AssetRosterForScript = {
  characters: [{ bindingId: 'cb_zhangsan', name: '张三' }],
  locations: [{ bindingId: 'lb_teahouse', name: '茶馆' }],
  items: [{ bindingId: 'ib_teapot', name: '茶壶' }],
}

function scene(partial: Partial<GeneratedScene> & { sceneNumber: number }): GeneratedScene {
  return {
    location: '茶馆',
    locationBindingId: 'lb_teahouse',
    locationType: 'interior',
    timeOfDay: 'morning',
    sceneDescription: '茶馆内景',
    mood: '安静',
    characters: [],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
    ...partial,
  } as GeneratedScene
}

// ==================== 纯函数 ====================

describe('ScriptAppendService.nextSceneNumber', () => {
  it('没有已有场次 → 从第 1 场开始', () => {
    expect(ScriptAppendService.nextSceneNumber([])).toBe(1)
  })

  it('已有场次 1..3 → 下一个是 4', () => {
    expect(
      ScriptAppendService.nextSceneNumber([
        { sceneNumber: 1 },
        { sceneNumber: 2 },
        { sceneNumber: 3 },
      ]),
    ).toBe(4)
  })

  it('场次号不连续 → 取最大号 + 1（避免覆盖已删除号留下的空洞）', () => {
    expect(
      ScriptAppendService.nextSceneNumber([
        { sceneNumber: 1 },
        { sceneNumber: 5 },
        { sceneNumber: 2 },
      ]),
    ).toBe(6)
  })

  it('sceneNumber 缺失 / null → 按 0 处理', () => {
    expect(
      ScriptAppendService.nextSceneNumber([
        { sceneNumber: null },
        { sceneNumber: undefined },
      ]),
    ).toBe(1)
    expect(
      ScriptAppendService.nextSceneNumber([{ sceneNumber: 3 }, { sceneNumber: null }]),
    ).toBe(4)
  })
})

describe('ScriptAppendService.offsetSceneNumbers', () => {
  it('base=0 → 场次号保持 AI 给的编号', () => {
    const out = ScriptAppendService.offsetSceneNumbers(
      [scene({ sceneNumber: 1 }), scene({ sceneNumber: 2 })],
      0,
    )
    expect(out.map((s) => s.sceneNumber)).toEqual([1, 2])
  })

  it('base=3 → 整体偏移到 4,5,6', () => {
    const out = ScriptAppendService.offsetSceneNumbers(
      [scene({ sceneNumber: 1 }), scene({ sceneNumber: 2 }), scene({ sceneNumber: 3 })],
      3,
    )
    expect(out.map((s) => s.sceneNumber)).toEqual([4, 5, 6])
  })

  it('AI 给了乱序 / 重复编号 → 按数组顺序重排为连续号', () => {
    const out = ScriptAppendService.offsetSceneNumbers(
      [scene({ sceneNumber: 7 }), scene({ sceneNumber: 7 }), scene({ sceneNumber: 2 })],
      3,
    )
    expect(out.map((s) => s.sceneNumber)).toEqual([4, 5, 6])
  })

  it('空数组 → 空数组', () => {
    expect(ScriptAppendService.offsetSceneNumbers([], 5)).toEqual([])
  })

  it('不修改入参数组（纯函数）', () => {
    const input = [scene({ sceneNumber: 1 })]
    const out = ScriptAppendService.offsetSceneNumbers(input, 9)
    expect(input[0].sceneNumber).toBe(1)
    expect(out[0]).not.toBe(input[0])
    expect(out[0].sceneNumber).toBe(10)
  })
})

describe('ScriptAppendService.buildExistingScenesSummary', () => {
  it('没有已有场次 → 空串（由提示词构建器兜底成占位文本）', () => {
    expect(ScriptAppendService.buildExistingScenesSummary([])).toBe('')
  })

  it('每行含场次号 + 地点 + 内外景 + 时段 + 描述摘要', () => {
    const out = ScriptAppendService.buildExistingScenesSummary([
      {
        sceneNumber: 1,
        location: '茶馆',
        locationType: 'interior',
        timeOfDay: 'morning',
        sceneDescription: '清晨茶馆，张三推门进入',
      },
      {
        sceneNumber: 2,
        location: '长街',
        locationType: 'exterior',
        timeOfDay: 'night',
        sceneDescription: '雨夜长街',
      },
    ])
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('第 1 场')
    expect(lines[0]).toContain('茶馆')
    expect(lines[0]).toContain('内景')
    expect(lines[0]).toContain('清晨茶馆，张三推门进入')
    expect(lines[1]).toContain('第 2 场')
    expect(lines[1]).toContain('长街')
    expect(lines[1]).toContain('外景')
  })

  it('超长场景描述截断，避免把上下文撑爆', () => {
    const long = '甲'.repeat(SCRIPT_SUMMARY_DESC_MAX + 50)
    const out = ScriptAppendService.buildExistingScenesSummary([
      { sceneNumber: 1, location: '茶馆', sceneDescription: long },
    ])
    expect(out).toContain('…')
    expect(out.length).toBeLessThan(long.length)
  })
})

describe('ScriptAppendService.mergeScriptContent', () => {
  it('原正文为空 → 直接用新增段', () => {
    expect(ScriptAppendService.mergeScriptContent('', '第一场 茶馆')).toBe(
      '第一场 茶馆',
    )
    expect(ScriptAppendService.mergeScriptContent(null, '第一场 茶馆')).toBe(
      '第一场 茶馆',
    )
  })

  it('两侧都有 → 空行分隔拼接，原正文一字不改', () => {
    expect(ScriptAppendService.mergeScriptContent('旧正文', '新增正文')).toBe(
      '旧正文\n\n新增正文',
    )
  })

  it('新增段为空 → 原正文原样保留（不允许因为空追加把正文清掉）', () => {
    expect(ScriptAppendService.mergeScriptContent('旧正文', '')).toBe('旧正文')
    expect(ScriptAppendService.mergeScriptContent('旧正文', '   \n  ')).toBe('旧正文')
  })

  it('规整首尾空白，避免越追加越多空行', () => {
    expect(ScriptAppendService.mergeScriptContent('旧正文  \n\n', '  \n新增正文\n  ')).toBe(
      '旧正文\n\n新增正文',
    )
  })
})

describe('ScriptAppendService.reassignRefIds', () => {
  it('对话 / 动作 id 全部重发，且不等于 AI 给的 dlg_1 / act_1', () => {
    const out = ScriptAppendService.reassignRefIds([
      scene({
        sceneNumber: 1,
        dialogues: [
          {
            id: 'dlg_1',
            characterBindingId: 'cb_zhangsan',
            characterId: '',
            characterName: '张三',
            text: '请来一壶茶',
          },
        ],
        actions: [
          {
            id: 'act_1',
            characterBindingId: 'cb_zhangsan',
            description: '坐下',
            timing: 'before',
          },
        ],
      }),
    ])
    expect(out[0].dialogues[0].id).not.toBe('dlg_1')
    expect(out[0].actions[0].id).not.toBe('act_1')
  })

  it('同一批次内 id 全局唯一（多场景不重复）', () => {
    const out = ScriptAppendService.reassignRefIds([
      scene({
        sceneNumber: 1,
        dialogues: [
          {
            id: 'dlg_1',
            characterBindingId: null,
            characterId: '',
            characterName: '张三',
            text: 'A',
          },
        ],
      }),
      scene({
        sceneNumber: 2,
        dialogues: [
          {
            id: 'dlg_1',
            characterBindingId: null,
            characterId: '',
            characterName: '李四',
            text: 'B',
          },
        ],
      }),
    ])
    const ids = out.flatMap((s) => s.dialogues.map((d) => d.id))
    expect(new Set(ids).size).toBe(2)
  })

  it('业务字段原样保留', () => {
    const out = ScriptAppendService.reassignRefIds([
      scene({
        sceneNumber: 1,
        dialogues: [
          {
            id: 'dlg_1',
            characterBindingId: 'cb_zhangsan',
            characterId: '',
            characterName: '张三',
            text: '请来一壶茶',
            emotion: '平静',
          },
        ],
      }),
    ])
    expect(out[0].dialogues[0].text).toBe('请来一壶茶')
    expect(out[0].dialogues[0].emotion).toBe('平静')
    expect(out[0].dialogues[0].characterBindingId).toBe('cb_zhangsan')
  })

  it('不修改入参', () => {
    const input = [
      scene({
        sceneNumber: 1,
        dialogues: [
          {
            id: 'dlg_1',
            characterBindingId: null,
            characterId: '',
            characterName: '张三',
            text: 'A',
          },
        ],
      }),
    ]
    ScriptAppendService.reassignRefIds(input)
    expect(input[0].dialogues[0].id).toBe('dlg_1')
  })
})

// ==================== prepare / append ====================

const EXISTING_SCRIPT = {
  id: 'es_1',
  projectId: 'p1',
  episodeId: 'ep1',
  status: 'approved',
  synopsis: '旧梗概',
  scriptContent: '旧正文',
  scriptFormat: 'standard',
  scenes: [],
  totalDuration: 0,
  characterAppearances: [],
  createdAt: 1,
  updatedAt: 1,
} as any

const EXISTING_SCENES = [
  {
    id: 'ss_1',
    episodeScriptId: 'es_1',
    sceneNumber: 1,
    location: '茶馆',
    locationType: 'interior',
    timeOfDay: 'morning',
    sceneDescription: '清晨茶馆',
  },
  {
    id: 'ss_2',
    episodeScriptId: 'es_1',
    sceneNumber: 2,
    location: '长街',
    locationType: 'exterior',
    timeOfDay: 'night',
    sceneDescription: '雨夜长街',
  },
] as any[]

function makeDb(scenes: any[] = EXISTING_SCENES) {
  return {
    dataSource: {} as any,
    episodeScripts: {
      getById: vi.fn(async () => EXISTING_SCRIPT),
      update: vi.fn(async (_id: string, data: any) => ({ ...EXISTING_SCRIPT, ...data })),
    },
    sceneScripts: {
      getByEpisodeScriptId: vi.fn(async () => scenes),
      // 「重新生成 / 重新拆分」会走的删除接口 —— 追加模式绝不允许碰它
      deleteByEpisodeScriptId: vi.fn(async () => 0),
      delete: vi.fn(async () => true),
    },
    videoEpisodes: {
      getById: vi.fn(async () => ({ id: 'ep1', projectId: 'p1' })),
    },
  } as any
}

function makeService(overrides: {
  scenes?: any[]
  generator?: any
  createScenes?: any
} = {}) {
  const db = makeDb(overrides.scenes)
  const generator = {
    continueScript: vi.fn(async () => ({
      synopsis: '本段梗概',
      scriptContent: '新增正文',
      scenes: [scene({ sceneNumber: 1 }), scene({ sceneNumber: 2 })],
    })),
    splitScriptTextToScenes: vi.fn(async () => [scene({ sceneNumber: 1 })]),
    ...overrides.generator,
  }
  const createScenes = overrides.createScenes ?? vi.fn(async () => [])
  const deps: AppendScriptDeps = {
    generator: generator as any,
    createScenes,
    buildRoster: vi.fn(async () => ROSTER),
  }
  return { db, generator, createScenes, service: new ScriptAppendService(db, deps) }
}

describe('ScriptAppendService.prepare', () => {
  beforeEach(() => vi.clearAllMocks())

  it('AI 续写：场次号接着已有场次排（已有 2 场 → 新增从第 3 场开始）', async () => {
    const { service, generator } = makeService()
    const preview = await service.prepare({
      scriptId: 'es_1',
      mode: 'ai-continue',
      instruction: '往下写主角进城',
    })
    expect(generator.continueScript).toHaveBeenCalledTimes(1)
    expect(preview.startSceneNumber).toBe(3)
    expect(preview.existingSceneCount).toBe(2)
    expect(preview.existingContentLength).toBe('旧正文'.length)
    expect(preview.draft.scenes.map((s) => s.sceneNumber)).toEqual([3, 4])
    expect(preview.draft.scriptContent).toBe('新增正文')
    expect(preview.draft.synopsis).toBe('本段梗概')
  })

  it('AI 续写：把已有正文 / 已有场次一览 / 续写要求喂给生成器', async () => {
    const { service, generator } = makeService()
    await service.prepare({
      scriptId: 'es_1',
      mode: 'ai-continue',
      instruction: '往下写主角进城',
    })
    const arg = generator.continueScript.mock.calls[0][0]
    expect(arg.existingScriptContent).toBe('旧正文')
    expect(arg.instruction).toBe('往下写主角进城')
    expect(arg.startSceneNumber).toBe(3)
    expect(arg.existingScenesSummary).toContain('第 2 场')
    expect(arg.roster).toBe(ROSTER)
  })

  it('粘贴正文：走拆场景，synopsis 为空串', async () => {
    const { service, generator } = makeService()
    const preview = await service.prepare({
      scriptId: 'es_1',
      mode: 'manual-text',
      text: '我自己写的第三场正文',
    })
    expect(generator.splitScriptTextToScenes).toHaveBeenCalledTimes(1)
    expect(generator.continueScript).not.toHaveBeenCalled()
    expect(preview.draft.scriptContent).toBe('我自己写的第三场正文')
    expect(preview.draft.synopsis).toBe('')
    expect(preview.draft.scenes.map((s) => s.sceneNumber)).toEqual([3])
  })

  it('AI 续写缺少续写要求 → 报错（不允许空要求硬编）', async () => {
    const { service, generator } = makeService()
    await expect(
      service.prepare({ scriptId: 'es_1', mode: 'ai-continue', instruction: '   ' }),
    ).rejects.toThrow(/续写要求/)
    expect(generator.continueScript).not.toHaveBeenCalled()
  })

  it('粘贴正文模式缺少正文 → 报错', async () => {
    const { service, generator } = makeService()
    await expect(
      service.prepare({ scriptId: 'es_1', mode: 'manual-text', text: '' }),
    ).rejects.toThrow(/正文/)
    expect(generator.splitScriptTextToScenes).not.toHaveBeenCalled()
  })

  it('剧本不存在 → 报错', async () => {
    const { service, db } = makeService()
    db.episodeScripts.getById.mockResolvedValueOnce(null)
    await expect(
      service.prepare({ scriptId: 'missing', mode: 'ai-continue', instruction: '继续' }),
    ).rejects.toThrow(/剧本不存在/)
  })

  it('剧本没有场次也能续写（从第 1 场开始）', async () => {
    const { service } = makeService({ scenes: [] })
    const preview = await service.prepare({
      scriptId: 'es_1',
      mode: 'ai-continue',
      instruction: '开始写',
    })
    expect(preview.startSceneNumber).toBe(1)
    expect(preview.existingSceneCount).toBe(0)
  })

  it('剧本无正文 → existingContentLength 为 0', async () => {
    const { service, db } = makeService()
    db.episodeScripts.getById.mockResolvedValueOnce({ ...EXISTING_SCRIPT, scriptContent: null })
    const preview = await service.prepare({
      scriptId: 'es_1',
      mode: 'ai-continue',
      instruction: '继续',
    })
    expect(preview.existingContentLength).toBe(0)
  })
})

describe('ScriptAppendService.append', () => {
  beforeEach(() => vi.clearAllMocks())

  const draft: ScriptAppendDraft = {
    scriptContent: '新增正文',
    synopsis: '本段梗概',
    scenes: [scene({ sceneNumber: 3 }), scene({ sceneNumber: 4 })],
  }

  it('正文追加到旧正文后面（不覆盖）', async () => {
    const { service, db } = makeService()
    await service.append('es_1', draft)
    const [, data] = db.episodeScripts.update.mock.calls[0]
    expect(data.scriptContent).toBe('旧正文\n\n新增正文')
  })

  it('只新增场次：绝不调用删除接口（不能走"删旧建新"那条路）', async () => {
    const { service, db } = makeService()
    await service.append('es_1', draft)
    expect(db.sceneScripts.deleteByEpisodeScriptId).not.toHaveBeenCalled()
    expect(db.sceneScripts.delete).not.toHaveBeenCalled()
    expect(db.sceneScripts.getByEpisodeScriptId).toHaveBeenCalled()
  })

  it('新增场次交给 SceneBindingWriter，编号接着已有场次（已有 2 场 → 3,4）', async () => {
    const { service, createScenes } = makeService()
    await service.append('es_1', draft)
    const call = createScenes.mock.calls[0]
    expect(call[1]).toBe('es_1')
    expect(call[2].map((s: GeneratedScene) => s.sceneNumber)).toEqual([3, 4])
  })

  it('已定稿剧本追加后回到草稿态（新内容需重新定稿）', async () => {
    const { service, db } = makeService()
    await service.append('es_1', draft)
    const [, data] = db.episodeScripts.update.mock.calls[0]
    expect(data.status).toBe('reviewing')
  })

  it('keepApproved=true → 保持 approved（边做边加内容时不打断后续 stage）', async () => {
    const { service, db } = makeService()
    await service.append('es_1', draft, { keepApproved: true })
    const [, data] = db.episodeScripts.update.mock.calls[0]
    expect(data.status).toBeUndefined()
  })

  it('未定稿剧本不会被强行改成 reviewing（状态不变）', async () => {
    const { service, db } = makeService()
    db.episodeScripts.getById.mockResolvedValue({
      ...EXISTING_SCRIPT,
      status: 'pending',
    })
    await service.append('es_1', draft)
    const [, data] = db.episodeScripts.update.mock.calls[0]
    expect(data.status).toBeUndefined()
  })

  it('梗概不被覆盖（增量内容不该顶掉整集梗概）', async () => {
    const { service, db } = makeService()
    await service.append('es_1', draft)
    const [, data] = db.episodeScripts.update.mock.calls[0]
    expect(data.synopsis).toBeUndefined()
  })

  it('没有新增场景 → 只追加正文，不调用场景写入器', async () => {
    const { service, createScenes, db } = makeService()
    const result = await service.append('es_1', {
      scriptContent: '只有正文',
      synopsis: '',
      scenes: [],
    })
    expect(createScenes).not.toHaveBeenCalled()
    expect(result.addedScenes).toEqual([])
    expect(db.episodeScripts.update.mock.calls[0][1].scriptContent).toBe('旧正文\n\n只有正文')
  })

  it('写库前重发对话 / 动作 id，避免与已有 scene_dialogues 主键撞车', async () => {
    const { service, createScenes } = makeService()
    await service.append('es_1', {
      scriptContent: '',
      synopsis: '',
      scenes: [
        scene({
          sceneNumber: 3,
          dialogues: [
            {
              id: 'dlg_1',
              characterBindingId: null,
              characterId: '',
              characterName: '张三',
              text: 'A',
            },
          ],
          actions: [
            {
              id: 'act_1',
              characterBindingId: null,
              description: '坐下',
              timing: 'before',
            },
          ],
        }),
      ],
    })
    const written = createScenes.mock.calls[0][2] as GeneratedScene[]
    expect(written[0].dialogues[0].id).not.toBe('dlg_1')
    expect(written[0].actions[0].id).not.toBe('act_1')
    expect(written[0].dialogues[0].text).toBe('A')
  })

  it('没有任何新增内容 → 报错（避免空追加把 updatedAt 刷脏）', async () => {
    const { service } = makeService()
    await expect(
      service.append('es_1', { scriptContent: '  ', synopsis: '', scenes: [] }),
    ).rejects.toThrow(/没有任何新增内容/)
  })

  it('返回追加后的剧本与新增场次', async () => {
    const saved = [{ id: 'ss_9', sceneNumber: 3 }] as any[]
    const { service } = makeService({ createScenes: vi.fn(async () => saved) })
    const result = await service.append('es_1', draft)
    expect(result.addedScenes).toBe(saved)
    expect(result.script.scriptContent).toBe('旧正文\n\n新增正文')
  })
})
