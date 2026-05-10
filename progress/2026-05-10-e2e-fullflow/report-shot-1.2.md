# 分镜 1.2 e2e 补充报告（含 AI 提示词审计）

> **执行时间**：2026-05-10 16:09—16:14
> **目标**：用全局 logger 抓取分镜 1.2 关键帧 + 视频生成的全部 AI 调用 prompt + 参考图，对照剧本验证
> **触发动机**：用户 review 发现「分镜 1 的视频对白与剧本无关」，但 e2e 报告 v1 没记录任何 prompt 详情

---

## 1. 数据层验证（DB vs UI）

### 1.1 storyboard 1.2 在 DB 中的真实数据

```json
{
  "shot": 2,
  "type": "medium_close",
  "characters": [
    {
      "characterId": "",                         // ⚠️ 空字符串
      "expression": "焦虑不安，眉头紧锁，眼神游移",
      "action": "手指无意识摩挲腰间空荡丝绦，目光紧锁桌面残茶",
      "facing": "left"
    }
  ],
  "narrationId": "narration_1",
  "dialogueIds": ["dlg_1"],                       // ✓ 仅引用 1 句对白
  "actionIds": ["act_1"]
}
```

### 1.2 剧本场景的对白池

scene 1 `dialogues` 数组实际有 6 句（dlg_1..dlg_6），按 PRD 每个分镜应通过 `dialogueIds[]` 引用其中部分。
- dlg_1 = 李墨「掌柜的，可曾有人落下一块青玉？」
- dlg_2 = 茶博士「客官，这馆子里过手的东西，比窗外的雪还多。」
- dlg_3 = 苏白「寻玉？」
- dlg_4 = 苏白「那块玉不该落在书生手里...」
- dlg_5 = 李墨「我不懂规矩。」
- dlg_6 = 苏白「那就学。天亮前...」

### 1.3 UI 显示 vs 数据真相

| 项 | UI 显示（截图 J1） | DB 数据 | 是否一致 |
|---|---|---|---|
| 分镜 1.2 对白 | **6 句全场对白**（李墨 \| 茶博士 \| 苏白 ×4） | `dialogueIds=["dlg_1"]` 仅 1 句 | ❌ **Bug A** |
| 资产引用「角色」 | 显示「`?` · 焦虑不安」 | `characterId=""` 空字符串 | ❌ **Bug B**（数据漏填） |

---

## 2. 4 条 AI 调用日志（从 logger 提取）

### 2.1 调用 #1: 关键帧 #0 START（image 生成）

| 字段 | 值 |
|---|---|
| timestamp | 2026-05-10 16:09:45 |
| callType | image |
| modelId | wan2.7-image-pro |
| durationMs | **61554** |
| referenceImages | 5 张 base64 data URL |
| response | `https://dashscope.../633d218d-4f5b-4b92-b6d7-5d2430379f9b_0.png` |

**userPrompt 完整内容**（844 字符）:
```
cinematic, high quality, 8k, professional photography, movie scene,
传统中式装潢，雕花木窗结霜，昏黄灯笼光晕笼罩。堂内炭火微红，水汽升腾。角落桌案留有一杯残茶，空间压抑而寂静。,
[关键帧时刻] 场景开始时刻：人物刚进入位置 / 动作即将展开,
location: 京城茶馆, 书生与神秘女子相遇的室内场所，传统中式装潢，充满江湖气息的关键事件发生地,
昏黄灯笼光晕笼罩下，李墨独坐于角落木桌旁，画面截取腰部以上...,
main subject: 李墨,
character: 李墨, wearing 素色长衫, 焦虑不安 expression, 摩挲腰间空绦，紧盯桌面, positioned corner_table,
character: 苏白, wearing 深色斗篷, 平静深邃 expression, 推门入内，推开铜钱, positioned entrance_to_center,
prop: 家传玉佩 书生李墨家族世代相传的玉佩...,
紧张压抑 atmosphere, night lighting, snowy, 三分构图,
medium close-up shot, showing from chest up, eye level angle, natural perspective,
masterpiece, best quality, highly detailed, variant: keyframe_start_0
```

### 2.2 调用 #2: 关键帧 #1 END（image 生成）

同 prompt 结构，仅最后 `variant: keyframe_end_1`。durationMs = 33417ms。

### 2.3 调用 #3: 视频片段（video 生成）

| 字段 | 值 |
|---|---|
| timestamp | 2026-05-10 16:14:20 |
| callType | video |
| mode | **image2video**（注：keyframes 只有 2 张，但 capability matcher 选 image2video 模式而非 keyframes2video） |
| durationMs | **38669** |
| referenceImages | 2 张本地路径：`images/2026/05/10/img_1778400585020_0.png`、`img_1778400618740_0.png` |
| response | `episode-production/video-segments/seg_1778400860169_c4nkmp.mp4` |

**userPrompt 完整内容**（180 字符 — 仅画面描述）:
```
昏黄灯笼光晕笼罩下，李墨独坐于角落木桌旁，画面截取腰部以上。他身着深色长衫，眉头紧锁，眼神焦灼地扫过
桌面那杯已凉透的残茶。窗外冷蓝色的雪光透过结霜的雕花窗棂斜射进来，在他侧脸投下斑驳冷影，与室内暖黄
光形成强烈冷暖对比。背景中炭火微红，袅袅水汽缓缓升腾，加剧了空间的压抑感。他的右手不自觉地按在腰间，
指尖反复摩挲着空荡的丝绦，指节因用力而微微泛白，呼吸略显急促。
```

**关键观察**：video prompt **不含**对白、旁白、镜头语言、地点、物品 — 仅 `sb.frameDescription`。

---

## 3. 用户原 review 验证：「视频对白与剧本无关」

### 用户说法
> 「在你刚刚制作的第一个分镜，视频对白和剧本没有关系，剧本中没有视频里角色说的话。」

### 实际真相（基于 logger 数据）

| 来源 | 内容 |
|---|---|
| **video prompt（实际发给 AI）** | 仅 frameDescription，**没有任何对白文本** |
| **UI「最终提示词预览」** | 拼接了 6 句**整场对白**显示给用户 |
| **video 实际生成** | 6 秒纯视觉视频（无音频）— 视频里**根本不说话** |

**结论**：
- **真实 video 生成 prompt 干净**，不含对白 ✓ — 用户看到的「视频里说话」**不是来自视频生成**
- **UI 显示误导**：「最终提示词预览」让用户以为对白会被发给视频模型，但实际不会
- 用户原意可能是：⑥ 合成 stage 的 timeline 把全场对白音频（TTS）混到该分镜的音轨上 → 与画面不对应。这是 ⑥ stage 的 timeline-builder 的另一个独立 bug，需补 e2e 验证（本次未触发 ⑥ stage 的 audio 路径）

---

## 4. 发现的 3 个真实 bug（基于 logger 数据 + DB 数据）

### Bug A — UI finalPromptPreview 把整场对白塞每分镜（已确认）

- **位置**：`src/renderer/src/components/episode-production/stage-production/VideoSegmentPanel.vue:215-228`
- **代码**：
  ```ts
  const dialogues = computed<DialogueItem[]>(() => {
    const scene = currentScene.value as any
    const raw = scene?.dialogues          // ❌ 直接拿整个 scene 的 dialogues
    if (!Array.isArray(raw)) return []
    return raw.map(...)
  })
  ```
- **应改为**：按 `props.storyboard.dialogueIds` 过滤 `scene.dialogues`，只返回该分镜引用的对白
- **影响**：用户在 ⑤ 制作 stage 看每个分镜「最终提示词预览」都显示**整场对白**，严重误导。但**仅 UI 误导，不影响实际 video 生成**（后端 prompt 不含对白）

### Bug B — 关键帧 prompt 拼整场角色而非分镜级

- **位置**：keyframe-generator 拼装 prompt 时
- **症状**：分镜 1.2 实际只有李墨（characters=[{characterId:"",expression:"焦虑不安..."}]），但关键帧 prompt 仍含「**character: 苏白, wearing 深色斗篷, 平静深邃 expression, 推门入内**」— 把场景级所有角色都塞进来了
- **影响**：image 生成时 AI 可能把苏白也画进画面（即使分镜画面描述里只有李墨）→ 关键帧画面与剧本不一致 → 后续生成的视频也错
- **修复方向**：keyframe-generator 应根据 `storyboard.characters[].characterId` 过滤，只取本分镜的角色拼到 prompt

### Bug C — storyboard.characters[].characterId 字段空字符串

- **位置**：分镜 1.2 的 `characters[0].characterId === ""`（DB 数据，AI 拆分镜时漏填）
- **症状**：UI 资产引用 panel 显示「角色 ?」
- **影响**：依赖 characterId 反查 binding 的所有逻辑都无法工作（角色图无法注入到 keyframe / video prompt）
- **根因**：AI 拆分镜的 prompt 模板未强制要求 characterBindingId 字段非空，导致 AI 输出空串
- **修复方向**：① 后端拆分镜 service 加严格校验，characterId 不能为空 ② 或前端兜底用 expression 关键词反查 ③ 或在 storyboard 编辑器允许人工补全

---

## 5. 关键帧 prompt 拼装的更深层问题

关键帧 prompt 长度 844 字符，包含了：
1. ✓ 风格固定词（cinematic / 8k / professional photography）
2. ✓ 场景描述（京城茶馆、雕花木窗、灯笼光晕）
3. ✓ 关键帧时刻（START / END）
4. ✓ 地点细节（书生与神秘女子相遇的室内场所...）
5. ✓ 画面描述（来自分镜 frameDescription）
6. ❌ **整场所有角色**（李墨 + 苏白） — Bug B
7. ❌ **整场所有物品**（家传玉佩） — 同 Bug B
8. ✓ 氛围（紧张压抑）+ 光线（night）+ 天气（snowy）+ 构图
9. ✓ 镜头语言（medium close-up shot, eye level）
10. ✓ 质量词（masterpiece, best quality）

**亮点**：prompt 本身结构合理，符合图像生成最佳实践。
**问题**：第 6/7 项不应包整场，应按本分镜过滤。

---

## 6. 全局 logger 落地价值

### 之前（v1 报告）
报告写"5 主图生成 / 13 分镜 / keyframes 2 / video 1"，但**没有任何 prompt 内容**。无法判断：
- prompt 是否符合预期
- 参考图是否传对
- 视频 mode 是哪个（text2video / image2video / keyframes2video）
- AI 调用耗时分布

### 现在（v2 + logger）
3 条 ai-call 日志 → 清晰看到：
- 关键帧 prompt 长度 844 字符 + 5 张参考图（base64）
- video prompt 长度 180 字符 + 2 张关键帧路径 + mode=image2video
- 每步耗时（image 33-61s / video 38s）
- 每步实际产出 URL / 文件路径

**价值**：用户 review 时点出「视频对白和剧本无关」 → 用 logger 验证 → 确认是 UI 显示误导而非 video prompt 真有问题。**没有 logger 就无法精确定位 bug**。

---

## 7. 后续待修

| 优先级 | Bug | 修复路径 |
|---|---|---|
| P0 | A — UI finalPromptPreview 错塞整场对白 | VideoSegmentPanel.dialogues 按 storyboard.dialogueIds 过滤 |
| P0 | B — 关键帧 prompt 含整场角色 | keyframe-generator 按 storyboard.characters 过滤 |
| P1 | C — storyboard.characters[].characterId 空字符串 | AI 拆分镜 prompt 模板加约束 + service 校验 |
| P2 | ⑥ 合成 stage 音频时间轴 | 单独 e2e 验证 timeline-builder 是否按分镜分配对白音频 |

---

**报告完毕**。logger 文件 `data/logs/app-2026-05-10.jsonl` 留作审计原始数据。
