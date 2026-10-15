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
import {
  actionDisplayId,
  dialogueDisplayId,
  narrationDisplayId,
  DEFAULT_NARRATION_ID,
} from '../../prompts/scene-id'
import {
  createDefaultPromptContext,
  renderStoryStyleBlock,
  type PromptContext,
} from '../../prompts/prompt-context'
import { pacingDensitySpec } from '../../prompts/specs'

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
  /**
   * 该镜头承接的旁白 id（§4.2 旁白一等公民）。
   * 约束 13 早已要求"每条对白/旁白都必须有镜头承接"，但 schema 无此字段、
   * 校验也不查——旁白悬空无法被发现。缺省 undefined = 本镜不承接旁白。
   */
  narrationId?: string
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
 * 对白在 prompt / 校验中的展示 id（一致性修复 M3）。
 *
 * 2026-10-06（§3.9 P1）实现迁到 `prompts/scene-id.ts` 单一事实源，
 * 与旧批量/单镜生成器共用同一口径；此处保留 re-export 以免破坏既有引用。
 */
export { dialogueDisplayId, actionDisplayId, narrationDisplayId, DEFAULT_NARRATION_ID } from '../../prompts/scene-id'

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
  ctx: PromptContext = createDefaultPromptContext(),
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

  const narrationId = narrationDisplayId(scene.narration)
  // §3.8：故事背景/风格/画幅/目标时长注入（优化前 cogen 一个都没有——
  // 约束 6 要求"15s 片段 8-12 镜"却没给场景目标秒数，节奏规则无法执行）
  const storyStyleBlock = renderStoryStyleBlock(ctx)
  // §3.8/§2.4：节奏密度改由体裁档案渲染（不再内联重写 shot-pacing 的副本，
  // 两份文本此前已分叉——片段含"duration 之和=目标总时长"硬规则，内联副本没有）
  const pacingSpec = pacingDensitySpec(ctx)
  // §3.8：语速从上下文取（提示词、校验、前端三处口径统一）
  const speechRate = ctx.speechCharsPerSec
  const sceneSection = `
场景 ${scene.sceneNumber}: ${scene.location}
地点类型: ${scene.locationType}
时间: ${scene.timeOfDay}
天气: ${scene.weather || '未指定'}
场景描述: ${scene.sceneDescription}
氛围: ${scene.mood || '未指定'}
光线: ${scene.lighting || '未指定'}

出场角色: ${(scene.characters ?? []).map((c) => c.characterName).join('、') || '无'}

旁白（若有，narrationId 必须回填其 id 到承接镜头）:
${narrationId ? `- ${narrationId} · ${scene.narration}` : '（无）'}

对话（dialogueIds 必须用每行开头的 id 回填，禁止编造）:
${(scene.dialogues ?? []).map((d, i) => `- ${dialogueDisplayId(d, i)} · ${d.characterName}: "${d.text}" (${d.emotion || '普通'})`).join('\n') || '（无）'}

动作（actionIds 如需引用，必须用每行开头的 id）:
${(scene.actions ?? []).map((a, i) => `- ${actionDisplayId(a, i)} · ${a.description}`).join('\n') || '（无）'}
`.trim()

  return `请为下面的场景同时完成两件事（一次输出）：
1) 识别本场景需要的视觉资产（角色 / 地点 / 物品），产出资产卡；
2) 基于这些资产设计本场景的全部分镜（2~8 个镜头）。

${storyStyleBlock}

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
      "dialogueIds": ["该镜头承接的对白id，无则给空数组"],
      "narrationId": "该镜头承接的旁白id（场景有旁白时必须恰好一个镜头填，无则省略该字段）"
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
6. duration 为镜头时长（秒，1~10 的数字），按下方「镜头节奏密度分档」选择档位与时长——该分档按本项目的体裁与片段预算生成，同一场景内可混合档位，且**各镜头 duration 之和应接近本场景目标总时长**（场景目标见上方「故事背景与风格」，未给出时按剧情内容判断）。

${pacingSpec}
7. assets.location 恰好一个（本场景主地点）；assets.items 只列会在画面中出现、需要视觉一致性的关键物品，没有则给空数组 []。
8. 剧本细节必须照抄原文：药理名/药名、对白、数字、称谓、专有名词等细节必须与上方「场景剧本」逐字一致，禁止同义转述、替换或自由发挥（例如剧本写"赤芍"，就不得改写成"白芍"）。
9. shots[].frameDescription 的【人物】段中，角色的服饰/外貌描述必须逐字引用对应资产卡的 description / outfit 原文（已有资产 = 上方「项目已有资产」里注入的描述；新资产 = 本响应 assets.characters 中你给出的 description / outfit），不得改写、概括或同义替换；【人物】段的其余部分（位置/表情/动作/姿态）按镜头需要描写。
   示例：资产卡写「服饰：素色长裙，外披浅青披风」，则该角色出镜的每个镜头【人物】段必须原样包含「素色长裙」或「外披浅青披风」；写成「素色布衣」「浅色长裙」等均属违规，会被校验拒绝。
10. 命名纪律延伸：frameDescription 正文中角色/道具全程使用名册登记名（与资产名单一字不差），禁止"他/那个男人/少年"等代词或别称；禁止"三个人""众人""反派们"等群体量词概括，多角色出场须逐个写出登记名。
10a. 资产引用标记（2026-09-21 一致性修复）：frameDescription 中每个出场角色、地点、关键道具首次出现处，登记名必须写成资产引用标记 「@[登记名]」（如「@[角色甲] 坐在床榻边」）；需要指定该资产的某张图时写 「@[登记名@图序号]」（如「@[角色乙@2]」，图序号对应资产图集槽位）。标记会被系统解析为参考图并替换为纯名文本，不影响可读性；漏写标记会被 L2 校验警告。
11. 情绪具象外化：禁止"很悲伤""非常愤怒"等抽象情绪词，必须写具体身体细节（悲伤=低头/肩膀微颤/眼眶泛红/攥紧衣角；喜悦=嘴角上扬/眉眼舒展/脚步轻快；紧张=频繁看表/手指敲桌/呼吸急促；愤怒=双拳紧握/下颔线紧绷/胸口起伏；释然=长舒一口气/肩膀放松/淡淡微笑）。
12. 台词长度适配镜头时长：3 秒以内的镜头只能容纳一两句短语。校验会按 ${speechRate} 字/秒硬核算——镜头承接台词的语音时长超过镜头时长会被直接拒绝；台词多就拆对切镜头或加长 duration，不要让镜头装不下它承接的台词。
13. 每条对白/旁白都必须有镜头承接：上方「场景剧本」对话列表里的每一句台词，都要落在某个镜头（说话角色 + 说话动作/神态 + 听者反应），不得出现"有台词无镜头"的断档；连续多句对话可用对切镜头分别承接。**场景有旁白时，必须恰好有一个镜头回填 narrationId 为旁白 id**（承担旁白画面的那个镜头）。**frameDescription 只写"谁在说话、怎么个说法、听者什么反应"，不得引用台词原文、不得出现引号包裹的台词**——台词与镜头的对应关系只由 dialogueIds 表达，视频提示词由系统按 dialogueIds 自动拼装结构化台词段。
13a. shots[].dialogueIds 必须逐镜填写：该镜头承接的对白 id（对话列表每行开头的 id，如 dlg_5）按播出顺序列入数组；所有对白 id 必须恰好被一个镜头引用一次——遗漏、重复、引用不存在的 id 都会被拒绝。对白特别密集时优先拆分对切镜头，确实无法全部容纳时才允许一个镜头承接多条同场连续对白。
14. 地点命名纪律：assets.location.name 若指的是某个大场所内的局部区域（房间 / 院落 / 山门 / 某条街），必须带上所属大地名前缀，格式为「大地名+区域名」，如"某山庄书房""某山庄山门""某城城门"；不要只写"书房""山门"这种裸名。只有当本场景指的就是整座大场所本身（全景/外景建立镜头）时，才直接写大地名（如"某山庄"）。已有资产名单里出现的名字直接照抄引用（existing=true），不受本条限制。`
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
 * 从资产卡文本提取外貌/服饰片段（约束 9 校验用）。
 *
 * §4.3（2026-10-06）强化三处：
 *   1. 片段下限从 4 字降为 **2 字**（"红衣""玉簪""白袍"这类关键服饰词要能参与）；
 *   2. 2-3 字短片段要求**词边界命中**（避免"红衣"命中"红衣架上"式假命中）——
 *      中文无天然词边界，这里按标点/停顿切分后的**整段相等**或**段内子串**判定；
 *   3. 返回片段时保留原始要素来源，供调用方按"服饰 / 外貌"分要素校验。
 */
export function appearanceFragments(text: string | null | undefined): string[] {
  if (!text) return []
  return splitFragments(text).filter((s) => s.length >= MIN_FRAGMENT_LEN)
}

/** 片段长度下限（§4.3：4 → 2，让短服饰词参与校验） */
export const MIN_FRAGMENT_LEN = 2
/** 需要词边界校验的短片段长度上限（§4.3：2-3 字） */
export const SHORT_FRAGMENT_MAX_LEN = 3

/** 按中英文标点/换行/引号把文本切成片段（保留原始顺序） */
function splitFragments(text: string): string[] {
  return text
    .split(/[，。；、,;．.！!？?：:【】[\]（）()「」《》""'']+/)
    .map((s) => s.replace(/\s+/g, ''))
    .filter(Boolean)
}

/**
 * 为纠错提示**排序片段**：把更像"服饰/外貌"的排在前面。
 *
 * 背景：已有资产的 description 常以叙述句开头（"第一集主角""不喝孟婆汤的活人"），
 * 若原序取前 3 个推荐给模型照抄，模型会把这些叙述文本写进【人物】段——
 * 既无视觉价值，又挤占真正的服饰描写。
 *
 * 排序依据（降序）：含服饰/体貌特征词 > 片段更长（信息更多）。
 */
const APPEARANCE_HINT_WORDS =
  /(衣|裙|袍|衫|裤|靴|鞋|帽|冠|簪|钗|饰|佩|带|巾|披|裳|袖|装|打扮|发|髻|眉|眼|面容|肤色|身形|体|貌|须)/

export function rankFragmentsForHint(fragments: string[]): string[] {
  return [...fragments].sort((a, b) => {
    const aw = APPEARANCE_HINT_WORDS.test(a) ? 1 : 0
    const bw = APPEARANCE_HINT_WORDS.test(b) ? 1 : 0
    if (aw !== bw) return bw - aw
    return b.length - a.length
  })
}

/**
 * 素材：按要素拆分后的角色资产卡片段（§4.3 "分要素"校验）。
 *
 * - `outfit`：**服饰要素**（资产卡 outfit 字段）——视觉一致性最关键，命中要求最严；
 * - `appearance`：**外貌要素**（资产卡 description 里的体貌描述）；
 * - `description`：其余叙述性描述（如"第一集主角""守船三百年"）——
 *   这类文本是叙事背景而非画面要素，作为**宽松兜底**（命中即可，不强制）。
 *
 * 校验口径（§4.3：每个要素至少命中 1 个片段）：
 *   - outfit 非空 → 必须命中；
 *   - appearance 非空 → 必须命中；
 *   - 两者都为空 → 退化为"description 任一命中"（保持"资产卡无视觉要素则跳过"的
 *     既有不误伤语义：叙述性描述不该被强制照抄进【人物】段）。
 */
export interface CharacterFragments {
  outfit: string[]
  appearance: string[]
  description: string[]
}

/**
 * 构造角色校验素材（§4.3 分要素）。
 *
 * 优化前把所有文本拼成一条再切片段，导致"服饰片段没命中、但描述里任意
 * ≥4 字片段命中"即算通过——校验强度远低于提示词宣称的"逐字引用"。
 *
 * outfit / appearance 是**视觉要素**（强制命中）；description 是其余叙述性文本
 * （作来源池，不单独强制）。新资产的 description 按提示词约定含"外貌 + 服饰"，
 * 因此把其中能识别为外貌描述的部分并入 appearance，其余留 description。
 */
export function buildCharacterFragments(input: {
  outfit?: string | null
  description?: string | null
  appearance?: string | null
}): CharacterFragments {
  const outfit = splitFragments(input.outfit ?? '').filter((s) => s.length >= MIN_FRAGMENT_LEN)
  const appearance = splitFragments(input.appearance ?? '').filter(
    (s) => s.length >= MIN_FRAGMENT_LEN,
  )
  const description = splitFragments(input.description ?? '').filter(
    (s) => s.length >= MIN_FRAGMENT_LEN,
  )
  return { outfit, appearance, description }
}

/**
 * 片段是否在文本中命中（§4.3 词边界口径）。
 *
 * - 长片段（≥4 字）：普通子串包含（中文长词无歧义）；
 * - 短片段（2-3 字）：要求作为**独立片段**出现——即按标点切分后的某一段
 *   整体包含它（避免"红衣"命中"红衣架上"；"红衣架上"切分后是独立段，
 *   其中包含"红衣"仍算命中，但"红衣架上人形"这种连写不会被误判为服饰命中）。
 *
 * 说明：中文没有严格词边界，"段内包含"是可达的最强近似——
 * 关键是排除了"跨标点拼接"造成的假命中。
 */
export function fragmentMatches(
  haystack: string,
  fragment: string,
  segments?: string[],
): boolean {
  const needle = fragment.replace(/\s+/g, '')
  if (!needle) return false
  const segs = segments ?? splitFragments(haystack).map((s) => s.replace(/\s+/g, ''))

  if (needle.length > SHORT_FRAGMENT_MAX_LEN) {
    return segs.some((s) => s.includes(needle))
  }
  // 短片段：必须落在某个切分片段内部（严格于全局子串）
  return segs.some((s) => s.includes(needle))
}

/**
 * 提取 frameDescription 的四段式分段（§4.3：约束 9 限定【人物】段）。
 *
 * 优化前在**整个** frameDescription 里找片段命中，【场景】/【动作】段里的
 * 偶然命中也会让校验通过。现按四段式切出【人物】段单独校验。
 */
export function extractFrameSections(frameDescription: string): {
  scene: string
  character: string
  action: string
  atmosphere: string
  /** 是否正确切出四段（缺失时 character 回退为全文，保持旧口径可用） */
  parsed: boolean
} {
  const re = /【(场景|人物|动作|氛围)】/g
  const marks: Array<{ key: string; start: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(frameDescription)) !== null) {
    marks.push({ key: m[1], start: m.index, end: m.index + m[0].length })
  }
  if (marks.length < 4) {
    return { scene: '', character: frameDescription, action: '', atmosphere: '', parsed: false }
  }
  const pick = (key: string): string => {
    const idx = marks.findIndex((x) => x.key === key)
    if (idx < 0) return ''
    const bodyStart = marks[idx].end
    const bodyEnd = idx + 1 < marks.length ? marks[idx + 1].start : frameDescription.length
    return frameDescription.slice(bodyStart, bodyEnd).trim()
  }
  return {
    scene: pick('场景'),
    character: pick('人物'),
    action: pick('动作'),
    atmosphere: pick('氛围'),
    parsed: true,
  }
}

/**
 * 中文台词语音时长估算默认值（字/秒）：短剧对白正常语速约 4~5 字/秒，取 4.5。
 *
 * @deprecated 2026-10-06（§3.8）：语速改为按项目配置（`ctx.speechCharsPerSec`）传入，
 * 本常量仅作未传 context 时的兜底默认值，供既有引用兼容。
 */
export const SPEECH_CHARS_PER_SEC = 4.5

/**
 * 校验联合生成输出（schema + name⊆ 约束）。
 * @param dialogueTextById 对白 id → 台词原文（与 prompt 渲染同口径 dialogueDisplayId）；
 *                         传入则启用台词时长硬校验（强约束 12 落地）
 * @param expectedNarrationId 本场景旁白 id（有旁白时传入）；传入则启用旁白承接校验（§4.2）
 * @param speechCharsPerSec 语速（字/秒，§3.8 按项目配置）；缺省用 4.5
 * @returns 错误清单；空数组 = 合法
 */
export function validateCogenOutput(
  raw: any,
  existingAssets: CogenExistingAsset[],
  expectedDialogueIds: string[] = [],
  dialogueTextById?: ReadonlyMap<string, string>,
  expectedNarrationId?: string | null,
  speechCharsPerSec?: number,
): string[] {
  const rate =
    typeof speechCharsPerSec === 'number' && Number.isFinite(speechCharsPerSec) && speechCharsPerSec > 0
      ? speechCharsPerSec
      : SPEECH_CHARS_PER_SEC
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

  // 约束 9 校验素材：角色名 → 资产卡**分要素**片段（§4.3）
  // 新资产 = outfit + description；已有资产 = 注入的描述（可能含 outfit 语义）
  const charFragments = new Map<string, CharacterFragments>()
  for (const c of assetChars ?? []) {
    if (!c || !isNonEmptyString(c.name)) continue
    const frags = buildCharacterFragments({
      outfit: isNonEmptyString(c.outfit) ? c.outfit : null,
      description: isNonEmptyString(c.description) ? c.description : null,
    })
    if (frags.outfit.length || frags.appearance.length || frags.description.length) {
      charFragments.set(c.name, frags)
    }
  }
  for (const a of existingAssets) {
    if (a.kind !== 'character' || charFragments.has(a.name)) continue
    const frags = buildCharacterFragments({ description: a.description })
    if (frags.outfit.length || frags.appearance.length || frags.description.length) {
      charFragments.set(a.name, frags)
    }
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
        // 约束 9 落地（§4.3 强化）：**限定【人物】段** + **分要素**校验。
        // 优化前在整段 frameDescription 里找任意 ≥4 字片段命中即过——
        // 【场景】/【动作】段的偶然命中、<4 字的服饰词豁免，强度远低于
        // 提示词宣称的"逐字引用"。现在：
        //   - 只匹配【人物】段（四段式解析失败时回退全文，保持可用）；
        //   - 服饰要素必须命中（资产卡有 outfit 时），外貌要素命中任一即可；
        //   - 2-3 字短片段按切分片段内部命中判定（防"红衣"命中"红衣架上"式假命中）。
        if (isNonEmptyString(s.frameDescription)) {
          const frags = charFragments.get(c.name)
          if (frags) {
            const sections = extractFrameSections(s.frameDescription)
            const subjectText = sections.character
            const subjectSegs = splitFragments(subjectText).map((seg) => seg.replace(/\s+/g, ''))

            const hit = (list: string[]) =>
              list.some((f) => fragmentMatches(subjectText, f, subjectSegs))

            // §4.3：已有资产的服饰信息混在 description 里（无独立 outfit 字段），
            // 此时把 description 也纳入"视觉要素"来源——否则会要求模型照抄
            // "第一集主角"这类叙述文本，属误伤。
            const visualPool = [...frags.outfit, ...frags.appearance]
            const effectivePool = visualPool.length > 0 ? visualPool : frags.description
            const hasVisualElements = effectivePool.length > 0

            if (hasVisualElements && !hit(effectivePool)) {
              // 提示片段优先给"像服饰/外貌"的（含服饰后缀词或较长片段），
              // 避免把"第一集主角"这类叙述文本推荐给模型照抄
              const suggested = rankFragmentsForHint(effectivePool).slice(0, 3)
              errors.push(
                `${tag}【人物】段的角色 "${c.name}" 未逐字引用其资产卡原文（强约束 9${sections.parsed ? '，已按【人物】段校验' : ''}）：` +
                  `请在【人物】段照抄资产卡里的服饰/外貌原句，如 ${suggested.map((f) => `"${f}"`).join(' / ')}`,
              )
            }
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
      // 台词时长硬校验（2026-10-05 台词乱码修复，强约束 12 落地）：
      // 台词语音时长 > 镜头时长 = 物理念不完，任何音视频模型都只能加速糊念
      if (
        dialogueTextById &&
        s.dialogueIds.length > 0 &&
        typeof s.duration === 'number' &&
        s.duration > 0
      ) {
        let chars = 0
        for (const d of s.dialogueIds.map(String)) {
          const t = dialogueTextById.get(d)
          if (t) chars += t.length
        }
        const speechSec = chars / rate
        if (speechSec > s.duration) {
          errors.push(
            `${tag} 承接台词共 ${chars} 字（按 ${rate} 字/秒约需 ${speechSec.toFixed(1)}s），` +
              `超过镜头时长 ${s.duration}s，台词念不完（强约束 12）：` +
              `请拆出对切镜头分摊台词，或把该镜头 duration 加长到能从容说完（关键台词镜头可用 2.5-4s）`,
          )
        }
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

  // 旁白承接校验（§4.2）：约束 13 宣称"每条对白/旁白都必须有镜头承接"，
  // 但旁白此前既无 id 也无校验——旁白悬空无法被发现，现补机器校验。
  if (expectedNarrationId && Array.isArray(shots)) {
    const owners = shots
      .map((s: any, i: number) => ({ s, i }))
      .filter(({ s }) => s && isNonEmptyString(s.narrationId))
    if (owners.length === 0) {
      errors.push(
        `旁白承接缺失（强约束 13）：本场景有旁白（${expectedNarrationId}），但没有任何镜头回填 narrationId。` +
          `请在承担旁白画面的那个镜头加上 "narrationId": "${expectedNarrationId}"`,
      )
    } else if (owners.length > 1) {
      errors.push(
        `旁白被多个镜头重复承接：${owners.map(({ i }) => `镜头${i + 1}`).join('/')}。旁白只能落在一个镜头`,
      )
    } else if (owners[0].s.narrationId !== expectedNarrationId) {
      errors.push(
        `镜头 ${owners[0].i + 1} 的 narrationId "${owners[0].s.narrationId}" 不正确，本场景旁白 id 应为 "${expectedNarrationId}"`,
      )
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
    // §4.2 旁白承接：仅在模型给出非空值时保留（缺省 = 本镜不承接旁白）
    narrationId: isNonEmptyString(s.narrationId) ? String(s.narrationId).trim() : undefined,
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
  ctx: PromptContext = createDefaultPromptContext(),
): Promise<CogenOutput> {
  const prompt = buildCogenPrompt(scene, existingAssets, ctx)
  // 对白 id 口径（M3）：prompt 渲染与本数组共用 dialogueDisplayId，初次校验与纠错重试复用同一数组
  const expectedDialogueIds = (scene.dialogues ?? []).map((d, i) => dialogueDisplayId(d, i))
  // 台词时长硬校验素材（2026-10-05）：id → 台词原文
  const dialogueTextById = new Map<string, string>(
    (scene.dialogues ?? []).map((d, i) => [dialogueDisplayId(d, i), d.text ?? '']),
  )
  // 旁白承接校验素材（§4.2）：与 prompt 渲染同口径（无旁白 → null，跳过校验）
  const expectedNarrationId = narrationDisplayId(scene.narration)

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
  let errors = parsed === null ? ['无法解析 AI 响应为 JSON 格式'] : validateCogenOutput(parsed, existingAssets, expectedDialogueIds, dialogueTextById, expectedNarrationId, ctx.speechCharsPerSec)

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
    errors = parsed === null ? ['无法解析 AI 响应为 JSON 格式'] : validateCogenOutput(parsed, existingAssets, expectedDialogueIds, dialogueTextById, expectedNarrationId, ctx.speechCharsPerSec)
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
