# AI 对话引用资产（@ 提及）

日期：2026-08-23
状态：完成（实测通过，已提交）

## 需求

AI 对话引用资产：输入 @ 弹出资产选择（可搜索）；选中后以附件形式提交给模型；
@ 多模态资产（图片/音频/视频）但模型不支持多模态时提醒用户。

## 实现

### 数据/类型

- `Attachment` 增加 `assetId?`（引用资产 ID）与 `assetCategory?`（资产大类，多模态校验/展示用）

### 后端

- `FileService.readAttachment`：带 assetId 时经资产服务解析（readAssetAttachment）：
  - 图片资产（file+image）→ image 附件（base64，需模型支持 vision）
  - 音频/视频资产 → document + 元信息文本（对话模型无法直接解析音视频内容，仅提供元信息）
  - 文本/JSON/模板资产 → document + 内容文本（json 取 jsonContent）
  - 资产不存在 → 抛错
- `ChatService.buildContext` 增加 modelId 参数：当前消息附件含 image（含 @ 图片资产）且
  模型不支持 vision（detectVisionSupport）→ 抛错「请切换到支持多模态的模型」

### 前端

- ChatInput：
  - 输入 @ 触发资产选择弹层（监听 input 末尾 @ 模式，@ 后无空格即激活）
  - 弹层内置搜索框（名称/分类/标签过滤，防抖）+ 资产列表（类型图标/名称/分类）+ Enter 快速选择
  - 选中：移除输入框 @ 词 + 添加资产附件（附件区显示资产 chip：图标+名称+分类）
  - 多模态提醒：选中图片/音频/视频资产且模型不支持 vision（supportsVision）→
    ElMessage.warning 建议切换多模态模型（如 qwen-vl / gpt-4o）
  - 发送序列化保留 assetId/assetCategory
- ChatMain：getModelCapabilities 增加 supportsVision（model.type === 'multimodal'）
- MessageItem：资产附件显示类型图标 + 「XX 资产」标签

## 测试

- file-service-asset-ref.spec（7 项）：text/json→文本、image→base64、audio/video→元信息、
  资产不存在抛错、无 assetId 走原文件逻辑
- 相关回归 148/148 通过

## 实测（CDP + UI）

- 输入 @ → 弹层出现，资产列表展示 ✓；继续输入「早报」过滤 ✓
- 选中 tech早报 → 输入框 @ 移除 + 附件 chip ✓；发送后消息显示
  「📝 tech早报-2026-08-23 文本 资产」✓
- @ 合成语音.wav（音频）+ DeepSeek text 模型 → 提醒「是音频资产，当前模型可能无法解析——
  建议切换到支持多模态的模型」✓

## 说明

- 多模态能力以模型 type='multimodal' 判定（与模型配置一致）；音频/视频资产以元信息提交
  （对话模型无音视频输入能力），图片资产需 vision 模型（前端提醒 + 后端兜底报错）
