# 视频生成模块 - 用户故事

**模块名称：** 视频生成
**所属Epic：** EPIC-002 多媒体内容生成
**优先级：** Must Have
**Sprint：** 第3周
**日期：** 2026-03-01

---

## 故事列表

| 故事ID | 故事名称 | 故事点数 | 优先级 | 状态 |
|--------|----------|----------|--------|------|
| VID-001 | 文生视频基础功能 | 5 | Must Have | 待开发 |
| VID-002 | 视频参数配置与预览 | 3 | Must Have | 待开发 |
| VID-003 | 视频保存与流程化创作 | 3 | Should Have | 待开发 |

---

## VID-001: 文生视频基础功能

### 用户故事

```
作为一个 内容创作者
我想要 通过文字描述生成视频
以便 快速获得视频素材
```

### 描述

**背景：**
用户需要通过文字描述来生成视频，用于短视频创作、广告素材等场景。

**范围：**
- 视频描述输入
- 视频生成API调用
- 生成进度显示
- 视频预览

**用户流程：**
1. 用户进入视频生成页面
2. 输入视频描述
3. 配置基本参数
4. 点击"生成视频"
5. 系统提交任务
6. 显示生成进度
7. 完成后预览视频

### 验收标准

- [ ] 支持输入视频描述，最多2000字符
- [ ] 显示字符计数
- [ ] 支持火山引擎视频生成API
- [ ] 生成时显示进度条
- [ ] 显示预计剩余时间
- [ ] 支持取消生成任务
- [ ] 生成完成后自动播放预览
- [ ] 内置视频播放器
- [ ] 空描述不允许生成
- [ ] 敏感词检测和提示
- [ ] 支持查看生成失败原因

### 技术说明

**涉及的组件：**
- 前端：VideoView.vue, VideoPlayer.vue
- 后端：video.service.ts
- API：火山引擎

**API接口：**
```typescript
// 提交视频生成任务
IPC.generateVideo(params: {
  prompt: string,
  duration: number,
  resolution: string
}): Promise<Result<{
  taskId: string,
  estimatedTime: number
}>>

// 查询生成状态
IPC.checkVideoStatus(taskId: string): Promise<Result<{
  status: 'pending' | 'processing' | 'completed' | 'failed',
  progress: number,
  videoUrl?: string
}>>

// 取消生成
IPC.cancelVideoGeneration(taskId: string): Promise<Result<void>>
```

### 故事点数：5

**估算依据：**
- 视频描述界面：1点
- API集成：2点
- 进度监控：1.5点
- 视频播放器：0.5点

### 依赖

- SET-001（API密钥管理）

---

## VID-002: 视频参数配置与预览

### 用户故事

```
作为一个 内容创作者
我想要 自定义视频生成参数
以便 获得符合需求的视频
```

### 描述

**背景：**
不同的场景需要不同时长、分辨率、风格的视频。

**范围：**
- 时长设置
- 分辨率选择
- 帧率设置
- 风格选择

**用户流程：**
1. 用户在视频生成界面
2. 展开"参数设置"
3. 设置视频时长
4. 选择分辨率
5. 选择帧率
6. 选择风格
7. 生成视频

### 验收标准

- [ ] 支持设置视频时长（2-10秒）
- [ ] 支持选择分辨率：
  - [ ] 480p
  - [ ] 720p
  - [ ] 1080p
- [ ] 支持选择帧率（24/30fps）
- [ ] 支持选择风格：
  - [ ] 写实
  - [ ] 动漫
  - [ ] 3D动画
  - [ ] 电影感
- [ ] 参数面板可折叠
- [ ] 显示当前参数摘要
- [ ] 支持重置为默认值

### 技术说明

**涉及的组件：**
- 前端：VideoSettings.vue

**参数模型：**
```typescript
interface VideoParams {
  duration: number;  // 2-10秒
  resolution: '480p' | '720p' | '1080p';
  frameRate: 24 | 30;
  style: string;
}
```

### 故事点数：3

**估算依据：**
- 参数界面：1.5点
- 参数处理：1点
- UI优化：0.5点

### 依赖

- VID-001（文生视频基础功能）

---

## VID-003: 视频保存与流程化创作

### 用户故事

```
作为一个 内容创作者
我想要 保存视频并进行流程化创作
以便 完成完整的视频制作流程
```

### 描述

**背景：**
内容创作者需要完整的创作流程：大纲→角色→分镜→视频。

**范围：**
- 视频保存下载
- 生成历史
- 创作项目管理
- 分镜功能

**用户流程：**
1. 用户查看生成的视频
2. 保存视频到本地
3. 可创建创作项目
4. 在项目中定义分镜
5. 为每个分镜生成视频
6. 导出项目

### 验收标准

- [ ] 支持保存视频到本地
- [ ] 支持选择保存位置
- [ ] 可自定义文件名
- [ ] 自动保存生成历史
- [ ] 历史按时间倒序排列
- [ ] 支持查看历史详情
- [ ] 支持创建创作项目
- [ ] 项目可包含多个分镜
- [ ] 分镜可设置描述和时长
- [ ] 分镜可单独生成视频
- [ ] 显示分镜生成状态
- [ ] 支持导出项目素材

### 技术说明

**涉及的组件：**
- 前端：VideoHistory.vue, ProjectManager.vue, StoryboardEditor.vue
- 后端：video-history.service.ts, project.service.ts
- 数据库：video_records, video_projects, video_scenes表

**数据模型：**
```typescript
interface VideoRecord {
  id: string;
  prompt: string;
  model: string;
  duration: number;
  resolution: string;
  videoPath: string;
  projectId?: string;
  sceneId?: string;
  status: string;
  progress: number;
  createdAt: Date;
}

interface VideoProject {
  id: string;
  name: string;
  outline?: string;
  scenes: VideoScene[];
  createdAt: Date;
}

interface VideoScene {
  id: string;
  order: number;
  name: string;
  description: string;
  duration: number;
  videoId?: string;
  status: string;
}
```

### 故事点数：3

**估算依据：**
- 视频保存：0.5点
- 历史管理：1点
- 项目/分镜管理：1.5点

### 依赖

- VID-001（文生视频基础功能）

---

## 模块验收标准

- [ ] 所有3个故事完成
- [ ] 支持至少1个视频生成API
- [ ] 视频生成功能正常
- [ ] 参数配置功能完整
- [ ] 视频保存功能正常
- [ ] 流程化创作功能基本可用

---

**返回：** [故事总体大纲](./stories-overview.md)
