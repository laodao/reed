# 剧本场景数据格式增强方案

> 创建时间：2026-05-27
> 目标：提升关键帧生成质量 + 提升前后一致性

---

## 一、问题根因

| 问题 | 根因 | 影响 |
|------|------|------|
| AI 自动填按钮不可点击 | 地点 `baseDescription` 为空 | 用户需手动填写视觉特征 |
| 关键帧画面缺少细节 | `sceneDescription` 太简单 | prompt 信息不足 |
| 同地点多分镜场景不一致 | 没有空间布局描述 | 物件"凭空消失" |
| 同角色服装不一致 | `outfit` 描述太简单 | 角色"忽穿白衣忽穿红衣" |

---

## 二、设计方案

### 核心原则

1. **不改字段结构** - 只改 AI prompt 输出要求，降低复杂度
2. **新增字段最小化** - 只新增 `locationKeyObjects`
3. **写入联动** - 场景生成后同步写入地点绑定

### 数据格式（最终版）

```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "杜十娘闺房",
      "locationBindingId": "lb_xxxxx",
      "locationType": "interior",
      "timeOfDay": "morning",
      "weather": "sunny",

      // sceneDescription：结构化输出（改 prompt 要求）
      // 格式：空间布局 + 陈设 + 材质色调 + 关键物件
      "sceneDescription": "闺房呈方形，东侧梳妆台配铜镜，南侧临窗透晨光，西侧纱幔床榻，北侧百宝箱。木质横梁、雕花屏风、青花瓷茶具、水墨画、香炉",

      // 新增：地点关键物件列表
      "locationKeyObjects": ["铜镜", "梳妆台", "窗棂", "百宝箱", "香炉"],

      "mood": "凝重压抑",

      // lighting：结构化输出（改 prompt 要求）
      // 格式：光源 + 方向 + 强度 + 色调 + 阴影
      "lighting": "晨光从南侧窗棂斜射入，柔和偏暗，冷蓝色调，室内笼罩阴影",

      "characters": [
        {
          "characterBindingId": "cb_xxxxx",
          "characterName": "杜十娘",
          "position": "center",
          "expression": "决绝",
          "action": "手持百宝箱凝视铜镜",

          // outfit：结构化输出（改 prompt 要求）
          // 格式：服装名称 + 颜色 + 风格
          "outfit": "素色衣裙（淡青色，古典仕女风格）",

          "facing": "front",
          "props": [
            { "itemBindingId": "ib_xxxxx", "name": "镶金百宝箱" }
          ]
        }
      ],

      "originalText": "...",
      "narration": "...",
      "dialogues": [...],
      "actions": [...]
    }
  ]
}
```

---

## 三、字段用途对照

| 字段 | AI 输出用途 | 写入目标 |
|------|------------|---------|
| `sceneDescription` | 场景视觉 prompt | `scene_script.scene_description` |
| `locationKeyObjects` | 地点绑定视觉特征 | `location_binding.base_description` 合成 |
| `lighting` | 光线氛围 prompt | `scene_script.lighting` |
| `outfit` | 角色服装 prompt | `character_binding.override_outfit`（如果为空） |

---

## 四、Prompt 改动点

### 4.1 sceneDescription 输出要求

```
场景视觉描述（sceneDescription）输出要求：

必须包含以下信息（按顺序拼接）：
1. 空间布局：房间形状 + 各方位陈设位置
2. 陈设材质：主要家具材质 + 装饰细节
3. 关键物件：本场景中会出现的道具

示例：
"闺房呈方形，东侧梳妆台配铜镜，南侧临窗透晨光，西侧纱幔床榻，北侧百宝箱。木质横梁、雕花屏风、青花瓷茶具、水墨画、香炉"
```

### 4.2 lighting 输出要求

```
光线描述（lighting）输出要求：

必须包含以下信息（按顺序拼接）：
1. 光源：阳光/月光/室内灯光
2. 方向：从哪边照射
3. 强度：柔和/明亮/昏暗
4. 色调：冷色/暖色/特定色
5. 阴影：室内阴影情况

示例：
"晨光从南侧窗棂斜射入，柔和偏暗，冷蓝色调，室内笼罩阴影"
```

### 4.3 outfit 输出要求

```
角色服装（outfit）输出要求：

格式：服装名称（颜色，风格）
- 服装名称：具体服装类型（如"素色衣裙"、"红色嫁衣"）
- 颜色：主色调（如"淡青色"、"深红色"）
- 风格：服装风格（如"古典仕女风格"、"粗布短衣"）

示例：
"素色衣裙（淡青色，古典仕女风格）"
"粗布短衣（灰褐色，市井平民风格）"
```

### 4.4 locationKeyObjects 输出要求

```
地点关键物件列表（locationKeyObjects）：

列出本场景中会出现的道具/物件名称（3-6个，如果少于3个可以输出空数组）。
这些物件会用于地点绑定的视觉特征参考。

示例：
["铜镜", "梳妆台", "窗棂", "百宝箱", "香炉"]
```

---

## 五、写入逻辑改动

### 5.1 场景写入时同步更新地点绑定

**触发条件**：场景写入成功后，如果 `locationBindingId` 存在

**逻辑**：
```typescript
if (scene.locationBindingId) {
  const locationBinding = await locationRepo.getById(scene.locationBindingId)
  if (!locationBinding.baseDescription) {
    // 合成 baseDescription：sceneDescription + locationKeyObjects
    const baseDesc = scene.sceneDescription
    if (scene.locationKeyObjects?.length > 0) {
      baseDesc += `；关键物件：${scene.locationKeyObjects.join('、')}`
    }
    await locationRepo.updateExtra(locationBindingId, { baseDescription: baseDesc })
  }
}
```

### 5.2 场景写入时同步更新角色服装

**触发条件**：场景写入成功后，遍历 characters

**逻辑**：
```typescript
for (const char of scene.characters) {
  if (char.characterBindingId && char.outfit) {
    const binding = await characterRepo.getById(char.characterBindingId)
    if (!binding.overrideOutfit) {
      await characterRepo.updateOverride(bindingId, { outfit: char.outfit })
    }
  }
}
```

---

## 六、实现步骤

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | 改 `sceneDescription` prompt 要求 | `script-generator.ts` |
| 2 | 改 `lighting` prompt 要求 | `script-generator.ts` |
| 3 | 改 `outfit` prompt 要求 | `script-generator.ts` |
| 4 | 新增 `locationKeyObjects` 字段 + prompt | `script-generator.ts` |
| 5 | 场景写入时同步更新地点 `baseDescription` | `script.handler.ts` 或新建 `scene-binding-writer.ts` |
| 6 | 场景写入时同步更新角色 `outfit` | 同上 |
| 7 | 解析 AI 输出的 `locationKeyObjects` | `script-generator.ts` |

---

## 七、验证方法

1. 生成一个新剧本场景
2. 检查输出 JSON：
   - `sceneDescription` 是否有结构化描述
   - `lighting` 是否有完整光线信息
   - `outfit` 是否有颜色+风格
   - `locationKeyObjects` 是否列出物件
3. 检查数据库：
   - `location_binding.base_description` 是否有内容
   - `character_binding.override_outfit` 是否有内容
4. 打开资产界面，检查 AI 自动填按钮是否可点击