# 人像设计功能开发进度

## 2026-03-26

### 已完成工作

#### 阶段一：基础设施

- ✅ 创建类型定义 `src/shared/types/portrait.types.ts`
  - PortraitProject、PortraitVariant 等核心类型
  - GeneratePortraitRequest、ChangeClothesRequest 等请求类型
  - ANGLE_LABELS、ANGLE_PROMPTS、PRESET_BACKGROUNDS 等常量

- ✅ 创建数据库表结构
  - portrait_projects：人物项目表
  - portrait_variants：人物变体表

- ✅ 创建 Repository 层
  - `portrait-project.repository.ts`：项目 CRUD 操作
  - `portrait-variant.repository.ts`：变体 CRUD 操作

#### 阶段二：核心服务

- ✅ `portrait.service.ts`：人像设计核心服务
  - 项目管理（创建、获取、删除）
  - 人物生成（四角度同步生成）
  - 换衣功能
  - 换背景功能

- ✅ `portrait.handler.ts`：IPC 处理器
  - 项目管理相关 IPC
  - 图像生成相关 IPC
  - 变体管理相关 IPC

- ✅ 更新 `preload/index.ts`：暴露人像设计 API

#### 阶段三：前端界面

- ✅ 添加路由配置 `router/index.ts`
- ✅ 更新导航菜单 `layouts/MainLayout.vue`
- ✅ 创建 `views/Portrait.vue` 主页面
- ✅ 创建 `components/portrait/PortraitGenerator.vue` 生成面板
- ✅ 创建 `components/portrait/ChangeClothesDialog.vue` 换衣对话框
- ✅ 创建 `components/portrait/ChangeBackgroundDialog.vue` 换背景对话框

### 技术要点

1. **四角度生成**：通过固定种子和角度提示词实现角色一致性
2. **换衣功能**：基于基础形象，使用服装描述生成新变体
3. **换背景功能**：支持纯色、预设场景、自定义描述三种模式
4. **项目管理**：项目包含基础形象和所有变体（换衣/换背景）

### 文件清单

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       ├── portrait-project.repository.ts
│   │       └── portrait-variant.repository.ts
│   ├── ipc/handlers/
│   │   └── portrait.handler.ts
│   ├── services/
│   │   └── portrait.service.ts
│   └── index.ts                    # 修改：注册 portrait handler
├── preload/
│   └── index.ts                    # 修改：暴露 portrait API
├── renderer/src/
│   ├── views/
│   │   └── Portrait.vue
│   ├── components/portrait/
│   │   ├── PortraitGenerator.vue
│   │   ├── ChangeClothesDialog.vue
│   │   └── ChangeBackgroundDialog.vue
│   ├── layouts/
│   │   └── MainLayout.vue          # 修改：添加菜单入口
│   └── router/
│       └── index.ts                # 修改：添加路由
└── shared/types/
    └── portrait.types.ts
```

### 构建验证

✅ 通过

### 待完成工作

- [x] 导出功能（单张/拼接/打包）
- [x] 重命名项目功能
- [ ] 测试与优化

### 更新记录

#### 2026-03-26 下午（续）

**新增功能：重命名和导出**

- ✅ 后端 `portrait.service.ts` 添加 `updateProject` 方法
- ✅ 后端 `portrait.service.ts` 添加 `exportPortraits` 方法
- ✅ IPC 处理器添加 `handleUpdateProject` 和 `handleExportPortraits`
- ✅ preload 暴露 `updateProject` 和 `export` API
- ✅ 前端实现重命名功能（调用 `updateProject` API）
- ✅ 前端创建 `ExportDialog.vue` 导出对话框
- ✅ 支持三种导出模式：单张图片、拼接图、ZIP 压缩包

**新增文件：**
- `src/renderer/src/components/portrait/ExportDialog.vue` - 导出对话框

**修改文件：**
- `src/main/services/portrait.service.ts` - 添加 updateProject 和 exportPortraits 方法
- `src/main/ipc/handlers/portrait.handler.ts` - 添加更新和导出处理器
- `src/preload/index.ts` - 暴露 updateProject 和 export API
- `src/renderer/src/views/Portrait.vue` - 实现重命名和导出功能

### 更新记录

#### 2026-03-26 下午

**UI优化：模型选择器简化**

- ✅ 移除单独的提供商选择下拉框
- ✅ 实现分组模型选择器，直接选择模型
- ✅ 模型按提供商分组显示，每个模型旁边显示提供商名称
- ✅ 使用 `el-option-group` 组件实现分组效果

**技术实现：**
```typescript
// 模型数据结构
interface ModelItem {
  key: string           // providerId:modelId
  id: string            // modelId
  name: string
  providerId: string
  providerName: string
}

// 加载所有提供商的模型并分组
async function loadAllModels() {
  const providers = await getProviders()
  for (const provider of providers) {
    const models = await getModels(provider.id)
    // 按 provider 分组
  }
}

// 解析选中的模型
const [providerId, modelId] = selectedModelKey.value.split(':')
```