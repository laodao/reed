/**
 * narrative/ai/storyboard-cogen
 * @module platform/episode-production/narrative/ai/storyboard-cogen
 * @description 分镜与资产识别联合生成（tasks/2026-09-16-storyboard-asset-cogen · D1/D4-1）。
 *
 * 按场景一次 LLM 调用同时产出「资产清单 + 分镜」，让分镜与资产的关联在
 * 响应结构里天然成立；binding 的建/复用与全部 ID 回填由 service 层代码完成
 * （D2，不让模型回填 ID）。
 *
 * 本文件只负责：prompt 构建、响应解析、schema 校验（不合法时把错误清单
 * 喂回模型纠错重试最多 2 次，仍失败抛错）。
 */

import type { SceneScript } from '@shared/types/episode-production'
import { callAI, callAIWithContinue, extractJsonFromResponse, isJsonTruncated } from './_helpers'
import { validateShotPacing } from './shot-pacing'

// ==================== 类型定义（对齐 design.md D1 输出 schema） ====================

/** 注入 prompt 的项目已有资产（binding 快照） */
export interface CogenExistingAsset {
  kind: 'character' | 'location' | 'item'
  /** binding.id（cb_/lb_/ib_ 前缀） */
  id: string
  /** standaloneName / overrideName */
  name: string
  description?: string | null
}

export interface CogenAssetCharacter {
  name: string
  description: string
  gender?: string
  age?: number
  outfit?: string
  /** true = 引用项目已有资产；false = 新建 */
  existing: boolean
}

export interface CogenAssetLocation {
  name: string
  description: string
  existing: boolean
}

export interface CogenAssetItem {
  name: string
  description: string
  existing: boolean
}

export interface CogenShotCharacter {
  name: string
  position?: 'left' | 'center' | 'right'
  expression?: string
  action?: string
  facing?: string
}

export interface CogenShot {
  shotType: string
  cameraAngle: string
  cameraMovement: string
  duration: number
  frameDescription: string
  subject?: string
  composition?: string
  characters: CogenShotCharacter[]
  itemNames: string[]
  /** 该镜头承接的对白 id（一致性问题修复 v3 A3） */
  dialogueIds: string[]
}

/** 联合生成输出（校验 + 归一化后的形态） */
export interface CogenOutput {
  assets: {
    characters: CogenAssetCharacter[]
    location: CogenAssetLocation
    items: CogenAssetItem[]
  }
  shots: CogenShot[]
}

// ==================== 提示词模板 ====================

const COGEN_SYSTEM_PROMPT =
  '你是一位专业的影视导演、分镜师兼美术设定师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

/**
 * 对白在 prompt / 校验中的展示 id（一致性修复 M3）：
 * 有真实 id 用真实 id；无 id 老对白合成稳定 id `dlg_noid_${index}`（index 为场景内下标），
 * 前缀与真实 id（dlg_<时间戳>_<序号> / AI 给的 dlg_<n>）不会冲突。
 * prompt 渲染与 expectedDialogueIds 必须经本函数取同一口径，否则全覆盖校验会误报。
 * 注：合成 id 只是防御兜底——StoryboardCogenService.backfillDialogueIds 会在生成前
 * 为无 id 对白回填真实 id 并落库，正常路径不会走到 `dlg_noid_` 分支
 * （合成 id 没有 scene_dialogues 行，若真落 storyboard_dialogue_links 会触发 FK 失败）。
 */
export function dialogueDisplayId(dialogue: { id?: unknown }, index: number): string {
  return typeof dialogue.id === 'string' && dialogue.id.length > 0
    ? dialogue.id
    : `dlg_noid_${index}`
}

/**
 * 联合生成提示词（按场景）。
 *
 * 结构：
 *   1. 任务说明（一次调用同时产出资产卡 + 分镜）
 *   2. 项目已有资产注入（kind/name/description/id，强约束直接引用）
 *   3. 场景剧本全文（描述/旁白/对话/动作/角色名单）
 *   4. 输出 JSON schema + 强约束清单
 */
export function buildCogenPrompt(
  scene: SceneScript,
  existingAssets: CogenExistingAsset[],
): string {
  const existingSection =
    existingAssets.length > 0
      ? existingAssets
          .map((a) => {
            const kindLabel =
              a.kind === 'character' ? '角色' : a.kind === 'location' ? '地点' : '物品'
            return `- [${kindLabel}] ${a.name}（ID: ${a.id}）${a.description ? `：${a.description}` : ''}`
          })
          .join('\n')
      : '（项目暂无已有资产，本场景所需资产全部按新资产产出）'

  const sceneSection = `
场景 ${scene.sceneNumber}: ${scene.location}
地点类型: ${scene.locationType}
时间: ${scene.timeOfDay}
天气: ${scene.weather || '未指定'}
场景描述: ${scene.sceneDescription}
氛围: ${scene.mood || '未指定'}
光线: ${scene.lighting || '未指定'}

出场角色: ${(scene.characters ?? []).map((c) => c.characterName).join('、') || '无'}

旁白: ${scene.narration || '无'}

对话:
${(scene.dialogues ?? []).map((d, i) => `- ${dialogueDisplayId(d, i)} · ${d.characterName}: "${d.text}" (${d.emotion || '普通'})`).join('\n') || '（无）'}

动作:
${(scene.actions ?? []).map((a) => `- ${a.description}`).join('\n') || '（无）'}
`.trim()

  return `请为下面的场景同时完成两件事（一次输出）：
1) 识别本场景需要的视觉资产（角色 / 地点 / 物品），产出资产卡；
2) 基于这些资产设计本场景的全部分镜（2~8 个镜头）。

## 项目已有资产（直接引用，禁止改名、禁止重复创建）

${existingSection}

## 场景剧本

${sceneSection}

## 镜头语言说明

### 景别（shotType）
- extreme_long: 大远景 / long: 远景 / full: 全景 / medium: 中景
- medium_close: 中近景 / close: 近景 / extreme_close: 特写 / detail: 大特写

### 镜头角度（cameraAngle）
- eye_level: 平视 / high: 俯拍 / low: 仰拍 / dutch: 荷兰角 / birds_eye: 鸟瞰 / worms_eye: 虫视

### 镜头运动（cameraMovement）
- static: 固定 / pan_left: 左摇 / pan_right: 右摇 / tilt_up: 上仰 / tilt_down: 下俯
- dolly_in: 推 / dolly_out: 拉 / zoom_in: 变焦推 / zoom_out: 变焦拉
- crane_up: 升 / crane_down: 降 / tracking_left: 左移 / tracking_right: 右移
- handheld: 手持 / steadicam: 稳定器跟随

## 输出格式（必须严格遵循，只输出这一个 JSON，不要输出任何其他文字）

\`\`\`json
{
  "assets": {
    "characters": [
      {
        "name": "角色名",
        "description": "角色完整描述（外貌 + 服饰，供定妆图与分镜文本共用）",
        "gender": "男/女/其他",
        "age": 0,
        "outfit": "服饰描述",
        "existing": false
      }
    ],
    "location": { "name": "地点名", "description": "地点完整描述", "existing": true },
    "items": [
      { "name": "物品名", "description": "物品完整描述", "existing": false }
    ]
  },
  "shots": [
    {
      "shotType": "long",
      "cameraAngle": "eye_level",
      "cameraMovement": "static",
      "duration": 5,
      "frameDescription": "【场景】...【人物】...【动作】...【氛围】...",
      "subject": "画面主体",
      "composition": "构图说明",
      "characters": [
        { "name": "角色名", "position": "left|center|right", "expression": "表情", "action": "动作", "facing": "front" }
      ],
      "itemNames": ["出镜物品名"],
      "dialogueIds": ["该镜头承接的对白id，无则给空数组"]
    }
  ]
}
\`\`\`

## 强约束（逐条遵守，违反任何一条都会被拒绝）

1. shots 数量必须为 2~8 个；开场一般用远景/全景建立场景，对话用中景/近景，情感用特写。
2. shots[].characters[].name 必须来自本响应 assets.characters[].name 或上方「项目已有资产」名单，禁止出现名单外的角色名。
3. 引用已有资产时：existing 填 true，name 必须与已有资产名单完全一致（不得改名），description 照抄已有描述（可补充细节，但不得与已有描述矛盾）。
4. 新资产（existing=false）：name 不得与任何已有资产重名；description 必须完整（角色必须含外貌 + 服饰），这份描述就是定妆图与后续所有分镜文本的唯一依据。
5. frameDescription 必须按四段式填写：【场景】地点 + 空间布局 + 关键物件；【人物】角色 + 位置 + 表情 + 服饰外观 + 姿态；【动作】正在发生什么 + 细节；【氛围】光线 + 色调 + 情绪基调。其中【人物】段的服饰/外貌必须与对应资产卡完全一致，跨镜头不得漂移。
6. duration 为镜头时长（秒，1~10 的数字），按下方密度分档选择：钩子开场/冲突爆发/打脸/身份揭示/高潮清算 → 1-1.5s（15s 片段 8-12 镜）；对话交锋/情绪递进/常规叙事 → 1.5-2.5s（15s 片段 6-9 镜）；关键台词特写/反转停顿/蓄势 → 2.5-4s；情感沉淀/静态凝视/空镜（呼吸镜头）→ 3-8s，仅用于情感节点、整片少量使用。常规叙事段镜头平均时长不得超过 2.5s（每 2 秒 1 镜是短剧留存底线），情感沉淀段除外。
7. assets.location 恰好一个（本场景主地点）；assets.items 只列会在画面中出现、需要视觉一致性的关键物品，没有则给空数组 []。
8. 剧本细节必须照抄原文：药理名/药名、对白、数字、称谓、专有名词等细节必须与上方「场景剧本」逐字一致，禁止同义转述、替换或自由发挥（例如剧本写"曼陀罗花""忘忧草"，就不得改写成"断魂草"）。
9. shots[].frameDescription 的【人物】段中，角色的服饰/外貌描述必须逐字引用对应资产卡的 description / outfit 原文（已有资产 = 上方「项目已有资产」里注入的描述；新资产 = 本响应 assets.characters 中你给出的 description / outfit），不得改写、概括或同义替换；【人物】段的其余部分（位置/表情/动作/姿态）按镜头需要描写。
   示例：资产卡写「服饰：素白衣裙，外披淡青披风」，则该角色出镜的每个镜头【人物】段必须原样包含「素白衣裙」或「外披淡青披风」；写成「素色布衣」「浅色长裙」等均属违规，会被校验拒绝。
10. 命名纪律延伸：frameDescription 正文中角色/道具全程使用名册登记名（与资产名单一字不差），禁止"他/那个男人/少年"等代词或别称；禁止"三个人""众人""反派们"等群体量词概括，多角色出场须逐个写出登记名。
10a. 资产引用标记（2026-09-21 一致性修复）：frameDescription 中每个出场角色、地点、关键道具首次出现处，登记名必须写成资产引用标记 「@[登记名]」（如「@[沈云萝] 坐在床榻边」）；需要指定该资产的某张图时写 「@[登记名@图序号]」（如「@[秦越@2]」，图序号对应资产图集槽位）。标记会被系统解析为参考图并替换为纯名文本，不影响可读性；漏写标记会被 L2 校验警告。
11. 情绪具象外化：禁止"很悲伤""非常愤怒"等抽象情绪词，必须写具体身体细节（悲伤=低头/肩膀微颤/眼眶泛红/攥紧衣角；喜悦=嘴角上扬/眉眼舒展/脚步轻快；紧张=频繁看表/手指敲桌/呼吸急促；愤怒=双拳紧握/下颔线紧绷/胸口起伏；释然=长舒一口气/肩膀放松/淡淡微笑）。
12. 台词长度适配镜头时长：3 秒以内的镜头只能容纳一两句短语。
13. 每条对白/旁白都必须有镜头承接：上方「场景剧本」对话列表里的每一句台词，都要落在某个镜头的 frameDescription 中体现（说话角色 + 说话动作/神态 + 听者反应），不得出现"有台词无镜头"的断档；连续多句对话可用对切镜头分别承接。
13a. shots[].dialogueIds 必须逐镜填写：该镜头承接的对白 id（对话列表每行开头的 id，如 dlg_5）按播出顺序列入数组；所有对白 id 必须恰好被一个镜头引用一次——遗漏、重复、引用不存在的 id 都会被拒绝。对白特别密集时优先拆分对切镜头，确实无法全部容纳时才允许一个镜头承接多条同场连续对白。
14. 地点命名纪律：assets.location.name 若指的是某个大场所内的局部区域（房间 / 院落 / 山门 / 某条街），必须带上所属大地名前缀，格式为「大地名+区域名」，如"雪麓山庄书房""雪麓山庄山门""白鹿城城门"；不要只写"书房""山门"这种裸名。只有当本场景指的就是整座大场所本身（全景/外景建立镜头）时，才直接写大地名（如"雪麓山庄"）。已有资产名单里出现的名字直接照抄引用（existing=true），不受本条限制。`
}

/** 纠错重试提示词：把校验错误清单 + 上次输出喂回模型（D4-1，最多重试 2 次） */
function buildCorrectionPrompt(errors: string[], previousResponse: string): string {
  return `你上一次输出的 JSON 未通过校验，存在以下问题：

${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

请修正后重新输出完整的 JSON（保持原有结构与字段名，只修复上述问题；场景与全部强约束不变）。
特别注意：
- 每一个 shots[i].characters 中出现的角色，其 frameDescription【人物】段都必须逐字包含该角色资产卡里的服饰/外貌片段（上方错误清单已给出各角色可用片段，直接照抄即可）——不要只改错误清单点名的镜头，所有镜头的所有出镜角色都要自查一遍；
- 已合规的镜头、资产、字段保持原样，不得增删镜头或资产，不得改动已正确的内容。
不要输出任何解释说明，只输出修正后的 JSON。

你上一次的输出：
${previousResponse}`
}

// ==================== 校验（D4-1） ====================

interface ExistingNameSets {
  characters: Set<string>
  locations: Set<string>
  items: Set<string>
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/**
 * 从资产卡文本提取外貌/服饰片段（约束 9 校验用）：
 * 按中英文标点/换行切分，保留 ≥4 字的片段。校验时分镜【人物】段至少
 * 逐字命中一个片段，防止模型自由发挥与资产卡打架（如资产卡"素白衣裙"
 * 被写成"素色布衣"）。
 */
function appearanceFragments(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split(/[，。；、,;．.！!？?\n\r：:【】[\]（）()「」]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
}

/** 去空白后包含（模型输出可能换行/加空格） */
function includesNormalized(haystack: string, needle: string): boolean {
  return haystack.replace(/\s+/g, '').includes(needle.replace(/\s+/g, ''))
}

/**
 * 校验联合生成输出（schema + name⊆ 约束）。
 * @returns 错误清单；空数组 = 合法
 */
export function validateCogenOutput(
  raw: any,
  existingAssets: CogenExistingAsset[],
  expectedDialogueIds: string[] = [],
): string[] {
  const errors: string[] = []
  const existing: ExistingNameSets = {
    characters: new Set(existingAssets.filter((a) => a.kind === 'character').map((a) => a.name)),
    locations: new Set(existingAssets.filter((a) => a.kind === 'location').map((a) => a.name)),
    items: new Set(existingAssets.filter((a) => a.kind === 'item').map((a) => a.name)),
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['输出不是 JSON 对象']
  }

  // ─── assets ───
  const assets = raw.assets
  if (!assets || typeof assets !== 'object') {
    return ['缺少 assets 对象']
  }

  const assetChars: any[] = Array.isArray(assets.characters) ? assets.characters : null
  if (!assetChars) {
    errors.push('assets.characters 必须是数组（没有新角色时给 []）')
  } else {
    const seen = new Set<string>()
    assetChars.forEach((c, i) => {
      const tag = `assets.characters[${i}]`
      if (!c || typeof c !== 'object') {
        errors.push(`${tag} 不是对象`)
        return
      }
      if (!isNonEmptyString(c.name)) {
        errors.push(`${tag}.name 缺失或为空`)
        return
      }
      if (seen.has(c.name)) errors.push(`${tag} 角色名 "${c.name}" 在资产清单中重复`)
      seen.add(c.name)
      if (!isNonEmptyString(c.description)) {
        errors.push(`${tag}（${c.name}）.description 缺失或为空（新资产必须给出含外貌+服饰的完整描述）`)
      }
      const isExisting = c.existing === true
      if (isExisting && !existing.characters.has(c.name)) {
        errors.push(`${tag}（${c.name}）标了 existing=true 但不在项目已有角色名单里`)
      }
      if (!isExisting && existing.characters.has(c.name)) {
        errors.push(
          `${tag}（${c.name}）与项目已有角色重名：已有资产必须 existing=true 直接引用，不得重复创建`,
        )
      }
    })
  }

  const loc = assets.location
  if (!loc || typeof loc !== 'object' || !isNonEmptyString(loc.name)) {
    errors.push('assets.location 缺失或 name 为空（每场景必须恰好一个主地点）')
  } else {
    if (!isNonEmptyString(loc.description)) {
      errors.push(`assets.location（${loc.name}）.description 缺失或为空`)
    }
    const isExisting = loc.existing === true
    if (isExisting && !existing.locations.has(loc.name)) {
      errors.push(`assets.location（${loc.name}）标了 existing=true 但不在项目已有地点名单里`)
    }
    if (!isExisting && existing.locations.has(loc.name)) {
      errors.push(
        `assets.location（${loc.name}）与项目已有地点重名：已有资产必须 existing=true 直接引用，不得重复创建`,
      )
    }
  }

  const assetItems: any[] = Array.isArray(assets.items) ? assets.items : null
  if (!assetItems) {
    errors.push('assets.items 必须是数组（没有关键物品时给 []）')
  } else {
    assetItems.forEach((it, i) => {
      const tag = `assets.items[${i}]`
      if (!it || typeof it !== 'object' || !isNonEmptyString(it.name)) {
        errors.push(`${tag}.name 缺失或为空`)
        return
      }
      if (!isNonEmptyString(it.description)) {
        errors.push(`${tag}（${it.name}）.description 缺失或为空`)
      }
      const isExisting = it.existing === true
      if (isExisting && !existing.items.has(it.name)) {
        errors.push(`${tag}（${it.name}）标了 existing=true 但不在项目已有物品名单里`)
      }
      if (!isExisting && existing.items.has(it.name)) {
        errors.push(
          `${tag}（${it.name}）与项目已有物品重名：已有资产必须 existing=true 直接引用，不得重复创建`,
        )
      }
    })
  }

  // ─── shots ───
  const shots: any[] = Array.isArray(raw.shots) ? raw.shots : null
  if (!shots) {
    errors.push('缺少 shots 数组')
    return errors
  }
  if (shots.length < 2 || shots.length > 8) {
    errors.push(`shots 数量必须为 2~8 个（实际 ${shots.length} 个）`)
  }

  const allowedCharNames = new Set<string>([
    ...existing.characters,
    ...(assetChars ?? []).filter((c) => c && isNonEmptyString(c.name)).map((c) => c.name),
  ])
  const allowedItemNames = new Set<string>([
    ...existing.items,
    ...(assetItems ?? []).filter((it) => it && isNonEmptyString(it.name)).map((it) => it.name),
  ])

  // 约束 9 校验素材：角色名 → 资产卡外貌/服饰片段（新资产 = outfit+description；已有资产 = 注入的描述）
  const charFragments = new Map<string, string[]>()
  for (const c of assetChars ?? []) {
    if (!c || !isNonEmptyString(c.name)) continue
    const frags = appearanceFragments(
      [isNonEmptyString(c.outfit) ? c.outfit : '', isNonEmptyString(c.description) ? c.description : '']
        .filter(Boolean)
        .join('，'),
    )
    if (frags.length > 0) charFragments.set(c.name, frags)
  }
  for (const a of existingAssets) {
    if (a.kind !== 'character' || charFragments.has(a.name)) continue
    const frags = appearanceFragments(a.description)
    if (frags.length > 0) charFragments.set(a.name, frags)
  }

  shots.forEach((s, i) => {
    const tag = `shots[${i}]`
    if (!s || typeof s !== 'object') {
      errors.push(`${tag} 不是对象`)
      return
    }
    if (!isNonEmptyString(s.shotType)) errors.push(`${tag}.shotType 缺失或为空`)
    if (!isNonEmptyString(s.frameDescription)) {
      errors.push(`${tag}.frameDescription 缺失或为空`)
    } else if (
      !s.frameDescription.includes('【场景】') ||
      !s.frameDescription.includes('【人物】') ||
      !s.frameDescription.includes('【动作】') ||
      !s.frameDescription.includes('【氛围】')
    ) {
      errors.push(`${tag}.frameDescription 必须包含【场景】【人物】【动作】【氛围】四段`)
    }
    if (typeof s.duration !== 'number' || !(s.duration > 0)) {
      errors.push(`${tag}.duration 必须是正数（秒）`)
    }
    const chars: any[] = Array.isArray(s.characters) ? s.characters : null
    if (!chars) {
      errors.push(`${tag}.characters 必须是数组（无人物出镜时给 []）`)
    } else {
      chars.forEach((c, j) => {
        if (!c || typeof c !== 'object' || !isNonEmptyString(c.name)) {
          errors.push(`${tag}.characters[${j}].name 缺失或为空`)
          return
        }
        if (!allowedCharNames.has(c.name)) {
          errors.push(
            `${tag}.characters[${j}] 的角色名 "${c.name}" 不在资产清单与已有资产名单里（name 必须 ⊆ assets.characters ∪ 已有角色）`,
          )
          return
        }
        // 约束 9 落地：【人物】段的服饰/外貌必须逐字引用资产卡片段，至少命中一个
        if (isNonEmptyString(s.frameDescription)) {
          const frags = charFragments.get(c.name)
          if (frags && !frags.some((f) => includesNormalized(s.frameDescription, f))) {
            errors.push(
              `${tag}【人物】段的角色 "${c.name}" 未引用其资产卡服饰/外貌原文（强约束 9）：` +
                `请逐字包含至少一个片段，如 ${frags.slice(0, 5).map((f) => `"${f}"`).join(' / ')}`,
            )
          }
        }
      })
    }
    // 一致性修复 v3（A3）：dialogueIds 必须是合法对白 id 数组（镜头承接对白）
    if (!Array.isArray(s.dialogueIds)) {
      errors.push(`${tag}.dialogueIds 必须是数组（该镜头承接的对白 id，无则给 []）`)
    } else {
      const dupInShot = s.dialogueIds.filter((d: any, i: number, arr: string[]) => arr.indexOf(d) !== i)
      if (dupInShot.length) errors.push(`${tag}.dialogueIds 内部重复：${dupInShot.join('、')}`)
      if (expectedDialogueIds.length > 0) {
        const unknown = s.dialogueIds.filter((d: any) => !expectedDialogueIds.includes(String(d)))
        if (unknown.length) errors.push(`${tag}.dialogueIds 引用了不存在的对白 id：${unknown.join('、')}`)
      }
    }
    if (s.itemNames !== undefined) {
      if (!Array.isArray(s.itemNames)) {
        errors.push(`${tag}.itemNames 必须是数组`)
      } else {
        s.itemNames.forEach((n: any, j: number) => {
          if (!isNonEmptyString(n) || !allowedItemNames.has(n)) {
            errors.push(
              `${tag}.itemNames[${j}] "${String(n)}" 不在资产清单与已有物品名单里（如需该物品请先列入 assets.items）`,
            )
          }
        })
      }
    }
  })

  // 一致性修复 v3（A3）：对白全覆盖硬校验——每个对白 id 恰好被一个镜头承接（阻断级，触发纠错重试）
  if (expectedDialogueIds.length > 0 && Array.isArray(shots)) {
    const owner = new Map<string, number[]>()
    shots.forEach((s: any, i: number) => {
      for (const d of (Array.isArray(s.dialogueIds) ? s.dialogueIds : []).map(String)) {
        if (!expectedDialogueIds.includes(d)) continue
        const list = owner.get(d) ?? []
        list.push(i + 1)
        owner.set(d, list)
      }
    })
    const missing = expectedDialogueIds.filter((d) => !owner.has(d))
    if (missing.length) {
      errors.push(`对白承接覆盖不完整（强约束 13/13a）：以下对白没有任何镜头承接：${missing.join('、')}。` +
        `请为它们补建对切镜头，或并入语义最贴近的现有镜头的 dialogueIds`)
    }
    const duplicated = [...owner.entries()].filter(([, v]) => v.length > 1)
    if (duplicated.length) {
      errors.push(`对白被多个镜头重复承接：${duplicated.map(([d, v]) => `${d}(镜头${v.join('/')})`).join('；')}。每条对白只能落在一个镜头`)
    }
  }

  return errors
}

// ==================== 归一化 ====================

/** 校验通过后归一化为 CogenOutput（补默认值，防下游 undefined） */
function normalizeCogenOutput(raw: any): CogenOutput {
  const assets = raw.assets
  const characters: CogenAssetCharacter[] = (assets.characters ?? []).map((c: any) => ({
    name: String(c.name).trim(),
    description: String(c.description).trim(),
    gender: isNonEmptyString(c.gender) ? c.gender : undefined,
    age: typeof c.age === 'number' && c.age > 0 ? c.age : undefined,
    outfit: isNonEmptyString(c.outfit) ? c.outfit : undefined,
    existing: c.existing === true,
  }))
  const location: CogenAssetLocation = {
    name: String(assets.location.name).trim(),
    description: String(assets.location.description).trim(),
    existing: assets.location.existing === true,
  }
  const items: CogenAssetItem[] = (assets.items ?? []).map((it: any) => ({
    name: String(it.name).trim(),
    description: String(it.description).trim(),
    existing: it.existing === true,
  }))
  const shots: CogenShot[] = (raw.shots ?? []).map((s: any) => ({
    shotType: String(s.shotType).trim(),
    cameraAngle: isNonEmptyString(s.cameraAngle) ? s.cameraAngle : 'eye_level',
    cameraMovement: isNonEmptyString(s.cameraMovement) ? s.cameraMovement : 'static',
    duration: s.duration,
    frameDescription: String(s.frameDescription).trim(),
    subject: isNonEmptyString(s.subject) ? s.subject : undefined,
    composition: isNonEmptyString(s.composition) ? s.composition : undefined,
    characters: (s.characters ?? []).map((c: any) => ({
      name: String(c.name).trim(),
      position:
        c.position === 'left' || c.position === 'right' || c.position === 'center'
          ? c.position
          : 'center',
      expression: isNonEmptyString(c.expression) ? c.expression : undefined,
      action: isNonEmptyString(c.action) ? c.action : undefined,
      facing: isNonEmptyString(c.facing) ? c.facing : 'front',
    })),
    itemNames: Array.isArray(s.itemNames)
      ? s.itemNames.filter((n: any) => isNonEmptyString(n)).map((n: any) => String(n).trim())
      : [],
    dialogueIds: Array.isArray(s.dialogueIds)
      ? s.dialogueIds.filter((n: any) => isNonEmptyString(n)).map((n: any) => String(n).trim())
      : [],
  }))
  return { assets: { characters, location, items }, shots }
}

/** 解析响应为 JSON；失败返回 null（不抛，走纠错重试） */
function tryParse(response: string): any | null {
  try {
    return extractJsonFromResponse(response)
  } catch {
    return null
  }
}

// ==================== 主入口 ====================

/**
 * 按场景联合生成「资产清单 + 分镜」。
 *
 * 流程（D1/D4-1）：
 *   callAI（maxTokens 16000；截断时 callAIWithContinue 续写）
 *   → extractJsonFromResponse → validateCogenOutput
 *   → 不合法：把具体错误清单喂回模型纠错重试最多 2 次
 *   → 仍不合法：抛错（错误信息含全部原因）
 *
 * @param scene          场景剧本（shared SceneScript 形态）
 * @param existingAssets 项目当前全部 binding 快照（注入 prompt + name⊆ 校验）
 * @param providerConfigId 项目 scriptModel.providerConfigId
 * @param modelId          项目 scriptModel.modelId
 */
export async function generateCogenForScene(
  scene: SceneScript,
  existingAssets: CogenExistingAsset[],
  providerConfigId: string,
  modelId: string,
): Promise<CogenOutput> {
  const prompt = buildCogenPrompt(scene, existingAssets)
  // 对白 id 口径（M3）：prompt 渲染与本数组共用 dialogueDisplayId，初次校验与纠错重试复用同一数组
  const expectedDialogueIds = (scene.dialogues ?? []).map((d, i) => dialogueDisplayId(d, i))

  let response = await callAI(prompt, COGEN_SYSTEM_PROMPT, 16000, providerConfigId, modelId)
  if (isJsonTruncated(response)) {
    console.warn(`[storyboard-cogen] 场景 ${scene.sceneNumber} 输出被截断，尝试续写`)
    response = await callAIWithContinue(
      prompt,
      COGEN_SYSTEM_PROMPT,
      16000,
      providerConfigId,
      modelId,
    )
  }

  let parsed = tryParse(response)
  let errors = parsed === null ? ['无法解析 AI 响应为 JSON 格式'] : validateCogenOutput(parsed, existingAssets, expectedDialogueIds)

  // D4-1：纠错重试最多 2 次（约束 9 服饰校验落地后，弱模型一次纠正常常改不干净；
  // 每次把最新错误清单喂回，仍失败才抛错——旧分镜保留，宁缺毋滥）
  for (let attempt = 1; errors.length > 0 && attempt <= 2; attempt++) {
    console.warn(
      `[storyboard-cogen] 场景 ${scene.sceneNumber} 输出校验失败（${errors.length} 项），纠错重试第 ${attempt} 次:`,
      errors,
    )
    const correctionPrompt = buildCorrectionPrompt(errors, response)
    response = await callAI(
      correctionPrompt,
      COGEN_SYSTEM_PROMPT,
      16000,
      providerConfigId,
      modelId,
    )
    parsed = tryParse(response)
    errors = parsed === null ? ['无法解析 AI 响应为 JSON 格式'] : validateCogenOutput(parsed, existingAssets, expectedDialogueIds)
  }

  if (errors.length > 0 || parsed === null) {
    throw new Error(
      `场景 ${scene.sceneNumber} 联合生成输出校验失败（纠错重试后仍不合法）：\n- ${errors.join('\n- ')}`,
    )
  }

  const output = normalizeCogenOutput(parsed)

  // 节奏密度校验（2026-09-20 prompt 优化）：只警告不阻断
  for (const w of validateShotPacing(output.shots, { sceneLabel: `场景 ${scene.sceneNumber}` })) {
    console.warn(`[storyboard-cogen] ${w}`)
  }

  return output
}
