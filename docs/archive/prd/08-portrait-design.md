# 人像设计功能 PRD

## 1. 功能概述

人像设计功能是一个基于 AI 的角色形象生成系统，用户可以通过提示词和参考图片创建人物形象，并生成包含多个角度、多种服装、多种背景的人物系列图。

### 1.1 核心价值

- **角色一致性**：生成的人物形象在不同场景下保持高度一致性
- **多角度展示**：支持正面、左侧、右侧、背面四个视角
- **灵活变换**：支持换衣、换背景等二次创作
- **批量生成**：一次操作生成系列图，提高创作效率

### 1.2 目标用户

- 游戏开发者：需要快速生成角色原型
- 漫画/插画师：需要角色参考图
- 内容创作者：需要虚拟形象
- AI 艺术爱好者：探索 AI 创作可能性

---

## 2. 功能需求

### 2.1 核心生成功能

#### FR-PORTRAIT-001 人像基础生成

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：用户可以通过提示词和参考图片生成人物形象

**操作流程**：
1. 创建项目，添加角色基本信息（姓名、性别、年龄、身高、体重、种族、描述）
2. 选择图像提供商和模型
3. 系统自动生成人物描述提示词（可手动修改）
4. （可选）上传参考图片作为风格参考
5. 选择图片尺寸（默认 768x1024 竖版全身照）
6. 点击生成按钮
7. 等待生成完成，展示正面人物图

**验收标准**：
- [x] 支持创建项目和管理角色基本信息
- [x] 支持输入人物描述提示词（1-2000 字符）
- [x] 支持上传参考图片（JPG/PNG/WebP，最多 3 张）
- [x] 自动生成英文提示词，避免中文内容审核问题
- [x] 生成全身照（非半身照）
- [x] 默认使用纯色背景
- [x] 生成结果可在结果区域展示

**实际界面**：
```
┌─────────────────────────────────────────────────────────────┐
│ ← 返回    角色名称  性别·年龄                    [导出]     │
├─────────────────────────────────────────────────────────────┤
│ 没有正面形象时显示生成面板：                                  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 生成人物形象                                             │ │
│ │ 根据人物信息生成正面形象                                  │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 生成模型                                                │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 选择提供商和模型                                    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ 图片尺寸                                                │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 768×1024 (竖版全身照)                               │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ 提示词                                                  │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ portrait of a person, male, Asian, age 35...        │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ 建议使用英文描述以避免部分云服务的内容审核问题            │ │
│ │ 反向提示词                                              │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ cropped, half body, close-up, missing feet...       │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ 参考图片（最多 3 张）                                    │ │
│ │ ┌─────┐ ┌─────┐ ┌─────┐                                │ │
│ │ │  +  │ │     │ │     │                                │ │
│ │ └─────┘ └─────┘ └─────┘                                │ │
│ │                          [✨ 开始生成]                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

#### FR-PORTRAIT-002 四角度同步生成

**优先级**：Must Have

**状态**：✅ 已实现（分步生成：先生成正面，再生成多角度）

**需求描述**：基于正面形象生成左侧、右侧、背面三个角度的人物图

**业务规则**：
- 使用正面形象作为参考图片进行图生图
- 通过提示词工程确保人物一致性
- 提取基本人物特征（性别、年龄范围、种族）辅助生成
- 强调"same person"、"same facial features, hairstyle, clothing"

**验收标准**：
- [x] 基于正面形象生成其他角度
- [x] 四张图片分别标注视角（正面/左侧/右侧/背面）
- [x] 人物面部特征、体型、服装在各角度保持一致
- [x] 显示整体生成进度
- [x] 部分失败时显示错误信息，成功部分正常展示

**技术实现要点**：
1. **参考图片传递**：在 DashScope 多模态 API 的 content 数组中正确添加参考图片
2. **人物特征提取**：`extractBasicCharacterInfo()` 函数提取性别、年龄范围、种族
3. **一致性提示词**：
   ```
   generate the exact same person as shown in the reference image.
   adult male adult Asian.
   left side profile view, showing the left side of the face and body.
   full body shot, standing upright, complete figure from head to toe.
   Keep the same facial features, hairstyle, clothing, and posture as in the reference image.
   ```
4. **负面提示词增强**：
   ```
   cropped, half body, close-up, missing feet, missing head, multiple people,
   different person, different face, different clothes, different hairstyle,
   low quality, blurry, distorted
   ```

---

#### FR-PORTRAIT-003 换衣功能

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：用户可以为已生成的人物形象更换服装

**操作流程**：
1. 在角色编辑页面点击"换衣"按钮
2. 输入新的服装描述（建议使用英文）
3. （可选）上传服装参考图片
4. 点击生成，保留人物特征更换服装
5. 换衣结果作为新的变体保存

**验收标准**：
- [x] 支持输入新服装描述
- [x] 支持上传服装参考图片
- [x] 换衣后人物面部和体型保持不变
- [x] 换衣结果作为新的变体保存，不覆盖原图
- [x] 显示英文输入建议

---

#### FR-PORTRAIT-004 替换背景

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：用户可以为已生成的人物形象替换背景

**操作流程**：
1. 在角色编辑页面点击"换背景"按钮
2. 选择背景类型：
   - 纯色背景：选择颜色
   - 预设场景：室内、户外、办公室、工作室、画廊、街道、海滩、山景
   - 自定义描述：输入背景描述
   - 上传图片：使用图片作为背景
3. 点击生成，保留人物替换背景

**验收标准**：
- [x] 支持选择纯色背景（颜色选择器）
- [x] 支持选择预设场景背景（8 种预设）
- [x] 支持输入自定义背景描述
- [x] 支持上传背景图片
- [x] 支持选择应用角度（默认正面）

---

### 2.2 项目管理功能

#### FR-PORTRAIT-005 人物项目创建

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：用户可以创建人物项目，管理该人物的所有变体图

**业务规则**：
- 一个项目可包含多个角色
- 项目可以编辑名称
- 项目删除时级联删除所有角色和变体

**验收标准**：
- [x] 支持创建新人物项目
- [x] 支持编辑项目名称
- [x] 支持删除项目（需确认）
- [x] 项目列表按时间倒序排列
- [x] 显示项目缩略图预览

---

#### FR-PORTRAIT-006 角色管理

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：用户可以在项目内管理角色

**验收标准**：
- [x] 支持创建角色（姓名、性别、年龄、身高、体重、种族、描述）
- [x] 支持编辑角色信息
- [x] 支持删除角色
- [x] 角色列表展示缩略图

---

#### FR-PORTRAIT-007 变体管理

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：用户可以在角色内管理所有变体图

**验收标准**：
- [x] 以缩略图网格展示角色所有图片
- [x] 图片按角度分组显示
- [x] 支持查看大图
- [x] 支持删除单个变体
- [x] 支持基于任一变体生成多角度

---

#### FR-PORTRAIT-008 导出功能

**优先级**：Should Have

**状态**：✅ 已实现

**需求描述**：用户可以导出人物系列图

**验收标准**：
- [x] 支持单张图片导出（PNG）
- [x] 支持打包导出项目全部图片（ZIP）
- [x] 导出时自动按类型和角度组织目录结构

---

#### FR-PORTRAIT-009 独立模块入口

**优先级**：Must Have

**状态**：✅ 已实现

**需求描述**：人像设计作为独立模块，在应用左侧导航菜单添加入口

**验收标准**：
- [x] 左侧导航菜单显示"人像设计"入口
- [x] 点击后跳转到人像设计独立页面
- [x] 页面有独立的 URL 路由

---

### 2.3 高级选项

#### FR-PORTRAIT-010 高级参数配置

**优先级**：Should Have

**状态**：✅ 部分实现

**需求描述**：用户可以配置更多生成参数

**已实现参数**：
| 参数 | 说明 | 默认值 |
|------|------|--------|
| 图像尺寸 | 输出尺寸 | 768x1024 |
| 提示词 | 人物描述 | 自动生成 |
| 反向提示词 | 排除内容 | 预设值 |
| 参考图片 | 风格参考 | 可选 |

**验收标准**：
- [x] 支持选择输出尺寸
- [x] 支持编辑提示词
- [x] 支持编辑反向提示词
- [x] 支持上传参考图片（最多 3 张）
- [ ] 支持配置相似度（低/中/高）- 未实现
- [ ] 支持设置随机种子 - 未实现

---

## 3. 非功能需求

### NFR-PORTRAIT-001 生成性能

**优先级**：Must Have

**状态**：✅ 已实现

**验收标准**：
- [x] 单张图片生成时间 < 30 秒
- [x] 多角度顺序生成，显示进度
- [x] 显示生成进度事件

---

### NFR-PORTRAIT-002 角色一致性

**优先级**：Must Have

**状态**：✅ 已实现

**技术方案**：
1. **参考图片传递**：正确传递到 DashScope API
2. **特征提取**：自动提取性别、年龄范围、种族
3. **一致性提示词**：强调 "same person", "same facial features"
4. **负面提示词**：排除 "different person", "different face"

**验收标准**：
- [x] 面部特征一致性高
- [x] 体型一致性好
- [x] 服装一致性高

---

### NFR-PORTRAIT-003 存储管理

**优先级**：Should Have

**状态**：✅ 已实现

**验收标准**：
- [x] 图片存储在用户数据目录的 images 文件夹
- [x] 按日期组织存储（年/月/日）
- [x] 删除项目时级联删除关联图片文件
- [x] 删除角色时级联删除关联图片文件

---

### NFR-PORTRAIT-004 用户体验

**优先级**：Should Have

**状态**：✅ 已实现

**验收标准**：
- [x] 界面加载时间 < 1 秒
- [x] 图片缩略图使用 local-image 协议加载
- [x] 操作有明确反馈（成功/失败消息）
- [x] 生成过程中显示进度

---

## 4. 数据模型设计

### 4.1 人物项目（PortraitProject）

```typescript
interface PortraitProject {
  id: string                    // 项目 ID
  name: string                  // 项目名称
  createdAt: number            // 创建时间
  updatedAt: number            // 更新时间
}
```

### 4.2 人物角色（PortraitCharacter）

```typescript
interface PortraitCharacter {
  id: string                    // 角色 ID
  projectId: string             // 所属项目 ID
  name: string                  // 人物姓名
  gender: 'male' | 'female'     // 性别
  age: number                   // 年龄
  height: number                // 身高(cm)
  weight: number                // 体重(kg)
  race: 'asian' | 'caucasian'   // 人种
  description?: string          // 人物简介

  // 生成配置
  prompt?: string               // 人物描述提示词
  referenceImages?: string[]    // 参考图片路径
  providerId?: string           // 提供商 ID
  modelId?: string              // 模型 ID

  createdAt: number             // 创建时间
  updatedAt: number             // 更新时间
}
```

### 4.3 人物变体（PortraitVariant）

```typescript
interface PortraitVariant {
  id: string                    // 变体 ID
  characterId: string           // 所属角色 ID
  type: 'base' | 'clothes' | 'background'  // 变体类型
  parentId?: string             // 父变体 ID
  angle: 'front' | 'left' | 'right' | 'back'  // 视角

  imagePath: string             // 图片路径
  prompt: string                // 使用的提示词
  config?: Record<string, any>  // 生成配置（seed, width, height）

  variantInfo?: {
    clothesDescription?: string      // 换衣描述
    backgroundDescription?: string   // 背景描述
    backgroundType?: string          // 背景类型
    backgroundColor?: string         // 背景颜色
    presetScene?: string             // 预设场景
  }

  createdAt: number             // 创建时间
}
```

### 4.4 数据库表设计

```sql
-- 人物项目表
CREATE TABLE portrait_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 人物角色表
CREATE TABLE portrait_characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  age INTEGER NOT NULL,
  height INTEGER NOT NULL,
  weight INTEGER NOT NULL,
  race TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  reference_images TEXT,
  provider_id TEXT,
  model_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES portrait_projects(id) ON DELETE CASCADE
);

-- 人物变体表
CREATE TABLE portrait_variants (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id TEXT,
  angle TEXT NOT NULL,
  image_path TEXT NOT NULL,
  prompt TEXT NOT NULL,
  config TEXT,
  variant_info TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES portrait_characters(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_characters_project ON portrait_characters(project_id);
CREATE INDEX idx_variants_character ON portrait_variants(character_id);
CREATE INDEX idx_variants_type ON portrait_variants(type);
```

---

## 5. 技术实现要点

### 5.1 人物一致性保障方案

#### 5.1.1 参考图片传递

在 DashScope 多模态 API 中正确传递参考图片：

```typescript
// 构建content数组
const content: Array<{ text?: string; image?: string }> = []

// 先添加参考图片
if (request.referenceImage) {
  content.push({
    image: request.referenceImage  // data:image/png;base64,... 格式
  })
}

// 再添加文本提示词
content.push({
  text: request.prompt
})
```

#### 5.1.2 人物特征提取

```typescript
function extractBasicCharacterInfo(character: PortraitCharacter): string {
  const parts: string[] = []

  // 性别
  if (character.gender === 'male') {
    parts.push('adult male')
  } else if (character.gender === 'female') {
    parts.push('adult female')
  }

  // 年龄范围
  if (character.age) {
    if (character.age < 20) parts.push('young')
    else if (character.age < 40) parts.push('adult')
    else if (character.age < 60) parts.push('middle-aged')
    else parts.push('senior')
  }

  // 种族
  if (character.race === 'asian') parts.push('Asian')
  else if (character.race === 'caucasian') parts.push('Caucasian')

  return parts.join(' ')
}
```

#### 5.1.3 一致性提示词模板

```typescript
const CONSISTENCY_PREFIX = 'generate the exact same person as shown in the reference image'
const FULL_BODY_SUFFIX = 'full body shot, standing upright, complete figure from head to toe'

const fullPrompt = `${CONSISTENCY_PREFIX}. ${basicInfo}. ${anglePrompt}. ${FULL_BODY_SUFFIX}. Keep the same facial features, hairstyle, clothing, and posture as in the reference image.`
```

### 5.2 避免内容审核

1. **使用英文提示词**：避免中文敏感词触发审核
2. **不使用原始中文提示词**：多角度生成时完全依赖参考图片和提取的基本特征
3. **前端提示**：在输入框添加提示建议用户使用英文描述

### 5.3 换衣/换背景实现

1. **参考图片**：使用原图作为参考，保持人物特征
2. **提示词组合**：原人物描述 + 换衣/换背景描述 + 一致性要求
3. **变体保存**：生成结果作为新变体保存，不覆盖原图

---

## 6. 用户流程

### 6.1 完整使用流程

```
开始 → 点击"人像设计" → 创建项目
     → 添加角色（姓名、性别、年龄、身高、体重、种族、描述）
     → 选择模型 → 编辑提示词 → 上传参考图（可选）
     → 点击生成正面形象 → 查看结果

     → 点击"生成多角度" → 选择角度（左/右/背）
     → 等待生成 → 查看四角度结果

     → 点击"换衣" → 输入服装描述 → 生成换衣变体
     或
     → 点击"换背景" → 选择背景类型 → 生成换背景变体

     → 点击"导出" → 选择导出方式 → 保存文件
     → 结束
```

---

## 7. 边界情况处理

### 7.1 生成失败

**场景**：部分角度生成失败

**处理**：
- 成功的角度正常展示
- 失败的角度显示错误信息
- 返回错误详情，用户可重试

### 7.2 内容审核触发

**场景**：提示词触发云服务商内容审核

**处理**：
- 默认使用英文提示词
- 多角度生成时不使用用户原始中文提示词
- 提示用户使用英文描述

### 7.3 模型不支持图生图

**场景**：部分模型不支持参考图片

**处理**：
- 正面生成不受影响
- 多角度生成依赖图生图能力

---

## 8. 功能完成度汇总

| 功能需求 | 状态 | 说明 |
|---------|------|------|
| FR-PORTRAIT-001 人像基础生成 | ✅ 完成 | 支持提示词、参考图、尺寸选择 |
| FR-PORTRAIT-002 多角度生成 | ✅ 完成 | 基于正面形象生成左/右/背面 |
| FR-PORTRAIT-003 换衣功能 | ✅ 完成 | 支持服装描述和参考图 |
| FR-PORTRAIT-004 替换背景 | ✅ 完成 | 支持纯色/预设/自定义/图片 |
| FR-PORTRAIT-005 项目管理 | ✅ 完成 | 创建/重命名/删除项目 |
| FR-PORTRAIT-006 角色管理 | ✅ 完成 | 完整的角色信息管理 |
| FR-PORTRAIT-007 变体管理 | ✅ 完成 | 查看/删除变体 |
| FR-PORTRAIT-008 导出功能 | ✅ 完成 | 单张/打包导出 |
| FR-PORTRAIT-009 独立入口 | ✅ 完成 | 独立模块入口 |
| FR-PORTRAIT-010 高级配置 | ⚠️ 部分完成 | 缺少相似度和种子设置 |

| 非功能需求 | 状态 | 说明 |
|---------|------|------|
| NFR-PORTRAIT-001 生成性能 | ✅ 达标 | 单张 < 30s |
| NFR-PORTRAIT-002 角色一致性 | ✅ 达标 | 通过技术方案保障 |
| NFR-PORTRAIT-003 存储管理 | ✅ 达标 | 按日期组织存储 |
| NFR-PORTRAIT-004 用户体验 | ✅ 达标 | 界面流畅，操作直观 |

---

## 9. 后续优化方向

### 9.1 功能增强

- [ ] 支持设置随机种子，复现生成结果
- [ ] 支持配置相似度参数
- [ ] 支持透明背景生成
- [ ] 支持四角度拼接图导出
- [ ] 支持批量导入/导出项目

### 9.2 性能优化

- [ ] 多角度并行生成（目前是顺序生成）
- [ ] 图片压缩存储
- [ ] 缓存常用提示词模板

### 9.3 用户体验

- [ ] 提示词模板库
- [ ] 历史版本对比
- [ ] 快捷键支持

---

**文档版本**：v2.0
**更新日期**：2026-03-28
**作者**：AI Assistant
**变更记录**：
- v2.0 (2026-03-28): 根据实际实现更新功能状态、验收标准、技术方案
- v1.0 (2026-03-26): 初始版本