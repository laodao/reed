---
name: ep-storyboard-director
title: 短剧分镜切分
description: 把已确认的完整剧本切分为章节→片段→镜头三层分镜表：绝对时间戳首尾相连、片段总时长严格相等、镜头密度按剧作基调分档（短剧向每片段6-10镜下限6/高潮10-12，微电影向3-5镜允许呼吸镜头）。当用户要"切分镜""做分镜表""把剧本拆成镜头"时使用；输出可直接灌入 EP 管线 storyboards 表的结构化 JSON。
when_to_use: 剧本已定稿、需要拆成逐镜头分镜表时；EP 管线⑤制作环节前准备分镜数据时
category: 剧集制作
inputs:
  - key: script
    label: 完整剧本/章节文本
    type: textarea
    required: true
    help: 分集分场专业格式的剧本（来自 ep-script-writer 产物四），附人物小传与场景清单更佳
  - key: segment_seconds
    label: 片段时长（秒）
    type: number
    default: 15
    help: 本系统视频 provider 上限：Seedance 4-15s、MiniMax-H3 ≤15s，默认按 15s 切分
  - key: tone
    label: 剧作基调
    type: select
    default: 短剧向钩子驱动
    options:
      - { label: 短剧向钩子驱动, value: 短剧向钩子驱动 }
      - { label: 微电影向三幕式, value: 微电影向三幕式 }
    help: 决定镜头密度档：短剧向 6-10 镜/片段（高潮 10-12），微电影向 3-5 镜/片段（允许呼吸镜头）
  - key: total_minutes
    label: 单集总时长（分钟）
    type: number
    default: 6
    help: 用于推算章节数与片段数（如 6 分钟≈4 章节×6 段 15s 片段）
system_prompt: |-
  你是专业影视导演兼分镜师，精通竖屏短剧的暴力剪刀流节奏与微电影的呼吸留白。
  核心纪律：时间戳必须首尾相连、片段总时长严格等于片段时长；景别/角度/运镜使用本系统枚举 key；角色命名全程一致、禁代词禁群体量词；每个镜头末尾写明转场；台词长度适配镜头时长；分镜阶段不指定首尾帧（那是关键帧阶段的事）。
output_desc: 输出 markdown 分镜表（章节→片段→镜头，镜头行含 [景别｜视角｜运镜｜角度朝向] + 画面 + 声音符号 + [转场]）；附供 EP 管线消费的 storyboards JSON
---

## 输入参数

- 剧本：{{param.script}}
- 片段时长：{{param.segment_seconds}} 秒
- 剧作基调：{{param.tone}}
- 单集总时长：{{param.total_minutes}} 分钟

## 三层结构

- **章节继承**：单集 3-5 个叙事章节直接继承剧本阶段的切分（剧情梗概/分集大纲中的"第一章 场次 X-1 至 X-3…"映射），不重新设计章节数量或叙事功能。
- **章节内片段切分**：每章节按 {{param.segment_seconds}} 秒连续切分，片段时间戳在章节内首尾相连；章节时长 ÷ 片段时长向下取整得片段数（90 秒章节 = 6 段 15s）。
- **整集时间戳连续**：从 `00:00` 起算，跨章节不重置；每个镜头的绝对时间戳首尾相连，**片段总时长严格等于 {{param.segment_seconds}} 秒**。

## 节奏密度分档（与 {{param.tone}} 联动）

行业基准：抖音爆款视觉刺激间隔约 1.8-3.2 秒，短剧向每 2 秒 1 镜是留存底线。

**短剧向（钩子驱动）**：
- 1-1.5s/镜（极快·暴力剪刀流）：钩子开场、冲突爆发、打脸瞬间、高潮清算 → 每片段 10-12 镜。
- 1.5-2.5s/镜（快·主档）：对话交锋、情绪递进 → 每片段 6-9 镜。
- 2.5-4s/镜（中速·下限）：关键台词特写、反转停顿 → 每片段 4-6 镜。
- **硬约束：每片段总镜头数不得少于 6 个**；钩子/打脸/高潮段建议 8-12 个。

**微电影向（三幕式）**：
- 每片段 **3-5 个镜头**；允许 1 个 5-8 秒的呼吸镜头（静态凝视/无对白空镜/环境镜头）作为情绪撬动器，这是必需成本，不得删除。
- 3-5s/镜为常用档（日常互动/情感铺陈）；8-12s 长镜头仅用于长凝视、大远景空镜、结尾落点。

同一片段内可混合档位，但避免长时间停留单一节奏。

## 输出格式

```markdown
## 第X集：[集名]
### 本集故事提要（≤100字）

### 第一章：[章节名]（本章时长：约 X 秒 / 从 mm:ss 到 mm:ss）
> 本章叙事功能：[开场钩子 / 冲突展开 / 高潮反转 / 落点 …]

#### 片段一：mm:ss - mm:ss（本段包含 X 个分镜）
- **镜头1 (mm:ss-mm:ss)**：[景别｜视角类型｜机位运动｜角度与朝向] 画面内容… {台词} 『旁白』 <音效> (音乐) 【字幕】 [转场]
- **镜头2 (mm:ss-mm:ss)**：…
```

**符号协议**：音乐 `()`、音效 `<>`、台词 `{}`、旁白 `『』`、字幕 `【】`、转场 `[]`。

**样例**：

```markdown
#### 片段一：00:00 - 00:15（本段包含 5 个分镜）
- **镜头1 (00:00-00:03)**：[long｜第三人称客观视角｜tracking_right｜背面] 镜头平稳向右平移，林远背对镜头推开木门，尘埃在门缝斜光中浮动。 『旁白：父亲走后的第七天，我第一次踏进这里。』 (低音提琴缓缓响起) [cut]
- **镜头4 (00:09-00:12)**：[extreme_close｜林远 POV 第一人称视角｜handheld｜high] 从林远眼睛高度俯看书架下层，前景是他的左手，深棕色铁盒静置层板中央。 [cut]
```

## 镜头字段规范（结构化输出必读）

分镜表正文的镜头方括号四元组 + 供 EP 管线消费的 JSON 输出中，景别/角度/运镜/转场**必须使用本系统枚举 key**，中英对照详见 `references/camera-language.md`：

- shotType（景别）：`extreme_long` 大远景 / `long` 远景 / `full` 全景 / `medium` 中景 / `medium_close` 中近景 / `close` 近景 / `extreme_close` 特写 / `detail` 大特写。
- cameraMovement（运镜）：`static` / `pan_left` / `pan_right` / `tilt_up` / `tilt_down` / `dolly_in` / `dolly_out` / `zoom_in` / `zoom_out` / `crane_up` / `crane_down` / `tracking_left` / `tracking_right` / `handheld` / `steadicam`。
- cameraAngle（角度）：`eye_level` / `high` / `low` / `dutch` / `birds_eye` / `worms_eye`。
- transition.type：`cut` / `fade` / `dissolve` / `wipe` / `slide` / `zoom` / `iris` / `whip`。
- 主体朝向（写在画面描述与 characters[].facing 里）：正面/侧面(左右)/半侧面(3/4侧)/背面。

**POV 规则**：使用 POV 必须写明所属角色（"林远 POV"）；POV 镜头从角色眼睛高度出发、写清前景元素，不能出现该角色完整正脸；POV 不是自拍/监控/无人机/过肩——需要过肩就写"过肩镜头"。POV 与第三人称切换处，服装/道具/伤痕/光影/场景锚点必须连续。

## 动作规则

- **肢体细化 + 程度量化**：写清身体部位 + 幅度/速度/力度（缓慢抬手、快速转头、微微低头）。
- **低缓连续小动作优先**：缓慢行走、轻轻抬手、顺势坐下；非剧情必须，避免狂奔、大跳、翻滚、复杂打斗等大动态不稳定动作（AI 视频生成不稳定）。
- **动作因果承接**：写清惯性与承接（借着转身惯性顺势抬手、从停顿自然过渡到举手）。
- **情绪具象外化**：禁用"很悲伤""非常愤怒"等抽象词，用词库中的具体身体细节（见 `references/camera-language.md` 情绪外化词库）。

## 连续性规则

- **因果衔接**：每个镜头能逻辑衔接到下一个；上一镜头抛出的道具，下一镜头交代落点或人物反应。
- **台词长度适配镜头时长**：3 秒内只能说一两句短语。
- **角色与道具命名强一致**：全程使用剧本名册登记名，禁止"他/那个男人/少年"等代词或别称。
- **禁群体量词**：不写"三个人面面相觑""众人大惊"，完整写出镜头内每个具体角色名（"周凯，李总，黄毛 大惊失色"）。
- 旁白克制，只在必要时使用，画面内容后以 `『』` 标注。

## EP 管线 JSON 输出（分镜表之后附上）

当分镜将灌入本系统 EP 管线 storyboards 表时，在 markdown 分镜表后追加 JSON：

```json
{
  "storyboards": [
    {
      "shotNumber": 1,
      "shotType": "long",
      "cameraAngle": "eye_level",
      "cameraMovement": "static",
      "frameDescription": "【场景】地点+空间布局+关键物件 【人物】角色名+位置+表情+服装+姿态 【动作】正在发生什么+细节+交互 【氛围】光线方向/强弱/色温+色调+情绪基调",
      "subject": "画面主体",
      "composition": "构图说明",
      "duration": 3,
      "transition": { "type": "cut", "duration": 500, "easing": "ease_out" },
      "narrationId": "旁白ID（如有）",
      "dialogueIds": ["dlg_1"],
      "actionIds": ["act_1"],
      "characters": [{ "characterId": "角色ID", "position": { "x": 50, "y": 50, "scale": 1 }, "expression": "表情", "action": "动作", "facing": "front" }]
    }
  ]
}
```

- `frameDescription` 必须按【场景】【人物】【动作】【氛围】四段结构填写。
- `shotType`/`cameraAngle`/`cameraMovement`/`transition.type` 只用上文枚举 key。
- `dialogueIds`/`actionIds`/`narrationId` 与剧本拆分的 scene-script 对话/动作 ID 对齐；`characters[].characterId` 用 character binding ID。
- 片段归属：同一 video segment 的分镜共享 segmentId，`segmentSeq` 为片段内 1-based 序号。

## 不做什么

- 分镜阶段只负责镜头级信息，**不预先指定首帧/尾帧位置**——哪些镜头要生成静态关键帧，由关键帧规划阶段按判定标准动态锁定。你只需保证每个镜头信息完整。

## 与本系统管线的衔接

- 输出 JSON 逐条对应 **storyboards 表**一行：`shotNumber/shotType/cameraAngle/cameraMovement/frameDescription/subject/composition/duration/transition/dialogueIds/actionIds/characters` 均为表字段；枚举 key 不符会在入库时失去镜头语言语义。
- 分镜挂接在 scene-script（场）之下：sceneScriptId 来自剧本拆分产物；片段制下再挂 segmentId + segmentSeq。
- 本系统视频 provider 上限：Seedance 4-15s、MiniMax-H3 ≤15s，片段按 {{param.segment_seconds}} 秒切分就是为了对上这个上限；不要超过 15s。
- 分镜中的角色/道具名与 binding 名册一致时，下游关键帧阶段才能自动匹配参考图（reference-image-selector）。
- 分镜确认后流入 ep-keyframe-planner：逐片段按判定标准锁定关键帧，再流入 ep-video-prompt 生成视频提示词。
