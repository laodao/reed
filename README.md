# AI工具箱

一个集成多种AI能力的跨平台桌面应用。

## 技术栈

- **框架**: Electron 28+
- **前端**: Vue 3 + TypeScript
- **状态管理**: Pinia
- **UI组件**: Element Plus
- **样式**: TailwindCSS + SCSS
- **构建工具**: Vite + electron-vite
- **数据库**: SQLite (better-sqlite3)

## 功能特性

- AI对话（支持多模型）
- 图像生成
- 视频生成
- OCR文字识别
- 语音转换（TTS/STT）
- 多语言翻译
- 知识库管理
- 网络搜索

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建

```bash
# 构建所有平台
npm run package

# 构建特定平台
npm run package:win
npm run package:mac
npm run package:linux
```

### 代码检查

```bash
npm run lint
npm run lint:fix
```

### 测试

```bash
npm run test
npm run test:coverage
```

## 项目结构

```
ai-tool-box/
├── src/
│   ├── main/           # Electron主进程
│   │   ├── index.ts    # 入口文件
│   │   ├── ipc/        # IPC处理器
│   │   ├── services/   # 业务服务
│   │   ├── providers/  # AI提供商
│   │   └── database/   # 数据库
│   ├── renderer/       # 渲染进程（Vue3）
│   │   ├── src/
│   │   │   ├── views/      # 页面组件
│   │   │   ├── components/ # 通用组件
│   │   │   ├── stores/     # Pinia状态
│   │   │   ├── router/     # 路由
│   │   │   └── styles/     # 样式
│   │   └── index.html
│   ├── shared/         # 共享类型
│   └── preload/        # Preload脚本
├── resources/          # 静态资源
└── build/              # 构建配置
```

## 许可证

MIT
