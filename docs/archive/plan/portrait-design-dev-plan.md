# 人像设计功能开发计划

## 1. 开发概述

### 1.1 目标
实现人像设计功能，支持通过提示词和参考图片生成人物形象，生成四角度（正面、左侧、右侧、背面）人物图，支持换衣和替换背景功能，与现有图像生成功能通过 Tab 页切换。

### 1.2 技术栈
- 图像生成：复用现有 Provider 系统
- 角色一致性：Seed 控制 + Prompt 工程 + IP-Adapter（如果提供商支持）
- 换衣/换背景：Inpainting / 局部重绘
- 存储：SQLite + 本地文件系统
- 前端：Vue3 + Element Plus + Pinia

### 1.3 开发周期
预计 4-5 个工作日

---

## 2. 任务分解

### 阶段一：基础设施（Day 1）

#### 任务 1.1 类型定义
- [ ] 创建 `src/shared/types/portrait.types.ts`
- [ ] 定义 `PortraitProject` 人物项目类型
- [ ] 定义 `PortraitVariant` 人物变体类型
- [ ] 定义 IPC 请求/响应类型
- [ ] 定义生成配置类型

#### 任务 1.2 数据库表结构
- [ ] 创建 `portrait_projects` 表
- [ ] 创建 `portrait_variants` 表
- [ ] 创建相关索引

#### 任务 1.3 Repository 层
- [ ] 创建 `PortraitProjectRepository`
- [ ] 创建 `PortraitVariantRepository`
- [ ] 实现 CRUD 操作

---

### 阶段二：核心服务（Day 2）

#### 任务 2.1 人像生成服务
- [ ] 创建 `PortraitService`
- [ ] 实现基础人像生成方法
- [ ] 实现四角度同步生成
- [ ] 实现角色一致性保障逻辑
  - [ ] Seed 控制策略
  - [ ] Prompt 模板设计
  - [ ] 角度变换提示词

#### 任务 2.2 换衣服务
- [ ] 实现换衣功能方法
- [ ] 设计换衣 Prompt 模板
- [ ] 实现服装描述注入

#### 任务 2.3 换背景服务
- [ ] 实现背景替换方法
- [ ] 支持纯色背景
- [ ] 支持预设场景背景
- [ ] 支持自定义背景描述

#### 任务 2.4 IPC Handler
- [ ] 创建 `portrait.handler.ts`
- [ ] 注册 IPC 通道
- [ ] 实现各接口处理函数
- [ ] 更新 `preload/index.ts` 暴露 API

---

### 阶段三：前端页面（Day 2-3）

#### 任务 3.1 路由和菜单
- [ ] 添加路由配置 `/portrait`
- [ ] 修改左侧导航菜单添加"人像设计"入口
- [ ] 创建菜单图标

#### 任务 3.2 人像设计页面
- [ ] 创建 `PortraitDesign.vue` 主页面
- [ ] 创建 `PortraitSidebar.vue` 项目列表侧边栏
- [ ] 创建 `PortraitGenerator.vue` 生成面板
- [ ] 创建 `PortraitResult.vue` 结果展示区

#### 任务 3.3 生成面板组件
- [ ] 模型选择组件
- [ ] 人物描述输入框
- [ ] 参考图片上传组件
- [ ] 角度选择组件
- [ ] 背景设置组件

---

### 阶段四：变体功能界面（Day 3-4）

#### 任务 4.1 换衣对话框
- [ ] 创建 `ChangeClothesDialog.vue`
- [ ] 实现服装描述输入
- [ ] 实现角度选择
- [ ] 实现预览和确认

#### 任务 4.2 换背景对话框
- [ ] 创建 `ChangeBackgroundDialog.vue`
- [ ] 实现背景类型选择
- [ ] 实现颜色选择器
- [ ] 实现预设场景选择
- [ ] 实现自定义描述输入

#### 任务 4.3 项目管理界面
- [ ] 项目列表展示
- [ ] 项目创建对话框
- [ ] 项目详情展示
- [ ] 变体网格展示

---

### 阶段五：导出与完善（Day 4-5）

#### 任务 5.1 导出功能
- [ ] 单张图片导出
- [ ] 四角度拼接导出
- [ ] 项目打包导出

#### 任务 5.2 Store 和 Composable
- [ ] 创建 `usePortraitStore`
- [ ] 创建 `usePortrait` composable
- [ ] 实现状态管理逻辑

#### 任务 5.3 测试与优化
- [ ] 功能测试
- [ ] UI 交互优化
- [ ] 错误处理完善
- [ ] 性能优化

---

## 3. 文件清单

### 3.1 后端文件

```
src/main/
├── database/
│   └── repositories/
│       ├── portrait-project.repository.ts   # 项目仓库
│       └── portrait-variant.repository.ts   # 变体仓库
├── ipc/handlers/
│   └── portrait.handler.ts                  # IPC 处理器
└── services/
    └── portrait.service.ts                  # 人像设计服务
```

### 3.2 前端文件

```
src/renderer/src/
├── views/
│   └── PortraitDesign.vue                   # 人像设计主页面
├── components/portrait/
│   ├── PortraitSidebar.vue                  # 项目列表侧边栏
│   ├── PortraitGenerator.vue                # 生成面板
│   ├── PortraitResult.vue                   # 结果展示
│   ├── ChangeClothesDialog.vue              # 换衣对话框
│   ├── ChangeBackgroundDialog.vue           # 换背景对话框
│   ├── ProjectCreateDialog.vue              # 项目创建对话框
│   └── VariantGrid.vue                      # 变体网格展示
├── stores/
│   └── portrait.ts                          # Pinia Store
├── composables/
│   └── usePortrait.ts                       # Composable
└── router/
    └── index.ts                             # 修改：添加路由
```

### 3.3 共享类型文件

```
src/shared/types/
└── portrait.types.ts                        # 类型定义
```

---

## 4. 技术方案细节

### 4.1 角色一致性保障

#### 方案一：Seed 控制 + Prompt 模板
```typescript
// 四角度使用相同种子
const baseSeed = generateSeed();

// 角度变换提示词模板
const anglePrompts = {
  front: 'front view, facing camera, full face visible',
  left: 'left side view, profile, left side of face visible',
  right: 'right side view, profile, right side of face visible',
  back: 'back view, from behind, rear view'
};

// 生成完整提示词
function buildPrompt(baseDescription: string, angle: string): string {
  return `${baseDescription}, ${anglePrompts[angle]}, consistent character, same person`;
}
```

#### 方案二：IP-Adapter（如提供商支持）
```typescript
// 使用参考图作为风格引导
const ipAdapterConfig = {
  referenceImage: uploadedImage,
  adapterStrength: 0.8,  // 风格参考强度
  prompt: baseDescription
};
```

### 4.2 换衣实现方案

```typescript
interface ChangeClothesConfig {
  originalImage: string;      // 原图路径
  clothesDescription: string; // 新服装描述
  angles: string[];           // 应用角度
}

async function changeClothes(config: ChangeClothesConfig): Promise<string[]> {
  // 1. 使用 Inpainting 或局部重绘
  // 2. 保持人物特征，仅替换服装区域
  // 3. 使用 ControlNet 保持姿态（如支持）
}
```

### 4.3 换背景实现方案

```typescript
interface ChangeBackgroundConfig {
  originalImage: string;
  backgroundType: 'solid' | 'preset' | 'custom';
  backgroundColor?: string;
  presetScene?: string;
  customDescription?: string;
  angles: string[];
}

async function changeBackground(config: ChangeBackgroundConfig): Promise<string[]> {
  // 1. 人物分割提取（如提供商支持）
  // 2. 生成新背景
  // 3. 合成最终图像
}
```

### 4.4 Provider 能力检测

```typescript
interface ProviderCapabilities {
  imageGeneration: boolean;
  imageToImage: boolean;
  inpainting: boolean;
  controlNet: boolean;
  ipAdapter: boolean;
}

// 检测提供商能力
function detectProviderCapabilities(providerId: string): ProviderCapabilities {
  // 根据提供商类型和模型返回支持的能力
}
```

---

## 5. 数据模型

### 5.1 portrait_projects 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| name | TEXT | 项目名称 |
| description | TEXT | 项目描述 |
| prompt | TEXT | 人物描述 |
| reference_images | TEXT | 参考图片 JSON 数组 |
| provider_id | TEXT | 提供商 ID |
| model_id | TEXT | 模型 ID |
| config | TEXT | 生成配置 JSON |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

### 5.2 portrait_variants 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| project_id | TEXT | 项目 ID（外键） |
| type | TEXT | 变体类型（base/clothes/background） |
| parent_id | TEXT | 父变体 ID |
| angle | TEXT | 视角（front/left/right/back） |
| image_path | TEXT | 图片路径 |
| prompt | TEXT | 使用的提示词 |
| config | TEXT | 生成配置 JSON |
| variant_info | TEXT | 变体信息 JSON |
| created_at | INTEGER | 创建时间 |

---

## 6. IPC 接口设计

### 6.1 项目管理

| 通道 | 说明 | 参数 |
|------|------|------|
| `portrait:create-project` | 创建项目 | CreateProjectRequest |
| `portrait:update-project` | 更新项目 | UpdateProjectRequest |
| `portrait:delete-project` | 删除项目 | projectId |
| `portrait:get-project` | 获取项目 | projectId |
| `portrait:list-projects` | 获取项目列表 | - |

### 6.2 图像生成

| 通道 | 说明 | 参数 |
|------|------|------|
| `portrait:generate` | 生成人物 | GenerateRequest |
| `portrait:change-clothes` | 换衣 | ChangeClothesRequest |
| `portrait:change-background` | 换背景 | ChangeBackgroundRequest |
| `portrait:regenerate-angle` | 重生成某角度 | RegenerateRequest |

### 6.3 变体管理

| 通道 | 说明 | 参数 |
|------|------|------|
| `portrait:list-variants` | 获取变体列表 | projectId |
| `portrait:delete-variant` | 删除变体 | variantId |
| `portrait:export` | 导出图片 | ExportRequest |

---

## 7. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 提供商不支持换衣/换背景 | 功能受限 | 检测能力，禁用不支持的功能，提示用户 |
| 角色一致性差 | 用户体验差 | 优化 Prompt，使用固定种子，引入 IP-Adapter |
| 四角度生成时间长 | 等待时间长 | 并行生成，显示进度 |
| 图片存储空间大 | 占用磁盘 | 压缩存储，定期清理 |

---

## 8. 验收标准

### 功能验收
- [ ] 可在图像页面切换到"人像设计" Tab
- [ ] 可输入人物描述并上传参考图片
- [ ] 可选择生成角度（四角度）
- [ ] 可生成四角度一致的人物图
- [ ] 可对已生成的人物进行换衣
- [ ] 可对已生成的人物进行换背景
- [ ] 可管理人物项目（创建、查看、删除）
- [ ] 可导出单张/拼接图/打包

### 性能验收
- [ ] 单张图片生成时间 < 30 秒
- [ ] 四角度生成时间 < 60 秒
- [ ] 换衣/换背景生成时间 < 45 秒
- [ ] 页面切换响应 < 1 秒

### 体验验收
- [ ] 角色一致性满足基本需求
- [ ] 操作流程清晰直观
- [ ] 错误提示友好

---

## 9. 开发顺序建议

1. **Day 1 上午**：类型定义 + 数据库表 + Repository
2. **Day 1 下午**：核心服务框架 + IPC Handler
3. **Day 2 上午**：前端路由 + 菜单入口 + 基础页面结构
4. **Day 2 下午**：生成面板组件 + 基础生成功能
5. **Day 3 上午**：换衣对话框 + 换衣功能
6. **Day 3 下午**：换背景对话框 + 换背景功能
7. **Day 4 上午**：项目管理 + 变体管理
8. **Day 4 下午**：导出功能 + Store/Composable
9. **Day 5**：测试 + 优化 + Bug 修复

---

**文档版本**：v1.0
**创建日期**：2026-03-26
**关联 PRD**：`docs/prd/08-portrait-design.md`