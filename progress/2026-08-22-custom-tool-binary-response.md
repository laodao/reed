# 自定义能力：二进制响应支持（responseType）

日期：2026-08-22
状态：✅ 完成并通过 E2E

## 背景

用户问：系统没有底层能力时，能否自定义功能组件（如用平台不支持的 TTS API）？
结论：可以——tool-call 自定义工具（任意 HTTP API）是主力路径。但调研发现真实缺口：
**http-fetch 只做 res.text()，纯二进制响应（Azure/OpenAI TTS 等海外主流平台都是
audio/mpeg 原始字节流）会被 UTF-8 解码成乱码，数据不可逆损坏**。

## 方案

工作流变量上下文是 JSON 序列化的（checkpoint/模板引用/节点输出契约），无法直接承载
二进制字节。按 payload 大小分层：

| 形态 | 做法 | 适用 |
|---|---|---|
| base64 | arrayBuffer → base64 + 拼 dataUrl | 小 payload（<100KB），Web/桌面通吃 |
| **file 落盘** | 主进程直接写文件，节点只输出**几十字节的路径** | 100KB~几十 MB（TTS 音频/图片），不占变量上下文、不受 64KB 输出截断影响 |
| auto | 按 content-type 判断，二进制自动走 file | 默认模式，用户零配置 |

## 实现

1. **`http-fetch.ts`**：`responseType: 'auto' | 'text' | 'json' | 'base64' | 'file'`
   - 二进制分支：`res.arrayBuffer()` → base64 / 落盘（按 MIME 给扩展名 .mp3/.wav/.png…）
   - base64 模式额外输出 `dataUrl`（`data:<mime>;base64,...`）→ 可直接接 save-asset
   - file 落盘目录：`workflow-media/<runId>/http|tools`（与 media-nodes 同模式，运行隔离）
2. **`http-request` / `tool-call` 节点**：config 加 responseType，输出透传
   `filePath / base64 / dataUrl / mimeType / sizeBytes`
3. **ToolService**：ExecuteToolInput/Result 透传
4. **catalog/forms/types**：两节点 outputSchema 同步（注册表一致性检查通过）+ 表单加响应模式选择器
5. **编辑器中该能力即插即用**：自定义工具 → tool-call(responseType) → save-asset → 资产库

## 验证（e2e-binary-response.cjs 全通过）

本地 HTTP 服务器模拟纯二进制流 TTS 平台（8202 字节伪 MP3）：
- **file 模式**：tool-call 落盘 → save-asset 复制进 assets/audio/ → 磁盘内容与服务器字节**逐字节一致**
- **base64 + dataUrl 模式**：dataUrl 解码一致 → save-asset 直接落盘成功
- **auto 模式**：不指定 responseType，二进制自动落盘（.mp3 扩展名正确）
- 清理：E2E 工作流/资产/工具零残留；workflow-media 临时目录已清空

## 用户自定义 TTS 的完整路径（示例）

1. 设置 → 工具 → 自定义工具：配置平台 TTS 的 POST url、鉴权 headers、参数 schema
2. 工作流：start(文本) → tool-call(工具, {text: {{start.text}}}, responseType=file)
   → save-asset({{tool1.filePath}}, 分类=音频) → 发布为应用
3. 用户体验与官方 TTS 应用一致，音频自动进资产库

## 遗留

- workflow-media 临时文件无自动清理（现状与 media-nodes 一致，累积式）；将来可加
  "运行结束清理"或"定期清理超过 N 天的临时文件"
- code 节点沙箱无 fs/网络（设计约束）；本地 CLI 工具注册（如本地 whisper）是将来可做项
