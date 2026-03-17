# STORY-016: 多语言翻译 - 实现任务清单

**日期:** 2026-02-28
**状态:** ✅ 已完成
**点数:** 3

---

## 验收标准检查

| # | 验收标准 | 状态 | 备注 |
|---|---------|------|------|
| 1 | 源语言自动检测 | ✅ | 支持 auto 自动检测，会显示检测到的语言 |
| 2 | 目标语言选择 | ✅ | 支持 22 种语言，按常用/其他分组 |
| 3 | 文本输入区域 | ✅ | TextInput 组件，最多 10000 字符 |
| 4 | 翻译结果展示 | ✅ | 右侧面板展示翻译结果 |
| 5 | 复制翻译结果 | ✅ | 支持一键复制到剪贴板 |
| 6 | 语言切换功能 | ✅ | 中间按钮支持交换源语言和目标语言 |

---

## 实现的文件

### 主进程

| 文件路径 | 说明 |
|---------|------|
| `src/main/ipc/handlers/translate.handler.ts` | 翻译相关 IPC Handler |
| `src/main/ipc/handlers/index.ts` | 更新导出，添加 translate handlers |

### 渲染进程

| 文件路径 | 说明 |
|---------|------|
| `src/renderer/src/composables/useTranslate.ts` | 翻译状态管理 composable |
| `src/renderer/src/components/translate/LanguageSelector.vue` | 语言选择组件 |
| `src/renderer/src/components/translate/TextInput.vue` | 文本输入组件 |
| `src/renderer/src/components/translate/index.ts` | 组件导出文件 |
| `src/renderer/src/views/TranslateView.vue` | 完整的翻译视图页面 |

---

## 技术实现细节

### 1. 翻译 API 集成

使用 AI Provider 进行翻译：

```typescript
// 构建翻译提示词
const prompt = `请将以下${sourceLangName}文本翻译成${targetLangName}。只返回翻译结果，不要添加任何解释或说明。

文本：
${text}`

// 调用 AI Provider
for await (const chunk of provider.chat({
  model: 'qwen-turbo',
  messages: [{ role: 'user', content: prompt }],
  stream: true
})) {
  translatedText += chunk.content
}
```

### 2. 支持的语言

支持 22 种语言：
- **常用语言**: 自动检测、简体中文、繁体中文、英语、日语、韩语
- **其他语言**: 法语、德语、西班牙语、葡萄牙语、意大利语、俄语、阿拉伯语、泰语、越南语、印尼语、马来语、荷兰语、波兰语、土耳其语、印地语

### 3. 自动语言检测

当源语言选择"自动检测"时：
1. 发送文本给 AI 进行翻译
2. 同时进行简单的字符检测：
   - 中文字符 → zh-CN
   - 日文假名 → ja
   - 韩文 → ko
   - 俄文 → ru
   - 阿拉伯文 → ar
   - 其他 → en

### 4. 语言交换

- 点击中间的交换按钮可以交换源语言和目标语言
- 同时交换源文本和翻译结果
- 自动检测模式下无法交换（因为没有确定源语言）

### 5. 翻译历史

- composable 内部维护最近 50 条翻译历史
- 可以从历史记录恢复之前的翻译

---

## 构建验证

```bash
npm run build
```

构建成功，无错误。

---

## 后续优化建议

1. **专业翻译 API**
   - 集成 Google 翻译 API
   - 集成 DeepL API
   - 集成百度翻译 API

2. **批量翻译**
   - 支持多段文本批量翻译
   - 支持文件上传翻译

3. **高级功能**
   - 划词翻译
   - 截图翻译
   - 网页翻译

4. **离线翻译**
   - 支持本地翻译模型

---

**实现者:** Claude (AI 助手)
**完成日期:** 2026-02-28
