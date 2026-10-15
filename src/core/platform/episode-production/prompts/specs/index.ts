/**
 * 剧集制作 · 提示词片段注册表（提示词优化方案 §2.4，原则 P1）
 * @module platform/episode-production/prompts/specs
 *
 * 背景：优化前共享片段散落多处且已实际分叉——
 *   - 剧本侧 7 个片段定义在 `narrative/ai/script-generator.ts`；
 *   - 分镜节奏/命名纪律定义在 `narrative/ai/shot-pacing.ts`，但 cogen 约束 6
 *     **内联重写**了一份（两份文本已不相等），module 头注释却宣称"两处共用保持口径一致"；
 *   - `generateScenesFromSynopsis` 手抄了一份 binding 约束，与片段①已漂移。
 *
 * 本模块把跨提示词复用的片段集中为**单文件单导出**，任何提示词都应 import 而非抄写。
 * 配套 `tests/unit/.../prompt-snapshot` 用 golden snapshot 锁定渲染结果，
 * 使后续任何片段改动都产生**可见 diff**，不再靠人工对账。
 */

import type { PromptContext } from '../prompt-context'
import { renderPacingDensity } from '../genre-profiles'

// ==================== 剧本侧片段 ====================

/**
 * 片段 ①：binding 引用强约束（spec §4.1）。
 * 消费点：整集生成、粘贴拆分、梗概→场景、单场景重拆、续写。
 */
export const BINDING_CONSTRAINT_SPEC = `## ⭐ 强约束：所有引用必须使用 binding ID

下面给出本项目可用的 **角色 / 地点 / 物品** 资产清单。每条都有一个 binding ID。
你输出 JSON 时必须用 ID 引用：
- locationBindingId（场景级）：从【可用地点列表】里选一项的 bindingId 填入
- characterBindingId（出场角色 / 对话 / 动作）：从【可用角色列表】里选
- itemBindingId（道具）：从【可用物品列表】里选

如果场景中出现的对象在清单里**找不到对应项**，把对应 bindingId 字段填 null（不要瞎编 ID），
并在 location/characterName/name 字段保留实际名字以便人工补全。`

/**
 * 片段 ②：场景拆分原则。
 */
export const SCENE_SPLIT_PRINCIPLES_SPEC = `## 场景拆分原则

1. 地点变化应拆分为新场景
2. 时间跳跃应拆分为新场景
3. 主要角色组合变化可考虑拆分
4. 情感氛围显著变化可拆分
5. 每个场景应有明确的视觉焦点`

/**
 * 片段 ③：JSON 场景数据格式示例（示例已中性化，§3.4 原则 P3）。
 */
export const SCENE_JSON_EXAMPLE_SPEC = `## JSON 场景数据格式示例

{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "茶馆",
      "locationBindingId": "lb_xxxxx",
      "locationType": "interior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "茶馆呈长方形，东侧柜台摆放茶罐，南侧临街大门，西侧靠墙方桌数张，北侧雅座屏风隔断。木质横梁、素色瓷茶具、水墨挂画、红木桌椅",
      "locationKeyObjects": ["柜台", "茶罐", "方桌", "屏风", "素色瓷茶具"],
      "mood": "市井烟火",
      "lighting": "晨光从南侧大门斜射入，明亮暖色调，室内微尘飘浮",
      "characters": [
        {
          "characterBindingId": "cb_xxxxx",
          "characterName": "角色甲",
          "position": "center",
          "expression": "凝重",
          "action": "推门进入",
          "outfit": "蓝色长衫（深蓝色，文人风格）",
          "props": [
            { "itemBindingId": "ib_xxxxx", "name": "茶壶" }
          ]
        }
      ],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [
        {
          "id": "dlg_1",
          "characterBindingId": "cb_xxxxx",
          "characterName": "角色甲",
          "text": "请来一壶茶",
          "emotion": "平静",
          "volume": "normal",
          "pace": "normal",
          "pause": 0
        }
      ],
      "actions": [
        {
          "id": "act_1",
          "characterBindingId": "cb_xxxxx",
          "characterName": "角色甲",
          "description": "推门而入，环视四周",
          "timing": "scene_start",
          "duration": 3
        }
      ]
    }
  ]
}`

/**
 * 片段 ④：字段质量硬要求。
 */
export const FIELD_QUALITY_SPEC = `## 字段质量要求（必须遵守）

### sceneDescription（场景视觉描述）
**必须包含三要素**：空间布局 + 材质 + 关键物件。不能只写"某地"。
示例："闺房呈方形，东侧梳妆台配铜镜，南侧窗下置绣架，北侧百宝箱，地面青砖、墙面素色帷幔"

### locationKeyObjects（场景关键物件）
列出 3-6 个会在画面中出现的物件（用于视觉一致性）。

### lighting（光线）
**必须包含四要素**：光源 + 方向 + 强度 + 色调。
示例："晨光从南侧窗棂斜射入，柔和偏暗，冷蓝色调"

### characters[].outfit（服装）
格式："服装名称（颜色，风格）"
示例："素色衣裙（淡青色，古典仕女风格）"、"粗布短衣（灰褐色，市井平民风格）"

### dialogues（对话列表）
每条对话**必须**带 characterName（从本场景 characters 名单里选择，逐字一致），并在能确定时同时给 characterBindingId。
- 剧本原文里对白前有说话人名的（如"角色甲：……"或单独成行的角色名），必须保留该说话人，不得丢失；
- 拿不准说话人时优先按上下文推断，仍无法确定才允许省略 characterName。`

/**
 * 片段 ⑤：三类资产花名册占位符。
 */
export const ROSTER_LIST_SPEC = `## 可用角色列表 {characters}

## 可用地点列表 {locations}

## 可用物品列表 {items}`

/**
 * 片段 ⑥：原文保真纪律（2026-09-21 实测丢对白后加）。
 */
export const SCRIPT_FIDELITY_SPEC = `## ⭐ 原文保真纪律（与 JSON 场景数据同级重要）

- **原文对白必须全保留**：原文中每一句带引号的对白（"……"）都必须出现在生成剧本的 dialogues 中，
  说话人正确、台词可微调语气但不得整句删除，也不得把两句不同意思的对白合并成一句。
- **关键节拍必须全保留**：约定/规则类对白（如"约法三章"）、伏笔物件（如信件、信物）、
  反转、笑点/口头禅（如吃喝玩笑）、人物关系揭示（如身世问答）等节拍，必须各有场次与对白/动作承接，
  不得因"篇幅精简"或"节奏快"丢弃。
- 确需省略或合并时，必须在本章梗概末尾以「省略说明：…」逐条写明省略内容与理由；不写视为违规。
- 自检标准：把原文逐句对照生成结果，任意一句原文对白找不到对应台词即不合格，必须补回。`

/**
 * 片段 ⑦：台词单一来源声明（§4.1 台词单一来源立法）。
 *
 * 优化前台词同时存在于 dialogues 与剧本正文两处，提示词未声明两者关系，
 * 覆盖校验的 haystack 又含正文——正文命中即算"覆盖"，dialogues 里可以是改写版。
 */
export const DIALOGUE_SINGLE_SOURCE_SPEC = `## 台词单一来源声明

- scenes[].dialogues[].text 是台词的**唯一事实源**（配音、视频台词段、镜头承接都以它为准）。
- 剧本正文中的对白必须与 dialogues 逐字一致：正文是给人看的展示视图，dialogues 才是数据。
- 不得出现"正文写了某句对白、dialogues 里却是另一句话"的情况——不一致会被保真校验标记。`

/**
 * 片段 ⑧：旁白质量规范（§3.4 narration 零质量规范的缺口）。
 */
export const NARRATION_QUALITY_SPEC = `## 旁白（narration）规范

- 长度 40-150 字；只写**画面之外**的信息（时间推进、前情、心理点题、不可见的环境交代）。
- **不得与对白重复**：对白已说出的内容不要再用旁白复述一遍。
- 无旁白需求时留空字符串，不要为了凑字段而编造。`

// ==================== 分镜侧片段 ====================

/**
 * 片段 ⑨：命名纪律 + 情绪外化 + 台词长度适配（原 `shot-pacing.ts` NAMING_EMOTION_PROMPT）。
 *
 * @param ctx 提供语速口径（台词长度适配的校验基准）
 */
export function namingEmotionSpec(ctx?: Pick<PromptContext, 'speechCharsPerSec'>): string {
  const rate = ctx?.speechCharsPerSec
  const rateLine = rate
    ? `- 台词长度适配镜头时长：校验按 **${rate} 字/秒** 硬核算——镜头承接台词的语音时长超过镜头时长会被直接拒绝；台词多就拆对切镜头或加长 duration`
    : `- 台词长度适配镜头时长：3 秒以内的镜头只能容纳一两句短语`
  return `### 命名与情绪表达纪律（必须遵守）
- 命名强一致：角色与道具全程使用名册登记名（与「出场角色」名单一字不差），禁止"他/那个男人/少年"等代词或别称；禁止"三个人""众人""反派们"等群体量词概括，多角色出场须逐个写出登记名
- 情绪具象外化：禁止"很悲伤""非常愤怒"等抽象情绪词，必须写具体身体细节。词库：悲伤=低头/肩膀微颤/眼眶泛红/攥紧衣角；喜悦=嘴角上扬/眉眼舒展/脚步轻快；紧张=频繁看表/手指敲桌/呼吸急促；愤怒=双拳紧握/下颔线紧绷/胸口起伏；释然=长舒一口气/肩膀放松/淡淡微笑
${rateLine}`
}

/**
 * 片段 ⑩：节奏密度分档。
 *
 * §2.4：cogen 约束 6 不再内联重写，改由本片段（体裁档案驱动）提供——
 * 历史上 `shot-pacing.ts` 的片段与 cogen 内联副本已分叉（后者缺"duration 之和=目标总时长"硬规则）。
 *
 * @param ctx 体裁与片段预算
 */
export function pacingDensitySpec(ctx: PromptContext, windowSec?: number): string {
  return renderPacingDensity(ctx.genre, windowSec ?? ctx.segmentDurationBudgetSec ?? 15)
}

// ==================== 公共底座片段 ====================

/**
 * 片段 ⑪：JSON 截断续写提示词（§3.16：机制不变，纳入注册表以便随 marker 协议同步）。
 *
 * @param jsonSoFar 上次被截断的已输出 JSON
 */
export function jsonContinuationSpec(jsonSoFar: string): string {
  return `上一轮你的 JSON 输出被截断了，请继续输出，从上次截断的地方继续完成 JSON。

这是你上次输出的内容（被截断）：
${jsonSoFar}

请直接继续输出剩余的 JSON 内容，不要重复已经输出的部分，不要添加任何解释说明。`
}

// ==================== 片段注册表（快照测试与漂移检查的枚举源） ====================

/**
 * 全部**静态**片段的登记表（key → 文本）。
 * 动态片段（需要 ctx 参数）单独列出，见 `DYNAMIC_SPEC_KEYS`。
 */
export const STATIC_SPECS: Record<string, string> = {
  BINDING_CONSTRAINT_SPEC,
  SCENE_SPLIT_PRINCIPLES_SPEC,
  SCENE_JSON_EXAMPLE_SPEC,
  FIELD_QUALITY_SPEC,
  ROSTER_LIST_SPEC,
  SCRIPT_FIDELITY_SPEC,
  DIALOGUE_SINGLE_SOURCE_SPEC,
  NARRATION_QUALITY_SPEC,
}

/** 需要上下文的片段（快照测试用固定 ctx 渲染） */
export const DYNAMIC_SPEC_KEYS = ['namingEmotionSpec', 'pacingDensitySpec', 'jsonContinuationSpec'] as const