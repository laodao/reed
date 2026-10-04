/**
 * 设定资产库 AI 生成服务（P1：世界观向导 + IP 角色向导，2026-09-25）
 * @module platform/services/longwriting/library/library-ai.service
 *
 * 自含 provider 解析与流式调用（与 longwriting-ai.callAIStream 同源逻辑，不回填 4000 行大文件）；
 * 事件复用既有 `longwriting:generate:{eventId}` 通道——前端 onGenerateEvent 零新增订阅面。
 * 生成范式（设计 §5.1）：确定性多 pass 里的「单 kind 分批生成」与「单卡生成」先行，
 * 世界骨架 pass 与修复回路留待与 volume-design-flow 对齐的后续迭代。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { createProvider } from '@core/platform/providers/llm'
import { PROVIDER_TEMPLATES, isApiKeyOptional } from '@core/platform/services/provider-template.service'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import type { ProviderTemplate, UserProviderConfig, ChatContext } from '@shared/types'
import type { GenerationStreamEvent } from '@core/platform/services/longwriting-ai.service'
import type { WorldEntry, IpCharacter, LibraryFieldSchemaItem } from '@shared/types/lw-library.types'

export interface GenerateWorldEntriesRequest {
  eventId: string
  worldId: string
  kindKey: string
  count?: number
  requirements?: string
  providerConfigId?: string
  modelId?: string
}

export interface GenerateIpCharacterRequest {
  eventId: string
  seedIdea: string
  worldId?: string | null
  requirements?: string
  providerConfigId?: string
  modelId?: string
}

/** 从模型输出中提取 JSON 数组/对象（容忍 markdown 代码块与前后杂文） */
export function extractJsonArray(text: string): unknown[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const arrMatch = candidate.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0])
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  const objMatch = candidate.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0])
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return null
    }
  }
  return null
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const objMatch = candidate.match(/\{[\s\S]*\}/)
  if (!objMatch) return null
  try {
    const parsed = JSON.parse(objMatch[0])
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export class LibraryAIService {
  private async resolveProvider(providerConfigId?: string): Promise<{
    config: UserProviderConfig
    template: ProviderTemplate
    apiKey: string
  } | null> {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.providerConfigs) return null

    let config: UserProviderConfig | null = null
    if (providerConfigId) {
      config = await dbManager.providerConfigs.getById(providerConfigId)
    }
    if (!config) {
      config = await dbManager.providerConfigs.getDefault()
    }
    if (!config) {
      const enabled = await dbManager.providerConfigs.getEnabled()
      if (enabled.length > 0) config = enabled[0]
    }
    const template = config ? PROVIDER_TEMPLATES.find(t => t.id === config!.templateId) : undefined
    if (!config || !template) return null
    if (!config.apiKey && !isApiKeyOptional(template)) return null

    // 解密 API 密钥（与 longwriting-ai 同源；免密钥提供商置空串）
    const secureStorage = getSecureStorage()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const apiKey = config.apiKey ? secureStorage.decrypt(config.apiKey) : ''
    return { config, template, apiKey }
  }

  /** 与 longwriting-ai.callAIStream 同构：流式 delta 走同一 `longwriting:generate:{eventId}` 通道 */
  private async callStream(
    eventId: string,
    prompt: string,
    systemPrompt: string,
    maxTokens: number | undefined,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<string> {
    const providerInfo = await this.resolveProvider(providerConfigId)
    if (!providerInfo) throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
    const { config, template, apiKey } = providerInfo
    const effectiveModelId = modelId || config.models?.[0]?.id || ''
    const provider = createProvider(
      template.id,
      { apiKey, baseUrl: config.baseUrl, defaultModel: effectiveModelId },
      template,
      config,
    )
    const context: ChatContext = {
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }
    getEventEmitter().emit(`longwriting:generate:${eventId}`, { type: 'start' } as GenerationStreamEvent)
    let fullContent = ''
    try {
      fullContent = await provider.chatStream(
        context,
        event => {
          if (event.type === 'delta' && event.content) {
            fullContent += event.content
            getEventEmitter().emit(`longwriting:generate:${eventId}`, {
              type: 'content',
              content: event.content,
            } as GenerationStreamEvent)
          }
        },
        undefined,
        { maxTokens: maxTokens || 4096 },
      )
      getEventEmitter().emit(`longwriting:generate:${eventId}`, { type: 'done', content: fullContent } as GenerationStreamEvent)
    } catch (error: any) {
      getEventEmitter().emit(`longwriting:generate:${eventId}`, {
        type: 'error',
        error: error?.message || 'AI 生成失败',
      } as GenerationStreamEvent)
      throw error
    }
    return fullContent
  }

  // ==================== 世界观条目生成（按 kind 分批） ====================

  async generateWorldEntries(req: GenerateWorldEntriesRequest): Promise<{ success: boolean; created: number; entries: WorldEntry[]; error?: string }> {
    const db = getCoreDatabaseManager()
    const world = await db.lwWorlds!.getById(req.worldId)
    if (!world) return { success: false, created: 0, entries: [], error: '世界观不存在' }
    const kind = await db.lwWorldKinds!.getByWorldAndKey(req.worldId, req.kindKey)
    if (!kind) return { success: false, created: 0, entries: [], error: '分类不存在' }

    const count = Math.min(Math.max(req.count ?? 5, 1), 10)
    const existing = await db.lwWorldEntries!.listByWorldAndKind(req.worldId, req.kindKey)
    const pinned = await db.lwWorldEntries!.listPinnedByWorldId(req.worldId)

    const schemaDesc = (kind.fieldsSchema ?? [])
      .map((f: LibraryFieldSchemaItem) => `  - "${f.key}"（${f.label}${f.required ? '，必填' : ''}${f.options ? `，可选值：${f.options.join('/')}` : ''}）`)
      .join('\n')

    const systemPrompt = `你是一位资深网文世界观架构师。你的设定必须：①体系自洽（与已给定的世界核心设定不冲突）；②有叙事功能（好的设定自带冲突与悬念）；③有层级/品阶感（网文爽点的本质是层级差）。你必须只输出 JSON 数组，不要输出任何其他文字。`

    const lines: string[] = []
    lines.push(`请为世界观「${world.name}」（题材：${world.genre}${world.tagline ? `，概念：${world.tagline}` : ''}）生成 ${count} 个新的「${kind.label}」条目。`)
    if (world.description) lines.push(`\n世界总述：${world.description.slice(0, 500)}`)
    if (pinned.length > 0) {
      lines.push(`\n世界核心设定（生成内容不得与之冲突）：`)
      for (const p of pinned.slice(0, 10)) {
        lines.push(`- 【${p.name}】${p.summary}`)
      }
    }
    if (existing.length > 0) {
      lines.push(`\n已有条目（不要重复，可以互补或与之形成层级/对照）：`)
      for (const e of existing) lines.push(`- ${e.name}：${e.summary}`)
    }
    lines.push(`\n每个条目包含以下字段：`)
    lines.push(`- "name"：名称（ string，必要）`)
    lines.push(`- "aliases"：别名数组（string[]，没有就空数组）`)
    lines.push(`- "summary"：一句话摘要（string，30-60字，进 prompt 的紧凑形态）`)
    lines.push(`- "pinned"：是否值得常驻注入（boolean，体系级设定才 true，一般条目 false）`)
    if (schemaDesc) {
      lines.push(`- "fields"：扩展字段对象，包含：`)
      lines.push(schemaDesc)
    }
    if (req.requirements?.trim()) {
      lines.push(`\n用户补充要求：${req.requirements.trim()}`)
    }
    lines.push(`\n只输出 JSON 数组，形如：[{"name":"…","aliases":[],"summary":"…","pinned":false,"fields":{…}}]`)

    const result = await this.callStream(req.eventId, lines.join('\n'), systemPrompt, 4096, req.providerConfigId, req.modelId)
    const arr = extractJsonArray(result)
    if (!arr || arr.length === 0) {
      return { success: false, created: 0, entries: [], error: 'AI 返回内容无法解析为条目 JSON' }
    }

    const created: WorldEntry[] = []
    for (const raw of arr.slice(0, count)) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Record<string, unknown>
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      if (!name) continue
      const entry = await db.lwWorldEntries!.create({
        worldId: req.worldId,
        kindKey: req.kindKey,
        name,
        aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
        summary: typeof item.summary === 'string' ? item.summary : '',
        fields: item.fields && typeof item.fields === 'object' ? (item.fields as Record<string, unknown>) : null,
        pinned: item.pinned === true,
      })
      await db.lwWorldEntries!.updateOrigin(entry.id, { type: 'ai' })
      created.push(entry)
    }
    if (created.length > 0) {
      await db.lwWorlds!.bumpVersion(req.worldId)
    }
    return { success: created.length > 0, created: created.length, entries: created }
  }

  // ==================== IP 角色卡生成（四层人设） ====================

  async generateIpCharacter(req: GenerateIpCharacterRequest): Promise<{ success: boolean; character: IpCharacter | null; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!req.seedIdea?.trim()) {
      return { success: false, character: null, error: '请先给一句灵感（如：木讷农村少年，靠剑走偏锋入名门）' }
    }
    let worldBlock = ''
    let worldId: string | null = null
    if (req.worldId) {
      const world = await db.lwWorlds!.getById(req.worldId)
      if (world) {
        worldId = world.id
        const pinned = await db.lwWorldEntries!.listPinnedByWorldId(world.id)
        const brief = pinned
          .slice(0, 8)
          .map(p => `- 【${p.name}】${p.summary}`)
          .join('\n')
        worldBlock = `\n\n角色所属世界：「${world.name}」${world.tagline ? `（${world.tagline}）` : ''}\n该世界的核心设定（talents/abilities 必须落在这些体系内）：\n${brief}`
      }
    }

    const systemPrompt = `你是资深网文人物架构师。人设必须避开脸谱化：性格要有内在张力，欲望与软肋互为反差，反派要有作恶动机链。背景故事不少于 150 字，必须覆盖：出身处境、核心欲望、最大障碍、秘密或反差、说话方式与行为习惯。你必须只输出一个 JSON 对象，不要输出任何其他文字。`

    const prompt = `请根据以下灵感创建一个完整的角色 IP 卡（四层结构）：

灵感：${req.seedIdea.trim()}${worldBlock}${req.requirements?.trim() ? `\n用户补充要求：${req.requirements.trim()}` : ''}

输出 JSON 对象，字段：
{
  "name": "姓名",
  "aliases": ["别名称呼"],
  "gender": "male | female | other",
  "age": "年龄（string，可写'不详'）",
  "race": "人种/种族（可空）",
  "occupation": "身份职业",
  "appearance": "外貌（含辨识点）",
  "personality": "性格（要有内在张力）",
  "motivation": "核心欲望（他最想得到/改变什么——一切行动的引擎）",
  "flaw": "软肋缺陷（欲望的反差面）",
  "background": "背景故事（≥150字，覆盖出身/欲望/障碍/秘密/说话习惯）",
  "valuesNotes": "价值观与底线（可空）",
  "talents": "天赋资质（灵根/体质/血脉等；如挂世界须在其体系内）",
  "abilities": "技能功法",
  "signatureItems": "标志性物品（可空）",
  "characterArc": "成长弧光（信念将发生什么不可逆转变）",
  "catchphrases": ["口头禅或标志性用语"]
}`

    const result = await this.callStream(req.eventId, prompt, systemPrompt, 4096, req.providerConfigId, req.modelId)
    const obj = extractJsonObject(result)
    if (!obj || typeof obj.name !== 'string' || !obj.name.trim()) {
      return { success: false, character: null, error: 'AI 返回内容无法解析为角色 JSON' }
    }
    const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const character = await db.lwIpCharacters!.create({
      name: (obj.name as string).trim(),
      aliases: Array.isArray(obj.aliases) ? obj.aliases.map(String) : [],
      worldId,
      gender: str(obj.gender),
      age: str(obj.age),
      race: str(obj.race),
      occupation: str(obj.occupation),
      appearance: str(obj.appearance),
      personality: str(obj.personality),
      motivation: str(obj.motivation),
      flaw: str(obj.flaw),
      background: str(obj.background),
      valuesNotes: str(obj.valuesNotes),
      talents: str(obj.talents),
      abilities: str(obj.abilities),
      signatureItems: str(obj.signatureItems),
      characterArc: str(obj.characterArc),
      catchphrases: Array.isArray(obj.catchphrases) ? obj.catchphrases.map(String) : [],
    })
    await db.lwIpCharacters!.markOrigin(character.id, { type: 'ai' })
    return { success: true, character }
  }
}
