# 关键帧生成质量优化方案

> 创建时间：2026-05-27
> 更新时间：2026-05-27（发现已有实现）
> 背景：提升分镜界面关键帧生成的画面质量和一致性

---

## 重要发现：大部分优化功能已实现

经过代码审查发现，系统已经有完整的资产绑定和关键帧生成机制：

| 功能 | 状态 | 实现位置 |
|------|------|---------|
| 角色形象绑定 | ✅ 已实现 | `CharacterAssetService.getEffectiveData()` |
| 地点背景绑定 | ✅ 已实现 | `LocationAssetService.getEffectiveData()` |
| 参考图绑定 | ✅ 已实现 | `binding.referenceImagePath` |
| 形象组（多图参考） | ✅ 已实现 | `binding.referenceSetImageIds` |
| prompt 自动组装 | ✅ 已实现 | `buildKeyframePrompt()` |

**真正的优化点**：不是功能缺失，而是 **用户引导不足** 和 **数据填写率低**。

---

## 一、现有实现分析

### 1. 角色形象绑定（已实现）

**调用链**：
```
KeyframeGenerationService.resolveSceneAssets()
  → ReferenceResolver.resolveCharacter(bindingId)
    → CharacterAssetService.getEffectiveData(bindingId)
      → 返回 { name, appearance, outfit, ... }
  → buildKeyframePrompt() 使用 effective 数据拼 prompt
```

**有效数据来源**（`CharacterAssetService.getEffectiveData` 行 118-166）：
- `name` → `overrideName` ?? `lw_character.name` ?? '(未命名)'
- `appearance` → `overrideAppearance` ?? `lw_character.appearance`
- `outfit` → `overrideOutfit`（仅 override，lw 表无此列）
- `referenceImagePath` → 用户上传的参考图路径
- `referenceSetImageIds` → 形象组（spec §3.2 D1）

**prompt 使用**（`keyframe-prompt-builder.ts` 行 314-328）：
```typescript
for (const c of input.characters) {
  const eff = c.effective
  const charDesc: string[] = []
  if (eff.name) charDesc.push(eff.name)
  if (eff.appearance) charDesc.push(eff.appearance)
  const outfit = sceneRole.outfit ?? eff.outfit
  if (outfit) charDesc.push(`wearing ${outfit}`)
  // ...
  parts.push(`character: ${charDesc.join(', ')}`)
}
```

### 2. 地点背景绑定（已实现）

**调用链**：同上，`LocationAssetService.getEffectiveData(bindingId)` → 返回 `{ name, description, ... }`

**prompt 使用**（`keyframe-prompt-builder.ts` 行 303-306）：
```typescript
if (input.location) {
  const loc = input.location.effective
  if (loc.name) parts.push(`location: ${loc.name}`)
  if (loc.description) parts.push(loc.description)
}
```

### 3. 参考图绑定（已实现）

**关键帧生成流程**（`keyframe-generation.service.ts` 行 677-682）：
```typescript
const refImages = await this.collectReferenceImages(
  sceneAssets, scene, args.referenceOverrides
)
```

**角色参考图选择**（`keyframe-generation.service.ts` 行 796-829）：
- 优先使用用户 override（`referenceOverrides`）
- 否则按维度评分选择（`pickReferenceImage`）
- 形象组作为补充（`getReferenceSetImageIds`）

### 4. 模板标准化（已实现）

**AI 分镜输出格式**（`storyboard-generator.ts`）：
```
【场景】地点名称 + 空间布局描述 + 关键物件
【人物】角色名称 + 具体位置 + 表情神态 + 服装外观 + 姿态动作
【动作】正在发生什么 + 动作细节 + 人物交互
【氛围】光线描述（方向/强弱/色温） + 整体色调 + 情绪基调
```

---

## 二、真正的优化点

### 问题根因分析

| 问题现象 | 根因 | 解决方向 |
|---------|------|---------|
| 角色形象不一致 | 用户没填写 `appearance/outfit` | UI 引导 + 提示优化 |
| 地点场景不一致 | 用户没填写 `description` | UI 引导 |
| 参考图没被使用 | 用户没上传资产图或没绑定 | 资产创建流程简化 |
| prompt 信息不足 | 分镜 `frameDescription` 太简单 | AI 输出格式优化（已实现） |

### 优化方向

#### 1. 资产界面引导优化（推荐）

**目标**：让用户意识到填写 `appearance/outfit` 的重要性。

**方案**：
- 资产编辑界面增加提示文案："此描述会用于画面生成，请填写角色的外观特征（如发型、服装风格、身材）"
- 增加"一键生成外观描述"按钮（AI 根据角色名 + 资产图生成）

**UI 改动示例**：
```
角色资产编辑面板
├── 基本信息
│   ├── 角色名：杜十娘
│   └── 别名/身份/性别/年龄...
├── 【画面生成参考】 ⭐ 新增提示区
│   ├── 外观描述：[输入框 + AI生成按钮]
│   │   提示：此描述会用于画面生成，建议填写发型、服装风格、身材特征
│   ├── 默认服装：[输入框]
│   │   提示：角色在不同场景的默认服装，可被分镜覆盖
│   └── 风格锚点：[已实现]
├── 形象资产
│   ├── 主形象图：[上传]
│   ├── 形象组：[选择多图]
│   └── 参考图路径：[已实现]
```

#### 2. 分镜生成时自动补全角色外观

**目标**：如果角色 `appearance` 为空，AI 分镜时自动补全。

**方案**：
- 在 `storyboard-generator.ts` 的 prompt 中，增加角色外观补全指令
- AI 生成分镜时，如果角色没有 `appearance`，让 AI 根据剧情推断并输出

**风险**：
- 可能与用户预期不符（用户想自己控制角色形象）
- 每次生成分镜都推断，效率低

**建议**：优先引导用户在资产阶段填写，而非自动补全。

---

## 三、现有字段映射总结

### 角色绑定（character_binding）

| 字段 | 用途 | 关键帧 prompt 使用 |
|------|------|------------------|
| `standaloneName` | 独立角色名 | `eff.name` |
| `standaloneDescription` | 独立角色描述 | `eff.description` |
| `overrideName` | 覆盖长文角色名 | `eff.name` |
| `overrideAppearance` | **外观描述** ⭐ | `eff.appearance` |
| `overrideOutfit` | **默认服装** ⭐ | `eff.outfit` |
| `referenceImagePath` | 参考图路径 | ref 图选择 |
| `referenceSetImageIds` | 形象组（多图） | ref 图选择 |
| `styleAnchors` | 风格锚点 | prompt 拼接 |

### 地点绑定（location_binding）

| 字段 | 用途 | 关键帧 prompt 使用 |
|------|------|------------------|
| `standaloneName` | 独立地点名 | `loc.name` |
| `standaloneDescription` | **地点描述** ⭐ | `loc.description` |
| `overrideDescription` | 覆盖地点描述 | `loc.description` |

---

## 四、实现优先级建议

| 优先级 | 方案 | 原因 |
|--------|------|------|
| P0（已完成） | 模板标准化 | AI 输出格式已优化 |
| P1 | 资产界面引导 | 用户填写率低是根因 |
| P2 | 一键生成外观描述 | 降低用户填写门槛 |
| P3 | 分镜自动补全 | 风险较高，仅作备选 |

---

## 五、后续行动建议

1. **检查当前项目的资产填写率**
   - 统计有多少角色 `appearance` 为空
   - 统计有多少地点 `description` 为空

2. **UI 改进**
   - 资产编辑面板增加引导文案
   - 增加"AI 生成外观描述"功能

3. **验证关键帧生成**
   - 用一个填写完整的角色测试关键帧生成
   - 对比 prompt 中是否包含外观描述

---

## 六、相关文件

| 文件 | 改动类型 |
|------|---------|
| `src/core/modules/episode-production/narrative/ai/storyboard-generator.ts` | 提示词修改（已完成） |
| `src/core/entities/character-binding.entity.ts` | 新增形象字段（待实现） |
| `src/core/entities/location-binding.entity.ts` | 新增场景字段（待实现） |
| `src/renderer/src/components/episode-production/stage-asset-v2/` | UI 改动（待实现） |
| `src/core/modules/episode-production/render/keyframe/` | 关键帧生成逻辑改动（待实现） |